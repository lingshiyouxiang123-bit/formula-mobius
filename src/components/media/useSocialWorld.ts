"use client";
import {useEffect,useState} from 'react';
import type {RaceNarrative} from '@/narrative/types';
import {advanceSocialWorld,migratePlayerSocial,narrativeWorldId,publishPlayerWorld,protectWorldPosts,type LegacySocialData,type PlayerPublication,type SocialWorld} from '@/narrative/social/world';
import {changeSocialWorld,importNarrativeWorld,loadSocialWorld,peekSocialWorld,subscribeSocialWorld} from '@/narrative/social/worldStorage';

export function useSocialWorld(race:RaceNarrative|undefined,records:Record<string,RaceNarrative>,legacy:LegacySocialData&{bookmarked?:string[];pinnedPostId?:string|null},ready:boolean) {
  const id=race?narrativeWorldId(race):undefined;
  const [world,setWorld]=useState<SocialWorld>();
  useEffect(()=>{
    if(!id||!ready)return;
    let active=true;
    const update=()=>{if(active)setWorld(peekSocialWorld(id));};
    const unsubscribe=subscribeSocialWorld(id,update);
    void (async()=>{
      await loadSocialWorld(id);
      for(const record of Object.values(records))if(narrativeWorldId(record)===id)await importNarrativeWorld(record);
      if(race)await importNarrativeWorld(race);
      await changeSocialWorld(id,current=>migratePlayerSocial(current,legacy));
      update();
    })();
    return ()=>{active=false;unsubscribe();};
  },[id,race,records,ready,legacy.posts,legacy.queue,legacy.socialMemories]);
  useEffect(()=>{
    if(id&&ready)void changeSocialWorld(id,current=>protectWorldPosts(current,[...legacy.bookmarked??[],...(legacy.pinnedPostId?[legacy.pinnedPostId]:[])]));
  },[id,ready,legacy.bookmarked,legacy.pinnedPostId]);
  return {
    world:world?.id===id?world:undefined,
    advance:(limit=3)=>id?changeSocialWorld(id,current=>advanceSocialWorld(current,limit)):Promise.resolve(undefined),
    publish:(request:PlayerPublication)=>id?changeSocialWorld(id,current=>publishPlayerWorld(current,request)):Promise.resolve(undefined),
  };
}
