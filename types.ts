export enum CallState {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
  ERROR = 'ERROR'
}

export interface LogEntry {
  source: 'user' | 'bot' | 'system';
  message: string;
  timestamp: Date;
}

export interface SickNote {
  schoolId: string;
  city: string;
  schoolName: string;
  childName: string;
  dateOfBirth: string;
  sickUntil: string;
  status: 'collected' | 'school_notified';
}