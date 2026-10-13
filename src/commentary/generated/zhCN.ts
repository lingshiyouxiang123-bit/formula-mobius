import type { GameEvent, GameState } from "@/game/types";

export function introCopy(game: GameState, stage: number): { kicker: string; title: string; body: string } {
  const weather = game.weather === "heavy_rain" ? "大雨" : game.weather === "light_rain" ? "小雨" : game.weather === "cloudy" ? "阴天" : "晴天";
  const pole = game.drivers.slice().sort((a, b) => a.qualifyingRank - b.qualifyingRank)[0];
  const drsCount = game.track.segments.filter((segment) => segment.drs).length;
  const pages = [
    { kicker: `TRACK ${game.track.id}`, title: game.track.name, body: `${game.track.totalLength} 格 × ${game.track.laps} 圈 · 维修入口 C${game.track.pitEntryCell + 1} · 出口 C${game.track.pitExitCell + 1}` },
    { kicker: "TRACK DATA", title: `${game.track.segments.length} 个赛段`, body: `${game.track.segments.filter((segment) => segment.type === "straight").length} 段直道 · ${game.track.segments.filter((segment) => segment.type === "corner").length} 个弯区 · ${drsCount} 个 DRS 区` },
    { kicker: `WEATHER D12 ${game.weatherRoll ?? "—"}`, title: `${weather} · ${weather === "大雨" || weather === "小雨" ? "WET" : "DRY"}`, body: weather === "大雨" || weather === "小雨" ? "DRS 关闭 · 尾流关闭 · 启用雨胎磨损规则" : "DRS 可用 · 尾流可用 · 启用干地轮胎规则" },
    { kicker: `GRID ${game.drivers.length} CARS`, title: pole ? `P1 ${pole.profile.abbreviation}` : "发车顺序", body: pole ? `${pole.profile.name} · 排位名次由 D12 + ENG + 模式修正决定，同分比较 AERO` : "排位数据不可用" },
    { kicker: "START SEQUENCE", title: "红灯 0/5", body: "等待发车灯序列" },
  ];
  return pages[Math.min(stage, pages.length - 1)];
}

export function commentaryForEvent(event: GameEvent | undefined, game: GameState): string {
  if (!event) return `R${game.round} · 等待下一条规则事件`;
  return event.message;
}
