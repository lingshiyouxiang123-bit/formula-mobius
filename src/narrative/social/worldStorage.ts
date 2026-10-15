import type {RaceNarrative} from '../types';
import {createSocialWorld,ingestWorldNarrative,narrativeWorldId,protectWorldPosts,type SocialWorld,type WorldPost} from './world';

const cache=new Map<string,SocialWorld>(),listeners=new Map<string,Set<()=>void>>();
const loading=new Map<string,Promise<SocialWorld>>(),changes=new Map<string,Promise<unknown>>();
let database:Promise<IDBDatabase>|undefined;
let persistenceError=false;
type WorldMeta=Omit<SocialWorld,'posts'>;

function openDatabase():Promise<IDBDatabase> {
  return database??=new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(new Error('IndexedDB unavailable'));return;}
    const request=indexedDB.open('f1game.social-world',1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      db.createObjectStore('worlds',{keyPath:'id'});
      db.createObjectStore('posts',{keyPath:['worldId','id']}).createIndex('worldId','worldId');
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('Social storage is waiting for another tab'));
  });
}
function readWorld(db:IDBDatabase,id:string):Promise<SocialWorld> {
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(['worlds','posts'],'readonly');
    const meta=transaction.objectStore('worlds').get(id),posts=transaction.objectStore('posts').index('worldId').getAll(id);
    transaction.oncomplete=()=>{
      const value=meta.result as WorldMeta|undefined;
      resolve(value?{...value,posts:(posts.result as WorldPost[]).sort((a,b)=>(a.publishSeq??0)-(b.publishSeq??0))}:createSocialWorld(id));
    };
    transaction.onerror=()=>reject(transaction.error);
    transaction.onabort=()=>reject(transaction.error);
  });
}
/** Posts are immutable: persist only new/changed posts and deleted archive entries, once per batch. */
async function persistWorld(next:SocialWorld,prior?:SocialWorld):Promise<void> {
  const db=await openDatabase();
  await new Promise<void>((resolve,reject)=>{
    const transaction=db.transaction(['worlds','posts'],'readwrite');
    const {posts,...meta}=next,store=transaction.objectStore('posts');
    transaction.objectStore('worlds').put(meta);
    const previous=new Map(prior?.posts.map(p=>[p.id,p]));
    for(const post of posts){
      const old=previous.get(post.id);
      if(!old||old.publishSeq!==post.publishSeq||old.text!==post.text)store.put(post);
      previous.delete(post.id);
    }
    for(const post of previous.values())store.delete([next.id,post.id]);
    transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);
  });
}
export function peekSocialWorld(id:string):SocialWorld|undefined {return cache.get(id);}
export function socialPersistenceUnavailable():boolean {return persistenceError;}
export function subscribeSocialWorld(id:string,listener:()=>void):()=>void {
  const group=listeners.get(id)??new Set();group.add(listener);listeners.set(id,group);
  return ()=>{group.delete(listener);if(!group.size)listeners.delete(id);};
}
export function loadSocialWorld(id:string):Promise<SocialWorld> {
  const current=cache.get(id);if(current)return Promise.resolve(current);
  const pending=loading.get(id);if(pending)return pending;
  const request=openDatabase().then(db=>readWorld(db,id)).catch(()=>{persistenceError=true;return createSocialWorld(id);}).then(world=>{
    cache.set(id,world);loading.delete(id);return world;
  });
  loading.set(id,request);return request;
}
/** Serialize only within a world; hydration and player/timer actions cannot overwrite each other. */
export function changeSocialWorld(id:string,change:(world:SocialWorld)=>SocialWorld):Promise<SocialWorld> {
  const task=(changes.get(id)??Promise.resolve()).catch(()=>{}).then(async()=>{
    const prior=await loadSocialWorld(id),next=change(prior);
    if(next===prior)return prior;
    cache.set(id,next);
    try{await persistWorld(next,prior);}catch{persistenceError=true;}
    listeners.get(id)?.forEach(listener=>listener());
    return next;
  });
  changes.set(id,task);
  void task.finally(()=>{if(changes.get(id)===task)changes.delete(id);});
  return task;
}
export function importNarrativeWorld(race:RaceNarrative):Promise<SocialWorld> {
  return changeSocialWorld(narrativeWorldId(race),world=>ingestWorldNarrative(protectWorldPosts(world,readSocialProtection()),race));
}
function readSocialProtection():string[] {
  try{
    if(typeof localStorage==='undefined')return [];
    const ui=JSON.parse(localStorage.getItem('f1game.x-social-ui-v2')??localStorage.getItem('f1game.x-social-local-v1')??'{}');
    return [...ui.bookmarked??[],...(ui.pinnedPostId?[ui.pinnedPostId]:[])];
  }catch{return [];}
}
export async function initializeSocialWorlds(records:Record<string,RaceNarrative>):Promise<void> {
  // Historical races are imported oldest first. Existing IDs make migration repeatable.
  for(const race of Object.values(records))await importNarrativeWorld(race);
}
