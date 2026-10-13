import review from '../../../research/text-generation/rp/2026-10-11/social-quality-review.json';
import { fragments } from '../situations/composer';
import { allVoiceTemplates } from '../voiceCatalog';
import type { NarrativeLine, RaceNarrative, SocialPlacement } from '../types';
import {restoreViewerRoots} from './distribution';

const fragmentsById=new Map(fragments.map(f=>[f.id,f]));
const templatesById=new Map(allVoiceTemplates.map(t=>[t.id,t]));
const rewritten=new Set<string>(review.rewrittenIds);
const excluded=new Set<string>(review.excludedIds);
const downloadExcluded=new Set<string>(review.downloadedExcludedSourceIds);
const labels:Record<string,string>={soft:'软胎',medium:'中胎',hard:'硬胎',intermediate:'半雨胎',wet:'全雨胎',sunny:'晴天',cloudy:'阴天',light_rain:'小雨',heavy_rain:'大雨',yellow:'黄旗',redFlag:'红旗',green:'绿旗'};

/** Re-render only known, edited NPC sources. Player input and official factual cards are untouched. */
export function reviewSocialLines(lines:NarrativeLine[]):NarrativeLine[] {
  return lines.map(original=>{
    // Only automatic team captions with known source/slots are refreshed. The
    // existing result card and thread IDs stay intact, and player writing is never touched.
    if (original.account?.role === 'team' && original.socialKind === 'blog' && original.provenance !== 'player') {
      const ids = original.plan?.fragmentIds ?? original.templateId.split('+');
      const parts = ids.map(id => fragmentsById.get(id));
      if (parts.length && parts.every(part => part?.personas?.includes('team_staff'))) {
        let missing = false;
        const text = parts.map(part => part!.text.replace(/\{(\w+)\}/g, (_, slot: string) => {
          const value = original.socialContext?.slots[slot];
          if (value === undefined) missing = true;
          return value === undefined ? '' : String(value);
        })).join(' ');
        if (!missing) return text === original.text ? original : { ...original, text };
      }
      return original;
    }
    if(original.account?.role!=='viewer'||original.provenance==='player'||!original.text)return original;
    const line={...original};
    const ids=line.plan?.fragmentIds??line.templateId.split('+');
    const parts=ids.map(id=>fragmentsById.get(id)??templatesById.get(id));
    const bad=ids.some(id=>excluded.has(id))||parts.some(p=>p&&(downloadExcluded.has(p.sourceId??'')||('channels' in p?!p.channels.includes('social'):p.channel!=='social')));
    if(bad)return {...line,text:'[早期自动动态已撤回]',templateId:'social.withdrawn',plan:undefined,socialPlacement:'discussion'};
    const actualReply=parts.some(p=>p&&('role' in p?p.role==='reply':!!p.replyTo))||line.plan?.topic==='paddock'&&!!line.replyToId;
    line.socialPlacement=actualReply?'discussion':line.socialPlacement??parts.find(p=>p?.socialPlacement)?.socialPlacement as SocialPlacement??'either';
    if(!ids.some(id=>rewritten.has(id)))return line;
    const values:Record<string,unknown>={...line.socialContext?.slots,...line.voiceValues};
    let missing=false;
    const texts=parts.map(part=>part?.text.replace(/\{(\w+)\}/g,(_,key:string)=>{
      const value=values[key];if(value===undefined){missing=true;return '';}
      return 'channels' in part?String(value):['tire','oldTire','newTire','weather','oldWeather','newWeather','control'].includes(key)?labels[String(value)]??String(value):String(value);
    }));
    if(missing||texts.some(t=>t===undefined))return {...line,text:'[早期自动动态已撤回]',templateId:'social.withdrawn',plan:undefined,socialPlacement:'discussion'};
    line.text=texts.join(' ');
    const intel=line.plan?.intelRound;
    if(intel!==undefined&&intel<line.round)line.text=`${line.round-intel}回合前的消息：${line.text}`;
    return line;
  });
}

export function reviewRaceNarrative(state:RaceNarrative):RaceNarrative {
  const all=restoreViewerRoots(reviewSocialLines([...state.social,...(state.socialQueue??[]).map(item=>item.line)]));
  const byId=new Map(all.map(line=>[line.id,line]));
  return {...state,social:state.social.map(line=>byId.get(line.id)!),socialQueue:state.socialQueue?.map(item=>({...item,line:byId.get(item.line.id)!}))};
}
