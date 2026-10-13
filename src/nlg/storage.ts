import { createDialogueSession } from "./engine";
import type { DialogueSession, NlgPersonaId } from "./types";

export const DIALOGUE_STORAGE_KEY = "f1game.dialogues.v1";

export function loadDialogueSession(persona: NlgPersonaId = "engineer"): DialogueSession {
  if (typeof window === "undefined") return createDialogueSession(persona);
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DIALOGUE_STORAGE_KEY) ?? "null") as Partial<DialogueSession> | null;
    if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.turns) || typeof parsed.rngState !== "number") return createDialogueSession(persona);
    const knownPersonas: NlgPersonaId[] = ["engineer", "rules", "reporter", "fan", "skeptic", "supporter", "playful"];
    const savedPersona = knownPersonas.includes(parsed.persona as NlgPersonaId) ? parsed.persona as NlgPersonaId : persona;
    return { ...createDialogueSession(savedPersona), ...parsed, persona: savedPersona, variantIndex: parsed.variantIndex ?? 0, turns: parsed.turns.slice(-80) } as DialogueSession;
  } catch {
    return createDialogueSession(persona);
  }
}

export function saveDialogueSession(session: DialogueSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DIALOGUE_STORAGE_KEY, JSON.stringify({ ...session, turns: session.turns.slice(-80) }));
}

export function clearDialogueSession(): DialogueSession {
  if (typeof window !== "undefined") window.localStorage.removeItem(DIALOGUE_STORAGE_KEY);
  return createDialogueSession();
}
