import type {GameState,GameEvent} from '../game/types';
import {buildRaceVoiceContext,classificationVoiceBindings} from './raceVoiceContext';

export interface RaceVoiceEvent {id:string;trigger:string;round:number;eventIds:number[];values:Record<string,unknown>}
export function raceVoiceEvent(game:GameState,log:GameEvent):RaceVoiceEvent|null {
  const input=log.details?.input??{},result=log.details?.result;
  const name=(id:unknown)=>game.drivers.find(d=>d.id===id)?.profile.name;
  const base={id:`${game.id}:${game.raceSession??'race'}:${log.id}`,round:log.round,eventIds:[log.id]};
  const values:Record<string,unknown>={round:log.round,driver:name(game.humanDriverId)};
  const subjectId=log.code==='movement.step'?result==='overtake'?input.attackerId:input.defenderId:log.code==='team.order'?input.yieldingDriverId:input.driverId;
  if(typeof subjectId==='string')values.driverId=subjectId;
  for(const key of ['position','lap','gapCells','lastLapRounds'])if(typeof input[key]==='number')values[key]=input[key];
  if(log.code==='resource.change'&&result==='drs_used')return {...base,trigger:'drs',values:{...values,driver:name(input.driverId),otherDriver:name(input.otherDriverId),drsUsed:true}};
  if(log.code==='movement.step'&&result==='overtake')return {...base,trigger:'overtake',values:{...values,driver:name(input.attackerId),otherDriver:name(input.defenderId),lap:input.lap}};
  if(log.code==='movement.step'&&result==='defended')return {...base,trigger:'defense',values:{...values,driver:name(input.defenderId),otherDriver:name(input.attackerId),lap:input.lap}};
  if(log.code==='team.order'&&['pending','accepted','refused'].includes(result??'')&&['championship_priority','strategy_split','pit_window'].includes(String(input.reason)))return {...base,trigger:'team_order',values:{...values,driver:name(input.yieldingDriverId),otherDriver:name(input.beneficiaryId),orderStatus:result,orderReason:input.reason}};
  if(log.code==='penalty.track_limit'&&['recorded','warning','time_20','time_5'].includes(result??''))return {...base,trigger:'penalty',values:{...values,driver:name(input.driverId),penaltyKind:result,count:input.count}};
  if((log.code==='penalty.tire_obligation'||log.code==='penalty.time')&&['time_5','time_10','time_20'].includes(result??''))return {...base,trigger:'penalty',values:{...values,driver:name(input.driverId),penaltyKind:result,penaltySeconds:input.seconds,penaltyCells:input.cells}};
  if(log.code==='pit.service'&&input.service===true)return {...base,trigger:'pit',values:{...values,driver:name(input.driverId),oldTire:input.oldTire,newTire:input.tire,tire:input.tire,lap:input.lap,...(typeof input.oldTire==='string'&&typeof input.tire==='string'?{tireChanged:input.oldTire!==input.tire}:{})}};
  if(log.code==='weather.transition'&&input.from!==result)return {...base,trigger:'weather',values:{...values,oldWeather:input.from,newWeather:result,weather:result,isRain:result==='light_rain'||result==='heavy_rain',wasRain:input.from==='light_rain'||input.from==='heavy_rain'}};
  if(log.code==='incident.race_control'){
    const control=({vsc_deployed:'VSC',sc_deployed:'SC',red_flag:'redFlag',green:'green'} as Record<string,string>)[result??''];
    if(control)return {...base,trigger:'control',values:{...values,control}};
  }
  if(log.code==='incident.yellow')return {...base,trigger:'control',values:{...values,control:'yellow'}};
  if(log.code==='classification.result'&&result==='retired')return {...base,trigger:'retirement',values:{...values,driver:name(input.driverId),isDnf:true}};
  return null;
}

export function classificationVoiceEvents(game:GameState):RaceVoiceEvent[]{
  if(game.phase!=='finished')return [];
  const context=buildRaceVoiceContext(game);
  return game.results.map(result=>({id:`${game.id}:${game.raceSession??'race'}:classification:${result.driverId}`,trigger:'classification',round:game.round,eventIds:[],values:{...classificationVoiceBindings(context,result.driverId)!,driverId:result.driverId}}));
}
