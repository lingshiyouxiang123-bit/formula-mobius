import type { GameState } from '../../game/types';
import type { NarrativeLine, SocialAccount } from '../types';
import type { MessagePlan } from '../situations/types';
import type { SocialMemory, SpectatorProfile } from './types';

export function socialWorldId(game: GameState): string {
  return game.seasonId ? `season:${game.seasonId}` : `pve:${game.humanDriverId}`;
}

const cast: SpectatorProfile[] = [
  { id:'viewer:technical_fan',name:'分段计时',persona:'technical_fan',knowledge:'informed',style:'blunt',focus:'strategy',motive:'curious',activity:0.8,stubborn:false },
  { id:'viewer:technical:late',name:'最后一圈再说',persona:'technical_fan',knowledge:'informed',style:'fragmented',focus:'results',motive:'curious',activity:0.55,stubborn:false },
  { id:'viewer:ordinary_viewer',name:'弯心路人',persona:'ordinary_viewer',knowledge:'casual',style:'fragmented',focus:'incidents',motive:'curious',activity:0.7,stubborn:false },
  { id:'viewer:ordinary:coffee',name:'咖啡还没凉',persona:'ordinary_viewer',knowledge:'casual',style:'chatty',focus:'results',motive:'banter',activity:0.45,stubborn:false },
  { id:'viewer:blogger',name:'围场手记',persona:'blogger',knowledge:'informed',style:'chatty',focus:'strategy',motive:'curious',activity:0.6,stubborn:false },
  { id:'viewer:troll',name:'反向看台',persona:'troll',knowledge:'casual',style:'blunt',focus:'incidents',motive:'banter',activity:0.35,stubborn:true },
];

export function prepareSocialMemory(game: GameState, prior?: SocialMemory): SocialMemory {
  const worldId = socialWorldId(game), session = game.raceSession ?? 'race';
  const memory: SocialMemory = prior?.worldId === worldId ? structuredClone(prior) : {
    worldId,raceId:game.id,session,revision:0,profiles:{},opinions:{},relations:{},rumors:[],observedIds:[],
  };
  if (memory.raceId !== game.id || memory.session !== session) {
    memory.raceId=game.id;memory.session=session;memory.rumors=[];memory.observedIds=[];
    delete memory.processedRound;delete memory.lastEchoRound;memory.revision++;
  }
  for (const actor of cast) memory.profiles[actor.id] ??= {...actor};
  for (const driver of game.drivers) {
    const id=`viewer:fan:${driver.id}`;
    memory.profiles[id] ??= {id,name:`${driver.profile.name}看台`,persona:'fan',supportsDriverId:driver.id,supportsTeamId:driver.profile.teamId,
      knowledge:'casual',style:'fragmented',focus:'results',motive:'loyal',activity:0.8,stubborn:false};
    memory.profiles[`${id}:flag`] ??= {id:`${id}:flag`,name:`${driver.profile.abbreviation}小旗`,persona:'fan',supportsDriverId:driver.id,supportsTeamId:driver.profile.teamId,
      knowledge:'informed',style:'blunt',focus:'incidents',motive:'loyal',activity:0.55,stubborn:true};
  }
  return memory;
}

/** Reuse only the latest memory from this simulated world, never another player's season. */
export function latestSocialMemory(records: Record<string,{socialMemory?:SocialMemory}>, game: GameState): SocialMemory | undefined {
  return Object.values(records).map(record=>record.socialMemory).filter((m):m is SocialMemory=>!!m&&m.worldId===socialWorldId(game))
    .sort((a,b)=>b.revision-a.revision)[0];
}

export function actorAccount(actor: SpectatorProfile): SocialAccount {
  return {id:actor.id,role:'viewer',supportsDriverId:actor.supportsDriverId,profile:actor};
}

export function chooseActor(memory: SocialMemory, persona: string, subjectId: string | undefined, seed: number, parent?: NarrativeLine): SpectatorProfile | undefined {
  const actors=Object.values(memory.profiles).filter(actor=>actor.persona===persona
    && (persona!=='fan'||actor.supportsDriverId===subjectId) && actor.id!==parent?.account?.id);
  // Familiar interlocutors can answer again; hostile relations don't make every reply hostile.
  const familiar=parent?.account ? actors.filter(actor=>(memory.relations[`${actor.id}|${parent.account!.id}`]??0)>0) : [];
  const pool=familiar.length && Math.abs(seed)%3===0 ? familiar : actors;
  return pool[Math.abs(seed)%pool.length];
}

/** Actor traits affect the message plan before selecting words, not just the avatar afterwards. */
export function applySocialVoice(plan: MessagePlan, recent: NarrativeLine[], seed: number, memory?: SocialMemory): boolean {
  if(plan.channel!=='social'||plan.persona==='team_staff'||!memory)return true;
  const parent=recent.find(p=>p.id===plan.parent?.id);
  const actor=plan.actor??chooseActor(memory,plan.persona,plan.situation.subjectIds[0],seed,parent);
  if(!actor)return false;
  plan.actor=actor;
  plan.tags=[...new Set([...plan.tags,`voice_${actor.style}`,`knowledge_${actor.knowledge}`])];
  const previous=memory.opinions[actor.id]?.findLast(o=>o.subjectIds.includes(plan.situation.subjectIds[0]));
  const parentPrevious=parent?.account ? memory.opinions[parent.account.id]?.findLast(o=>o.lineId!==parent.id&&o.subjectIds.includes(plan.situation.subjectIds[0])) : undefined;
  plan.recalls={self:previous?.tags??[],parent:parentPrevious?.tags??[]};
  if(previous){plan.tags.push('g3_remembers');plan.slots={...plan.slots,previousView:previous.text};}
  if((!plan.parent || parent?.account?.role==='event' || parent?.account?.role==='team') && actor.persona==='fan'
    && !plan.tags.some(t=>['g3_pit_guess','g3_retirement_guess'].includes(t))) {
    if(plan.tags.some(t=>['contact','retired','dnf_result','positions_lost'].includes(t))) {
      plan.tags.push('g3_disappointed');plan.preferredTags=['g3_disappointed',...plan.preferredTags];
      plan.act='concern';plan.stance='critical';
    } else if(plan.tags.some(t=>['podium_result','qualifying_result','finished_result'].includes(t))) {
      plan.tags.push('g3_support');plan.preferredTags=['g3_support',...plan.preferredTags];
      plan.act='praise';plan.stance='support';
    }
  }
  // A player's direct reply to a previous NPC can be answered by that NPC again.
  if(parent?.account?.role==='driver' && previous) {
    plan.tags.push('g3_followup');plan.preferredTags=['g3_followup',...plan.preferredTags];
  }
  return true;
}

export function controversyAge(lines: NarrativeLine[], round: number): number {
  const topics=['contact','same_team','retired','penalty_talk'];
  const rounds=lines.filter(p=>p.socialContext?.tags.some(t=>topics.includes(t)))
    .map(p=>{
      const facts=p.socialContext?.facts.filter(f=>topics.includes(f.predicate))??[];
      // Replies carry the old event context; reposting it doesn't restart the controversy clock.
      return facts.length?Math.max(...facts.map(f=>f.round)):p.socialContext?.situation.round??p.round;
    });
  return rounds.length?round-Math.max(...rounds):Infinity;
}

export function canSpeak(actor: SpectatorProfile, line: NarrativeLine, recent: NarrativeLine[], seed: number, interactive=false): boolean {
  if(interactive)return !recent.some(p=>p.replyToId===line.replyToId&&p.account?.id===actor.id);
  const own=recent.filter(p=>p.account?.id===actor.id&&(!line.raceId||!p.raceId||p.raceId===line.raceId)
    && (line.socialTick!==undefined?p.socialTick!==undefined&&line.socialTick-p.socialTick<3:p.round===line.round));
  const hot=controversyAge([...recent,line],line.round)<=1;
  // The last lap may use up the normal chatter budget before classification arrives.
  // Reserve one reaction to the newly published result, not unlimited post-race chatter.
  const firstResult=line.socialContext?.tags.includes('race_result')
    && !own.some(p=>p.socialContext?.tags.includes('race_result'));
  if(own.length>=(hot?3:2)&&!firstResult)return false;
  if(line.evolution)return true; // Evolution is already scheduled once per rumor/round.
  const relevance=actor.supportsDriverId && (line.plan?.subjectIds??line.socialContext?.situation.subjectIds??[]).includes(actor.supportsDriverId)
    || actor.focus==='strategy'&&line.socialContext?.situation.topic==='tires'
    || actor.focus==='results'&&line.socialContext?.situation.topic==='paddock';
  const threshold=Math.min(0.98,actor.activity+(hot?0.2:0)+(relevance?0.15:0));
  return Math.abs(seed*17+line.round*23)%100/100<threshold;
}

/** Old whole-sentence paths use the same persistent cast and activity rules. */
export function bindSocialActor(line: NarrativeLine, memory: SocialMemory, recent: NarrativeLine[], seed: number): boolean {
  if(line.account?.role!=='viewer'||line.provenance==='player')return true;
  const persona=line.account.profile?.persona ?? (line.account.supportsDriverId?'fan'
    : line.account.id.includes('technical')?'technical_fan':line.account.id.includes('blogger')?'blogger':line.account.id.includes('troll')?'troll':'ordinary_viewer');
  const actor=line.account.profile ?? memory.profiles[line.account.id]
    ?? chooseActor(memory,persona,line.account.supportsDriverId??line.plan?.subjectIds[0],seed,recent.find(p=>p.id===line.replyToId));
  if(!actor)return false;
  line.account=actorAccount(actor);line.speaker=actor.name;
  return canSpeak(actor,line,recent,seed);
}

/** Remember published views only. Queued posts aren't sources another spectator has already seen. */
export function rememberSocialLines(memory: SocialMemory, raceId: string, lines: NarrativeLine[]): void {
  const seen=new Set(memory.observedIds),byId=new Map(lines.map(p=>[p.id,p]));
  for(const line of lines) {
    if(seen.has(line.id))continue;
    seen.add(line.id);memory.revision++;
    const actorId=line.account?.id;
    if(!actorId||!line.plan)continue;
    const opinion={revision:memory.revision,lineId:line.id,raceId:line.raceId??raceId,round:line.round,subjectIds:line.plan.subjectIds,act:line.plan.act,stance:line.plan.stance,
      tags:line.plan.expresses??[],text:line.text,sourceId:line.replyToId??line.quoteOfId??line.repostOfId};
    memory.opinions[actorId]=[...(memory.opinions[actorId]??[]),opinion].slice(-8);
    const parent=byId.get(line.replyToId??'');
    if(parent?.account && parent.account.id!==actorId) {
      const key=`${actorId}|${parent.account.id}`;
      const delta=['agree','support','confirm'].includes(line.plan.act)?1:['challenge','correct'].includes(line.plan.act)?-1:0;
      if(delta)memory.relations[key]=Math.max(-2,Math.min(2,(memory.relations[key]??0)+delta));
    }
  }
  memory.observedIds=[...seen].slice(-350);
  memory.relations=Object.fromEntries(Object.entries(memory.relations).slice(-80));
}

/** Local player interaction can be newer than the race snapshot; merge views without changing results. */
export function mergeSocialMemory(base: SocialMemory, local?: SocialMemory): SocialMemory {
  const result=structuredClone(base);
  if(!local||local.worldId!==base.worldId)return result;
  for(const [id,opinions] of Object.entries(local.opinions)) {
    const combined=[...(result.opinions[id]??[]),...opinions];
    result.opinions[id]=[...new Map(combined.map(o=>[o.lineId,o])).values()].sort((a,b)=>(a.revision??0)-(b.revision??0)).slice(-8);
  }
  result.relations=local.revision>=base.revision?{...result.relations,...local.relations}:{...local.relations,...result.relations};
  result.revision=Math.max(result.revision,local.revision);
  result.observedIds=[...new Set([...result.observedIds,...local.observedIds])].slice(-1200);
  result.profiles={...result.profiles,...local.profiles};
  return result;
}
