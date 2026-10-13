import type { GameState, SeasonState } from "../game/types";
import { createDialogueSession } from "../nlg";
import { narrativeEvents } from "./core/events";
import { engineerAdvice } from "./radio/engineer";
import { addBroadcast, deduplicateBroadcasts } from "./commentary/director";
import { spectatorPost } from "./social/feed";
import {raceVoiceEvent,classificationVoiceEvents} from './raceVoiceEvents';
import {dynamicVoiceLines} from './dynamicVoices';
import { syncSituations } from './situations/runtime';
import { syncSocialNetwork, retainSocialThreads } from './social/network';
import {reviewRaceNarrative} from './social/review';
import {prepareSocialMemory,mergeSocialMemory} from './social/society';
import type {SocialMemory} from './social/types';
import type { RaceNarrative } from "./types";
export type { NarrativeEvent, NarrativeLine, RaceNarrative } from "./types";
export { narrativeEvents } from "./core/events";
export { engineerAdvice, askEngineer } from "./radio/engineer";

export function createNarrative(game: GameState): RaceNarrative { return { version: 1, raceId: game.id, track: game.track.name, events: [], commentary: [], radio: [], social: [], processed: 0, alerts: {}, dialogue: createDialogueSession("engineer", game.initialSeed ?? 905) }; }

export function syncNarrative(input: RaceNarrative | undefined, game: GameState, season?: SeasonState, previousSocialMemory?:SocialMemory): RaceNarrative {
  const state = reviewRaceNarrative(structuredClone(input?.raceId === game.id ? input : createNarrative(game)));
  state.socialMemory=prepareSocialMemory(game,state.socialMemory?mergeSocialMemory(state.socialMemory,previousSocialMemory):previousSocialMemory);
  if (state.raceSession !== (game.raceSession ?? "race")) state.alerts = {};
  state.raceSession = game.raceSession ?? "race";
  const result = game.results.find(result => result.driverId === game.humanDriverId);
  if (game.phase === "finished" && result) state.result = { driverName: game.drivers.find(driver => driver.id === game.humanDriverId)!.profile.name, rank: result.rank, status: result.status, points: result.points };
  const fresh = narrativeEvents(game).filter(e => e.eventIds[0] > state.processed);
  const previousSocialIds = new Set(state.social.map(line => line.id));
  const previousSocialCount = state.social.length;
  const socialRecent=()=>[...state.social.slice(0,previousSocialCount),...(state.socialQueue??[]).map(item=>item.line),...state.social.slice(previousSocialCount)];
  state.events.push(...fresh);
  const handled = syncSituations(state, game, fresh);
  for (const round of [...new Set(fresh.map(e => e.round))]) {
    const events = fresh.filter(e => e.round === round).sort((a,b) => b.importance - a.importance || a.eventIds[0] - b.eventIds[0]);
    for (const event of events) {
      const log=game.logs.find(l=>l.id===event.eventIds[0]);
      const voiceEvent=log?raceVoiceEvent(game,log):null;
      if (!handled.commentary.has(event.eventIds[0])) {
        const commentary=voiceEvent?dynamicVoiceLines(voiceEvent,'commentary',state.commentary,event.eventIds[0]):[];
        if(commentary.length)state.commentary.push(...commentary);else addBroadcast(state.commentary,event);
      }
      if (!handled.social.has(event.eventIds[0])) {
        const social=voiceEvent?dynamicVoiceLines(voiceEvent,'social',socialRecent(),event.eventIds[0]):[];
        if(social.length)state.social.push(...social);
        else {
          const news=spectatorPost(event);
          if(!state.social.some(previous=>previous.templateId==='social.news'&&previous.round>=event.round-2&&previous.text===news.text))state.social.push(news);
        }
      } else if (voiceEvent && state.alerts['social.downloaded-round']!==round) {
        const supplement=dynamicVoiceLines(voiceEvent,'social',socialRecent(),event.eventIds[0],true).slice(0,1);
        if(supplement.length) {state.social.push(...supplement);state.alerts['social.downloaded-round']=round;}
      }
    }
  }
  for(const event of classificationVoiceEvents(game)){
    state.voiceEvents??=[];
    if(state.voiceEvents.includes(event.id))continue;
    state.voiceEvents.push(event.id);
    state.social.push(...dynamicVoiceLines(event,'social',socialRecent(),game.round+state.social.length));
    state.commentary.push(...dynamicVoiceLines(event,'commentary',state.commentary,game.round+state.commentary.length));
  }
  for (const alert of engineerAdvice(game, state.voiceMemory)) {
    if (alert.templateId.startsWith('control-') && state.radio.some(line => line.round === game.round && line.plan?.topic === 'incident')) continue;
    const previous = state.alerts[alert.templateId];
    if (previous === undefined || game.round - previous >= 3) {
      state.radio.push(alert); state.alerts[alert.templateId] = game.round;
    }
  }
  syncSocialNetwork(state, game, fresh, previousSocialIds, season);
  state.commentary = deduplicateBroadcasts(game, state.commentary);
  state.processed = Math.max(state.processed, ...game.logs.map(e => e.id), 0);
  state.events = state.events.slice(-300); state.commentary = state.commentary.slice(-120); state.radio = state.radio.slice(-100); state.social = retainSocialThreads(state.social,220,state.socialQueue?.map(item=>item.line));
  return state;
}
