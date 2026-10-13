import type {CSSProperties} from 'react';
import type {socialProfile} from '@/narrative/social/accounts';

export function XProfileHeader({name,handle,info,own,count,followingCount,isFollowing,onFollow}:{name:string;handle:string;info:ReturnType<typeof socialProfile>;own:boolean;count:number;followingCount:number;isFollowing:boolean;onFollow:()=>void}) {
  return <div className={`x-profile x-profile-${info.style}`} style={info.color?{'--fan-color':info.color} as CSSProperties:undefined}>
    <div className="x-cover"><span>{info.cover}</span></div><span className="x-avatar">{name.slice(0,1)}</span>
    {!own&&<button className="x-profile-follow" aria-pressed={isFollowing} onClick={onFollow}>{isFollowing?'已关注':'关注'}</button>}
    <h2>{name}</h2><p>{handle}</p><p>{info.bio}</p><small>{info.label} · {count} 条动态{own?` · ${followingCount} 正在关注`:''}</small>
  </div>;
}
