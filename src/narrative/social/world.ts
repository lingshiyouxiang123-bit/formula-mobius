import type {NarrativeLine, RaceNarrative, SocialRaceSource, SocialTopic, SocialTopicGroup} from '../types';
import type {SocialMemory} from './types';
import type {SpeakerView} from '../situations/types';
import {mergeSocialMemory, rememberSocialLines} from './society';
import {responsesToPlayer} from './network';
import {planWorldActivity,worldNeedsSocialTick} from './worldPlanner';

export interface WorldPost extends NarrativeLine {raceId:string;worldId:string;topicId:string}
export interface WorldTopic {
  id:string;raceId:string;label:string;group:SocialTopicGroup;subjectIds:string[];
  sourcePostId?:string;context?:SocialTopic['context'];createdTick:number;updatedTick:number;
  lastPlannedTick:number;turns:number;status:'emerging'|'active'|'cooling'|'dormant';
  participants:string[];postCount:number;archivedCount?:number;
  blockedReason?:'no_compatible_expression';
}
export interface WorldRace extends SocialRaceSource {track:string;order:number;signature:string;archived?:boolean}
export interface SocialWorld {
  schemaVersion:1;id:string;revision:number;tick:number;sequence:number;
  races:Record<string,WorldRace>;posts:WorldPost[];queue:{line:WorldPost;dueTick:number}[];
  topics:Record<string,WorldTopic>;memory?:SocialMemory;contentVersion?:number;
  protectedPostIds?:string[];
}
export const topicLabels:Record<SocialTopicGroup,string>={result:'赛果与看台',qualifying:'排位与发车',emotion:'看台心情',strategy:'轮胎与策略',pace:'节奏与攻防',incident:'事故与判罚',comparison:'车手与车队对照',development:'车队动态',season:'赛季形势',quiet:'围场闲聊',weather:'天气',control:'旗况与重启',team_order:'队内换位'};

export function createSocialWorld(id:string):SocialWorld {
  return {schemaVersion:1,id,revision:0,tick:0,sequence:0,races:{},posts:[],queue:[],topics:{}};
}
export function narrativeWorldId(race:RaceNarrative):string {
  return race.socialSource?.worldId??race.socialMemory?.worldId??`legacy:${race.raceId}`;
}
function groupOf(line:NarrativeLine):SocialTopicGroup {
  const tags=line.socialContext?.tags??[];
  for(const group of ['development','comparison','season','quiet','strategy','pace','weather','control','team_order','qualifying','result','incident'] as const)if(tags.includes(`world_${group}`))return group;
  if(tags.includes('standings_update'))return 'season';
  if(tags.some(t=>['contact','retired','penalty_talk'].includes(t))||line.socialContext?.situation.topic==='incident')return 'incident';
  if(tags.includes('race_result')||line.card?.title.includes('最终分类')||line.card?.title.includes('本站结果'))return 'result';
  if(tags.includes('qualifying_result')||line.card)return 'qualifying';
  if(line.socialContext?.situation.topic==='tires')return 'strategy';
  if(line.socialContext?.situation.topic==='duel')return 'pace';
  return 'quiet';
}
export function worldTopicId(raceId:string,session:string,group:SocialTopicGroup,subjects:string[],key?:string):string {
  return `${raceId}:${session}:topic:${group}:${subjects.slice().sort().join(',')||'paddock'}${key?`:${key}`:''}`;
}
function asPost(world:SocialWorld,raceId:string,line:NarrativeLine):WorldPost {
  const parent=world.posts.find(p=>p.id===(line.replyToId??line.quoteOfId??line.topicPostId))
    ??world.queue.find(p=>p.line.id===(line.replyToId??line.quoteOfId??line.topicPostId))?.line;
  const group=groupOf(line),source=world.races[raceId];
  const declared=source?.topics.find(t=>t.postId===line.id);
  const topicId=line.topicId??parent?.topicId??worldTopicId(raceId,source?.session??'race',declared?.group??group,
    declared?.context.situation.subjectIds??line.plan?.subjectIds??line.socialContext?.situation.subjectIds??[],declared?.group==='development'?declared.id:undefined);
  return {...line,raceId,worldId:world.id,topicId,claimKind:line.claimKind??(line.kind==='fact'?'report':line.evolution?.kind==='guess'||line.evolution?.kind==='spread'?'rumor':'opinion')};
}
function updateTopic(world:SocialWorld,post:WorldPost):void {
  const prior=world.topics[post.topicId],group=prior?.group??groupOf(post);
  const topic=prior??{id:post.topicId,raceId:post.raceId,label:topicLabels[group],group,
    subjectIds:post.plan?.subjectIds??post.socialContext?.situation.subjectIds??[],createdTick:world.tick,updatedTick:world.tick,
    lastPlannedTick:world.tick-1,turns:0,status:'emerging' as const,participants:[],postCount:0};
  if(!post.replyToId&&!post.repostOfId)topic.sourcePostId??=post.id;
  // A delayed reply keeps its own old snapshot; it must not rewind the topic's newer evidence.
  if(!topic.context)topic.context=post.socialContext;
  topic.updatedTick=world.tick;topic.postCount++;
  topic.status='active';
  if(post.account&&!topic.participants.includes(post.account.id))topic.participants.push(post.account.id);
  world.topics[topic.id]=topic;
}
function publish(world:SocialWorld,line:WorldPost):void {
  if(world.posts.some(p=>p.id===line.id))return;
  const post={...line,socialTick:world.tick,publishSeq:++world.sequence};
  world.posts.push(post);updateTopic(world,post);
  if(world.memory)rememberSocialLines(world.memory,post.raceId,[...world.posts.slice(-100),post]);
}
function dependencies(line:NarrativeLine):string[] {
  return [line.replyToId,line.quoteOfId,line.repostOfId].filter((id):id is string=>!!id);
}

/** Import actual engine output once. The social clock never changes race time or RNG. */
export function ingestWorldNarrative(input:SocialWorld|undefined,race:RaceNarrative):SocialWorld {
  const id=narrativeWorldId(race),base=input?.id===id?input:createSocialWorld(id);
  // Old race bodies live in the race archive. Reading one must not republish the old feed.
  if(base.races[race.raceId]?.archived)return base;
  const signature=[race.raceSession,race.processed,race.socialSource?.round,race.result?.rank,race.socialSource?.evidenceRevision,
    ...race.social.map(p=>p.id),...(race.socialQueue??[]).map(q=>q.line.id),...(race.socialSource?.topics??[]).map(t=>t.id)].join('|');
  if(base.races[race.raceId]?.signature===signature)return base;
  const world=structuredClone(base);world.revision++;world.tick++;
  const previous=world.races[race.raceId];
  world.races[race.raceId]={worldId:id,playerId:'driver:player',playerName:race.result?.driverName??'我的车手',
    session:race.raceSession??'race',round:race.events.at(-1)?.round??0,finished:!!race.result,
    ...race.socialSource,track:race.track,order:previous?.order??Math.max(-1,...Object.values(world.races).map(r=>r.order))+1,signature,
    topics:(race.socialSource?.topics??race.socialTopics??[]).map(t=>({id:t.id,label:t.label,group:t.group,context:t.context,postId:t.postId}))};
  if(race.socialMemory)world.memory=world.memory?mergeSocialMemory(race.socialMemory,world.memory):structuredClone(race.socialMemory);
  // Merge source topics even when no compatible expression has yet produced a post.
  for(const source of race.socialSource?.topics??[]) {
    const topicId=worldTopicId(race.raceId,world.races[race.raceId].session,source.group,source.context.situation.subjectIds,source.group==='development'?source.id:undefined);
    const current=world.topics[topicId];
    const topic:WorldTopic=current??{id:topicId,raceId:race.raceId,label:source.label,group:source.group,
      subjectIds:source.context.situation.subjectIds,createdTick:world.tick,updatedTick:world.tick,lastPlannedTick:world.tick-1,
      turns:0,status:'emerging',participants:[],postCount:0};
    world.topics[topicId]={...topic,context:source.context,sourcePostId:source.postId??current?.sourcePostId};
    // Only genuinely updated evidence reopens a topic, not every render/import.
    const evidence=(view:SpeakerView|undefined)=>view&&JSON.stringify([view.situation.id,view.tags,view.slots]);
    if(current&&evidence(source.context)!==evidence(current.context)){
      world.topics[topicId].updatedTick=world.tick;world.topics[topicId].status='active';world.topics[topicId].turns=0;delete world.topics[topicId].blockedReason;
    }
  }
  const known=new Set(world.posts.map(p=>p.id));
  const incoming=race.social.filter(p=>!known.has(p.id));
  // The engine may supply replies before their parents in an older save.
  const maxPasses=incoming.length;
  for(let pass=0;pass<maxPasses&&incoming.length;pass++) {
    let moved=false;
    for(let i=0;i<incoming.length;) {
      const line=incoming[i];
      if(dependencies(line).every(parent=>known.has(parent)||!incoming.some(p=>p.id===parent))) {
        publish(world,asPost(world,race.raceId,line));known.add(line.id);incoming.splice(i,1);moved=true;
      }else i++;
    }
    if(!moved)break;
  }
  world.queue=world.queue.filter(item=>!known.has(item.line.id));
  const queued=new Set(world.queue.map(q=>q.line.id));
  for(const [index,item] of (race.socialQueue??[]).entries())if(!known.has(item.line.id)&&!queued.has(item.line.id)) {
    world.queue.push({line:asPost(world,race.raceId,item.line),dueTick:world.tick+1+Math.floor(index/3)});queued.add(item.line.id);
  }
  trimWorld(world);
  return world;
}

/** One canonical publication action, used both by manual reveal and the foreground timer. */
export function advanceSocialWorld(input:SocialWorld,limit=3):SocialWorld {
  if(!worldNeedsSocialTick(input))return input;
  const world=structuredClone(input);world.tick++;world.revision++;
  // Mix a fresh topic action into existing activity, rather than waiting for an old race backlog to empty.
  for(const line of planWorldActivity(world,Math.min(1,limit)))world.queue.unshift({line,dueTick:world.tick});
  const available=new Set(world.posts.map(p=>p.id));let count=0;
  // Multiple passes preserve parent-first publication even for migrated/out-of-order queues.
  const maxPasses=Math.min(limit,world.queue.length+1);
  for(let pass=0;pass<maxPasses&&count<limit;pass++) {
    let moved=false;
    world.queue=world.queue.filter(item=>{
      if(count>=limit||item.dueTick>world.tick||!dependencies(item.line).every(id=>available.has(id)))return true;
      publish(world,item.line);available.add(item.line.id);count++;moved=true;return false;
    });
    if(!moved)break;
  }
  for(const topic of Object.values(world.topics)) {
    const age=world.tick-topic.updatedTick;
    if(age>12)topic.status='dormant';else if(age>5)topic.status='cooling';
  }
  trimWorld(world);return world;
}

export interface LegacySocialData {posts?:NarrativeLine[];queue?:NarrativeLine[];socialMemories?:Record<string,SocialMemory>}
/** Bookmarks/pins preserve the actual post and its ancestors, not just a dangling UI ID. */
export function protectWorldPosts(input:SocialWorld,ids:string[]):SocialWorld {
  const unique=[...new Set(ids)].sort();
  if(unique.join('\n')===(input.protectedPostIds??[]).join('\n'))return input;
  return {...input,revision:input.revision+1,protectedPostIds:unique};
}
/** Legacy player writing is imported, never rewritten or re-generated. The old key remains recoverable. */
export function migratePlayerSocial(input:SocialWorld,legacy:LegacySocialData):SocialWorld {
  const known=new Set([...input.posts.map(p=>p.id),...input.queue.map(q=>q.line.id)]);
  const own=(legacy.posts??[]).filter(p=>p.raceId&&input.races[p.raceId]&&!known.has(p.id));
  const waiting=(legacy.queue??[]).filter(p=>p.raceId&&input.races[p.raceId]&&!known.has(p.id));
  if(!own.length&&!waiting.length)return input;
  const world=structuredClone(input);world.revision++;
  for(const post of own)publish(world,asPost(world,post.raceId!,post));
  for(const [index,post] of waiting.entries())world.queue.push({line:asPost(world,post.raceId!,post),dueTick:world.tick+1+Math.floor(index/3)});
  const memory=legacy.socialMemories?.[world.id];
  if(memory)world.memory=world.memory?mergeSocialMemory(world.memory,memory):structuredClone(memory);
  return world;
}

export function latestWorldRace(world:SocialWorld):[string,WorldRace]|undefined {
  return Object.entries(world.races).sort((a,b)=>b[1].order-a[1].order)[0];
}
export interface PlayerPublication {text:string;parentId?:string;quote?:boolean;topicId?:string;kind:'update'|'blog'}
export function publishPlayerWorld(input:SocialWorld,request:PlayerPublication):SocialWorld {
  const latest=latestWorldRace(input);if(!latest||!request.text.trim())return input;
  const [raceId,source]=latest,world=structuredClone(input);world.tick++;world.revision++;
  const parent=world.posts.find(p=>p.id===request.parentId),selected=world.topics[request.topicId??''];
  const hintedGroup:SocialTopicGroup|undefined=/策略|进站|box|SC|轮胎/i.test(request.text)?'strategy':/研发|升级|训练/.test(request.text)?'development':/队友|比较/.test(request.text)?'comparison':/积分|赛季/.test(request.text)?'season':undefined;
  const mentioned=Object.values(world.topics).filter(t=>t.raceId===raceId&&t.context&&
    (hintedGroup?t.group===hintedGroup:[t.context.slots.driver,t.context.slots.otherDriver].some(name=>typeof name==='string'&&name&&request.text.includes(name))))
    .sort((a,b)=>b.updatedTick-a.updatedTick)[0];
  const context=parent?.socialContext??selected?.context??mentioned?.context;
  const post:WorldPost={id:`${world.id}:player:${world.sequence+1}`,raceId,worldId:world.id,
    topicId:parent?.topicId??selected?.id??mentioned?.id??worldTopicId(raceId,source.session,'quiet',[source.playerId]),
    round:source.round,speaker:source.playerName,text:request.text.trim(),kind:'opinion',claimKind:'opinion',
    factIds:parent?.factIds??[],eventIds:parent?.eventIds??[],templateId:'player.actual-input',provenance:'player',
    account:{id:`driver:${source.playerId}`,role:'driver'},socialContext:context,socialKind:request.kind,
    ...(parent?request.quote?{quoteOfId:parent.id}:{replyToId:parent.id}:selected?.sourcePostId?{topicPostId:selected.sourcePostId}:{})};
  const replies=responsesToPlayer(post,context,[...world.posts,post,...world.queue.map(q=>q.line)],(world.sequence+1)*137,world.memory);
  publish(world,post);
  for(const [index,line] of replies.entries())world.queue.push({line:{...asPost(world,raceId,line),topicId:post.topicId},dueTick:world.tick+1+index});
  trimWorld(world);return world;
}

/** Keep whole ancestor chains and player-participated threads; do not truncate orphan replies. */
function trimWorld(world:SocialWorld):void {
  // Unpublished NPC backlog isn't history. Avoid bringing several races of stale chatter forward.
  const latest=latestWorldRace(world)?.[0];
  const npcIds=new Set(world.queue.filter(item=>item.line.provenance!=='player'&&item.line.raceId===latest).slice(-180).map(item=>item.line.id));
  const queuedById=new Map(world.queue.map(item=>[item.line.id,item.line]));
  const waiting=new Set([...npcIds,...world.queue.filter(item=>item.line.provenance==='player').map(item=>item.line.id)]);
  for(const id of waiting)for(const parent of dependencies(queuedById.get(id)??{} as NarrativeLine))if(queuedById.has(parent))waiting.add(parent);
  world.queue=world.queue.filter(item=>waiting.has(item.line.id));
  const byId=new Map(world.posts.map(p=>[p.id,p]));
  const keep=new Set(world.posts.slice(-900).map(p=>p.id));
  const protectedIds=new Set(world.protectedPostIds??[]);
  const own=world.posts.filter(p=>p.provenance==='player'||protectedIds.has(p.id));
  for(const post of [...own,...world.queue.map(q=>q.line)]) {
    if(byId.has(post.id))keep.add(post.id);
    for(const id of dependencies(post))keep.add(id);
  }
  for(const id of keep)for(const parent of dependencies(byId.get(id)??{ } as NarrativeLine))if(byId.has(parent))keep.add(parent);
  world.posts=world.posts.filter(p=>{
    if(keep.has(p.id))return true;
    const topic=world.topics[p.topicId];if(topic)topic.archivedCount=(topic.archivedCount??0)+1;
    return false;
  });
  const active=new Set([...world.posts.map(p=>p.topicId),...world.queue.map(q=>q.line.topicId)]);
  const dormant=Object.values(world.topics).filter(t=>!active.has(t.id)).sort((a,b)=>b.updatedTick-a.updatedTick).slice(0,30);
  world.topics=Object.fromEntries(Object.values(world.topics).filter(t=>active.has(t.id)||dormant.includes(t)).map(t=>[t.id,t]));
  // Retain chronology/labels but not an unbounded duplicate set of old scene snapshots.
  const full=new Set(Object.entries(world.races).sort((a,b)=>b[1].order-a[1].order).slice(0,6).map(([id])=>id));
  for(const [id,race] of Object.entries(world.races))if(!full.has(id)&&race.finished&&!race.archived){
    world.races[id]={...race,topics:[],signature:'',archived:true};delete world.races[id].evidenceRevision;
  }
}

/** Compatibility view for the race engine. World-published replies cannot be queued again. */
export function reconcileWorldNarrative(race:RaceNarrative,world?:SocialWorld):RaceNarrative {
  if(!world||narrativeWorldId(race)!==world.id)return race;
  const lines=world.posts.filter(p=>p.raceId===race.raceId),byId=new Map(race.social.map(p=>[p.id,p]));
  for(const line of lines)byId.set(line.id,line);
  return {...race,social:[...byId.values()],socialQueue:race.socialQueue?.filter(q=>!byId.has(q.line.id)),
    socialMemory:race.socialMemory&&world.memory?mergeSocialMemory(race.socialMemory,world.memory):race.socialMemory};
}
