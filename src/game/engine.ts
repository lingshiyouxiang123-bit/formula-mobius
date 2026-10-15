import { MODE_BONUS, POINTS } from "./config";
import { allocateObjectiveAwards, drawRaceObjectives, objectiveCompleted, RACE_OBJECTIVES } from "./objectives";
import { DEMO_TRACK, TRACKS } from "./tracks";
import { isDrsCell, validateTrack } from "./trackGenerator";
import { defaultEventCode, dynamicWeatherForRoll, initialWeatherForRoll, RACE_EVENT_RULES, RACE_RULES } from "./raceRules";
import { BALANCED_WEEKEND_SETUP } from "./setupOptions";
import { addTimePenalty, migrateRacePenalties, racePenaltyTotals } from "./penalties";
import { availableTalentActions, hasMinorTalent, hasTalentNode, normalizeProfileDevelopment, TALENT_ACTIONS, talentUpgradeRank, tokenSwapAllowance } from "./career";
import type {
  BurdenId,
  CarStats,
  CreateGameOptions,
  DefenseChoice,
  DispatchResult,
  DriverProfile,
  DriverRaceStats,
  DriverState,
  EngineMode,
  GameCommand,
  GameEvent,
  GameEventDetails,
  GameState,
  Lane,
  PendingAttackContext,
  PendingDefenseContext,
  PublicDriverInfo,
  QualifyingEntry,
  RaceEventCode,
  RaceResult,
  StatKey,
  TacticalResourceId,
  TalentActionId,
  TeamOrderReason,
  TeamFacilityId,
  TireCompound,
  Track,
  TrackSegment,
  TurnPlan,
  Weather,
  WeekendSetup,
} from "./types";

const COLORS = ["#ef4444", "#38bdf8", "#facc15", "#a78bfa", "#34d399", "#fb7185"];
const AI_NAMES = ["阿尔法", "贝塔", "伽马", "德尔塔", "艾普西隆"];
const STATS: StatKey[] = ["eng", "aero", "mech", "brk", "rel"];

export interface MpBreakdown {
  base: number;
  mode: number;
  engine: number;
  teamEngine: number;
  launch: number;
  specialization: number;
  preparation: number;
  ers: number;
  ersStraight: number;
  slipstream: number;
  drs: number;
  softTire: number;
  wear: number;
  heavyDamage: number;
  powerLoss: number;
  slowPit: number;
  pitExit: number;
  yellowFlag: number;
  setup: number;
  total: number;
}

export function validateProfile(profile: DriverProfile): string[] {
  const errors: string[] = [];
  if (!profile.name.trim()) errors.push("车手名称不能为空");
  if (!/^[A-Za-z0-9\u4e00-\u9fff]{2,4}$/.test(profile.abbreviation)) {
    errors.push("简称需要 2–4 个中文、字母或数字");
  }
  const values = STATS.map((key) => profile.stats[key]);
  const developed = Boolean(profile.team);
  if (values.some((value) => !Number.isInteger(value) || value < 1 || value > (developed ? 5 : 4))) {
    errors.push(`车辆属性必须是 1–${developed ? 5 : 4} 的整数`);
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  if (developed ? total < 11 || total > 15 : total !== 11) {
    errors.push(developed ? "研发后的赛车性能指数必须为 11–15" : "五项属性总和必须为 11（基础 5 点加自由分配 6 点）");
  }
  if (profile.minorTalents && (profile.minorTalents.length > 2 || new Set(profile.minorTalents).size !== profile.minorTalents.length)) {
    errors.push("副天赋最多选择两个且不可重复");
  }
  return errors;
}

export function requiredBurdenCount(stats: CarStats): number {
  if (STATS.some((key) => stats[key] === 0)) return 0;
  const originalRequirement = STATS.filter((key) => stats[key] >= 4).length >= 2 ? 2 : 1;
  const development = Math.max(0, STATS.reduce((sum, key) => sum + stats[key], 0) - 11);
  return Math.min(3, Math.max(originalRequirement, 1 + Math.ceil(development / 2)));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nextRandom(state: GameState): number {
  let value = (state.rngState += 0x6d2b79f5);
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function rollD12(state: GameState): number {
  return Math.floor(nextRandom(state) * 12) + 1;
}

function rollIncidentDie(state: GameState, driver: DriverState, check: string): { roll: number; criticalFailure: boolean } {
  const roll = rollD12(state);
  if (roll !== 1) return { roll, criticalFailure: false };
  const confirmation = rollD12(state);
  const criticalFailure = confirmation === 1;
  addLog(state, "roll", `${driver.profile.name} ${check}大失败复核：首次 D12(1)，复核 D12(${confirmation})，${criticalFailure ? "双 1 大失败" : "按首次 1 继续结算"}。`, {
    code: "dice.reliability", details: { input: { driverId: driver.id, check }, dice: [roll, confirmation], result: criticalFailure ? "critical_failure" : "first_roll_retained" },
  });
  return { roll, criticalFailure };
}

function addLog(
  state: GameState,
  type: GameEvent["type"],
  message: string,
  metadata?: { code?: RaceEventCode; details?: GameEventDetails },
): void {
  const code = metadata?.code ?? defaultEventCode(type);
  state.logs.push({
    id: state.nextLogId++,
    round: state.round,
    type,
    code,
    ruleRef: RACE_EVENT_RULES[code].ruleRef,
    details: metadata?.details,
    message,
  });
  if (state.logs.length > 350) state.logs.splice(0, state.logs.length - 350);
}

export function getCellIndex(state: GameState, driver: DriverState): number {
  if (driver.progress < 0) return driver.progress;
  return driver.progress % state.track.totalLength;
}

export function getSegmentAtCell(
  state: Pick<GameState, "track">,
  cell: number,
): { segment: TrackSegment; offset: number; start: number } | null {
  if (cell < 0) return null;
  const normalized = cell % state.track.totalLength;
  let cursor = 0;
  for (const segment of state.track.segments) {
    if (normalized < cursor + segment.length) {
      return { segment, offset: normalized - cursor, start: cursor };
    }
    cursor += segment.length;
  }
  return null;
}

function isRain(weather?: Weather): boolean {
  return weather === "heavy_rain" || weather === "light_rain";
}

function weekendSetupFor(state: GameState, driver: DriverState): WeekendSetup {
  if (state.weekendMode === "full" && driver.isHuman) return state.weekend?.setup ?? BALANCED_WEEKEND_SETUP;
  return BALANCED_WEEKEND_SETUP;
}

function isNeutralized(state: GameState): boolean {
  return state.raceControl === "vsc" || state.raceControl === "sc";
}

function facilityLevel(driver: DriverState, facility: TeamFacilityId): number {
  return driver.profile.team?.facilities?.[facility] ?? 0;
}

function facilityUseCount(driver: DriverState, facility: TeamFacilityId): number {
  return driver.careerUses?.teamFacilityUses?.[facility] ?? 0;
}

function consumeFacilityUse(driver: DriverState, facility: TeamFacilityId, allowance: number): boolean {
  const freeUse = driver.profile.raceEntryEffects?.freeFacilityUses?.includes(facility) ? 1 : 0;
  const effectiveAllowance = allowance + freeUse;
  if (facilityLevel(driver, facility) <= 0 && freeUse === 0) return false;
  if (facilityUseCount(driver, facility) >= effectiveAllowance) return false;
  const uses = careerUses(driver);
  uses.teamFacilityUses ??= {};
  uses.teamFacilityUses[facility] = (uses.teamFacilityUses[facility] ?? 0) + 1;
  return true;
}

export function ersCapacity(driver: DriverState): number {
  return facilityLevel(driver, "battery_recovery") > 0 ? 9 : 8;
}

export function publicDriverInfo(driver: DriverState): PublicDriverInfo {
  const wear = driver.wear >= RACE_RULES.damage.wornThreshold ? "critical" : driver.wear >= 4 ? "medium" : "low";
  const heat = driver.heat >= RACE_RULES.damage.heatCap ? "critical" : driver.heat >= 3 ? "medium" : "low";
  const ers = driver.ers >= 6 ? "high" : driver.ers >= 3 ? "medium" : "low";
  return {
    tire: driver.tire,
    wear,
    heat,
    ers,
    damage: driver.heavyDamage ? "heavy" : driver.lightDamage > 0 ? "light" : "clear",
    penalty: racePenaltyTotals(driver).seconds > 0 ? "time" : "clear",
  };
}

function activeDrivers(state: GameState): DriverState[] {
  return state.drivers.filter((driver) => driver.status === "racing");
}

function driverById(state: GameState, id: string): DriverState {
  const driver = state.drivers.find((item) => item.id === id);
  if (!driver) throw new Error(`未知车手 ${id}`);
  return driver;
}

function nearestAhead(state: GameState, driver: DriverState): DriverState | undefined {
  return state.drivers
    .filter(
      (item) =>
        item.id !== driver.id &&
        item.status === "racing" &&
        !item.pit &&
        item.progress >= driver.progress,
    )
    .sort((a, b) => a.progress - b.progress || a.qualifyingRank - b.qualifyingRank)[0];
}

function drafting(state: GameState, driver: DriverState): { slipstream: number; drs: number } {
  if (isRain(state.weather) || isNeutralized(state) || driver.progress < 0) return { slipstream: 0, drs: 0 };
  const ahead = nearestAhead(state, driver);
  if (!ahead) return { slipstream: 0, drs: 0 };
  const distance = ahead.progress - driver.progress;
  const location = getSegmentAtCell(state, getCellIndex(state, driver));
  if (
    state.yellowFlagSegmentId === location?.segment.id ||
    distance < 1 ||
    distance > 2 ||
    ahead.lane !== driver.lane ||
    location?.segment.type !== "straight"
  ) {
    return { slipstream: 0, drs: 0 };
  }
  return { slipstream: 1, drs: isRain(state.weather) ? 0 : isDrsCell(state.track, getCellIndex(state, driver)) ? 1 : 0 };
}

export function calculateMpBreakdown(
  state: GameState,
  driver: DriverState,
  plan: TurnPlan,
): MpBreakdown {
  const location = getSegmentAtCell(state, getCellIndex(state, driver));
  const draft = drafting(state, driver);
  const deployed = plan.deployErs && driver.ers > 0 && driver.powerPenaltyRounds === 0;
  const setup = weekendSetupFor(state, driver);
  const uses = driver.careerUses;
  const firstStraightSetup = setup.aero === "low" && location?.segment.type === "straight" && uses?.firstStraightSetupRound !== state.round ? 1 : 0;
  const coolingSetup = setup.cooling === "open" ? -1 : setup.cooling === "closed" && plan.mode !== "save" ? 1 : 0;
  const underYellow = state.yellowFlagSegmentId === location?.segment.id;
  const yellow = underYellow ? -2 : 0;
  const teamEngine = location?.segment.type === "straight" && facilityLevel(driver, "engine_mapping") > 0 && facilityUseCount(driver, "engine_mapping") < 1 ? 1 : 0;
  const exitingService = (driver.pit?.remainingRounds === 0 && driver.pit.service) || driver.pitExitRound === state.round;
  const slowPit = exitingService && driver.burdens.includes("slow_pit") ? -RACE_RULES.pit.slowOutLapMpPenalty : 0;
  const pitExit = exitingService ? 3 * (Number(hasMinorTalent(driver.profile, "pit_perfection")) + Number(facilityLevel(driver, "pit_training") > 0)) : 0;
  if (isNeutralized(state)) {
    const heavyDamage = driver.heavyDamage ? driver.profile.career?.specialization === "endurance" ? -1 : -2 : 0;
    return {
      base: 5, mode: 0, engine: 0, teamEngine: 0, launch: 0, specialization: 0, preparation: 0,
      ers: 0, ersStraight: 0, slipstream: 0, drs: 0, softTire: 0, wear: 0,
      heavyDamage, powerLoss: 0, slowPit, pitExit, yellowFlag: 0, setup: 0, total: Math.max(0, 5 + heavyDamage + slowPit + pitExit),
    };
  }
  let slipstream = draft.slipstream;
  let drs = draft.drs ? (hasTalentNode(driver.profile, "TE-4") ? 2 : 1) + (hasMinorTalent(driver.profile, "drs_expert") ? 1 : 0) : 0;
  if (setup.aero === "high" && slipstream + drs > 0) {
    if (drs > 0) drs -= 1;
    else slipstream -= 1;
  }
  const result: MpBreakdown = {
    base: 6,
    mode: MODE_BONUS[plan.mode],
    engine: driver.profile.stats.eng >= 3 ? 1 : 0,
    teamEngine,
    launch: (state.round === 1 || state.restartLaunchRound === state.round) && hasMinorTalent(driver.profile, "launch_rocket") ? 2 : 0,
    specialization: (state.round === 1 || state.restartLaunchRound === state.round) && driver.profile.career?.specialization === "qualifying" ? 1 : 0,
    preparation: state.raceSession === "race" && state.round === 1 ? driver.profile.career?.pendingPreparation?.startMp ?? 0 : 0,
    ers: deployed ? 2 : 0,
    ersStraight: deployed && location?.segment.type === "straight" && !underYellow ? 1 : 0,
    slipstream,
    drs,
    softTire: driver.tire === "soft" ? 1 : 0,
    wear: driver.wear >= 9 ? -1 : 0,
    heavyDamage: driver.heavyDamage ? driver.profile.career?.specialization === "endurance" ? -1 : -2 : 0,
    powerLoss: driver.powerPenaltyRounds > 0 ? -1 : 0,
    slowPit,
    pitExit,
    yellowFlag: yellow,
    setup: firstStraightSetup + coolingSetup,
    total: 0,
  };
  result.total = Math.max(
    0,
    result.base +
      result.mode +
      result.engine +
      result.teamEngine +
      result.launch +
      result.specialization +
      result.preparation +
      result.ers +
      result.ersStraight +
      result.slipstream +
      result.drs +
      result.softTire +
      result.wear +
      result.heavyDamage +
      result.powerLoss +
      result.slowPit +
      result.pitExit +
      result.yellowFlag +
      result.setup,
  );
  return result;
}

function aiTeamDevelopment(name: string, stats: CarStats) {
  return { name, developmentPoints: 0, totalDevelopmentPoints: 0, baseStats: clone(stats), upgrades: [], facilities: {}, facilityUpgrades: [] };
}

function createAiProfile(index: number): DriverProfile {
  const templates: CarStats[] = [
    { eng: 4, aero: 3, mech: 2, brk: 1, rel: 1 },
    { eng: 2, aero: 4, mech: 2, brk: 2, rel: 1 },
    { eng: 2, aero: 2, mech: 3, brk: 2, rel: 2 },
    { eng: 3, aero: 2, mech: 1, brk: 2, rel: 3 },
    { eng: 1, aero: 2, mech: 3, brk: 3, rel: 2 },
  ];
  const talents: DriverProfile["talent"][] = [
    "overtake_maniac",
    "wide_train",
    "tire_whisperer",
    "late_braker",
    "strategist",
  ];
  const stats = templates[index % templates.length];
  const teamNumber = Math.floor(index / 2) + 1;
  const teamName = `对手车队 ${teamNumber}`;
  return {
    id: `ai-${index + 1}`,
    name: AI_NAMES[index % AI_NAMES.length],
    abbreviation: `AI${index + 1}`,
    color: COLORS[(index + 1) % COLORS.length],
    stats,
    talent: talents[index % talents.length],
    teamId: `ai-constructor-${teamNumber}`,
    team: aiTeamDevelopment(teamName, stats),
  };
}

function createTeammateProfile(human: DriverProfile, supplied?: DriverProfile): DriverProfile {
  if (supplied) {
    const teammate = normalizeProfileDevelopment(supplied);
    return { ...teammate, stats: clone(human.stats), teamId: human.teamId, team: clone(human.team) };
  }
  return {
    id: `${human.id}-teammate`,
    name: "车队二号车手",
    abbreviation: "TM2",
    color: human.color,
    stats: clone(human.stats),
    talent: "wide_train",
    teamId: human.teamId,
    team: clone(human.team),
    raceEntryEffects: { emergencySpares: human.raceEntryEffects?.emergencySpares },
  };
}

function baseDriver(profile: DriverProfile, isHuman: boolean, isTeammate = false): DriverState {
  const rank = talentUpgradeRank(profile.career?.level ?? 1);
  return {
    id: profile.id,
    profile,
    isHuman,
    status: "racing",
    progress: 0,
    lane: "left",
    qualifyingRank: 0,
    tire: "medium",
    wear: 0,
    heat: 0,
    brakeHeat: 0,
    ers: 2,
    tactical: { lateBrake: 2, defense: 1, cooling: 1, quickRepair: 0 },
    burdens: [],
    lightDamage: 0,
    heavyDamage: false,
    reliabilityPenalty: (profile.raceEntryEffects?.emergencySpares ? 1 : 0) + (profile.raceEntryEffects?.wornComponentPenalty ?? 0),
    breakdowns: 0,
    stoppedRounds: 0,
    powerPenaltyRounds: 0,
    penalties: { vp: 0, driveThrough: 0, time: [] },
    raceStats: emptyRaceStats(),
    careerUses: {
      lightDamageIgnored: false,
      lightDamageIgnoresUsed: 0,
      pitExecutionUsed: false,
      pitExecutionUses: 0,
      softTireProtection: false,
      talentActions: [],
      tokenSwaps: 0,
      safeLateBrakeTokens: profile.talent === "late_braker" && rank >= 1 ? 1 : 0,
      marginalUpgradeUsed: false,
      brakePointRecoveryUsed: false,
      defensesThisRound: 0,
      attacksThisRound: 0,
      defendedThisRound: false,
      lastSuccessfulDefenseLap: undefined,
      racecraftBonusAwarded: false,
      roundStartWear: 0,
      teamFacilityUses: {},
      preparationLateBrakeUsed: false,
    },
    bonusPoints: 0,
    lapTiming: { lastCompletionRound: 0, completedRounds: [], wetCompletedRounds: [] },
    isTeammate,
    correlationPenaltyStat: profile.raceEntryEffects?.correlationPenaltyStat,
    correlationPenaltyConsumed: false,
  };
}

function careerUses(driver: DriverState): NonNullable<DriverState["careerUses"]> {
  const rank = talentUpgradeRank(driver.profile.career?.level ?? 1);
  driver.careerUses = Object.assign(driver.careerUses ?? {}, {
    lightDamageIgnored: false,
    lightDamageIgnoresUsed: 0,
    pitExecutionUsed: false,
    pitExecutionUses: 0,
    softTireProtection: false,
    talentActions: [],
    tokenSwaps: 0,
    safeLateBrakeTokens: driver.profile.talent === "late_braker" && rank >= 1 ? 1 : 0,
    marginalUpgradeUsed: false,
    brakePointRecoveryUsed: false,
    defensesThisRound: 0,
    attacksThisRound: 0,
    defendedThisRound: false,
    lastSuccessfulDefenseLap: undefined,
    racecraftBonusAwarded: false,
    roundStartWear: driver.wear,
    teamFacilityUses: {},
    preparationLateBrakeUsed: false,
    ...driver.careerUses,
  });
  if (driver.careerUses.pitExecutionUsed && driver.careerUses.pitExecutionUses === 0) driver.careerUses.pitExecutionUses = 1;
  return driver.careerUses;
}

function emptyRaceStats(): DriverRaceStats {
  return {
    cellsMoved: 0,
    attacks: 0,
    overtakes: 0,
    timesOvertaken: 0,
    defensesWon: 0,
    contacts: 0,
    pitStops: 0,
    ersUsed: 0,
    idealLines: 0,
    lateBrakes: 0,
    lateBrakeSuccesses: 0,
    penaltiesReceived: 0,
    peakHeat: 0,
    peakWear: 0,
  };
}

function consumeDeclaredAction(state: GameState, driver: DriverState, action: TalentActionId): boolean {
  if (state.plans[driver.id]?.talentAction !== action) return false;
  const uses = driver.careerUses ?? careerUses(driver);
  uses.resolvedTalentActions ??= [];
  if (uses.resolvedTalentActions.includes(action)) return false;
  uses.resolvedTalentActions.push(action);
  addLog(state, "resource", `${driver.profile.name} 的${TALENT_ACTIONS[action].name}已用于本次判定，不再重复生效。`);
  return true;
}

function raceStats(driver: DriverState): DriverRaceStats {
  driver.raceStats ??= emptyRaceStats();
  return driver.raceStats;
}

function consumeCorrelationPenalty(state: GameState, driver: DriverState, stat: StatKey): number {
  if (driver.correlationPenaltyConsumed || driver.correlationPenaltyStat !== stat) return 0;
  driver.correlationPenaltyConsumed = true;
  addLog(state, "incident", `${driver.profile.name} 的激进 ${stat.toUpperCase()} 部件首次投入判定，相关性偏差 -2。`, {
    code: "development.project",
    details: { input: { driverId: driver.id, stat }, modifiers: { correlation: -2 }, result: "consumed" },
  });
  return -2;
}

function recordPeaks(driver: DriverState): void {
  const stats = raceStats(driver);
  stats.peakHeat = Math.max(stats.peakHeat, driver.heat);
  stats.peakWear = Math.max(stats.peakWear, driver.wear);
}

export function createGame(
  humanProfile: DriverProfile,
  aiCount = 3,
  seed = Date.now(),
  trackInput: string | Track = DEMO_TRACK.id,
  sessionMode: "official" | "simulation" = "official",
  options: CreateGameOptions = {},
): GameState {
  humanProfile = normalizeProfileDevelopment(humanProfile);
  const errors = validateProfile(humanProfile);
  if (errors.length) throw new Error(errors.join("；"));
  if (!Number.isInteger(aiCount) || aiCount < 1 || aiCount > 5) {
    throw new Error("AI 数量必须为 1–5");
  }
  const selectedTrack = typeof trackInput === "string" ? TRACKS.find((track) => track.id === trackInput) : trackInput;
  if (!selectedTrack) throw new Error("请选择有效赛道");
  const trackErrors = validateTrack(selectedTrack as Track);
  if (trackErrors.length) throw new Error(`赛道配置无效：${trackErrors.join("；")}`);
  const teammateEnabled = Boolean(options.enableTeammate && aiCount >= 1 && humanProfile.teamId);
  const teammate = teammateEnabled ? createTeammateProfile(humanProfile, options.teammateProfile) : undefined;
  const rivalCount = aiCount - Number(teammateEnabled);
  const profiles = [humanProfile, ...(teammate ? [teammate] : []), ...Array.from({ length: rivalCount }, (_, index) => createAiProfile(index))];
  const weekendMode = options.weekendMode ?? "quick";
  const weatherMode = weekendMode === "full" ? "dynamic" : options.weatherMode ?? "fixed";
  const state: GameState = {
    schemaVersion: 1,
    id: `race-${Date.now()}-${Math.abs(seed)}`,
    sessionMode,
    phase: weekendMode === "full" ? "practice" : "setup",
    track: clone(selectedTrack),
    round: 0,
    weekendMode,
    raceSession: "race",
    sessionLaps: selectedTrack.laps,
    weatherMode,
    rngState: seed >>> 0,
    initialSeed: seed >>> 0,
    humanDriverId: humanProfile.id,
    drivers: profiles.map((profile, index) => baseDriver(profile, index === 0, Boolean(teammate && index === 1))),
    qualifying: [],
    plans: {},
    pendingDecision: null,
    pendingContext: null,
    movement: null,
    raceControl: "green",
    teamOrderHistory: [],
    teammateRelationshipDelta: 0,
    teamPriorityDriverId: options.priorityDriverId ?? humanProfile.id,
    weekend: weekendMode === "full" ? {
      setup: clone(BALANCED_WEEKEND_SETUP),
      sprintEnabled: options.sprintEnabled ?? false,
      sprintCompleted: false,
    } : undefined,
    logs: [],
    nextLogId: 1,
    results: [],
    advanced: {
      gridPenalty: humanProfile.raceEntryEffects?.gridPenalty ?? 0,
      wornComponentPenalty: humanProfile.raceEntryEffects?.wornComponentPenalty ?? 0,
      rookiePractice: Boolean(humanProfile.raceEntryEffects?.rookiePractice),
      complianceRisk: Boolean(humanProfile.raceEntryEffects?.complianceRisk),
      entertainmentEvent: humanProfile.raceEntryEffects?.entertainmentEvent,
    },
  };
  if (state.advanced?.entertainmentEvent) addLog(state, "info", state.advanced.entertainmentEvent, { code: "race.info", details: { result: "entertainment_only" } });
  if (state.phase === "setup") maybeCreateQualifyingTow(state);
  return state;
}

function aiQualifyingMode(state: GameState): EngineMode {
  const roll = nextRandom(state);
  return roll < 0.2 ? "save" : roll < 0.65 ? "balanced" : "attack";
}

function isWeekendSetup(value: WeekendSetup): boolean {
  return ["low", "balanced", "high"].includes(value.aero)
    && ["closed", "balanced", "open"].includes(value.cooling)
    && ["soft", "balanced", "stiff"].includes(value.suspension);
}

function completePractice(state: GameState, setup: WeekendSetup): string | null {
  if (state.weekendMode !== "full" || state.phase !== "practice") return "当前不在完整周末练习阶段";
  if (!isWeekendSetup(setup)) return "调校选项无效";
  state.weekend ??= { sprintEnabled: false, sprintCompleted: false };
  const rookiePractice = Boolean(state.drivers.find((driver) => driver.id === state.humanDriverId)?.profile.raceEntryEffects?.rookiePractice);
  const appliedSetup = rookiePractice ? BALANCED_WEEKEND_SETUP : setup;
  state.weekend.setup = clone(appliedSetup);
  state.phase = "setup";
  addLog(state, "info", rookiePractice ? "新秀完成练习：获得研发数据，但主力调校信息受限，本周末使用均衡设定。" : `练习调校已提交：气动 ${setup.aero}、冷却 ${setup.cooling}、悬挂 ${setup.suspension}。`, {
    code: "weekend.setup",
    details: { input: { aero: appliedSetup.aero, cooling: appliedSetup.cooling, suspension: appliedSetup.suspension, rookiePractice }, result: "practice_complete" },
  });
  maybeCreateQualifyingTow(state);
  return null;
}

function resolveQualifying(state: GameState, humanMode: EngineMode): void {
  state.phase = "qualifying";
  state.round = 0;
  const entries: QualifyingEntry[] = state.drivers.map((driver) => {
    const acceptedTow = state.teamOrderHistory?.find((order) => order.reason === "qualifying_tow" && order.status === "accepted");
    // Draw the AI's planned mode either way, so accepting a tow does not shift later dice.
    const plannedMode = driver.isHuman ? humanMode : aiQualifyingMode(state);
    const mode = acceptedTow?.yieldingDriverId === driver.id ? "save" : plannedMode;
    let roll = rollD12(state);
    let signatureBonus = 0;
    if (driver.profile.career?.signatureMove === "qualifying_push") {
      const extraRollCount = driver.profile.career.signatureUpgrade === "extra_use" ? 2 : 1;
      const rolls = [roll, ...Array.from({ length: extraRollCount }, () => rollD12(state))];
      signatureBonus = driver.profile.career.signatureUpgrade === "enhanced" ? 1 : 0;
      addLog(state, "roll", `${driver.profile.name} 使用排位冲刺：${rolls.map((value) => `D12(${value})`).join(" / ")}，保留最高${signatureBonus ? "并 +1" : ""}。`);
      roll = Math.max(...rolls);
    }
    const specializationBonus = driver.profile.career?.specialization === "qualifying" ? 1 : 0;
    const correlation = consumeCorrelationPenalty(state, driver, "eng");
    const total = roll + driver.profile.stats.eng + MODE_BONUS[mode] + signatureBonus + specializationBonus + correlation;
    if (mode === "attack") driver.heat = Math.min(6, driver.heat + 1);
    addLog(
      state,
      "roll",
      `${driver.profile.name} 排位：D12(${roll}) + ENG(${driver.profile.stats.eng}) + 模式(${MODE_BONUS[mode]})${signatureBonus ? ` + 招牌(${signatureBonus})` : ""}${specializationBonus ? " + 排位专精(1)" : ""}${correlation ? " - 相关性(2)" : ""} = ${total}`,
      { code: "dice.qualifying", details: { input: { driverId: driver.id, mode }, dice: [roll], modifiers: { eng: driver.profile.stats.eng, mode: MODE_BONUS[mode], signature: signatureBonus, specialization: specializationBonus, correlation }, result: String(total) } },
    );
    let invalid = false;
    if (driver.heat >= 6) {
      const reliabilityRoll = rollD12(state);
      const effectiveReliability = Math.max(0, driver.profile.stats.rel - driver.reliabilityPenalty + consumeCorrelationPenalty(state, driver, "rel"));
      const reliabilityTotal = reliabilityRoll + effectiveReliability;
      addLog(state, "roll", `${driver.profile.name} 排位过热检定：D12(${reliabilityRoll}) + 有效REL(${effectiveReliability}) = ${reliabilityTotal}。`, { code: "dice.reliability", details: { input: { driverId: driver.id, heat: driver.heat }, dice: [reliabilityRoll], modifiers: { effectiveRel: effectiveReliability }, result: String(reliabilityTotal) } });
      if (reliabilityTotal <= RACE_RULES.qualifyingOverheat.failure) {
        invalid = true;
        driver.breakdowns = Math.max(1, driver.breakdowns);
        driver.reliabilityPenalty = Math.max(1, driver.reliabilityPenalty);
        addLog(state, "incident", `${driver.profile.name} 排位过热故障，成绩作废并从最后发车；本场已记第一次故障且有效 REL -1。`);
      } else if (reliabilityTotal < RACE_RULES.qualifyingOverheat.success) {
        driver.powerPenaltyRounds = Math.max(1, driver.powerPenaltyRounds);
        addLog(state, "incident", `${driver.profile.name} 排位成绩有效，但正赛第一次行动 -1 MP。`);
      } else {
        addLog(state, "info", `${driver.profile.name} 通过排位过热检定，成绩有效。`);
      }
    }
    return { driverId: driver.id, mode, roll, total, invalid };
  });
  entries.sort((a, b) => {
    if (Boolean(a.invalid) !== Boolean(b.invalid)) return a.invalid ? 1 : -1;
    if (b.total !== a.total) return b.total - a.total;
    const aero = driverById(state, b.driverId).profile.stats.aero - driverById(state, a.driverId).profile.stats.aero;
    if (aero !== 0) return aero;
    return 0;
  });
  for (let start = 0; start < entries.length;) {
    const first = entries[start];
    const firstAero = driverById(state, first.driverId).profile.stats.aero;
    let end = start + 1;
    while (end < entries.length) {
      const candidate = entries[end];
      const sameFailureGroup = Boolean(first.invalid) && Boolean(candidate.invalid);
      const sameValidGroup = !first.invalid && !candidate.invalid && candidate.total === first.total && driverById(state, candidate.driverId).profile.stats.aero === firstAero;
      if (!sameFailureGroup && !sameValidGroup) break;
      end += 1;
    }
    if (end - start > 1) {
      const used = new Set<number>();
      for (let index = start; index < end; index += 1) {
        let tieBreakRoll = 0;
        do tieBreakRoll = rollD12(state); while (used.has(tieBreakRoll));
        used.add(tieBreakRoll);
        entries[index].tieBreakRoll = tieBreakRoll;
        addLog(state, "roll", `${driverById(state, entries[index].driverId).profile.name} 排位决胜骰 D12(${tieBreakRoll})。`);
      }
      const resolved = entries.slice(start, end).sort((a, b) => (b.tieBreakRoll ?? 0) - (a.tieBreakRoll ?? 0));
      entries.splice(start, end - start, ...resolved);
    }
    start = end;
  }
  const humanGridPenalty = state.drivers.find((driver) => driver.id === state.humanDriverId)?.profile.raceEntryEffects?.gridPenalty ?? 0;
  if (humanGridPenalty > 0) {
    const index = entries.findIndex((entry) => entry.driverId === state.humanDriverId);
    if (index >= 0) {
      const [entry] = entries.splice(index, 1);
      entries.splice(Math.min(entries.length, index + humanGridPenalty), 0, entry);
      addLog(state, "incident", `${driverById(state, state.humanDriverId).profile.name} 因超额更换动力部件承受 ${humanGridPenalty} 位发车位处罚。`, { code: "weekend.setup", details: { input: { driverId: state.humanDriverId, gridPenalty: humanGridPenalty }, result: "component_grid_penalty" } });
    }
  }
  state.qualifying = entries;
  entries.forEach((entry, index) => {
    const driver = driverById(state, entry.driverId);
    driver.qualifyingRank = index + 1;
    driver.progress = -index;
    driver.lane = index % 2 === 0 ? "left" : "right";
  });
  const weatherRoll = rollD12(state);
  const weather: Weather = initialWeatherForRoll(weatherRoll);
  state.weatherRoll = weatherRoll;
  state.weather = weather;
  state.weatherHistory = [];
  if (state.weekendMode === "full" && state.weekend) state.weekend.lockedSetup = clone(state.weekend.setup ?? BALANCED_WEEKEND_SETUP);
  state.phase = "preRace";
  addLog(state, "info", `天气骰 D12(${weatherRoll})，起始天气为 ${weatherLabel(weather)}${state.weatherMode === "dynamic" ? "；每回合末更新下一回合天气" : "；本场固定"}。`);
}

function weatherLabel(weather: Weather): string {
  return { heavy_rain: "大雨", light_rain: "小雨", sunny: "晴天", cloudy: "阴天（按干地）" }[weather];
}

function chooseAiBurdens(driver: DriverState): BurdenId[] {
  const count = requiredBurdenCount(driver.profile.stats);
  const order: BurdenId[] = ["scrutiny", "slow_pit", "budget_cap", "high_heat", "tire_wear"];
  return order.slice(0, count);
}

function chooseAiTire(weather?: Weather): TireCompound {
  if (weather === "heavy_rain") return "wet";
  if (weather === "light_rain") return "intermediate";
  return "medium";
}

function isSlickTire(tire: TireCompound): boolean {
  return tire === "hard" || tire === "medium" || tire === "soft";
}

function chooseAiPitTire(state: GameState, driver: DriverState): TireCompound {
  const weatherTire = chooseAiTire(state.weather);
  if (isRain(state.weather)) return weatherTire;
  if (state.weekendMode !== "full" || state.raceSession !== "race" || state.raceWeatherWasWet) return weatherTire;
  const used = new Set((driver.tireCompoundsUsed ?? []).filter(isSlickTire));
  return (["hard", "medium", "soft"] as TireCompound[]).find((tire) => !used.has(tire)) ?? weatherTire;
}

function removeResource(driver: DriverState, resource?: "ers" | "lateBrake" | "defense" | "cooling"): void {
  if (!resource) return;
  if (resource === "ers") driver.ers = Math.max(0, driver.ers - 1);
  else driver.tactical[resource] = Math.max(0, driver.tactical[resource] - 1);
}

function addResource(
  driver: DriverState,
  resource?: "ers" | "lateBrake" | "defense" | "cooling" | "quickRepair",
): void {
  if (!resource) return;
  if (resource === "ers") driver.ers = Math.min(ersCapacity(driver), driver.ers + 1);
  else driver.tactical[resource] += 1;
}

function setupDriver(
  driver: DriverState,
  tire: TireCompound,
  burdens: BurdenId[],
  budgetRemoval?: "ers" | "lateBrake" | "defense" | "cooling",
  strategistBonus?: "ers" | "lateBrake" | "defense" | "cooling" | "quickRepair",
  strategistBonus2?: TacticalResourceId,
  teamBonus?: TacticalResourceId,
): void {
  driver.tire = tire;
  driver.burdens = burdens;
  if (burdens.includes("budget_cap")) removeResource(driver, budgetRemoval ?? "cooling");
  if (driver.profile.talent === "strategist") addResource(driver, strategistBonus ?? "quickRepair");
  if (facilityLevel(driver, "strategy_tools") > 0) addResource(driver, teamBonus ?? "defense");
  const talentRank = talentUpgradeRank(driver.profile.career?.level ?? 1);
  if (driver.profile.talent === "late_braker" && talentRank >= 1) driver.tactical.lateBrake += 1;
  if (driver.profile.talent === "strategist" && talentRank >= 3) addResource(driver, strategistBonus2 ?? "quickRepair");
  if (driver.profile.career?.signatureMove === "race_launch") {
    const upgrade = driver.profile.career.signatureUpgrade;
    driver.ers = Math.min(ersCapacity(driver), driver.ers + (upgrade ? 2 : 1));
    driver.tactical.lateBrake += upgrade === "extra_use" ? 2 : 1;
    if (upgrade === "enhanced") driver.heat = Math.max(0, driver.heat - 1);
  }
}

export function previewRaceSetup(
  driver: DriverState,
  tire: TireCompound,
  burdens: BurdenId[],
  budgetRemoval?: "ers" | "lateBrake" | "defense" | "cooling",
  strategistBonus?: "ers" | "lateBrake" | "defense" | "cooling" | "quickRepair",
  strategistBonus2?: TacticalResourceId,
  teamBonus?: TacticalResourceId,
): Pick<DriverState, "ers" | "tactical" | "heat" | "tire"> {
  const preview = clone(driver);
  setupDriver(preview, tire, burdens, budgetRemoval, strategistBonus, strategistBonus2, teamBonus);
  return { ers: preview.ers, tactical: preview.tactical, heat: preview.heat, tire: preview.tire };
}

type SessionStartCommand = Extract<GameCommand, { type: "START_RACE" | "START_SPRINT" }>;

function sameWeekendSetup(left: WeekendSetup, right: WeekendSetup): boolean {
  return left.aero === right.aero && left.cooling === right.cooling && left.suspension === right.suspension;
}

function startRace(
  state: GameState,
  command: SessionStartCommand,
): string | null {
  const human = driverById(state, state.humanDriverId);
  const sprint = command.type === "START_SPRINT";
  if (sprint && (state.weekendMode !== "full" || !state.weekend?.sprintEnabled || state.weekend.sprintCompleted)) return "当前没有可开始的冲刺赛";
  if (!sprint && state.weekendMode === "full" && state.weekend?.sprintEnabled && !state.weekend.sprintCompleted) return "请先完成本周末冲刺赛";
  const expected = requiredBurdenCount(human.profile.stats);
  if (command.burdens.length !== expected || new Set(command.burdens).size !== command.burdens.length) {
    return `需要选择 ${expected} 个不重复的负担`;
  }
  if (command.burdens.includes("budget_cap") && !command.budgetRemoval) return "预算帽需要选择移除的资源";
  if (human.profile.talent === "strategist" && !command.strategistBonus) return "策略家需要选择额外标记";
  const strategistRank = human.profile.talent === "strategist" ? talentUpgradeRank(human.profile.career?.level ?? 1) : 0;
  if (strategistRank >= 3 && !command.strategistBonus2) return "策略家三级升级需要选择第二枚额外标记";
  if (strategistRank < 3 && command.strategistBonus2) return "当前策略家尚未解锁第二枚额外标记";
  if (facilityLevel(human, "strategy_tools") > 0 && !command.teamBonus) return "策略工具需要选择团队战术标记";
  if (facilityLevel(human, "strategy_tools") === 0 && command.teamBonus) return "当前车队尚未研发策略工具";
  if (!sprint && command.type === "START_RACE" && state.weekendMode === "full" && state.weekend) {
    const locked = state.weekend.lockedSetup ?? state.weekend.setup ?? BALANCED_WEEKEND_SETUP;
    const selected = command.setupOverride ?? locked;
    if (!isWeekendSetup(selected)) return "调校选项无效";
    state.weekend.setup = clone(selected);
    if (!sameWeekendSetup(locked, selected)) {
      state.weekend.parcFermeBroken = true;
      human.pitLaneStart = true;
      human.progress = -state.drivers.length;
      human.lane = "right";
      addLog(state, "incident", `${human.profile.name} 在 parc fermé 后修改调校，正赛从维修区发车。`, { code: "weekend.setup", details: { input: { driverId: human.id }, result: "parc_ferme_breach" } });
    }
  }
  setupDriver(human, command.tire, command.burdens, command.budgetRemoval, command.strategistBonus, command.strategistBonus2, command.teamBonus);
  human.tireCompoundsUsed = [command.tire];
  state.drivers.filter((driver) => !driver.isHuman).forEach((driver) => {
    setupDriver(driver, chooseAiTire(state.weather), chooseAiBurdens(driver), "cooling", "quickRepair", undefined, undefined);
    driver.tireCompoundsUsed = [driver.tire];
  });
  state.round = 1;
  state.raceSession = sprint ? "sprint" : "race";
  state.sessionLaps = sprint ? 3 : state.track.laps;
  state.raceWeatherWasWet = isRain(state.weather);
  state.objectives = sprint ? [] : drawRaceObjectives(rollD12(state) - 1, rollD12(state) - 1, {
    track: state.track,
    gridSize: state.drivers.length,
    qualifyingRank: human.qualifyingRank,
    startingErs: human.ers,
    startingTire: human.tire,
    validCarsBehind: state.drivers.filter((driver) => driver.id !== human.id && driver.status !== "dnf" && driver.qualifyingRank > human.qualifyingRank).length,
    tireWearBurden: human.burdens.includes("tire_wear"),
  });
  if (!sprint) addLog(state, "info", `赛事目标已锁定：${state.objectives.map((objective) => `${objective.title}（${objective.points} 分）`).join(" / ")}。`);
  const preparation = sprint ? undefined : human.profile.career?.pendingPreparation;
  if (preparation) {
    const effects = [
      preparation.startMp ? `第 1 回合 +${preparation.startMp} MP` : "",
      preparation.lateBrakeBonus ? `第一次晚刹 +${preparation.lateBrakeBonus}` : "",
      preparation.lightDamageShield ? "第一次轻损伤无效" : "",
    ].filter(Boolean).join("、");
    addLog(state, "resource", `${human.profile.name} 的赛前训练生效：${effects}。`);
  }
  state.phase = "strategy";
  state.broadcast = sprint ? undefined : { active: true, stage: 0 };
  maybeCreateTeamOrder(state);
  addLog(state, "info", `${sprint ? "冲刺赛" : "正赛"}开始，共 ${state.sessionLaps} 圈。所有策略将在移动前锁定。`, { code: sprint ? "weekend.sprint" : "race.info", details: { input: { session: sprint ? "sprint" : "race" }, result: "started" } });
  return null;
}

function teammatePair(state: GameState): [DriverState, DriverState] | null {
  const human = driverById(state, state.humanDriverId);
  const teammate = state.drivers.find((driver) => driver.isTeammate && driver.status === "racing");
  if (!teammate || human.status !== "racing" || !human.profile.teamId || human.profile.teamId !== teammate.profile.teamId) return null;
  return [human, teammate];
}

function maybeCreateQualifyingTow(state: GameState): void {
  if (state.phase !== "setup" || state.teamOrder?.status === "pending") return;
  if (state.teamOrderHistory?.some((order) => order.reason === "qualifying_tow")) return;
  const pair = teammatePair(state);
  if (!pair) return;
  const [human, teammate] = pair;
  const beneficiary = state.drivers.find((driver) => driver.id === state.teamPriorityDriverId && (driver.id === human.id || driver.id === teammate.id)) ?? human;
  const yielding = beneficiary.id === human.id ? teammate : human;
  state.teamOrder = {
    id: "team-order-qualifying-tow",
    round: 0,
    reason: "qualifying_tow",
    beneficiaryId: beneficiary.id,
    yieldingDriverId: yielding.id,
    status: "pending",
  };
  addLog(state, "info", `车队提出排位拖车安排：${yielding.profile.name} 为 ${beneficiary.profile.name} 提供尾流。`, {
    code: "team.order",
    details: { input: { beneficiaryId: beneficiary.id, yieldingDriverId: yielding.id, reason: "qualifying_tow" }, result: "pending" },
  });
}

function raceTeamOrderIntent(state: GameState): { beneficiary: DriverState; yielding: DriverState; reason: TeamOrderReason; count: number } | null {
  const raceOrderCount = state.teamOrderHistory?.filter((order) => order.reason !== "qualifying_tow").length ?? 0;
  if (state.phase !== "movement" || state.raceControl !== "green" || state.teamOrder?.status === "pending" || raceOrderCount >= 2) return null;
  const pair = teammatePair(state);
  if (!pair) return null;
  const [human, teammate] = pair;
  if (human.pit || teammate.pit || human.progress < 0 || teammate.progress < 0) return null;
  const humanSegment = getSegmentAtCell(state, getCellIndex(state, human))?.segment;
  const teammateSegment = getSegmentAtCell(state, getCellIndex(state, teammate))?.segment;
  if (!humanSegment || humanSegment.id !== teammateSegment?.id || humanSegment.type !== "straight" || state.yellowFlagSegmentId === humanSegment.id) return null;
  if (Math.floor(human.progress / state.track.totalLength) !== Math.floor(teammate.progress / state.track.totalLength)) return null;
  const priority = state.drivers.find((driver) => driver.id === state.teamPriorityDriverId && (driver.id === human.id || driver.id === teammate.id)) ?? human;
  let beneficiary = priority;
  let yielding = beneficiary.id === human.id ? teammate : human;
  let reason: TeamOrderReason = "championship_priority";
  const compromised = [human, teammate].find((driver) => driver.heavyDamage || driver.wear >= 9);
  if (compromised) {
    yielding = compromised;
    beneficiary = compromised.id === human.id ? teammate : human;
    reason = "pit_window";
  } else if (human.tire !== teammate.tire) reason = "strategy_split";
  if (beneficiary.progress > yielding.progress || state.movement?.activeDriverId !== beneficiary.id) return null;
  if (state.teamOrderHistory?.some(order => order.reason !== "qualifying_tow" && order.round === state.round && order.beneficiaryId === beneficiary.id && order.yieldingDriverId === yielding.id)) return null;
  return { beneficiary, yielding, reason, count: raceOrderCount };
}

export function maybeCreateTeamOrder(state: GameState): void {
  const intent = raceTeamOrderIntent(state);
  if (!intent || intent.beneficiary.progress !== intent.yielding.progress || (state.movement?.remainingMp ?? 0) <= 0) return;
  const { beneficiary, yielding, reason, count } = intent;
  state.teamOrder = {
    id: `team-order-${state.raceSession}-${state.round}-${count + 1}`,
    round: state.round,
    reason,
    beneficiaryId: beneficiary.id,
    yieldingDriverId: yielding.id,
    status: "pending",
  };
  addLog(state, "info", `车队发出队令：${yielding.profile.name} 为 ${beneficiary.profile.name} 让位（${reason}）。`, { code: "team.order", details: { input: { beneficiaryId: beneficiary.id, yieldingDriverId: yielding.id, reason }, result: "pending" } });
}

function resolveTeamOrder(state: GameState, accept: boolean): string | null {
  const order = state.teamOrder;
  const validPhase = order?.reason === "qualifying_tow" ? state.phase === "setup" : state.phase === "movement" || state.phase === "strategy";
  if (!validPhase || !order || order.status !== "pending") return "当前没有待处理的队令";
  const beneficiary = driverById(state, order.beneficiaryId);
  const yielding = driverById(state, order.yieldingDriverId);
  if (order.reason !== "qualifying_tow" && state.phase === "strategy") {
    state.teamOrder = undefined;
    addLog(state, "info", "旧队令延后至两车同格时重新确认。", { code: "team.order", details: { result: "deferred" } });
    return null;
  }
  if (accept) {
    if (order.reason !== "qualifying_tow") {
      if (!state.movement || beneficiary.progress !== yielding.progress) return "两车同格时才能执行让位";
      state.movement.teamOrderPass = { beneficiaryId: beneficiary.id, yieldingDriverId: yielding.id };
    }
    order.status = "accepted";
    if (yielding.isHuman) state.teammateRelationshipDelta = (state.teammateRelationshipDelta ?? 0) + 1;
    const message = order.reason === "qualifying_tow"
      ? `${yielding.profile.name} 接受排位拖车安排，将以省油模式完成排位；未修改任何骰点。`
      : `${yielding.profile.name} 执行队令，为 ${beneficiary.profile.name} 让位；继续剩余 ${state.movement!.remainingMp} MP 的行动。`;
    addLog(state, "move", message, { code: "team.order", details: { input: { beneficiaryId: beneficiary.id, yieldingDriverId: yielding.id, reason: order.reason }, result: "accepted" } });
  } else {
    order.status = "refused";
    state.teammateRelationshipDelta = (state.teammateRelationshipDelta ?? 0) - 1;
    addLog(state, "incident", `${state.drivers.find((driver) => driver.isHuman)?.profile.name ?? "玩家"} 拒绝队令；赛道位置与骰点不变，队友关系将在赛后降低 1。`, { code: "team.order", details: { input: { beneficiaryId: beneficiary.id, yieldingDriverId: yielding.id, reason: order.reason }, result: "refused" } });
  }
  state.teamOrderHistory ??= [];
  state.teamOrderHistory.push(clone(order));
  state.teamOrder = undefined;
  return null;
}

function tireSuitsWeather(tire: TireCompound, weather?: Weather): boolean {
  if (weather === "heavy_rain") return tire === "wet";
  if (weather === "light_rain") return tire === "intermediate" || tire === "wet";
  return tire === "hard" || tire === "medium" || tire === "soft";
}

function aiPlan(state: GameState, driver: DriverState): { plan: TurnPlan; note: string } {
  const location = getSegmentAtCell(state, getCellIndex(state, driver));
  const lastLap = driver.progress >= ((state.sessionLaps ?? state.track.laps) - 1) * state.track.totalLength;
  const ahead = nearestAhead(state, driver);
  const closeToCar = !!ahead && ahead.progress - driver.progress <= 3;
  const neutralized = isNeutralized(state);
  const mode: EngineMode = neutralized ? "balanced" : driver.heat >= 5 ? "save" : driver.heat <= 3 && closeToCar ? "attack" : "balanced";
  const deployErs =
    !neutralized &&
    driver.ers > 0 &&
    driver.powerPenaltyRounds === 0 &&
    location?.segment.type === "straight" &&
    (closeToCar || lastLap);
  const tireMismatch = !tireSuitsWeather(driver.tire, state.weather);
  const usedSlicks = new Set((driver.tireCompoundsUsed ?? []).filter(isSlickTire));
  const completedLaps = Math.floor(Math.max(0, driver.progress) / state.track.totalLength);
  const dryTireObligationDue = state.weekendMode === "full"
    && state.raceSession === "race"
    && !state.raceWeatherWasWet
    && !isRain(state.weather)
    && usedSlicks.size < 2
    && completedLaps >= Math.max(0, (state.sessionLaps ?? state.track.laps) - 2);
  const mustPit = driver.wear >= 9 || driver.heavyDamage || tireMismatch || dryTireObligationDue;
  const reasons = [
    neutralized ? `${state.raceControl.toUpperCase()} 限速，锁定平衡模式` : driver.heat >= 5 ? "热量达到高风险区，切换省油" : mode === "attack" ? "低热量且三格内有前车，切换进攻" : "热量与车距正常，保持平衡",
    deployErs ? lastLap ? "末圈直道部署 ERS" : "直道追击前车，部署 ERS" : "本回合保留 ERS",
    driver.heavyDamage ? "重损伤强制计划进站" : driver.wear >= 9 ? "轮胎进入磨损危险区，计划进站" : tireMismatch ? "当前轮胎不适合赛道天气，计划进站" : dryTireObligationDue ? "进入最后两圈窗口，计划完成两种干胎义务" : "无需进站",
  ];
  return { plan: {
    mode,
    deployErs,
    pit: mustPit,
    pitTire: chooseAiPitTire(state, driver),
    useCooling: driver.heat >= 5 && driver.tactical.cooling > 0,
    useQuickRepair: driver.lightDamage > 0 && driver.tactical.quickRepair > 0,
  }, note: reasons.join("；") };
}

function validatePlan(driver: DriverState, plan: TurnPlan, state?: GameState): string | null {
  if (state && isNeutralized(state) && plan.deployErs) return "VSC/SC 期间不能部署 ERS";
  if (plan.deployErs && driver.ers <= 0) return "ERS 不足";
  if (plan.deployErs && driver.powerPenaltyRounds > 0) return "降功率期间无法部署 ERS";
  if (plan.useCooling && driver.tactical.cooling <= 0) return "没有冷却标记";
  if (plan.useQuickRepair && driver.tactical.quickRepair <= 0) return "没有快修标记";
  const uses = careerUses(driver);
  if (plan.talentAction) {
    if (!availableTalentActions(driver.profile).includes(plan.talentAction)) return "当前车手未解锁该培养动作";
    if (uses.talentActions.includes(plan.talentAction)) return "该培养动作本场已经使用";
  }
  if (plan.tokenSwap) {
    if (plan.tokenSwap.from === plan.tokenSwap.to) return "战术置换的来源和目标不能相同";
    if (uses.tokenSwaps >= tokenSwapAllowance(driver.profile)) return "本场战术置换次数已经用完";
    if (resourceAmount(driver, plan.tokenSwap.from) <= 0) return "没有可用于置换的来源资源";
    if (plan.tokenSwap.to === "ers" && driver.ers >= ersCapacity(driver)) return "ERS 已达到上限，不能作为置换目标";
  }
  return null;
}

function resourceAmount(driver: DriverState, resource: TacticalResourceId): number {
  return resource === "ers" ? driver.ers : driver.tactical[resource];
}

function changeResource(driver: DriverState, resource: TacticalResourceId, delta: -1 | 1): void {
  if (resource === "ers") driver.ers = Math.max(0, Math.min(ersCapacity(driver), driver.ers + delta));
  else driver.tactical[resource] = Math.max(0, driver.tactical[resource] + delta);
}

function applyPlanDevelopment(state: GameState, driver: DriverState, plan: TurnPlan): void {
  const uses = careerUses(driver);
  uses.roundStartWear = driver.wear;
  if (plan.talentAction) {
    uses.talentActions.push(plan.talentAction);
    addLog(state, "resource", `${driver.profile.name} 声明培养动作：${TALENT_ACTIONS[plan.talentAction].name}。`);
  }
  if (plan.tokenSwap) {
    changeResource(driver, plan.tokenSwap.from, -1);
    changeResource(driver, plan.tokenSwap.to, 1);
    uses.tokenSwaps += 1;
    addLog(state, "resource", `${driver.profile.name} 执行战术置换：${plan.tokenSwap.from} → ${plan.tokenSwap.to}。`);
  }
}

export function strategyWaitReason(driver: DriverState): string | null {
  if (driver.status !== "racing") return "本车已结束比赛，继续观看其他赛车。";
  if (driver.pit && driver.pit.remainingRounds > 0) return `维修区服务中，本回合不移动（还需等待 ${driver.pit.remainingRounds} 回合）。`;
  if (driver.stoppedRounds > 0) return "故障停车，本回合不移动。";
  if (driver.pitLaneStart) return "维修区发车，本回合等待车阵通过。";
  return null;
}

function waitingPlan(driver: DriverState): TurnPlan {
  return { mode: "balanced", deployErs: false, pit: false, pitTire: driver.tire, useCooling: false, useQuickRepair: false };
}

function submitStrategy(state: GameState, plan: TurnPlan): string | null {
  if (state.teamOrder?.status === "pending") return "请先处理当前队令";
  const human = driverById(state, state.humanDriverId);
  if (strategyWaitReason(human)) plan = waitingPlan(human);
  else {
    const error = validatePlan(human, plan, state);
    if (error) return error;
    applyPlanDevelopment(state, human, plan);
  }
  state.plans = {};
  state.aiPlanNotes = {};
  for (const driver of activeDrivers(state)) {
    if (driver.isHuman) state.plans[driver.id] = plan;
    else {
      const decision = aiPlan(state, driver);
      state.plans[driver.id] = decision.plan;
      state.aiPlanNotes[driver.id] = decision.note;
    }
  }
  const queue = activeDrivers(state)
    .slice()
    .sort((a, b) => b.progress - a.progress || (state.restartLaunchRound === state.round && state.redFlagOrder
      ? state.redFlagOrder.indexOf(a.id) - state.redFlagOrder.indexOf(b.id)
      : a.qualifyingRank - b.qualifyingRank))
    .map((driver) => driver.id);
  state.movement = {
    queue,
    queueIndex: 0,
    remainingMp: 0,
    paidCornerIds: [],
    started: false,
    freeDefenseUsed: [],
    movedDriverIds: [],
  };
  state.phase = "movement";
  addLog(state, "info", `第 ${state.round} 回合策略已锁定，开始按赛道顺序行动。`);
  advanceMovementStep(state);
  return null;
}

function beginDriverTurn(state: GameState, driver: DriverState): boolean {
  const runtime = state.movement!;
  runtime.activeDriverId = driver.id;
  runtime.remainingMp = 0;
  runtime.paidCornerIds = [];
  runtime.started = true;
  if (driver.pit) {
    if (driver.pit.remainingRounds > 0) {
      driver.pit.remainingRounds -= 1;
      addLog(state, "info", `${driver.profile.name} 正在维修区，本回合不移动。`);
      return false;
    }
    const slowService = driver.pit.service && driver.burdens.includes("slow_pit");
    const serviced = Boolean(driver.pit.service);
    if (serviced) driver.pitExitRound = state.round;
    if (serviced && driver.tire === "soft" && hasTalentNode(driver.profile, "ST-3")) careerUses(driver).softTireProtectionCharges = 3;
    addLog(state, "info", `${driver.profile.name} 驶出维修区${slowService ? "，进站慢：仅本回合 -3 MP" : ""}。`, { code: "pit.service", details: { input: { driverId: driver.id, tire: driver.tire, service: false }, result: "exited" } });
    driver.pit = undefined;
    const previousProgress = driver.progress;
    const nearestAheadProgress = state.drivers.filter((item) => item.id !== driver.id && item.status === "racing" && !item.pit && item.progress > previousProgress).sort((a, b) => a.progress - b.progress)[0]?.progress;
    const lapBase = Math.floor(Math.max(0, previousProgress) / state.track.totalLength) * state.track.totalLength;
    const crossesLine = state.track.pitExitCell <= state.track.pitEntryCell;
    driver.progress = lapBase + state.track.pitExitCell + (crossesLine ? state.track.totalLength : 0);
    if (isNeutralized(state) && nearestAheadProgress !== undefined) driver.progress = Math.min(driver.progress, nearestAheadProgress - 1);
    refreshSafetyCarLeader(state);
    recordLapCompletion(state, driver, previousProgress);
    driver.slowPitOutLap = undefined;
    checkFinish(state, driver);
    if (driver.status !== "racing") return false;
  }
  if (driver.stoppedRounds > 0) {
    driver.stoppedRounds -= 1;
    addLog(state, "info", `${driver.profile.name} 因故障停车，本回合不移动。`);
    return false;
  }
  const plan = state.plans[driver.id];
  if (!plan) return false;
  if (!driver.isHuman) {
    addLog(state, "info", `${driver.profile.name} 公开已锁定策略：${state.aiPlanNotes?.[driver.id] ?? `${plan.mode}模式`}。`, {
      code: "ai.strategy",
      details: { input: { driverId: driver.id, mode: plan.mode, deployErs: plan.deployErs, pit: plan.pit }, result: state.aiPlanNotes?.[driver.id] ?? plan.mode },
    });
  }
  if (driver.pitLaneStart) {
    driver.pitLaneStart = false;
    addLog(state, "info", `${driver.profile.name} 因 parc fermé 变更从维修区发车，本回合等待车阵通过。`, { code: "weekend.setup", details: { input: { driverId: driver.id }, result: "pit_lane_start" } });
    return false;
  }
  if (plan.useCooling && driver.tactical.cooling > 0) {
    driver.tactical.cooling -= 1;
    const cooling = hasMinorTalent(driver.profile, "cooling_skill") ? 3 : 2;
    driver.heat = Math.max(0, driver.heat - cooling);
    if (hasTalentNode(driver.profile, "TE-1")) driver.brakeHeat = Math.max(0, driver.brakeHeat - 1);
    addLog(state, "resource", `${driver.profile.name} 使用冷却标记，热量 -${cooling}。`);
  }
  if (plan.mode === "attack" && !isNeutralized(state)) {
    driver.heat = Math.min(6, driver.heat + 1 + (driver.burdens.includes("high_heat") ? 1 : 0));
  }
  if (weekendSetupFor(state, driver).cooling === "closed" && plan.mode !== "save" && !isNeutralized(state)) {
    driver.heat = Math.min(6, driver.heat + 1);
    addLog(state, "resource", `${driver.profile.name} 使用紧闭冷却调校：本回合额外 +1 热量。`);
  }
  const draft = drafting(state, driver);
  if (draft.drs && !isNeutralized(state)) {
    driver.ers = Math.min(ersCapacity(driver), driver.ers + 1);
    const front = nearestAhead(state, driver);
    const position = activeDrivers(state).slice().sort((a, b) => b.progress - a.progress || a.qualifyingRank - b.qualifyingRank).findIndex(car => car.id === driver.id) + 1;
    addLog(state, "resource", `${driver.profile.name} 获得 DRS，并回充 1 ERS。`, { code: "resource.change", details: { result: "drs_used", input: {
      driverId: driver.id, position, lap: Math.floor(Math.max(0, driver.progress) / state.track.totalLength) + 1,
      ...(front ? { otherDriverId: front.id, gapCells: front.progress - driver.progress } : {}),
      ...(driver.lapTiming?.completedRounds.length ? { lastLapRounds: driver.lapTiming.completedRounds.at(-1)! } : {}),
    } } });
  }
  const breakdown = calculateMpBreakdown(state, driver, plan);
  if (breakdown.teamEngine && consumeFacilityUse(driver, "engine_mapping", 1)) {
    addLog(state, "resource", `${driver.profile.name} 启用引擎厂商，本回合 +1 MP。`);
  }
  if (plan.deployErs && driver.ers > 0 && driver.powerPenaltyRounds === 0 && !isNeutralized(state)) {
    driver.ers -= 1;
    raceStats(driver).ersUsed += 1;
    careerUses(driver).ersUsedRound = state.round;
    driver.heat = Math.min(6, driver.heat + 1 + (driver.profile.stats.eng >= 4 ? 1 : 0));
  }
  recordPeaks(driver);
  runtime.remainingMp = breakdown.total;
  const setup = weekendSetupFor(state, driver);
  if (breakdown.setup > 0 && setup.aero === "low" && getSegmentAtCell(state, getCellIndex(state, driver))?.segment.type === "straight") {
    careerUses(driver).firstStraightSetupRound = state.round;
  }
  runtime.movedDriverIds.push(driver.id);
  addLog(
    state,
    "resource",
    `${driver.profile.name} MP=${breakdown.total}：${breakdown.base}基础 ${signed(breakdown.mode)}模式 ${signed(breakdown.engine)}ENG ${signed(breakdown.teamEngine)}引擎厂商 ${signed(breakdown.launch)}发车 ${signed(breakdown.specialization)}专精 ${signed(breakdown.preparation)}训练 ${signed(breakdown.ers + breakdown.ersStraight)}ERS ${signed(breakdown.slipstream)}尾流 ${signed(breakdown.drs)}DRS ${signed(breakdown.softTire)}软胎 ${signed(breakdown.wear)}磨损 ${signed(breakdown.heavyDamage)}重伤 ${signed(breakdown.powerLoss)}降功率 ${signed(breakdown.slowPit)}出站负担 ${signed(breakdown.pitExit)}出站奖励 ${signed(breakdown.yellowFlag)}黄旗 ${signed(breakdown.setup)}调校。`,
  );
  if (driver.powerPenaltyRounds > 0) driver.powerPenaltyRounds -= 1;
  return true;
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function segmentHasCar(state: GameState, segmentId: string, excludingId: string): boolean {
  return activeDrivers(state).some((driver) => {
    if (driver.id === excludingId || driver.pit || driver.progress < 0) return false;
    return getSegmentAtCell(state, getCellIndex(state, driver))?.segment.id === segmentId;
  });
}

function cornerOptions(state: GameState, driver: DriverState, segment: TrackSegment) {
  const runtime = state.movement!;
  const aeroSetup = weekendSetupFor(state, driver).aero;
  const baseCost = Math.max(0, (segment.cornerCost ?? 0) + (aeroSetup === "low" ? 1 : aeroSetup === "high" ? -1 : 0));
  const idealCost = Math.max(0, baseCost - 2);
  const hasAero = driver.profile.stats.aero >= 3;
  const occupied = segmentHasCar(state, segment.id, driver.id);
  const hasIdealMp = runtime.remainingMp >= idealCost + 1;
  const canIdeal = hasAero && !occupied && hasIdealMp;
  const lateBrakeBlockedByControl = state.yellowFlagSegmentId === segment.id || isNeutralized(state);
  const hasLateBrakeMp = runtime.remainingMp >= 1 && runtime.remainingMp < baseCost + 1;
  const idealReason = !hasAero
    ? "需要 AERO ≥ 3"
    : occupied
      ? "弯中已有其他车辆"
      : !hasIdealMp
        ? `至少需要 ${idealCost + 1} MP（弯角 ${idealCost} + 入弯 1）`
        : undefined;
  return {
    baseCost,
    remainingMp: runtime.remainingMp,
    canIdeal,
    idealReason,
    canNormal: runtime.remainingMp >= baseCost + 1,
    canLateBrake: hasLateBrakeMp && !lateBrakeBlockedByControl,
    lateBrakeReason: lateBrakeBlockedByControl
      ? "黄旗、VSC 或 SC 期间禁止晚刹"
      : runtime.remainingMp < 1
        ? "至少需要保留 1 MP"
        : runtime.remainingMp >= baseCost + 1
          ? "MP 足够正常入弯时不能晚刹"
          : undefined,
  };
}

function tireCornerWear(driver: DriverState, weather?: Weather): number {
  if (driver.tire === "soft") return 2;
  if (driver.tire === "intermediate" || driver.tire === "wet") return isRain(weather) ? 1 : 1;
  return 1;
}

function addWear(state: GameState, driver: DriverState, amount: number, reason: string): void {
  if (amount <= 0 || driver.status !== "racing") return;
  const previous = driver.wear;
  driver.wear = Math.min(12, driver.wear + amount);
  recordPeaks(driver);
  addLog(state, "resource", `${driver.profile.name} 因${reason}磨损 +${driver.wear - previous}（${driver.wear}/12）。`);
  if (driver.wear >= RACE_RULES.damage.punctureThreshold) {
    markDnf(state, driver, "轮胎临界失效并失控", false);
    triggerIncidentControl(state, [driver.id], { reason: "轮胎临界失效并失控", severe: true });
  }
}

function controlPriority(control: GameState["raceControl"]): number {
  return { green: 0, vsc: 1, sc: 2, red_flag: 3 }[control];
}

function applySafetyCarTalent(state: GameState): void {
  for (const driver of activeDrivers(state)) {
    if (!hasTalentNode(driver.profile, "ST-5")) continue;
    const ersBefore = driver.ers;
    const heatBefore = driver.heat;
    driver.ers = Math.min(ersCapacity(driver), driver.ers + 1);
    driver.heat = Math.max(0, driver.heat - 1);
    addLog(state, "resource", `${driver.profile.name} 触发安全车嗅觉：ERS +${driver.ers - ersBefore}，热量 ${driver.heat - heatBefore}。`);
  }
}

function redFlagOrder(state: GameState): DriverState[] {
  return activeDrivers(state).slice().sort((a, b) => b.progress - a.progress || a.qualifyingRank - b.qualifyingRank);
}

function refreshSafetyCarLeader(state: GameState): void {
  if (state.raceControl !== "sc" || state.raceControlPhase !== "sc_restart") return;
  const current = state.drivers.find((driver) => driver.id === state.safetyCarLeaderId);
  if (current?.status === "racing" && !current.pit) return;
  const next = activeDrivers(state).filter((driver) => !driver.pit).sort((a, b) => b.progress - a.progress || a.qualifyingRank - b.qualifyingRank)[0];
  const previousId = state.safetyCarLeaderId;
  state.safetyCarLeaderId = next?.id;
  if (next && next.id !== previousId) {
    addLog(state, "info", `${next.profile.name} 接替成为 SC 队列领跑者；仍按原两回合上限结束。`, {
      code: "incident.race_control",
      details: { input: { previousLeaderId: previousId ?? null }, result: next.id },
    });
  }
}

function deployRedFlag(state: GameState): void {
  const ordered = redFlagOrder(state);
  state.redFlagOrder = ordered.map((driver) => driver.id);
  const leaderProgress = Math.max(0, ordered[0]?.progress ?? 0);
  state.raceControl = "red_flag";
  state.raceControlPhase = "red_flag";
  state.pendingDecision = null;
  state.pendingContext = null;
  state.movement = null;
  state.plans = {};
  const distance = (state.sessionLaps ?? state.track.laps) * state.track.totalLength;
  if (distance - leaderProgress < state.track.totalLength) {
    addLog(state, "result", "红旗时剩余不足一圈，按红旗前最后完整行动顺序分类。", { code: "incident.race_control", details: { result: "red_flag_classification" } });
    finishGame(state);
    return;
  }
  // Start a compact double-file grid at each car's own lap, never promote
  // lapped cars or subtract a cell across a lap boundary.
  ordered.forEach((driver, index) => {
    const lapBase = Math.floor(Math.max(0, driver.progress) / state.track.totalLength) * state.track.totalLength;
    driver.progress = lapBase + Math.floor((ordered.length - 1 - index) / 2);
    driver.lane = index % 2 === 0 ? "left" : "right";
  });
  state.phase = "redFlag";
}

export function triggerIncidentControl(
  state: GameState,
  driverIds: string[],
  options: { severe?: boolean; multiVehicle?: boolean; reason: string; segmentId?: string },
): void {
  const drivers = driverIds.map((id) => state.drivers.find((driver) => driver.id === id)).filter((driver): driver is DriverState => Boolean(driver));
  const primary = drivers[0];
  const segment = options.segmentId
    ? state.track.segments.find((item) => item.id === options.segmentId)
    : primary ? getSegmentAtCell(state, Math.max(0, getCellIndex(state, primary)))?.segment : undefined;
  if (segment) state.yellowFlagSegmentId = segment.id;
  addLog(state, "incident", `${segment?.name ?? "事故区域"} 出示局部黄旗：${options.reason}。`, {
    code: "incident.yellow",
    details: { input: { segmentId: segment?.id ?? null, driverId: primary?.id ?? null, reason: options.reason }, result: "yellow" },
  });
  if (state.weatherMode !== "dynamic" && state.weekendMode !== "full") return;
  const retiredLanes = new Set(state.drivers.filter((driver) => driver.status === "dnf" && driver.retirementRound === state.round && segment && getSegmentAtCell(state, Math.max(0, getCellIndex(state, driver)))?.segment.id === segment.id).map((driver) => driver.lane));
  const blocked = retiredLanes.size >= 1;
  const severe = options.severe || drivers.some((driver) => driver.heavyDamage || driver.status === "dnf");
  const multiVehicle = options.multiVehicle ?? drivers.filter((driver) => driver.heavyDamage || driver.lightDamage > 0 || driver.status === "dnf").length >= 2;
  if (!severe && !blocked && !multiVehicle) return;
  const roll = rollD12(state);
  const total = roll + Number(severe) * 2 + Number(blocked) * 2 + Number(multiVehicle);
  const nextControl = total >= 12 ? "red_flag" : total >= 10 ? "sc" : total >= 8 ? "vsc" : "green";
  addLog(state, "roll", `事故级别检定：D12(${roll}) + 严重事故(${severe ? 2 : 0}) + 赛道阻挡(${blocked ? 2 : 0}) + 多车事故(${multiVehicle ? 1 : 0}) = ${total}。`, {
    code: "incident.race_control",
    details: { input: { segmentId: segment?.id ?? null, severe: Boolean(severe), blocked, multiVehicle }, dice: [roll], modifiers: { severe: severe ? 2 : 0, blocked: blocked ? 2 : 0, multiVehicle: multiVehicle ? 1 : 0 }, result: nextControl === "green" ? "local_yellow" : nextControl },
  });
  if (nextControl === "green" || controlPriority(nextControl) <= controlPriority(state.raceControl)) return;
  const startedRound = isNeutralized(state) ? state.raceControlStartedRound ?? state.round : state.round;
  const endsAfterRound = startedRound + RACE_RULES.neutralization.maxRounds - 1;
  if (state.movement) state.movement.remainingMp = 0;
  if (nextControl === "vsc") {
    state.raceControl = "vsc";
    state.raceControlPhase = "vsc";
    state.raceControlStartedRound = startedRound;
    state.raceControlEndsAfterRound = endsAfterRound;
    applySafetyCarTalent(state);
    addLog(state, "incident", `VSC 已部署：基础 MP 固定为 5，禁止超车；最迟 R${endsAfterRound} 结束时恢复绿旗。`, { code: "incident.race_control", details: { result: "vsc_deployed" } });
  } else if (nextControl === "sc") {
    state.raceControl = "sc";
    state.raceControlPhase = "sc_deployment";
    state.raceControlStartedRound = startedRound;
    state.raceControlEndsAfterRound = endsAfterRound;
    state.safetyCarLeaderId = redFlagOrder(state)[0]?.id;
    applySafetyCarTalent(state);
    addLog(state, "incident", `SC 已部署：基础 MP 固定为 5，禁止超车；最迟 R${endsAfterRound} 结束时有限收拢车距并恢复绿旗。`, { code: "incident.race_control", details: { result: "sc_deployed" } });
  } else {
    addLog(state, "incident", "红旗：当前回合立即停止，车辆按最后完整行动后的顺序重新排列。", { code: "incident.race_control", details: { result: "red_flag" } });
    deployRedFlag(state);
  }
}

function recordTrackLimit(state: GameState, driver: DriverState, reason: string): void {
  driver.trackLimitWarnings = (driver.trackLimitWarnings ?? 0) + 1;
  raceStats(driver).trackLimitWarnings = driver.trackLimitWarnings;
  const count = driver.trackLimitWarnings;
  const metadata = { code: "penalty.track_limit" as const, details: { input: { driverId: driver.id, reason, count }, result: count < 3 ? "recorded" : count === 3 ? "warning" : count === 4 ? "time_20" : "time_5" } };
  if (count < RACE_RULES.trackLimits.formalWarning) {
    addLog(state, "incident", `${driver.profile.name} 因${reason}越过赛道边界：第 ${count} 次，记录但不处罚。`, metadata);
  } else if (count === RACE_RULES.trackLimits.formalWarning) {
    addLog(state, "incident", `${driver.profile.name} 因${reason}第 3 次越界，收到正式警告。`, metadata);
  } else if (count === RACE_RULES.trackLimits.twentySecondPenalty) {
    addTimePenalty(driver, 20);
    addLog(state, "incident", `${driver.profile.name} 第 4 次越界，罚时 20 秒，赛后按完赛快照退 10 格。`, metadata);
  } else {
    addTimePenalty(driver, 5);
    addLog(state, "incident", `${driver.profile.name} 第 ${count} 次越界，追加罚时 5 秒，赛后按完赛快照退 2 格。`, metadata);
  }
}

function resolveWetGrip(state: GameState, driver: DriverState, segment: TrackSegment): boolean {
  if (!isRain(state.weather)) return true;
  const slick = driver.tire === "hard" || driver.tire === "medium" || driver.tire === "soft";
  const intermediateInHeavyRain = state.weather === "heavy_rain" && driver.tire === "intermediate";
  if (!slick && !intermediateInHeavyRain) return true;
  const check = rollIncidentDie(state, driver, "雨地抓地");
  const roll = check.roll;
  const rainBonus = rainGripBonus(state, driver);
  const correlation = consumeCorrelationPenalty(state, driver, "mech");
  const total = roll + driver.profile.stats.mech + rainBonus + correlation;
  const threshold = state.weather === "heavy_rain" && slick ? RACE_RULES.wetGrip.heavyRainSlick.success : RACE_RULES.wetGrip.lightRainSlick.success;
  addLog(state, "roll", `${driver.profile.name} 雨地抓地：D12(${roll}) + MECH(${driver.profile.stats.mech}) + 雨战(${rainBonus}) + 相关性(${correlation}) = ${total}，目标 ${threshold}。`, { code: "dice.grip", details: { input: { driverId: driver.id, weather: state.weather ?? null, tire: driver.tire, threshold }, dice: [roll], modifiers: { mech: driver.profile.stats.mech, rainMaster: rainBonus, correlation }, result: String(total) } });
  if (check.criticalFailure) {
    state.movement!.remainingMp = 0;
    markDnf(state, driver, "雨地抓地双 1 大失败", false);
    triggerIncidentControl(state, [driver.id], { reason: "雨地抓地大失败", severe: true, segmentId: segment.id });
    return false;
  }
  if (state.weather === "light_rain") {
    if (total >= RACE_RULES.wetGrip.lightRainSlick.success) return true;
    if (total >= RACE_RULES.wetGrip.lightRainSlick.marginal) {
      addWear(state, driver, 1, "小雨中使用光头胎");
      state.movement!.remainingMp = Math.max(0, state.movement!.remainingMp - 1);
      addLog(state, "incident", `${driver.profile.name} 小雨抓地勉强，剩余 MP -1。`);
      return driver.status === "racing" && state.movement!.remainingMp > 0;
    }
    state.movement!.remainingMp = 0;
    applyLightDamage(state, driver, "小雨失控");
    recordTrackLimit(state, driver, "小雨失控");
    triggerIncidentControl(state, [driver.id], { reason: "小雨失控", severe: driver.heavyDamage || driver.status === "dnf", segmentId: segment.id });
    return false;
  }
  if (slick) {
    if (total >= RACE_RULES.wetGrip.heavyRainSlick.success) {
      addWear(state, driver, 1, "大雨中使用光头胎");
      return driver.status === "racing";
    }
    addWear(state, driver, 2, "大雨中使用光头胎");
    state.movement!.remainingMp = 0;
    if (total <= RACE_RULES.wetGrip.heavyRainSlick.failure && driver.status === "racing") {
      applyLightDamage(state, driver, "大雨失控");
      recordTrackLimit(state, driver, "大雨失控");
      triggerIncidentControl(state, [driver.id], { reason: "大雨失控", severe: driver.heavyDamage || Boolean(driver.dnfReason), segmentId: segment.id });
    } else addLog(state, "incident", `${driver.profile.name} 大雨抓地勉强，本次行动剩余 MP 归零。`);
    return false;
  }
  addWear(state, driver, 1, "大雨中使用半雨胎");
  if (total >= RACE_RULES.wetGrip.heavyRainIntermediate.success) return driver.status === "racing";
  state.movement!.remainingMp = 0;
  if (total <= RACE_RULES.wetGrip.heavyRainIntermediate.failure && driver.status === "racing") {
    applyLightDamage(state, driver, "大雨半雨胎失控");
    recordTrackLimit(state, driver, "大雨半雨胎失控");
    triggerIncidentControl(state, [driver.id], { reason: "大雨半雨胎失控", severe: driver.heavyDamage || Boolean(driver.dnfReason), segmentId: segment.id });
  } else addLog(state, "incident", `${driver.profile.name} 使用半雨胎时抓地勉强，本次行动剩余 MP 归零。`);
  return false;
}

export function rainGripBonus(state: GameState, driver: DriverState): number {
  if (driver.profile.talent !== "rain_master") return 0;
  const base = RACE_RULES.wetGrip.rainMasterBonus;
  const rank = talentUpgradeRank(driver.profile.career?.level ?? 1);
  const levelSixBonus = rank >= 1 ? 1 : 0;
  if (state.weatherMode !== "dynamic" || rank < 2) return base + levelSixBonus;
  const latest = state.weatherHistory?.[state.weatherHistory.length - 1];
  const dryBefore = latest?.from === "sunny" || latest?.from === "cloudy";
  const wetAfter = latest?.to === "light_rain" || latest?.to === "heavy_rain";
  const firstWetRound = latest?.round === state.round - 1;
  return base + levelSixBonus + (dryBefore && wetAfter && firstWetRound ? 2 : 0);
}

function applyLightDamage(state: GameState, driver: DriverState, reason: string): void {
  const uses = careerUses(driver);
  const preparationShield = state.raceSession === "race" ? driver.profile.career?.pendingPreparation?.lightDamageShield ?? 0 : 0;
  const ignoreLimit = Number(hasMinorTalent(driver.profile, "durability")) + Number(hasTalentNode(driver.profile, "TE-3")) + preparationShield;
  const ignoresUsed = uses.lightDamageIgnoresUsed ?? Number(uses.lightDamageIgnored);
  if (ignoresUsed < ignoreLimit) {
    uses.lightDamageIgnoresUsed = ignoresUsed + 1;
    uses.lightDamageIgnored = true;
    addLog(state, "resource", `${driver.profile.name} 的耐久保护抵消了本场第 ${ignoresUsed + 1} 次轻损伤。`);
    return;
  }
  if (driver.profile.talent === "late_braker" && reason === "晚刹失败") {
    driver.brakeHeat = Math.min(4, driver.brakeHeat + 1);
    addLog(state, "incident", `${driver.profile.name} 的晚刹高手将轻损伤改为刹车热 +1。`);
    return;
  }
  if (driver.heavyDamage) {
    markDnf(state, driver, `重损伤后再次受损（${reason}）`, false);
    return;
  }
  driver.lightDamage += 1;
  addLog(state, "incident", `${driver.profile.name} 因${reason}获得 1 枚轻损伤。`);
}

function applyCornerChoice(
  state: GameState,
  driver: DriverState,
  segment: TrackSegment,
  choice: "normal" | "ideal" | "late_brake" | "stop",
  useToken = false,
): string | null {
  const runtime = state.movement!;
  const options = cornerOptions(state, driver, segment);
  const currentSegment = getSegmentAtCell(state, getCellIndex(state, driver))?.segment;
  const entering = currentSegment?.id !== segment.id;
  if (choice === "stop") {
    runtime.remainingMp = 0;
    addLog(state, "move", `${driver.profile.name} 停在 ${segment.name} 入口前。`);
    return null;
  }
  if (choice === "ideal" && !options.canIdeal) return `当前不能使用理想线：${options.idealReason ?? "条件不满足"}`;
  if (choice === "normal" && !options.canNormal) return "MP 不足，不能正常支付弯角值";
  if (choice === "late_brake" && (state.yellowFlagSegmentId === segment.id || isNeutralized(state))) return "黄旗或赛事控制期间不能尝试晚刹";
  if (entering && !resolveWetGrip(state, driver, segment)) return null;
  if (driver.status !== "racing") return null;
  const refreshedMp = runtime.remainingMp;
  const requiredAfterGrip = choice === "ideal" ? Math.max(0, options.baseCost - 2) + 1 : options.baseCost + 1;
  if ((choice === "normal" || choice === "ideal") && refreshedMp < requiredAfterGrip) {
    runtime.remainingMp = 0;
    addLog(state, "move", `${driver.profile.name} 在雨地抓地修正后不足以支付入弯所需 ${requiredAfterGrip} MP，停在 ${segment.name} 入口前。`);
    return null;
  }
  let cost = options.baseCost;
  if (choice === "ideal") {
    cost = Math.max(0, cost - 2);
    driver.lane = "left";
    raceStats(driver).idealLines += 1;
  } else if (choice === "normal") {
    driver.lane = "right";
  } else {
    raceStats(driver).lateBrakes += 1;
    let successfulLateBrake = false;
    if (!options.canLateBrake) return "只有 MP 不足时才能晚刹";
    if (useToken && driver.tactical.lateBrake <= 0) return "没有晚刹标记";
    if (useToken && state.plans[driver.id]?.talentAction === "segment_plan") return "赛段规划回合不能使用晚刹标记";
    const uses = careerUses(driver);
    const extreme = consumeDeclaredAction(state, driver, "extreme_late_brake");
    const check = extreme ? { roll: rollD12(state), criticalFailure: false } : rollIncidentDie(state, driver, "晚刹");
    const roll = check.roll;
    const brakePenalty = extreme ? 0 : Math.ceil(driver.brakeHeat / 2);
    const brakeDepartment = consumeFacilityUse(driver, "brake_department", 2) ? 1 : 0;
    const preparationBonus = state.raceSession === "race" && !uses.preparationLateBrakeUsed ? driver.profile.career?.pendingPreparation?.lateBrakeBonus ?? 0 : 0;
    if (preparationBonus) uses.preparationLateBrakeUsed = true;
    const talent = (driver.profile.talent === "late_braker" ? 2 : 0) + (hasTalentNode(driver.profile, "RC-1") ? 1 : 0) + brakeDepartment + preparationBonus;
    const token = useToken ? 2 : 0;
    const suspensionModifier = weekendSetupFor(state, driver).suspension === "soft" ? -1 : weekendSetupFor(state, driver).suspension === "stiff" ? 1 : 0;
    const correlation = consumeCorrelationPenalty(state, driver, "brk");
    const total = roll + driver.profile.stats.brk - brakePenalty + talent + token + suspensionModifier + correlation;
    if (useToken) {
      driver.tactical.lateBrake -= 1;
      if (uses.safeLateBrakeTokens > 0) uses.safeLateBrakeTokens -= 1;
      else driver.brakeHeat = Math.min(4, driver.brakeHeat + 1);
    }
    addLog(
      state,
      "roll",
      `${driver.profile.name} 晚刹：D12(${roll}) + BRK(${driver.profile.stats.brk}) - 刹车热(${brakePenalty}) + 修正(${talent + token}) + 悬挂(${suspensionModifier}) + 相关性(${correlation}) = ${total}`,
      { code: "dice.late_brake", details: { input: { driverId: driver.id, segmentId: segment.id, useToken }, dice: [roll], modifiers: { brk: driver.profile.stats.brk, brakeHeat: -brakePenalty, talent, token, suspension: suspensionModifier, correlation }, result: String(total) } },
    );
    if (brakeDepartment) addLog(state, "resource", `${driver.profile.name} 获得制动部门检定 +1。`);
    if (preparationBonus) addLog(state, "resource", `${driver.profile.name} 使用模拟器复盘加值，晚刹检定 +${preparationBonus}。`);
    if (check.criticalFailure) {
      runtime.remainingMp = 0;
      markDnf(state, driver, "晚刹双 1 大失败", false);
      triggerIncidentControl(state, [driver.id], { reason: "晚刹大失败", severe: true, segmentId: segment.id });
      return null;
    }
    if (extreme) {
      cost = 0;
      successfulLateBrake = true;
      addLog(state, "resource", `${driver.profile.name} 使用极限晚刹：忽略刹车热并视为成功。`);
    } else if (total >= RACE_RULES.lateBrake.success) {
      cost = 0;
      successfulLateBrake = true;
    }
    else if (total >= RACE_RULES.lateBrake.marginal) {
      if (driver.profile.talent === "late_braker" && talentUpgradeRank(driver.profile.career?.level ?? 1) >= 2 && !uses.marginalUpgradeUsed) {
        uses.marginalUpgradeUsed = true;
        cost = 0;
        successfulLateBrake = true;
        addLog(state, "resource", `${driver.profile.name} 将本场一次勉强晚刹改判为成功。`);
      } else {
      cost = Math.max(0, cost - 2);
      driver.brakeHeat = Math.min(4, driver.brakeHeat + 1);
      addWear(state, driver, 1, "勉强晚刹");
      if (driver.status !== "racing") return null;
      if (runtime.remainingMp < cost + 1) {
        runtime.remainingMp = 0;
        recordTrackLimit(state, driver, "晚刹锁死");
        applyLightDamage(state, driver, "晚刹失败");
        triggerIncidentControl(state, [driver.id], { reason: "晚刹锁死", severe: driver.heavyDamage || Boolean(driver.dnfReason), segmentId: segment.id });
        return null;
      }
      }
    } else {
      if (hasTalentNode(driver.profile, "RC-1") && !uses.brakePointRecoveryUsed) {
        uses.brakePointRecoveryUsed = true;
        cost = Math.max(0, cost - 2);
        driver.brakeHeat = Math.min(4, driver.brakeHeat + 1);
        addWear(state, driver, 1, "勉强晚刹");
        if (driver.status !== "racing") return null;
        addLog(state, "resource", `${driver.profile.name} 使用刹车点读秒，将失败晚刹改为勉强。`);
        if (runtime.remainingMp < cost + 1) {
          runtime.remainingMp = 0;
          recordTrackLimit(state, driver, "晚刹锁死");
          applyLightDamage(state, driver, "晚刹失败");
          triggerIncidentControl(state, [driver.id], { reason: "晚刹锁死", severe: driver.heavyDamage || Boolean(driver.dnfReason), segmentId: segment.id });
          return null;
        }
      } else {
        runtime.remainingMp = 0;
        recordTrackLimit(state, driver, "晚刹锁死");
        applyLightDamage(state, driver, "晚刹失败");
        triggerIncidentControl(state, [driver.id], { reason: "晚刹锁死", severe: driver.heavyDamage || Boolean(driver.dnfReason), segmentId: segment.id });
        return null;
      }
    }
    if (successfulLateBrake) raceStats(driver).lateBrakeSuccesses = (raceStats(driver).lateBrakeSuccesses ?? 0) + 1;
  }
  recordPeaks(driver);
  runtime.remainingMp -= cost;
  runtime.paidCornerIds.push(segment.id);
  if (entering) {
    if (state.plans[driver.id]?.mode === "attack") driver.brakeHeat = Math.min(4, driver.brakeHeat + 1);
    if ((segment.cornerCost ?? 0) >= 2) {
      let cornerWear = tireCornerWear(driver, state.weather);
      const suspension = weekendSetupFor(state, driver).suspension;
      const uses = careerUses(driver);
      if (suspension === "soft" && uses.firstCornerSetupRound !== state.round) {
        cornerWear = Math.max(0, cornerWear - 1);
        uses.firstCornerSetupRound = state.round;
      } else if (suspension === "stiff") cornerWear += 1;
      if (cornerWear > 0 && consumeFacilityUse(driver, "mechanical_department", 1)) {
        cornerWear -= 1;
        addLog(state, "resource", `${driver.profile.name} 的机械部门将本次过弯磨损降低 1。`);
      }
      addWear(state, driver, cornerWear, `${segment.name}过弯`);
      if (driver.status !== "racing") return null;
    }
  }
  addLog(state, "move", `${driver.profile.name} 支付 ${cost} MP 进入 ${segment.name}，走${driver.lane === "left" ? "内线" : "外线"}。`);
  return null;
}

function aiCornerChoice(state: GameState, driver: DriverState, segment: TrackSegment): void {
  const options = cornerOptions(state, driver, segment);
  const choice = options.canIdeal ? "ideal" : options.canNormal ? "normal" : options.canLateBrake ? "late_brake" : "stop";
  const useToken = choice === "late_brake" && driver.tactical.lateBrake > 0 && state.plans[driver.id]?.talentAction !== "segment_plan";
  const explanation = choice === "ideal"
    ? "弯中无车且 AERO 足够，选择理想线"
    : choice === "normal"
      ? "MP 足够，支付正常弯角值"
      : choice === "late_brake"
        ? `MP 不足，尝试晚刹${useToken ? "并使用标记" : ""}`
        : `无法合法晚刹（${options.lateBrakeReason ?? "剩余 MP 不足"}），停在弯前`;
  addLog(state, "info", `${driver.profile.name} 线路决策：${explanation}。`, {
    code: "ai.decision",
    details: { input: { driverId: driver.id, segmentId: segment.id, remainingMp: options.remainingMp }, result: choice },
  });
  const error = applyCornerChoice(state, driver, segment, choice, useToken);
  if (error) {
    state.movement!.remainingMp = 0;
    addLog(state, "incident", `${driver.profile.name} 的线路选择无法执行（${error}），本次行动安全结束。`, {
      code: "ai.decision",
      details: { input: { driverId: driver.id, segmentId: segment.id, choice }, result: "action_ended" },
    });
  }
}

function alternativeLane(lane: Lane): Lane {
  return lane === "left" ? "right" : "left";
}

function hasFreeDefense(state: GameState, defender: DriverState): boolean {
  if (defender.profile.talent !== "wide_train") return false;
  const usedThisRound = state.movement!.freeDefenseUsed.filter((id) => id === defender.id).length;
  return usedThisRound === 0 || (usedThisRound === 1 && talentUpgradeRank(defender.profile.career?.level ?? 1) >= 2 && !defender.careerUses?.extraFreeDefenseUsed);
}

function laneFreeAtCell(state: GameState, cell: number, lane: Lane, excluding: string[]): boolean {
  return !activeDrivers(state).some(
    (driver) => !excluding.includes(driver.id) && !driver.pit && getCellIndex(state, driver) === cell && driver.lane === lane,
  );
}

function overtakeLandingLane(state: GameState, attacker: DriverState, defender: DriverState): Lane | undefined {
  const progress = defender.progress + 1;
  const cell = progress < 0 ? progress : progress % state.track.totalLength;
  return [alternativeLane(defender.lane), defender.lane].find(lane =>
    laneFreeAtCell(state, cell, lane, [attacker.id, defender.id]));
}

function stopBlockedOvertake(state: GameState, attacker: DriverState, defender: DriverState): boolean {
  const lane = alternativeLane(defender.lane);
  const passingCell = getCellIndex(state, defender);
  const passingBlocked = !laneFreeAtCell(state, passingCell, lane, [attacker.id, defender.id]);
  // A single car at the landing cell leaves its other lane available.
  if (!passingBlocked && overtakeLandingLane(state, attacker, defender) !== undefined) return false;
  const progress = defender.progress + 1;
  const blockedCell = passingBlocked ? passingCell : progress < 0 ? progress : progress % state.track.totalLength;
  const blocker = activeDrivers(state).find(driver => driver.id !== attacker.id && driver.id !== defender.id
    && !driver.pit && getCellIndex(state, driver) === blockedCell && (!passingBlocked || driver.lane === lane))!;
  state.movement!.remainingMp = 0;
  addLog(state, "move", `${attacker.profile.name} 无法超越 ${defender.profile.name}：${passingBlocked ? "通过格" : "落点格"}两条线路均被占用，保持原位并结束本次行动。`, {
    code: "movement.step", details: { input: { attackerId: attacker.id, defenderId: defender.id, blockerId: blocker.id,
      cell: blockedCell, lane: blocker.lane }, result: "blocked_overtake" },
  });
  return true;
}

function lappedCarImmediatelyAhead(state: GameState, leader: DriverState): DriverState | undefined {
  if (leader.progress < 0) return undefined;
  const targetCell = (getCellIndex(state, leader) + 1) % state.track.totalLength;
  return activeDrivers(state)
    .filter((driver) => driver.id !== leader.id && !driver.pit && Math.floor(leader.progress / state.track.totalLength) - Math.floor(driver.progress / state.track.totalLength) >= RACE_RULES.blueFlag.lapGap && getCellIndex(state, driver) === targetCell)
    .sort((a, b) => b.progress - a.progress || a.qualifyingRank - b.qualifyingRank)[0];
}

function leaderWaitingBehind(state: GameState, backmarker: DriverState): DriverState | undefined {
  if (backmarker.progress < 0) return undefined;
  const behindCell = (getCellIndex(state, backmarker) - 1 + state.track.totalLength) % state.track.totalLength;
  return activeDrivers(state)
    .filter((driver) => driver.id !== backmarker.id && !driver.pit && Math.floor(driver.progress / state.track.totalLength) - Math.floor(backmarker.progress / state.track.totalLength) >= RACE_RULES.blueFlag.lapGap && getCellIndex(state, driver) === behindCell)
    .sort((a, b) => b.progress - a.progress || a.qualifyingRank - b.qualifyingRank)[0];
}

function aiDefenseChoice(
  state: GameState,
  defender: DriverState,
  attacker?: DriverState,
): { stat: "aero" | "brk"; choice: DefenseChoice } {
  const stat = defender.profile.stats.aero >= defender.profile.stats.brk ? "aero" : "brk";
  const free = hasFreeDefense(state, defender);
  if (free) {
    addLog(state, "info", `${defender.profile.name} 防守决策：使用最高属性 ${stat.toUpperCase()}，并使用免费防守。`, { code: "ai.decision", details: { input: { driverId: defender.id, stat }, result: "free_bonus" } });
    return { stat, choice: "bonus" };
  }
  const attackStrength = attacker ? Math.max(attacker.profile.stats.eng, attacker.profile.stats.mech) + (attacker.profile.talent === "overtake_maniac" ? 2 : 0) : Number.POSITIVE_INFINITY;
  const tokenNeeded = defender.profile.stats[stat] <= attackStrength + 1;
  if (defender.tactical.defense > 0 && tokenNeeded) {
    addLog(state, "info", `${defender.profile.name} 防守决策：使用最高属性 ${stat.toUpperCase()}，成功率不足时投入防守标记。`, { code: "ai.decision", details: { input: { driverId: defender.id, stat }, result: "token_bonus" } });
    return { stat, choice: "bonus" };
  }
  addLog(state, "info", `${defender.profile.name} 防守决策：使用最高属性 ${stat.toUpperCase()}，${defender.tactical.defense > 0 ? "基础优势足够，保留防守标记" : "无可用标记"}。`, { code: "ai.decision", details: { input: { driverId: defender.id, stat }, result: defender.tactical.defense > 0 ? "save_token" : "no_token" } });
  return { stat, choice: "none" };
}

function shouldContest(state: GameState, attacker: DriverState, defender: DriverState): boolean {
  const nextLocation = getSegmentAtCell(state, (attacker.progress + 1 + state.track.totalLength) % state.track.totalLength);
  const free = hasFreeDefense(state, defender);
  return nextLocation?.segment.type === "corner" || attacker.lane === defender.lane || defender.tactical.defense > 0 || free || (state.round === 1 && hasMinorTalent(defender.profile, "launch_rocket"));
}

function yellowFlagBlocksOvertake(state: GameState, attacker: DriverState, defender: DriverState): boolean {
  if (isNeutralized(state)) return true;
  const flaggedSegment = state.yellowFlagSegmentId;
  if (!flaggedSegment) return false;
  const relevantProgress = [attacker.progress, defender.progress, defender.progress + 1];
  return relevantProgress.some((progress) => {
    if (progress < 0) return false;
    const cell = progress % state.track.totalLength;
    return getSegmentAtCell(state, cell)?.segment.id === flaggedSegment;
  });
}

function resolveContact(state: GameState, attacker: DriverState, defender: DriverState): void {
  raceStats(attacker).contacts += 1;
  raceStats(defender).contacts += 1;
  let attackDie = 0;
  let defenseDie = 0;
  let attackRoll = 0;
  let defenseRoll = 0;
  let attackerCritical = false;
  let defenderCritical = false;
  const attackerCorrelation = consumeCorrelationPenalty(state, attacker, "rel");
  const defenderCorrelation = consumeCorrelationPenalty(state, defender, "rel");
  do {
    const attackCheck = rollIncidentDie(state, attacker, "接触 REL");
    const defenseCheck = rollIncidentDie(state, defender, "接触 REL");
    attackDie = attackCheck.roll;
    defenseDie = defenseCheck.roll;
    attackerCritical = attackCheck.criticalFailure;
    defenderCritical = defenseCheck.criticalFailure;
    attackRoll = attackDie + Math.max(0, attacker.profile.stats.rel - attacker.reliabilityPenalty + attackerCorrelation) + (hasTalentNode(attacker.profile, "RC-2") ? 1 : 0);
    defenseRoll = defenseDie + Math.max(0, defender.profile.stats.rel - defender.reliabilityPenalty + defenderCorrelation) + (hasTalentNode(defender.profile, "RC-2") ? 1 : 0);
  } while (!attackerCritical && !defenderCritical && attackRoll === defenseRoll);
  const loser = attackerCritical ? attacker : defenderCritical ? defender : attackRoll < defenseRoll ? attacker : defender;
  const winner = loser.id === attacker.id ? defender : attacker;
  const difference = Math.abs(attackRoll - defenseRoll);
  addLog(state, "roll", `接触 REL 检定：${attacker.profile.name} D12(${attackDie}) + 有效REL(${Math.max(0, attacker.profile.stats.rel - attacker.reliabilityPenalty + attackerCorrelation)}) + RC-2(${hasTalentNode(attacker.profile, "RC-2") ? 1 : 0}) = ${attackRoll}；${defender.profile.name} D12(${defenseDie}) + 有效REL(${Math.max(0, defender.profile.stats.rel - defender.reliabilityPenalty + defenderCorrelation)}) + RC-2(${hasTalentNode(defender.profile, "RC-2") ? 1 : 0}) = ${defenseRoll}。`, { code: "dice.contact", details: { input: { attackerId: attacker.id, defenderId: defender.id }, dice: [attackDie, defenseDie], modifiers: { attackerRel: Math.max(0, attacker.profile.stats.rel - attacker.reliabilityPenalty + attackerCorrelation), defenderRel: Math.max(0, defender.profile.stats.rel - defender.reliabilityPenalty + defenderCorrelation), attackerCorrelation, defenderCorrelation }, result: loser.id } });
  if (attacker.profile.teamId && attacker.profile.teamId === defender.profile.teamId && (attacker.isHuman || attacker.isTeammate || defender.isHuman || defender.isTeammate)) {
    state.teammateRelationshipDelta = (state.teammateRelationshipDelta ?? 0) - 1;
    addLog(state, "incident", "同队车辆发生接触，队友关系在赛后降低 1。", { code: "team.order", details: { input: { attackerId: attacker.id, defenderId: defender.id }, result: "relationship_minus_1" } });
  }
  if (attackerCritical || defenderCritical) {
    if (attackerCritical) markDnf(state, attacker, "接触 REL 双 1 大失败", false);
    if (defenderCritical) markDnf(state, defender, "接触 REL 双 1 大失败", false);
  } else if (loser.heavyDamage) {
    markDnf(state, loser, "重损伤后再次发生接触", false);
  } else if (difference >= RACE_RULES.contact.heavyDamageMargin && loser.lightDamage > 0) {
    loser.heavyDamage = true;
    raceStats(loser).heavyDamageEvents = (raceStats(loser).heavyDamageEvents ?? 0) + 1;
    addLog(state, "incident", `${loser.profile.name} 的既有轻损伤升级为重损伤，持续 -2 MP。`);
  } else {
    applyLightDamage(state, loser, "轮对轮接触");
  }
  addLog(state, "incident", `${attacker.profile.name} 与 ${defender.profile.name} 发生轮对轮接触。`, {
    code: "incident.contact", details: { input: { attackerId: attacker.id, defenderId: defender.id,
      affectedDriverId: loser.id, damage: loser.status === "dnf" ? "dnf" : loser.heavyDamage ? "heavy" : loser.lightDamage > 0 ? "light" : "clear" }, result: "contact" },
  });
  // Record the ticket before race control can end a final-lap race under a red flag.
  if (winner.status !== "dnf") {
    const penaltyDie = rollD12(state);
    const scrutiny = winner.burdens.includes("scrutiny") ? -1 : 0;
    const penaltyRoll = penaltyDie + scrutiny;
    addLog(state, "roll", `${winner.profile.name} 赛会判罚：D12(${penaltyDie}) + 监管盯防(${scrutiny}) = ${penaltyRoll}。`, { code: "dice.penalty", details: { input: { driverId: winner.id }, dice: [penaltyDie], modifiers: { scrutiny }, result: String(penaltyRoll) } });
    if (penaltyRoll <= RACE_RULES.penalty.twentySecondMaximum) {
      addTimePenalty(winner, 20);
      addLog(state, "incident", `${winner.profile.name} 判罚骰为 ${penaltyRoll}，罚时 20 秒，赛后按完赛快照退 10 格。`, { code: "penalty.time", details: { input: { driverId: winner.id, seconds: 20, cells: 10 }, result: "time_20" } });
    } else if (penaltyRoll <= RACE_RULES.penalty.fiveSecondMaximum) {
      addTimePenalty(winner, 5);
      addLog(state, "incident", `${winner.profile.name} 判罚骰为 ${penaltyRoll}，罚时 5 秒，赛后按完赛快照退 2 格。`, { code: "penalty.time", details: { input: { driverId: winner.id, seconds: 5, cells: 2 }, result: "time_5" } });
    } else addLog(state, "roll", `${winner.profile.name} 判罚骰为 ${penaltyRoll}，无处罚。`);
  }
  const segment = getSegmentAtCell(state, Math.max(0, attacker.progress) % state.track.totalLength)?.segment;
  triggerIncidentControl(state, [attacker.id, defender.id], {
    reason: "轮对轮接触",
    severe: loser.heavyDamage || loser.status === "dnf",
    multiVehicle: [attacker, defender].filter((driver) => driver.heavyDamage || driver.lightDamage > 0 || driver.status === "dnf").length >= 2,
    segmentId: segment?.id,
  });
}

function completePass(
  state: GameState,
  attacker: DriverState,
  defender: DriverState,
  extraCost = 0,
  exitTraction = false,
  passMode: "duel" | "uncontested" = "duel",
): boolean {
  const runtime = state.movement!;
  if (stopBlockedOvertake(state, attacker, defender)) return false;
  const actionLap = Math.floor(Math.max(0, attacker.progress) / state.track.totalLength) + 1;
  const cost = 2 + extraCost;
  if (runtime.remainingMp < cost) {
    attacker.lane = alternativeLane(defender.lane);
    if (runtime.remainingMp > 0) {
      const previousProgress = attacker.progress;
      attacker.progress = defender.progress;
      recordLapCompletion(state, attacker, previousProgress);
      runtime.remainingMp = 0;
    }
    addLog(state, "move", `${attacker.profile.name} MP 不足以完成超车，与 ${defender.profile.name} 并列后停下。`);
    return false;
  }
  runtime.remainingMp -= cost;
  const previousProgress = attacker.progress;
  const landingLane = overtakeLandingLane(state, attacker, defender)!;
  attacker.progress = defender.progress + 1;
  recordLapCompletion(state, attacker, previousProgress);
  attacker.lane = landingLane;
  raceStats(attacker).overtakes += 1;
  raceStats(defender).timesOvertaken += 1;
  const uses = careerUses(attacker);
  if (exitTraction) {
    runtime.remainingMp += 1;
    addLog(state, "resource", `${attacker.profile.name} 通过出弯牵引恢复 1 MP。`);
  }
  if (hasTalentNode(attacker.profile, "RC-5") && uses.lastSuccessfulDefenseLap === actionLap && !uses.racecraftBonusAwarded) {
    uses.racecraftBonusAwarded = true;
    attacker.bonusPoints = (attacker.bonusPoints ?? 0) + 5;
    addLog(state, "resource", `${attacker.profile.name} 完成攻防切换，获得 5 本地分。`);
  }
  addLog(state, "move", `${attacker.profile.name} 花费 ${cost} MP 完成对 ${defender.profile.name} 的超车${passMode === "uncontested" ? "（直道异线，前车无可用防守，免对抗）" : "（超车对抗通过）"}。`, {code:"movement.step",details:{input:{attackerId:attacker.id,defenderId:defender.id,passMode,lap:Math.min(state.sessionLaps??state.track.laps,Math.floor(attacker.progress/state.track.totalLength)+1)},result:"overtake"}});
  return true;
}

function resolveContest(
  state: GameState,
  attacker: DriverState,
  defender: DriverState,
  attackStat: "eng" | "mech",
  defenseStat: "aero" | "brk",
  defenseChoice: DefenseChoice,
): void {
  if (stopBlockedOvertake(state, attacker, defender)) return;
  raceStats(attacker).attacks += 1;
  const attackerUses = careerUses(attacker);
  const defenderUses = careerUses(defender);
  let defenseBonus = 0;
  let freeDefenseTalentBonus = 0;
  let extraCost = 0;
  const runtime = state.movement!;
  if (defenseChoice !== "none") {
    const hasFree = hasFreeDefense(state, defender);
    if (hasFree) {
      if (runtime.freeDefenseUsed.includes(defender.id)) {
        defenderUses.extraFreeDefenseUsed = true;
        addLog(state, "resource", `${defender.profile.name} 使用本场额外一次免费防守。`);
      }
      runtime.freeDefenseUsed.push(defender.id);
    }
    else if (defender.tactical.defense > 0) defender.tactical.defense -= 1;
    if (hasFree && talentUpgradeRank(defender.profile.career?.level ?? 1) >= 1) freeDefenseTalentBonus = 1;
    if (defenseChoice === "bonus") defenseBonus = 2;
    else extraCost = 1;
  }
  const attackDie = rollD12(state);
  const defenseDie = rollD12(state);
  const attackLocation = getSegmentAtCell(state, getCellIndex(state, attacker));
  const outsideAttempt = attackLocation?.segment.type === "corner" && attacker.lane === "right";
  const cornerAttack = attackLocation?.segment.type === "corner" && hasMinorTalent(attacker.profile, "outside_specialist") ? 1 : 0;
  const cornerDefense = attackLocation?.segment.type === "corner" && hasMinorTalent(defender.profile, "outside_specialist") ? 1 : 0;
  const outsideAttack = attackLocation?.segment.type === "corner" && attacker.lane === "right" && hasTalentNode(attacker.profile, "RC-3") ? 1 : 0;
  const outsideDefense = attackLocation?.segment.type === "corner" && defender.lane === "right" && hasTalentNode(defender.profile, "RC-3") ? 1 : 0;
  const mechTraction = attackStat === "mech" && hasTalentNode(attacker.profile, "RC-4") ? 1 : 0;
  const mainTalentUpgrade = attacker.profile.talent === "overtake_maniac" ? talentUpgradeRank(attacker.profile.career?.level ?? 1) : 0;
  const attackLap = Math.floor(Math.max(0, attacker.progress) / state.track.totalLength) + 1;
  if (attackerUses.attackLap !== attackLap) {
    attackerUses.attackLap = attackLap;
    attackerUses.attacksThisLap = 0;
  }
  const secondAttack = attacker.profile.talent === "overtake_maniac" && mainTalentUpgrade >= 3 && attackerUses.attacksThisLap === 1 && !attackerUses.doubleAttackUsed ? 1 : 0;
  attackerUses.attacksThisLap = (attackerUses.attacksThisLap ?? 0) + 1;
  if (secondAttack) {
    attackerUses.doubleAttackUsed = true;
    addLog(state, "resource", `${attacker.profile.name} 在第 ${attackLap} 圈第二次进攻，使用本场二连击 +1。`);
  }
  const attackerExtreme = consumeDeclaredAction(state, attacker, "extreme_duel");
  const defenderExtreme = consumeDeclaredAction(state, defender, "extreme_duel");
  const attackerSpecialist = consumeDeclaredAction(state, attacker, "specialist_duel");
  const defenderSpecialist = consumeDeclaredAction(state, defender, "specialist_duel");
  const attackTalent = (attacker.profile.talent === "overtake_maniac" ? 2 : 0) + Math.min(1, mainTalentUpgrade) + outsideAttack + cornerAttack + mechTraction + secondAttack + (attackerExtreme || attackerSpecialist ? 2 : 0);
  const attackCorrelation = consumeCorrelationPenalty(state, attacker, attackStat);
  const attackRoll = attackDie + attacker.profile.stats[attackStat] + attackTalent + attackCorrelation;
  const windTunnel = defenseStat === "aero" && consumeFacilityUse(defender, "wind_tunnel", facilityLevel(defender, "wind_tunnel")) ? 1 : 0;
  const defenseCorrelation = consumeCorrelationPenalty(state, defender, defenseStat);
  const defenseRoll = defenseDie + defender.profile.stats[defenseStat] + defenseBonus + freeDefenseTalentBonus + outsideDefense + cornerDefense + (defenderExtreme || defenderSpecialist ? 2 : 0) + windTunnel + defenseCorrelation;
  const delta = attackRoll - defenseRoll;
  const defenseLap = Math.floor(Math.max(0, defender.progress) / state.track.totalLength) + 1;
  if (defenderUses.defenseLap !== defenseLap) {
    defenderUses.defenseLap = defenseLap;
    defenderUses.consecutiveDefenses = 0;
  }
  if (delta > -2) defenderUses.consecutiveDefenses = 0;
  attackerUses.attacksThisRound += 1;
  addLog(
    state,
    "roll",
    `超车对抗：${attacker.profile.name} D12(${attackDie}) + ${attackStat.toUpperCase()}(${attacker.profile.stats[attackStat]}) + 天赋(${attackTalent}) = ${attackRoll}；${defender.profile.name} D12(${defenseDie}) + ${defenseStat.toUpperCase()}(${defender.profile.stats[defenseStat]}) + 防守(${defenseBonus}) + 免费防守升级(${freeDefenseTalentBonus}) + 外线(${outsideDefense}) + 弯中专精(${cornerDefense}) + 对决动作(${defenderExtreme || defenderSpecialist ? 2 : 0}) + 风洞(${windTunnel}) = ${defenseRoll}；差值 ${signed(delta)}。`,
    { code: "dice.duel", details: { input: { attackerId: attacker.id, defenderId: defender.id, attackStat, defenseStat }, dice: [attackDie, defenseDie], modifiers: { attackTalent, attackCorrelation, defenseBonus, defenseCorrelation, freeDefenseTalentBonus, outsideAttack, outsideDefense, cornerAttack, cornerDefense, windTunnel }, result: String(delta) } },
  );
  if (delta > RACE_RULES.contact.maximumCleanDelta) {
    const passed = completePass(state, attacker, defender, extraCost, outsideAttempt && hasTalentNode(attacker.profile, "RC-4"));
    if (defenderExtreme && passed) resolveContact(state, attacker, defender);
    if (passed && attacker.status === "racing") checkFinish(state, attacker);
  }
  else if (delta < -RACE_RULES.contact.maximumCleanDelta) {
    if (attackerExtreme || consumeDeclaredAction(state, attacker, "overtake_salvage")) {
      runtime.remainingMp = 0;
      addLog(state, "move", `${attacker.profile.name} 将失败的进攻转入接触判定。`);
      resolveContact(state, attacker, defender);
      return;
    }
    raceStats(defender).defensesWon += 1;
    defenderUses.defensesThisRound += 1;
    defenderUses.defendedThisRound = true;
    defenderUses.lastSuccessfulDefenseLap = Math.floor(Math.max(0, defender.progress) / state.track.totalLength) + 1;
    defenderUses.consecutiveDefenses = attacker.profile.talent === "overtake_maniac" ? 0 : (defenderUses.consecutiveDefenses ?? 0) + 1;
    if (defender.profile.talent === "wide_train" && talentUpgradeRank(defender.profile.career?.level ?? 1) >= 3 && defenderUses.consecutiveDefenses === 2 && defenderUses.lastDefenseRewardLap !== defenseLap && defenderUses.defenseRewardLap !== defenseLap) {
      defenderUses.defenseRewardLap = defenseLap;
      addLog(state, "resource", `${defender.profile.name} 第 ${defenseLap} 圈连续成功防守两次，本圈完成时恢复 1 ERS。`);
    }
    runtime.remainingMp = Math.max(0, runtime.remainingMp - 2);
    attacker.progress -= 1;
    addLog(state, "move", `${defender.profile.name} 防守成功，${attacker.profile.name} 退回 1 格。`, { code: "movement.step", details: { input: { defenderId: defender.id, attackerId: attacker.id, lap: defenseLap }, result: "defended" } });
    if (attacker.profile.talent === "overtake_maniac") resolveContact(state, attacker, defender);
  } else {
    let passed = false;
    if (delta > 0) passed = completePass(state, attacker, defender, extraCost, outsideAttempt && hasTalentNode(attacker.profile, "RC-4"));
    else runtime.remainingMp = 0;
    resolveContact(state, attacker, defender);
    if (passed && attacker.status === "racing") checkFinish(state, attacker);
  }
}

function enterPit(state: GameState, driver: DriverState, plan: TurnPlan): void {
  const oldTire=driver.tire;
  raceStats(driver).pitStops += 1;
  const controlReduction = isNeutralized(state) ? 1 : 0;
  const reduction = controlReduction + Number(isNeutralized(state) && hasTalentNode(driver.profile, "ST-2"));
  const wasHeavy = driver.heavyDamage;
  driver.tire = plan.pitTire;
  driver.tireCompoundsUsed ??= [];
  if (!driver.tireCompoundsUsed.includes(plan.pitTire)) driver.tireCompoundsUsed.push(plan.pitTire);
  driver.wear = 0;
  driver.brakeHeat = 0;
  driver.heat = Math.max(0, driver.heat - 2);
  driver.heavyDamage = false;
  if (plan.useQuickRepair && driver.tactical.quickRepair > 0 && driver.lightDamage > 0) {
    driver.tactical.quickRepair -= 1;
    driver.lightDamage -= 1;
  }
  driver.pit = {
    remainingRounds: Math.max(0, RACE_RULES.pit.serviceRounds + Number(wasHeavy) * RACE_RULES.pit.heavyRepairExtra - reduction),
    tire: plan.pitTire,
    useQuickRepair: plan.useQuickRepair,
    service: true,
  };
  const uses = careerUses(driver);
  uses.softTireProtection = false;
  uses.softTireProtectionCharges = 0;
  uses.softTireProtectionRound = undefined;
  if (hasTalentNode(driver.profile, "TE-6")) {
    driver.heat = Math.max(0, driver.heat - 1);
    driver.ers = Math.min(ersCapacity(driver), driver.ers + 1);
  }
  const pitSignature = driver.profile.career?.signatureMove === "pit_execution";
  const pitLimit = driver.profile.career?.signatureUpgrade === "extra_use" ? 2 : 1;
  if (pitSignature && uses.pitExecutionUses < pitLimit) {
    uses.pitExecutionUses += 1;
    uses.pitExecutionUsed = true;
    const bonus = driver.profile.career?.signatureUpgrade === "enhanced" ? 2 : 1;
    driver.heat = Math.max(0, driver.heat - bonus);
    driver.ers = Math.min(ersCapacity(driver), driver.ers + bonus);
  }
  addLog(state, "move", `${driver.profile.name} 进站更换轮胎、清空刹车热并降低 2 热量${wasHeavy ? "，完成重损伤维修" : ""}；轻损伤保留${plan.useQuickRepair ? "（快修另移除 1 枚）" : ""}。`, { code: "pit.service", details: { input: { driverId: driver.id, service: true, heavyRepair: wasHeavy, oldTire, tire: plan.pitTire }, result: `wait_${driver.pit.remainingRounds}` } });
  state.movement!.remainingMp = 0;
  refreshSafetyCarLeader(state);
}

function checkFinish(state: GameState, driver: DriverState): void {
  if (driver.status !== "racing") return;
  const distance = (state.sessionLaps ?? state.track.laps) * state.track.totalLength;
  if (driver.progress >= distance) {
    driver.status = "finished";
    driver.finishOrder = state.drivers.filter((item) => item.status === "finished").length;
    addLog(state, "result", `${driver.profile.name} 率先冲线，比赛立即结束；最终排名按罚时结算。`, { code: "classification.result", details: { input: { driverId: driver.id, progress: driver.progress }, result: "winner_finished" } });
    if (state.movement) state.movement.remainingMp = 0;
    finishGame(state);
  }
}

function recordLapCompletion(state: GameState, driver: DriverState, previousProgress: number): void {
  if (previousProgress < 0 || driver.progress < state.track.totalLength) return;
  const previousLaps = Math.floor(previousProgress / state.track.totalLength);
  const completedLaps = Math.floor(driver.progress / state.track.totalLength);
  if (completedLaps <= previousLaps) return;
  driver.lapTiming ??= { lastCompletionRound: 0, completedRounds: [], wetCompletedRounds: [] };
  driver.lapTiming.wetCompletedRounds ??= [];
  for (let lap = previousLaps + 1; lap <= completedLaps; lap += 1) {
    const duration = Math.max(1, state.round - driver.lapTiming.lastCompletionRound);
    driver.lapTiming.completedRounds.push(duration);
    if (isRain(state.weather)) driver.lapTiming.wetCompletedRounds.push(duration);
    driver.lapTiming.lastCompletionRound = state.round;
    const uses = careerUses(driver);
    if (uses.defenseRewardLap === lap && uses.lastDefenseRewardLap !== lap) {
      const gained = Math.min(1, ersCapacity(driver) - driver.ers);
      driver.ers += gained;
      uses.lastDefenseRewardLap = lap;
      uses.defenseRewardLap = undefined;
      addLog(state, "resource", `${driver.profile.name} 结算第 ${lap} 圈连续防守奖励：ERS +${gained}${gained === 0 ? "（储量已满）" : ""}。`);
    }
    addLog(state, "info", `${driver.profile.name} 完成第 ${lap} 圈，用时 ${duration} 回合。`);
  }
}

function processMovementStep(state: GameState, driver: DriverState): "continue" | "decision" | "done" {
  const runtime = state.movement!;
  if (runtime.remainingMp <= 0 || driver.status !== "racing") return "done";
  if (runtime.pendingAiContest?.attackerId === driver.id) {
    const contest = runtime.pendingAiContest;
    runtime.pendingAiContest = undefined;
    const defender = driverById(state, contest.defenderId);
    if (yellowFlagBlocksOvertake(state, driver, defender)) {
      runtime.remainingMp = 0;
      addLog(state, "move", `${driver.profile.name} 的待执行进攻因事故赛段黄旗取消。`);
      return "done";
    }
    if (stopBlockedOvertake(state, driver, defender)) return "done";
    const defense = aiDefenseChoice(state, defender, driver);
    resolveContest(state, driver, defender, contest.attackStat, defense.stat, defense.choice);
    return runtime.remainingMp > 0 && driver.status === "racing" ? "continue" : "done";
  }
  const currentCell = getCellIndex(state, driver);
  const currentLocation = getSegmentAtCell(state, currentCell);
  if (driver.blueFlagYielding && currentLocation?.segment.type === "straight") {
    const leader = leaderWaitingBehind(state, driver);
    const targetLane = leader ? alternativeLane(leader.lane) : alternativeLane(driver.lane);
    if (laneFreeAtCell(state, currentCell, targetLane, [driver.id])) {
      driver.lane = targetLane;
      driver.blueFlagYielding = false;
      addLog(state, "move", `${driver.profile.name} 执行蓝旗，让出线路后继续本次行动。`, { code: "movement.step", details: { result: "blue_flag_yielded", input: { driverId: driver.id } } });
    }
  }
  if (
    currentLocation?.segment.type === "corner" &&
    !runtime.paidCornerIds.includes(currentLocation.segment.id)
  ) {
    if (driver.isHuman) {
      const options = cornerOptions(state, driver, currentLocation.segment);
      state.pendingDecision = {
        kind: "corner",
        driverId: driver.id,
        segmentId: currentLocation.segment.id,
        segmentName: currentLocation.segment.name,
        ...options,
      };
      state.pendingContext = { kind: "corner", driverId: driver.id, segmentId: currentLocation.segment.id };
      return "decision";
    }
    aiCornerChoice(state, driver, currentLocation.segment);
    return runtime.remainingMp <= 0 ? "done" : "continue";
  }
  const nextProgress = driver.progress + 1;
  const nextCell = nextProgress < 0 ? nextProgress : nextProgress % state.track.totalLength;
  const nextLocation = getSegmentAtCell(state, nextCell);
  if (
    nextLocation?.segment.type === "corner" &&
    currentLocation?.segment.id !== nextLocation.segment.id &&
    !runtime.paidCornerIds.includes(nextLocation.segment.id)
  ) {
    if (driver.isHuman) {
      const options = cornerOptions(state, driver, nextLocation.segment);
      state.pendingDecision = {
        kind: "corner",
        driverId: driver.id,
        segmentId: nextLocation.segment.id,
        segmentName: nextLocation.segment.name,
        ...options,
      };
      state.pendingContext = { kind: "corner", driverId: driver.id, segmentId: nextLocation.segment.id };
      return "decision";
    }
    aiCornerChoice(state, driver, nextLocation.segment);
    return runtime.remainingMp <= 0 ? "done" : "continue";
  }
  if (
    driver.progress >= 0 &&
    currentCell === state.track.pitEntryCell &&
    (state.plans[driver.id]?.pit || driver.heavyDamage)
  ) {
    enterPit(state, driver, state.plans[driver.id]);
    return "done";
  }
  const lappedCar = lappedCarImmediatelyAhead(state, driver);
  if (lappedCar) {
    const lappedLocation = getSegmentAtCell(state, getCellIndex(state, lappedCar));
    if (isNeutralized(state) || state.yellowFlagSegmentId === lappedLocation?.segment.id) {
      runtime.remainingMp = 0;
      addLog(state, "move", `${driver.profile.name} 在${isNeutralized(state) ? "VSC/SC" : "黄旗赛段"}追上被套圈的 ${lappedCar.profile.name}，不得通过。`);
      return "done";
    }
    if (lappedLocation?.segment.type !== "straight") {
      runtime.remainingMp = 0;
      addLog(state, "move", `${driver.profile.name} 在弯中追上被套圈的 ${lappedCar.profile.name}，等待下一直道蓝旗通过。`, { code: "movement.step", details: { result: "blue_flag_waiting", input: { driverId: driver.id, otherDriverId: lappedCar.id } } });
      return "done";
    }
    const passingLane = alternativeLane(lappedCar.lane);
    const targetCell = getCellIndex(state, lappedCar);
    if (!laneFreeAtCell(state, targetCell, passingLane, [driver.id, lappedCar.id])) {
      lappedCar.blueFlagYielding = true;
      runtime.remainingMp = 0;
      addLog(state, "incident", `${lappedCar.profile.name} 收到蓝旗；两条线路均被占用，将在下一直道行动让线。`, { code: "incident.damage", details: { result: "blue_flag_blocked", input: { driverId: lappedCar.id, otherDriverId: driver.id } } });
      return "done";
    }
    const previousProgress = driver.progress;
    driver.progress += 1;
    driver.lane = passingLane;
    runtime.remainingMp -= 1;
    raceStats(driver).cellsMoved += 1;
    recordLapCompletion(state, driver, previousProgress);
    addLog(state, "move", `${driver.profile.name} 在直道按蓝旗规则免对抗通过被套圈的 ${lappedCar.profile.name}，剩余 ${runtime.remainingMp} MP。`, { code: "movement.step", details: { result: "blue_flag_passed", input: { driverId: driver.id, otherDriverId: lappedCar.id, lap: Math.floor(Math.max(0, driver.progress) / state.track.totalLength) + 1 } } });
    checkFinish(state, driver);
    return runtime.remainingMp > 0 && driver.status === "racing" ? "continue" : "done";
  }
  const ahead = nearestAhead(state, driver);
  if (ahead && ahead.progress <= driver.progress + 1) {
    if (yellowFlagBlocksOvertake(state, driver, ahead)) {
      runtime.remainingMp = 0;
      addLog(state, "move", `${driver.profile.name} 到达事故赛段，黄旗下禁止超车，在 ${ahead.profile.name} 后结束行动。`);
      return "done";
    }
    if (stopBlockedOvertake(state, driver, ahead)) return "done";
    const yielded = runtime.teamOrderPass;
    if (yielded?.beneficiaryId === driver.id && yielded.yieldingDriverId === ahead.id && driver.progress === ahead.progress) {
      const lane = overtakeLandingLane(state, driver, ahead)!;
      const previousProgress = driver.progress;
      driver.progress += 1;
      driver.lane = lane;
      runtime.remainingMp -= 1;
      runtime.teamOrderPass = undefined;
      raceStats(driver).cellsMoved += 1;
      recordLapCompletion(state, driver, previousProgress);
      addLog(state, "move", `${driver.profile.name} 通过 ${ahead.profile.name} 让出的线路，继续行动，剩余 ${runtime.remainingMp} MP。`, { code: "team.order", details: { input: { beneficiaryId: driver.id, yieldingDriverId: ahead.id }, result: "executed" } });
      checkFinish(state, driver);
      return runtime.remainingMp > 0 && driver.status === "racing" ? "continue" : "done";
    }
    const intent = raceTeamOrderIntent(state);
    if (intent?.beneficiary.id === driver.id && intent.yielding.id === ahead.id) {
      if (driver.progress < ahead.progress) {
        driver.progress = ahead.progress;
        driver.lane = alternativeLane(ahead.lane);
        runtime.remainingMp -= 1;
        raceStats(driver).cellsMoved += 1;
        addLog(state, "move", `${driver.profile.name} 与 ${ahead.profile.name} 到达同一格并排，剩余 ${runtime.remainingMp} MP。`);
      }
      maybeCreateTeamOrder(state);
      if (state.teamOrder?.status === "pending") return "decision";
      if (runtime.remainingMp <= 0) return "done";
    }
    const contested = shouldContest(state, driver, ahead);
    if (!contested) {
      const alt = alternativeLane(ahead.lane);
      const outsidePass = nextLocation?.segment.type === "corner" && alt === "right" && hasTalentNode(driver.profile, "RC-4");
      const passed = completePass(state, driver, ahead, 0, outsidePass, "uncontested");
      if (passed && driver.status === "racing") checkFinish(state, driver);
      return runtime.remainingMp > 0 ? "continue" : "done";
    }
    if (driver.isHuman) {
      state.pendingDecision = {
        kind: "attack",
        driverId: driver.id,
        defenderId: ahead.id,
        canUseLateBrakeToken: false,
      };
      state.pendingContext = { kind: "attack", attackerId: driver.id, defenderId: ahead.id, contested: true };
      return "decision";
    }
    const attackStat: "eng" | "mech" = driver.profile.stats.eng >= driver.profile.stats.mech ? "eng" : "mech";
    addLog(state, "info", `${driver.profile.name} 进攻决策：使用最高属性 ${attackStat.toUpperCase()} 发起超车。`, {
      code: "ai.decision",
      details: { input: { driverId: driver.id, defenderId: ahead.id }, result: attackStat },
    });
    if (ahead.isHuman) {
      const free = hasFreeDefense(state, ahead);
      state.pendingDecision = {
        kind: "defense",
        driverId: ahead.id,
        attackerId: driver.id,
        canUseToken: ahead.tactical.defense > 0,
        hasFreeDefense: free,
      };
      state.pendingContext = { kind: "defense", attackerId: driver.id, defenderId: ahead.id, attackStat };
      return "decision";
    }
    runtime.pendingAiContest = { attackerId: driver.id, defenderId: ahead.id, attackStat };
    return "continue";
  }
  const previousProgress = driver.progress;
  driver.progress = nextProgress;
  recordLapCompletion(state, driver, previousProgress);
  raceStats(driver).cellsMoved += 1;
  runtime.remainingMp -= 1;
  const lap = Math.floor(Math.max(0, driver.progress) / state.track.totalLength) + 1;
  addLog(state, "move", `${driver.profile.name} 前进至第 ${lap} 圈 · ${getCellIndex(state, driver) + 1} 格，剩余 ${runtime.remainingMp} MP。`);
  checkFinish(state, driver);
  return runtime.remainingMp > 0 && driver.status === "racing" ? "continue" : "done";
}

function advanceMovementStep(state: GameState): void {
  const runtime = state.movement;
  if (!runtime) return;
  if (state.pendingDecision || state.teamOrder?.status === "pending" || state.phase !== "movement") return;
  if (runtime.queueIndex >= runtime.queue.length) {
    finishRound(state);
    return;
  }
  const driver = driverById(state, runtime.queue[runtime.queueIndex]);
  if (!runtime.started || runtime.activeDriverId !== driver.id) {
    runtime.started = true;
    if (driver.status !== "racing" || !beginDriverTurn(state, driver)) {
      if (state.movement !== runtime || state.phase !== "movement") return;
      runtime.queueIndex += 1;
      runtime.started = false;
      runtime.activeDriverId = undefined;
      if (runtime.queueIndex >= runtime.queue.length) finishRound(state);
    }
    if (state.movement === runtime && state.phase === "movement") maybeCreateTeamOrder(state);
    return;
  }
  const beforeStep = `${driver.status}|${driver.progress}|${runtime.remainingMp}|${runtime.paidCornerIds.join(",")}|${runtime.pendingAiContest?.attackerId ?? ""}|${runtime.pendingAiContest?.defenderId ?? ""}`;
  let outcome = processMovementStep(state, driver);
  if (state.movement !== runtime || state.phase !== "movement") return;
  const afterStep = `${driver.status}|${driver.progress}|${runtime.remainingMp}|${runtime.paidCornerIds.join(",")}|${runtime.pendingAiContest?.attackerId ?? ""}|${runtime.pendingAiContest?.defenderId ?? ""}`;
  if (outcome === "continue" && !state.pendingDecision && beforeStep === afterStep) {
    runtime.remainingMp = 0;
    outcome = "done";
    addLog(state, "incident", `${driver.profile.name} 的移动步骤未产生合法状态变化，防卡死保护已结束本次行动。`, {
      code: "movement.step",
      details: { input: { driverId: driver.id }, result: "stall_guard" },
    });
  }
  if (state.results.length > 0) return;
  if (outcome === "done") {
    runtime.queueIndex += 1;
    runtime.started = false;
    runtime.activeDriverId = undefined;
    if (runtime.queueIndex >= runtime.queue.length) finishRound(state);
  }
}

function naturalWear(driver: DriverState, state: GameState): number {
  let wear = 0;
  if (driver.tire === "soft" && !(driver.profile.talent === "tire_whisperer" && talentUpgradeRank(driver.profile.career?.level ?? 1) >= 2 && state.round % 2 === 1)) wear += 1;
  else if (driver.tire === "medium" && state.round % 2 === 0) wear += 1;
  else if (driver.tire === "intermediate") wear += isRain(state.weather) ? 1 : 2;
  else if (driver.tire === "wet") wear += isRain(state.weather) ? 1 : 3;
  if (driver.burdens.includes("tire_wear")) wear += 1;
  const uses = careerUses(driver);
  if (driver.tire === "soft" && (uses.softTireProtectionCharges ?? 0) > 0) {
    wear = 0;
    uses.softTireProtectionCharges! -= 1;
  }
  return wear;
}

function markDnf(state: GameState, driver: DriverState, reason: string, triggerControl = true): void {
  if (driver.status === "dnf") return;
  driver.status = "dnf";
  driver.dnfReason = reason;
  driver.retirementRound = state.round;
  addLog(state, "result", `${driver.profile.name} 因${reason}退赛。`, {code:"classification.result",details:{input:{driverId:driver.id,reason},result:"retired"}});
  refreshSafetyCarLeader(state);
  if (triggerControl) triggerIncidentControl(state, [driver.id], { reason, severe: true });
}

function compressSafetyCarField(state: GameState): void {
  const ordered = activeDrivers(state).filter((driver) => !driver.pit).sort((a, b) => b.progress - a.progress || a.qualifyingRank - b.qualifyingRank);
  for (let index = 1; index < ordered.length; index += 1) {
    const driver = ordered[index];
    const original = driver.progress;
    const lapEnd = (Math.floor(Math.max(0, original) / state.track.totalLength) + 1) * state.track.totalLength - 1;
    const target = Math.min(original + RACE_RULES.neutralization.maxCatchUpCells, ordered[index - 1].progress - RACE_RULES.neutralization.restartGap, lapEnd);
    // Do not manufacture a completed lap or land on another car while gathering the field.
    for (let progress = target; progress > original; progress--) {
      const cell = progress < 0 ? progress : progress % state.track.totalLength;
      const lane = [driver.lane, alternativeLane(driver.lane)].find(lane => laneFreeAtCell(state, cell, lane, [driver.id]));
      if (lane) { driver.progress = progress; driver.lane = lane; break; }
    }
  }
  addLog(state, "info", "SC 队列有限收拢：每车最多补 4 格，保留至少 3 格间距；原本更近的车辆不后退，圈次和顺序保持。", { code: "incident.race_control", details: { result: "sc_field_compressed" } });
}

export function advanceRaceControlAtRoundEnd(state: GameState): void {
  if (!isNeutralized(state)) return;
  state.raceControlStartedRound ??= state.round;
  const deadline = state.raceControlStartedRound + RACE_RULES.neutralization.maxRounds - 1;
  state.raceControlEndsAfterRound = Math.min(state.raceControlEndsAfterRound ?? deadline, deadline);
  if (state.round >= state.raceControlEndsAfterRound) {
    const wasSc = state.raceControl === "sc";
    if (wasSc) compressSafetyCarField(state);
    state.raceControl = "green";
    state.raceControlPhase = undefined;
    state.raceControlEndsAfterRound = undefined;
    state.raceControlStartedRound = undefined;
    state.safetyCarLeaderId = undefined;
    addLog(state, "info", `${wasSc ? "SC" : "VSC"} 结束，下回合全场恢复绿旗。`, { code: "incident.race_control", details: { result: "green" } });
  } else if (state.raceControl === "sc" && state.raceControlPhase === "sc_deployment") {
    state.raceControlPhase = "sc_restart";
    state.safetyCarLeaderId = activeDrivers(state).filter((driver) => !driver.pit).sort((a, b) => b.progress - a.progress || a.qualifyingRank - b.qualifyingRank)[0]?.id;
    addLog(state, "info", `SC 进入重启准备：基础 MP 仍为 5，R${state.raceControlEndsAfterRound} 回合末结束。`, { code: "incident.race_control", details: { result: "sc_restart" } });
  } else refreshSafetyCarLeader(state);
}

function updateDynamicWeather(state: GameState): void {
  if (state.weatherMode !== "dynamic" || !state.weather) return;
  const from = state.weather;
  const roll = rollD12(state);
  const to = dynamicWeatherForRoll(from, roll);
  state.weatherRoll = roll;
  state.weather = to;
  state.weatherHistory ??= [];
  state.weatherHistory.push({ round: state.round, roll, from, to });
  if (isRain(to)) state.raceWeatherWasWet = true;
  addLog(state, "roll", `天气更新：D12(${roll})，${weatherLabel(from)} → ${weatherLabel(to)}。下一回合按新天气执行。`, {
    code: "weather.transition",
    details: { input: { from, roll }, dice: [roll], result: to },
  });
}

function finishRound(state: GameState): void {
  state.phase = "roundEnd";
  for (const driver of activeDrivers(state)) {
    if ((state.phase as GameState["phase"]) !== "roundEnd") break;
    const plan = state.plans[driver.id];
    const uses = careerUses(driver);
    if (driver.pit) {
      if (plan?.talentAction === "strategist_cycle" || plan?.talentAction === "segment_plan") {
        driver.heat = Math.max(0, driver.heat - 1);
        driver.ers = Math.min(ersCapacity(driver), driver.ers + 1);
      }
      uses.defensesThisRound = 0;
      uses.attacksThisRound = 0;
      uses.defendedThisRound = false;
      continue;
    }
    const addedWear = naturalWear(driver, state);
    const wearBeforeRoundEnd = driver.wear;
    let targetWear = Math.min(RACE_RULES.damage.punctureThreshold, driver.wear + addedWear);
    if (plan?.talentAction === "tire_conserve") {
      const increase = Math.max(0, targetWear - uses.roundStartWear);
      targetWear = uses.roundStartWear + Math.floor(increase / 2);
      addLog(state, "resource", `${driver.profile.name} 将本回合磨损增量减半。`);
    }
    if (targetWear > driver.wear) addWear(state, driver, targetWear - driver.wear, "回合末自然磨损");
    else driver.wear = targetWear;
    if (driver.status === "dnf") continue;
    if (driver.profile.talent === "tire_whisperer" && (driver.tire !== "soft" || state.round % 2 === 0)) {
      driver.wear = Math.max(0, driver.wear - 1);
    }
    if (plan?.talentAction === "tire_extra_care") driver.wear = Math.max(0, driver.wear - 1);
    if (driver.wear !== wearBeforeRoundEnd) addLog(state, "resource", `${driver.profile.name} 回合末轮胎磨损 ${driver.wear > wearBeforeRoundEnd ? "+" : ""}${driver.wear - wearBeforeRoundEnd}（${driver.wear}/12）。`);
    if (driver.wear >= RACE_RULES.damage.punctureThreshold) {
      recordPeaks(driver);
      markDnf(state, driver, "轮胎临界失效并失控");
      continue;
    }
    if (plan && uses.ersUsedRound !== state.round) driver.ers = Math.min(ersCapacity(driver), driver.ers + 1 + Number(hasTalentNode(driver.profile, "TE-2")) + Number(hasMinorTalent(driver.profile, "ers_management")));
    if (plan?.mode === "save" && !isNeutralized(state)) driver.ers = Math.min(ersCapacity(driver), driver.ers + 1 + (hasTalentNode(driver.profile, "ST-1") ? 1 : 0));
    if (plan?.talentAction === "strategist_cycle" || plan?.talentAction === "segment_plan") {
      driver.heat = Math.max(0, driver.heat - 1);
      driver.ers = Math.min(ersCapacity(driver), driver.ers + 1);
      addLog(state, "resource", `${driver.profile.name} 在回合末移除 1 热量并恢复 1 ERS。`);
    }
    if (weekendSetupFor(state, driver).cooling === "open" && driver.heat > 0) {
      driver.heat -= 1;
      addLog(state, "resource", `${driver.profile.name} 的开放冷却在回合末额外移除 1 热量。`);
    }
    if (driver.heat >= 6) {
      const roll = rollD12(state);
      const tuning = hasTalentNode(driver.profile, "TE-5") ? 1 : 0;
      const reliabilityPackage = consumeFacilityUse(driver, "reliability_package", 1) ? 1 : 0;
      const correlation = consumeCorrelationPenalty(state, driver, "rel");
      const effectiveRel = Math.max(0, driver.profile.stats.rel - driver.reliabilityPenalty + correlation);
      const total = roll + effectiveRel + tuning + reliabilityPackage;
      addLog(state, "roll", `${driver.profile.name} 热量检定：D12(${roll}) + 有效REL(${effectiveRel}) + 调校(${tuning}) + 可靠性包(${reliabilityPackage}) = ${total}`, { code: "dice.reliability", details: { input: { driverId: driver.id, heat: driver.heat }, dice: [roll], modifiers: { effectiveRel, correlation, tuning, reliabilityPackage }, result: String(total) } });
      if (total <= 5) {
        if (driver.breakdowns >= 1) markDnf(state, driver, "再次故障");
        else {
          driver.breakdowns += 1;
          driver.reliabilityPenalty += 1;
          driver.stoppedRounds = 1;
          addLog(state, "incident", `${driver.profile.name} 故障停车一回合，本场有效 REL -1。`);
          triggerIncidentControl(state, [driver.id], { reason: "故障停车", severe: true });
        }
      } else if (total <= 7) {
        driver.powerPenaltyRounds = 1;
        addLog(state, "incident", `${driver.profile.name} 下回合降功率：-1 MP 且不能部署 ERS。`);
      }
    }
    recordPeaks(driver);
    uses.defensesThisRound = 0;
    uses.attacksThisRound = 0;
    uses.defendedThisRound = false;
  }
  if ((state.phase as GameState["phase"]) !== "roundEnd") return;
  state.yellowFlagSegmentId = undefined;
  advanceRaceControlAtRoundEnd(state);
  updateDynamicWeather(state);
  state.plans = {};
  state.pendingDecision = null;
  state.pendingContext = null;
  state.movement = null;
  const racing = activeDrivers(state);
  if (racing.length === 1 && state.drivers.some((driver) => driver.status === "dnf")) {
    racing[0].status = "finished";
    racing[0].finishOrder = state.drivers.filter((driver) => driver.status === "finished").length;
    addLog(state, "result", `场上只剩 ${racing[0].profile.name}，比赛提前结束。`);
  }
  if (activeDrivers(state).length === 0) finishGame(state);
  else {
    state.round += 1;
    if (state.restartLaunchRound !== undefined && state.restartLaunchRound < state.round) state.restartLaunchRound = undefined;
    state.phase = "strategy";
    maybeCreateTeamOrder(state);
  }
}

export function applyDryTireObligation(state: GameState, drivers: DriverState[] = state.drivers): string[] {
  if (state.weekendMode !== "full" || state.raceSession === "sprint" || state.raceWeatherWasWet) return [];
  const penalized: string[] = [];
  for (const driver of drivers) {
    if (driver.status === "dnf") continue;
    const slicks = new Set((driver.tireCompoundsUsed ?? []).filter((tire) => tire === "hard" || tire === "medium" || tire === "soft"));
    if (slicks.size >= 2) continue;
    addTimePenalty(driver, 10);
    penalized.push(driver.id);
    addLog(state, "result", `${driver.profile.name} 在全干正赛中未使用两种不同光头胎，罚时 10 秒，按完赛快照退 4 格。`, { code: "penalty.tire_obligation", details: { input: { driverId: driver.id, compounds: [...slicks].join("/") || "none", seconds: 10, cells: 4 }, result: "time_10" } });
  }
  return penalized;
}

function finishGame(state: GameState): void {
  state.drivers.forEach(migrateRacePenalties);
  if (state.raceSession !== "sprint") awardRainFastestLapBonus(state);
  const actionOrder = new Map((state.movement?.movedDriverIds ?? []).map((id, index) => [id, index]));
  const roundOrder = new Map((state.movement?.queue ?? []).map((id, index) => [id, index]));
  const ordered = state.drivers.slice().sort((a, b) => {
    if (a.status === "finished" && b.status !== "finished") return -1;
    if (b.status === "finished" && a.status !== "finished") return 1;
    if (a.status === "finished" && b.status === "finished") return (a.finishOrder ?? 99) - (b.finishOrder ?? 99);
    if (a.status === "dnf" && b.status !== "dnf") return 1;
    if (b.status === "dnf" && a.status !== "dnf") return -1;
    if (b.progress !== a.progress) return b.progress - a.progress;
    if (a.status === "dnf" && b.status === "dnf") {
      if ((b.retirementRound ?? -1) !== (a.retirementRound ?? -1)) return (b.retirementRound ?? -1) - (a.retirementRound ?? -1);
      return a.qualifyingRank - b.qualifyingRank;
    }
    const aAction = actionOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bAction = actionOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (aAction !== bAction) return aAction - bAction;
    const aRound = roundOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bRound = roundOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return aRound - bRound || a.qualifyingRank - b.qualifyingRank;
  });
  ordered.forEach((driver, index) => {
    if (driver.status === "racing") {
      driver.status = "classified";
      driver.finishOrder = index + 1;
    }
  });
  if (state.raceSession !== "sprint") applyDryTireObligation(state, ordered);
  // Freeze the first-finisher instant. Never move actual cars to represent a time penalty.
  const snapshot = new Map(ordered.map((driver, index) => {
    const penalty = racePenaltyTotals(driver);
    return [driver.id, {
      snapshotProgress: driver.progress,
      adjustedProgress: driver.progress - (driver.status === "dnf" ? 0 : penalty.cells),
      onTrackRank: index + 1,
      penaltySeconds: penalty.seconds,
      penaltyCells: penalty.cells,
    }];
  }));
  ordered.sort((a, b) => {
    if (a.status === "dnf" && b.status !== "dnf") return 1;
    if (b.status === "dnf" && a.status !== "dnf") return -1;
    const left = snapshot.get(a.id)!, right = snapshot.get(b.id)!;
    return right.adjustedProgress - left.adjustedProgress || left.onTrackRank - right.onTrackRank;
  });
  ordered.forEach((driver, index) => {
    if (driver.status !== "dnf") driver.finishOrder = index + 1;
    const entry = snapshot.get(driver.id)!;
    if (entry.penaltySeconds > 0 && driver.status !== "dnf") {
      addLog(state, "result", `${driver.profile.name} 累计罚时 ${entry.penaltySeconds} 秒，快照退 ${entry.penaltyCells} 格：赛道 P${entry.onTrackRank} → 最终 P${index + 1}。`, { code: "classification.result", details: { input: { driverId: driver.id, ...entry, rank: index + 1 }, result: "penalty_classification" } });
    }
  });
  if (ordered[0]?.status !== "dnf") addLog(state, "result", `最终 P1：${ordered[0].profile.name}（已计入罚时）。`, { code: "classification.result", details: { input: { driverId: ordered[0].id, rank: 1 }, result: "final_winner" } });
  if (state.raceSession === "sprint") {
    const sprintPoints = [8, 7, 6, 5, 4, 3, 2, 1];
    const results = ordered.map<RaceResult>((driver, index) => ({
      driverId: driver.id,
      rank: index + 1,
      status: driver.status,
      points: sprintPoints[index] ?? 0,
      ...snapshot.get(driver.id)!,
    }));
    state.weekend ??= { sprintEnabled: true, sprintCompleted: false };
    state.weekend.sprintCompleted = true;
    state.weekend.sprintResults = results;
    results.forEach((result) => addLog(state, "result", `冲刺 P${result.rank}：${driverById(state, result.driverId).profile.name}，${result.points} 分。`, { code: "weekend.sprint", details: { input: { driverId: result.driverId, rank: result.rank }, result: String(result.points) } }));
    const grid = state.qualifying.map((entry, index) => {
      const previous = driverById(state, entry.driverId);
      const profile = clone(previous.profile);
      if (profile.raceEntryEffects) {
        if (previous.correlationPenaltyConsumed) profile.raceEntryEffects.correlationPenaltyStat = undefined;
        profile.raceEntryEffects.freeFacilityUses = (profile.raceEntryEffects.freeFacilityUses ?? []).filter((facility) => {
          const normalAllowance = profile.team?.facilities?.[facility] ?? 0;
          return (previous.careerUses?.teamFacilityUses?.[facility] ?? 0) <= normalAllowance;
        });
      }
      return { profile, isHuman: entry.driverId === state.humanDriverId, isTeammate: Boolean(previous.isTeammate), rank: index + 1 };
    });
    state.drivers = grid.map(({ profile, isHuman, isTeammate, rank }, index) => {
      const driver = baseDriver(profile, isHuman, isTeammate);
      driver.qualifyingRank = rank;
      driver.progress = -index;
      driver.lane = index % 2 === 0 ? "left" : "right";
      return driver;
    });
    state.round = 0;
    state.raceSession = "race";
    state.sessionLaps = state.track.laps;
    state.raceControl = "green";
    state.raceControlPhase = undefined;
    state.raceControlStartedRound = undefined;
    state.raceControlEndsAfterRound = undefined;
    state.safetyCarLeaderId = undefined;
    state.redFlagOrder = undefined;
    state.yellowFlagSegmentId = undefined;
    state.pendingDecision = null;
    state.pendingContext = null;
    state.movement = null;
    state.plans = {};
    state.aiPlanNotes = {};
    state.results = [];
    state.objectives = [];
    state.teamOrder = undefined;
    state.teamOrderHistory = [];
    state.weatherHistory = [];
    state.raceWeatherWasWet = false;
    state.phase = "preRace";
    addLog(state, "info", "冲刺赛结束；正赛发车位仍采用原排位结果。", { code: "weekend.sprint", details: { result: "completed" } });
    return;
  }
  const human = driverById(state, state.humanDriverId);
  const humanRank = ordered.findIndex((driver) => driver.id === human.id) + 1;
  const evaluatedObjectives = (state.objectives ?? []).map((objective) => ({
    ...objective,
    completed: objectiveCompleted(objective.id, human, humanRank),
  }));
  state.objectives = allocateObjectiveAwards(evaluatedObjectives).map((objective) => {
    const awardedPoints = objective.awardedPoints ?? 0;
    if (objective.completed) {
      human.bonusPoints = (human.bonusPoints ?? 0) + awardedPoints;
      addLog(state, "result", `赛事目标“${objective.title}”完成，获得 ${awardedPoints} VP${awardedPoints < objective.points ? "（受单场 4 VP 上限限制）" : ""}。`);
    } else {
      addLog(state, "result", `赛事目标“${objective.title}”未完成：${RACE_OBJECTIVES[objective.id].condition}`);
    }
    return objective;
  });
  state.results = ordered.map<RaceResult>((driver, index) => ({
    driverId: driver.id,
    rank: index + 1,
    status: driver.status,
    points: Math.max(0, (POINTS[index] ?? 0) + (driver.bonusPoints ?? 0)),
    ...snapshot.get(driver.id)!,
  }));
  state.pendingDecision = null;
  state.pendingContext = null;
  state.movement = null;
  state.plans = {};
  state.phase = "finished";
  addLog(state, "result", "比赛结束，成绩、车手积分与车队研发已经进入结算。" );
}

function finishIfOnlyOneCarRemains(state: GameState): void {
  if (state.phase === "finished") return;
  const racing = activeDrivers(state);
  if (racing.length !== 1 || !state.drivers.some((driver) => driver.status === "dnf")) return;
  const survivor = racing[0];
  survivor.status = "finished";
  survivor.finishOrder = 1;
  addLog(state, "result", `场上只剩 ${survivor.profile.name}，比赛立即结束。`, { code: "classification.result", details: { input: { driverId: survivor.id }, result: "last_car_running" } });
  finishGame(state);
}

function awardRainFastestLapBonus(state: GameState): void {
  const fastestThree = state.drivers
    .flatMap((driver) => {
      const wetLaps = driver.lapTiming?.wetCompletedRounds
        ?? (isRain(state.weather) ? driver.lapTiming?.completedRounds ?? [] : []);
      return wetLaps.map((rounds, lapIndex) => ({ driver, rounds, lapIndex }));
    })
    .sort((a, b) => a.rounds - b.rounds || a.driver.qualifyingRank - b.driver.qualifyingRank || a.lapIndex - b.lapIndex)
    .slice(0, 3);
  const awarded = new Set<string>();
  fastestThree.forEach(({ driver, rounds }) => {
    if (
      !awarded.has(driver.id) &&
      driver.profile.talent === "rain_master" &&
      talentUpgradeRank(driver.profile.career?.level ?? 1) >= 3
    ) {
      awarded.add(driver.id);
      driver.bonusPoints = (driver.bonusPoints ?? 0) + 1;
      addLog(state, "result", `${driver.profile.name} 在雨战全场前三快圈中占有一席，额外获得 1 分（${rounds} 回合）。`);
    }
  });
}

function restartAfterRedFlag(state: GameState, tire: TireCompound): string | null {
  if (state.phase !== "redFlag" || state.raceControl !== "red_flag") return "当前没有等待重启的红旗";
  const orderedIds = state.redFlagOrder ?? redFlagOrder(state).map((driver) => driver.id);
  for (const driver of activeDrivers(state)) {
    const nextTire = driver.isHuman ? tire : chooseAiPitTire(state, driver);
    driver.tire = nextTire;
    driver.wear = 0;
    driver.heat = Math.max(0, driver.heat - 2);
    driver.brakeHeat = Math.max(0, driver.brakeHeat - 1);
    driver.tireCompoundsUsed ??= [];
    if (!driver.tireCompoundsUsed.includes(nextTire)) driver.tireCompoundsUsed.push(nextTire);
  }
  state.round += 1;
  state.restartLaunchRound = state.round;
  state.raceControl = "green";
  state.raceControlPhase = undefined;
  state.raceControlStartedRound = undefined;
  state.raceControlEndsAfterRound = undefined;
  state.safetyCarLeaderId = undefined;
  state.redFlagOrder = orderedIds;
  state.yellowFlagSegmentId = undefined;
  state.phase = "strategy";
  addLog(state, "info", `红旗后从各车所在圈起点双列静止发车：保留圈数；免费更换轮胎，热量 -2、刹车热 -1；ERS 与损伤保持。`, { code: "incident.race_control", details: { input: { tire }, result: "standing_restart" } });
  return null;
}

function resolveCorner(state: GameState, command: Extract<GameCommand, { type: "RESOLVE_CORNER" }>): string | null {
  if (state.pendingContext?.kind !== "corner") return "当前没有弯道决策";
  const driver = driverById(state, state.pendingContext.driverId);
  const target = state.track.segments.find((item) => item.id === (state.pendingContext as { segmentId: string }).segmentId);
  if (!target) return "找不到目标弯道";
  const error = applyCornerChoice(state, driver, target, command.choice, command.useToken);
  if (error) return error;
  state.pendingDecision = null;
  state.pendingContext = null;
  return null;
}

function skipAttack(state: GameState): string | null {
  if (state.phase !== "movement" || state.pendingContext?.kind !== "attack" || !state.movement) return "当前没有进攻决策";
  const attacker = driverById(state, state.pendingContext.attackerId);
  const defender = driverById(state, state.pendingContext.defenderId);
  state.movement.remainingMp = 0;
  state.pendingDecision = null;
  state.pendingContext = null;
  addLog(state, "move", `${attacker.profile.name} 暂不超越 ${defender.profile.name}，保持原位并结束本次行动。`, {
    code: "movement.step", details: { input: { attackerId: attacker.id, defenderId: defender.id }, result: "attack_declined" },
  });
  return null;
}

function resolveAttack(state: GameState, command: Extract<GameCommand, { type: "RESOLVE_ATTACK" }>): string | null {
  if (state.pendingContext?.kind !== "attack") return "当前没有进攻决策";
  const context = state.pendingContext as PendingAttackContext;
  const attacker = driverById(state, context.attackerId);
  const defender = driverById(state, context.defenderId);
  if (yellowFlagBlocksOvertake(state, attacker, defender)) return "事故赛段处于黄旗状态，禁止发起超车";
  if (stopBlockedOvertake(state, attacker, defender)) {
    state.pendingDecision = null;
    state.pendingContext = null;
    return null;
  }
  const defense = aiDefenseChoice(state, defender, attacker);
  state.pendingDecision = null;
  state.pendingContext = null;
  resolveContest(state, attacker, defender, command.stat, defense.stat, defense.choice);
  return null;
}

function resolveDefense(state: GameState, command: Extract<GameCommand, { type: "RESOLVE_DEFENSE" }>): string | null {
  if (state.pendingContext?.kind !== "defense") return "当前没有防守决策";
  const context = state.pendingContext as PendingDefenseContext;
  const attacker = driverById(state, context.attackerId);
  const defender = driverById(state, context.defenderId);
  if (yellowFlagBlocksOvertake(state, attacker, defender)) return "事故赛段处于黄旗状态，禁止继续超车对抗";
  if (stopBlockedOvertake(state, attacker, defender)) {
    state.pendingDecision = null;
    state.pendingContext = null;
    return null;
  }
  if (command.choice !== "none") {
    const free = hasFreeDefense(state, defender);
    if (!free && defender.tactical.defense <= 0) return "没有可用的防守标记";
  }
  state.pendingDecision = null;
  state.pendingContext = null;
  resolveContest(state, attacker, defender, context.attackStat, command.stat, command.choice);
  return null;
}

function presentationTitle(command: GameCommand, state: GameState): string {
  if (command.type === "RESOLVE_ATTACK") return "超车检定结果";
  if (command.type === "RESOLVE_DEFENSE") return "攻防检定结果";
  if (command.type === "RESOLVE_CORNER") return command.choice === "late_brake" ? "晚刹检定结果" : "线路选择已确认";
  if (command.type === "SUBMIT_STRATEGY") return "策略锁定 · 行动开始";
  const active = state.movement?.activeDriverId ? state.drivers.find((driver) => driver.id === state.movement?.activeDriverId) : undefined;
  return active ? `${active.profile.abbreviation} · 行动步骤` : "回合状态更新";
}

function shouldPresentResolution(command: GameCommand, events: GameEvent[]): boolean {
  if (events.length === 0 || command.type === "SUBMIT_STRATEGY" || command.type === "RESOLVE_TEAM_ORDER") return false;
  if (command.type === "RESOLVE_ATTACK" || command.type === "RESOLVE_DEFENSE") return true;
  if (command.type === "RESOLVE_CORNER") return command.choice === "late_brake";
  if (events.some((event) => event.type === "incident" || event.type === "result")) return true;
  if (events.some((event) => event.code === "weather.transition" && event.details?.input?.from !== event.details?.result)) return true;
  if (events.some((event) => event.code === "dice.duel" || event.code === "dice.contact" || event.code === "dice.penalty" || event.code === "dice.late_brake")) return true;
  return events.some((event) => /进站|维修通道|驶出维修区/.test(event.message));
}

export function dispatchGameCommand(input: GameState, command: GameCommand): DispatchResult {
  const state = clone(input);
  if (state.phase !== "finished") state.drivers.forEach(migrateRacePenalties);
  try {
    if (command.type === "DISMISS_PRESENTATION") {
      state.presentation = undefined;
      return { ok: true, state };
    }
    if (command.type === "ADVANCE_BROADCAST" || command.type === "SKIP_BROADCAST") {
      if (!state.broadcast?.active) return { ok: false, state: input, error: "当前没有转播开场" };
      if (command.type === "SKIP_BROADCAST" || state.broadcast.stage >= 4) state.broadcast.active = false;
      else state.broadcast.stage += 1;
      return { ok: true, state };
    }
    if (state.presentation && ["practice", "setup", "qualifying", "preRace"].includes(state.phase)) state.presentation = undefined;
    if (state.presentation) return { ok: false, state: input, error: "请先确认当前结算结果" };
    const firstNewLogId = state.nextLogId;
    let error: string | null = null;
    switch (command.type) {
      case "COMPLETE_PRACTICE":
        error = completePractice(state, command.setup);
        break;
      case "START_QUALIFYING":
        if (state.phase !== "setup") error = "当前不能开始排位赛";
        else if (state.teamOrder?.status === "pending") error = "请先处理排位拖车安排";
        else resolveQualifying(state, command.mode);
        break;
      case "START_RACE":
        if (state.phase !== "preRace") error = "当前不在赛前准备阶段";
        else error = startRace(state, command);
        break;
      case "START_SPRINT":
        if (state.phase !== "preRace") error = "当前不在冲刺赛准备阶段";
        else error = startRace(state, command);
        break;
      case "RESTART_RED_FLAG":
        error = restartAfterRedFlag(state, command.tire);
        break;
      case "RESOLVE_TEAM_ORDER":
        error = resolveTeamOrder(state, command.accept);
        break;
      case "SUBMIT_STRATEGY":
        if (state.phase !== "strategy") error = "当前不在策略阶段";
        else error = submitStrategy(state, command.plan);
        break;
      case "CONTINUE_MOVEMENT":
        if (state.phase === "strategy" && strategyWaitReason(driverById(state, state.humanDriverId))) {
          error = submitStrategy(state, waitingPlan(driverById(state, state.humanDriverId)));
        } else if (state.phase !== "movement" || state.pendingDecision) error = "当前没有可继续的移动步骤";
        else advanceMovementStep(state);
        break;
      case "RESOLVE_CORNER":
        error = resolveCorner(state, command);
        break;
      case "RESOLVE_ATTACK":
        error = resolveAttack(state, command);
        break;
      case "SKIP_ATTACK":
        error = skipAttack(state);
        break;
      case "RESOLVE_DEFENSE":
        error = resolveDefense(state, command);
        break;
    }
    if (!error) {
      finishIfOnlyOneCarRemains(state);
      const events = state.logs.filter((event) => event.id >= firstNewLogId);
      if (shouldPresentResolution(command, events) && command.type !== "START_QUALIFYING" && command.type !== "START_RACE") {
        const kind = events.some((event) => event.type === "incident") ? "incident"
          : events.some((event) => event.type === "roll") ? "roll"
            : events.some((event) => event.type === "result") ? "result"
              : events.some((event) => event.type === "move") ? "move" : "turn";
        state.presentation = {
          id: events[events.length - 1].id,
          kind,
          title: presentationTitle(command, state),
          messages: events.map((event) => event.message),
          driverIds: state.drivers.filter((driver) => events.some((event) => event.message.includes(driver.profile.name))).map((driver) => driver.id),
        };
      }
    }
    return error ? { ok: false, state: input, error } : { ok: true, state };
  } catch (cause) {
    return { ok: false, state: input, error: cause instanceof Error ? cause.message : "未知规则错误" };
  }
}

export const labels = {
  weather: weatherLabel,
};
