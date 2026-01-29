import React, { useState, useRef, useCallback } from 'react';
import { createPcmBlob, decode, decodeAudioData, downsampleFloat32 } from '../utils/audio';
import { Krankmeldung } from '../types';

interface VoiceAgentProps {
  onKrankmeldungSubmit: (krankmeldung: Partial<Krankmeldung>) => void;
}

const SUBMIT_KRANKMELDUNG_FUNCTION = {
  name: 'submitKrankmeldung',
  parameters: {
    type: 'object',
    description: 'Übermittelt die gesammelten Informationen einer Schüler-Krankmeldung.',
    properties: {
      schulName: { type: 'string', description: 'Name der Schule.' },
      schulStadt: { type: 'string', description: 'Stadt, in der die Schule liegt.' },
      kindName: { type: 'string', description: 'Vollständiger Name des kranken Kindes.' },
      geburtsdatum: { type: 'string', description: 'Geburtsdatum des Kindes (z.B. "15.03.2015" oder "15. März 2015").' },
      dauer: { type: 'string', description: 'Wie lange wird das Kind voraussichtlich fehlen? (z.B. "1 Tag", "diese Woche", "bis Freitag", "unklar").' }
    },
    required: ['schulName', 'schulStadt', 'kindName', 'geburtsdatum', 'dauer']
  }
};

const VoiceAgent: React.FC<VoiceAgentProps> = ({ onKrankmeldungSubmit }) => {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [volume, setVolume] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const muteTimeoutRef = useRef<number | null>(null);

  const stopSession = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch (e) {}
      wsRef.current = null;
    }
    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch (e) {}
      processorRef.current = null;
    }
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch (e) {}
      sourceRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close().catch(() => {});
      outputAudioContextRef.current = null;
    }
    if (muteTimeoutRef.current) {
      clearTimeout(muteTimeoutRef.current);
      muteTimeoutRef.current = null;
    }
    setIsActive(false);
    setIsConnecting(false);
    setVolume(0);
    setIsMuted(false);
  }, []);

  const muteMicrophone = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = false;
      });
      setIsMuted(true);
    }
  }, []);

  const unmuteMicrophone = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = true;
      });
      setIsMuted(false);
    }
  }, []);

  const scheduleUnmute = useCallback((delayMs: number) => {
    if (muteTimeoutRef.current) {
      clearTimeout(muteTimeoutRef.current);
    }
    muteTimeoutRef.current = window.setTimeout(() => {
      unmuteMicrophone();
      muteTimeoutRef.current = null;
    }, delayMs);
  }, [unmuteMicrophone]);

  const startSession = async () => {
    if (isConnecting || isActive) return;
    
    setIsConnecting(true);
    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsPath = (import.meta as any).env?.VITE_VOICE_WS_PATH ?? '/ws';
      const wsUrl = `${wsProtocol}://${window.location.host}${wsPath}`;
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;
      
      ws.onopen = () => {
        setIsActive(true);
        setIsConnecting(false);

        const source = audioContextRef.current!.createMediaStreamSource(stream);
        const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
        sourceRef.current = source;
        processorRef.current = scriptProcessor;

        scriptProcessor.onaudioprocess = (e) => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

          const inputData = e.inputBuffer.getChannelData(0);

          let sum = 0;
          for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
          setVolume(Math.sqrt(sum / inputData.length));

          // Don't send audio data if microphone is muted
          if (micStreamRef.current && !micStreamRef.current.getAudioTracks()[0]?.enabled) {
            return;
          }

          const inputSampleRate = audioContextRef.current?.sampleRate || 48000;
          const downsampled = downsampleFloat32(inputData, inputSampleRate, 16000);
          const pcmBlob = createPcmBlob(downsampled, 16000);
          wsRef.current.send(JSON.stringify({
            type: 'audio',
            data: pcmBlob.data,
            mimeType: pcmBlob.mimeType
          }));
        };

        source.connect(scriptProcessor);
        scriptProcessor.connect(audioContextRef.current!.destination);

        ws.send(JSON.stringify({
          type: 'start',
          config: {
            responseModalities: ['audio'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
            systemInstruction: 'Du bist ein freundlicher Sprachassistent des Schulsekretariats. WICHTIG: Sobald das Gespräch startet, begrüße den Anrufer SOFORT aktiv mit: "Guten Tag, Krankmeldungs-Service, wie kann ich Ihnen helfen?". Frage danach nacheinander: 1. Name der Schule, 2. Stadt der Schule, 3. Vollständiger Name des kranken Kindes (Vor- und Nachname), 4. Geburtsdatum des Kindes, 5. Voraussichtliche Dauer der Abwesenheit (z.B. "1 Tag", "diese Woche", "bis Freitag"). WICHTIG: Wenn das Geburtsdatum genannt wird, wiederhole es zur Bestätigung zurück, um Fehler zu vermeiden. Erst wenn der Anrufer die Richtigkeit bestätigt, fahre mit der nächsten Frage fort. Rufe am Ende die Funktion submitKrankmeldung auf und verabschiede dich freundlich. Teile dem Anrufer mit, dass die Krankmeldung erfolgreich aufgenommen wurde.'
          },
          tools: [{ functionDeclarations: [SUBMIT_KRANKMELDUNG_FUNCTION] }]
        }));

        ws.send(JSON.stringify({
          type: 'text',
          text: "Beginne das Gespräch jetzt proaktiv mit der Begrüßung: 'Guten Tag, Krankmeldungs-Service, wie kann ich Ihnen helfen?'"
        }));
      };

      ws.onmessage = async (event) => {
        if (event.data instanceof ArrayBuffer) {
          if (!outputAudioContextRef.current) return;
          const ctx = outputAudioContextRef.current;
          nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);

          const buffer = await decodeAudioData(new Uint8Array(event.data), ctx, 24000, 1);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(nextStartTimeRef.current);
          
          nextStartTimeRef.current += buffer.duration;

          activeSourcesRef.current.add(source);
          source.onended = () => activeSourcesRef.current.delete(source);
          return;
        }

        if (event.data instanceof Blob) {
          const arrayBuffer = await event.data.arrayBuffer();
          if (!outputAudioContextRef.current) return;
          const ctx = outputAudioContextRef.current;
          nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);

          const buffer = await decodeAudioData(new Uint8Array(arrayBuffer), ctx, 24000, 1);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(nextStartTimeRef.current);
          
          nextStartTimeRef.current += buffer.duration;

          activeSourcesRef.current.add(source);
          source.onended = () => activeSourcesRef.current.delete(source);
          return;
        }

        if (typeof event.data === 'string') {
          let message: any;
          try {
            message = JSON.parse(event.data);
          } catch {
            return;
          }

          if (message?.type === 'toolCall' && message?.name === 'submitKrankmeldung') {
            console.log('🔔 submitKrankmeldung toolCall empfangen:', message.args);
            onKrankmeldungSubmit(message.args as any);
            console.log('✅ onKrankmeldungSubmit wurde aufgerufen');
            wsRef.current?.send(JSON.stringify({
              type: 'toolResponse',
              id: message.id,
              name: message.name,
              response: { result: 'Krankmeldung wurde erfasst.' }
            }));
            
            // Nach 2 Sekunden automatisch auflegen
            setTimeout(() => {
              stopSession();
            }, 2000);
          }

          if (message?.type === 'audio' && message?.data && outputAudioContextRef.current) {
            const ctx = outputAudioContextRef.current;
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);

            const buffer = await decodeAudioData(decode(message.data), ctx, 24000, 1);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.start(nextStartTimeRef.current);
            
            nextStartTimeRef.current += buffer.duration;

            activeSourcesRef.current.add(source);
            source.onended = () => activeSourcesRef.current.delete(source);
          }

          if (message?.type === 'interrupted') {
            activeSourcesRef.current.forEach(s => { try { s.stop(); } catch (e) {} });
            activeSourcesRef.current.clear();
            nextStartTimeRef.current = 0;
          }

          if (message?.type === 'error') {
            console.error('Voice Agent Error:', message?.error ?? message);
            stopSession();
          }
        }
      };

      ws.onerror = (e) => {
        console.error('WebSocket Error:', e);
        stopSession();
      };

      ws.onclose = () => stopSession();
    } catch (error) {
      console.error("Connection failed:", error);
      setIsConnecting(false);
      setIsActive(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-white rounded-2xl shadow-xl border border-blue-100">
      <div className="mb-6 text-center">
        <h3 className="text-2xl font-bold text-slate-800 mb-2">Krankmeldungs-Sprachassistent</h3>
        <p className="text-slate-500 text-sm max-w-xs">
          Klicken Sie auf den Button, um eine Krankmeldung telefonisch aufzugeben.
        </p>
      </div>

      <div className="relative mb-8">
        <div 
          className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 ${
            isActive ? 'bg-blue-600 scale-110 shadow-blue-200' : 'bg-slate-200 scale-100'
          } shadow-2xl relative z-10`}
        >
          {isActive ? (
            <div className="flex items-end gap-1 h-8">
              {[...Array(5)].map((_, i) => (
                <div 
                  key={i} 
                  className="w-1.5 bg-white rounded-full transition-all duration-75"
                  style={{ height: `${20 + (volume * 150 * (Math.random() * 0.5 + 0.5))}px` }}
                />
              ))}
            </div>
          ) : (
            <svg className="w-12 h-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
        </div>
        
        {isActive && (
          <div className="absolute inset-0 animate-ping bg-blue-400 rounded-full opacity-20" />
        )}
      </div>

      <div className="flex gap-4">
        {!isActive ? (
          <button
            onClick={startSession}
            disabled={isConnecting}
            className={`px-8 py-3 rounded-full font-bold text-white transition-all transform active:scale-95 ${
              isConnecting ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-lg'
            }`}
          >
            {isConnecting ? 'Verbindung...' : 'Gespräch starten'}
          </button>
        ) : (
          <button
            onClick={stopSession}
            className="px-8 py-3 rounded-full font-bold text-white bg-red-500 hover:bg-red-600 shadow-lg transition-all transform active:scale-95"
          >
            Auflegen
          </button>
        )}
      </div>

      <div className="mt-8 flex items-center gap-2 text-xs text-slate-400">
        <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-slate-300'}`} />
        {isActive ? 'Agent Online' : 'Agent Offline'}
      </div>
    </div>
  );
};

export default VoiceAgent;