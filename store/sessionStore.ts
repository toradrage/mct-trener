import { create } from 'zustand';

export type Disorder = 'GAD' | 'Depresjon' | 'PTSD' | 'OCD';
export type DifficultyLevel = 1 | 2 | 3;

export interface Message {
  sender: 'therapist' | 'patient';
  text: string;
  timestamp: number;
  interventionType?: string; // Hvilken intervensjon meldingen er knyttet til
}

export interface InterventionEvent {
  type: string;
  payload?: any;
  timestamp: number;
}

export interface PatientState {
  beliefUncontrollability: number; // 0-100
  beliefDanger: number; // 0-100
  beliefPositive: number; // 0-100
  mood?: string;
  [key: string]: any;
}

export type SessionStatus = 'not-started' | 'in-progress' | 'finished';

export interface SessionState {
  sessionId: string;
  disorder: Disorder;
  difficultyLevel: DifficultyLevel;
  avatarProfile: string;
  goals: string[];
  messages: Message[];
  interventions: InterventionEvent[];
  patientState: PatientState;
  sessionStatus: SessionStatus;
  setSession: (data: Partial<SessionState>) => void;
  addMessage: (msg: Message) => void;
  addIntervention: (event: InterventionEvent) => void;
  setPatientState: (state: Partial<PatientState>) => void;
  setSessionStatus: (status: SessionStatus) => void;
}

export const useSessionStore = create<SessionState>((set: (fn: (state: SessionState) => Partial<SessionState> | SessionState) => void) => ({
  sessionId: '',
  disorder: 'GAD',
  difficultyLevel: 1,
  avatarProfile: '',
  goals: [],
  messages: [],
  interventions: [],
  patientState: {
    beliefUncontrollability: 80,
    beliefDanger: 50,
    beliefPositive: 30,
    mood: 'neutral',
  },
  sessionStatus: 'not-started',
  setSession: (data: Partial<SessionState>) => set((state: SessionState) => ({ ...state, ...data })),
  addMessage: (msg: Message) => set((state: SessionState) => ({ messages: [...state.messages, msg] })),
  addIntervention: (event: InterventionEvent) => set((state: SessionState) => ({ interventions: [...state.interventions, event] })),
  setPatientState: (newState: Partial<PatientState>) => set((state: SessionState) => ({ patientState: { ...state.patientState, ...newState } })),
  setSessionStatus: (status: SessionStatus) => set(() => ({ sessionStatus: status })),
}));
