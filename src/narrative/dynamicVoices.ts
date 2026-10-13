import {voiceTemplates as templates} from './voiceCatalog';
import {generateRaceVoiceThread} from './voiceRenderer.mjs';
import type {RaceVoiceEvent} from './raceVoiceEvents';
import type {NarrativeLine} from './types';
import {spectatorIdentity} from './social/paddock';

const speakers:Record<string,string>={fan:'看台小旗',ordinary_viewer:'弯心路人',technical_fan:'分段计时',blogger:'围场随笔',troll:'反向看台',commentator:'现场解说'};
export function dynamicVoiceLines(event:RaceVoiceEvent,channel:'social'|'commentary',recent:NarrativeLine[],seed:number,downloadedOnly=false):NarrativeLine[]{
  const voiceValues=event.values as Record<string,string|number|boolean>;
  const generated=generateRaceVoiceThread(downloadedOnly?templates.filter(t=>t.provenance==='downloaded'):templates,{trigger:event.trigger,channel,values:event.values,seed,recentFamilies:recent.slice(-8).map(l=>l.family??''),recentTexts:recent.slice(channel==='social'?-48:-12).map(l=>l.text)});
  const lines:NarrativeLine[]=[];
  for(const [index,voice] of generated.entries()){
      const parent=voice.replyTo?lines.find(l=>l.templateId===voice.replyTo):undefined;
    lines.push({id:`${event.id}:${channel}:${index}`,round:event.round,speaker:voice.speaker??(voice.persona==='fan'&&event.values.driver?`${event.values.driver}看台`:speakers[voice.persona]??'围场路人'),text:voice.text,kind:channel==='social'?'opinion':'fact',factIds:[event.id],eventIds:event.eventIds,templateId:voice.templateId,family:voice.family,provenance:voice.provenance,...(channel==='social'?{...spectatorIdentity(voice.persona,typeof event.values.driverId==='string'?event.values.driverId:undefined,typeof event.values.driver==='string'?event.values.driver:undefined),socialPlacement:voice.socialPlacement,voiceValues}:{}),...(parent?{replyToId:parent.id}:{})});
  }
  return lines;
}
