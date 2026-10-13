import type { DriverProfile, GameState, SeasonState, TeamProfile, Track } from "./types";
import { createTeamDevelopment, normalizeProfileDevelopment } from "./career";
import { defaultEventCode, RACE_EVENT_RULES } from "./raceRules";
import { analyzeTrack, validateTrack } from "./trackGenerator";
import { migrateSeasonDevelopment } from "./seasonDevelopment";
import { migrateSeasonMarket } from "./seasonMarket";
import { migrateAdvancedSeason } from "./advancedSeason";
import { migrateSeasonMedia } from "../media";
import { TALENTS, TIRES } from "./config";
import { migrateRacePenalties } from "./penalties";

const PROFILES_KEY = "f1game.profiles.v1";
const MATCH_KEY = "f1game.active-match.v1";
const TEAMS_KEY = "f1game.teams.v1";
const TRACKS_KEY = "f1game.tracks.v1";
const SEASON_KEY = "f1game.season.v1";

// An explicitly saved empty roster is not an old pre-team-system archive.
export function hasTeamArchive(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(TEAMS_KEY) !== null;
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isProfile(value: unknown): value is DriverProfile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DriverProfile>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" && candidate.name.length > 0 &&
    typeof candidate.abbreviation === "string" && candidate.abbreviation.length > 0 &&
    typeof candidate.color === "string" &&
    isCarStats(candidate.stats) &&
    typeof candidate.talent === "string" && candidate.talent in TALENTS
  );
}

function isCarStats(value: unknown): value is DriverProfile["stats"] {
  if (!value || typeof value !== "object") return false;
  const stats = value as Partial<DriverProfile["stats"]>;
  return [stats.eng, stats.aero, stats.mech, stats.brk, stats.rel].every((entry) => Number.isInteger(entry) && Number(entry) >= 1 && Number(entry) <= 5);
}

export function loadProfiles(): DriverProfile[] {
  const profiles = readJson<unknown>(PROFILES_KEY);
  if (!Array.isArray(profiles)) return [];
  return profiles.filter(isProfile).flatMap((profile) => {
    try { return [normalizeProfileDevelopment(profile)]; }
    catch { return []; }
  });
}

export function saveProfiles(profiles: DriverProfile[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

function isTeam(value: unknown): value is TeamProfile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TeamProfile>;
  return typeof candidate.id === "string" && Boolean(candidate.id) && typeof candidate.name === "string" && Boolean(candidate.name) && typeof candidate.abbreviation === "string" && Boolean(candidate.abbreviation) && typeof candidate.color === "string" && isCarStats(candidate.stats);
}

function isDriverState(value: unknown): value is GameState["drivers"][number] {
  if (!value || typeof value !== "object") return false;
  const driver = value as Partial<GameState["drivers"][number]>;
  const finite = (entry: unknown) => typeof entry === "number" && Number.isFinite(entry);
  const tactical = driver.tactical as Partial<NonNullable<typeof driver.tactical>> | undefined;
  const penalties = driver.penalties as Partial<NonNullable<typeof driver.penalties>> | undefined;
  return typeof driver.id === "string" && Boolean(driver.id) && isProfile(driver.profile) && typeof driver.isHuman === "boolean" &&
    ["racing", "finished", "classified", "dnf"].includes(String(driver.status)) && finite(driver.progress) &&
    (driver.lane === "left" || driver.lane === "right") && Number.isInteger(driver.qualifyingRank) &&
    typeof driver.tire === "string" && driver.tire in TIRES && [driver.wear, driver.heat, driver.brakeHeat, driver.ers].every(finite) &&
    Boolean(tactical) && [tactical?.lateBrake, tactical?.defense, tactical?.cooling, tactical?.quickRepair].every(finite) &&
    Array.isArray(driver.burdens) && finite(driver.lightDamage) && typeof driver.heavyDamage === "boolean" &&
    [driver.reliabilityPenalty, driver.breakdowns, driver.stoppedRounds, driver.powerPenaltyRounds].every(finite) &&
    Boolean(penalties) && [penalties?.vp, penalties?.driveThrough].every(finite) &&
    (penalties?.time === undefined || (Array.isArray(penalties.time) && penalties.time.every((seconds) => [5, 10, 20].includes(seconds))));
}

export function loadTeams(): TeamProfile[] {
  const teams = readJson<unknown>(TEAMS_KEY);
  if (!Array.isArray(teams)) return [];
  return teams.filter(isTeam).flatMap((team) => {
    try {
      return [{
        ...team,
        researchPhilosophy: team.researchPhilosophy ?? "reliability",
        development: {
          ...createTeamDevelopment(team.name, team.stats),
          ...(team.development ?? {}),
          name: team.name,
          baseStats: team.development?.baseStats ?? team.stats,
          upgrades: Array.isArray(team.development?.upgrades) ? team.development.upgrades : [],
          facilities: team.development?.facilities ?? {},
          facilityUpgrades: Array.isArray(team.development?.facilityUpgrades) ? team.development.facilityUpgrades : [],
        },
      }];
    } catch { return []; }
  });
}

export function saveTeams(teams: TeamProfile[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TEAMS_KEY, JSON.stringify(teams));
}

function isTrack(value: unknown): value is Track {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Track>;
  return typeof candidate.id === "string" && typeof candidate.name === "string" && Number.isInteger(candidate.laps) && Number(candidate.laps) > 0 &&
    Number.isInteger(candidate.totalLength) && Number.isInteger(candidate.pitEntryCell) && Number.isInteger(candidate.pitExitCell) &&
    Array.isArray(candidate.segments) && candidate.segments.every((segment) => segment && typeof segment.id === "string" && (segment.type === "straight" || segment.type === "corner") && Number.isInteger(segment.length) && segment.length > 0) &&
    Array.isArray(candidate.mapPoints) && candidate.mapPoints.every((point) => Array.isArray(point) && point.length === 2 && point.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)));
}

export function loadGeneratedTracks(): Track[] {
  const tracks = readJson<unknown>(TRACKS_KEY);
  if (!Array.isArray(tracks)) return [];
  return tracks.filter(isTrack).flatMap((track) => {
    try { return track.generated && validateTrack(track).length === 0 ? [{ ...track, analysis: analyzeTrack(track) }] : []; }
    catch { return []; }
  });
}

export function saveGeneratedTracks(tracks: Track[]): void {
  if (typeof window === "undefined") return;
  const valid = tracks.filter((track) => Boolean(track.generated) && validateTrack(track).length === 0);
  window.localStorage.setItem(TRACKS_KEY, JSON.stringify(valid));
}

export function loadMatch(): GameState | null {
  const match = readJson<unknown>(MATCH_KEY);
  if (!match || typeof match !== "object") return null;
  const candidate = match as Partial<GameState>;
  const phases = new Set(["practice", "setup", "qualifying", "preRace", "strategy", "movement", "roundEnd", "redFlag", "finished"]);
  if (candidate.schemaVersion !== 1 || !isTrack(candidate.track) || !Array.isArray(candidate.drivers) || candidate.drivers.length < 2 || !phases.has(String(candidate.phase)) || typeof candidate.humanDriverId !== "string") return null;
  if (candidate.drivers.some((driver) => !isDriverState(driver))) return null;
  if (!Number.isInteger(candidate.round) || !Number.isInteger(candidate.rngState) || !Number.isInteger(candidate.nextLogId) || !Array.isArray(candidate.qualifying) || !candidate.plans || typeof candidate.plans !== "object" || !Array.isArray(candidate.results)) return null;
  if (!candidate.drivers.some((driver) => driver.id === candidate.humanDriverId)) return null;
  try {
    if (validateTrack(candidate.track).length) return null;
    const state = candidate as GameState;
    state.weekendMode ??= "quick";
    state.raceSession ??= "race";
    state.sessionLaps ??= state.track.laps;
    state.weatherMode ??= "fixed";
    state.raceControl ??= "green";
    if (state.presentation && ["practice", "setup", "qualifying", "preRace"].includes(state.phase)) state.presentation = undefined;
    state.teamOrderHistory ??= [];
    state.teammateRelationshipDelta ??= 0;
    state.weatherHistory ??= [];
    state.drivers = state.drivers.map((driver) => ({
      ...driver,
      trackLimitWarnings: driver.trackLimitWarnings ?? driver.raceStats?.trackLimitWarnings ?? 0,
      blueFlagYielding: driver.blueFlagYielding ?? false,
      penalties: driver.penalties ?? { vp: 0, driveThrough: 0 },
      tireCompoundsUsed: driver.tireCompoundsUsed ?? [driver.tire],
    }));
    if (state.phase !== "finished") state.drivers.forEach(migrateRacePenalties);
    const eventTypes = new Set(["info", "roll", "resource", "move", "incident", "result"]);
    state.logs = (Array.isArray(state.logs) ? state.logs : []).flatMap((event) => {
      if (!event || typeof event !== "object" || typeof event.message !== "string" || !eventTypes.has(event.type)) return [];
      const code = event.code && event.code in RACE_EVENT_RULES ? event.code : defaultEventCode(event.type);
      return [{ ...event, code, ruleRef: event.ruleRef ?? RACE_EVENT_RULES[code].ruleRef }];
    });
    return state;
  } catch {
    return null;
  }
}

export function saveMatch(match: GameState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MATCH_KEY, JSON.stringify(match));
}

export function clearMatch(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(MATCH_KEY);
}

export function loadSeason(): SeasonState | null {
  const season = readJson<unknown>(SEASON_KEY);
  if (!season || typeof season !== "object") return null;
  const candidate = season as Partial<SeasonState>;
  const validCalendar = Array.isArray(candidate.calendar) && candidate.calendar.length === 6 && candidate.calendar.every((round, index) =>
    round && Number.isInteger(round.round) && round.round === index + 1 && typeof round.trackId === "string" && round.trackId.length > 0 && typeof round.sprint === "boolean",
  );
  if (
    candidate.schemaVersion !== 1 || typeof candidate.id !== "string" || !candidate.id ||
    typeof candidate.humanDriverId !== "string" || !candidate.humanDriverId ||
    !Number.isInteger(candidate.seed) || !Number.isInteger(candidate.currentRound) ||
    !Number.isInteger(candidate.aiCount) || Number(candidate.aiCount) < 1 || Number(candidate.aiCount) > 5 ||
    (candidate.status !== "active" && candidate.status !== "finished") || !validCalendar ||
    !Array.isArray(candidate.rounds) || !Array.isArray(candidate.standings)
  ) return null;
  try { return migrateAdvancedSeason(migrateSeasonMedia(migrateSeasonMarket(migrateSeasonDevelopment(candidate as SeasonState)))); }
  catch { return null; }
}

export function saveSeason(season: SeasonState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SEASON_KEY, JSON.stringify(season));
}

export function clearSeason(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SEASON_KEY);
}
