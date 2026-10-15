import type {DriverProfile,DriverState,GameState,SeasonState,TeamProfile} from '../../game/types';
import {OFF_TRACK_ACTIONS,TEAM_FACILITIES} from '../../game/career';
import {STAT_LABELS,TIRE_LABELS,WEATHER_LABELS} from '../../game/uiLabels';
import {TRACKS} from '../../game/tracks';
import type {NarrativeLine,SocialAccount,SocialTopic,SocialTopicGroup} from '../types';
import type {SpeakerView,WorldFact} from '../situations/types';
import {buildRaceVoiceContext} from '../raceVoiceContext';
import {paddockView} from './paddock';
import {worldSceneCondition} from './corpusContract';

export interface SocialSourceArchives {profiles?:DriverProfile[];teams?:TeamProfile[]}
const labels:Record<string,string>={result:'本站赛果',qualifying:'排位与发车',strategy:'轮胎与策略',pace:'节奏与攻防',comparison:'车手对照',development:'车队动态',season:'赛季形势',quiet:'围场闲聊',incident:'事故与判罚',weather:'天气',control:'旗况与重启',team_order:'队内换位'};

/** Only concrete selected fields enter the social layer, never whole driver/season objects. */
function viewFor(game:GameState,subjects:string[],group:SocialTopicGroup,key:string,tags:string[],slots:SpeakerView['slots'],eventIds:number[]=[],sourceLabel='赛道计时与比赛记录',round=game.round):SpeakerView {
  const sourceKey=`${game.id}:${game.raceSession??'race'}:social-facts:${key}`;
  const facts:WorldFact[]=Object.entries(slots).map(([predicate,value])=>({
    id:`${sourceKey}:${predicate}`,subjectId:(predicate.startsWith('other')?subjects[1]:subjects[0])??'race',predicate,value,round,
    unit:['gapCells'].includes(predicate)?'格':['lapRounds','stintAge'].includes(predicate)?'回合':undefined,
    source:'state',sourceLabel,visibility:'public',eventIds,
  }));
  return {channel:'social',facts,tags:[`world_${group}`,worldSceneCondition(game.phase),...tags],slots,
    situation:{id:sourceKey,topic:'paddock',round,subjectIds:subjects,facts,focus:`world_${group}`,importance:group==='quiet'?1:3}};
}
function topic(group:SocialTopicGroup,view:SpeakerView,key:string,sourcePost?:NarrativeLine):SocialTopic {
  return {id:`${group}:${key}`,label:labels[group]??group,group,context:view,postId:sourcePost?.id,sourcePost};
}
function announcement(id:string,view:SpeakerView,account:SocialAccount,speaker:string,text:string):NarrativeLine {
  return {id,round:view.situation.round,speaker,text,kind:'fact',claimKind:'report',account,templateId:'social.world-source',provenance:'game',
    factIds:view.facts.map(f=>f.id),eventIds:[...new Set(view.facts.flatMap(f=>f.eventIds))],socialContext:view,
    plan:{topic:'paddock',act:'report',stance:'neutral',subjectIds:view.situation.subjectIds,fragmentIds:[],expresses:view.tags}};
}
function teamName(driver:DriverState,archives:SocialSourceArchives):string|undefined {
  return archives.teams?.find(t=>t.id===driver.profile.teamId)?.name??driver.profile.team?.name??driver.profile.contract?.teamName;
}
function reception(delta?:number):{tags:string[];slots:SpeakerView['slots'];text:string} {
  // A capped/unchanged number doesn't prove indifference. Only a real directional change is used.
  return delta?{tags:[delta>0?'reception_positive':'reception_negative'],slots:{reception:delta>0?'积极':'负面'},text:delta>0?'本次活动反馈积极。':'本次活动引起负面反馈。'}:{tags:[],slots:{},text:''};
}

/** Event adapters, not language templates: every tag/slot is backed by game data. */
export function buildWorldTopics(game:GameState,season?:SeasonState,archives:SocialSourceArchives={}):SocialTopic[] {
  const topics:SocialTopic[]=[],human=game.drivers.find(d=>d.id===game.humanDriverId);
  if(!human)return topics;
  const session=game.raceSession??'race',active=!['setup','practice','qualifying','preRace','finished'].includes(game.phase);
  const sessionStart=game.logs.findLast(log=>(log.code==='weekend.sprint'||log.code==='race.info')&&log.details?.result==='started'||/^正赛开始/.test(log.message))?.id??0;
  const sessionLogs=game.logs.filter(log=>log.id>=sessionStart);
  const eventPostId=(id:number)=>`${game.id}:${session}:social:event:${id}`;
  const timing=buildRaceVoiceContext(game),humanTeam=teamName(human,archives);
  const common={driver:human.profile.name,track:game.track.name,...(humanTeam?{team:humanTeam}:{})};
  const recentEvents=sessionLogs.filter(log=>['incident.contact','classification.result','penalty.time','penalty.track_limit','penalty.tire_obligation','incident.yellow'].includes(log.code??''));
  for(const log of recentEvents.slice(-12)) {
    const input=log.details?.input??{},result=log.details?.result;
    const driver=game.drivers.find(d=>d.id===String(input.driverId??input.attackerId));
    const other=game.drivers.find(d=>d.id===String(input.defenderId));
    const tags:string[]=[],slots:SpeakerView['slots']={track:game.track.name,...(driver?{driver:driver.profile.name}:{}),...(other?{otherDriver:other.profile.name}:{})};
    if(log.code==='incident.contact'&&driver&&other) {
      tags.push('contact');if(driver.profile.teamId&&driver.profile.teamId===other.profile.teamId)tags.push('same_team');
      const affected=game.drivers.find(d=>d.id===input.affectedDriverId);
      if(affected)slots.affectedDriver=affected.profile.name;
      if(typeof input.damage==='string'){slots.damage=input.damage;if(input.damage==='light')tags.push('light_damage');if(input.damage==='heavy')tags.push('heavy_damage');}
    } else if(log.code==='classification.result'&&result==='retired'&&driver)tags.push('retired');
    else if(log.code==='classification.result'&&result==='penalty_classification'&&driver&&game.phase==='finished') {
      tags.push('penalty_classification');
      if(typeof input.onTrackRank==='number')slots.onTrackPosition=input.onTrackRank;
      if(typeof input.rank==='number')slots.position=input.rank;
      if(typeof input.penaltySeconds==='number')slots.penaltySeconds=input.penaltySeconds;
      if(typeof input.penaltyCells==='number')slots.penaltyCells=input.penaltyCells;
    } else if(log.code==='penalty.time'&&driver) {
      tags.push('time_penalty');if(typeof input.seconds==='number')slots.penaltySeconds=input.seconds;if(typeof input.cells==='number')slots.penaltyCells=input.cells;
    } else if(log.code==='penalty.track_limit'&&driver) {
      tags.push(result==='recorded'?'track_limit_recorded':result==='warning'?'track_limit_warning':'time_penalty');
      if(typeof input.count==='number')slots.limitCount=input.count;
      if(result==='time_5'){slots.penaltySeconds=5;slots.penaltyCells=2;}if(result==='time_20'){slots.penaltySeconds=20;slots.penaltyCells=10;}
    } else if(log.code==='penalty.tire_obligation'&&driver) {
      tags.push('time_penalty');if(typeof input.seconds==='number')slots.penaltySeconds=input.seconds;if(typeof input.cells==='number')slots.penaltyCells=input.cells;
    }
    else if(log.code==='incident.yellow')tags.push('local_yellow');
    if(!tags.length)continue;
    const subjects=[...(driver?[driver.id]:[]),...(other?[other.id]:[])];
    const view=viewFor(game,subjects,'incident',`incident:${log.id}`,tags,slots,[log.id],'赛会与已发生的赛道事件',log.round);
    if(typeof input.affectedDriverId==='string')for(const fact of view.facts)if(['damage','affectedDriver'].includes(fact.predicate))fact.subjectId=input.affectedDriverId;
    topics.push({...topic('incident',view,`${log.id}`),postId:eventPostId(log.id)});
  }
  const controlLog=sessionLogs.findLast(log=>log.code==='incident.race_control'&&['vsc_deployed','sc_deployed','red_flag','green','standing_restart'].includes(log.details?.result??''));
  if(active||controlLog) {
    const controlLabels={green:'绿旗',sc:'安全车',vsc:'虚拟安全车',red_flag:'红旗'};
    const tags=[`control_${game.raceControl}`,...(controlLog?.details?.result==='green'?['control_restored']:[]),...(controlLog?.details?.result==='standing_restart'?['standing_restart']:[])];
    const view=viewFor(game,[],'control',`control:${controlLog?.id??'initial'}:${game.raceControl}`,tags,{track:game.track.name,control:controlLabels[game.raceControl]},controlLog?[controlLog.id]:[],'当前旗况与赛会消息');
    topics.push({...topic('control',view,'flags'),...(controlLog?{postId:eventPostId(controlLog.id)}:{})});
  }
  if(game.weather) {
    const change=sessionLogs.findLast(log=>log.code==='weather.transition'&&log.details?.input?.from!==log.details?.result);
    const old=change?.details?.input?.from;
    const view=viewFor(game,[],'weather',`weather:${change?.id??'initial'}:${game.weather}`,[game.weather.includes('rain')?'wet_weather':'dry_weather',...(change?['weather_changed']:[])],
      {track:game.track.name,weather:WEATHER_LABELS[game.weather],...(typeof old==='string'&&old in WEATHER_LABELS?{oldWeather:WEATHER_LABELS[old as keyof typeof WEATHER_LABELS]}:{})},change?[change.id]:[],'赛道天气观察');
    topics.push({...topic('weather',view,'weather'),...(change?{postId:eventPostId(change.id)}:{})});
  }
  const executedOrder=sessionLogs.findLast(log=>log.code==='team.order'&&log.details?.result==='accepted'&&log.details?.input?.reason!=='qualifying_tow');
  if(executedOrder) {
    const beneficiary=game.drivers.find(d=>d.id===executedOrder.details?.input?.beneficiaryId),yielding=game.drivers.find(d=>d.id===executedOrder.details?.input?.yieldingDriverId);
    if(beneficiary&&yielding) {
      const team=teamName(beneficiary,archives),key=`${game.id}:${session}:team-order-executed:${executedOrder.id}`;
      const view=viewFor(game,[beneficiary.id,yielding.id],'team_order',key,['order_executed'],{driver:beneficiary.profile.name,otherDriver:yielding.profile.name,track:game.track.name,...(team?{team}:{})},[executedOrder.id],'实际执行的队内换位',executedOrder.round);
      topics.push(topic('team_order',view,key,team?announcement(key,view,{id:`team:${beneficiary.profile.teamId}`,role:'team',teamId:beneficiary.profile.teamId},team,`${beneficiary.profile.name}与${yielding.profile.name}已执行队内换位安排。`):undefined));
    }
  }
  if(game.qualifying.length)for(const driver of game.drivers) {
    const view=paddockView(game,[driver],['qualifying_result','world_qualifying'],'world_qualifying');
    if(driver.pitLaneStart){delete view.slots.startPosition;view.facts=view.facts.filter(f=>f.predicate!=='startPosition');view.tags=view.tags.filter(t=>!['pole_result','qualifying_front','qualifying_midfield','qualifying_back'].includes(t));view.tags.push('pit_lane_start');}
    else view.tags.push('has_start_position');
    topics.push({id:`qualifying:${driver.id}`,group:'qualifying',label:'排位与发车',context:view,postId:`${game.id}:${session}:social:qualifying`});
  }
  for(const log of sessionLogs.filter(l=>l.code==='movement.step'&&['overtake','defended','blue_flag_passed','attack_declined'].includes(l.details?.result??'')||l.details?.result==='drs_used').slice(-5)) {
    const input=log.details?.input??{},outcome=log.details?.result;
    const driver=game.drivers.find(d=>d.id===(outcome==='defended'?input.defenderId:input.attackerId??input.driverId));
    const other=game.drivers.find(d=>d.id===(outcome==='defended'?input.attackerId:input.defenderId??input.otherDriverId));
    if(!driver)continue;
    const tags=[outcome==='blue_flag_passed'?'blue_flag_pass':outcome!],slots:SpeakerView['slots']={driver:driver.profile.name,track:game.track.name,...(other?{otherDriver:other.profile.name}:{})};
    if(typeof input.gapCells==='number'){slots.gapCells=input.gapCells;tags.push('has_gap');}
    if(typeof input.lastLapRounds==='number'){slots.lapRounds=input.lastLapRounds;tags.push('has_lap_time');}
    if(typeof input.position==='number')slots.position=input.position;
    const view=viewFor(game,[driver.id,...(other?[other.id]:[])],'pace',`action:${log.id}`,tags,slots,[log.id],'已经完成的赛道动作',log.round);
    topics.push({...topic('pace',view,`action:${log.id}`),...(outcome==='overtake'||outcome==='defended'||outcome==='drs_used'||outcome==='blue_flag_passed'?{postId:eventPostId(log.id)}:{})});
  }
  // Results use the finalized classification (including penalties), never live progress order.
  if(game.phase==='finished') {
    const playerResult=game.results.find(r=>r.driverId===human.id);
    if(playerResult&&playerResult.status!=='dnf') {
      const teammate=game.drivers.find(d=>d.id!==human.id&&d.profile.teamId&&d.profile.teamId===human.profile.teamId);
      const rival=game.drivers.find(d=>d.id!==human.id&&d.profile.teamId!==human.profile.teamId&&game.results.some(r=>r.driverId===d.id&&r.status!=='dnf'));
      for(const other of [teammate,rival]) {
        const result=game.results.find(r=>r.driverId===other?.id);if(!other||!result||result.status==='dnf')continue;
        const tags=[other===teammate?'teammate_comparison':'rival_comparison',playerResult.rank<result.rank?'comparison_ahead':'comparison_behind'];
        const slots={...common,otherDriver:other.profile.name,position:playerResult.rank,otherPosition:result.rank,points:playerResult.points,otherPoints:result.points,
          ...(!human.pitLaneStart?{startPosition:human.qualifyingRank}:{}),...(!other.pitLaneStart?{otherStartPosition:other.qualifyingRank}:{})};
        const view=viewFor(game,[human.id,other.id],'comparison',`classification:${human.id}:${other.id}`,tags,slots,[],'本站最终分类');
        topics.push(topic('comparison',view,other.id));
      }
    }
    // Give each driver a result perspective, not only the player's result repeated by every fan.
    for(const driver of game.drivers) {
      const view=paddockView(game,[driver],['race_result','world_result'],'world_result',[],season);
      if(driver.pitLaneStart){delete view.slots.startPosition;view.facts=view.facts.filter(f=>f.predicate!=='startPosition');}else view.tags.push('has_start_position');
      topics.push({id:`result:${driver.id}`,group:'result',label:'本站赛果',context:view,postId:`${game.id}:${session}:social:classification`});
    }
  }
  if(active)for(const driver of game.drivers.filter(d=>d.status==='racing'&&(!d.pit||d.pit.service))) {
    const info=timing.drivers[driver.id],pitLogs=sessionLogs.filter(l=>l.code==='pit.service'&&l.details?.input?.driverId===driver.id);
    const exits=pitLogs.filter(l=>l.details?.result==='exited'),lastExit=exits.at(-1);
    const strategyLog=driver.pit?pitLogs.findLast(l=>l.details?.input?.service===true):lastExit;
    const pitStops=driver.raceStats?.pitStops??pitLogs.filter(l=>l.details?.input?.service===true).length;
    const stintAge=!driver.pit&&(lastExit||pitStops===0)?Math.max(0,game.round-(lastExit?.round??1)):undefined;
    const base={driver:driver.profile.name,track:game.track.name,tire:TIRE_LABELS[driver.tire],pitStops,...(stintAge!==undefined?{stintAge}:{}),
      ...(teamName(driver,archives)?{team:teamName(driver,archives)!}:{})};
    const strategy=viewFor(game,[driver.id],'strategy',`stint:${driver.id}:${strategyLog?.id??'start'}:${Math.floor((stintAge??0)/3)}`,
      [pitStops===0?'no_pit_yet':'pit_completed',...(driver.pit?['pit_entry']:lastExit?['pit_exit']:[])],base,strategyLog?[strategyLog.id]:[]);
    topics.push({...topic('strategy',strategy,driver.id),...(strategyLog?{postId:eventPostId(strategyLog.id)}:{})});
    if(driver.pit)continue;
    if(info.aheadDriverId||info.lastLapRounds!==undefined) {
      const other=game.drivers.find(d=>d.id===info.aheadDriverId),laps=driver.lapTiming?.completedRounds??[];
      const paceTags=[...(other&&info.gapAheadCells!==undefined?['has_gap']:[]),...(info.lastLapRounds!==undefined?['has_lap_time']:[]),
        ...(laps.length>=2&&laps.at(-1)!<laps.at(-2)!?['pace_improving']:laps.length>=2&&laps.at(-1)!>laps.at(-2)!?['pace_fading']:[])];
      const view=viewFor(game,[driver.id,...(other?[other.id]:[])],'pace',`pace:${driver.id}:${driver.lapTiming?.lastCompletionRound??0}:${Math.floor((info.gapAheadCells??0)/3)}`,
        paceTags,{...base,position:info.currentPosition,...(other&&info.gapAheadCells!==undefined?{otherDriver:other.profile.name,gapCells:info.gapAheadCells}:{}),
          ...(info.lastLapRounds!==undefined?{lapRounds:info.lastLapRounds}:{})});
      topics.push(topic('pace',view,driver.id));
    }
  }
  const matchedSeason=season&&game.seasonId===season.id?season:undefined;
  if(matchedSeason) {
    const standings=matchedSeason.standings.slice().sort((a,b)=>b.championshipPoints-a.championshipPoints||countback(a.raceFinishes,b.raceFinishes));
    const nextIndex=game.seasonRound??matchedSeason.rounds.find(r=>r.raceId===game.id)?.round??matchedSeason.currentRound;
    const next=matchedSeason.calendar[nextIndex],nextTrack=TRACKS.find(t=>t.id===next?.trackId)?.name;
    for(const driver of game.drivers) {
      const index=standings.findIndex(s=>s.driverId===driver.id);if(index<0)continue;
      const row=standings[index],view=viewFor(game,[driver.id],'season',`standings:${matchedSeason.rounds.length}:${driver.id}:${row.championshipPoints}`,
        ['standings_update',...(nextTrack?['has_next_track']:[]),...(matchedSeason.status==='finished'?['season_finished']:[])],{driver:driver.profile.name,track:game.track.name,driverPoints:row.championshipPoints,
          championshipPosition:index+1,leaderGap:standings[0].championshipPoints-row.championshipPoints,seasonRound:game.seasonRound??matchedSeason.currentRound,
          roundsRemaining:Math.max(0,matchedSeason.calendar.length-matchedSeason.rounds.length),...(nextTrack?{nextTrack}:{})},[],'已结算赛季积分');
      topics.push(topic('season',view,driver.id));
    }
    const action=matchedSeason.actionHistory.at(-1);
    if(action) {
      const actionLabels={media:'媒体活动',sponsor:'赞助活动',community:'车迷活动',rest:'休息'};
      const trainingLabels={simulator:'模拟器复盘',fitness:'额外检查',development_support:'研发协作'};
      const feedback=reception(matchedSeason.publicActionResults.findLast(result=>result.afterRound===action.afterRound&&result.action===action.public)?.reputationDelta);
      const key=`${matchedSeason.id}:activity:${action.afterRound}`,view=viewFor(game,[human.id],'development',key,
        ['team_activity','driver_training',...feedback.tags],{...common,trainingLabel:trainingLabels[action.performance],activityLabel:actionLabels[action.public],...feedback.slots},[],'实际活动及声望反馈记录');
      if(humanTeam)topics.push(topic('development',view,key,announcement(key,view,{id:`team:${human.profile.teamId}`,role:'team',teamId:human.profile.teamId},humanTeam,
        `${human.profile.name}完成${trainingLabels[action.performance]}。站间安排：${actionLabels[action.public]}。${feedback.text}`)));
    }
    const project=matchedSeason.playerTeam.projects.findLast(p=>p.status==='completed'||p.status==='failed'||p.status==='delayed');
    if(project&&humanTeam) {
      const projectStatus=project.status==='completed'?'已交付':project.status==='delayed'?'延迟':'未能交付';
      const key=`${matchedSeason.id}:project:${project.id}:${project.status}`,view=viewFor(game,[human.id],'development',key,
        [project.status==='completed'?'development_project':project.status==='delayed'?'development_delayed':'development_failed'],
        {...common,upgradeStat:STAT_LABELS[project.stat],projectStatus},[],'车队项目进展记录');
      topics.push(topic('development',view,key,announcement(key,view,{id:`team:${human.profile.teamId}`,role:'team',teamId:human.profile.teamId},humanTeam,`${STAT_LABELS[project.stat]}研发项目${projectStatus}。`)));
    }
    const press=matchedSeason.mediaArchive.find(b=>b.raceId===game.id)?.pressQuestions.findLast(q=>q.answeredWith);
    if(press&&humanTeam) {
      const responseLabels={honest:'坦诚回应',team_first:'车队优先',hardline:'强硬回应',skip:'未作回应'};
      const feedback=reception(press.reputationDelta);
      const key=`${game.id}:press:${press.id}:${press.answeredWith}`,view=viewFor(game,[human.id],'development',key,['press_response',...feedback.tags],
        {...common,responseKind:responseLabels[press.answeredWith!],...feedback.slots},[],'玩家实际选择的媒体回应及反馈');
      topics.push(topic('development',view,key,announcement(key,view,{id:`team:${human.profile.teamId}`,role:'team',teamId:human.profile.teamId},humanTeam,
        `${human.profile.name}赛后媒体环节：${responseLabels[press.answeredWith!]}。${feedback.text}`)));
    }
    const appeal=matchedSeason.advanced.appealReviews.find(r=>r.raceId===game.id);
    if(appeal) {
      const key=`${game.id}:appeal:${appeal.eventId}`,view=viewFor(game,[human.id],'development',key,['appeal_unchanged'],common,[],'已完成的证据复核记录');
      topics.push(topic('development',view,key,announcement(key,view,{id:'event:race-centre',role:'event'},'赛事中心','本次判罚证据复核未改变赛果。')));
    }
    const audit=matchedSeason.advanced.accountingAudit;
    if(audit&&humanTeam&&(audit.result==='clear'||audit.result==='points_penalty')) {
      const key=`${matchedSeason.id}:audit:${audit.result}`,view=viewFor(game,[human.id],'development',key,[audit.result==='clear'?'audit_clear':'audit_points_penalty'],
        {...common,...(audit.result==='points_penalty'?{penaltyPoints:audit.penalty}:{})},[],'已结算赛季审查结果');
      topics.push(topic('development',view,key,announcement(key,view,{id:'event:race-centre',role:'event'},'赛事中心',
        audit.result==='clear'?`${humanTeam}赛季核算审查通过。`:`${humanTeam}赛季核算审查扣除 ${audit.penalty} 车队积分。`)));
    }
  }
  // Archive records are confirmed past actions. A planned project isn't an installed upgrade.
  for(const driver of game.drivers.filter((d,i,list)=>d.profile.teamId&&list.findIndex(x=>x.profile.teamId===d.profile.teamId)===i)) {
    const team=archives.teams?.find(t=>t.id===driver.profile.teamId),development=team?.development??driver.profile.team;
    const name=team?.name??development?.name??driver.profile.contract?.teamName;if(!development||!name)continue;
    const account:SocialAccount={id:`team:${driver.profile.teamId}`,role:'team',teamId:driver.profile.teamId};
    const upgrade=development.upgrades.at(-1);
    if(upgrade) {
      const key=`team:${driver.profile.teamId}:upgrade:${upgrade.season}:${development.upgrades.length}`;
      const view=viewFor(game,[driver.id],'development',key,['development_upgrade'],{driver:driver.profile.name,team:name,track:game.track.name,
        upgradeStat:STAT_LABELS[upgrade.stat],upgradeFrom:upgrade.from,upgradeTo:upgrade.to},[],'车队技术档案');
      topics.push(topic('development',view,key,announcement(key,view,account,name,`${STAT_LABELS[upgrade.stat]}升级：${upgrade.from} → ${upgrade.to}。`)));
    }
    const facility=development.facilityUpgrades?.at(-1);
    if(facility) {
      const facilityName=TEAM_FACILITIES.find(f=>f.id===facility.facility)?.name;if(!facilityName)continue;
      const key=`team:${driver.profile.teamId}:facility:${facility.season}:${development.facilityUpgrades!.length}`;
      const view=viewFor(game,[driver.id],'development',key,['facility_upgrade'],{driver:driver.profile.name,team:name,track:game.track.name,facilityName,facilityLevel:facility.level},[],'车队设施记录');
      topics.push(topic('development',view,key,announcement(key,view,account,name,`${facilityName}升级至 ${facility.level} 级。`)));
    }
  }
  const preparation=(archives.profiles?.find(p=>p.id===human.id)??human.profile).career?.preparationHistory?.at(-1);
  if(preparation&&humanTeam) {
    const key=`driver:${human.id}:preparation:${preparation.season}:${(archives.profiles?.find(p=>p.id===human.id)??human.profile).career!.preparationHistory!.length}`;
    const trainingLabel=OFF_TRACK_ACTIONS[preparation.actionId].name;
    const view=viewFor(game,[human.id],'development',key,['driver_training'],{...common,trainingLabel},[],'车队训练记录');
    topics.push(topic('development',view,key,announcement(key,view,{id:`team:${human.profile.teamId}`,role:'team',teamId:human.profile.teamId},humanTeam,`${human.profile.name}完成${trainingLabel}。`)));
  }
  const nextTrack=matchedSeason?TRACKS.find(t=>t.id===matchedSeason.calendar[game.seasonRound??matchedSeason.rounds.find(r=>r.raceId===game.id)?.round??matchedSeason.currentRound]?.trackId)?.name:undefined;
  topics.push(topic('quiet',viewFor(game,[human.id],'quiet',`weekend:${game.id}:${session}`,[...(nextTrack?['has_next_track']:[])],{...common,...(nextTrack?{nextTrack}:{})}),human.id));
  // A weekend activity is logged before the race starts; it is not a sprint/race on-track event.
  const entertainment=game.logs.findLast(l=>l.code==='race.info'&&l.details?.result==='entertainment_only');
  if(entertainment) {
    const key=`${game.id}:entertainment:${entertainment.id}`,view=viewFor(game,[human.id],'development',key,['entertainment_event'],{...common,eventTitle:entertainment.message},[entertainment.id],'已发生的围场活动');
    topics.push(topic('development',view,key,announcement(key,view,{id:'event:race-centre',role:'event'},'赛事中心',entertainment.message)));
  }
  return topics;
}
function countback(a:number[],b:number[]):number {
  for(let rank=1;rank<=10;rank++){const difference=b.filter(p=>p===rank).length-a.filter(p=>p===rank).length;if(difference)return difference;}
  for(let i=Math.max(a.length,b.length)-1;i>=0;i--){const difference=(a[i]??Number.MAX_SAFE_INTEGER)-(b[i]??Number.MAX_SAFE_INTEGER);if(difference)return difference;}
  return 0;
}
