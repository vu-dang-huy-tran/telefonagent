import React, { useEffect, useState } from 'react';

interface SchoolEntry {
  id: string;
  name: string;
  city: string;
  email: string;
}

interface SickNoteEntry {
  schoolId: string;
  city: string;
  schoolName: string;
  childName: string;
  dateOfBirth: string;
  sickUntil: string;
  status: 'collected' | 'school_notified';
  savedAt?: string;
}

export const AdminDashboard: React.FC = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [schools, setSchools] = useState<SchoolEntry[]>([]);
  const [schoolCounts, setSchoolCounts] = useState<Record<string, number>>({});
  const [totalSickNotes, setTotalSickNotes] = useState(0);
  const [selectedSchool, setSelectedSchool] = useState<SchoolEntry | null>(null);
  const [schoolNotes, setSchoolNotes] = useState<SickNoteEntry[]>([]);
  const [nameInput, setNameInput] = useState('');
  const [cityInput, setCityInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const adminPassword = (import.meta as any).env?.VITE_ADMIN_PASSWORD || '';
  const backendHttpUrl = (import.meta as any).env?.VITE_BACKEND_HTTP_URL || `${window.location.protocol}//${window.location.host}`;

  const loadSchools = async () => {
    try {
      const res = await fetch(`${backendHttpUrl}/api/schools`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setSchools(data);
      }
    } catch (e) {}
  };

  const loadSummary = async () => {
    try {
      const res = await fetch(`${backendHttpUrl}/api/schools/summary`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && typeof data === 'object') {
        setSchoolCounts(data.counts || {});
        setTotalSickNotes(data.total || 0);
      }
    } catch (e) {}
  };

  const loadSchoolNotes = async (schoolId: string) => {
    try {
      const res = await fetch(`${backendHttpUrl}/api/sick-notes?schoolId=${encodeURIComponent(schoolId)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setSchoolNotes(data);
      }
    } catch (e) {}
  };

  useEffect(() => {
    loadSchools();
    loadSummary();
  }, []);

  const handleLogin = () => {
    if (!adminPassword) {
      setAuthError('Admin-Passwort ist nicht gesetzt.');
      return;
    }
    if (passwordInput === adminPassword) {
      setIsAdmin(true);
      setAuthError(null);
      setPasswordInput('');
    } else {
      setAuthError('Falsches Passwort.');
    }
  };

  const resetForm = () => {
    setNameInput('');
    setCityInput('');
    setEmailInput('');
    setEditingId(null);
  };

  const handleSaveSchool = async () => {
    const name = nameInput.trim();
    const city = cityInput.trim();
    const email = emailInput.trim();
    if (!name || !city || !email) return;

    if (editingId) {
      try {
        const res = await fetch(`${backendHttpUrl}/api/schools/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, city, email })
        });
        if (res.ok) {
          await loadSchools();
          await loadSummary();
          resetForm();
        }
      } catch (e) {}
      resetForm();
      return;
    }

    try {
      const res = await fetch(`${backendHttpUrl}/api/schools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, city, email })
      });
      if (res.ok) {
        await loadSchools();
        await loadSummary();
        resetForm();
      }
    } catch (e) {}
  };

  const handleEdit = (entry: SchoolEntry) => {
    setEditingId(entry.id);
    setNameInput(entry.name);
    setCityInput(entry.city);
    setEmailInput(entry.email);
  };

  const handleDelete = (id: string) => {
    fetch(`${backendHttpUrl}/api/schools/${id}`, { method: 'DELETE' })
      .then(async () => {
        await loadSchools();
        await loadSummary();
      })
      .catch(() => {});
    if (editingId === id) {
      resetForm();
    }
  };

  return (
    <div className="min-h-screen p-6 md:p-10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-xs text-emerald-400 uppercase tracking-widest">Admin</div>
            <h1 className="text-3xl font-bold">Schulverwaltung</h1>
          </div>
          <a
            href="#/"
            className="text-sm text-gray-300 hover:text-white transition"
          >
            Zurück
          </a>
        </div>

        {!isAdmin ? (
          <div className="max-w-md bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="text-lg font-semibold mb-4">Admin Login</div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Admin Passwort</label>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="w-full px-4 py-3 bg-black/40 border border-gray-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
              placeholder="Passwort eingeben"
            />
            {authError && <div className="text-sm text-red-400 mt-2">{authError}</div>}
            <button
              onClick={handleLogin}
              className="w-full mt-4 py-3 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition"
            >
              Login
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 p-4">
                <div className="text-xs text-emerald-300">Schulen gesamt</div>
                <div className="text-2xl font-bold text-white">{schools.length}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-gradient-to-br from-blue-500/15 to-blue-500/5 p-4">
                <div className="text-xs text-blue-300">Städte</div>
                <div className="text-2xl font-bold text-white">{new Set(schools.map(s => s.city)).size}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-gradient-to-br from-purple-500/15 to-purple-500/5 p-4">
                <div className="text-xs text-purple-300">Sick Notes</div>
                <div className="text-2xl font-bold text-white">{totalSickNotes}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-gradient-to-br from-orange-500/15 to-orange-500/5 p-4">
                <div className="text-xs text-orange-300">Ø pro Schule</div>
                <div className="text-2xl font-bold text-white">
                  {schools.length > 0 ? (totalSickNotes / schools.length).toFixed(1) : '0.0'}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="text-sm font-semibold text-gray-200 mb-3">Schule hinzufügen / bearbeiten</div>
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">Schule</label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="w-full px-4 py-3 bg-black/40 border border-gray-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                    placeholder="z.B. Goethe-Gymnasium"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">Stadt</label>
                  <input
                    type="text"
                    value={cityInput}
                    onChange={(e) => setCityInput(e.target.value)}
                    className="w-full px-4 py-3 bg-black/40 border border-gray-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                    placeholder="z.B. Berlin"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">E-Mail</label>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="w-full px-4 py-3 bg-black/40 border border-gray-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                    placeholder="sekretariat@schule.de"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleSaveSchool}
                    className="flex-1 py-3 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition"
                  >
                    {editingId ? 'Aktualisieren' : 'Hinzufügen'}
                  </button>
                  <button
                    onClick={resetForm}
                    className="py-3 px-4 rounded-xl font-semibold bg-slate-700 hover:bg-slate-600 text-white transition"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="text-sm font-semibold text-gray-200 mb-3">Schulliste</div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {schools.length === 0 && (
                  <div className="text-sm text-gray-500">Keine Schulen angelegt.</div>
                )}
                {schools.map((school) => (
                  <div key={school.id} className="flex items-center justify-between bg-black/30 border border-white/10 rounded-lg px-3 py-2">
                    <button
                      onClick={() => {
                        setSelectedSchool(school);
                        loadSchoolNotes(school.id);
                      }}
                      className="text-left flex-1 text-sm text-gray-200"
                    >
                      <div className="font-semibold">{school.name}</div>
                      <div className="text-xs text-gray-400">{school.city}</div>
                      <div className="text-xs text-gray-500">{school.email}</div>
                      <div className="text-xs text-emerald-300">
                        Sick Notes: {schoolCounts[school.id] || 0}
                      </div>
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(school)}
                        className="text-xs text-blue-300 hover:text-blue-200"
                      >
                        Bearbeiten
                      </button>
                      <button
                        onClick={() => handleDelete(school.id)}
                        className="text-xs text-red-300 hover:text-red-200"
                      >
                        Löschen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {selectedSchool && (
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-gray-200">
                    Krankmeldungen – {selectedSchool.name} ({selectedSchool.city})
                  </div>
                  <button
                    onClick={() => {
                      setSelectedSchool(null);
                      setSchoolNotes([]);
                    }}
                    className="text-xs text-gray-400 hover:text-gray-200"
                  >
                    Schließen
                  </button>
                </div>

                {schoolNotes.length === 0 ? (
                  <div className="text-sm text-gray-500">Keine Krankmeldungen vorhanden.</div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {schoolNotes.map((note, idx) => (
                      <div key={`${note.schoolId}-${idx}`} className="bg-black/40 border border-white/10 rounded-lg px-3 py-2">
                        <div className="text-sm text-gray-200 font-semibold">{note.childName}</div>
                        <div className="text-xs text-gray-400">Geboren: {note.dateOfBirth}</div>
                        <div className="text-xs text-gray-400">Krank bis: {note.sickUntil}</div>
                        <div className="text-xs text-gray-500">Status: {note.status}</div>
                        {note.savedAt && (
                          <div className="text-[10px] text-gray-600">Gespeichert: {new Date(note.savedAt).toLocaleString()}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
