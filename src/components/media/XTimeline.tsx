"use client";
import {useEffect,useMemo,useState} from 'react';
import type {NarrativeLine,RaceNarrative} from '@/narrative/types';
import {responsesToPlayer} from '@/narrative/social/network';
import {assignSocialBios,assignSocialHandles,playerHandle,socialProfile} from '@/narrative/social/accounts';
import {reviewSocialLines} from '@/narrative/social/review';
import {mergeSocialMemory,rememberSocialLines} from '@/narrative/social/society';
import type {SocialMemory} from '@/narrative/social/types';
import {assignSocialEngagement,socialEngagementCounts,type SocialEngagement} from '@/narrative/social/engagement';
import {XIcon} from './XIcon';
import {XComposeDialog} from './XComposeDialog';
import {XProfileHeader} from './XProfileHeader';

interface LocalPost extends NarrativeLine {raceId:string}
interface SocialState {liked:string[];reposted:string[];bookmarked:string[];followed:string[];posts:LocalPost[];queue:LocalPost[];nextId:number;handles:Record<string,string|number>;bios:Record<string,string>;pinnedPostId:string|null;socialMemories:Record<string,SocialMemory>;engagement:Record<string,SocialEngagement>}
const empty:SocialState={liked:[],reposted:[],bookmarked:[],followed:[],posts:[],queue:[],nextId:1,handles:{},bios:{},pinnedPostId:null,socialMemories:{},engagement:{}};
const key='f1game.x-social-local-v1';
export function XTimeline({race,view,playerName,composeRequest=0,onComposeHandled,navigationRequest=0}:{race?:RaceNarrative;view:string;playerName:string;composeRequest?:number;onComposeHandled?:()=>void;navigationRequest?:number}){
  const [state,setState]=useState<SocialState>(empty),[ready,setReady]=useState(false);
  const [flow,setFlow]=useState('for-you'),[query,setQuery]=useState(''),[detail,setDetail]=useState<string|null>(null);
  const [draft,setDraft]=useState(''),[reply,setReply]=useState(''),[quoteTarget,setQuoteTarget]=useState<string|null>(null);
  const [released,setReleased]=useState<string[]>([]),[live,setLive]=useState(true);
  const [profile,setProfile]=useState<string|null>(null),[profileTab,setProfileTab]=useState('posts');
  const [composeOpen,setComposeOpen]=useState(false),[replyTarget,setReplyTarget]=useState<string|null>(null),[searchOpen,setSearchOpen]=useState(false);
  const [postKind,setPostKind]=useState<'update'|'blog'>('update'),[topicPostId,setTopicPostId]=useState('');
  const [topicFilter,setTopicFilter]=useState('all');
  useEffect(()=>{try{const saved=localStorage.getItem(key);if(saved)setState({...empty,...JSON.parse(saved)});}catch{}setReady(true);},[]);
  useEffect(()=>{if(ready)try{localStorage.setItem(key,JSON.stringify(state));}catch{}},[state,ready]);
  useEffect(()=>{setDetail(null);setProfile(null);setProfileTab('posts');setReply('');setQuoteTarget(null);setReplyTarget(null);setComposeOpen(false);setQuery('');},[view,race?.raceId,navigationRequest]);
  useEffect(()=>{setReleased([]);},[race?.raceId]);
  useEffect(()=>{setComposeOpen(false);setReplyTarget(null);setTopicPostId('');},[race?.raceId]);
  useEffect(()=>{if(composeRequest>0){setComposeOpen(true);setReplyTarget(null);onComposeHandled?.();}},[composeRequest,onComposeHandled]);
  const published=useMemo(()=>[...(race?.social??[]),...reviewSocialLines(state.posts.filter(p=>p.raceId===race?.raceId))],[race,state.posts]);
  const queue=useMemo(()=>[...(race?.socialQueue??[]).map(p=>p.line),...reviewSocialLines(state.queue.filter(p=>p.raceId===race?.raceId))]
    .filter(p=>!published.some(post=>post.id===p.id)),[race,published,state.queue]);
  const knownPosts=useMemo(()=>[...published,...queue],[published,queue]);
  const posts=useMemo(()=>[...published,...queue.filter(p=>released.includes(p.id))],[published,queue,released]);
  const pending=queue.filter(p=>!released.includes(p.id));
  const releaseBatch=(limit=3)=>setReleased(current=>{
    const available=new Set([...published.map(p=>p.id),...current]);
    const next:string[]=[];
    for(const post of queue){
      const parent=post.replyToId??post.repostOfId;
      if(!available.has(post.id)&&(!parent||available.has(parent))){next.push(post.id);available.add(post.id);if(next.length===limit)break;}
    }
    return next.length?[...current,...next]:current;
  });
  useEffect(()=>{
    if(!live||!pending.length||!ready)return;
    const timer=setTimeout(()=>releaseBatch(),8000);
    return ()=>clearTimeout(timer);
  },[live,ready,pending.length,published,queue,released]); // Display only; this clock never writes localStorage.
  const accounts=useMemo(()=>[...new Set(posts.map(p=>p.speaker).filter(name=>name!==playerName))],[posts,playerName]);
  useEffect(()=>{
    if(!ready)return;
    setState(s=>{
      const handles=assignSocialHandles(s.handles,knownPosts,playerName);
      const engagement=assignSocialEngagement(s.engagement,knownPosts);
      const bios=assignSocialBios(s.bios,knownPosts,playerName);
      return handles===s.handles&&engagement===s.engagement&&bios===s.bios?s:{...s,handles,engagement,bios};
    });
  },[ready,knownPosts,playerName]); // Queue is prepared once; display-only releases don't redraw counts or save.
  const handle=(name:string)=>name===playerName?playerHandle:typeof state.handles[name]==='string'?state.handles[name] as string:'@lap_notes';
  const openAccount=(name:string)=>{setProfile(name);setProfileTab('posts');setDetail(null);setQuery('');};
  const profileName=profile??(view==='profile'?playerName:null),ownProfile=profileName===playerName;
  const profileInfo=profileName?socialProfile(posts,profileName,playerName,state.bios):undefined;
  const toggle=(field:'liked'|'reposted'|'bookmarked'|'followed',id:string)=>setState(s=>({...s,[field]:s[field].includes(id)?s[field].filter(v=>v!==id):[...s[field],id]}));
  const selected=posts.find(p=>p.id===detail);
  const publish=(text:string,parent?:NarrativeLine,quote=false)=>{
    if(!race||!text.trim())return;
    setState(s=>{
      const topic=posts.find(p=>p.id===topicPostId);
      const selection=race.socialTopics?.find(t=>`topic:${t.id}`===topicPostId);
      const context=parent?.socialContext??selection?.context??topic?.socialContext??posts.slice().reverse().find(p=>p.socialContext&&text.includes(String(p.socialContext.slots.driver??'\u0000')))?.socialContext;
      const post:LocalPost={raceId:race.raceId,id:`local-post-${s.nextId}`,round:race.events.at(-1)?.round??parent?.round??0,
        speaker:playerName,text:text.trim(),kind:'opinion',factIds:parent?.factIds??topic?.factIds??[],eventIds:parent?.eventIds??topic?.eventIds??[],templateId:'player.actual-input',provenance:'player',
        ...(!parent?{socialKind:postKind,...(topic||selection?.postId?{topicPostId:topic?.id??selection?.postId}:{})}:{}),
        account:{id:'driver:player',role:'driver'},socialContext:context,...(parent?quote?{quoteOfId:parent.id}:{replyToId:parent.id}:{})};
      const society=race.socialMemory?mergeSocialMemory(race.socialMemory,s.socialMemories[race.socialMemory.worldId]):undefined;
      if(society)rememberSocialLines(society,race.raceId,posts);
      const responses=responsesToPlayer(post,context,[...posts,...s.queue.filter(p=>p.raceId===race.raceId)],s.nextId*137,society).map(line=>({...line,raceId:race.raceId}));
      if(society)rememberSocialLines(society,race.raceId,[post]);
      return {...s,nextId:s.nextId+1,posts:[...s.posts,post].slice(-200),queue:[...s.queue,...responses].slice(-80),
        socialMemories:society?{...s.socialMemories,[society.worldId]:society}:s.socialMemories};
    });
    setReply('');setDraft('');setQuoteTarget(null);setComposeOpen(false);setReplyTarget(null);
  };
  const quotePost=(id:string)=>{setQuoteTarget(id);setComposeOpen(true);setReplyTarget(null);};
  const replyPost=(id:string)=>{setReply('');setReplyTarget(id);setComposeOpen(false);};
  const card=(post:NarrativeLine,thread=false)=>{
    const parent=posts.find(p=>p.id===post.replyToId),quoted=posts.find(p=>p.id===(post.quoteOfId??post.repostOfId));
    const topic=posts.find(p=>p.id===post.topicPostId);
    const children=posts.filter(p=>p.replyToId===post.id),count=children.length;
    const {likes,reposts}=socialEngagementCounts(post,posts,state.engagement[post.id],state.liked.includes(post.id),state.reposted.includes(post.id));
    return <article className="x-post" key={post.id}>
      <button className={`x-avatar x-avatar-${post.account?.role??'viewer'}`} onClick={()=>openAccount(post.speaker)} aria-label={`查看${post.speaker}的主页`}>{post.speaker.slice(0,1)}</button>
      <div className="x-post-content">
        {ownProfile&&post.speaker!==playerName&&state.reposted.includes(post.id)&&<small>⇄ {playerName} 转帖</small>}
        {ownProfile&&state.pinnedPostId===post.id&&<small>置顶</small>}
        {post.repostOfId&&<small>⇄ {post.speaker} 转帖</small>}
        <header><div className="x-post-author"><button className="x-account-link" onClick={()=>openAccount(post.speaker)}>{post.speaker}</button>{['event','team'].includes(post.account?.role??'')&&<span className="x-account-badge" aria-label={post.account?.role==='event'?'赛事账号':'车队账号'}>✓</span>}<span className="x-handle">{handle(post.speaker)}</span><span className="x-post-time">· R{post.round}</span></div>
          <details className="x-more-menu"><summary aria-label="帖子选项"><XIcon name="more"/></summary><div>
            <button onClick={()=>quotePost(post.id)}><XIcon name="quote"/>引用帖子</button>
            <button onClick={()=>toggle('bookmarked',post.id)}><XIcon name="bookmark"/>{state.bookmarked.includes(post.id)?'移除书签':'加入书签'}</button>
            {ownProfile&&post.provenance==='player'&&!post.replyToId&&<button onClick={()=>setState(s=>({...s,pinnedPostId:s.pinnedPostId===post.id?null:post.id}))}>{state.pinnedPostId===post.id?'取消置顶':'置顶到主页'}</button>}
            <details className="x-source"><summary>查看比赛依据</summary><p>{post.provenance==='player'?'玩家实际发布':post.provenance?.includes('downloaded')?post.provenance.includes('luna_rp')?'下载表达＋Luna补充':'下载语料':post.provenance?.includes('luna_rp')?post.provenance.includes('game')?'比赛记录＋Luna短句':'Luna RP补充':'比赛记录'} · {post.eventIds.length?`日志 ${post.eventIds.join('、')}`:race?.track}</p></details>
          </div></details>
        </header>
        {parent&&<small className="x-reply-context">回复 <button onClick={()=>openAccount(parent.speaker)}>{handle(parent.speaker)}</button></small>}
        {post.socialKind==='blog'&&<small>博客 · 本场复盘</small>}
        {topic&&<button className="x-thread-preview" onClick={()=>setDetail(topic.id)}>谈到：{topic.card?.title??topic.text.slice(0,32)}</button>}
        <button className="x-post-text" onClick={()=>setDetail(post.id)}>{post.text}</button>
        {post.card&&<button className="x-result-card" onClick={()=>setDetail(post.id)}><strong>{post.card.title}</strong>{post.card.rows.map(row=><span key={row.driverId} style={{borderLeftColor:row.color}}><b>{row.status==='dnf'?'DNF':row.position?`P${row.position}`:'—'}</b><span>{row.name}</span>{row.points!==undefined&&<small>{row.points} 分</small>}</span>)}</button>}
        {quoted&&<button className="x-parent-quote" onClick={()=>setDetail(quoted.id)}><strong>{quoted.speaker}</strong><p>{quoted.text}</p>{quoted.card&&<small>{quoted.card.title}</small>}</button>}
        <div className="x-actions">
          <button onClick={()=>replyPost(post.id)} aria-label="回复帖子" title="回复"><XIcon name="reply"/> <span>{count||''}</span></button>
          <button className="x-action-repost" aria-pressed={state.reposted.includes(post.id)} onClick={()=>toggle('reposted',post.id)} aria-label="转帖" title="转帖"><XIcon name="repost"/> <span>{reposts||''}</span></button>
          <button className="x-action-like" aria-pressed={state.liked.includes(post.id)} onClick={()=>toggle('liked',post.id)} aria-label="点赞" title="点赞"><XIcon name="heart"/> <span>{likes||''}</span></button>
          <button aria-pressed={state.bookmarked.includes(post.id)} onClick={()=>toggle('bookmarked',post.id)} aria-label="收藏" title="书签"><XIcon name="bookmark"/></button>
          <button onClick={()=>quotePost(post.id)} aria-label="引用帖子" title="引用"><XIcon name="quote"/></button>
        </div>
        {!thread&&children.length>0&&<div className="x-comment-previews">{children.slice(-2).map(child=><button key={child.id} className="x-thread-preview" onClick={()=>setDetail(child.id)}><strong>{child.speaker}</strong> {child.text}</button>)}<button className="x-thread-preview" onClick={()=>setDetail(post.id)}>查看 {children.length} 条回复与接话</button></div>}
      </div>
    </article>;
  };
  let visible=posts;
  if(profileName)visible=profileTab==='media'?[]:profileTab==='replies'?posts.filter(p=>p.speaker===profileName&&p.replyToId):posts.filter(p=>!p.replyToId&&(p.speaker===profileName||(ownProfile&&state.reposted.includes(p.id))));
  else if(view==='bookmarks')visible=visible.filter(p=>state.bookmarked.includes(p.id));
  else if(view==='notifications')visible=visible.filter(p=>p.replyToId&&state.posts.some(own=>own.id===p.replyToId));
  else{
    if(view==='blog')visible=visible.filter(p=>p.account?.role==='team'||p.socialKind==='blog');
    if(view==='news')visible=visible.filter(p=>p.account?.role==='event');
    if(flow==='following'&&view==='live')visible=visible.filter(p=>state.followed.includes(p.speaker)||p.speaker===playerName);
    if(!query&&flow!=='discussion'&&topicFilter!=='emotion')visible=visible.filter(p=>!p.replyToId);
  }
  if(!profileName&&!selected&&topicFilter!=='all')visible=visible.filter(p=>topicFilter==='emotion'
    ?p.socialContext?.tags.some(t=>t.startsWith('emotion_'))||p.plan?.expresses?.some(t=>t.startsWith('emotion_'))
    :p.socialContext?.tags.includes(topicFilter==='result'?'race_result':topicFilter==='qualifying'?'qualifying_result':'contact'));
  if(query)visible=visible.filter(p=>(p.text+' '+p.speaker).includes(query));
  const feed=visible.slice().reverse();
  if(view==='forum'&&!profileName&&!query)feed.sort((a,b)=>posts.filter(p=>p.replyToId===b.id||p.quoteOfId===b.id||p.repostOfId===b.id).length-posts.filter(p=>p.replyToId===a.id||p.quoteOfId===a.id||p.repostOfId===a.id).length||b.round-a.round);
  if(ownProfile&&profileTab==='posts'){
    const pinned=feed.findIndex(p=>p.id===state.pinnedPostId);
    if(pinned>0)feed.unshift(...feed.splice(pinned,1));
  }
  const ancestors:NarrativeLine[]=[];
  let ancestorId=selected?.replyToId;
  const seen=new Set(selected?[selected.id]:[]);
  while(ancestorId&&!seen.has(ancestorId)){
    seen.add(ancestorId);
    const parent=posts.find(p=>p.id===ancestorId);
    if(!parent)break;
    ancestors.unshift(parent);ancestorId=parent.replyToId;
  }
  const replyParent=posts.find(post=>post.id===replyTarget);
  const composer=<form className="x-composer" onSubmit={event=>{event.preventDefault();publish(draft,posts.find(p=>p.id===quoteTarget),!!quoteTarget);}}>
    <span className="x-avatar x-avatar-driver">{playerName.slice(0,1)}</span><div>
      <span className="x-compose-audience">所有人</span>
      {!quoteTarget&&<div className="x-compose-context"><label>类型<select aria-label="帖子类型" value={postKind} onChange={e=>setPostKind(e.target.value as 'update'|'blog')}><option value="update">动态</option><option value="blog">车手博客</option></select></label><label>话题 / 态度<select aria-label="本场帖子话题" value={topicPostId} onChange={e=>setTopicPostId(e.target.value)}><option value="">不关联话题</option><optgroup label="本场比赛与情绪">{race?.socialTopics?.map(t=><option key={t.id} value={`topic:${t.id}`}>{t.label}</option>)}</optgroup><optgroup label="具体帖子">{posts.filter(p=>!p.replyToId&&p.socialContext).slice(-20).reverse().map(p=><option key={p.id} value={p.id}>{p.speaker} · {p.card?.title??p.text.slice(0,26)}</option>)}</optgroup></select></label></div>}
      <textarea aria-label="你的帖子" placeholder={race?'有什么新鲜事？':'跑一场比赛，围场就会热闹起来。'} maxLength={280} value={draft} onChange={e=>setDraft(e.target.value)} autoFocus={composeOpen}/>
      {quoteTarget&&<button type="button" className="x-parent-quote" onClick={()=>setQuoteTarget(null)}>{posts.find(p=>p.id===quoteTarget)?.text} · 取消引用</button>}
      <p className="x-compose-permission"><XIcon name="globe"/>所有人都可以回复</p>
      <div className="x-compose-bottom"><span className="x-compose-counter" aria-label={`已输入${draft.length}字，最多280字`}>{draft.length>0?`${draft.length} / 280`:''}</span><button className="x-publish" disabled={!ready||!race||!draft.trim()}>发布</button></div>
    </div>
  </form>;
  return <div className="x-timeline-layout">
    <section className="x-timeline">
      <div className="x-feed-top">
        <header className="x-feed-heading">
          {(selected||profile)&&<button className="x-icon-button" aria-label="返回时间线" onClick={()=>selected?setDetail(null):setProfile(null)}><XIcon name="back"/></button>}
          <div><strong>{selected?'帖子':profileName??(view==='bookmarks'?'书签':view==='notifications'?'通知':view==='blog'?'围场博客':view==='forum'?'赛后热帖':view==='news'?'赛事消息':'主页')}</strong>{profileName&&<small>{posts.filter(p=>p.speaker===profileName).length} 条帖子</small>}</div>
          <button className="x-icon-button x-search-toggle" aria-label="搜索帖子" aria-expanded={searchOpen} onClick={()=>setSearchOpen(open=>!open)} title="搜索"><XIcon name="search"/></button>
          <button className="x-icon-button x-live-toggle" aria-label={live?'暂停动态更新':'开启动态更新'} aria-pressed={live} onClick={()=>setLive(v=>!v)} title={live?'动态更新中，点击暂停':'点击开启动态更新'}><XIcon name={live?'pause':'play'}/></button>
        </header>
        {(searchOpen||query)&&<form className="x-search-bar" onSubmit={event=>event.preventDefault()}><XIcon name="search"/><input type="search" aria-label="搜索帖子" placeholder="搜索帖子或围场账号" value={query} onChange={e=>{setQuery(e.target.value);setDetail(null);setProfile(null);}} autoFocus={searchOpen}/><button type="button" className="x-icon-button" aria-label="关闭搜索" onClick={()=>{setQuery('');setSearchOpen(false);}}><XIcon name="close"/></button></form>}
        {!profileName&&!selected&&view==='live'&&<div className="x-flow-tabs"><button aria-pressed={flow==='for-you'} onClick={()=>setFlow('for-you')}>为你推荐</button><button aria-pressed={flow==='following'} onClick={()=>setFlow('following')}>正在关注</button><button aria-pressed={flow==='discussion'} onClick={()=>setFlow('discussion')}>讨论 / 回复</button></div>}
        {!profileName&&!selected&&['live','forum','blog','news'].includes(view)&&<div className="x-topic-filter"><label>话题 <select aria-label="筛选本场话题" value={topicFilter} onChange={event=>setTopicFilter(event.target.value)}><option value="all">全部</option><option value="result">本站结果</option><option value="qualifying">排位 / 发车位</option><option value="emotion">情绪 / 看台反应</option><option value="contact">碰撞争论</option></select></label></div>}
      </div>
      {profileName&&!selected&&<><XProfileHeader name={profileName} handle={handle(profileName)} info={profileInfo!} own={ownProfile} count={posts.filter(p=>p.speaker===profileName).length} followingCount={state.followed.length} isFollowing={state.followed.includes(profileName)} onFollow={()=>toggle('followed',profileName)}/>
        <div className="x-flow-tabs">{[['posts','动态'],['replies','回复'],['media','媒体']].map(([id,label])=><button key={id} aria-pressed={profileTab===id} onClick={()=>setProfileTab(id)}>{label}</button>)}</div></>}
      {!profileName&&!selected&&['live','blog'].includes(view)&&!composeOpen&&composer}
      {view==='forum'&&!selected&&!profileName&&<p className="x-empty">本场讨论按回复与转帖活动排序；点进帖子继续接话。</p>}
      {pending.length>0&&<div className="x-pending-controls"><button className="x-new-posts" onClick={()=>releaseBatch()}><span className="x-new-avatars">{[...new Set(pending.map(p=>p.speaker))].slice(0,3).map(name=><span className="x-avatar" key={name}>{name.slice(0,1)}</span>)}</span>显示下一批 · {pending.length} 条新活动</button><button className="x-release-all" onClick={()=>releaseBatch(queue.length)}>展开全部新活动</button></div>}
      {selected?<>
        {ancestorId&&!posts.some(p=>p.id===ancestorId)&&<p className="x-empty">较早的父帖未保留在这份比赛记录中。</p>}
        <div className="x-thread-ancestors">{ancestors.map(p=>card(p,true))}</div>{card(selected,true)}
        <form className="x-reply-form" onSubmit={e=>{e.preventDefault();publish(reply,selected);}}><span className="x-avatar x-avatar-driver">{playerName.slice(0,1)}</span><input aria-label="你的回复" placeholder="发布你的回复" maxLength={280} value={reply} onChange={e=>setReply(e.target.value)}/><button className="x-publish" disabled={!ready||!reply.trim()}>回复</button></form>
        {posts.filter(p=>p.replyToId===selected.id).map(p=>card(p,true))}
      </>:<>{feed.map(p=>card(p))}{!feed.length&&<p className="x-empty">{profileName&&profileTab==='media'?'还没有媒体附件。':flow==='following'&&view==='live'&&!profileName?'先关注几个看台账号。':'这里暂时没有动态。'}</p>}</>}
    </section>
    <aside className="x-sidebar"><label className="x-sidebar-search"><XIcon name="search"/><input type="search" aria-label="搜索围场" placeholder="搜索" value={query} onChange={e=>{setQuery(e.target.value);setDetail(null);setProfile(null);}}/></label>
      <section><h3>正在发生</h3><div className="x-sidebar-race"><small>围场 · 本场比赛</small><strong>{race?.track??'等待发车'}</strong><p>{posts.length} 条帖子与回复</p></div>
        {posts.some(p=>p.socialContext?.tags.includes('contact'))&&<button className="x-trend" onClick={()=>setDetail(posts.findLast(p=>p.account?.role==='event'&&p.socialContext?.tags.includes('contact'))?.id??null)}><small>赛车 · 讨论中</small><strong>两车接触</strong><span>{posts.filter(p=>p.socialContext?.tags.includes('contact')).length} 条相关动态</span></button>}
      </section>
      <section><h3>推荐关注</h3>{accounts.slice(0,5).map(name=><div className="x-follow-row" key={name}><button className="x-avatar" onClick={()=>openAccount(name)} aria-label={`查看${name}的主页`}>{name.slice(0,1)}</button><button className="x-account-link" onClick={()=>openAccount(name)}><strong>{name}</strong><small>{handle(name)}</small></button><button aria-pressed={state.followed.includes(name)} onClick={()=>toggle('followed',name)}>{state.followed.includes(name)?'已关注':'关注'}</button></div>)}{!accounts.length&&<p className="x-sidebar-race">比赛开始后会有观众出现。</p>}</section>
      <p className="x-sidebar-footer">本地虚构围场 · 热度含模拟观众<br/>没有外部社交账号连接</p>
    </aside>
    {(composeOpen||replyParent)&&<XComposeDialog title={replyParent?'回复帖子':'发布帖子'} onClose={()=>{setComposeOpen(false);setReplyTarget(null);}}>
      {replyParent?<><div className="x-dialog-parent"><span className="x-avatar">{replyParent.speaker.slice(0,1)}</span><div><strong>{replyParent.speaker}</strong><small>{handle(replyParent.speaker)} · R{replyParent.round}</small><p>{replyParent.text}</p><small>回复 {handle(replyParent.speaker)}</small></div></div><form className="x-composer" onSubmit={event=>{event.preventDefault();publish(reply,replyParent);}}><span className="x-avatar x-avatar-driver">{playerName.slice(0,1)}</span><div><textarea aria-label="你的回复" placeholder="发布你的回复" maxLength={280} value={reply} onChange={event=>setReply(event.target.value)} autoFocus/><div className="x-compose-bottom"><span className="x-compose-counter">{reply.length} / 280</span><button className="x-publish" disabled={!ready||!race||!reply.trim()}>回复</button></div></div></form></>:composer}
    </XComposeDialog>}
  </div>;
}
