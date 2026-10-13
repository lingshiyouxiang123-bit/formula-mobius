import type { GameState } from '../../game/types';
import type { DialogueSession } from '../../nlg';
import type { NarrativeLine, RaceNarrative } from '../types';
import { composeMessage } from './composer';
import { spectatorIdentity } from '../social/paddock';
import {applySocialVoice,actorAccount} from '../social/society';
import type {SocialMemory} from '../social/types';
import { collectSituations, liveSituation, prepareMemory, raceActive, sameCrew, speakerView } from './world';
import type { MessagePlan, Situation, SpeakerView, Stance, VoiceMemory } from './types';

const speakers: Record<string, string> = { commentator: '现场解说', engineer: '比赛工程师', fan: '看台小旗', technical_fan: '分段计时', ordinary_viewer: '弯心路人', troll: '反向看台' };
export function planMessage(view: SpeakerView, persona: string, preferredTags = [view.situation.focus], act?: string, stance?: Stance): MessagePlan {
  const negative = view.tags.some(t => ['retired', 'own_tire_danger', 'control_stop'].includes(t));
  const concern = negative || view.tags.some(tag => ['pit_entry', 'tire_worn', 'yellow', 'control_neutral'].includes(tag));
  const chosenAct = act ?? (persona === 'engineer' ? negative ? 'warn' : 'report' : persona === 'commentator' ? 'report'
    : persona === 'fan' ? concern ? 'concern' : 'praise' : persona === 'troll' ? 'challenge' : 'ask');
  return { ...view, persona, act: chosenAct, stance: stance ?? (persona === 'fan' || chosenAct === 'opportunity' ? 'support' : persona === 'troll' || chosenAct === 'warn' ? 'critical' : chosenAct === 'ask' ? 'curious' : 'neutral'), preferredTags };
}
export function lineFor(game: GameState, plan: MessagePlan, recent: NarrativeLine[], memory: VoiceMemory, society?:SocialMemory): NarrativeLine | undefined {
  const seed=(game.initialSeed ?? 905) + memory.sequence++ * 97 + game.round * 11;
  if(!applySocialVoice(plan,recent,seed,society))return;
  const composed = composeMessage(plan, recent, seed);
  if (!composed) return undefined;
  const eventIds = [...new Set(plan.situation.facts.flatMap(f => f.eventIds))];
  return { id: `${plan.situation.id}:${plan.channel}:${memory.sequence}`, round: plan.situation.round, speaker: speakers[plan.persona], text: composed.text,
    kind: plan.channel === 'social' ? 'opinion' : plan.act === 'opportunity' || plan.act === 'warn' ? 'advice' : 'fact',
    factIds: composed.factIds, eventIds, templateId: composed.fragments.map(f => f.id).join('+'), family: composed.fragments.map(f => f.family).join('+'),
    provenance: [...new Set(composed.fragments.map(f => f.provenance))].join('+'), ...(plan.parent ? { replyToId: plan.parent.id } : {}),
    ...(plan.channel==='social'?{socialPlacement:plan.parent?'discussion' as const:composed.fragments.find(f=>f.socialPlacement)?.socialPlacement??'either' as const}:{}),
    ...(plan.channel === 'social' ? { ...(plan.actor?{speaker:plan.actor.name,account:actorAccount(plan.actor)}:spectatorIdentity(plan.persona,plan.situation.subjectIds[0],String(plan.slots.driver??''))), socialContext: { situation: plan.situation, channel: plan.channel, facts: plan.facts, tags: plan.tags, slots: plan.slots } } : {}),
    plan: { topic: plan.situation.topic, act: plan.act, stance: plan.stance, subjectIds: plan.situation.subjectIds,
      fragmentIds: composed.fragments.map(f => f.id), expresses: composed.fragments.flatMap(f => f.expresses ?? []), ...(plan.intelRound !== undefined ? { intelRound: plan.intelRound } : {}) } };
}

function contactReplies(game:GameState, view:SpeakerView, parent:NarrativeLine, lines:NarrativeLine[], memory:VoiceMemory, recent:()=>NarrativeLine[], society?:SocialMemory) {
  let current=parent;
  for(let depth=0;depth<2;depth++) {
    for(const [persona,act,stance] of [['fan','challenge','critical'],['ordinary_viewer','challenge','critical'],['technical_fan','challenge','critical'],['ordinary_viewer','agree','support'],['ordinary_viewer','ask','curious']] as const) {
      const plan=planMessage(view,persona,['contact'],act,stance);
      plan.parent={id:current.id,act:current.plan!.act,stance:current.plan!.stance,tags:current.plan?.expresses};
      const reply=lineFor(game,plan,recent(),memory,society);
      if(!reply)continue;
      if(reply.account?.id===current.account?.id)continue;
      lines.push(reply);current=reply;break;
    }
  }
}

export function syncSituations(state: RaceNarrative, game: GameState, fresh: RaceNarrative['events']) {
  state.voiceMemory = prepareMemory(game, state.voiceMemory);
  const memory = state.voiceMemory;
  const handled = { commentary: new Set<number>(), social: new Set<number>() };
  const situations = collectSituations(game, fresh);
  const previousSocialCount=state.social.length;
  const socialRecent=()=>[...state.social.slice(0,previousSocialCount),...(state.socialQueue??[]).map(item=>item.line),...state.social.slice(previousSocialCount)];
  // State changes can create a useful topic without needing a bespoke log event.
  if (raceActive(game) && game.phase === 'strategy') {
    const own = game.drivers.find(d => d.id === game.humanDriverId)!;
    const front = game.drivers.filter(d => d.id !== own.id && d.status === 'racing' && !d.pit && d.progress >= own.progress)
      .sort((a, b) => a.progress - b.progress)[0];
    const nearbyKey = `ambient:duel:${front?.id}`;
    if (own.status === 'racing' && !own.pit && game.raceControl === 'green' && front && front.progress - own.progress <= 8
      && game.round - (memory.spoken[nearbyKey] ?? -3) >= 3 && !situations.some(s => s.topic === 'duel')) {
      situations.push(liveSituation(game, 'duel', front.id, own.id)); memory.spoken[nearbyKey] = game.round;
    }
    const tireKey = `ambient:tires:${own.id}`;
    if (own.status === 'racing' && !own.pit && memory.observations[own.id]?.wear === 'high' && game.round - (memory.spoken[tireKey] ?? -3) >= 3) {
      situations.push(liveSituation(game, 'tires', own.id)); memory.spoken[tireKey] = game.round;
    }
  }
  for (const situation of situations) {
    for (const channel of ['commentary', 'social'] as const) {
      const eventIds = situation.facts.flatMap(f => f.eventIds);
      const key = `${channel}:${situation.id}:${situation.focus}`;
      // Duplicate logs of the same incident remain in the game log but do not become duplicate broadcasts.
      if (memory.spoken[key] !== undefined) { eventIds.forEach(id => handled[channel].add(id)); continue; }
      const view = speakerView(game, situation, channel, memory);
      const lines = state[channel];
      const preferredTags = channel === 'social' && view.tags.includes('published_intel') ? [situation.focus, 'published_intel'] : [situation.focus];
      const plan = situation.focus === 'contact' && channel === 'social'
        ? planMessage(view, 'fan', ['contact', ...(view.tags.includes('same_team') ? ['same_team'] : [])], 'support', 'support')
        : planMessage(view, channel === 'commentary' ? 'commentator' : memory.sequence % 3 === 0 ? 'technical_fan' : 'fan', preferredTags);
      const root = lineFor(game, plan, channel==='social'?socialRecent():lines, memory,state.socialMemory);
      if (!root) continue; // Existing downloaded/whole-sentence pipeline is the fallback.
      lines.push(root); memory.spoken[key] = game.round;
      eventIds.forEach(id => handled[channel].add(id));
      if (channel === 'commentary') {
        // Only the intelligence actually verbalised in this public line becomes available to viewers.
        for (const fact of view.facts) if (fact.visibility === 'intel' && root.factIds.includes(fact.id)) {
          memory.published = memory.published.filter(previous => previous.id !== fact.id);
          memory.published.push({ ...fact, source: 'broadcast', visibility: 'public' });
        }
        memory.published = memory.published.slice(-12);
      } else {
        if (situation.focus === 'contact') {
          contactReplies(game,view,root,lines,memory,socialRecent,state.socialMemory);
          for (const [persona, act, stance] of [['technical_fan', 'challenge', 'critical'], ['ordinary_viewer', 'challenge', 'critical']] as const) {
            const comment = lineFor(game, planMessage(view, persona, ['contact'], act, stance), socialRecent(), memory,state.socialMemory);
            if (comment) {
              lines.push(comment);
              contactReplies(game,view,comment,lines,memory,socialRecent,state.socialMemory);
            }
          }
          continue;
        }
        // Reply to this particular parent's act and stance, not to a preselected template ID.
        const replyAct = plan.act === 'praise' ? 'agree' : plan.act === 'ask' ? 'challenge' : 'ask';
        const replyPlan = planMessage(view, replyAct === 'agree' ? 'fan' : 'ordinary_viewer', plan.preferredTags, replyAct, replyAct === 'agree' ? 'support' : 'curious');
        replyPlan.parent = { id: root.id, act: plan.act, stance: plan.stance, tags:root.plan?.expresses };
        if (memory.sequence % 3 !== 0) {
          const reply = lineFor(game, replyPlan, socialRecent(), memory,state.socialMemory);
          if (reply) lines.push(reply);
        }
      }
    }
    const radioKey = `radio:${situation.topic}:${situation.focus}:${situation.subjectIds[0] ?? 'race'}`;
    if (game.round - (memory.spoken[radioKey] ?? -3) >= 3) {
      const radio = eventRadioLines(game, situation, memory, state.radio);
      if (radio.length) { state.radio.push(...radio); memory.spoken[radioKey] = game.round; }
    }
  }
  return handled;
}

export function situationAdvice(game: GameState, previous?: VoiceMemory): NarrativeLine[] {
  if (!raceActive(game)) return [];
  const memory = prepareMemory(game, structuredClone(previous));
  const own = game.drivers.find(d => d.id === game.humanDriverId)!;
  if (own.status !== 'racing' || own.pit || own.wear >= 9 || own.heat >= 4 || own.brakeHeat >= 3 || game.raceControl !== 'green') return [];
  const front = game.drivers.filter(d => d.id !== own.id && d.status === 'racing' && !d.pit && d.progress >= own.progress)
    .sort((a, b) => a.progress - b.progress || a.qualifyingRank - b.qualifyingRank)[0];
  if (!front || front.progress - own.progress > 8) return [];
  const situation = liveSituation(game, 'duel', front.id, own.id);
  const view = speakerView(game, situation, 'engineer', memory);
  const opportunity = view.tags.filter(tag => ['intel_wear_high', 'intel_ers_low', 'intel_defense_low'].includes(tag));
  if (!opportunity.length) return [];
  const line = lineFor(game, planMessage(view, 'engineer', opportunity, 'opportunity'), [], memory);
  if (!line) return [];
  // Information is a hint; accepting the draft is still a player's action.
  return [{ ...line, id: `${game.id}:${game.raceSession ?? 'race'}:${game.round}:opportunity:${front.id}`,
    templateId: `opportunity:${front.id}`, patch: { mode: 'attack', deployErs: own.ers > 0 } }];
}

export function composeOwnAlert(game: GameState, key: string, previous?: VoiceMemory): string | undefined {
  const tags = ({ pit: 'own_tire_danger', wear: 'tire_worn', heat: 'own_heat_high' } as Record<string, string>);
  if (!tags[key]) return undefined;
  const memory = prepareMemory(game, structuredClone(previous));
  const situation = liveSituation(game, 'tires', game.humanDriverId);
  const view = speakerView(game, situation, 'engineer', memory);
  // Wear 6-8 is a useful own observation although it is only a medium public band.
  const own = game.drivers.find(d => d.id === game.humanDriverId)!;
  if (key === 'wear' && own.wear >= 6) view.tags.push('tire_worn');
  return composeMessage(planMessage(view, 'engineer', [tags[key]], key === 'wear' ? 'report' : 'warn'), [], (game.initialSeed ?? 905) + game.round * 97)?.text;
}

export function engineerSituationReply(session: DialogueSession, text: string, game: GameState, previous?: VoiceMemory, targetId?:string) {
  if (!raceActive(game)) return undefined;
  if (/寿命|还能.*弯|几个弯|多少弯/.test(text)) return undefined;
  const asksResource = /ERS|电量|电池|防守|胎耗|磨损/i.test(text);
  const asksGap = /前车|后车|差多少|车距/.test(text);
  if (!asksResource && !asksGap && !/他呢|他还有|她还有|继续跟进/.test(text)) return undefined;
  const memory = prepareMemory(game, structuredClone(previous ?? session.voiceMemory));
  memory.focusDriverId = session.voiceMemory?.session === memory.session ? session.voiceMemory.focusDriverId : memory.focusDriverId;
  const own = game.drivers.find(d => d.id === game.humanDriverId)!;
  const ordered = game.drivers.filter(d => d.status !== 'dnf' && !d.pit).slice().sort((a, b) => b.progress - a.progress || a.qualifyingRank - b.qualifyingRank);
  const index = ordered.findIndex(d => d.id === own.id);
  const named = game.drivers.find(d => text.includes(d.profile.name) || (d.profile.abbreviation.length >= 2 && text.toLowerCase().includes(d.profile.abbreviation.toLowerCase())))
    ?? (/队友|另一辆|第二辆/.test(text) ? game.drivers.find(d => d.id !== own.id && sameCrew(game, d.id)) : undefined);
  const pronoun = /他|她|继续跟进/.test(text) ? game.drivers.find(d => d.id === memory.focusDriverId) : undefined;
  const target = (targetId ? game.drivers.find(d=>d.id===targetId) : undefined) ?? named ?? pronoun ?? (/后车/.test(text) ? ordered[index + 1] : /前车/.test(text) ? ordered[index - 1] : undefined);
  if (!target || target.id === own.id) return undefined;
  memory.focusDriverId = target.id;
  // All opponent resource fragments share the duel topic; own tyre arithmetic remains separate.
  const situation = liveSituation(game, 'duel', target.id, own.id);
  const view = speakerView(game, situation, 'engineer', memory);
  const query = /ERS|电量|电池/i.test(text) ? 'ers' : /防守/.test(text) ? 'defense' : /胎耗|磨损/.test(text) ? 'wear' : 'gap';
  view.tags.push(`query_${query}`);
  if (query === 'gap' && !view.tags.includes('gap')) view.tags.push('intel_pending');
  const preferred = query === 'gap' ? ['query_gap'] : sameCrew(game, target.id) ? ['team_telemetry']
    : view.tags.includes('intel_pending') ? ['intel_pending'] : view.tags.filter(tag => tag.startsWith(`intel_${query}_`));
  if (!preferred.length) { view.tags.push('intel_pending'); preferred.push('intel_pending'); }
  const sources = memory.observations[target.id]?.sources;
  if (sources) view.slots.intelSource = sources[query as 'wear' | 'ers' | 'defense'] ?? '赛道表现';
  // A focused resource question must not be answered with an unrelated resource's hint.
  if (query !== 'gap' && !sameCrew(game, target.id)) view.tags = view.tags.filter(tag => !tag.startsWith('intel_')
    || ['intel_pending', 'intel_delayed', ...preferred].includes(tag));
  const recent = session.turns.filter(t => t.role === 'assistant').slice(-8).map(t => ({ text: t.text, templateId: '', family: '' }));
  const plan = planMessage(view, 'engineer', preferred, view.tags.includes('intel_pending') ? 'wait' : 'report');
  const composed = composeMessage(plan, recent, session.rngState + session.variantIndex * 97);
  if (!composed) return undefined;
  const usedRadio = plan.facts.find(f => f.source === 'radio' && composed.factIds.includes(f.id));
  const radio = usedRadio ? memory.heardRadio?.findLast(message => message.driverId === target.id && usedRadio.predicate.startsWith(`intel_${message.resource}_`)) : undefined;
  const usedSource = plan.facts.find(f => f.predicate.startsWith('intel_') && composed.factIds.includes(f.id))?.sourceLabel;
  return { text: composed.text, factIds: composed.factIds, targetId: target.id, memory, plan,
    fragmentIds: composed.fragments.map(f => f.id), details: sameCrew(game, target.id) ? '本队遥测，包含队友。'
      : `依据${usedSource ?? '赛道计时'}作粗略判断，不是对手遥测。${radio ? `听到的无线电（R${radio.round}）：${radio.text}` : ''}` };
}

export function eventRadioLines(game: GameState, situation: Situation, memory: VoiceMemory, recent: NarrativeLine[]): NarrativeLine[] {
  if (!raceActive(game) || situation.topic !== 'incident') return [];
  if (situation.focus === 'retired' && !situation.subjectIds.includes(game.humanDriverId)) return [];
  if (situation.focus === 'yellow' && situation.subjectIds.length && !situation.subjectIds.includes(game.humanDriverId)) return [];
  const view = speakerView(game, situation, 'engineer', memory);
  const line = lineFor(game, planMessage(view, 'engineer', [situation.focus], 'warn'), recent, memory);
  return line ? [line] : [];
}
