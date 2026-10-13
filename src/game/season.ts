import { createSeasonCalendar } from "./seasonCalendar";
import { applySeasonTeamRaceEconomy, createSeasonTeamState, ensureCurrentAtrPeriod } from "./seasonDevelopment";
import { contractMarketFromTeams, createCurrentContract, finalizeSeasonMarket, resolveSeasonPublicAction, updateSponsorFromRace } from "./seasonMarket";
import { createAdvancedSeasonState, resolveAdvancedAfterRace, resolveAdvancedSeasonEnd } from "./advancedSeason";
import { DEFAULT_MEDIA_SETTINGS, generateMediaRound } from "../media";
import type { ConstructorStanding, DriverContract, GameState, SeasonPerformanceAction, SeasonPublicAction, SeasonStanding, SeasonState, TalentId, TeamProfile } from "./types";

export function createSeasonState(humanDriverId: string, aiCount: number, seed = Date.now(), team?: TeamProfile, teammateDriverId?: string, marketTeams: TeamProfile[] = [], driverTalent?: TalentId, existingContract?: DriverContract, seasonNumber = 1, roster: Array<{ id: string; teamId?: string; contract?: DriverContract }> = []): SeasonState {
  if (!humanDriverId) throw new Error("赛季需要有效车手");
  if (!Number.isInteger(aiCount) || aiCount < 1 || aiCount > 5) throw new Error("赛季 AI 数量必须为 1–5");
  return {
    schemaVersion: 1,
    id: `season-${Math.abs(seed)}-${humanDriverId}`,
    seed: seed >>> 0,
    rngState: seed >>> 0,
    status: "active",
    humanDriverId,
    aiCount,
    currentRound: 1,
    calendar: createSeasonCalendar(seed),
    standings: [],
    constructors: [],
    playerTeam: createSeasonTeamState(team),
    teammateDriverId,
    seasonNumber,
    reputation: 5,
    currentContract: existingContract ?? createCurrentContract(team?.id ?? "legacy-local-team", team?.name ?? "本地车队", seasonNumber),
    contractMarket: contractMarketFromTeams(marketTeams, team, roster, humanDriverId),
    contractOffers: [],
    publicActionResults: [],
    driverTalent,
    mediaSettings: { ...DEFAULT_MEDIA_SETTINGS },
    mediaArchive: [],
    advanced: createAdvancedSeasonState(),
    rounds: [],
    awaitingInterRoundActions: false,
    actionHistory: [],
  };
}

function constructorFor(state: SeasonState, game: GameState, teamId: string, driverIds: string[]): ConstructorStanding {
  const existing = state.constructors.find((standing) => standing.teamId === teamId);
  if (existing) {
    existing.driverIds = [...new Set([...existing.driverIds, ...driverIds])];
    return existing;
  }
  const profile = game.drivers.find((driver) => driver.profile.teamId === teamId)?.profile;
  const created: ConstructorStanding = {
    teamId,
    name: profile?.team?.name ?? (teamId === state.playerTeam.teamId ? state.playerTeam.name : teamId),
    abbreviation: teamId === state.playerTeam.teamId ? state.playerTeam.abbreviation : profile?.abbreviation.slice(0, 3) ?? "TMR",
    driverIds: [...new Set(driverIds)],
    championshipPoints: 0,
    racePoints: 0,
    sprintPoints: 0,
    raceFinishes: [],
  };
  state.constructors.push(created);
  return created;
}

function standingFor(state: SeasonState, game: GameState, driverId: string): SeasonStanding {
  const existing = state.standings.find((standing) => standing.driverId === driverId);
  if (existing) return existing;
  const driver = game.drivers.find((item) => item.id === driverId);
  if (!driver) throw new Error(`赛季结果包含未知车手 ${driverId}`);
  const created: SeasonStanding = {
    driverId,
    name: driver.profile.name,
    abbreviation: driver.profile.abbreviation,
    championshipPoints: 0,
    sprintPoints: 0,
    racePoints: 0,
    raceFinishes: [],
  };
  state.standings.push(created);
  return created;
}

export function recordSeasonRound(input: SeasonState, game: GameState, narrative?: import('../narrative/types').RaceNarrative): SeasonState {
  if (input.rounds.some((round) => round.raceId === game.id)) return structuredClone(input);
  if (input.status !== "active") throw new Error("赛季已经结束");
  if (game.phase !== "finished" || game.sessionMode !== "official") throw new Error("只能记录已完成的正式正赛");
  if (game.seasonId !== input.id || game.seasonRound !== input.currentRound) throw new Error("比赛与当前赛季站次不匹配");
  let state = structuredClone(input);
  const raceResults = game.results.map((result) => ({ ...result }));
  for (const result of raceResults) {
    const standing = standingFor(state, game, result.driverId);
    standing.racePoints += result.points;
    standing.championshipPoints += result.points;
    // DNF order is retained in the round record, but is not a completed finish
    // for countback. The sentinel also makes a DNF worse in the recent-result tie-break.
    standing.raceFinishes.push(result.status === "dnf" ? Number.MAX_SAFE_INTEGER : result.rank);
  }
  const sprintResults = game.weekend?.sprintResults ?? [];
  for (const result of sprintResults) {
    const standing = standingFor(state, game, result.driverId);
    standing.sprintPoints += result.points;
    standing.championshipPoints += result.points;
  }
  const driversByTeam = new Map<string, string[]>();
  for (const driver of game.drivers) {
    if (!driver.profile.teamId) continue;
    const roster = driversByTeam.get(driver.profile.teamId) ?? [];
    roster.push(driver.id);
    driversByTeam.set(driver.profile.teamId, roster);
  }
  for (const [teamId, driverIds] of driversByTeam) {
    if (driverIds.length < 2) continue;
    const constructor = constructorFor(state, game, teamId, driverIds);
    const teamRaceResults = raceResults.filter((result) => driverIds.includes(result.driverId));
    const teamSprintResults = sprintResults.filter((result) => driverIds.includes(result.driverId));
    const racePoints = teamRaceResults.reduce((sum, result) => sum + result.points, 0);
    const sprintPoints = teamSprintResults.reduce((sum, result) => sum + result.points, 0);
    constructor.racePoints += racePoints;
    constructor.sprintPoints += sprintPoints;
    constructor.championshipPoints += racePoints + sprintPoints;
    const bestFinish = teamRaceResults.filter((result) => result.status !== "dnf").sort((a, b) => a.rank - b.rank)[0]?.rank;
    constructor.raceFinishes.push(bestFinish ?? Number.MAX_SAFE_INTEGER);
  }
  state.rounds.push({
    round: state.currentRound,
    raceId: game.id,
    trackId: game.track.id,
    raceResults,
    sprintResults: structuredClone(sprintResults),
  });
  state = updateSponsorFromRace(state, game);
  const economicallyResolved = applySeasonTeamRaceEconomy(state, game);
  state.playerTeam = economicallyResolved.playerTeam;
  state.rngState = economicallyResolved.rngState;
  state.playerTeam.teammateRelationship = Math.max(-2, Math.min(2, state.playerTeam.teammateRelationship + (game.teammateRelationshipDelta ?? 0)));
  state = resolveAdvancedAfterRace(state);
  if (state.currentRound >= state.calendar.length) {
    state.status = "finished";
    state.awaitingInterRoundActions = false;
    state = finalizeSeasonMarket(state);
    state = resolveAdvancedSeasonEnd(state);
  } else {
    state.awaitingInterRoundActions = true;
  }
  // Create media only after every race/season settlement so the final bundle
  // can cite contract offers, audit results and the completed standings.
  if (!state.mediaArchive.some((bundle) => bundle.raceId === game.id)) state.mediaArchive.push(generateMediaRound(game, state, narrative));
  return state;
}

export function submitSeasonActions(input: SeasonState, performance: SeasonPerformanceAction, publicAction: SeasonPublicAction): SeasonState {
  if (input.status !== "active" || !input.awaitingInterRoundActions) throw new Error("当前没有待提交的站间行动槽");
  let state = structuredClone(input);
  state.actionHistory.push({ afterRound: state.currentRound, performance, public: publicAction });
  state = resolveSeasonPublicAction(state, publicAction);
  state.currentRound += 1;
  state.awaitingInterRoundActions = false;
  return ensureCurrentAtrPeriod(state);
}

export function compareSeasonStandings(left: SeasonStanding, right: SeasonStanding): number {
  if (right.championshipPoints !== left.championshipPoints) return right.championshipPoints - left.championshipPoints;
  for (let rank = 1; rank <= 10; rank += 1) {
    const leftCount = left.raceFinishes.filter((finish) => finish === rank).length;
    const rightCount = right.raceFinishes.filter((finish) => finish === rank).length;
    if (rightCount !== leftCount) return rightCount - leftCount;
  }
  for (let index = Math.max(left.raceFinishes.length, right.raceFinishes.length) - 1; index >= 0; index -= 1) {
    const leftRank = left.raceFinishes[index] ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.raceFinishes[index] ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
  }
  return 0;
}

export function sortedSeasonStandings(state: SeasonState): SeasonStanding[] {
  return state.standings.slice().sort(compareSeasonStandings);
}

export function sortedConstructorStandings(state: SeasonState): ConstructorStanding[] {
  return state.constructors.slice().sort((left, right) => {
    if (right.championshipPoints !== left.championshipPoints) return right.championshipPoints - left.championshipPoints;
    for (let rank = 1; rank <= 10; rank += 1) {
      const leftCount = left.raceFinishes.filter((finish) => finish === rank).length;
      const rightCount = right.raceFinishes.filter((finish) => finish === rank).length;
      if (rightCount !== leftCount) return rightCount - leftCount;
    }
    return left.name.localeCompare(right.name, "zh-CN");
  });
}
