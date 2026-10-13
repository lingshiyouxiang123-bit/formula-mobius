import type { DriverState, RaceObjectiveId, RaceObjectiveState, TireCompound, Track } from "./types";
import { CHALLENGE_OBJECTIVE_IDS, EASY_OBJECTIVE_IDS, RACE_OBJECTIVES } from "./objectiveData";
import { racePenaltyTotals } from "./penalties";

export { RACE_OBJECTIVES } from "./objectiveData";

export interface RaceObjectiveContext {
  track: Track;
  gridSize: number;
  qualifyingRank: number;
  startingErs: number;
  startingTire: TireCompound;
  validCarsBehind: number;
  tireWearBurden?: boolean;
}

function objectiveState(id: RaceObjectiveId): RaceObjectiveState {
  const objective = RACE_OBJECTIVES[id];
  return { id, title: objective.title, difficulty: objective.difficulty, points: objective.points };
}

function indexFromD12(roll: number, count: number): number {
  if (count <= 1) return 0;
  const normalized = ((Math.trunc(roll) % 12) + 12) % 12;
  return Math.min(count - 1, Math.floor(normalized / 12 * count));
}

function naturalWearForRounds(tire: TireCompound, rounds: number): number {
  if (tire === "soft") return rounds;
  if (tire === "medium") return Math.floor(rounds / 2);
  if (tire === "intermediate" || tire === "wet") return rounds;
  return 0;
}

/** Conservative pre-race estimate used only to reject impossible no-stop goals. */
export function estimateNoStopWear(context: RaceObjectiveContext): number {
  const cornerSegments = context.track.segments.filter((segment) => segment.type === "corner" && (segment.cornerCost ?? 0) >= 2);
  const perCorner = context.startingTire === "soft" ? 2 : 1;
  const cornerWear = cornerSegments.length * context.track.laps * perCorner;
  const effectiveLapLoad = context.track.totalLength + context.track.segments.reduce((sum, segment) => sum + (segment.cornerCost ?? 0), 0);
  const baselineRounds = Math.max(context.track.laps, Math.ceil(effectiveLapLoad * context.track.laps / 6));
  return cornerWear + naturalWearForRounds(context.startingTire, baselineRounds) + (context.tireWearBurden ? baselineRounds : 0);
}

export function eligibleRaceObjectiveIds(context: RaceObjectiveContext): { easy: RaceObjectiveId[]; challenge: RaceObjectiveId[] } {
  const canDefend = context.qualifyingRank < context.gridSize && context.validCarsBehind > 0;
  const canNoStop = estimateNoStopWear(context) < 12;
  const cornerOpportunities = context.track.segments.filter((segment) => segment.type === "corner").length * context.track.laps;
  const allowed = (id: RaceObjectiveId): boolean => {
    switch (id) {
      case "defend_once":
      case "defend_twice": return canDefend;
      case "late_brake_pair": return cornerOpportunities >= 2;
      case "no_stop_finish": return canNoStop;
      case "back_row_podium": return context.gridSize >= 4 && context.qualifyingRank >= 4;
      case "ers_minimal": return context.startingErs >= 1;
      case "defense_wall": return context.gridSize >= 4 && canDefend;
      case "no_stop_podium": return context.gridSize >= 3 && canNoStop;
      default: return true;
    }
  };
  return { easy: EASY_OBJECTIVE_IDS.filter(allowed), challenge: CHALLENGE_OBJECTIVE_IDS.filter(allowed) };
}

export function drawRaceObjectives(easyRoll: number, challengeRoll: number, context?: RaceObjectiveContext): RaceObjectiveState[] {
  const pools = context ? eligibleRaceObjectiveIds(context) : { easy: EASY_OBJECTIVE_IDS, challenge: CHALLENGE_OBJECTIVE_IDS };
  const result: RaceObjectiveState[] = [];
  if (pools.easy.length > 0) result.push(objectiveState(pools.easy[indexFromD12(easyRoll, pools.easy.length)]));
  if (pools.challenge.length > 0) result.push(objectiveState(pools.challenge[indexFromD12(challengeRoll, pools.challenge.length)]));
  return result;
}

export function allocateObjectiveAwards(objectives: RaceObjectiveState[], cap = 4): RaceObjectiveState[] {
  const awards = new Map<RaceObjectiveId, number>();
  let remaining = cap;
  const challengeFirst = objectives.slice().sort((a, b) => Number(a.difficulty === "易") - Number(b.difficulty === "易"));
  for (const objective of challengeFirst) {
    const awarded = objective.completed ? Math.min(objective.points, remaining) : 0;
    awards.set(objective.id, awarded);
    remaining -= awarded;
  }
  return objectives.map((objective) => ({ ...objective, awardedPoints: awards.get(objective.id) ?? 0 }));
}

export function objectiveCompleted(id: RaceObjectiveId, driver: DriverState, rank: number): boolean {
  const stats = driver.raceStats;
  const classified = driver.status === "finished" || driver.status === "classified";
  if (!classified) return false;
  const noPenalty = (stats?.penaltiesReceived ?? 0) === 0 && racePenaltyTotals(driver).seconds === 0;
  switch (id) {
    case "clean_race": return (stats?.contacts ?? 0) === 0 && noPenalty;
    case "defend_once": return (stats?.defensesWon ?? 0) >= 1;
    case "late_brake_pair": return (stats?.lateBrakeSuccesses ?? 0) >= 2;
    case "defend_twice": return (stats?.defensesWon ?? 0) >= 2;
    case "no_stop_finish": return (stats?.pitStops ?? 0) === 0;
    case "back_row_podium": return driver.qualifyingRank >= 4 && rank <= 3;
    case "ers_minimal": return (stats?.ersUsed ?? 0) <= 1 && rank <= 2;
    case "clean_podium": return rank <= 3 && (stats?.contacts ?? 0) === 0 && noPenalty;
    case "defense_wall": return (stats?.defensesWon ?? 0) >= 3 && noPenalty;
    case "no_stop_podium": return rank <= 3 && (stats?.pitStops ?? 0) === 0;
  }
}

export function objectiveProgress(id: RaceObjectiveId, driver: DriverState, rank: number): string {
  const stats = driver.raceStats;
  const penalties = stats?.penaltiesReceived ?? 0;
  switch (id) {
    case "clean_race": return `接触 ${stats?.contacts ?? 0} · 处罚 ${penalties}`;
    case "defend_once": return `防守 ${Math.min(1, stats?.defensesWon ?? 0)}/1`;
    case "late_brake_pair": return `成功晚刹 ${Math.min(2, stats?.lateBrakeSuccesses ?? 0)}/2`;
    case "defend_twice": return `防守 ${Math.min(2, stats?.defensesWon ?? 0)}/2`;
    case "no_stop_finish": return `进站 ${stats?.pitStops ?? 0}`;
    case "back_row_podium": return `发车 P${driver.qualifyingRank} · 当前 P${rank}`;
    case "ers_minimal": return `ERS ${stats?.ersUsed ?? 0}/1 · 当前 P${rank}`;
    case "clean_podium": return `接触 ${stats?.contacts ?? 0} · 处罚 ${penalties} · P${rank}`;
    case "defense_wall": return `防守 ${Math.min(3, stats?.defensesWon ?? 0)}/3 · 处罚 ${penalties}`;
    case "no_stop_podium": return `进站 ${stats?.pitStops ?? 0} · 当前 P${rank}`;
  }
}
