import { F1_KNOWLEDGE_2020_2025 } from "./data/f1Knowledge.2020-2025";
import type { NlgContext, NlgFact } from "./types";
import { publicDriverInfo } from "../game/engine";

const weatherNames: Record<string, string> = { sunny: "晴天", cloudy: "阴天", light_rain: "小雨", heavy_rain: "大雨" };
const tireNames: Record<string, string> = { soft: "软胎", medium: "中胎", hard: "硬胎", intermediate: "半雨胎", wet: "全雨胎" };

export function buildRaceFactIndex({ game, season, visibility }: NlgContext): NlgFact[] {
  const facts: NlgFact[] = F1_KNOWLEDGE_2020_2025.map((fact) => ({ ...fact }));
  if (game) {
    facts.push(
      { id: "race-track", topic: "race", predicate: "track", value: game.track.name, certainty: "fact", sourcePath: "GameState.track", text: `当前赛道是${game.track.name}，比赛距离 ${game.sessionLaps ?? game.track.laps} 圈。` },
      { id: "race-round", topic: "race", predicate: "round", value: game.round, certainty: "fact", sourcePath: "GameState.round/phase", text: `比赛当前处于第 ${game.round} 回合，阶段为 ${game.phase}。` },
      { id: "race-weather", topic: "strategy", predicate: "weather", value: game.weather ?? "unknown", certainty: "fact", sourcePath: "GameState.weather", text: `当前天气为${weatherNames[game.weather ?? ""] ?? "未确定"}。` },
      { id: "race-control", topic: "incident", predicate: "race_control", value: game.raceControl, certainty: "fact", sourcePath: "GameState.raceControl", text: `赛会控制状态为 ${game.raceControl.toUpperCase()}。` },
    );
    const ordered = game.results.length
      ? game.results.map((result) => game.drivers.find((driver) => driver.id === result.driverId)).filter((driver): driver is NonNullable<typeof driver> => Boolean(driver))
      : game.drivers.slice().sort((left, right) => Number(left.status === "dnf") - Number(right.status === "dnf") || right.progress - left.progress || left.qualifyingRank - right.qualifyingRank);
    ordered.forEach((driver, index) => {
      const result = game.results.find((item) => item.driverId === driver.id);
      const rank = result?.rank ?? index + 1;
      const lap = Math.min(game.sessionLaps ?? game.track.laps, Math.floor(driver.progress / game.track.totalLength) + 1);
      facts.push(
        { id: `driver-${driver.id}-position`, topic: "result", subject: driver.id, predicate: "position", value: rank, certainty: "fact", sourcePath: `GameState.drivers.${driver.id}.progress/results`, text: `${driver.profile.name} 当前为 P${rank}${result ? `，状态 ${result.status}` : `，第 ${lap} 圈`}。` },
        { id: `driver-${driver.id}-status`, topic: "performance", subject: driver.id, predicate: "status", value: driver.status, certainty: "fact", sourcePath: `GameState.drivers.${driver.id}`, text: visibility === "public" && driver.id !== game.humanDriverId ? `${driver.profile.name}：${tireNames[driver.tire] ?? driver.tire}，公开磨损等级 ${publicDriverInfo(driver).wear}，热量等级 ${publicDriverInfo(driver).heat}，ERS 等级 ${publicDriverInfo(driver).ers}。` : `${driver.profile.name}：${tireNames[driver.tire] ?? driver.tire}，磨损 ${driver.wear}/12，热量 ${driver.heat}/6，ERS ${driver.ers}。` },
        { id: `driver-${driver.id}-stats`, topic: "performance", subject: driver.id, predicate: "race_stats", value: driver.raceStats?.cellsMoved ?? 0, certainty: "fact", sourcePath: `GameState.drivers.${driver.id}.raceStats`, text: `${driver.profile.name} 已移动 ${driver.raceStats?.cellsMoved ?? 0} 格，完成 ${driver.raceStats?.overtakes ?? 0} 次超车、${driver.raceStats?.pitStops ?? 0} 次进站。` },
      );
      if (driver.status === "dnf") facts.push({ id: `driver-${driver.id}-dnf`, topic: "incident", subject: driver.id, predicate: "dnf", value: driver.dnfReason ?? "未记录", certainty: "fact", text: `${driver.profile.name} 已退赛：${driver.dnfReason ?? "原因未记录"}。` });
    });
    for (const event of game.logs.slice(-20)) {
      facts.push({ id: `event-${event.id}`, topic: event.type === "incident" || event.code?.startsWith("incident") || event.code?.startsWith("penalty") ? "incident" : "event", predicate: event.code ?? event.type, value: event.message, certainty: "fact", sourceEventIds: [event.id], ruleRef: event.ruleRef, text: `R${event.round}：${event.message}` });
    }
  }
  if (season) {
    const ordered = season.standings.slice().sort((left, right) => right.championshipPoints - left.championshipPoints || left.name.localeCompare(right.name, "zh-CN"));
    ordered.forEach((standing, index) => facts.push({ id: `season-${standing.driverId}-standing`, topic: "standings", subject: standing.driverId, predicate: "championship_position", value: index + 1, certainty: "fact", text: `${standing.name} 位列赛季 P${index + 1}，共 ${standing.championshipPoints} 分。` }));
    facts.push(
      { id: "season-reputation", topic: "development", predicate: "reputation", value: season.reputation, certainty: "fact", text: `车手声望为 ${season.reputation}/10。` },
      { id: "season-budget", topic: "development", predicate: "budget", value: season.playerTeam.budgetRemaining, unit: "BU", certainty: "fact", text: `${season.playerTeam.name} 剩余 ${season.playerTeam.budgetRemaining}/${season.playerTeam.budgetCap} BU，研发点为 ${season.playerTeam.developmentPoints} RP。` },
      { id: "season-contract", topic: "development", predicate: "contract", value: season.currentContract.role, certainty: "fact", text: `当前合同为${season.currentContract.teamName}的${season.currentContract.role === "primary" ? "一号车手" : season.currentContract.role === "race" ? "正式" : "储备"}席位。` },
    );
    if (season.sponsor) facts.push({ id: "season-sponsor", topic: "development", predicate: "sponsor", value: season.sponsor.progress, certainty: "fact", text: `${season.sponsor.name}目标进度为 ${season.sponsor.progress}/${season.sponsor.target}。` });
  }
  return facts.slice(0, 500);
}
