"use client";
import { useCallback, useState } from "react";
import type { AppSection } from "@/components/shell/LandingPage";
import type { GameState, MediaChannelSettings, SeasonState } from "@/game/types";
import type { RaceNarrative } from "@/narrative/engine";
import { MediaHub } from "./MediaHub";
import {XTimeline} from './XTimeline';
import {XIcon} from './XIcon';
import {createDialogueSession} from '@/nlg';
import {playerHandle} from '@/narrative/social/accounts';
import {reviewRaceNarrative} from '@/narrative/social/review';

interface Props {
  narratives: Record<string, RaceNarrative>;
  season: SeasonState | null;
  savedMatch: GameState | null;
  onNavigate: (section: AppSection) => void;
  onResume: () => void;
  onMediaSettings: (settings: MediaChannelSettings) => void;
}


export function SocialMediaPage({ narratives, season, savedMatch, onNavigate, onResume, onMediaSettings }: Props) {
  const [channel, setChannel] = useState("live");
  const [selected, setSelected] = useState("");
  const [composeRequest, setComposeRequest] = useState(0);
  const [navigationRequest, setNavigationRequest] = useState(0);
  const composeHandled = useCallback(() => setComposeRequest(0), []);
  const races = Object.values(narratives).slice().reverse();
  const liveRace = selected ? races.find(r => r.raceId === selected) : races.find(r => r.raceId === savedMatch?.id) ?? races[0];
  const bundles = season?.mediaArchive ?? [];
  const bundle = bundles.find(b=>b.raceId===(selected||liveRace?.raceId)) ?? (!selected&&!liveRace?bundles.at(-1):undefined);
  const race:RaceNarrative|undefined=liveRace??(bundle?.socialPosts?reviewRaceNarrative({version:1,raceId:bundle.raceId,track:bundle.stats.trackName,events:[],commentary:[],radio:[],social:bundle.socialPosts,processed:0,alerts:{},dialogue:createDialogueSession('engineer'),result:bundle.socialResult,socialTopics:bundle.socialTopics}):undefined);
  const channels = [["live", "主页", "home"], ["news", "赛事消息", "search"], ["notifications","通知", "bell"], ["bookmarks","书签", "bookmark"], ["profile","个人主页", "user"], ["forum", "赛后热帖", "reply"], ["blog", "围场博客", "team"], ["archive", "比赛档案", "archive"]];
  const name = channels.find(([id]) => id === channel)?.[1] ?? "";
  const playerName = savedMatch?.id === race?.raceId ? savedMatch?.drivers.find(d => d.id === savedMatch.humanDriverId)?.profile.name ?? "我的车手" : race?.result?.driverName ?? "我的车手";
  const compose = () => { setChannel("live"); setComposeRequest(request => request + 1); };
  return <div className="workspace-page social-workspace x-social-workspace">
    <div className="social-layout">
      <aside className="social-channels">
        <button className="x-brand" aria-label="返回游戏主页" onClick={()=>onNavigate('landing')}>P<span>围场</span></button>
        {channels.map(([id, label,icon]) => <button aria-label={label} aria-pressed={channel === id} className={`x-nav-item x-nav-${id} ${channel === id ? "active" : ""}`} onClick={() => { setChannel(id); setNavigationRequest(request => request + 1); }} key={id}><XIcon name={icon}/><span className="x-nav-label">{label}</span></button>)}
        <select className="x-mobile-menu" aria-label="更多社交页面" value={channel} onChange={e=>e.target.value==='game'?onNavigate('landing'):e.target.value==='resume'?onResume():setChannel(e.target.value)}>{channels.map(([id,label])=><option key={id} value={id}>{label}</option>)}<option value="game">返回游戏</option>{savedMatch&&<option value="resume">继续比赛</option>}</select>
        <button className="x-nav-compose" onClick={compose} aria-label="发布帖子"><XIcon name="compose"/><span>发布</span></button>
        <label>比赛档案<select value={selected} onChange={e => setSelected(e.target.value)}>
          <option value="">最近比赛</option>
          {Array.from(new Set([...races.map(r => r.raceId), ...bundles.map(b => b.raceId)])).map(id =>
            <option value={id} key={id}>{races.find(r => r.raceId === id)?.track ?? bundles.find(b => b.raceId === id)?.stats.trackName} · {id.slice(-6)}</option>
          )}
        </select></label>
        {savedMatch && <button className="x-resume" onClick={onResume}><XIcon name="back"/><span>继续比赛</span></button>}
        <button className="x-nav-account" onClick={() => setChannel("profile")} aria-label={`查看${playerName}的个人主页`}><span className="x-avatar">{playerName.slice(0,1)}</span><span className="x-nav-account-name"><strong>{playerName}</strong><small>{playerHandle}</small></span><XIcon name="more"/></button>
      </aside>
      <main className="social-feed">
        {!["live","news","blog","notifications","bookmarks","profile","forum"].includes(channel)&&<header><span>PADDOCK FEED</span><h2>{name}</h2><p>{race?.track ?? bundle?.stats.trackName ?? "围场"} · 车迷评论和官方动态随比赛记录更新。</p></header>}
        {(["live","news","blog","notifications","bookmarks","profile"].includes(channel)||channel==='forum'&&race)&&<XTimeline race={race} view={channel} playerName={playerName} composeRequest={composeRequest} onComposeHandled={composeHandled} navigationRequest={navigationRequest}/>}
        {channel==='forum'&&!race&&!bundle&&<div className="empty-state">还没有比赛讨论。</div>}
        {(channel==='archive'||channel==='forum'&&!race) && bundle && season && <MediaHub
          key={`${bundle.raceId}:${channel}`} bundle={bundle} settings={season.mediaSettings} defaultOpen
          allowedTabs={channel === "forum" ? ["forum"] : ["briefing", "commentary", "blog", "forum", "poster"]}
          onSettingsChange={onMediaSettings}
        />}
        {channel === "archive" && !bundle && (race ? <section className="social-post"><h3>比赛转播档案 · {race.track}</h3>{race.commentary.map(line => <p key={line.id}>R{line.round} · {line.text}</p>)}</section> : <div className="empty-state">还没有比赛档案。</div>)}
      </main>
    </div>
    <button className="x-mobile-compose" onClick={compose} aria-label="发布帖子"><XIcon name="compose"/></button>
  </div>;
}
