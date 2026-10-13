import type { TurnPlan } from "../game/types";
import type { DialogueSession } from "../nlg";
import type { Topic, Stance, VoiceMemory, SpeakerView } from './situations/types';
import type { SocialMemory, SpectatorProfile } from './social/types';

export interface SocialAccount { id: string; role: 'event' | 'team' | 'viewer' | 'driver'; teamId?: string; supportsDriverId?: string; profile?:SpectatorProfile }
export interface SocialCard { title: string; rows: { driverId: string; name: string; position?: number; status?: string; points?: number; color: string }[] }
export interface SocialTopic { id: string; label: string; group: 'result' | 'qualifying' | 'emotion'; context: SpeakerView; postId?: string }
export type SocialPlacement = 'standalone' | 'discussion' | 'either';
export interface SocialEvolution { kind:'guess'|'spread'|'question'|'confirm'|'correct'|'double_down'|'echo'|'followup'; sourceId:string; rumorId?:string }

export interface NarrativeEvent { id: string; raceId: string; round: number; type: string; importance: number; subjects: string[]; factIds: string[]; eventIds: number[]; ruleRef?: string; text: string }
export interface NarrativeLine { id: string; round: number; speaker: string; text: string; kind: "fact" | "advice" | "opinion"; factIds: string[]; eventIds: number[]; templateId: string; patch?: Partial<TurnPlan>; family?:string; provenance?:string; replyToId?:string; quoteOfId?:string; repostOfId?:string; account?:SocialAccount; card?:SocialCard; socialKind?:'blog'|'update'; topicPostId?:string; socialContext?:SpeakerView; socialPlacement?:SocialPlacement; voiceValues?:Record<string,string|number|boolean>; evolution?:SocialEvolution; plan?: { topic: Topic; act: string; stance: Stance; subjectIds: string[]; fragmentIds: string[]; intelRound?: number; expresses?:string[] } }
export interface RaceNarrative { version: 1; raceId: string; track: string; events: NarrativeEvent[]; commentary: NarrativeLine[]; radio: NarrativeLine[]; social: NarrativeLine[]; processed: number; alerts: Record<string, number>; raceSession?: "sprint" | "race"; dialogue: DialogueSession; draft?: { round: number; raceSession?: "sprint" | "race"; plan: TurnPlan }; result?: { driverName: string; rank: number; status: string; points: number }; voiceEvents?:string[]; voiceMemory?: VoiceMemory; socialMemory?:SocialMemory; socialQueue?:{line:NarrativeLine;dueRound:number}[]; socialTopics?:SocialTopic[] }
