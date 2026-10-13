import type { DriverState, RaceTimePenalty } from "./types";

/** These are board-game equivalents, not a linear seconds-to-distance conversion. */
export const PENALTY_CELLS: Record<RaceTimePenalty, number> = { 5: 2, 10: 4, 20: 10 };

export function racePenaltyTotals(driver: DriverState): { seconds: number; cells: number } {
  const totals = (driver.penalties.time ?? []).reduce((sum, seconds) => ({
    seconds: sum.seconds + seconds,
    cells: sum.cells + PENALTY_CELLS[seconds],
  }), { seconds: 0, cells: 0 });
  // Pending version-1 penalties can still be shown before their first new command.
  return {
    seconds: totals.seconds + driver.penalties.vp * 5 + driver.penalties.driveThrough * 20,
    cells: totals.cells + driver.penalties.vp * 2 + driver.penalties.driveThrough * 10,
  };
}

export function migrateRacePenalties(driver: DriverState): void {
  const penalties = driver.penalties;
  penalties.time ??= [];
  for (let points = penalties.vp; points > 0; points -= 2) penalties.time.push(points >= 2 ? 10 : 5);
  for (let count = 0; count < penalties.driveThrough; count++) penalties.time.push(20);
  penalties.vp = 0;
  penalties.driveThrough = 0;
}

export function addTimePenalty(driver: DriverState, seconds: RaceTimePenalty): void {
  migrateRacePenalties(driver);
  driver.penalties.time!.push(seconds);
  if (driver.raceStats) driver.raceStats.penaltiesReceived = (driver.raceStats.penaltiesReceived ?? 0) + 1;
}
