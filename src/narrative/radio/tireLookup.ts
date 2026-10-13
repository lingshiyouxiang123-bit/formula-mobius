import {getCellIndex,getSegmentAtCell} from '../../game/engine';
import type {GameState} from '../../game/types';
import {calculateTireCorners} from '../../../scripts/text-corpus/engineer-tire-lookup.mjs';

export function ownTireLookup(game:GameState,question:string){
  const driver=game.drivers.find(d=>d.id===game.humanDriverId)!;
  const cell=getCellIndex(game,driver);
  const location=getSegmentAtCell(game,cell);
  const explicit=game.track.segments.find(s=>s.type==='corner'&&question.includes(s.name));
  const index=location?game.track.segments.indexOf(location.segment):0;
  const ordered=[...game.track.segments.slice(index),...game.track.segments.slice(0,index)];
  const corner=explicit??ordered.find(s=>s.type==='corner');
  if(!corner)return {text:`胎耗${driver.wear}/12，距临界还剩${Math.max(0,12-driver.wear)}点。`};
  const suspension=game.weekendMode==='full'?game.weekend?.setup?.suspension??'balanced':'balanced';
  const free=driver.profile.raceEntryEffects?.freeFacilityUses?.includes('mechanical_department')?1:0;
  const enabled=(driver.profile.team?.facilities?.mechanical_department??0)>0||free>0;
  const mechanicalUses=enabled?Math.max(0,1+free-(driver.careerUses?.teamFacilityUses?.mechanical_department??0)):0;
  const result=calculateTireCorners({wear:driver.wear,tire:driver.tire,cornerCost:corner.cornerCost??0,suspension,firstSoftAvailable:driver.careerUses?.firstCornerSetupRound!==game.round,mechanicalUses,reserve:0});
  return {text:`按${corner.name}算，${result.text}`,details:`${result.details??'只算这种弯的入弯磨损。'} 当前胎耗${driver.wear}/12；不含回合自然磨损、晚刹和随机额外损耗。`};
}
