import React, { useEffect, useState, useRef } from 'react';
import { CallState, LogEntry, SickNote } from './types';
import { GeminiLiveService } from './services/geminiLiveService';
import { SettingsPanel } from './components/SettingsPanel';
import { CallInterface } from './components/CallInterface';
import { AdminDashboard } from './components/AdminDashboard';
import { Phone, Database } from 'lucide-react';

const App: React.FC = () => {
  const [callState, setCallState] = useState<CallState>(CallState.IDLE);
  const [transcripts, setTranscripts] = useState<LogEntry[]>([]);
  const [audioAnalyser, setAudioAnalyser] = useState<AnalyserNode | null>(null);
  const [collectedData, setCollectedData] = useState<SickNote | null>(null);
  const [route, setRoute] = useState<string>(() => window.location.hash || '#/');
  
  const liveServiceRef = useRef<GeminiLiveService | null>(null);

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleStartCall = async () => {
    setCallState(CallState.CONNECTING);
    setTranscripts([]);
    setCollectedData(null); // Reset data

    const service = new GeminiLiveService();
    liveServiceRef.current = service;

    try {
      await service.connect(undefined, {
        onOpen: () => {
          setCallState(CallState.ACTIVE);
        },
        onClose: () => {
          setCallState(CallState.ENDED);
          setAudioAnalyser(null);
          setTimeout(() => setCallState(CallState.IDLE), 3000);
        },
        onError: (err) => {
          console.error(err);
          setCallState(CallState.ERROR);
          setTranscripts(prev => [...prev, {
            source: 'system',
            message: 'Verbindungsfehler aufgetreten.',
            timestamp: new Date()
          }]);
          setTimeout(() => setCallState(CallState.IDLE), 3000);
        },
        onAudioData: (analyser) => {
          setAudioAnalyser(analyser);
        },
        onTranscription: (text, isUser) => {
          setTranscripts(prev => {
            const source = isUser ? 'user' : 'bot';
            if (prev.length > 0 && prev[prev.length - 1].source === source) {
              const last = prev[prev.length - 1];
              const nextMessage = text.startsWith(last.message)
                ? text
                : `${last.message} ${text}`.trim();

              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  message: nextMessage,
                  timestamp: new Date()
                }
              ];
            }

            return [...prev, {
              source,
              message: text,
              timestamp: new Date()
            }];
          });
        },
        onSickNoteCollected: (data) => {
            setCollectedData(data);
            setTranscripts(prev => [...prev, {
                source: 'system',
                message: '✅ DATENSATZ VOLLSTÄNDIG - GESPEICHERT',
                timestamp: new Date()
            }]);
        }
      });
    } catch (e) {
      console.error(e);
      setCallState(CallState.ERROR);
    }
  };

  const handleEndCall = async () => {
    if (liveServiceRef.current) {
      await liveServiceRef.current.disconnect();
      liveServiceRef.current = null;
    }
    setCallState(CallState.ENDED);
    setTimeout(() => setCallState(CallState.IDLE), 1000);
  };

  if (route === '#/admin') {
    return <AdminDashboard />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      
      {callState === CallState.IDLE || callState === CallState.ERROR ? (
        <div className="w-full max-w-5xl flex flex-col md:flex-row items-center gap-12">
          
          <div className="flex-1 text-center md:text-left space-y-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-emerald-600 shadow-lg shadow-emerald-500/30 mb-4">
              <Database size={40} className="text-white" />
            </div>
            <h1 className="text-5xl font-extrabold text-white tracking-tight leading-tight">
              Krankmeldung <span className="text-emerald-400">Assistant</span>
            </h1>
            <p className="text-xl text-gray-300 max-w-lg leading-relaxed">
              Automatisierte telefonische Datenerfassung für Schulen. 
              <br/><br/>
              Dieser Agent nimmt Anrufe entgegen, extrahiert <strong>Name</strong>, <strong>Geburtsdatum</strong> und <strong>Dauer</strong> der Krankheit und speichert diese strukturiert ab.
            </p>
          </div>

          <div className="flex-1 w-full flex justify-center">
            <SettingsPanel 
              onStart={handleStartCall}
              disabled={callState === CallState.ERROR}
            />
          </div>
        </div>
      ) : (
        <CallInterface 
          callState={callState}
          onEndCall={handleEndCall}
          audioAnalyser={audioAnalyser}
          transcripts={transcripts}
          collectedData={collectedData}
        />
      )}
    </div>
  );
};

export default App;