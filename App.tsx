import React, { useState, useCallback } from 'react';
import { Krankmeldung } from './types';
import VoiceAgent from './components/VoiceAgent';
import KrankmeldungsListe from './components/KrankmeldungsListe';

const App: React.FC = () => {
  const [krankmeldungen, setKrankmeldungen] = useState<Krankmeldung[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [showError, setShowError] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'qw123') {
      setIsAuthenticated(true);
      setShowError(false);
    } else {
      setShowError(true);
      setPassword('');
    }
  };

  const handleKrankmeldungSubmit = useCallback((meldungData: Partial<Krankmeldung>) => {
    console.log('📋 handleKrankmeldungSubmit aufgerufen mit Daten:', meldungData);
    const neueMeldung: Krankmeldung = {
      id: Math.random().toString(36).substr(2, 9),
      schulName: meldungData.schulName || 'Unbekannt',
      schulStadt: meldungData.schulStadt || 'N/A',
      kindName: meldungData.kindName || 'Unbekannt',
      geburtsdatum: meldungData.geburtsdatum || 'N/A',
      dauer: meldungData.dauer || 'Unklar',
      createdAt: new Date(),
      status: 'Neu'
    };

    console.log('➕ Neue Meldung erstellt:', neueMeldung);
    setKrankmeldungen(prev => [neueMeldung, ...prev]);
    console.log('✅ Krankmeldung zur Liste hinzugefügt');
  }, []);

  const handleUpdateStatus = useCallback((id: string, status: Krankmeldung['status']) => {
    setKrankmeldungen(prev => prev.map(m => m.id === id ? { ...m, status } : m));
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md border border-slate-200">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg mx-auto mb-4">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Anmelden</h2>
            <p className="text-slate-500 text-sm">Krankmeldungs-System</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                Passwort
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="Passwort eingeben"
                autoFocus
              />
            </div>
            
            {showError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                Falsches Passwort. Bitte versuchen Sie es erneut.
              </div>
            )}
            
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-all transform active:scale-95 shadow-lg"
            >
              Anmelden
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Voice Agent Controller */}
          <div className="lg:col-span-4 space-y-6">
            <VoiceAgent onKrankmeldungSubmit={handleKrankmeldungSubmit} />
          </div>

          {/* Right Column: Krankmeldungsliste */}
          <div className="lg:col-span-8">
            <KrankmeldungsListe krankmeldungen={krankmeldungen} onUpdateStatus={handleUpdateStatus} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto py-8 text-center text-slate-400 text-sm border-t border-slate-200 bg-white">
        &copy; 2026 Schulsekretariat - Krankmeldungs-System (Demo)
      </footer>
    </div>
  );
};

export default App;
