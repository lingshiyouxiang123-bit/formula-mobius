"use client";

import { useState } from "react";
import type { MediaChannelSettings, MediaRoundBundle, MediaSourceRef, PressResponseIntent } from "@/game/types";

type MediaTab = keyof MediaChannelSettings;
const TAB_LABELS: Record<MediaTab, string> = { briefing: "简报", commentary: "解说", press: "记者会", blog: "车队博客", forum: "模拟社区", poster: "海报" };
const INTENT_LABELS: Record<PressResponseIntent, string> = { honest: "坦诚承担", team_first: "车队优先", hardline: "强硬反击", skip: "跳过" };

function Evidence({ source }: { source: MediaSourceRef }) {
  const revealLedger = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const ledger = event.currentTarget.closest(".media-hub")?.querySelector<HTMLDetailsElement>(".media-source-ledger");
    if (ledger) ledger.open = true;
  };
  return <small className="media-evidence">依据 · {source.eventIds.length ? source.eventIds.map((id) => <a href={`#media-event-${id}`} onClick={revealLedger} key={id}>日志 #{id}</a>) : source.statePaths.join(" · ") || source.factIds.join(" · ")}</small>;
}

function PosterPlaceholder({ bundle }: { bundle: MediaRoundBundle }) {
  const poster = bundle.poster;
  return <section className="poster-placeholder" style={{ "--poster-accent": poster.palette.accent, "--poster-bg": poster.palette.background } as React.CSSProperties} aria-label="完赛海报素材占位">
    <div className="poster-wire"><span>{poster.text.dateLabel}</span><strong>{poster.text.result}</strong><h3>{poster.text.driver}</h3><p>{poster.text.team} · {poster.text.track}</p><em>{poster.text.status}</em>{poster.layers.map((layer) => <i className={`poster-slot slot-${layer.id}`} key={layer.id}>{layer.label}<small>{layer.assetId ? `素材 ${layer.assetId}` : "等待素材"}</small></i>)}</div>
    <div className="poster-spec"><span>{poster.width} × {poster.height}</span><span>安全区 {poster.safeArea.width} × {poster.safeArea.height}</span><span>模板 {poster.templateId}</span><strong>当前仅显示构图与文字数据，不生成图片。</strong></div>
    <Evidence source={poster.source} />
  </section>;
}

export function MediaHub({ bundle, settings, defaultOpen = false, allowedTabs, onPressResponse, onSettingsChange }: {
  bundle: MediaRoundBundle;
  settings: MediaChannelSettings;
  defaultOpen?: boolean;
  allowedTabs?: MediaTab[];
  onPressResponse?: (raceId: string, questionId: string, intent: PressResponseIntent) => void;
  onSettingsChange?: (settings: MediaChannelSettings) => void;
}) {
  const visible = allowedTabs ?? Object.keys(TAB_LABELS) as MediaTab[];
  const available = visible.filter((tab) => settings[tab]);
  const [tab, setTab] = useState<MediaTab>(available[0] ?? "briefing");
  const [expanded, setExpanded] = useState(defaultOpen);
  const active = available.includes(tab) ? tab : available[0];
  return <details className="media-hub" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary><span>ROUND {bundle.seasonRound} / MEDIA</span><strong>{allowedTabs?.length === 1 && allowedTabs[0] === "press" ? "赛后记者会" : "媒体档案"}</strong><i>{bundle.stats.trackName}</i></summary>
    {onSettingsChange && <div className="media-channel-switch">{visible.map((id) => <label key={id}><input type="checkbox" checked={settings[id]} onChange={(event) => onSettingsChange({ ...settings, [id]: event.target.checked })} />{TAB_LABELS[id]}</label>)}</div>}
    {active ? <>
      <nav className="media-tabs">{available.map((id) => <button type="button" className={active === id ? "active" : ""} onClick={() => setTab(id)} key={id}>{TAB_LABELS[id]}</button>)}</nav>
      <div className="media-stage">
        {active === "briefing" && bundle.briefing.map((post) => <article className="media-line" key={post.id}><strong>赛前数据</strong><p>{post.text}</p><Evidence source={post.source} /></article>)}
        {active === "commentary" && <div className="media-feed">{bundle.commentary.length ? bundle.commentary.map((post) => <p key={post.id}><span>{post.author}</span>{post.text}<Evidence source={post.source} /></p>) : <p>本场没有进入关键事件解说队列的记录。</p>}</div>}
        {active === "press" && <div className="press-grid">{bundle.pressQuestions.map((question) => <article key={question.id}><span>{question.category.toUpperCase()}</span><strong>{question.text}</strong><Evidence source={question.source} />{question.answeredWith ? <p className="press-result">{INTENT_LABELS[question.answeredWith]} · {question.resultText}</p> : <div>{(["honest", "team_first", "hardline", "skip"] as PressResponseIntent[]).map((intent) => <button type="button" onClick={() => onPressResponse?.(bundle.raceId, question.id, intent)} key={intent}>{INTENT_LABELS[intent]}</button>)}</div>}</article>)}</div>}
        {active === "blog" && <div className="team-blog">{bundle.blog.map((section) => <article key={section.id}><span>{section.heading}</span><p>{section.text}</p><Evidence source={section.source} /></article>)}</div>}
        {active === "forum" && <div className="forum-stream"><p className="simulated-label">模拟社区 · 所有作者与内容均为本地生成</p>{[...bundle.forum, ...(bundle.seasonTopics ?? [])].map((topic) => <details key={topic.id}><summary><span>{topic.score}</span><strong>{topic.title}</strong><i>{topic.posts.length} 条</i></summary>{topic.posts.map((post) => <article className={post.replyToId ? "reply" : ""} key={post.id}><header><b>{post.author}</b><span>{post.persona} · +{post.score}</span></header><p>{post.text}</p><Evidence source={post.source} /></article>)}</details>)}</div>}
        {active === "poster" && <PosterPlaceholder bundle={bundle} />}
      </div>
      {(bundle.sourceEvents ?? []).length > 0 && <details className="media-source-ledger"><summary>依据日志 · {bundle.sourceEvents.length} 条</summary>{bundle.sourceEvents.map((event) => <p id={`media-event-${event.id}`} key={event.id}><span>R{event.round} · #{event.id}</span><strong>{event.code ?? event.type}</strong>{event.message}{event.ruleRef && <small>{event.ruleRef}</small>}</p>)}</details>}
    </> : <p className="media-disabled">所有媒体频道均已关闭；比赛与赛季状态不受影响。</p>}
  </details>;
}
