import type { DriverState, GameState, SeasonState } from '../../game/types';
import { WEATHER_LABELS } from '../../game/uiLabels';
import type { NarrativeEvent, NarrativeLine, RaceNarrative, SocialCard } from '../types';
import { composeMessage } from '../situations/composer';
import type { MessagePlan, SpeakerView } from '../situations/types';
import { independentBloggerPosts, paddockDiscussion, paddockLine, paddockView, spectatorIdentity } from './paddock';
import {placeViewerPost} from './distribution';
import {actorAccount,applySocialVoice,bindSocialActor,canSpeak,chooseActor,rememberSocialLines} from './society';
import {socialEvolution} from './evolution';
import type {SocialMemory} from './types';
import {collectSituations,speakerView} from '../situations/world';

const eventAccount = { id: 'event:race-centre', role: 'event' as const };
function rootLine(id: string, round: number, speaker: string, text: string): NarrativeLine {
  return { id, round, speaker, text, kind: 'fact', factIds: [], eventIds: [], templateId: 'social.official', provenance: 'game', account: eventAccount };
}
function teamGroups(game: GameState) {
  const groups = new Map<string, DriverState[]>();
  for (const driver of game.drivers) if (driver.profile.teamId) {
    const id = driver.profile.teamId;
    groups.set(id, [...(groups.get(id) ?? []), driver]);
  }
  return [...groups.entries()];
}
function resultCard(game: GameState, members: DriverState[], final: boolean, title: string): SocialCard {
  return { title, rows: members.map(driver => {
    const result = final ? game.results.find(r => r.driverId === driver.id) : undefined;
    return { driverId: driver.id, name: driver.profile.name, color: driver.profile.color,
      position: final ? result?.rank : driver.qualifyingRank, status: result?.status, points: result?.points };
  }) };
}
function newsText(game: GameState, event: NarrativeEvent): string | undefined {
  const log = game.logs.find(l => l.id === event.eventIds[0]);
  const input = log?.details?.input ?? {};
  const names = event.subjects.map(id => game.drivers.find(d => d.id === id)?.profile.name).filter(Boolean);
  if (log?.details?.result === 'drs_used') return `${names[0]}启用 DRS。`;
  if (log?.details?.result?.startsWith('blue_flag_')) return event.text;
  if (log?.code === 'incident.contact') return `${names.slice(0, 2).join(' 与 ')}发生接触。`;
  if (log?.code === 'incident.race_control') return ({vsc_deployed:'赛会部署 VSC。',sc_deployed:'安全车出动。',red_flag:'红旗，比赛暂停。',green:'恢复绿旗，比赛继续。'} as Record<string,string>)[log.details?.result??''];
  if (log?.code === 'incident.yellow') return '赛道出现局部黄旗，事故赛段禁止超车。';
  if (log?.code === 'weather.transition') return `赛道天气更新：${WEATHER_LABELS[log.details?.result as keyof typeof WEATHER_LABELS]??'天气变化'}。`;
  if (log?.code === 'classification.result' && log.details?.result==='retired') return `${names[0]}退赛。`;
  if (log?.code === 'team.order') return undefined; // Crew decisions and relationship values aren't official race news.
  if (log?.code === 'movement.step') return log.details?.result === 'overtake'
    ? `${names[0]}超过${names[1]}。` : `${names[0]}与${names[1]}的攻防暂告一段落。`;
  if (log?.code === 'pit.service') return `${names[0]}${log.details?.result === 'exited' ? '离开维修区。' : input.service ? '进入维修区换胎。' : '进入维修通道。'}`;
  if (log?.code === 'incident.damage') {
    if (/判罚|扣.*VP|须通过维修/.test(event.text)) return event.text.replace(/判罚骰为\s*\d+，/g, '');
    return names.length ? `${names.join('、')}出现赛道事故，现场继续跟进。` : undefined;
  }
  if (log?.code === 'classification.result' && game.phase === 'finished') return undefined;
  // Facts from existing race-control messages, not invented account chatter or penalty dice narration.
  return event.text.replace(/判罚骰为\s*\d+，/g, '').replace(/D12\([^)]*\)/g, '').replace(/，队友关系.+$/, '。');
}

/** Reparent generated opinions under official posts, then release discussion in finite batches. */
export function syncSocialNetwork(state: RaceNarrative, game: GameState, fresh: NarrativeEvent[], previousIds: Set<string>, season?: SeasonState) {
  const session = game.raceSession ?? 'race';
  state.socialQueue ??= [];
  const additions = state.social.filter(line => !previousIds.has(line.id));
  state.social = state.social.filter(line => previousIds.has(line.id));
  const all = () => [...state.social, ...state.socialQueue!.map(item => item.line)];
  const ensure = (line: NarrativeLine) => {
    const existing = all().find(p => p.id === line.id);
    if (existing) return existing;
    state.social.push(line); return line;
  };
  const publishStory = (root: NarrativeLine) => {
    const existing=all().find(p=>p.id===root.id);
    if(existing?.socialContext?.situation.topic==='paddock') return;
    if(existing) Object.assign(existing,root);
    else ensure(root);
    additions.push(...paddockDiscussion(root,[...all(),...additions],(game.initialSeed??905)+root.round*97+additions.length,state.socialMemory));
  };
  const human = game.drivers.find(d=>d.id===game.humanDriverId)!;
  state.socialTopics = [];
  const officialDiscussion = (root: NarrativeLine, context: SpeakerView, expresses: string[]) => {
    const stored = ensure(root);
    stored.socialContext = context;
    stored.plan = {topic:'paddock',act:'report',stance:'neutral',subjectIds:context.situation.subjectIds,fragmentIds:[],expresses};
    // Also backfill saved races once; no regeneration of the race or old conversations.
    const marker = `${root.id}:discussion:g2c`;
    if (state.alerts[marker] === undefined) {
      additions.push(...paddockDiscussion({...stored,id:marker},[...all(),...additions],(game.initialSeed??905)+root.round*97,state.socialMemory)
        .map(line=>({...line,replyToId:line.replyToId===marker?root.id:line.replyToId})));
      state.alerts[marker] = game.round;
    }
    return stored;
  };
  if (game.qualifying.length && !['setup','practice','qualifying'].includes(game.phase)) {
    const view = paddockView(game,[human],['qualifying_result'],'qualifying_result');
    const id = `${game.id}:${session}:social:qualifying`;
    officialDiscussion({...rootLine(id,0,'赛事中心',`${game.track.name} · 排位结束，发车位确认。`),
      card:resultCard(game,game.drivers.slice().sort((a,b)=>a.qualifyingRank-b.qualifyingRank),false,'排位 / 发车位')},view,['qualifying_position']);
    state.socialTopics.push({id:'qualifying',label:'排位 / 发车位',group:'qualifying',context:view,postId:id});
  }
  const teamName = (members: DriverState[], index: number) => members.find(d=>d.profile.team?.name)?.profile.team?.name ?? members.find(d=>d.profile.contract?.teamName)?.profile.contract?.teamName ?? `围场车队 ${index+1}`;
  const teamStory = (id: string, members: DriverState[], index: number, view: SpeakerView, factual: string, blog=false): NarrativeLine => {
    const caption=paddockLine(id,view,'team_staff','report','neutral',[...all(),...additions],(game.initialSeed??905)+view.situation.round*31+index);
    return { ...rootLine(id,view.situation.round,teamName(members,index),factual),
      ...(caption?{text:caption.text,templateId:caption.templateId,family:caption.family,plan:caption.plan,provenance:'game+luna_rp'}:{}),
      ...(blog?{plan:{topic:'paddock' as const,act:'report',stance:'neutral' as const,subjectIds:view.situation.subjectIds,fragmentIds:caption?.plan?.fragmentIds??[],expresses:[...(caption?.plan?.expresses??[]),'race_classification']}}:{}),
      eventIds:[...new Set(view.facts.flatMap(f=>f.eventIds))],factIds:view.facts.map(f=>f.id),socialContext:view,socialKind:blog?'blog':'update',
      account:{id:`team:${members[0].profile.teamId}`,role:'team',teamId:members[0].profile.teamId} };
  };
  const openingId = `${game.id}:${session}:social:opening`;
  let opening = all().find(p => p.id === openingId);
  if (game.round > 0 && !['practice', 'qualifying', 'preRace', 'setup'].includes(game.phase)) {
    opening = ensure({ ...rootLine(openingId, 1, '赛事中心', `${game.track.name} · ${session === 'sprint' ? '冲刺赛' : '正赛'}开始。一起看比赛。`),
      card: resultCard(game, game.drivers.slice().sort((a,b) => a.qualifyingRank-b.qualifyingRank), false, '发车阵容') });
    for (const [index, [teamId, members]] of teamGroups(game).entries()) {
      const name = members.find(d => d.profile.team?.name)?.profile.team?.name ?? members.find(d => d.profile.contract?.teamName)?.profile.contract?.teamName ?? `围场车队 ${index+1}`;
      ensure({ ...rootLine(`${openingId}:team:${teamId}`, 1, name, `${members.map(d => d.profile.name).join(' / ')}，准备发车。`),
        account: { id: `team:${teamId}`, role: 'team', teamId }, card: resultCard(game, members, false, '本站发车位') });
    }
  }
  const eventRoots = new Map<number, NarrativeLine>();
  for (const event of fresh) {
    const text = newsText(game, event);
    if (!text || /正赛开始|冲刺赛开始/.test(text)) continue;
    const situation=collectSituations(game,[event])[0];
    const context = additions.find(p => p.eventIds.some(id => event.eventIds.includes(id)))?.socialContext
      ?? (situation&&state.voiceMemory?speakerView(game,situation,'social',state.voiceMemory):undefined);
    const root = ensure({ ...rootLine(`${game.id}:${session}:social:event:${event.eventIds[0]}`, event.round, '赛事中心', text),
      eventIds: event.eventIds, factIds: event.factIds, ...(context ? { socialContext: context } : {}) });
    event.eventIds.forEach(id => eventRoots.set(id, root));
    const log=game.logs.find(l=>l.id===event.eventIds[0]);
    const tag=log?.code==='pit.service' ? log.details?.result==='exited'?'pit_exit':log.details?.input?.service?'pit_entry':undefined
      : log?.code==='incident.contact'?'contact':log?.code==='classification.result'&&log.details?.result==='retired'?'retired':undefined;
    if(tag)for(const [index,[teamId,members]] of teamGroups(game).entries()) {
      const involved=members.filter(d=>event.subjects.includes(d.id));
      if(!involved.length)continue;
      if(all().some(p=>p.account?.teamId===teamId&&p.socialKind==='update'&&p.round<=event.round&&event.round-p.round<3))continue;
      const ordered=[...involved,...members.filter(d=>!involved.includes(d))];
      const view=paddockView(game,ordered,['team_update',tag],tag,event.eventIds);
      publishStory(teamStory(`${game.id}:${session}:social:team-update:${teamId}:${event.eventIds[0]}`,ordered,index,view,text));
    }
  }
  let finalRoot: NarrativeLine | undefined;
  if (game.phase === 'finished' && game.results.length) {
    const view = paddockView(game,[human],['race_result'],'race_result',[],season);
    finalRoot = officialDiscussion({ ...rootLine(`${game.id}:${session}:social:classification`, game.round, '赛事中心', `${game.track.name} · 比赛结束，本站分类出炉。`),
      card: resultCard(game, game.results.map(r => game.drivers.find(d => d.id === r.driverId)!).filter(Boolean), true, '本站最终分类') },view,['race_classification',...view.tags]);
    state.socialTopics.push({id:'result',label:'本站结果',group:'result',context:view,postId:finalRoot.id});
    for (const [index, [teamId, members]] of teamGroups(game).entries()) {
      const view=paddockView(game,members,['team_result'],'team_result',[],season);
      // The result card carries both cars. Caption length/shape is not forced into a recap report.
      const text=String(view.slots.resultSummary);
      publishStory({ ...teamStory(`${finalRoot.id}:team:${teamId}`,members,index,view,text,true),card:resultCard(game,members,true,'车队本站结果') });
    }
    if(season&&game.seasonId===season.id&&season.rounds.some(r=>r.raceId===game.id)) {
      const human=game.drivers.find(d=>d.id===game.humanDriverId)!;
      const view=paddockView(game,[human],['standings_update'],'standings_update',[],season);
      const standings=season.standings.slice().sort((a,b)=>b.championshipPoints-a.championshipPoints||a.name.localeCompare(b.name));
      const text=`${game.track.name}结算后 · 车手积分：${standings.map(s=>`${s.name} ${s.championshipPoints} 分`).join(' / ')}。`;
      const caption=paddockLine(`${finalRoot.id}:standings`,view,'team_staff','report','neutral',all(),game.initialSeed??905);
      publishStory({...rootLine(`${finalRoot.id}:standings`,game.round,'赛事中心',text),socialContext:view,plan:caption?.plan});
    }
  }
  const base = state.socialTopics.find(t=>t.group==='result') ?? state.socialTopics.find(t=>t.group==='qualifying');
  for (const [mood,label] of [['support','支持'],['frustration','失望'],['surprise','惊讶'],['relief','松口气'],['banter','吐槽']]) {
    const tag = `emotion_${mood}`;
    const tags = [...(base?.context.tags??[]),tag];
    state.socialTopics.push({id:tag,label:`情绪 · ${label}`,group:'emotion',
      context:paddockView(game,[human],tags,tag,[],season),postId:base?.postId});
  }
  if(state.socialMemory)rememberSocialLines(state.socialMemory,game.id,state.social);
  additions.push(...independentBloggerPosts(all().filter(line => line.account?.role === 'event' || line.account?.role === 'team'),
    [...all(), ...additions], game.initialSeed ?? 905, state.socialMemory));
  additions.unshift(...socialEvolution(state,game));
  const inserted = new Set(all().map(p => p.id));
  const skipped = new Set<string>();
  let offset = 0;
  let candidateIndex=0;
  for (const line of additions) {
    // A bare fallback news message isn't a spectator pretending to be a broadcaster.
    if (line.templateId === 'social.news') continue;
    if(line.replyToId&&skipped.has(line.replyToId)){skipped.add(line.id);continue;}
    line.account ??= { id: `viewer:${line.speaker}`, role: 'viewer' };
    if(state.socialMemory&&!bindSocialActor(line,state.socialMemory,all(),(game.initialSeed??905)+candidateIndex++*97+(line.eventIds[0]??0))){skipped.add(line.id);continue;}
    if (!line.replyToId && !line.repostOfId) {
      const teamResult = finalRoot && line.account?.supportsDriverId ? all().find(p=>p.account?.role==='team' && p.id.startsWith(finalRoot!.id) && p.card?.rows.some(row=>row.driverId===line.account?.supportsDriverId)) : undefined;
      const root = line.eventIds.map(id => eventRoots.get(id)).find(Boolean) ?? teamResult ?? finalRoot ?? opening;
      if(!placeViewerPost(line,root,all(),(game.initialSeed??905)+offset)){skipped.add(line.id);continue;}
    }
    if (!inserted.has(line.id)) {
      state.socialQueue.push({ line, dueRound: game.round + 1 + Math.floor(offset++ / (line.socialContext?.tags.includes('contact')?4:3)) }); inserted.add(line.id);
    }
    if (line.socialContext?.tags.includes('contact') && offset % 3 === 1) {
      const rootId = line.replyToId;
      const parent = all().find(p => p.id === rootId);
      if (parent?.account?.role === 'event' && !all().some(p=>p.repostOfId===parent.id)) {
        const repost={ ...line, id: `${line.id}:repost`, text: '', replyToId: undefined,
          repostOfId: parent.id, socialContext: parent.socialContext };
        if(!repost.account?.profile||canSpeak(repost.account.profile,repost,all(),game.initialSeed??905))
          state.socialQueue.push({ line:repost, dueRound: game.round + 2 });
      }
    }
  }
  // Parent first, even when different events are queued together.
  const waiting = state.socialQueue;
  state.socialQueue = [];
  const available = new Set(state.social.map(p => p.id));
  for (const item of waiting) {
    const parent = item.line.replyToId ?? item.line.repostOfId;
    if (item.dueRound <= game.round && (!parent || available.has(parent))) {
      state.social.push(item.line); available.add(item.line.id);
    } else state.socialQueue.push(item);
  }
  if(state.socialMemory)rememberSocialLines(state.socialMemory,game.id,state.social);
  const queuedIds = new Set(retainSocialThreads(state.socialQueue.map(item=>item.line), 70).map(line=>line.id));
  state.socialQueue = state.socialQueue.filter(item=>queuedIds.has(item.line.id));
}

/** A small intent recognizer: unknown free text gets no pretend semantic understanding. */
export function responsesToPlayer(post: NarrativeLine, context: SpeakerView | undefined, recent: NarrativeLine[], seed: number, society?:SocialMemory): NarrativeLine[] {
  if (!context) return [];
  const text = post.text;
  const named = [context.slots.driver,context.slots.otherDriver].some(name=>typeof name==='string'&&name.length>0&&text.includes(name));
  const emotion = context.situation.focus.startsWith('emotion_') ? context.situation.focus : undefined;
  const racing = /让|空间|关门|接触|撞|挤|责|五五|赛会|罚|角度|队友|车|攻防|比赛|洗|P\d|SC|DNF|轮胎|积分|进站|赛季|完赛|退赛|排位|杆位|结果/i.test(text);
  if(!named&&!racing&&!emotion&&!/^(加油|不错|漂亮|支持|真不错|好耶)[！!。]*$/.test(text))return [];
  const act = /谁.*错|谁.*责|该.*让|故意|全责|乱撞|离谱|凭啥|胡扯|关门|挤|空间|五五|没事|罚/.test(text) ? 'challenge'
    : /支持|加油|不错|漂亮|不差|我站/.test(text) ? 'support'
    : /[?？]|怎么|为什么|多少|什么情况/.test(text) ? 'ask'
    : emotion || context.situation.topic==='paddock'&&/积分|拿分|没分|退赛|DNF|进步|往前|往后|下滑|完赛|进站|赛季|可惜|失望|排位|杆位|结果|P\d/i.test(text)?'report':undefined;
  if (!act) return [];
  const tags = [
    ...(/让|消失|白送/.test(text)?['claim_space']:[]), ...(/挤|关门|空间/.test(text)?['cramped']:[]),
    ...(/全责|五五|一半/.test(text)?['equal_blame']:[]), ...(/两个|两边/.test(text)?['both_committed']:[]),
    ...(/罚|赛会/.test(text)?['penalty_talk']:[]), ...(/严重|没事|受影响/.test(text)?['severity_talk']:[]),
    ...(/角度|没看清/.test(text)?['unknown_angle']:[]), ...(/队友/.test(text)?['teammate_risk']:[]),
    ...(act==='support'?['defend_driver']:[])
  ];
  if(context.situation.topic==='paddock') {
    const paddockTags=[...(/分|积分/.test(text)?['points_focus']:[]),...(/进步|往前|上升/.test(text)?['position_gain']:[]),...(/掉|往后|下滑/.test(text)?['position_loss']:[]),
      ...(/退赛|DNF/i.test(text)?['retirement_disappointment']:[]),...(/双车|两台.*回来|两台.*完赛/.test(text)?['double_finish_support']:[]),
      ...(/失望|可惜|没分/.test(text)?['result_disappointment']:[]),...(/进站|换胎/.test(text)?['pit_execution']:[]),...(/接触|撞|车况/.test(text)?['team_risk']:[]),
      ...(/赛季|积分榜/.test(text)?['season_outlook']:[]),...(/排位|杆位/.test(text)?['qualifying_position']:[]),...(/结果|P\d/.test(text)?['race_classification']:[]),
      ...(emotion?[emotion]:[]),...(act==='support'?['result_support']:[]),...(act==='ask'||act==='challenge'?['team_question']:[])];
    tags.splice(0,tags.length,...paddockTags);
  }
  // Metadata describes the actual input recognised above, never authors words/actions for the player.
  post.plan ??= {topic:context.situation.topic,act,stance:act==='support'?'support':act==='ask'?'curious':'critical',
    subjectIds:context.situation.subjectIds,fragmentIds:[],expresses:tags};
  const choices = [['fan','agree','support'],['ordinary_viewer','challenge','critical'],['technical_fan','ask','curious'],['fan','support','support'],['ordinary_viewer','agree','support'],['blogger','ask','curious'],['troll','agree','support']];
  const addressed=recent.find(p=>p.id===post.replyToId)?.account?.profile;
  if(addressed)choices.sort((a,b)=>Number(b[0]===addressed.persona)-Number(a[0]===addressed.persona));
  const result: NarrativeLine[] = [];
  for (const [index, [persona, replyAct, stance]] of choices.entries()) {
    const plan: MessagePlan = { ...context, persona, act: replyAct, stance: stance as MessagePlan['stance'],
      preferredTags: [context.situation.focus], parent: { id: post.id, act, tags, stance: act === 'support' ? 'support' : act === 'ask' ? 'curious' : 'critical' } };
    if(addressed?.persona===persona)plan.actor=addressed;
    const addressedView=society?.opinions[plan.actor?.id??'']?.findLast(o=>o.subjectIds.includes(context.situation.subjectIds[0]));
    if(addressedView&&post.replyToId===addressedView.lineId) {
      plan.parent!.tags=[...new Set([...tags,...addressedView.tags])];
      if(addressedView.tags.some(t=>['pit_guess','retirement_guess'].includes(t))) {
        plan.tags=[...plan.tags,'g3_rumor_question'];plan.preferredTags=['g3_rumor_question'];
      }
    }
    if(!applySocialVoice(plan,[...recent,post,...result],seed+index*97,society))continue;
    const ownPrevious=society?.opinions[plan.actor?.id??'']?.findLast(o=>o.subjectIds.includes(context.situation.subjectIds[0]));
    const composed = composeMessage(plan, [...recent, ...result], seed + index * 97);
    if (!composed) continue;
    const followupSource=ownPrevious&&(post.replyToId===ownPrevious.lineId||composed.fragments.some(f=>f.requires.includes('g3_followup')))?ownPrevious.lineId:undefined;
    const {speaker,account}=plan.actor?{speaker:plan.actor.name,account:actorAccount(plan.actor)}:spectatorIdentity(persona,context.situation.subjectIds[0],String(context.slots.driver??''));
    if(result.some(p=>p.speaker===speaker))continue;
    result.push({ id: `${post.id}:npc:${index}`, round: post.round, speaker, text: composed.text, kind: 'opinion',
      factIds: composed.factIds, eventIds: post.eventIds, templateId: composed.fragments.map(f => f.id).join('+'),
      family: composed.fragments.map(f => f.family).join('+'), provenance: 'luna_rp', replyToId: post.id,
      account, socialContext: context,
      ...(followupSource?{evolution:{kind:'followup' as const,sourceId:followupSource}}:{}),
      plan: { topic: context.situation.topic, act: plan.act, stance: plan.stance, subjectIds: context.situation.subjectIds, fragmentIds: composed.fragments.map(f => f.id), expresses:composed.fragments.flatMap(f=>f.expresses??[]) } });
    if(plan.actor&&!canSpeak(plan.actor,result.at(-1)!,recent,seed,true)){result.pop();continue;}
    if(result.length===2)break;
  }
  return result;
}

export function retainSocialThreads(lines: NarrativeLine[], limit = 220, pending:NarrativeLine[]=[]): NarrativeLine[] {
  const ids = new Set(lines.slice(-limit).map(p => p.id));
  const byId = new Map(lines.map(p => [p.id,p]));
  for(const post of pending) {
    for(const parent of [post.replyToId,post.repostOfId,post.quoteOfId])if(parent&&byId.has(parent))ids.add(parent);
  }
  for (const id of ids) {
    const line = byId.get(id);
    for(const parent of [line?.replyToId,line?.repostOfId,line?.quoteOfId])if(parent&&byId.has(parent))ids.add(parent);
  }
  return lines.filter(p => ids.has(p.id));
}
