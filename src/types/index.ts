export interface Participant {
  id: number;
  name: string;
  displayName?: string;
  isRegistered?: boolean;
  registeredAt?: string | null;
}

export interface DrawStatus {
  isDrawn: boolean;
  totalParticipants: number;
  registeredCount: number;
  drawnAt: string | null;
  verificationHash: string | null;
}

export interface CurrentUser {
  authenticated: boolean;
  isAdmin: boolean;
  participant: {
    id: number;
    name: string;
    displayName?: string;
  } | null;
}

export type AppPhase = 'phase1_onboarding' | 'phase2_lobby' | 'phase3_safedial' | 'phase4_reveal';

export interface Keyword {
  word: string;
  emoji: string;
}

export interface AssignmentData {
  isDrawn: boolean;
  partner?: {
    id: number;
    name: string;
    displayName?: string;
  };
  teaser?: {
    sentence: string;
    keywords: Keyword[];
  };
}
