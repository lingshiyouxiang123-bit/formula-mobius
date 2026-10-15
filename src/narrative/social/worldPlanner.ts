import type {NarrativeLine,SocialTopicGroup} from '../types';
import type {MessagePlan,SpeakerView,Stance} from '../situations/types';
import {composeMessage,messageCandidates,explainMessageCandidates} from '../situations/composer';
import {actorAccount,applySocialVoice,canSpeak} from './society';
import type {SpectatorProfile} from './types';
import type {SocialWorld,WorldPost,WorldTopic} from './world';
import {WORLD_CONTENT_REVISION,WORLD_SCENE_CONDITIONS,WORLD_CORPUS_TOPICS} from './corpusContract';

const contentVersion=WORLD_CONTENT_REVISION;
const semantics:Partial<Record<SocialTopicGroup,string>>={result:'race_classification',qualifying:'qualifying_position',strategy:'strategy_talk',pace:'pace_observation',comparison:'comparison_talk',development:'development_talk',season:'season_outlook',quiet:'quiet_chat',incident:'incident_talk',weather:'weather_talk',control:'control_talk',team_order:'team_order_talk'};
const priority:Partial<Record<SocialTopicGroup,number>>={incident:7,control:6,result:6,comparison:5,season:5,qualifying:4,strategy:4,development:4,weather:4,team_order:4,pace:3,quiet:2};
function currentRace(world:SocialWorld):string|undefined {return Object.entries(world.races).sort((a,b)=>b[1].order-a[1].order)[0]?.[0];}
function eligible(world:SocialWorld,topic:WorldTopic):boolean {
  return topic.raceId===currentRace(world)&&!!topic.context&&topic.context.tags.includes(`world_${topic.group}`)&&topic.group!=='emotion'&&topic.turns<4
    &&(topic.status!=='dormant'||!!topic.blockedReason&&world.contentVersion!==contentVersion)&&(!topic.blockedReason||world.contentVersion!==contentVersion);
}
export function worldNeedsSocialTick(world:SocialWorld):boolean {
  return !!world.queue.length||!!world.memory&&Object.values(world.topics).some(topic=>eligible(world,topic));
}
function interested(actor:SpectatorProfile,topic:WorldTopic,recent:NarrativeLine[],tick:number):number {
  const support=actor.supportsDriverId&&topic.subjectIds.includes(actor.supportsDriverId)?5:0;
  const focus=actor.focus==='results'&&['result','comparison','qualifying','season'].includes(topic.group)
    ||actor.focus==='strategy'&&['strategy','pace','development'].includes(topic.group)
    ||actor.focus==='incidents'&&topic.group==='incident';
  const fatigue=recent.filter(p=>p.account?.id===actor.id&&(p.socialTick??-20)>=tick-3).length*4;
  return support+Number(focus)*3+actor.activity-fatigue;
}
function actions(actor:SpectatorProfile,parent?:NarrativeLine):Array<[string,Stance]> {
  if(!parent)return actor.motive==='loyal'?[['support','support'],['praise','support'],['concern','critical'],['report','neutral'],['ask','curious']]
    :actor.motive==='banter'?[['tease','critical'],['challenge','critical'],['comment','neutral'],['rumor','critical'],['ask','curious'],['praise','support']]
    :[['report','neutral'],['ask','curious'],['concern','critical'],['praise','support'],['challenge','critical']];
  return actor.motive==='loyal'?[['support','support'],['defend','support'],['agree','support'],['challenge','critical'],['ask','curious'],['concern','critical'],['praise','support'],['complain','critical'],['comment','neutral']]
    :actor.motive==='banter'?[['tease','critical'],['tease','neutral'],['challenge','critical'],['complain','critical'],['ask','curious'],['agree','support'],['comment','neutral'],['rumor','critical']]
    :[['ask','curious'],['agree','support'],['challenge','critical'],['comment','neutral'],['support','support'],['concern','critical'],['correct','neutral'],['confirm','neutral'],['report','neutral'],['praise','support']];
}
function parentTags(parent:NarrativeLine,topic:WorldTopic):string[] {
  const tags=parent.plan?.expresses??[];
  return parent.kind==='fact'&&semantics[topic.group]?[...tags,semantics[topic.group]!]:tags;
}
function buildPlan(view:SpeakerView,topic:WorldTopic,actor:SpectatorProfile,act:string,stance:Stance,parent?:NarrativeLine):MessagePlan {
  return {...view,oneUtterance:true,actor,persona:actor.persona,act,stance,
    preferredTags:[view.situation.focus,...view.tags.filter(t=>t.startsWith('world_'))],
    standaloneOnly:!parent,...(parent?{parent:{id:parent.id,act:parent.plan?.act??'report',stance:parent.plan?.stance??'neutral',tags:parentTags(parent,topic)}}:{})};
}
function replyView(base:SpeakerView,parent?:NarrativeLine):SpeakerView {
  const personal=parent?.account?.role==='viewer'||parent?.provenance==='player';
  const snapshot=personal?parent.socialContext??base:base;
  return {...snapshot,tags:[...snapshot.tags.filter(tag=>!WORLD_SCENE_CONDITIONS.includes(tag as typeof WORLD_SCENE_CONDITIONS[number])),
    ...base.tags.filter(tag=>WORLD_SCENE_CONDITIONS.includes(tag as typeof WORLD_SCENE_CONDITIONS[number]))]};
}

/** A bounded actor/topic planner. No network, free-running loop, game dice or fabricated world facts. */
export function planWorldActivity(world:SocialWorld,limit=2):WorldPost[] {
  if(!world.memory||limit<=0)return [];
  if(world.contentVersion!==contentVersion){
    world.contentVersion=contentVersion;
    for(const topic of Object.values(world.topics))if(topic.blockedReason){
      delete topic.blockedReason;
      if(topic.raceId===currentRace(world)&&topic.turns<4){topic.status='active';topic.updatedTick=world.tick;}
    }
  }
  const output:WorldPost[]=[],memory=world.memory;
  const recentGroups=world.posts.slice(-10).map(post=>world.topics[post.topicId]?.group);
  const score=(topic:WorldTopic)=>(priority[topic.group]??2)-topic.turns*2+(world.tick-topic.updatedTick)*0.1
    -recentGroups.filter(group=>group===topic.group).length*2;
  const topics=Object.values(world.topics).filter(t=>eligible(world,t)).sort((a,b)=>score(b)-score(a)).slice(0,6);
  for(const topic of topics) {
    if(output.length>=limit)break;
    if(world.queue.some(q=>q.line.topicId===topic.id)||world.tick-topic.lastPlannedTick<2)continue;
    const source=world.races[topic.raceId],base=topic.context!;
    const recent=[...world.posts,...world.queue.map(q=>q.line),...output];
    const actors=Object.values(memory.profiles).filter(actor=>actor.persona!=='fan'||actor.supportsDriverId===topic.subjectIds[0])
      .sort((a,b)=>interested(b,topic,recent,world.tick)-interested(a,topic,recent,world.tick));
    const start=(world.tick+topic.turns)%Math.min(3,Math.max(1,actors.length));
    const pool=[...actors.slice(start),...actors.slice(0,start)].slice(0,8);
    let result:WorldPost|undefined,hadExpression=false;
    for(const [index,actor] of pool.entries()) {
      const matching=world.posts.filter(p=>p.topicId===topic.id&&p.account?.id!==actor.id&&!p.repostOfId);
      const npc=matching.filter(p=>p.account?.role==='viewer'&&p.plan?.expresses?.length);
      const sourcePost=world.posts.find(p=>p.id===topic.sourcePostId)??matching.at(-1);
      const mode=(world.tick+topic.turns+index)%4;
      const parent=mode!==0?(npc.at(-1)??sourcePost):undefined;
      // Replies use the parent's snapshot. They don't silently acquire future facts from a live topic.
      const view=replyView(base,parent);
      const options=actions(actor,parent),offset=(world.tick+topic.turns+index)%options.length;
      for(const [act,stance] of [...options.slice(offset),...options.slice(0,offset)]) {
        const plan=buildPlan(view,topic,actor,act,stance,parent),seed=world.tick*97+world.sequence*13+index*31+topic.turns;
        if(!applySocialVoice(plan,recent,seed,memory))continue;
        const composed=composeMessage(plan,recent,seed);if(!composed)continue;
        hadExpression=true;
        const line:WorldPost={id:`${world.id}:activity:${world.tick}:${topic.id}:${actor.id}`,raceId:topic.raceId,worldId:world.id,topicId:topic.id,
          round:source.round,socialTick:world.tick,speaker:actor.name,account:actorAccount(actor),text:composed.text,kind:'opinion',
          claimKind:plan.act==='rumor'?'rumor':'opinion',factIds:composed.factIds,eventIds:[...new Set(view.facts.flatMap(f=>f.eventIds))],
          templateId:composed.fragments.map(f=>f.id).join('+'),family:composed.fragments.map(f=>f.family).join('+'),
          provenance:[...new Set(composed.fragments.map(f=>f.provenance))].join('+'),socialContext:view,
          socialPlacement:parent?'discussion':'standalone',...(parent?{replyToId:parent.id}:sourcePost?{topicPostId:sourcePost.id}:{}),
          plan:{topic:view.situation.topic,act:plan.act,stance:plan.stance,subjectIds:view.situation.subjectIds,
            fragmentIds:composed.fragments.map(f=>f.id),expresses:composed.fragments.flatMap(f=>f.expresses??[])}};
        if(!canSpeak(actor,line,recent,seed))continue;
        // A new result can revisit a real old opinion. No invented 'you said...' or forced driver speech.
        const old=mode===0&&topic.group==='result'?world.posts.findLast(p=>p.raceId!==topic.raceId&&p.account?.id===actor.id
          &&p.plan?.subjectIds.includes(topic.subjectIds[0])&&p.text):undefined;
        if(old)line.quoteOfId=old.id;
        else if(parent&&mode===2&&parent.account?.role==='viewer'){line.quoteOfId=parent.id;delete line.replyToId;line.socialPlacement='standalone';}
        result=line;break;
      }
      if(result)break;
    }
    topic.lastPlannedTick=world.tick;
    if(result){topic.turns++;output.push(result);}
    else if(!hadExpression)topic.blockedReason='no_compatible_expression';
  }
  return output;
}

/** On-demand developer/preview data, not a persistent debug log. */
export function explainWorldTopics(world:SocialWorld) {
  return Object.values(world.topics).map(topic=>{
    const actors=Object.values(world.memory?.profiles??{});
    const candidates=topic.context?new Set(actors.filter(actor=>actor.persona!=='fan'||actor.supportsDriverId===topic.subjectIds[0])
      .flatMap(actor=>actions(actor).flatMap(([act,stance])=>messageCandidates(buildPlan(topic.context!,topic,actor,act,stance)).map(f=>f.id)))):new Set();
    return {id:topic.id,label:topic.label,raceId:topic.raceId,status:topic.status,turns:topic.turns,standaloneCandidates:candidates.size,
      queued:world.queue.filter(q=>q.line.topicId===topic.id).length,published:topic.postCount,reason:topic.blockedReason??(topic.turns>=4?'batch_budget_used':!topic.context?'no_context':topic.context.tags.includes(`world_${topic.group}`)?'ready':'legacy_archive')};
  });
}
/** Inspect a particular actor/action/parent only when requested, never as a background audit. */
export function explainWorldPlan(world:SocialWorld,topicId:string,actorId:string,act='report',stance:Stance='neutral',parentId?:string) {
  const topic=world.topics[topicId],actor=world.memory?.profiles[actorId];
  if(!topic?.context||!actor)return {reason:'missing_topic_or_actor'};
  if(actor.persona==='fan'&&actor.supportsDriverId!==topic.subjectIds[0])return {topicId,actorId,reason:'actor_not_selected_for_subject'};
  const recent=[...world.posts,...world.queue.map(item=>item.line)],parent=world.posts.find(post=>post.id===parentId);
  const plan=buildPlan(replyView(topic.context,parent),topic,actor,act,stance,parent);
  applySocialVoice(plan,recent,world.tick*97,world.memory);
  return {topicId,actorId,act:plan.act,stance:plan.stance,parentId,...explainMessageCandidates(plan,recent)};
}
/** Distinguish a scene that didn't occur from a scene whose expressions don't match. */
export function explainWorldCoverage(world:SocialWorld) {
  const current=currentRace(world),details=explainWorldTopics(world),byId=new Map(details.map(detail=>[detail.id,detail]));
  return Object.keys(WORLD_CORPUS_TOPICS).map(tag=>{
    const group=tag.slice(6),topics=Object.values(world.topics).filter(topic=>topic.raceId===current&&topic.group===group&&topic.context?.tags.includes(tag));
    const pools=topics.map(topic=>byId.get(topic.id)?.standaloneCandidates??0),compatibleTopics=pools.filter(count=>count>0).length;
    return {group,sourceTopics:topics.length,compatibleTopics,bestStandalonePool:Math.max(0,...pools),
      published:topics.reduce((sum,topic)=>sum+topic.postCount,0),
      reason:!topics.length?'no_scene_event':!compatibleTopics?'no_compatible_expression':'source_and_expressions_ready'};
  });
}
