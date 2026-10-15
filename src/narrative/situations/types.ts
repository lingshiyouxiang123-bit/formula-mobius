import type { NarrativeLine, SocialPlacement } from '../types';
import type { VoiceChannel } from '../raceVoiceContext';
import type { SpectatorProfile } from '../social/types';

export type Topic = 'duel' | 'tires' | 'incident' | 'paddock';
export type Stance = 'neutral' | 'support' | 'critical' | 'curious';
export interface WorldFact {
  id: string;
  subjectId: string;
  predicate: string;
  value: string | number | boolean;
  unit?: string;
  round: number;
  source: 'event' | 'state' | 'observation' | 'broadcast' | 'telemetry' | 'radio';
  sourceLabel?: string;
  visibility: 'public' | 'own' | 'intel';
  eventIds: number[];
}
export interface Situation {
  id: string;
  topic: Topic;
  round: number;
  subjectIds: string[];
  facts: WorldFact[];
  importance: number;
  focus: string;
}
export interface Observation {
  driverId: string;
  round: number;
  wear?: 'low' | 'high';
  ers?: 'low' | 'high';
  defense?: 'low' | 'available';
  sources?: Partial<Record<'wear' | 'ers' | 'defense', string>>;
  resourceRounds?: Partial<Record<'wear' | 'ers' | 'defense', number>>;
  pitStops?: number;
  stintStartRound?: number;
  ersUses?: number;
  deployStreak?: number;
  recoveryStreak?: number;
}
export interface HeardRadio { id: string; driverId: string; round: number; text: string; resource: 'wear' | 'ers' | 'defense' | 'heat'; tag: string }
export interface VoiceMemory {
  session: string;
  sampledRound: number;
  observations: Record<string, Observation>;
  published: WorldFact[];
  spoken: Record<string, number>;
  sequence: number;
  focusDriverId?: string;
  heardRadio?: HeardRadio[];
  radioRounds?: Record<string, number>;
}
export interface SpeakerView {
  situation: Situation;
  channel: VoiceChannel;
  facts: WorldFact[];
  tags: string[];
  slots: Record<string, string | number>;
  intelRound?: number;
}
export interface MessagePlan extends SpeakerView {
  act: string;
  stance: Stance;
  persona: string;
  standaloneOnly?: boolean;
  oneUtterance?: boolean;
  preferredTags: string[];
  actor?: SpectatorProfile;
  recalls?: {self:string[];parent:string[]};
  parent?: { id: string; act: string; stance: Stance; tags?:string[] };
}
export interface Fragment {
  id: string;
  role: 'claim' | 'reaction' | 'suggestion' | 'reply' | 'stall';
  topics: string[];
  channels: string[];
  act: string;
  stance: Stance;
  requires: string[];
  personas?: string[];
  replyToActs?: string[];
  text: string;
  family: string;
  provenance: string;
  sourceId?: string;
  expresses?: string[];
  replyToTags?: string[];
  socialPlacement?: SocialPlacement;
  styles?: SpectatorProfile['style'][];
  knowledge?: SpectatorProfile['knowledge'][];
  recalls?: {by:'self'|'parent';tags:string[]};
  /** Executable slot conditions. Writer notes/LLM 'knows' strings are not runtime predicates. */
  when?: Array<{field:string;op:'present'|'eq'|'ne'|'gt'|'gte'|'lt'|'lte';value?:string|number;otherField?:string}>;
}
export interface ComposedMessage {
  text: string;
  fragments: Fragment[];
  factIds: string[];
}
export type RecentLines = Pick<NarrativeLine, 'text' | 'family' | 'templateId'>[];
