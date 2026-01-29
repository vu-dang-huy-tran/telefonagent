
export interface Krankmeldung {
  id: string;
  schulName: string;
  schulStadt: string;
  kindName: string;
  geburtsdatum: string;
  dauer: string;
  createdAt: Date;
  status: 'Neu' | 'Bestätigt' | 'Archiviert';
}

export interface AgentStatus {
  isActive: boolean;
  isConnecting: boolean;
  lastError: string | null;
}
