import type { Stance } from '../situations/types';

export interface SpectatorProfile {
  id: string;
  name: string;
  persona: string;
  supportsDriverId?: string;
  supportsTeamId?: string;
  knowledge: 'casual' | 'informed';
  style: 'blunt' | 'fragmented' | 'chatty';
  focus: 'results' | 'strategy' | 'incidents';
  motive: 'loyal' | 'curious' | 'banter';
  activity: number;
  stubborn: boolean;
}

export interface SocialOpinion {
  revision?: number;
  lineId: string;
  raceId: string;
  round: number;
  subjectIds: string[];
  act: string;
  stance: Stance;
  tags: string[];
  text: string;
  sourceId?: string;
}

export interface SocialRumor {
  id: string;
  raceId: string;
  session: string;
  subjectId: string;
  kind: 'pit_guess' | 'retirement_guess';
  authorId: string;
  originId: string;
  createdRound: number;
  deadlineRound: number;
  observedProgress: number;
  sourceIds: string[];
  participantIds: string[];
  spreadIds: string[];
  status: 'unconfirmed' | 'confirmed' | 'wrong';
  resolvedRound?: number;
  correctionId?: string;
  doubledDown?: boolean;
}

/** Small in-save social state. No timers, external log or game RNG. */
export interface SocialMemory {
  worldId: string;
  raceId: string;
  session: string;
  revision: number;
  profiles: Record<string, SpectatorProfile>;
  opinions: Record<string, SocialOpinion[]>;
  relations: Record<string, number>;
  rumors: SocialRumor[];
  observedIds: string[];
  processedRound?: number;
  lastEchoRound?: number;
}
