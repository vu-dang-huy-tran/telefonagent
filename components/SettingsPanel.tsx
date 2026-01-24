import React from 'react';

interface SettingsPanelProps {
  onStart: () => void;
  disabled: boolean;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onStart, disabled }) => {
  return (
    <div className="bg-white/5 backdrop-blur-md rounded-2xl p-8 w-full max-w-md shadow-2xl border border-white/10">
      <h2 className="text-2xl font-bold mb-6 text-white text-center">Bereit zum Start</h2>
      
      <div className="space-y-5">
        <div className="pt-4">
          <button
            onClick={onStart}
            disabled={disabled}
            className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all duration-300 ${
              disabled 
                ? 'bg-gray-600 cursor-not-allowed opacity-50' 
                : 'bg-emerald-600 hover:bg-emerald-500 text-white hover:shadow-emerald-500/30 hover:scale-[1.02]'
            }`}
          >
            {disabled ? 'Initialisiere...' : 'Agenten Starten'}
          </button>
        </div>
        
        <div className="text-xs text-center text-gray-500 mt-6 border-t border-white/5 pt-4">
          Status: <span className="text-emerald-400">Betriebsbereit</span> • Version 1.2
        </div>
        <div className="mt-6">
          <a
            href="#/admin"
            className="w-full inline-flex items-center justify-center py-3 rounded-xl font-semibold bg-slate-700 hover:bg-slate-600 text-white transition"
          >
            Admin Dashboard öffnen
          </a>
        </div>
      </div>
    </div>
  );
};