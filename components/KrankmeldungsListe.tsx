import React from 'react';
import { Krankmeldung } from '../types';

interface KrankmeldungsListeProps {
  krankmeldungen: Krankmeldung[];
  onUpdateStatus: (id: string, status: Krankmeldung['status']) => void;
}

const KrankmeldungsListe: React.FC<KrankmeldungsListeProps> = ({ krankmeldungen, onUpdateStatus }) => {
  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200">
      <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">Krankmeldungsübersicht</h2>
        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
          {krankmeldungen.length} Meldungen
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold">
            <tr>
              <th className="px-6 py-3">Zeitpunkt</th>
              <th className="px-6 py-3">Kind / Geburtsdatum</th>
              <th className="px-6 py-3">Schule / Stadt</th>
              <th className="px-6 py-3 text-center">Dauer</th>
              <th className="px-6 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {krankmeldungen.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic">
                  Noch keine Krankmeldungen eingegangen.
                </td>
              </tr>
            ) : (
              krankmeldungen.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((meldung) => (
                <tr key={meldung.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {meldung.createdAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    <div className="text-xs text-slate-400">
                      {meldung.createdAt.toLocaleDateString('de-DE')}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-semibold text-slate-800">{meldung.kindName}</div>
                    <div className="text-xs text-slate-500">Geb.: {meldung.geburtsdatum}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-700">{meldung.schulName}</div>
                    <div className="text-xs text-slate-500">{meldung.schulStadt}</div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 font-medium">
                      {meldung.dauer}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={meldung.status}
                      onChange={(e) => onUpdateStatus(meldung.id, e.target.value as Krankmeldung['status'])}
                      className="text-xs border rounded p-1 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="Neu">Neu</option>
                      <option value="Bestätigt">Bestätigt</option>
                      <option value="Archiviert">Archiviert</option>
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default KrankmeldungsListe;
