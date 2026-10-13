import { TEAM_FACILITIES, teamUpgradeCost } from "./career";
import type {
  CarStats,
  GameState,
  ResearchPhilosophyId,
  ResearchProjectMode,
  SeasonAtrPeriod,
  SeasonState,
  SeasonTeamState,
  StatKey,
  TeamFacilityId,
  TeamProfile,
} from "./types";

export const SEASON_BUDGET_CAP = 20;

export const RESEARCH_PHILOSOPHIES: Record<ResearchPhilosophyId, { name: string; description: string }> = {
  straight_efficiency: { name: "直道效率", description: "ENG 项目 -1 RP；AERO 项目 +1 RP。" },
  high_downforce: { name: "高下压力", description: "AERO 项目 -1 RP；ENG 项目 +1 RP。" },
  mechanical_grip: { name: "机械抓地", description: "MECH 项目 -1 RP；BRK 项目 +1 RP。" },
  braking_control: { name: "制动控制", description: "BRK 项目 -1 RP；MECH 项目 +1 RP。" },
  reliability: { name: "可靠性", description: "REL 项目 -1 RP；赛季第一次非 REL 项目 +1 RP。" },
};

const DEFAULT_STATS: CarStats = { eng: 3, aero: 2, mech: 2, brk: 2, rel: 2 };
const FACILITY_FOR_STAT: Record<StatKey, TeamFacilityId> = {
  eng: "engine_mapping",
  aero: "wind_tunnel",
  mech: "mechanical_department",
  brk: "brake_department",
  rel: "reliability_package",
};

const clone = <T>(value: T): T => structuredClone(value);

export function rollSeasonD12(state: SeasonState): number {
  let value = (state.rngState + 0x6d2b79f5) | 0;
  state.rngState = value >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return Math.floor((((value ^ (value >>> 14)) >>> 0) / 4294967296) * 12) + 1;
}

function inferredPhilosophy(stats: CarStats): ResearchPhilosophyId {
  const order: Array<[StatKey, ResearchPhilosophyId]> = [
    ["eng", "straight_efficiency"], ["aero", "high_downforce"], ["mech", "mechanical_grip"],
    ["brk", "braking_control"], ["rel", "reliability"],
  ];
  return order.slice().sort((a, b) => stats[b[0]] - stats[a[0]])[0][1];
}

export function atrCoefficient(rank: number, fieldSize: number): number {
  if (fieldSize <= 1) return 100;
  const raw = 70 + (45 * (Math.max(1, rank) - 1)) / (fieldSize - 1);
  return Math.max(70, Math.min(115, Math.round(raw / 5) * 5));
}

export function atrProjectSlots(coefficient: number): number {
  return Math.max(2, Math.round((4 * coefficient) / 100));
}

function activeFacilityIds(facilities: Partial<Record<TeamFacilityId, number>>): TeamFacilityId[] {
  return (Object.keys(facilities) as TeamFacilityId[]).filter((id) => (facilities[id] ?? 0) > 0).sort();
}

export function createSeasonTeamState(team?: TeamProfile): SeasonTeamState {
  const stats = clone(team?.stats ?? DEFAULT_STATS);
  const facilities = clone(team?.development.facilities ?? {});
  const activeFacilities = activeFacilityIds(facilities);
  const maintained = activeFacilities.slice(0, SEASON_BUDGET_CAP);
  const pausedFacilities = activeFacilities.slice(maintained.length);
  const legacyProjects = (team?.development.upgrades ?? []).map((upgrade, index) => ({
    id: `legacy-${index + 1}-${upgrade.stat}`,
    stat: upgrade.stat,
    mode: "standard" as const,
    status: "completed" as const,
    startedAfterRound: 0,
    deliveryAfterRound: 0,
    rpCost: 0,
    buCost: 0,
    result: "legacy" as const,
  }));
  return {
    teamId: team?.id ?? "legacy-local-team",
    name: team?.name ?? "本地车队",
    abbreviation: team?.abbreviation ?? "LOC",
    stats,
    facilities,
    pausedFacilities,
    developmentPoints: team?.development.developmentPoints ?? 0,
    totalDevelopmentPoints: team?.development.totalDevelopmentPoints ?? 0,
    budgetCap: SEASON_BUDGET_CAP,
    budgetRemaining: SEASON_BUDGET_CAP - maintained.length,
    philosophy: team?.researchPhilosophy ?? inferredPhilosophy(stats),
    emergencySpares: false,
    repairSpend: 0,
    projects: legacyProjects,
    atrPeriods: [{ period: 1, startRound: 1, rank: 1, fieldSize: 1, coefficient: 100, slots: 4, projectsStarted: 0 }],
    pendingCorrelationStats: [],
    pendingFreeFacilityUses: [],
    teammateRelationship: 0,
  };
}

export function migrateSeasonDevelopment(input: SeasonState, team?: TeamProfile): SeasonState {
  const state = clone(input);
  state.rngState ??= state.seed >>> 0;
  state.constructors ??= [];
  if (!state.playerTeam || (team && state.playerTeam.teamId === "legacy-local-team" && team.id !== state.playerTeam.teamId)) state.playerTeam = createSeasonTeamState(team);
  else {
    state.playerTeam.pendingCorrelationStats ??= [];
    state.playerTeam.pendingFreeFacilityUses ??= [];
    state.playerTeam.projects ??= [];
    state.playerTeam.atrPeriods ??= [];
    state.playerTeam.pausedFacilities ??= [];
    state.playerTeam.teammateRelationship ??= 0;
  }
  return state;
}

function proxyRank(state: SeasonState): { rank: number; fieldSize: number } {
  if (state.constructors.length > 1) {
    const ordered = state.constructors.slice().sort((a, b) => b.championshipPoints - a.championshipPoints || a.name.localeCompare(b.name, "zh-CN"));
    const index = ordered.findIndex((item) => item.teamId === state.playerTeam.teamId);
    return { rank: index < 0 ? ordered.length : index + 1, fieldSize: ordered.length };
  }
  if (state.standings.length > 1) {
    const ordered = state.standings.slice().sort((a, b) => b.championshipPoints - a.championshipPoints || a.name.localeCompare(b.name, "zh-CN"));
    const index = ordered.findIndex((item) => item.driverId === state.humanDriverId);
    return { rank: index < 0 ? ordered.length : index + 1, fieldSize: ordered.length };
  }
  return { rank: 1, fieldSize: 1 };
}

export function ensureCurrentAtrPeriod(input: SeasonState): SeasonState {
  const state = clone(input);
  const effectiveRound = state.awaitingInterRoundActions ? Math.min(state.calendar.length, state.currentRound + 1) : state.currentRound;
  const period = Math.floor((effectiveRound - 1) / 2) + 1;
  if (state.playerTeam.atrPeriods.some((item) => item.period === period)) return state;
  const { rank, fieldSize } = proxyRank(state);
  const coefficient = atrCoefficient(rank, fieldSize);
  state.playerTeam.atrPeriods.push({ period, startRound: (period - 1) * 2 + 1, rank, fieldSize, coefficient, slots: atrProjectSlots(coefficient), projectsStarted: 0 });
  return state;
}

export function currentAtrPeriod(input: SeasonState): SeasonAtrPeriod {
  const state = ensureCurrentAtrPeriod(input);
  const effectiveRound = state.awaitingInterRoundActions ? Math.min(state.calendar.length, state.currentRound + 1) : state.currentRound;
  const period = Math.floor((effectiveRound - 1) / 2) + 1;
  return state.playerTeam.atrPeriods.find((item) => item.period === period)!;
}

export function projectPrice(team: SeasonTeamState, stat: StatKey): { rp: number; bu: number } {
  const current = team.stats[stat];
  let rp = teamUpgradeCost(current);
  const philosophy = team.philosophy;
  if ((philosophy === "straight_efficiency" && stat === "eng") || (philosophy === "high_downforce" && stat === "aero") || (philosophy === "mechanical_grip" && stat === "mech") || (philosophy === "braking_control" && stat === "brk") || (philosophy === "reliability" && stat === "rel")) rp -= 1;
  if ((philosophy === "straight_efficiency" && stat === "aero") || (philosophy === "high_downforce" && stat === "eng") || (philosophy === "mechanical_grip" && stat === "brk") || (philosophy === "braking_control" && stat === "mech")) rp += 1;
  if (philosophy === "reliability" && stat !== "rel" && !team.projects.some((project) => project.startedAfterRound > 0 && project.stat !== "rel")) rp += 1;
  const bu = ({ 1: 1, 2: 2, 3: 3, 4: 4 } as Record<number, number>)[current] ?? Number.POSITIVE_INFINITY;
  return { rp: Math.max(1, rp), bu };
}

function applyProjectUpgrade(team: SeasonTeamState, stat: StatKey): void {
  if (team.stats[stat] >= 5 || Object.values(team.stats).reduce((sum, value) => sum + value, 0) >= 15) return;
  team.stats[stat] += 1;
}

export function startResearchProject(input: SeasonState, stat: StatKey, mode: ResearchProjectMode): { ok: true; state: SeasonState } | { ok: false; state: SeasonState; error: string } {
  const state = ensureCurrentAtrPeriod(input);
  if (state.status !== "active" || !state.awaitingInterRoundActions) return { ok: false, state: input, error: "研发项目只能在站间窗口启动。" };
  if (state.currentRound >= state.calendar.length) return { ok: false, state: input, error: "赛季已无后续比赛，无法启动项目。" };
  const roundsToDelivery = mode === "rush" ? 1 : 2;
  if (state.currentRound + roundsToDelivery > state.calendar.length) return { ok: false, state: input, error: "赛季剩余站数不足以完成该项目。" };
  const team = state.playerTeam;
  const period = currentAtrPeriod(state);
  const storedPeriod = team.atrPeriods.find((item) => item.period === period.period)!;
  if (storedPeriod.projectsStarted >= storedPeriod.slots) return { ok: false, state: input, error: `本 ATR 周期的 ${storedPeriod.slots} 个项目槽已经用完。` };
  if (team.projects.some((project) => (project.status === "active" || project.status === "delayed") && project.stat === stat)) return { ok: false, state: input, error: "同一属性已有未交付项目。" };
  const projectedTotal = Object.values(team.stats).reduce((sum, value) => sum + value, 0) + team.projects.filter((project) => project.status === "active" || project.status === "delayed").length;
  if (team.stats[stat] >= 5) return { ok: false, state: input, error: "该属性已经达到上限 5。" };
  if (projectedTotal >= 15) return { ok: false, state: input, error: "现有项目交付后将达到性能指数上限 15。" };
  const price = projectPrice(team, stat);
  if (team.developmentPoints < price.rp) return { ok: false, state: input, error: `需要 ${price.rp} RP。` };
  if (team.budgetRemaining < price.bu) return { ok: false, state: input, error: `需要 ${price.bu} BU；成本帽禁止超支。` };
  team.developmentPoints -= price.rp;
  team.budgetRemaining -= price.bu;
  storedPeriod.projectsStarted += 1;
  const project = {
    id: `project-${state.currentRound}-${team.projects.length + 1}-${stat}`,
    stat,
    mode,
    status: "active" as const,
    startedAfterRound: state.currentRound,
    deliveryAfterRound: state.currentRound + roundsToDelivery,
    rpCost: price.rp,
    buCost: price.bu,
  };
  if (mode === "rush") {
    const roll = rollSeasonD12(state);
    const total = roll + team.stats.rel;
    Object.assign(project, { roll, total });
    if (total >= 10) {
      applyProjectUpgrade(team, stat);
      Object.assign(project, { status: "completed" as const, result: "on_time" as const, deliveryAfterRound: state.currentRound });
    } else if (total >= 6) Object.assign(project, { status: "delayed" as const, result: "delayed" as const });
    else Object.assign(project, { status: "failed" as const, result: "failed" as const, deliveryAfterRound: state.currentRound });
  }
  team.projects.push(project);
  return { ok: true, state };
}

export function purchaseSeasonFacility(input: SeasonState, facilityId: TeamFacilityId): { ok: true; state: SeasonState } | { ok: false; state: SeasonState; error: string } {
  const state = clone(input);
  if (state.status !== "active" || !state.awaitingInterRoundActions) return { ok: false, state: input, error: "设施只能在站间窗口升级。" };
  const definition = TEAM_FACILITIES.find((item) => item.id === facilityId);
  if (!definition) return { ok: false, state: input, error: "未知技术设施。" };
  const level = state.playerTeam.facilities[facilityId] ?? 0;
  if (level >= definition.costs.length) return { ok: false, state: input, error: "该设施已经达到最高等级。" };
  const rp = definition.costs[level];
  const bu = Math.ceil(rp / 3);
  if (state.playerTeam.developmentPoints < rp) return { ok: false, state: input, error: `需要 ${rp} RP。` };
  if (state.playerTeam.budgetRemaining < bu) return { ok: false, state: input, error: `需要 ${bu} BU；成本帽禁止超支。` };
  state.playerTeam.developmentPoints -= rp;
  state.playerTeam.budgetRemaining -= bu;
  state.playerTeam.facilities[facilityId] = level + 1;
  state.playerTeam.pausedFacilities = state.playerTeam.pausedFacilities.filter((id) => id !== facilityId);
  return { ok: true, state };
}

export function resolveResearchAfterRound(input: SeasonState, completedRound: number): SeasonState {
  const state = clone(input);
  for (const project of state.playerTeam.projects) {
    if ((project.status !== "active" && project.status !== "delayed") || project.deliveryAfterRound > completedRound) continue;
    if (project.mode === "aggressive") {
      const roll = rollSeasonD12(state);
      const total = roll + state.playerTeam.stats.rel;
      project.roll = roll;
      project.total = total;
      applyProjectUpgrade(state.playerTeam, project.stat);
      if (total >= 10) {
        project.result = "free_facility";
        state.playerTeam.pendingFreeFacilityUses.push(FACILITY_FOR_STAT[project.stat]);
      } else if (total >= 6) project.result = "clean";
      else {
        project.result = "correlation_risk";
        state.playerTeam.pendingCorrelationStats.push(project.stat);
      }
    } else {
      applyProjectUpgrade(state.playerTeam, project.stat);
      project.result = project.result === "delayed" ? "delayed" : "clean";
    }
    project.status = "completed";
  }
  return state;
}

function raceRp(rank: number, status: string): number {
  if (status === "dnf") return 1;
  if (rank === 1) return 6;
  if (rank === 2) return 5;
  if (rank === 3) return 4;
  return 3;
}

export function applySeasonTeamRaceEconomy(input: SeasonState, game: GameState): SeasonState {
  let state = clone(input);
  const teamDrivers = game.drivers.filter((driver) => driver.profile.teamId === state.playerTeam.teamId);
  let repairCost = 0;
  let rp = 0;
  for (const driver of teamDrivers) {
    const result = game.results.find((item) => item.driverId === driver.id);
    if (!result) continue;
    rp += raceRp(result.rank, result.status);
    if (result.status === "dnf") repairCost += 2;
    else if ((driver.raceStats?.heavyDamageEvents ?? 0) > 0) repairCost += 1;
  }
  state.playerTeam.developmentPoints += rp;
  state.playerTeam.totalDevelopmentPoints += rp;
  state.playerTeam.repairSpend += Math.min(repairCost, state.playerTeam.budgetRemaining);
  if (repairCost > state.playerTeam.budgetRemaining) state.playerTeam.emergencySpares = true;
  state.playerTeam.budgetRemaining = Math.max(0, state.playerTeam.budgetRemaining - repairCost);
  const human = teamDrivers.find((driver) => driver.isHuman);
  if (human?.correlationPenaltyStat && !human.correlationPenaltyConsumed && !state.playerTeam.pendingCorrelationStats.includes(human.correlationPenaltyStat)) {
    state.playerTeam.pendingCorrelationStats.unshift(human.correlationPenaltyStat);
  }
  if (human) {
    for (const facility of human.profile.raceEntryEffects?.freeFacilityUses ?? []) {
      const normalAllowance = human.profile.team?.facilities?.[facility] ?? 0;
      const used = human.careerUses?.teamFacilityUses?.[facility] ?? 0;
      if (used <= normalAllowance && !state.playerTeam.pendingFreeFacilityUses.includes(facility)) state.playerTeam.pendingFreeFacilityUses.push(facility);
    }
  }
  state = resolveResearchAfterRound(state, game.seasonRound ?? state.currentRound);
  return state;
}

export function consumeSeasonRaceEntryEffects(input: SeasonState, consumeCorrelation = true): { state: SeasonState; effects: NonNullable<import("./types").DriverProfile["raceEntryEffects"]> } {
  const state = clone(input);
  const effects: NonNullable<import("./types").DriverProfile["raceEntryEffects"]> = {
    emergencySpares: state.playerTeam.emergencySpares,
    correlationPenaltyStat: consumeCorrelation ? state.playerTeam.pendingCorrelationStats.shift() : undefined,
    freeFacilityUses: state.playerTeam.pendingFreeFacilityUses.splice(0),
  };
  return { state, effects };
}

export function syncTeamFromSeason(team: TeamProfile, season: SeasonState): TeamProfile {
  if (team.id !== season.playerTeam.teamId) return team;
  return {
    ...team,
    stats: clone(season.playerTeam.stats),
    researchPhilosophy: season.playerTeam.philosophy,
    development: {
      ...team.development,
      developmentPoints: season.playerTeam.developmentPoints,
      totalDevelopmentPoints: season.playerTeam.totalDevelopmentPoints,
      facilities: clone(season.playerTeam.facilities),
    },
  };
}
