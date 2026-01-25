import dotenv from 'dotenv';
import http from 'http';
import { WebSocketServer } from 'ws';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { promises as fs } from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });
dotenv.config();

const PORT = Number(process.env.PORT || process.env.BACKEND_PORT || 3001);
const API_KEY = process.env.GEMINI_API_KEY;
const DEBUG = true;
const WS_DEBUG = true;

const debug = (...args) => {
  if (DEBUG) {
    console.log('[debug]', ...args);
  }
};

const wsDebug = (...args) => {
  if (WS_DEBUG) {
    console.log('[ws]', ...args);
  }
};

if (!API_KEY) {
  console.warn('GEMINI_API_KEY is missing. Set it in .env.local');
}

const sickNoteTool = {
  name: 'submitSickNote',
  description: 'Speichert die Krankmeldung eines Schülers ab, sobald alle notwendigen Daten (Stadt, Schule, Name, Geburtstag, Datum) erfasst wurden.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      city: {
        type: Type.STRING,
        description: 'Die Stadt, in der sich die Schule befindet.'
      },
      schoolName: {
        type: Type.STRING,
        description: 'Der Name der Schule des Kindes.'
      },
      childName: {
        type: Type.STRING,
        description: 'Der vollständige Vor- und Nachname des Kindes.'
      },
      dateOfBirth: {
        type: Type.STRING,
        description: 'Das Geburtsdatum des Kindes (z.B. 12.05.2015).'
      },
      sickUntil: {
        type: Type.STRING,
        description: 'Das Datum, bis zu dem das Kind voraussichtlich krankgeschrieben ist.'
      }
    },
    required: ['city', 'schoolName', 'childName', 'dateOfBirth', 'sickUntil']
  }
};

const dataDir = path.resolve(process.cwd(), 'backend', 'data');
const sickNotesFile = path.join(dataDir, 'sick-notes.json');
const schoolsFile = path.join(dataDir, 'schools.json');

const jsonResponse = (res, status, payload) => {
  debug('HTTP response', { status, payloadType: typeof payload });
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
};

const readJsonArray = async (filePath) => {
  try {
    debug('Read JSON', { filePath });
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    debug('Read JSON failed', { filePath, error: e?.message });
    return [];
  }
};

const writeJsonArray = async (filePath, data) => {
  debug('Write JSON', { filePath, count: Array.isArray(data) ? data.length : null });
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
};

const saveSickNote = async (note) => {
  try {
    debug('Save sick note', { note });
    const current = await readJsonArray(sickNotesFile);
    const entry = {
      ...note,
      savedAt: new Date().toISOString()
    };

    current.push(entry);
    await writeJsonArray(sickNotesFile, current);
  } catch (e) {
    console.error('Failed to persist sick note:', e);
  }
};

const normalizeKey = (value) => {
  const normalized = String(value || '')
    .toLocaleLowerCase('de')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized;
};

const findMatchingSchool = async (city, schoolName) => {
  debug('Find matching school', { city, schoolName });
  const schools = await readJsonArray(schoolsFile);
  const cityKey = normalizeKey(city);
  const schoolKey = normalizeKey(schoolName);
  const match = schools.find(s =>
    normalizeKey(s.city) === cityKey &&
    normalizeKey(s.name) === schoolKey
  );
  debug('School match result', { found: Boolean(match), matchId: match?.id });
  return match;
};

const distDir = path.resolve(process.cwd(), 'dist');
const indexFile = path.join(distDir, 'index.html');

const getContentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.json': return 'application/json; charset=utf-8';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.ico': return 'image/x-icon';
    case '.woff': return 'font/woff';
    case '.woff2': return 'font/woff2';
    default: return 'application/octet-stream';
  }
};

const serveStatic = async (req, res) => {
  if (req.method !== 'GET') return false;
  const urlPath = req.url?.split('?')[0] || '/';
  const filePath = urlPath === '/' ? indexFile : path.join(distDir, urlPath);

  try {
    debug('Serve static', { urlPath, filePath });
    const data = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': getContentType(filePath) });
    res.end(data);
    return true;
  } catch (e) {
    debug('Static miss', { urlPath, filePath, error: e?.message });
    if (urlPath !== '/' && !urlPath.startsWith('/api/')) {
      try {
        const data = await fs.readFile(indexFile);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
        return true;
      } catch (err) {
        return false;
      }
    }
    return false;
  }
};

const httpServer = http.createServer(async (req, res) => {
  debug('HTTP request', { method: req.method, url: req.url });
  if (!req.url) {
    return jsonResponse(res, 404, { error: 'Not found' });
  }

  if (req.method === 'OPTIONS') {
    debug('CORS preflight');
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  if (req.url === '/api/health') {
    debug('Health check');
    return jsonResponse(res, 200, { ok: true });
  }

  if (req.url?.startsWith('/api/sick-notes') && req.method === 'GET') {
    debug('List sick notes');
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const schoolId = url.searchParams.get('schoolId');
    const notes = await readJsonArray(sickNotesFile);
    const filtered = schoolId ? notes.filter(n => n.schoolId === schoolId) : notes;
    return jsonResponse(res, 200, filtered);
  }

  if (req.url === '/api/schools' && req.method === 'GET') {
    debug('List schools');
    const schools = await readJsonArray(schoolsFile);
    return jsonResponse(res, 200, schools);
  }

  if (req.url === '/api/schools/summary' && req.method === 'GET') {
    debug('Schools summary');
    const schools = await readJsonArray(schoolsFile);
    const notes = await readJsonArray(sickNotesFile);
    const counts = {};
    for (const note of notes) {
      if (note?.schoolId) {
        counts[note.schoolId] = (counts[note.schoolId] || 0) + 1;
      }
    }
    return jsonResponse(res, 200, {
      total: notes.length,
      counts,
      schools: schools.length
    });
  }

  if (req.url === '/api/schools' && req.method === 'POST') {
    debug('Create school');
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        debug('Create school payload', { body });
        const payload = JSON.parse(body || '{}');
        const { name, city, email } = payload;
        if (!name || !city || !email) {
          return jsonResponse(res, 400, { error: 'Missing fields' });
        }
        const schools = await readJsonArray(schoolsFile);
        const entry = {
          id: payload.id || crypto.randomUUID(),
          name,
          city,
          email
        };
        schools.unshift(entry);
        await writeJsonArray(schoolsFile, schools);
        return jsonResponse(res, 201, entry);
      } catch (e) {
        return jsonResponse(res, 400, { error: 'Invalid JSON' });
      }
    });
    return;
  }

  if (req.url?.startsWith('/api/schools/') && req.method === 'PUT') {
    debug('Update school');
    const id = req.url.split('/').pop();
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        debug('Update school payload', { id, body });
        const payload = JSON.parse(body || '{}');
        const { name, city, email } = payload;
        if (!id || !name || !city || !email) {
          return jsonResponse(res, 400, { error: 'Missing fields' });
        }
        const schools = await readJsonArray(schoolsFile);
        const next = schools.map(s => s.id === id ? { ...s, name, city, email } : s);
        await writeJsonArray(schoolsFile, next);
        return jsonResponse(res, 200, { id, name, city, email });
      } catch (e) {
        return jsonResponse(res, 400, { error: 'Invalid JSON' });
      }
    });
    return;
  }

  if (req.url?.startsWith('/api/schools/') && req.method === 'DELETE') {
    debug('Delete school');
    const id = req.url.split('/').pop();
    if (!id) {
      return jsonResponse(res, 400, { error: 'Missing id' });
    }
    const schools = await readJsonArray(schoolsFile);
    const next = schools.filter(s => s.id !== id);
    await writeJsonArray(schoolsFile, next);
    return jsonResponse(res, 200, { ok: true });
  }

  const served = await serveStatic(req, res);
  if (served) return;

  return jsonResponse(res, 404, { error: 'Not found' });
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  wsDebug('Connection opened', { readyState: ws.readyState, protocol: ws.protocol });
  let sessionPromise = null;
  let ai = null;
  let isConnected = false;
  let idleTimer = null;
  const IDLE_TIMEOUT_MS = Number(process.env.GEMINI_IDLE_TIMEOUT_MS || 120000);

  const clearIdleTimer = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

  const closeGeminiSession = (reason) => {
    wsDebug('Closing Gemini session', { reason });
    if (sessionPromise) {
      sessionPromise?.then(session => {
        try {
          session.sendRealtimeInput({ audioStreamEnd: true });
          session.conn?.close();
        } catch (e) {}
      });
    }
  };

  const resetIdleTimer = () => {
    clearIdleTimer();
    if (IDLE_TIMEOUT_MS > 0) {
      idleTimer = setTimeout(() => {
        closeGeminiSession('idle_timeout');
      }, IDLE_TIMEOUT_MS);
    }
  };

  const send = (payload) => {
    if (ws.readyState === ws.OPEN) {
      wsDebug('Send', { type: payload?.type });
      ws.send(JSON.stringify(payload));
    }
  };

  const handleMessage = async (message) => {
    resetIdleTimer();
    wsDebug('Gemini message', {
      hasToolCall: Boolean(message.toolCall),
      hasServerContent: Boolean(message.serverContent)
    });
    // Tool call handling
    if (message.toolCall) {
      for (const fc of message.toolCall.functionCalls) {
        wsDebug('Tool call received', { name: fc.name, id: fc.id });
        if (fc.name === 'submitSickNote') {
          const args = fc.args || {};
          wsDebug('submitSickNote args', args);
          const match = await findMatchingSchool(args.city, args.schoolName);

          if (!match) {
            wsDebug('submitSickNote invalid school');
            sessionPromise?.then(session => {
              session.sendToolResponse({
                functionResponses: [{
                  id: fc.id,
                  name: fc.name,
                  response: { result: 'invalid_school', message: 'Stadt und Schule wurden nicht in der Liste gefunden. Bitte erneut abfragen.' }
                }]
              });
            });
            return;
          }

          const sickNoteData = {
            schoolId: match.id,
            city: args.city,
            schoolName: args.schoolName,
            childName: args.childName,
            dateOfBirth: args.dateOfBirth,
            sickUntil: args.sickUntil,
            status: 'collected'
          };

          await saveSickNote(sickNoteData);

          send({ type: 'sickNote', data: sickNoteData });
          wsDebug('Sick note saved and sent', { schoolId: sickNoteData.schoolId });

          sessionPromise?.then(session => {
            session.sendToolResponse({
              functionResponses: [{
                id: fc.id,
                name: fc.name,
                response: { result: 'success', message: 'Krankmeldung wurde erfolgreich in der Datenbank gespeichert.' }
              }]
            });
          });
        }
      }
    }

    // Transcriptions
    if (message.serverContent?.outputTranscription?.text) {
      wsDebug('Output transcription', { text: message.serverContent.outputTranscription.text });
      send({ type: 'transcription', text: message.serverContent.outputTranscription.text, isUser: false });
    }
    if (message.serverContent?.inputTranscription?.text) {
      wsDebug('Input transcription', { text: message.serverContent.inputTranscription.text });
      send({ type: 'transcription', text: message.serverContent.inputTranscription.text, isUser: true });
    }

    // Audio output chunks
    const parts = message.serverContent?.modelTurn?.parts || [];
    for (const part of parts) {
      const data = part?.inlineData?.data;
      const mimeType = part?.inlineData?.mimeType;
      if (data && mimeType?.startsWith('audio/')) {
        wsDebug('Audio chunk', { mimeType, bytes: data.length });
        send({ type: 'audio', data, mimeType });
      }
    }
  };

  const sendInitialTrigger = () => {
    sessionPromise?.then(session => {
      session.sendClientContent({
        turns: [{
          role: 'user',
          parts: [{ text: 'Anruf entgegennehmen.' }]
        }],
        turnComplete: true
      });
    });
  };

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      wsDebug('Invalid JSON', { error: e?.message });
      send({ type: 'error', message: 'Invalid message format' });
      return;
    }

    wsDebug('Message', { type: msg.type });
    if (msg.type === 'start') {
      resetIdleTimer();
      if (!API_KEY) {
        wsDebug('Start blocked: missing API key');
        send({ type: 'error', message: 'GEMINI_API_KEY missing on server' });
        return;
      }
      if (isConnected) return;

      const schools = await readJsonArray(schoolsFile);
      const schoolsList = schools.length > 0
        ? schools.map(s => `- ${s.name} (${s.city})`).join('\n')
        : '- (keine Schulen angelegt)';

      const systemInstruction = `
        Du bist ein effizientes KI-Sekretariat für Krankmeldungen.
        
        Szenario: Das Telefon klingelt. Du nimmst ab.
        
        REGEL NR 1: DU BEGINNST DAS GESPRÄCH.
        Sobald du die Nachricht "Anruf entgegennehmen." erhältst (das ist dein Startsignal), sprich SOFORT los.
        Begrüßung: "Guten Tag, hier ist das KI-Sekretariat. Möchten Sie eine Krankmeldung für Ihr Kind abgeben, dann nennen Sie mir bitte die Stadt und die Schule."
        
        SPRACH-LOGIK:
        - Starte immer auf Deutsch.
        - Wenn der Anrufer eine andere Sprache spricht (z.B. Englisch, Türkisch, Arabisch, etc.), wechsle SOFORT in diese Sprache.
        
        ZIEL DES GESPRÄCHS:
        Sammle folgende Daten für eine Krankmeldung:
        1. Stadt.
        2. Schule.
        3. Vollständiger Name des Kindes.
        4. Geburtsdatum des Kindes.
        5. Dauer der Krankheit (bis wann).

        ABGLEICH:
        Du MUSST die genannten Stadt- und Schulnamen gegen diese Liste abgleichen und exakt bestätigen.
        Wenn Stadt/Schule nicht in der Liste sind, sage freundlich Bescheid und frage erneut nach Stadt und Schule.

        SCHULLISTE:
        ${schoolsList}
        
        Sobald du diese 5 Infos hast, rufe die Funktion 'submitSickNote' auf.
        Bestätige danach dem Anrufer kurz den Erfolg und beende das Gespräch.
      `;

      wsDebug('Connecting to Gemini Live');
      ai = new GoogleGenAI({ apiKey: API_KEY });

      try {
        sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          callbacks: {
            onopen: () => {
              isConnected = true;
              send({ type: 'open' });
              wsDebug('Gemini session opened');
              sendInitialTrigger();
            },
            onmessage: async (message) => {
              await handleMessage(message);
            },
            onclose: () => {
              isConnected = false;
              wsDebug('Gemini session closed');
              send({ type: 'close' });
            },
            onerror: (e) => {
              console.error('Gemini Live Error:', e);
              wsDebug('Gemini session error', { error: e?.message });
              send({ type: 'error', message: 'Connection error' });
            }
          },
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction,
            tools: [{ functionDeclarations: [sickNoteTool] }],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {}
          }
        });
      } catch (e) {
        console.error('Failed to connect:', e);
        wsDebug('Failed to connect', { error: e?.message });
        send({ type: 'error', message: 'Failed to connect to Gemini' });
      }

      return;
    }

    if (msg.type === 'audio') {
      if (!sessionPromise) return;
      resetIdleTimer();
      wsDebug('Audio input', { mimeType: msg.mimeType, bytes: msg.data?.length });
      const data = msg.data;
      const mimeType = msg.mimeType || 'audio/pcm;rate=16000';
      sessionPromise?.then(session => {
        session.sendRealtimeInput({ audio: { data, mimeType } });
      });
      return;
    }

    if (msg.type === 'stop') {
      if (!sessionPromise) return;
      wsDebug('Stop');
      clearIdleTimer();
      sessionPromise?.then(session => {
        try {
          session.sendRealtimeInput({ audioStreamEnd: true });
          session.conn?.close();
        } catch (e) {}
      });
      return;
    }
  });

  ws.on('close', () => {
    wsDebug('Connection closed');
    clearIdleTimer();
    if (sessionPromise) {
      sessionPromise?.then(session => {
        try { session.conn?.close(); } catch (e) {}
      });
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Backend HTTP listening on http://localhost:${PORT}`);
  console.log(`Backend WebSocket listening on ws://localhost:${PORT}`);
  debug('Debug logging enabled');
  wsDebug('WS debug logging enabled');
});
