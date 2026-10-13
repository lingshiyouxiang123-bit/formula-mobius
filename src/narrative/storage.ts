import type { RaceNarrative } from "./engine";
import {reviewRaceNarrative} from './social/review';
import type {GameState} from '../game/types';
import {latestSocialMemory,mergeSocialMemory,socialWorldId} from './social/society';
import type {SocialMemory} from './social/types';
const KEY = "f1game.narrative.v1";
export function loadSocialHistory(game:GameState,records:Record<string,RaceNarrative>):SocialMemory|undefined {
  const base=latestSocialMemory(records,game);
  if(typeof window==='undefined')return base;
  try {
    const local=JSON.parse(localStorage.getItem('f1game.x-social-local-v1')??'{}').socialMemories?.[socialWorldId(game)] as SocialMemory|undefined;
    return base?mergeSocialMemory(base,local):local;
  }catch{return base;}
}
export function loadNarratives(): Record<string, RaceNarrative> {
  if (typeof window === "undefined") return {};
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return Object.fromEntries(Object.entries(value).filter(([,v]) => {
      if (!v || typeof v !== "object") return false;
      const record = v as RaceNarrative;
      return record.version === 1 && typeof record.raceId === "string" && Number.isFinite(record.processed) && !!record.alerts && !!record.dialogue && Array.isArray(record.dialogue.turns) && [record.events, record.commentary, record.radio, record.social].every(Array.isArray);
    }).map(([id,record])=>[id,reviewRaceNarrative(record as RaceNarrative)])) as Record<string, RaceNarrative>;
  } catch { return {}; }
}
export function saveNarrative(value: RaceNarrative): void {
  if (typeof window === "undefined") return;
  const all = loadNarratives(); all[value.raceId] = value;
  const entries = Object.entries(all).slice(-12);
  localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
}
