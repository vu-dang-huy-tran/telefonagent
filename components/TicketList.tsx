
import React from 'react';
import { ITTicket } from '../types';

interface TicketListProps {
  tickets: ITTicket[];
  onUpdateStatus: (id: string, status: ITTicket['status']) => void;
}

const TicketList: React.FC<TicketListProps> = ({ tickets, onUpdateStatus }) => {
  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200">
      <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">IT-Arbeitsliste (UKK)</h2>
        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
          {tickets.length} Anfragen
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold">
            <tr>
              <th className="px-6 py-3">Zeitpunkt</th>
              <th className="px-6 py-3">Mitarbeiter / Abt.</th>
              <th className="px-6 py-3">Zusammenfassung</th>
              <th className="px-6 py-3 text-center">Dringlichkeit</th>
              <th className="px-6 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic">
                  Noch keine Anfragen eingegangen.
                </td>
              </tr>
            ) : (
              tickets.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((ticket) => (
                <tr key={ticket.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {ticket.createdAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-semibold text-slate-800">{ticket.name}</div>
                    <div className="text-xs text-slate-500">{ticket.department}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-700 line-clamp-2 max-w-md">
                      {ticket.summary}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                      ticket.urgency === 'Kritisch' ? 'bg-red-100 text-red-600' :
                      ticket.urgency === 'Hoch' ? 'bg-orange-100 text-orange-600' :
                      ticket.urgency === 'Mittel' ? 'bg-yellow-100 text-yellow-600' :
                      'bg-green-100 text-green-600'
                    }`}>
                      {ticket.urgency}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={ticket.status}
                      onChange={(e) => onUpdateStatus(ticket.id, e.target.value as ITTicket['status'])}
                      className="text-xs border rounded p-1 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="Offen">Offen</option>
                      <option value="In Bearbeitung">In Arbeit</option>
                      <option value="Erledigt">Erledigt</option>
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

export default TicketList;
