import { consumeSeasonRaceEntryEffects, rollSeasonD12 } from "./seasonDevelopment";
import type { AdvancedModuleSettings, AdvancedRaceEntryChoice, AdvancedRaceRecord, AdvancedSeasonState, AppealReview, CarStats, DriverProfile, GameState, SeasonState } from "./types";

export const DEFAULT_ADVANCED_SETTINGS: AdvancedModuleSettings = {
  componentPool: false,
  scrutineering: false,
  aggressiveAccounting: false,
  appeals: false,
  rookiePractice: false,
  entertainmentDeck: false,
};

export const DEFAULT_ADVANCED_ENTRY: AdvancedRaceEntryChoice = { powerUnit: "keep", gearbox: "keep", useRookie: false, acceptComplianceRisk: false };

export function createAdvancedSeasonState(): AdvancedSeasonState {
  return {
    settings: { ...DEFAULT_ADVANCED_SETTINGS },
    powerUnits: { allowance: 3, units: [{ id: "pu-1", kind: "powerUnit", uses: 0, installedRound: 1 }], activeUnitId: "pu-1" },
    gearboxes: { allowance: 3, units: [{ id: "gb-1", kind: "gearbox", uses: 0, installedRound: 1 }], activeUnitId: "gb-1" },
    accountingCredit: 0,
    accountingLiability: 0,
    rookieAppearances: 0,
    raceRecords: [],
    appealReviews: [],
  };
}

export function migrateAdvancedSeason(input: SeasonState): SeasonState {
  const state = structuredClone(input);
  const defaults = createAdvancedSeasonState();
  state.advanced ??= defaults;
  state.advanced.settings = { ...DEFAULT_ADVANCED_SETTINGS, ...(state.advanced.settings ?? {}) };
  state.advanced.powerUnits ??= defaults.powerUnits;
  state.advanced.gearboxes ??= defaults.gearboxes;
  state.advanced.accountingCredit ??= 0;
  state.advanced.accountingLiability ??= 0;
  state.advanced.rookieAppearances ??= 0;
  state.advanced.raceRecords ??= [];
  state.advanced.appealReviews ??= [];
  return state;
}

export function configureAdvancedModules(input: SeasonState, settings: AdvancedModuleSettings): SeasonState {
  const state = migrateAdvancedSeason(input);
  if (state.rounds.length > 0 || state.advanced.raceRecords.length > 0) throw new Error("高级模块只能在赛季首站开始前配置。");
  state.advanced.settings = { ...settings };
  return state;
}

function consumeComponent(state: SeasonState, poolKey: "powerUnits" | "gearboxes", choice: "keep" | "new"): { unitId: string; gridPenalty: number; wornPenalty: number } {
  const pool = state.advanced[poolKey];
  if (choice === "new") {
    const prefix = poolKey === "powerUnits" ? "pu" : "gb";
    const id = `${prefix}-${pool.units.length + 1}`;
    pool.units.push({ id, kind: poolKey === "powerUnits" ? "powerUnit" : "gearbox", uses: 0, installedRound: state.currentRound });
    pool.activeUnitId = id;
  }
  const active = pool.units.find((unit) => unit.id === pool.activeUnitId)!;
  active.uses += 1;
  return { unitId: active.id, gridPenalty: pool.units.length > pool.allowance && choice === "new" ? 3 : 0, wornPenalty: active.uses > 2 ? 1 : 0 };
}

const ENTERTAINMENT_EVENTS = [
  "围场猫",
  "我的麦很炸吗？",
  "有两只海鸥",
  "你四个胎怎么不是同一个颜色",
];

export function prepareAdvancedRaceEntry(input: SeasonState, choice: AdvancedRaceEntryChoice = DEFAULT_ADVANCED_ENTRY): { state: SeasonState; record: AdvancedRaceRecord } {
  const state = migrateAdvancedSeason(input);
  const existing = state.advanced.raceRecords.find((record) => record.round === state.currentRound);
  if (existing) return { state, record: existing };
  let powerUnitId: string | undefined;
  let gearboxId: string | undefined;
  let gridPenalty = 0;
  let wornComponentPenalty = 0;
  if (state.advanced.settings.componentPool) {
    const power = consumeComponent(state, "powerUnits", choice.powerUnit);
    const gearbox = consumeComponent(state, "gearboxes", choice.gearbox);
    powerUnitId = power.unitId; gearboxId = gearbox.unitId;
    gridPenalty = power.gridPenalty + gearbox.gridPenalty;
    wornComponentPenalty = power.wornPenalty + gearbox.wornPenalty;
  }
  const rookieUsed = state.advanced.settings.rookiePractice && choice.useRookie;
  if (rookieUsed) {
    state.advanced.rookieAppearances += 1;
    state.playerTeam.developmentPoints += 1;
    state.playerTeam.totalDevelopmentPoints += 1;
  }
  const complianceRisk = Boolean(state.advanced.settings.scrutineering && choice.acceptComplianceRisk && state.playerTeam.pendingCorrelationStats.length > 0);
  const entertainmentEvent = state.advanced.settings.entertainmentDeck ? ENTERTAINMENT_EVENTS[(state.seed + state.currentRound * 17) % ENTERTAINMENT_EVENTS.length] : undefined;
  const record: AdvancedRaceRecord = { round: state.currentRound, powerUnitId, gearboxId, gridPenalty, wornComponentPenalty, rookieUsed, complianceRisk, entertainmentEvent };
  state.advanced.raceRecords.push(record);
  return { state, record };
}

export function prepareLockedSeasonRaceEntry(input: SeasonState, choice: AdvancedRaceEntryChoice = DEFAULT_ADVANCED_ENTRY): {
  state: SeasonState;
  record: AdvancedRaceRecord;
  effects: NonNullable<DriverProfile["raceEntryEffects"]>;
} {
  const prepared = prepareAdvancedRaceEntry(input, choice);
  const savedEffects = prepared.record.entryEffects;
  if (savedEffects) return { ...prepared, effects: structuredClone(savedEffects) };
  const consumeCorrelation = !prepared.state.advanced.settings.scrutineering || prepared.record.complianceRisk;
  const consumed = consumeSeasonRaceEntryEffects(prepared.state, consumeCorrelation);
  const record = consumed.state.advanced.raceRecords.find((item) => item.round === consumed.state.currentRound);
  if (!record) throw new Error("本站高级赛前记录不存在。");
  const effects = prepared.state.advanced.settings.scrutineering && prepared.record.complianceRisk
    ? { ...consumed.effects, correlationPenaltyStat: undefined }
    : consumed.effects;
  record.entryEffects = structuredClone(effects);
  return { state: consumed.state, record, effects };
}

export function advancedRaceCarStats(state: SeasonState, record: AdvancedRaceRecord): CarStats {
  const stats = { ...state.playerTeam.stats };
  if (!state.advanced.settings.scrutineering || record.complianceRisk) return stats;
  const pendingStat = state.playerTeam.pendingCorrelationStats[0];
  if (pendingStat) stats[pendingStat] = Math.max(1, stats[pendingStat] - 1);
  return stats;
}

export function resolveAdvancedAfterRace(input: SeasonState): SeasonState {
  const state = migrateAdvancedSeason(input);
  const record = state.advanced.raceRecords.find((item) => item.round === state.currentRound);
  if (state.advanced.settings.scrutineering && record?.complianceRisk && !record.scrutineering) {
    const roll = rollSeasonD12(state);
    const total = roll + state.playerTeam.stats.rel;
    const fine = total >= 6 ? 0 : Math.min(2, state.playerTeam.budgetRemaining);
    state.playerTeam.budgetRemaining -= fine;
    if (total < 6 && fine < 2) state.advanced.accountingLiability += 2 - fine;
    record.scrutineering = { roll, total, result: total >= 6 ? "clear" : "fine", budgetFine: total >= 6 ? 0 : 2 };
  }
  return state;
}

export function takeAggressiveAccountingCredit(input: SeasonState, amount: 1 | 2): SeasonState {
  const state = migrateAdvancedSeason(input);
  if (!state.advanced.settings.aggressiveAccounting) throw new Error("激进核算模块未启用。");
  if (!state.awaitingInterRoundActions || state.status !== "active") throw new Error("只可在站间窗口使用激进核算。");
  if (state.advanced.accountingCredit + amount > 2) throw new Error("每赛季最多提前使用 2 BU。");
  state.advanced.accountingCredit += amount;
  state.advanced.accountingLiability += amount;
  state.playerTeam.budgetRemaining += amount;
  return state;
}

export function resolveAdvancedSeasonEnd(input: SeasonState): SeasonState {
  const state = migrateAdvancedSeason(input);
  if (state.status !== "finished") return state;
  if (state.advanced.settings.rookiePractice && state.advanced.rookieObligationPenalty === undefined) {
    const missing = Math.max(0, 2 - state.advanced.rookieAppearances);
    const penalty = Math.min(state.playerTeam.developmentPoints, missing * 2);
    state.playerTeam.developmentPoints -= penalty;
    state.advanced.rookieObligationPenalty = penalty;
  }
  if (state.advanced.settings.aggressiveAccounting && state.advanced.accountingLiability > 0 && !state.advanced.accountingAudit) {
    const roll = rollSeasonD12(state);
    const total = roll + state.playerTeam.stats.rel;
    const liability = state.advanced.accountingLiability;
    if (total >= 10) state.advanced.accountingAudit = { roll, total, result: "clear", penalty: 0 };
    else if (total >= 6) {
      const penalty = Math.min(state.playerTeam.developmentPoints, liability);
      state.playerTeam.developmentPoints -= penalty;
      state.advanced.accountingAudit = { roll, total, result: "rp_penalty", penalty };
    } else {
      const standing = state.constructors.find((item) => item.teamId === state.playerTeam.teamId);
      const penalty = liability * 2;
      if (standing) standing.championshipPoints = Math.max(0, standing.championshipPoints - penalty);
      state.advanced.accountingAudit = { roll, total, result: "points_penalty", penalty };
    }
  }
  return state;
}

export function reviewPenaltyEvidence(input: SeasonState, game: GameState, eventId: number): SeasonState {
  const state = migrateAdvancedSeason(input);
  if (!state.advanced.settings.appeals) throw new Error("规则申诉模块未启用。");
  if (game.seasonId !== state.id) throw new Error("只能复核当前赛季的比赛证据。");
  if (game.phase !== "finished") throw new Error("比赛结束后才能复核判罚证据。");
  if (state.advanced.appealReviews.some((review) => review.raceId === game.id)) throw new Error("每场比赛只能复核一次判罚证据。");
  const event = game.logs.find((item) => item.id === eventId && (item.code === "dice.penalty" || item.code?.startsWith("penalty")));
  if (!event) throw new Error("请选择一条结构化判罚日志。");
  const completeEvidence = Boolean(event.ruleRef && event.details?.result && (event.details.dice?.length || event.details.modifiers));
  const review: AppealReview = { raceId: game.id, eventId, completeEvidence, summary: completeEvidence ? "判罚包含规则引用、结果及骰点/修正；维持原赛果。" : "证据字段不完整；已记录复核，但第一版不改写赛果。" };
  state.advanced.appealReviews.push(review);
  return state;
}
