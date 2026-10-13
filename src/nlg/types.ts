import type { GameState, SeasonState } from "@/game/types";

export type NlgIntent =
  | "greeting" | "goodbye" | "result" | "performance" | "why" | "strategy"
  | "incident" | "rules" | "compare" | "standings" | "development" | "forecast"
  | "agree" | "disagree" | "rephrase" | "follow_up" | "unknown";

export type NlgPersonaId = "engineer" | "rules" | "reporter" | "fan" | "skeptic" | "supporter" | "playful";

export interface NlgFact {
  id: string;
  topic: string;
  subject?: string;
  predicate: string;
  value: string | number | boolean;
  unit?: string;
  certainty: "fact" | "inference" | "opinion" | "forecast";
  sourceEventIds?: number[];
  ruleRef?: string;
  sourcePath?: string;
  sourceDate?: string;
  applicableYears?: string;
  expiresWhen?: string;
  derivedFromFactIds?: string[];
  formula?: string;
  text: string;
}

export interface DialogueTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  normalizedText?: string;
  createdAt: number;
  intent?: NlgIntent;
  topic?: string;
  entityIds?: string[];
  claimFactIds?: string[];
}

export interface DialogueSession {
  schemaVersion: 1;
  id: string;
  persona: NlgPersonaId;
  rngState: number;
  variantIndex: number;
  turns: DialogueTurn[];
  /** Optional gameplay observation/focus memory; older dialogue saves remain valid. */
  voiceMemory?: import('../narrative/situations/types').VoiceMemory;
}

export interface IntentRule {
  intent: NlgIntent;
  keywords: string[];
  weight: number;
}

export interface ResponsePlan {
  intent: NlgIntent;
  topic: string;
  entityIds: string[];
  factIds: string[];
  certainty: NlgFact["certainty"];
  responseAct?: "answer" | "clarify" | "acknowledge" | "challenge";
  tone?: "neutral" | "supportive" | "skeptical";
  lengthBudget?: number;
  fallback?: boolean;
  clarificationOptions?: string[];
}

export interface GrammarRule {
  id: string;
  variants: string[];
}

export interface GeneratedUtterance {
  text: string;
  intent: NlgIntent;
  topic: string;
  entityIds: string[];
  claimFactIds: string[];
  sourceEventIds: number[];
  ruleRefs: string[];
  grammarRuleIds: string[];
  confidence: number;
  certainty: NlgFact["certainty"];
  fallback: boolean;
  clarificationOptions?: string[];
}

export interface NlgGenerationContext {
  facts: NlgFact[];
  persona: NlgPersonaId;
  rngState: number;
  recentAssistantTexts?: string[];
}

export interface NlgContext {
  game?: GameState | null;
  season?: SeasonState | null;
  visibility?: "public";
}
