import { createPCM16Blob, base64ToUint8Array, decodeAudioData, downsampleBuffer } from '../utils/audioUtils';
import { SickNote } from '../types';

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
  private ws: WebSocket | null = null;
  private isConnected = false;
  private backendUrl: string;

  constructor() {
    const envUrl = (import.meta as any).env?.VITE_BACKEND_WS_URL;
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const fallback = `${protocol}://${window.location.host}`;
    this.backendUrl = envUrl || fallback;
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
      
      this.ws = new WebSocket(this.backendUrl);

      this.ws.onopen = () => {
        const payload: any = { type: 'start' };
        if (config) {
          payload.config = config;
        }
        this.ws?.send(JSON.stringify(payload));
      };

      this.ws.onmessage = async (event) => {
        let msg: any = null;
        try {
          msg = JSON.parse(event.data);
        } catch (e) {
          return;
        }

        if (msg.type === 'open') {
          this.isConnected = true;
          this.setupAudioInput();
          callbacks.onOpen();
          return;
        }

        if (msg.type === 'close') {
          this.isConnected = false;
          callbacks.onClose();
          return;
        }

        if (msg.type === 'error') {
          callbacks.onError(new Error(msg.message || 'Connection error'));
          return;
        }

        if (msg.type === 'transcription') {
          callbacks.onTranscription(msg.text, msg.isUser);
          return;
        }

        if (msg.type === 'sickNote') {
          callbacks.onSickNoteCollected(msg.data);
          return;
        }

        if (msg.type === 'audio') {
          const base64Audio = msg.data;
          if (base64Audio && this.audioContext && this.outputNode) {
            try {
              const audioBuffer = await decodeAudioData(
                base64ToUint8Array(base64Audio),
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
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        callbacks.onClose();
      };

      this.ws.onerror = () => {
        callbacks.onError(new Error('WebSocket error'));
      };

    } catch (error) {
      console.error("Failed to connect:", error);
      callbacks.onError(error as Error);
      await this.disconnect(); 
    }
  }

  private setupAudioInput() {
    if (!this.audioContext || !this.stream || !this.ws) return;

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
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'audio',
          data: pcmBlob.data,
          mimeType: pcmBlob.mimeType
        }));
      }
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

    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'stop' }));
        }
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
  }
}