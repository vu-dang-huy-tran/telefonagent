import { createPCM16Blob, base64ToUint8Array, decodeAudioData, downsampleBuffer } from '../utils/audioUtils';
import { SickNote } from '../types';
import { GoogleGenAI, Modality, Type } from '@google/genai';

interface LiveServiceCallbacks {
  onOpen: () => void;
  onClose: () => void;
  onError: (error: Error) => void;
  onAudioData: (analyser: AnalyserNode) => void;
  onTranscription: (text: string, isUser: boolean) => void;
  onSickNoteCollected: (data: SickNote) => void;
}

export class GeminiLiveService {
  private audioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private outputNode: GainNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private muteNode: GainNode | null = null;
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();
  private stream: MediaStream | null = null;
  private sessionPromise: Promise<any> | null = null;
  private isConnected = false;
  private backendHttpUrl: string;

  private sickNoteTool = {
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

  constructor() {
    this.backendHttpUrl = (import.meta as any).env?.VITE_BACKEND_HTTP_URL || `${window.location.protocol}//${window.location.host}`;
  }

  public async connect(
    config: { schoolName?: string; secretaryName?: string } | undefined,
    callbacks: LiveServiceCallbacks
  ) {
    if (this.isConnected) return;

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.outputNode = this.audioContext.createGain();
      this.outputAnalyser = this.audioContext.createAnalyser();
      this.outputAnalyser.fftSize = 256;
      this.outputNode.connect(this.outputAnalyser);
      this.outputAnalyser.connect(this.audioContext.destination);
      
      callbacks.onAudioData(this.outputAnalyser);

      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        throw new Error("Microphone access denied. Please allow microphone access.");
      }
      
      const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('VITE_GEMINI_API_KEY is missing.');
      }

      const ai = new GoogleGenAI({ apiKey });

      this.sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            this.isConnected = true;
            this.setupAudioInput();
            callbacks.onOpen();

            this.sessionPromise?.then(session => {
              session.sendClientContent({
                turns: [{
                  role: 'user',
                  parts: [{ text: 'Anruf entgegennehmen.' }]
                }],
                turnComplete: true
              });
            });
          },
          onmessage: async (message: any) => {
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls || []) {
                if (fc.name === 'submitSickNote') {
                  const data = { ...(fc.args || {}), status: 'collected' } as SickNote;
                  try {
                    await fetch(`${this.backendHttpUrl}/api/sick-notes`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(data)
                    });
                  } catch (e) {}
                  callbacks.onSickNoteCollected(data);

                  this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{
                        id: fc.id,
                        name: fc.name,
                        response: { result: 'success', message: 'Krankmeldung wurde erfolgreich übernommen.' }
                      }]
                    });
                  });
                }
              }
            }

            if (message.serverContent?.outputTranscription?.text) {
              callbacks.onTranscription(message.serverContent.outputTranscription.text, false);
            }
            if (message.serverContent?.inputTranscription?.text) {
              callbacks.onTranscription(message.serverContent.inputTranscription.text, true);
            }

            const parts = message.serverContent?.modelTurn?.parts || [];
            for (const part of parts) {
              const data = part?.inlineData?.data;
              const mimeType = part?.inlineData?.mimeType;
              if (data && mimeType?.startsWith('audio/')) {
                if (this.audioContext && this.outputNode) {
                  try {
                    const audioBuffer = await decodeAudioData(
                      base64ToUint8Array(data),
                      this.audioContext,
                      24000,
                      1
                    );

                    this.nextStartTime = Math.max(this.nextStartTime, this.audioContext.currentTime);

                    const source = this.audioContext.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(this.outputNode);

                    source.addEventListener('ended', () => {
                      this.activeSources.delete(source);
                    });

                    source.start(this.nextStartTime);
                    this.nextStartTime += audioBuffer.duration;
                    this.activeSources.add(source);
                  } catch (err) {
                    console.error('Error decoding audio:', err);
                  }
                }
              }
            }
          },
          onclose: () => {
            this.isConnected = false;
            callbacks.onClose();
          },
          onerror: (e: any) => {
            callbacks.onError(e instanceof Error ? e : new Error('Connection error'));
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `
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
            
            Sobald du diese 5 Infos hast, rufe die Funktion 'submitSickNote' auf.
            Bestätige danach dem Anrufer kurz den Erfolg und beende das Gespräch.
          `,
          tools: [{ functionDeclarations: [this.sickNoteTool] }],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });

    } catch (error) {
      console.error("Failed to connect:", error);
      callbacks.onError(error as Error);
      await this.disconnect(); 
    }
  }

  private setupAudioInput() {
    if (!this.audioContext || !this.stream || !this.sessionPromise) return;

    this.inputSource = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      
      const downsampledData = downsampleBuffer(
        inputData, 
        this.audioContext!.sampleRate, 
        16000
      );

      const pcmBlob = createPCM16Blob(downsampledData);
      
      this.sessionPromise?.then(session => {
        session.sendRealtimeInput({
          audio: {
            data: pcmBlob.data,
            mimeType: pcmBlob.mimeType
          }
        });
      });
    };

    this.muteNode = this.audioContext.createGain();
    this.muteNode.gain.value = 0;
    
    this.inputSource.connect(this.processor);
    this.processor.connect(this.muteNode);
    this.muteNode.connect(this.audioContext.destination);
  }

  public async disconnect() {
    this.isConnected = false;

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.inputSource) {
      this.inputSource.disconnect();
      this.inputSource = null;
    }
    if (this.muteNode) {
      this.muteNode.disconnect();
      this.muteNode = null;
    }

    this.activeSources.forEach(s => {
      try { s.stop(); } catch (e) {}
    });
    this.activeSources.clear();
    
    if (this.audioContext) {
      try { await this.audioContext.close(); } catch(e) {}
      this.audioContext = null;
    }

    if (this.sessionPromise) {
      this.sessionPromise?.then(session => {
        try {
          session.sendRealtimeInput({ audioStreamEnd: true });
          session.conn?.close();
        } catch (e) {}
      });
      this.sessionPromise = null;
    }
  }
}