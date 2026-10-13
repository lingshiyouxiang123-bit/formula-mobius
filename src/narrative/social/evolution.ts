import type { GameState } from '../../game/types';
import type { NarrativeLine, RaceNarrative, SocialEvolution } from '../types';
import { composeMessage } from '../situations/composer';
import type { MessagePlan, SpeakerView, Stance } from '../situations/types';
import { actorAccount, applySocialVoice, canSpeak, chooseActor, controversyAge } from './society';
import type { SocialMemory, SocialRumor, SpectatorProfile } from './types';

function withTags(view: SpeakerView, round: number, tags: string[]): SpeakerView {
  // Opinion cues stay in the view, never become authoritative WorldFacts.
  return {...view,facts:[...view.facts],tags:[...new Set([...view.tags,...tags])],situation:{...view.situation,round},slots:{...view.slots}};
}

function evolutionLine(id: string, view: SpeakerView, actor: SpectatorProfile, act: string, stance: Stance,
  recent: NarrativeLine[], memory: SocialMemory, seed: number, tag: string, source: NarrativeLine,
  kind: SocialEvolution['kind'], rumorId?: string): NarrativeLine | undefined {
  const plan: MessagePlan={...view,actor,persona:actor.persona,act,stance,preferredTags:[tag],
    ...(kind!=='guess'?{parent:{id:source.id,act:source.plan?.act??'report',stance:source.plan?.stance??'neutral',tags:source.plan?.expresses??[]}}:{})};
  applySocialVoice(plan,recent,seed,memory);
  const composed=composeMessage(plan,recent,seed);
  if(!composed||!composed.fragments.some(f=>f.requires.includes(tag)))return;
  const line: NarrativeLine={id,round:view.situation.round,speaker:actor.name,account:actorAccount(actor),text:composed.text,kind:'opinion',
    factIds:composed.factIds,eventIds:[...new Set(view.facts.flatMap(f=>f.eventIds))],templateId:composed.fragments.map(f=>f.id).join('+'),
    family:composed.fragments.map(f=>f.family).join('+'),provenance:'luna_rp',socialContext:view,socialPlacement:kind==='guess'?'standalone':'discussion',
    ...(kind==='guess'?{quoteOfId:source.id}:{replyToId:source.id}),evolution:{kind,sourceId:source.id,rumorId},
    plan:{topic:view.situation.topic,act:plan.act,stance:plan.stance,subjectIds:view.situation.subjectIds,
      fragmentIds:composed.fragments.map(f=>f.id),expresses:[...new Set([...composed.fragments.flatMap(f=>f.expresses??[]),
        ...(rumorId&&['spread','question'].includes(kind)?source.plan?.expresses?.filter(t=>t==='pit_guess'||t==='retirement_guess')??[]:[])])]}};
  return canSpeak(actor,line,recent,seed)?line:undefined;
}

/** A small discussion lifecycle, driven by actual posts and later race observations. */
export function socialEvolution(state: RaceNarrative, game: GameState): NarrativeLine[] {
  const memory=state.socialMemory;
  if(!memory)return [];
  const output: NarrativeLine[]=[],all=()=>[...state.social,...(state.socialQueue??[]).map(q=>q.line),...output];
  const published=new Map(state.social.map(p=>[p.id,p]));
  const seed=(game.initialSeed??905)+game.round*97+memory.revision*11;
  // Kept sources are real published posts; queued text is only used for deduplication/budgeting.
  for(const rumor of memory.rumors) {
    const origin=published.get(rumor.originId),driver=game.drivers.find(d=>d.id===rumor.subjectId);
    if(!origin?.socialContext||!driver)continue;
    const age=game.round-rumor.createdRound;
    const official=state.social.findLast(p=>p.account?.role==='event'&&p.round>=rumor.createdRound
      && p.id!==rumor.sourceIds[0] && p.socialContext?.situation.subjectIds.includes(rumor.subjectId)
      && (rumor.kind!=='pit_guess'||p.round<=rumor.deadlineRound)
      && p.socialContext.tags.includes(rumor.kind==='pit_guess'?'pit_entry':'retired'));
    const classification=game.phase==='finished'?state.social.find(p=>p.account?.role==='event'&&p.card?.title==='本站最终分类'):undefined;
    const classified=classification?.card?.rows.find(row=>row.driverId===driver.id);
    const after=withTags(origin.socialContext,game.round,[]);
    if(rumor.status==='unconfirmed') {
      if(official) {rumor.status='confirmed';rumor.resolvedRound=game.round;rumor.sourceIds.push(official.id);after.tags.push(rumor.kind==='pit_guess'?'pit_entry':'retired');}
      else if(rumor.kind==='retirement_guess'&&classified?.status==='dnf') {
        rumor.status='confirmed';rumor.resolvedRound=game.round;rumor.sourceIds.push(classification!.id);after.tags.push('retired');
      }
      else if(rumor.kind==='retirement_guess'&&age>=1&&!driver.pit&&driver.status==='racing'&&driver.progress!==rumor.observedProgress) {
        rumor.status='wrong';rumor.resolvedRound=game.round;after.tags.push('still_running');
      } else if(rumor.kind==='retirement_guess'&&classified&&classified.status!=='dnf') {
        rumor.status='wrong';rumor.resolvedRound=game.round;after.tags.push('finished_result');
      } else if(rumor.kind==='pit_guess'&&game.round>rumor.deadlineRound) {
        // A service entry within the prediction window would have been picked up above.
        rumor.status='wrong';rumor.resolvedRound=game.round;after.tags.push('guess_deadline_missed');
      }
      if(rumor.status!=='unconfirmed')memory.revision++;
    }
    if(rumor.status!=='unconfirmed'&&!rumor.correctionId) {
      after.tags.push(rumor.status==='confirmed'?'g3_guess_confirmed':'g3_guess_wrong');
      if(rumor.status==='confirmed')after.tags.push(rumor.kind==='pit_guess'?'pit_entry':'retired');
      else after.tags.push(rumor.kind==='pit_guess'?'guess_deadline_missed':game.phase==='finished'?'finished_result':'still_running');
      const evidence=official??classification;
      if(evidence?.socialContext)after.facts.push(...evidence.socialContext.facts);
      const observedTag=rumor.status==='confirmed'?(rumor.kind==='pit_guess'?'pit_entry':'retired')
        :rumor.kind==='pit_guess'?'guess_deadline_missed':game.phase==='finished'?'finished_result':'still_running';
      after.facts=[...after.facts,{id:`${rumor.id}:observation:${game.round}`,subjectId:driver.id,predicate:observedTag,value:true,
        round:game.round,source:'observation',sourceLabel:evidence?'赛事账号更新':'赛道位置/进站观察',visibility:'public',eventIds:evidence?.eventIds??[]}];
      const actor=memory.profiles[rumor.authorId];
      const kind=rumor.status==='confirmed'?'confirm':'correct';
      const line=evolutionLine(`${rumor.id}:${kind}`,after,actor,kind,'neutral',all(),memory,seed,rumor.status==='confirmed'?'g3_guess_confirmed':'g3_guess_wrong',origin,kind,rumor.id);
      if(line) {
        if(evidence)line.quoteOfId=evidence.id;
        output.push(line);rumor.correctionId=line.id;memory.revision++;
      }
    }
    // Spread at most twice, and only after a source is actually visible for a round.
    if(rumor.status==='unconfirmed'&&age>=1&&age<=2&&rumor.spreadIds.length<2) {
      const source=rumor.spreadIds.length ? published.get(rumor.spreadIds.at(-1)!) : origin;
      if(!source)continue;
      const persona=rumor.spreadIds.length?'technical_fan':'ordinary_viewer';
      const actor=chooseActor(memory,persona,rumor.subjectId,seed,source);
      if(!actor||rumor.participantIds.includes(actor.id))continue;
      const questioning=persona==='technical_fan';
      const tag=questioning?'g3_rumor_question':'g3_rumor_share';
      const view=withTags(origin.socialContext,game.round,[tag]);
      const line=evolutionLine(`${rumor.id}:spread:${rumor.spreadIds.length}`,view,actor,questioning?'challenge':'rumor',questioning?'critical':'neutral',all(),memory,seed,tag,source,questioning?'question':'spread',rumor.id);
      if(line){line.quoteOfId=origin.id;output.push(line);rumor.spreadIds.push(line.id);rumor.participantIds.push(actor.id);memory.revision++;}
    }
    // A stubborn spectator may resist an actual correction, not invent a race-control ruling.
    if(rumor.status==='wrong'&&rumor.correctionId&&!rumor.doubledDown&&game.round>(rumor.resolvedRound??game.round)) {
      const correction=published.get(rumor.correctionId);
      const actor=rumor.participantIds.map(id=>memory.profiles[id]).find(p=>p?.stubborn)
        ?? (Math.abs(seed)%4===0?memory.profiles['viewer:troll']:undefined);
      if(correction&&actor) {
        const view=withTags(origin.socialContext,game.round,['g3_double_down']);
        const line=evolutionLine(`${rumor.id}:double-down`,view,actor,'challenge','critical',all(),memory,seed,'g3_double_down',correction,'double_down',rumor.id);
        if(line){output.push(line);rumor.doubledDown=true;memory.revision++;}
      }
    }
  }
  // New guesses need a concrete visible topic. No generic random rumor every clock tick.
  if(game.phase!=='finished'&&game.round>0&&memory.rumors.filter(r=>r.status==='unconfirmed').length<2) {
    const source=state.social.findLast(p=>p.account?.role==='event'&&p.socialContext&&p.round===game.round
      && !memory.rumors.some(r=>r.sourceIds[0]===p.id)
      && !p.socialContext.tags.some(t=>t==='pit_entry'||t==='pit_exit')
      && (p.socialContext.tags.includes('contact') || p.socialContext.tags.includes('tire_worn')));
    const last=memory.rumors.at(-1);
    if(source?.socialContext && (!last||game.round-last.createdRound>=3)) {
      const kind=source.socialContext.tags.includes('contact')?'retirement_guess':'pit_guess';
      createGuess(memory,game,source,kind,all(),output,seed);
    }
    // A commentary hint or a spectator's own observed tyre discussion can also be the source.
    if(!output.some(p=>p.evolution?.kind==='guess')&&(!last||game.round-last.createdRound>=4)) {
      const source=state.social.findLast(p=>p.socialContext?.situation.topic==='tires'&&p.socialContext.tags.some(t=>['tire_worn','published_intel'].includes(t))
        && !p.socialContext.tags.some(t=>t==='pit_entry'||t==='pit_exit')
        && p.round>=game.round-1 && !p.evolution && !memory.rumors.some(r=>r.sourceIds[0]===p.id));
      if(source)createGuess(memory,game,source,'pit_guess',all(),output,seed+19);
    }
  }
  // Follow-ups are sparse; controversy loses its bonus after two rounds, not an endless argument.
  if(memory.processedRound!==game.round) {
    memory.processedRound=game.round;
    if(game.round>=4&&(memory.lastEchoRound===undefined||game.round-memory.lastEchoRound>=6)&&controversyAge(state.social,game.round)<=2) {
      const source=state.social.findLast(p=>p.account?.role==='viewer'&&p.text&&!p.evolution&&p.round<game.round&&p.round>=game.round-3
        && p.plan?.expresses?.some(t=>['defend_driver','result_support','pit_guess'].includes(t)));
      const actor=source?.account?.profile;
      if(source&&actor&&Math.abs(seed)%5===0) {
        // Deliberate echo is an explicit quote of one's own earlier words, not a deduplication exception.
        const echo={...source,id:`${game.id}:${memory.session}:echo:${game.round}`,round:game.round,replyToId:undefined,quoteOfId:source.id,
          evolution:{kind:'echo' as const,sourceId:source.id},socialPlacement:'standalone' as const};
        if(canSpeak(actor,echo,all(),seed)){output.push(echo);memory.lastEchoRound=game.round;memory.revision++;}
      }
    }
  }
  memory.rumors=memory.rumors.slice(-8);
  return output;
}

function createGuess(memory: SocialMemory, game: GameState, source: NarrativeLine, kind: SocialRumor['kind'],
  recent: NarrativeLine[], output: NarrativeLine[], seed: number) {
  if(!source.socialContext)return;
  const subjectId=source.socialContext.situation.subjectIds[0];
  const driver=game.drivers.find(d=>d.id===subjectId);
  if(!driver||driver.pit||driver.status!=='racing')return;
  const actor=chooseActor(memory,kind==='pit_guess'?'ordinary_viewer':'blogger',subjectId,seed,source);
  if(!actor)return;
  const tag=kind==='pit_guess'?'g3_pit_guess':'g3_retirement_guess';
  const view=withTags(source.socialContext,game.round,[tag,'race_in_progress']);
  const id=`${game.id}:${memory.session}:rumor:${source.id}`;
  const line=evolutionLine(`${id}:origin`,view,actor,'rumor','curious',recent,memory,seed,tag,source,'guess',id);
  if(!line)return;
  output.push(line);
  memory.rumors.push({id,raceId:game.id,session:memory.session,subjectId,kind,authorId:actor.id,originId:line.id,
    createdRound:game.round,deadlineRound:game.round+2,observedProgress:driver.progress,sourceIds:[source.id],participantIds:[actor.id],spreadIds:[],status:'unconfirmed'});
  memory.revision++;
}
