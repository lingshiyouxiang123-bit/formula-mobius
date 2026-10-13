"use client";

import { useState } from "react";
import type { GameState } from "@/game/types";
import { RACE_TEXT_TEMPLATES } from "@/game/raceTextTemplates";

const FILTERS = [
  ["all", "全部"], ["roll", "掷骰"], ["move", "移动"],
  ["resource", "资源"], ["incident", "事故"], ["result", "结算"],
] as const;

export function RaceEventLog({ game }: { game: GameState }) {
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [currentRound, setCurrentRound] = useState(false);
  const search = query.trim().toLocaleLowerCase();
  const matching = game.logs.filter((event) =>
    (filter === "all" || event.type === filter) &&
    (!currentRound || event.round === game.round) &&
    (!search || event.message.toLocaleLowerCase().includes(search) || event.code?.toLocaleLowerCase().includes(search) || event.ruleRef?.toLocaleLowerCase().includes(search)),
  );
  const events = matching.slice(-80).reverse();
  return <section className="race-log-content">
    <div className="race-log-tools">
      <div className="race-log-filters" role="group" aria-label="日志类型">
        {FILTERS.map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
      </div>
      <div className="race-log-search">
        <input type="search" aria-label="搜索比赛日志" placeholder="搜索车手、MP、判定…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <label><input type="checkbox" checked={currentRound} onChange={(event) => setCurrentRound(event.target.checked)} />本回合</label>
        <output aria-live="polite">{events.length}/{matching.length}</output>
      </div>
    </div>
    <div className="log-list">
      {events.map((event) => {
        const template = event.code ? RACE_TEXT_TEMPLATES[event.code] : undefined;
        return <div id={`event-${event.id}`} className={`log-entry ${event.type}`} key={event.id}><span title={`事件 ${event.id} · ${template?.title ?? event.code ?? "legacy"} · 规则 ${event.ruleRef ?? "旧存档"}`}>R{event.round}</span><p>{event.message}</p></div>;
      })}
      {events.length === 0 && <p className="log-empty">没有符合筛选条件的记录。<button type="button" onClick={() => { setFilter("all"); setQuery(""); setCurrentRound(false); }}>清除筛选</button></p>}
    </div>
  </section>;
}
