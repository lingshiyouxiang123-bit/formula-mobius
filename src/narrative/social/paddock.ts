import type { DriverState, GameState, SeasonState } from '../../game/types';
import type { NarrativeLine } from '../types';
import { composeMessage } from '../situations/composer';
import type { MessagePlan, SpeakerView, Stance, WorldFact } from '../situations/types';
import {applySocialVoice,actorAccount} from './society';
import type {SocialMemory} from './types';

/** Stable identities, not a new simulated character system. Fans follow a game entity ID. */
export function spectatorIdentity(persona: string, driverId?: string, driverName?: string) {
  const names: Record<string,string> = { fan:'看台小旗', technical_fan:'分段计时', ordinary_viewer:'弯心路人', troll:'反向看台', blogger:'围场手记' };
  return { speaker: persona === 'fan' && driverName ? `${driverName}看台` : names[persona] ?? '弯心路人',
    account: { id: persona === 'fan' && driverId ? `viewer:fan:${driverId}` : `viewer:${persona}`,
      role: 'viewer' as const, ...(persona === 'fan' && driverId ? { supportsDriverId:driverId } : {}) } };
}

/** Paddock facts come from classification and visible race actions, never rival telemetry. */
export function paddockView(game: GameState, members: DriverState[], tags: string[], focus: string, eventIds: number[] = [], season?: SeasonState): SpeakerView {
  const driver = members[0];
  const result = tags.some(t=>t==='team_result'||t==='standings_update'||t==='race_result') ? game.results.find(r => r.driverId === driver.id) : undefined;
  const classified = result && result.status !== 'dnf';
  const positionsGained = classified && !driver.pitLaneStart ? driver.qualifyingRank - result.rank : undefined;
  const results = members.map(d => result ? game.results.find(r => r.driverId === d.id) : undefined);
  const round = eventIds.length ? Math.max(...game.logs.filter(l=>eventIds.includes(l.id)).map(l=>l.round),0) : game.round;
  const summary = members.map((d,i) => `${d.profile.name} ${results[i]?.status === 'dnf' ? 'DNF' : results[i] ? `P${results[i]!.rank}` : '尚未分类'}`).join(' / ');
  const points = results.reduce((sum,r) => sum + (r?.points ?? 0),0);
  const team = members.find(d => d.profile.team?.name)?.profile.team?.name ?? members.find(d => d.profile.contract?.teamName)?.profile.contract?.teamName ?? '车队';
  const slots: SpeakerView['slots'] = { driver:driver.profile.name, team, track:game.track.name, resultSummary:summary,
    pitStops:result ? driver.raceStats?.pitStops ?? 0 : game.logs.filter(l=>l.round<=round&&l.code==='pit.service'&&l.details?.result!=='exited'&&l.details?.input?.driverId===driver.id).length };
  if (members[1]) slots.otherDriver = members[1].profile.name;
  slots.startPosition = driver.qualifyingRank;
  const qualifyingTags = tags.includes('qualifying_result') ? [driver.qualifyingRank === 1 ? 'pole_result' : driver.qualifyingRank <= 3 ? 'qualifying_front' : driver.qualifyingRank <= Math.ceil(game.drivers.length * 0.65) ? 'qualifying_midfield' : 'qualifying_back'] : [];
  if (result) { slots.position = result.rank; slots.points = points; }
  if (positionsGained !== undefined) slots.positionsGained = Math.abs(positionsGained);
  const outcomeTags = result ? [ 'race_result', classified ? 'finished_result' : 'dnf_result', points > 0 ? 'points_result' : 'no_points_result',
    ...(classified && result.rank <= 3 ? ['podium_result'] : []), ...(positionsGained && positionsGained > 0 ? ['positions_gained'] : positionsGained && positionsGained < 0 ? ['positions_lost'] : []) ] : [];
  if (tags.includes('team_result') && members.length === 2 && results.every(Boolean)) {
    outcomeTags.push(results.every(r=>r!.status==='dnf') ? 'team_double_dnf' : results.every(r=>r!.status!=='dnf') ? 'team_double_finish' : 'team_mixed_result');
  }
  if (season && game.seasonId === season.id && season.rounds.some(r=>r.raceId===game.id)) {
    const standing = season.standings.find(s=>s.driverId===driver.id);
    if (standing) { slots.driverPoints = standing.championshipPoints;
      slots.championshipPosition = season.standings.slice().sort((a,b)=>b.championshipPoints-a.championshipPoints).findIndex(s=>s.driverId===driver.id)+1; }
    const constructor = season.constructors.find(s=>s.teamId===driver.profile.teamId);
    if (constructor) slots.teamPoints = constructor.championshipPoints;
  }
  const allTags = [...new Set([...tags,...outcomeTags,...qualifyingTags])];
  const facts: WorldFact[] = [ ...allTags.map(predicate=>({id:`${game.id}:paddock:${driver.id}:${game.round}:${predicate}`,subjectId:driver.id,predicate,value:true,
    round:game.round,source:'state' as const,visibility:'public' as const,eventIds})),
    ...Object.entries(slots).map(([predicate,value])=>({id:`${game.id}:paddock:${driver.id}:${game.round}:${predicate}`,subjectId:driver.id,predicate,value,
      round:game.round,source:'state' as const,visibility:'public' as const,eventIds})) ];
  for (const fact of facts) fact.round=round;
  return { channel:'social',tags:allTags,slots,facts,situation:{id:`${game.id}:paddock:${driver.id}:${round}:${focus}`,topic:'paddock',round,
    subjectIds:members.map(d=>d.id),facts,focus,importance:3} };
}

export function paddockLine(id: string, view: SpeakerView, persona: string, act: string, stance: Stance, recent: NarrativeLine[], seed: number, parent?: NarrativeLine, society?:SocialMemory, standaloneOnly = false): NarrativeLine | undefined {
  const teamOutcome=persona==='team_staff'?view.tags.find(tag=>['team_double_dnf','team_mixed_result','team_double_finish'].includes(tag)):undefined;
  const plan: MessagePlan = { ...view,persona,act,stance,standaloneOnly,preferredTags:[teamOutcome??view.situation.focus],
    ...(parent ? {parent:{id:parent.id,act:parent.plan?.act??'report',stance:parent.plan?.stance??'neutral',tags:parent.plan?.expresses??[]}} : {}) };
  if(!applySocialVoice(plan,recent,seed,society))return;
  const composed = composeMessage(plan,recent,seed);
  if (!composed) return;
  return { id,round:view.situation.round,...(plan.actor?{speaker:plan.actor.name,account:actorAccount(plan.actor)}:spectatorIdentity(persona,view.situation.subjectIds[0],String(view.slots.driver))),text:composed.text,kind:'opinion',
    factIds:composed.factIds,eventIds:[...new Set(view.facts.flatMap(f=>f.eventIds))],templateId:composed.fragments.map(f=>f.id).join('+'),
    family:composed.fragments.map(f=>f.family).join('+'),provenance:[...new Set(composed.fragments.map(f=>f.provenance))].join('+'),
    ...(parent ? {replyToId:parent.id} : {}),socialContext:view,socialPlacement:parent?'discussion':composed.fragments.find(f=>f.socialPlacement)?.socialPlacement??'either',
    plan:{topic:'paddock',act:plan.act,stance:plan.stance,subjectIds:view.situation.subjectIds,fragmentIds:composed.fragments.map(f=>f.id),expresses:composed.fragments.flatMap(f=>f.expresses??[])} };
}

/** Original posts have their own text/identity; a topic link is not a reply or quote. */
export function independentBloggerPosts(sources: NarrativeLine[], recent: NarrativeLine[], seed: number, society?: SocialMemory): NarrativeLine[] {
  const output: NarrativeLine[] = [];
  for (const source of sources.slice().reverse()) {
    const view = source.socialContext;
    if (!view || !['event', 'team'].includes(source.account?.role ?? '') || view.situation.topic !== 'paddock'
      || !view.tags.some(tag => ['qualifying_result', 'race_result', 'team_result'].includes(tag))) continue;
    const id = `${source.id}:blogger-original`;
    const seen = [...recent, ...output];
    if (seen.some(line => line.id === id)) continue;
    const roots = seen.filter(line => line.account?.profile?.persona === 'blogger' && !line.replyToId && !line.quoteOfId && !line.repostOfId);
    if (roots.some(line => line.round === source.round)) continue;
    for (const stance of ['neutral', 'critical', 'support', 'curious'] as const) {
      const line = paddockLine(id, view, 'blogger', 'report', stance, seen, seed + source.round * 31, undefined, society, true);
      if (!line) continue; // The shared publication path applies activity limits once.
      line.socialPlacement = 'standalone';
      line.socialKind = 'update';
      line.topicPostId = source.id;
      output.push(line);
      break;
    }
    if (output.length >= 2) break;
  }
  return output;
}

/** Two viewpoints at most, and a direct response keyed to what each actually said. */
export function paddockDiscussion(root: NarrativeLine, recent: NarrativeLine[], seed: number, society?:SocialMemory): NarrativeLine[] {
  const view = root.socialContext;
  if (!view) return [];
  const output: NarrativeLine[] = [];
  const choices: Array<[string,string,Stance]> = [['fan','support','support'],['ordinary_viewer','report','neutral'],['technical_fan','ask','curious'],['ordinary_viewer','agree','support'],['fan','challenge','critical'],['fan','praise','support'],['blogger','concern','critical'],['troll','challenge','critical']];
  // Rotate the second voice; do not always turn a result into a pile-on.
  const start = Math.abs(seed)%(choices.length-1) + 1;
  for (const [index, choice] of [choices[0],choices[start],...choices.slice(1)].entries()) {
    if (output.filter(p=>p.replyToId===root.id).length >= 2) break;
    if (output.some(p=>p.account?.id===spectatorIdentity(choice[0],view.situation.subjectIds[0]).account.id)) continue;
    const line = paddockLine(`${root.id}:voice:${index}`,view,...choice,[...recent,root,...output],seed+index*97,root,society);
    if (!line) continue;
    line.replyToId = root.id; output.push(line);
    const replies: Array<[string,string,Stance]> = [['ordinary_viewer','agree','support'],['technical_fan','ask','curious'],['blogger','ask','curious'],['fan','challenge','critical']];
    for (const [ri, rc] of replies.entries()) {
      if (rc[0] === choice[0]) continue;
      const answer = paddockLine(`${line.id}:reply:${ri}`,view,...rc,[...recent,root,...output],seed+index*97+ri*19,line,society);
      if (answer) { output.push(answer);break; }
    }
  }
  return output;
}
