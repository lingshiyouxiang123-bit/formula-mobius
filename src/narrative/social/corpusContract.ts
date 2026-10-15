/** Production-data contract. Values are populated by sources.ts, never decided by a text model. */
export const WORLD_CORPUS_VERSION=3;
/** Content release, separate from the data schema: refresh previously empty expression pools once. */
export const WORLD_CONTENT_REVISION=2026101502;
export const WORLD_SCENE_CONDITIONS=['before_start','race_live','race_finished'] as const;
export function worldSceneCondition(phase:string):typeof WORLD_SCENE_CONDITIONS[number] {
  return phase==='finished'?'race_finished':['setup','practice','qualifying','preRace'].includes(phase)?'before_start':'race_live';
}
export const WORLD_CORPUS_TOPICS={
  world_result:{slots:['driver','team','track','position','startPosition','positionsGained','points'],conditions:['race_result','finished_result','dnf_result','podium_result','points_result','no_points_result','positions_gained','positions_lost','has_start_position']},
  world_qualifying:{slots:['driver','team','track','startPosition'],conditions:['qualifying_result','pole_result','qualifying_front','qualifying_midfield','qualifying_back','pit_lane_start','has_start_position']},
  world_strategy:{slots:['driver','team','track','tire','pitStops','stintAge'],conditions:['no_pit_yet','pit_completed','pit_exit','pit_entry']},
  world_pace:{slots:['driver','team','track','otherDriver','gapCells','lapRounds','position','tire','pitStops','stintAge'],conditions:['has_gap','has_lap_time','pace_improving','pace_fading','drs_used','overtake','defended','blue_flag_pass','attack_declined']},
  world_incident:{slots:['driver','otherDriver','affectedDriver','team','track','damage','penaltySeconds','penaltyCells','limitCount','onTrackPosition','position'],conditions:['contact','same_team','retired','light_damage','heavy_damage','time_penalty','track_limit_recorded','track_limit_warning','penalty_classification','local_yellow']},
  world_comparison:{slots:['driver','otherDriver','team','track','position','otherPosition','startPosition','otherStartPosition','points','otherPoints'],conditions:['teammate_comparison','rival_comparison','comparison_ahead','comparison_behind']},
  world_development:{slots:['driver','team','track','upgradeStat','upgradeFrom','upgradeTo','facilityName','facilityLevel','trainingLabel','activityLabel','projectStatus','responseKind','eventTitle','penaltyPoints','reception'],conditions:['development_upgrade','facility_upgrade','driver_training','team_activity','development_project','development_delayed','development_failed','press_response','entertainment_event','appeal_unchanged','audit_clear','audit_points_penalty','reception_positive','reception_negative']},
  world_season:{slots:['driver','team','track','driverPoints','championshipPosition','leaderGap','seasonRound','roundsRemaining','nextTrack'],conditions:['standings_update','has_next_track','season_finished']},
  world_quiet:{slots:['driver','team','track','nextTrack'],conditions:['has_next_track','entertainment_event']},
  world_weather:{slots:['track','weather','oldWeather'],conditions:['weather_changed','wet_weather','dry_weather']},
  world_control:{slots:['track','control'],conditions:['control_green','control_sc','control_vsc','control_red_flag','control_restored','standing_restart']},
  world_team_order:{slots:['driver','otherDriver','team','track'],conditions:['order_executed']},
} as const;
export const WORLD_CORPUS_ACTS=['report','ask','support','praise','concern','challenge','agree','defend','tease','comment','complain','rumor','correct','confirm'] as const;
export const WORLD_CORPUS_PERSONAS=['fan','ordinary_viewer','technical_fan','blogger','troll','team_staff'] as const;
export const WORLD_PARENT_SEMANTICS=['race_classification','qualifying_position','result_support','result_disappointment','podium_celebration','unfounded_team_order','strategy_talk','strategy_question','pace_observation','comparison_talk','development_talk','season_outlook','quiet_chat','recall_talk','incident_talk','blame_claim','defend_driver','penalty_talk','weather_talk','control_talk','team_order_talk'] as const;

/** Slots not available in a scene simply don't match. Subject roles are not replaceable display names. */
export const WORLD_ENTITY_ROLES={driver:'situation.subjectIds[0]',otherDriver:'situation.subjectIds[1]',affectedDriver:'incident.input.affectedDriverId',team:'the first subject’s actual team'} as const;

/** Check production packs against the same vocabulary used by the game adapters. */
export function validateWorldCorpus(pack:{contractVersion:number;fragments:unknown[]}):string[] {
  const errors:string[]=[],ids=new Set<string>();
  if(pack.contractVersion!==WORLD_CORPUS_VERSION)errors.push('contractVersion does not match runtime');
  const allowed=(values:readonly string[],value:unknown)=>typeof value==='string'&&values.includes(value);
  for(const row of pack.fragments) {
    if(!row||typeof row!=='object'){errors.push('fragment must be an object');continue;}
    const f=row as import('../situations/types').Fragment;
    const fail=(message:string)=>errors.push(`${f.id??'?'}: ${message}`);
    if(typeof f.id!=='string'||ids.has(f.id))fail('missing or duplicate ID');ids.add(f.id);
    if(!Array.isArray(f.requires)){fail('requires must be tags');continue;}
    const groups=f.requires.filter(tag=>tag in WORLD_CORPUS_TOPICS);
    if(groups.length!==1){fail('requires exactly one world topic');continue;}
    const contract=WORLD_CORPUS_TOPICS[groups[0] as keyof typeof WORLD_CORPUS_TOPICS];
    for(const tag of f.requires)if(tag!==groups[0]&&!allowed(contract.conditions,tag)&&!allowed(WORLD_SCENE_CONDITIONS,tag))fail(`unknown condition ${tag}`);
    if(!allowed(WORLD_CORPUS_ACTS,f.act))fail(`unsupported act ${f.act}`);
    if(!allowed(['neutral','support','critical','curious'],f.stance))fail('invalid stance');
    if(!allowed(['claim','reaction','reply'],f.role))fail('unsupported world fragment role');
    if(!f.topics?.includes('paddock')||f.channels?.length!==1||f.channels[0]!=='social')fail('world corpus must target paddock/social');
    for(const persona of f.personas??[])if(!allowed(WORLD_CORPUS_PERSONAS,persona))fail(`unknown persona ${persona}`);
    if(typeof f.text!=='string'||!f.text.trim()){fail('empty text');continue;}
    for(const [,slot] of f.text.matchAll(/\{(\w+)\}/g))if(!allowed(contract.slots,slot))fail(`unavailable slot ${slot}`);
    for(const condition of f.when??[]) {
      if(!allowed(contract.slots,condition.field)||condition.otherField&&!allowed(contract.slots,condition.otherField))fail('predicate uses unavailable slot');
      if(!allowed(['present','eq','ne','gt','gte','lt','lte'],condition.op))fail('unknown predicate operator');
      if(condition.op!=='present'&&(condition.value===undefined)===(condition.otherField===undefined))fail('predicate needs exactly one comparison value');
    }
    if(f.role==='reply'&&(!f.replyToActs?.length||!f.replyToTags?.length))fail('reply needs parent act and semantic conditions');
    for(const act of f.replyToActs??[])if(!allowed(WORLD_CORPUS_ACTS,act))fail(`unknown parent act ${act}`);
    for(const tag of [...f.replyToTags??[],...f.expresses??[]])if(!allowed(WORLD_PARENT_SEMANTICS,tag))fail(`unknown parent semantic ${tag}`);
    if('privateIntent' in row||'knows' in row||'assumes' in row)fail('writer notes are not runtime predicates');
  }
  return errors;
}
