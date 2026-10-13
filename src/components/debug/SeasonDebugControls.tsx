"use client";

import { useState } from "react";
import { dispatchGameCommand } from "../../game/engine";
import type { GameState, SeasonState } from "../../game/types";

// TEMP_SEASON_DEBUG: remove this file and its marked GameApp/RaceCenter seams.
// Only an explicit button click fabricates a finish; normal game rules never call it.
export function debugFinishSeasonRace(input: GameState, playerRank: number): GameState {
  const state = structuredClone(input);
  const others = state.drivers.filter(driver => !driver.isHuman);
  const human = state.drivers.find(driver => driver.isHuman)!;
  const rank = Math.min(state.drivers.length, Math.max(1, playerRank));
  others.splice(rank - 1, 0, human);
  const distance = state.track.totalLength * state.track.laps;
  state.round = 10;
  state.raceSession = "race";
  state.sessionLaps = state.track.laps;
  state.phase = "movement";
  state.weather = "cloudy";
  state.raceControl = "green";
  state.presentation = undefined;
  state.broadcast = undefined;
  state.teamOrder = undefined;
  state.pendingDecision = null;
  state.pendingContext = null;
  state.objectives = [];
  state.results = [];
  others.forEach((driver, index) => {
    driver.progress = distance - 1 - index * 3;
    driver.qualifyingRank = index + 1;
    driver.status = "racing";
    driver.tire = "hard";
    driver.tireCompoundsUsed = ["soft", "hard"];
    driver.wear = 0;
    driver.heat = 0;
    driver.burdens = [];
    driver.pit = undefined;
  });
  state.movement = { queue: [others[0].id], queueIndex: 0, activeDriverId: others[0].id, remainingMp: 1, paidCornerIds: state.track.segments.map(segment => segment.id), started: true, freeDefenseUsed: [], movedDriverIds: [] };
  if (state.weekend?.sprintEnabled) {
    state.weekend.sprintCompleted = true;
    state.weekend.sprintResults = others.map((driver, index) => ({ driverId: driver.id, rank: index + 1, status: index === 0 ? "finished" : "classified", points: [8, 7, 6, 5, 4, 3, 2, 1][index] ?? 0 }));
  }
  const result = dispatchGameCommand(state, { type: "CONTINUE_MOVEMENT" });
  if (!result.ok) throw new Error(result.error);
  if (result.state.phase !== "finished") throw new Error("调试冲线未完成，请保留原存档");
  return result.state;
}

export function SeasonDebugControls({ season, disabled, onFinish }: { season: SeasonState; disabled: boolean; onFinish: (rank: number) => void }) {
  const [rank, setRank] = useState(1);
  return <details><summary>赛季作弊 · 临时调试</summary><p>跳过本站驾驶，以指定名次结算（冲刺同名次）。会写正式赛季、成长和车队档案；不是模拟真实比赛。站间研发和行动仍可正常操作。</p><label>玩家名次 <select value={rank} onChange={event => setRank(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>P{value}</option>)}</select></label> <button type="button" className="button ghost" disabled={disabled || season.status !== "active" || season.awaitingInterRoundActions || !season.sponsor} onClick={() => { if (window.confirm("作弊结算本站并更新正式存档？")) onFinish(rank); }}>快速结算本站</button></details>;
}
