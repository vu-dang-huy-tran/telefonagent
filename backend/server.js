import http from 'http';
import { WebSocketServer } from 'ws';
import { GoogleGenAI, Modality, Type } from '@google/genai';

const PORT = Number(process.env.BACKEND_PORT || 3001);
const WS_PATH = process.env.VOICE_WS_PATH || '/ws';

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-12-2025';
const PROJECT_ID = 'quiet-sanctuary-483613-r0';
const LOCATION = 'europe-west1';
const API_VERSION = process.env.GENAI_API_VERSION || 'v1';
const DEBUG_WS = 'true';

const log = (...args) => {
  if (!DEBUG_WS) return;
  console.log('[backend]', ...args);
};

const SUBMIT_KRANKMELDUNG_FUNCTION = {
  name: 'submitKrankmeldung',
  parameters: {
    type: Type.OBJECT,
    description: 'Übermittelt die gesammelten Informationen einer Schüler-Krankmeldung.',
    properties: {
      schulName: { type: Type.STRING, description: 'Name der Schule.' },
      schulStadt: { type: Type.STRING, description: 'Stadt, in der die Schule liegt.' },
      kindName: { type: Type.STRING, description: 'Vollständiger Name des kranken Kindes.' },
      geburtsdatum: { type: Type.STRING, description: 'Geburtsdatum des Kindes (z.B. "15.03.2015" oder "15. März 2015").' },
      dauer: { type: Type.STRING, description: 'Wie lange wird das Kind voraussichtlich fehlen? (z.B. "1 Tag", "diese Woche", "bis Freitag", "unklar").' }
    },
    required: ['schulName', 'schulStadt', 'kindName', 'geburtsdatum', 'dauer']
  }
};

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Voice backend running');
});

const wss = new WebSocketServer({ server, path: WS_PATH });

wss.on('connection', (ws) => {
  log('client connected');
  let sessionPromise = null;
  let session = null;
  let isClosed = false;

  const safeSend = (payload) => {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify(payload));
  };

  const closeSession = async () => {
    if (session) {
      try { session.close(); } catch {}
      session = null;
    }
  };

  ws.on('message', async (data) => {
    if (isClosed) return;

    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      log('invalid JSON from client');
      return;
    }

    log('client message', message?.type, message?.type === 'audio' ? `bytes=${message?.data?.length ?? 0}` : '');

    if (message?.type === 'start') {
      log('creating Gemini live session', {
        model: MODEL_NAME,
        project: PROJECT_ID,
        location: LOCATION || '',
        apiVersion: API_VERSION,
        });

        const ai = new GoogleGenAI({
          apiKey: "AIzaSyAqxjPVyvO-qt7fBmR--JzhNU4iTnrMB3o"
        });

      sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        callbacks: {
          onopen: () => {
            log('Gemini live session open');
            sessionPromise?.then((s) => { session = s; }).catch(() => {});
          },
          onmessage: (serverMessage) => {
            log('Gemini message');
            if (serverMessage.toolCall) {
              for (const fc of serverMessage.toolCall.functionCalls) {
                console.log('🔥 BACKEND: toolCall empfangen:', fc.name, 'args:', fc.args);
                log('toolCall from Gemini', fc.name);
                const payload = {
                  type: 'toolCall',
                  id: fc.id,
                  name: fc.name,
                  args: fc.args
                };
                console.log('📤 BACKEND: Sende toolCall an Client:', payload);
                safeSend(payload);
              }
            }

            const audioData = serverMessage.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              log('audio chunk from Gemini', `bytes=${audioData.length}`);
              safeSend({ type: 'audio', data: audioData });
            }

            if (serverMessage.serverContent?.interrupted) {
              log('Gemini interrupted');
              safeSend({ type: 'interrupted' });
            }
          },
          onerror: (err) => {
            log('Gemini live error', err?.message || err);
            safeSend({ type: 'error', error: err?.message || 'Gemini Live Error' });
            closeSession();
          },
          onclose: (err) => {
            log('Gemini live closed', err?.message || err);
            closeSession();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction: message?.config?.systemInstruction,
          tools: message?.tools ?? [{ functionDeclarations: [SUBMIT_KRANKMELDUNG_FUNCTION] }],
        }
      });

      return;
    }

    if (!sessionPromise) return;

    if (message?.type === 'audio') {
      try {
        const s = await sessionPromise;
        //log('forward audio to Gemini', `bytes=${message?.data?.length ?? 0}`);
        s.sendRealtimeInput({ media: { data: message.data, mimeType: message.mimeType } });
      } catch {}
      return;
    }

    if (message?.type === 'text') {
      try {
        const s = await sessionPromise;
        log('forward text to Gemini', message.text ? `len=${message.text.length}` : '');
        s.sendRealtimeInput({ text: message.text });
      } catch {}
      return;
    }

    if (message?.type === 'toolResponse') {
      try {
        const s = await sessionPromise;
        console.log('📥 BACKEND: toolResponse von Client empfangen:', message?.name);
        log('toolResponse from client', message?.name);
        s.sendToolResponse({
          functionResponses: {
            id: message.id,
            name: message.name,
            response: message.response
          }
        });
      } catch {}
      return;
    }

    log('unhandled message type', message?.type);
  });

  ws.on('close', (code, reason) => {
    log('client disconnected', code, reason?.toString?.() || '');
    isClosed = true;
    closeSession();
  });

  ws.on('error', (err) => {
    log('ws error', err?.message || err);
    isClosed = true;
    closeSession();
  });
});

server.listen(PORT, () => {
  console.log(`Voice backend listening on http://localhost:${PORT}${WS_PATH}`);
});
