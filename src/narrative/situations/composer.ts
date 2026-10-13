import corpus from '../../../research/text-generation/rp/2026-10-10/g1-fragments.json';
import collisionCorpus from '../../../research/text-generation/rp/2026-10-10/collision-fragments.json';
import paddockCorpus from '../../../research/text-generation/rp/2026-10-10/g2-paddock-fragments.json';
import looseCorpus from '../../../research/text-generation/rp/2026-10-11/g2-loose-fragments.json';
import societyCorpus from '../../../research/text-generation/rp/2026-10-11/g3-society-fragments.json';
import review from '../../../research/text-generation/rp/2026-10-11/social-quality-review.json';
import drsCorpus from '../../../research/text-generation/rp/2026-10-13/drs-fragments.json';
import type { ComposedMessage, Fragment, MessagePlan, RecentLines } from './types';

export const fragments = [...corpus.fragments, ...collisionCorpus.fragments, ...paddockCorpus.fragments, ...looseCorpus.fragments, ...societyCorpus.fragments, ...drsCorpus.fragments] as Fragment[];
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
export function composeMessage(plan: MessagePlan, recent: RecentLines, seed: number): ComposedMessage | undefined {
  let rng = seed >>> 0;
  const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  const candidates = fragments.filter(f => f.topics.includes(plan.situation.topic) && f.channels.includes(plan.channel)
    && (!plan.standaloneOnly || f.socialPlacement !== 'discussion' && !f.replyToActs?.length && !f.replyToTags?.length)
    && (plan.channel!=='social'||!review.excludedIds.includes(f.id)&&!review.downloadedExcludedSourceIds.includes(f.sourceId??''))
    && (!f.personas?.length || f.personas.includes(plan.persona))
    && (!f.recalls || f.recalls.tags.some(tag=>plan.recalls?.[f.recalls!.by].includes(tag)))
    && (f.stance === 'neutral' || f.stance === plan.stance)
    && f.requires.every(tag => plan.tags.includes(tag)) && fill(f, plan) !== undefined);
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
    // A classification report also permits a standalone result claim as its comment.
    // This is not agreement with an arbitrary caption, nor a generic reply to any post.
    const resultComment = (f:Fragment) => plan.situation.topic==='paddock' && plan.parent!.act==='report'
      && !f.replyToActs?.length && (f.role==='claim'||f.role==='reaction')
      && (plan.parent!.tags?.includes('race_classification') && f.requires.some(t=>t==='team_result'||t==='race_result')
        || plan.parent!.tags?.includes('qualifying_position') && f.requires.includes('qualifying_result'));
    const reply = pick(candidates.filter(f => ((f.role === 'reply' || (f.role === 'claim' || f.role === 'reaction') && !!f.replyToTags?.length)
      && f.replyToActs?.includes(plan.parent!.act) || resultComment(f)) && f.act === plan.act
      && (!f.replyToTags?.length || f.replyToTags.some(tag => plan.parent!.tags?.includes(tag)))), true);
    if (reply) selected.push(reply);
  } else {
    // A claim must realise the chosen topic, not merely an unrelated live-state tag.
    const primary = pick(candidates.filter(f => (f.role === 'claim' || f.role === 'stall' || plan.channel === 'social' && f.role === 'reaction') && f.requires.some(t => plan.preferredTags.includes(t))), true);
    if (primary) selected.push(primary);
    // Usually one utterance. A second fragment is optional, not a mandatory concluding sentence.
    if (primary && primary.role !== 'stall' && plan.persona !== 'team_staff' && random() < (plan.channel === 'engineer' ? 0.4 : 0.18)) {
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
  return { text, fragments: selected, factIds: plan.facts.filter(f => claimedTags.has(f.predicate) || usedSlots.has(f.predicate)).map(f => f.id) };
}
