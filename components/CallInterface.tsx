import React, { useEffect, useRef } from 'react';
import { CallState, LogEntry, SickNote } from '../types';
import { PhoneOff, Volume2, CheckCircle2, User, Calendar, Clock, MapPin, School } from 'lucide-react';

interface CallInterfaceProps {
  callState: CallState;
  onEndCall: () => void;
  audioAnalyser: AnalyserNode | null;
  transcripts: LogEntry[];
  collectedData: SickNote | null;
}

export const CallInterface: React.FC<CallInterfaceProps> = ({ callState, onEndCall, audioAnalyser, transcripts, collectedData }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  useEffect(() => {
    if (!canvasRef.current || !audioAnalyser) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = audioAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      audioAnalyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = 60;
      
      let average = 0;
      for(let i = 0; i < bufferLength; i++) {
        average += dataArray[i];
      }
      average = average / bufferLength;

      const scale = 1 + (average / 256) * 0.8;

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * scale, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(59, 130, 246, ${0.2 + (average/256)})`;
      ctx.fill();
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.8, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(96, 165, 250, 0.9)`;
      ctx.fill();
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [audioAnalyser]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-[85vh] w-full max-w-6xl mx-auto gap-4">
        
        {/* Main Grid: Left for Info/Data, Right for Conversation */}
        <div className="flex flex-1 gap-4 overflow-hidden">
            
            {/* Left Column: Visualizer & Data Card */}
            <div className="w-1/3 flex flex-col gap-4">
                
                {/* Agent Visualizer Card */}
                <div className="bg-gray-900/80 backdrop-blur-xl rounded-3xl p-6 border border-white/10 flex flex-col items-center justify-center shadow-2xl relative overflow-hidden h-64 shrink-0">
                    <div className="relative w-full h-full flex items-center justify-center">
                        <canvas ref={canvasRef} width={200} height={200} className="absolute inset-0 m-auto pointer-events-none" />
                        <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center relative z-10 shadow-lg shadow-blue-500/50">
                             <Volume2 className="text-white w-8 h-8" />
                        </div>
                    </div>
                    <div className="mt-4 text-center z-10">
                        <h2 className="text-xl font-bold text-white">Aufnahme läuft</h2>
                        <div className="flex items-center justify-center gap-2 mt-2">
                             <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                             <span className="text-red-400 font-mono text-sm">REC</span>
                        </div>
                    </div>
                </div>

                {/* Collected Data Card */}
                <div className={`flex-1 bg-gray-900/80 backdrop-blur-xl rounded-3xl p-6 border transition-all duration-500 ${collectedData ? 'border-green-500/50 shadow-[0_0_30px_rgba(34,197,94,0.1)]' : 'border-white/10'}`}>
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-gray-200">Erfasste Daten</h3>
                        {collectedData && <CheckCircle2 className="text-green-500 w-6 h-6" />}
                    </div>
                    
                    <div className="space-y-6">
                        <div className="group">
                            <label className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                                <MapPin className="w-4 h-4" /> Stadt
                            </label>
                            <div className={`text-lg font-medium border-b border-gray-700 py-1 ${collectedData?.city ? 'text-white' : 'text-gray-600 italic'}`}>
                                {collectedData?.city || 'Wird erfragt...'}
                            </div>
                        </div>

                        <div className="group">
                            <label className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                                <School className="w-4 h-4" /> Schule
                            </label>
                            <div className={`text-lg font-medium border-b border-gray-700 py-1 ${collectedData?.schoolName ? 'text-white' : 'text-gray-600 italic'}`}>
                                {collectedData?.schoolName || 'Wird erfragt...'}
                            </div>
                        </div>

                        <div className="group">
                            <label className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                                <User className="w-4 h-4" /> Name des Kindes
                            </label>
                            <div className={`text-lg font-medium border-b border-gray-700 py-1 ${collectedData?.childName ? 'text-white' : 'text-gray-600 italic'}`}>
                                {collectedData?.childName || 'Wird erfragt...'}
                            </div>
                        </div>

                        <div className="group">
                            <label className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                                <Calendar className="w-4 h-4" /> Geburtsdatum
                            </label>
                            <div className={`text-lg font-medium border-b border-gray-700 py-1 ${collectedData?.dateOfBirth ? 'text-white' : 'text-gray-600 italic'}`}>
                                {collectedData?.dateOfBirth || 'Wird erfragt...'}
                            </div>
                        </div>

                        <div className="group">
                            <label className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                                <Clock className="w-4 h-4" /> Krank bis
                            </label>
                            <div className={`text-lg font-medium border-b border-gray-700 py-1 ${collectedData?.sickUntil ? 'text-white' : 'text-gray-600 italic'}`}>
                                {collectedData?.sickUntil || 'Wird erfragt...'}
                            </div>
                        </div>
                    </div>

                    {collectedData && (
                        <div className="mt-8 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm text-center">
                            Daten erfolgreich erfasst und gespeichert.
                        </div>
                    )}
                </div>
            </div>

            {/* Right Column: Transcript */}
            <div className="w-2/3 bg-gray-900/80 backdrop-blur-xl rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col">
                <div className="bg-gray-800/50 p-4 border-b border-white/5 flex justify-between items-center">
                    <span className="font-semibold text-gray-300">Live Transkription</span>
                    <div className="text-xs text-gray-500 font-mono">
                        ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-black/20">
                    {transcripts.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 opacity-50 space-y-2">
                            <p>Warte auf Gesprächsbeginn...</p>
                        </div>
                    )}
                    {transcripts.map((t, idx) => (
                        <div key={idx} className={`flex ${t.source === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-5 py-3 shadow-sm ${
                            t.source === 'user' 
                            ? 'bg-blue-600 text-white rounded-tr-none' 
                            : 'bg-gray-700 text-gray-100 rounded-tl-none'
                        }`}>
                            <p className="text-base leading-relaxed">{t.message}</p>
                            <span className={`text-[10px] block mt-1 opacity-60 ${t.source === 'user' ? 'text-blue-100' : 'text-gray-400'}`}>
                                {formatTime(t.timestamp)}
                            </span>
                        </div>
                        </div>
                    ))}
                    <div ref={logsEndRef} />
                </div>
                
                {/* Control Bar */}
                <div className="bg-gray-800/80 backdrop-blur-md p-4 border-t border-white/5 flex justify-center items-center gap-6">
                    <button 
                        onClick={onEndCall}
                        className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-full font-bold shadow-lg shadow-red-500/30 flex items-center gap-2 transition-all hover:scale-105"
                    >
                        <PhoneOff size={20} />
                        <span>Beenden</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};