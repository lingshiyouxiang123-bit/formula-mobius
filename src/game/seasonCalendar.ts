import type { SeasonCalendarRound } from "./types";

/** M6 calendar data stays independent from the season engine and UI. */
export const SIX_ROUND_CALENDAR: SeasonCalendarRound[] = [
  { round: 1, trackId: "power-grand", sprint: false },
  { round: 2, trackId: "street-grand", sprint: true },
  { round: 3, trackId: "flowing-grand", sprint: false },
  { round: 4, trackId: "power-grand", sprint: false },
  { round: 5, trackId: "street-grand", sprint: true },
  { round: 6, trackId: "flowing-grand", sprint: false },
];

/** Pick two distinct rounds once when the season is created; the saved calendar stays fixed. */
export function createSeasonCalendar(seed: number): SeasonCalendarRound[] {
  const rounds = SIX_ROUND_CALENDAR.map(round => ({ ...round, sprint: false }));
  const eligible = rounds.map((_, index) => index);
  let randomState = seed >>> 0;
  for (let pick = 0; pick < 2; pick++) {
    let value = (randomState += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    const random = ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    const index = Math.floor(random * eligible.length);
    const [chosen] = eligible.splice(index, 1);
    rounds[chosen].sprint = true;
  }
  return rounds;
}
