import type { NarrativeLine, SocialAccount } from '../types';
import profileCorpus from '../../../research/text-generation/rp/2026-10-13/social-profile-bios.json';

function profilePersona(account?: SocialAccount): keyof typeof profileCorpus.bios {
  if (account?.supportsDriverId) return 'fan';
  const persona = account?.profile?.persona;
  if (persona && persona in profileCorpus.bios) return persona as keyof typeof profileCorpus.bios;
  return account?.id.includes('technical') ? 'technical_fan' : account?.id.includes('blogger') ? 'blogger' : account?.id.includes('troll') ? 'troll' : 'ordinary_viewer';
}

/** A biography is drawn once per account and saved, not rerolled when a new post arrives. */
export function assignSocialBios(current: Record<string,string>, posts: NarrativeLine[], playerName: string, random = Math.random): Record<string,string> {
  let next = current;
  for (const post of posts) {
    const account = post.account;
    if (!account || account.role !== 'viewer' || post.speaker === playerName || Object.hasOwn(next, account.id)) continue;
    if (next === current) next = { ...current };
    const pool = profileCorpus.bios[profilePersona(account)];
    next[account.id] = pool[Math.floor(random() * pool.length)];
  }
  return next;
}

export const playerHandle = '@racing_diary';

/** Display handles are assigned once in local storage, not derived from a hash or race RNG. */
export function newSocialHandle(account: SocialAccount | undefined, used: Set<string>, random = Math.random): string {
  if (account?.role==='event'&&!used.has('@race_centre')) return '@race_centre';
  const words=['coffee','citrus','night','toast','cloud','mint','soda','north','chili','mango'];
  const endings=['lap','apex','notes','radio','corner','hour'];
  const word=words[Math.floor(random()*words.length)];
  const ending=endings[Math.floor(random()*endings.length)];
  const base=account?.role==='team'?`pitwall_${word}`:account?.supportsDriverId?`${word}_fan`:`${word}_${ending}`;
  let candidate=`@${base}`;
  if(random()<0.4)candidate=`@${base.slice(0,12)}${Math.floor(random()*90)+10}`;
  // A small numeric suffix resolves collisions; no retries or persistent polling.
  for(let suffix=2;used.has(candidate);suffix++)candidate=`@${base.slice(0,11)}${suffix}`;
  return candidate;
}

export function assignSocialHandles(current:Record<string,string|number>, posts:NarrativeLine[], playerName:string, random=Math.random):Record<string,string|number> {
  const missing=[...new Set(posts.map(p=>p.speaker))].filter(name=>name!==playerName&&(typeof current[name]!=='string'||String(current[name]).startsWith('@paddock_')));
  if(!missing.length)return current;
  const handles={...current},used=new Set(Object.values(current).filter((value):value is string=>typeof value==='string'));
  used.add(playerHandle);
  for(const name of missing){const handle=newSocialHandle(posts.find(p=>p.speaker===name)?.account,used,random);handles[name]=handle;used.add(handle);}
  return handles;
}

export function socialProfile(posts: NarrativeLine[], name: string, playerName: string, bios: Record<string,string> = {}) {
  const authored=posts.filter(p=>p.speaker===name);
  const account=authored.find(p=>p.account)?.account;
  const pattern = account && Object.hasOwn(bios, account.id) ? bios[account.id] : profileCorpus.bios[profilePersona(account)][0];
  if(name===playerName)return {style:'driver',label:'车手主页',bio:'',cover:'RACE DIARY'};
  if(account?.supportsDriverId) {
    const id=account.supportsDriverId;
    const card=posts.flatMap(p=>p.card?.rows??[]).find(row=>row.driverId===id);
    const context=authored.find(p=>p.socialContext?.situation.subjectIds[0]===id)?.socialContext;
    const driver=card?.name??String(context?.slots.driver??'支持的车手');
    return {style:'fan',label:'非官方后援会',bio:pattern.replaceAll('{driver}',driver),cover:`${driver} · 看台集合`,color:card?.color??'#f7ba48'};
  }
  if(account?.role==='event')return {style:'event',label:'赛事账号',bio:'赛况、赛会通知与本站分类。',cover:'RACE CENTRE'};
  if(account?.role==='team')return {style:'team',label:'车队账号',bio:`${name}的比赛动态与双车赛后复盘。`,cover:'FROM THE PIT WALL'};
  return {style:'viewer',label:'看台账号',bio:pattern,cover:'RACE WEEKEND'};
}
