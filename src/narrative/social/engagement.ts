import type {NarrativeLine} from '../types';

export interface SocialEngagement {likes:number;reposts:number}

/** Background spectators: draw once per post and keep in the existing local social save. */
export function assignSocialEngagement(current:Record<string,SocialEngagement>,posts:NarrativeLine[],random=Math.random):Record<string,SocialEngagement> {
  const missing=posts.filter(post=>!current[post.id]);
  if(!missing.length)return current;
  const next={...current};
  for(const post of missing){
    if(next[post.id])continue;
    const reply=!!post.replyToId,role=post.account?.role;
    const [minimum,maximum]=reply?[1,40]:role==='event'?[80,1800]:role==='team'?[30,900]:[1,120];
    // Most posts are modest; a few get more attention, rather than every post looking equally popular.
    const likes=minimum+Math.floor(random()**2*(maximum-minimum+1));
    const reposts=reply?Math.floor(likes*random()*0.12):Math.max(1,Math.floor(likes*(0.03+random()*0.17)));
    next[post.id]={likes,reposts};
  }
  return next;
}

export function socialEngagementCounts(post:NarrativeLine,posts:NarrativeLine[],base:SocialEngagement={likes:0,reposts:0},liked=false,reposted=false):SocialEngagement {
  const supporters=new Set(posts.filter(p=>p.replyToId===post.id&&p.plan?.stance==='support').map(p=>p.speaker));
  return {
    likes:base.likes+supporters.size+Number(liked),
    reposts:base.reposts+posts.filter(p=>p.repostOfId===post.id||p.quoteOfId===post.id).length+Number(reposted),
  };
}
