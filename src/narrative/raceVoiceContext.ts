import {publicDriverInfo} from '../game/engine';
import type {GameState,PublicDriverInfo,TireCompound} from '../game/types';

export type VoiceChannel='social'|'commentary'|'engineer';
export interface RaceVoiceDriver {
  status:string;
  currentPosition:number;
  startPosition:number;
  pitLaneStart:boolean;
  currentLap:number;
  gapAheadCells?:number;
  aheadDriverId?:string;
  lastLapRounds?:number;
  finishPosition?:number;
  points?:number;
  positionsGained?:number;
  tire:TireCompound;
  publicResources:PublicDriverInfo;
  stats?:{overtakes:number;defenses:number;pitStops:number;contacts:number;lateBrakes:number};
}
export interface RaceVoiceContext {
  raceId:string;
  session:'sprint'|'race';
  round:number;
  phase:GameState['phase'];
  channel:VoiceChannel;
  focusDriverId:string;
  entities:{drivers:Record<string,{name:string;abbreviation:string;teamId?:string}>;teams:Record<string,{name:string}>};
  race:{weather?:GameState['weather'];control:GameState['raceControl'];totalLaps:number};
  drivers:Record<string,RaceVoiceDriver>;
  own?:{driverId:string;wear:number;heat:number;brakeHeat:number;ers:number};
}

// Only factual game units. No UI-estimated temperatures/seconds, plans or RNG.
export function buildRaceVoiceContext(game:GameState,focusDriverId=game.humanDriverId,channel:VoiceChannel='social',teams:Record<string,{name:string}>={}):RaceVoiceContext {
  const ordered=game.drivers.slice().sort((a,b)=>Number(a.status==='dnf')-Number(b.status==='dnf')||b.progress-a.progress||a.qualifyingRank-b.qualifyingRank);
  const positions=new Map(ordered.map((driver,index)=>[driver.id,index+1]));
  const totalLaps=game.sessionLaps??game.track.laps;
  const drivers:Record<string,RaceVoiceDriver>={};
  const entities:RaceVoiceContext['entities']={drivers:{},teams};
  for(const driver of game.drivers){
    // Final rank/points are available only once final classification exists.
    const result=game.phase==='finished'?game.results.find(row=>row.driverId===driver.id):undefined;
    entities.drivers[driver.id]={name:driver.profile.name,abbreviation:driver.profile.abbreviation,teamId:driver.profile.teamId};
    const stats=driver.raceStats;
    const ahead=ordered.filter(car=>car.id!==driver.id&&car.status==='racing'&&!car.pit&&car.progress>=driver.progress).sort((a,b)=>a.progress-b.progress)[0];
    drivers[driver.id]={status:result?.status??driver.status,currentPosition:result?.rank??positions.get(driver.id)!,startPosition:driver.qualifyingRank,pitLaneStart:driver.pitLaneStart===true,currentLap:Math.max(1,Math.min(totalLaps,Math.floor(driver.progress/game.track.totalLength)+1)),tire:driver.tire,publicResources:publicDriverInfo(driver),
      ...(ahead?{gapAheadCells:ahead.progress-driver.progress,aheadDriverId:ahead.id}:{}),
      ...(driver.lapTiming?.completedRounds.length?{lastLapRounds:driver.lapTiming.completedRounds.at(-1)!}:{}),
      ...(result?{finishPosition:result.rank,points:result.points,positionsGained:driver.qualifyingRank-result.rank}:{}),
      ...(stats?{stats:{overtakes:stats.overtakes,defenses:stats.defensesWon,pitStops:stats.pitStops,contacts:stats.contacts,lateBrakes:stats.lateBrakes}}:{})};
  }
  const context:RaceVoiceContext={raceId:game.id,session:game.raceSession??'race',round:game.round,phase:game.phase,channel,focusDriverId,entities,race:{weather:game.weather,control:game.raceControl,totalLaps},drivers};
  if(channel==='engineer'){
    const own=game.drivers.find(driver=>driver.id===game.humanDriverId);
    if(own)context.own={driverId:own.id,wear:own.wear,heat:own.heat,brakeHeat:own.brakeHeat,ers:own.ers};
  }
  return context;
}

// Flat, actual-value bindings for Luna's classification templates.
export function classificationVoiceBindings(context:RaceVoiceContext,driverId=context.focusDriverId){
  const driver=context.drivers[driverId],entity=context.entities.drivers[driverId];
  if(!driver||!entity||driver.finishPosition===undefined)return null;
  const team=entity.teamId?context.entities.teams[entity.teamId]?.name:undefined;
  return {driver:entity.name,driverId,team,startPosition:driver.startPosition,finishPosition:driver.finishPosition,positionsGained:driver.positionsGained,points:driver.points,lap:driver.currentLap,round:context.round,tire:driver.tire,
    ...(driver.lastLapRounds!==undefined?{lastLapRounds:driver.lastLapRounds}:{}),
    isWinner:driver.finishPosition===1&&driver.status!=='dnf',isPodium:driver.finishPosition<=3&&driver.status!=='dnf',isDnf:driver.status==='dnf',hasPoints:(driver.points??0)>0,pitLaneStart:driver.pitLaneStart,
    ...(driver.stats?{overtakes:driver.stats.overtakes,pitStops:driver.stats.pitStops}:{})};
}
