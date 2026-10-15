import corpus from '../../../research/text-generation/rp/2026-10-10/g1-fragments.json';
import collisionCorpus from '../../../research/text-generation/rp/2026-10-10/collision-fragments.json';
import paddockCorpus from '../../../research/text-generation/rp/2026-10-10/g2-paddock-fragments.json';
import looseCorpus from '../../../research/text-generation/rp/2026-10-11/g2-loose-fragments.json';
import societyCorpus from '../../../research/text-generation/rp/2026-10-11/g3-society-fragments.json';
import review from '../../../research/text-generation/rp/2026-10-11/social-quality-review.json';
import drsCorpus from '../../../research/text-generation/rp/2026-10-13/drs-fragments.json';
import worldDownloaded from '../../../research/text-generation/rp/2026-10-14/downloaded-world-fragments.json';
import worldThreads from '../../../research/text-generation/rp/2026-10-14/world-thread-fragments.json';
import worldBatch01 from '../../../research/text-generation/rp/2026-10-15/world-social-batch-01.json';
import worldPaddockBulk from '../../../research/text-generation/rp/2026-10-15/world-social-paddock-bulk.json';
import worldRacingExtra from '../../../research/text-generation/rp/2026-10-15/world-social-racing-extra.json';
import worldRaceCore from '../../../research/text-generation/rp/2026-10-15/world-social-race-core.json';
import type { ComposedMessage, Fragment, MessagePlan, RecentLines } from './types';

export const fragments = [...corpus.fragments, ...collisionCorpus.fragments, ...paddockCorpus.fragments, ...looseCorpus.fragments, ...societyCorpus.fragments, ...drsCorpus.fragments, ...worldDownloaded.fragments, ...worldThreads.fragments, ...worldBatch01.fragments, ...worldPaddockBulk.fragments, ...worldRacingExtra.fragments, ...worldRaceCore.fragments] as Fragment[];
function fill(fragment: Fragment, plan: MessagePlan): string | undefined {
  let missing = false;
  const text = fragment.text.replace(/\{(\w+)\}/g, (_, slot: string) => {
    const matchedIntel = plan.facts.find(f => f.predicate.startsWith('intel_') && fragment.requires.includes(f.predicate));
    const value = slot === 'intelSource' ? matchedIntel?.sourceLabel ?? plan.slots[slot] ?? '赛道表现' : plan.slots[slot];
    if (value === undefined) missing = true;
    return value === undefined ? '' : String(value);
  });
  return missing ? undefined : text;
}
export function fragmentConditionsMatch(fragment:Fragment,plan:Pick<MessagePlan,'slots'>):boolean {
  return (fragment.when??[]).every(condition=>{
    const left=plan.slots[condition.field],right=condition.otherField?plan.slots[condition.otherField]:condition.value;
    if(condition.op==='present')return left!==undefined;
    if(left===undefined||right===undefined)return false;
    if(condition.op==='eq')return left===right;
    if(condition.op==='ne')return left!==right;
    if(typeof left!=='number'||typeof right!=='number')return false;
    return condition.op==='gt'?left>right:condition.op==='gte'?left>=right:condition.op==='lt'?left<right:left<=right;
  });
}
function compatibilityReason(f:Fragment,plan:MessagePlan):string|undefined {
  if(!f.topics.includes(plan.situation.topic)||!f.channels.includes(plan.channel))return 'topic_or_channel';
  const qualifying=f.requires.some(tag=>['qualifying_result','pole_result','qualifying_front','qualifying_midfield','qualifying_back','pit_lane_start'].includes(tag));
  const declaresPhase=f.requires.some(tag=>['before_start','race_live','race_finished'].includes(tag));
  if(qualifying&&!declaresPhase&&(plan.tags.includes('race_live')||plan.tags.includes('race_finished')))return 'event_phase';
  if(plan.standaloneOnly&&(f.socialPlacement==='discussion'||f.replyToActs?.length||f.replyToTags?.length))return 'needs_parent';
  if(plan.channel==='social'&&(review.excludedIds.includes(f.id)||review.downloadedExcludedSourceIds.includes(f.sourceId??'')))return 'excluded_source';
  if(f.personas?.length&&!f.personas.includes(plan.persona))return 'persona';
  if(f.recalls&&!f.recalls.tags.some(tag=>plan.recalls?.[f.recalls!.by].includes(tag)))return 'missing_memory';
  if(f.stance!=='neutral'&&f.stance!==plan.stance)return 'stance';
  if(!f.requires.every(tag=>plan.tags.includes(tag)))return 'required_facts';
  if(!fragmentConditionsMatch(f,plan))return 'slot_condition';
  if(fill(f,plan)===undefined)return 'missing_slot';
}
export function compatibleFragments(plan:MessagePlan):Fragment[] {
  return fragments.filter(f=>!compatibilityReason(f,plan));
}
function routeReason(f:Fragment,plan:MessagePlan):string|undefined {
  if(!plan.parent)return (f.role==='claim'||f.role==='stall'||plan.channel==='social'&&f.role==='reaction')
    &&f.requires.some(tag=>plan.preferredTags.includes(tag))?undefined:'primary_topic';
  const resultComment=plan.situation.topic==='paddock'&&plan.parent.act==='report'&&!f.replyToActs?.length&&(f.role==='claim'||f.role==='reaction')
    &&(plan.parent.tags?.includes('race_classification')&&f.requires.some(tag=>tag==='team_result'||tag==='race_result')
      ||plan.parent.tags?.includes('qualifying_position')&&plan.tags.includes('before_start')&&f.requires.includes('qualifying_result'));
  const reply=(f.role==='reply'||(f.role==='claim'||f.role==='reaction')&&!!f.replyToTags?.length)&&f.replyToActs?.includes(plan.parent.act);
  if(!reply&&!resultComment)return 'parent_act_or_role';
  if(f.act!==plan.act)return 'planned_act';
  if(f.replyToTags?.length&&!f.replyToTags.some(tag=>plan.parent!.tags?.includes(tag)))return 'parent_semantics';
}
export function messageCandidates(plan:MessagePlan,pool=compatibleFragments(plan)):Fragment[] {
  return pool.filter(fragment=>!routeReason(fragment,plan));
}
/** Manual diagnostics use exactly the same filters and route as composition, without publishing. */
export function explainMessageCandidates(plan:MessagePlan,recent:RecentLines=[]) {
  const rejected:Record<string,number>={};let candidates=0;
  for(const fragment of fragments){
    const reason=compatibilityReason(fragment,plan)??routeReason(fragment,plan)
      ??(plan.channel==='social'&&recent.slice(-48).some(line=>line.text===fill(fragment,plan))?'recent_text':undefined);
    if(reason)rejected[reason]=(rejected[reason]??0)+1;else candidates++;
  }
  return {total:fragments.length,candidates,rejected};
}
export function composeMessage(plan: MessagePlan, recent: RecentLines, seed: number): ComposedMessage | undefined {
  let rng = seed >>> 0;
  const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  const candidates = compatibleFragments(plan);
  const selected: Fragment[] = [];
  const pick = (pool: Fragment[], focused = false) => {
    const freshPool = plan.channel==='social' ? pool.filter(f=>!recent.slice(-48).some(line=>line.text===fill(f,plan))) : pool;
    const ranked = freshPool.map(f => ({ fragment: f, score:
      (focused ? f.requires.filter(t => plan.preferredTags.includes(t)).length * 12 : 0)
      + (f.act === plan.act ? 3 : 0)
      + (f.provenance === 'downloaded' ? 2 : 0)
      + (plan.actor&&f.styles?.includes(plan.actor.style)?4:0)
      + (plan.actor&&f.knowledge?.includes(plan.actor.knowledge)?2:0)
      - (recent.slice(-8).some(l => l.family?.split('+').includes(f.family)) ? 9 : 0)
      - (recent.slice(-12).some(l => l.templateId.split('+').includes(f.id)) ? 10 : 0)
      - (recent.slice(-12).some(l => l.text === fill(f, plan) || l.text.includes(fill(f, plan)!)) ? 18 : 0)
      })).sort((a, b) => b.score - a.score);
    // Draw among compatible alternatives, rather than forever taking the same top-scoring wording.
    const shortlist = ranked.filter(item => item.score >= (ranked[0]?.score ?? 0) - 7);
    return shortlist[Math.floor(random() * shortlist.length)]?.fragment;
  };
  if (plan.parent) {
    const reply = pick(messageCandidates(plan,candidates),true);
    if (reply) selected.push(reply);
  } else {
    // A claim must realise the chosen topic, not merely an unrelated live-state tag.
    const primary = pick(messageCandidates(plan,candidates),true);
    if (primary) selected.push(primary);
    // Usually one utterance. A second fragment is optional, not a mandatory concluding sentence.
    if (primary && !plan.oneUtterance && primary.role !== 'stall' && plan.persona !== 'team_staff' && random() < (plan.channel === 'engineer' ? 0.4 : 0.18)) {
      const addon = pick(candidates.filter(f => ((f.role === 'reaction' || f.role === 'suggestion') && f.act === plan.act
        || f.role === 'claim' && plan.channel !== 'social' && f.requires.some(t => t.startsWith('intel_')) && !primary.requires.some(t => t.startsWith('intel_')))
        && f.family !== primary.family
        && (f.requires.length > 0 || f.stance === plan.stance)));
      if (addon) selected.push(addon);
    }
  }
  if (!selected.length) return undefined;
  let text = selected.map(f => fill(f, plan)!).join(' ');
  const claimedTags = new Set(selected.flatMap(f => f.requires));
  const usedIntel = plan.facts.filter(f => f.predicate.startsWith('intel_') && f.predicate !== 'intel_pending' && claimedTags.has(f.predicate));
  plan.intelRound = usedIntel.length ? Math.min(...usedIntel.map(f => f.round)) : undefined;
  if (plan.intelRound !== undefined && plan.intelRound < plan.situation.round) text = `${plan.situation.round - plan.intelRound}回合前的消息：${text}`;
  // The parent's act follows what this line actually says, not an unrealised desired reaction.
  if (!plan.parent && !selected.some(f => (f.role === 'reaction' || f.role === 'suggestion') && f.act === plan.act)) {
    plan.act = selected[0].act;
    plan.stance = selected[0].stance;
  }
  const usedSlots = new Set(selected.flatMap(f => [...f.text.matchAll(/\{(\w+)\}/g)].map(match => match[1])));
  for(const f of selected)for(const condition of f.when??[]){usedSlots.add(condition.field);if(condition.otherField)usedSlots.add(condition.otherField);}
  return { text, fragments: selected, factIds: plan.facts.filter(f => claimedTags.has(f.predicate) || usedSlots.has(f.predicate)).map(f => f.id) };
}
