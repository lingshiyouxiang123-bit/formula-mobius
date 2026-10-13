import type {
  CarStats,
  DriverCareer,
  DriverProfile,
  DriverSpecializationId,
  GameState,
  MinorTalentId,
  OffTrackActionId,
  SignatureMoveId,
  StatKey,
  TalentBranch,
  TalentActionId,
  TalentId,
  TalentNodeId,
  TeamFacilityId,
  TeamDevelopment,
} from "./types";

export interface TalentNodeDefinition {
  id: TalentNodeId;
  branch: TalentBranch;
  tier: 1 | 2 | 3 | 4;
  name: string;
  prerequisites: TalentNodeId[];
  minLevel: number;
  effect: string;
  active: boolean;
}

export interface CareerReward {
  championshipPoints: number;
  developmentPoints: number;
  levelBefore: number;
  levelAfter: number;
}

export interface DevelopmentResult {
  ok: boolean;
  profile: DriverProfile;
  error?: string;
}

export interface TeamFacilityDefinition {
  id: TeamFacilityId;
  name: string;
  effect: string;
  costs: number[];
}

export interface OffTrackActionDefinition {
  id: OffTrackActionId;
  name: string;
  check: string;
  target: number;
  effect: string;
}

export interface OffTrackActionResult extends DevelopmentResult {
  roll: number;
  modifier: number;
  total: number;
  summary: string;
}

export const OFF_TRACK_ACTIONS: Record<OffTrackActionId, OffTrackActionDefinition> = {
  simulator: {
    id: "simulator",
    name: "模拟器与工程复盘",
    check: "D12 + REL + Lv3 加值",
    target: 10,
    effect: "成功：下一场第 1 回合 +1 MP；总值达到 14 时，下一次晚刹再 +1。",
  },
  fitness: {
    id: "fitness",
    name: "额外检查",
    check: "D12 + REL",
    target: 10,
    effect: "成功：下一场首次轻损伤无效，可与振金悬挂和底盘保护叠加。",
  },
};

export const DRIVER_SPECIALIZATIONS: Record<DriverSpecializationId, { name: string; effect: string }> = {
  qualifying: { name: "排位专家", effect: "排位总值 +1；正赛第 1 回合 +1 MP。" },
  strategy: { name: "策略总监", effect: "每场增加 1 次战术标记置换。" },
  duel: { name: "攻防对决", effect: "每场一次，声明回合内下一次超车或防守对抗 +2。" },
  endurance: { name: "铁人耐久", effect: "重损伤的持续 MP 惩罚由 -2 降为 -1。" },
};

export const LEVEL_XP = [
  0, 8, 18, 30, 44, 60, 78, 98, 120, 144,
  170, 198, 228, 260, 294, 330, 368, 408, 450, 494,
] as const;

export const TEAM_FACILITIES: TeamFacilityDefinition[] = [
  { id: "wind_tunnel", name: "风洞与 CFD", effect: "每级每场一次，AERO 防守检定 +1。", costs: [4, 6] },
  { id: "engine_mapping", name: "引擎厂商", effect: "每场首次从直道开始行动时 +1 MP。", costs: [5] },
  { id: "mechanical_department", name: "机械部门", effect: "每场首次过弯磨损 -1。", costs: [5] },
  { id: "brake_department", name: "制动部门", effect: "每场前两次晚刹检定 +1。", costs: [4] },
  { id: "reliability_package", name: "可靠性包", effect: "每场首次热量检定 +1。", costs: [4] },
  { id: "battery_recovery", name: "电池与回收", effect: "ERS 容量上限永久提高至 9。", costs: [7] },
  { id: "pit_training", name: "进站训练", effect: "换胎维修后实际出站当回合 +3 MP，可与进站极致叠加。", costs: [8] },
  { id: "strategy_tools", name: "策略工具", effect: "每场赛前额外选择 1 枚团队战术标记。", costs: [6] },
];

export const SIGNATURE_MOVES: Record<SignatureMoveId, { name: string; effect: string }> = {
  qualifying_push: { name: "排位冲刺", effect: "每场排位自动额外掷一次 D12，保留较高结果。" },
  race_launch: { name: "我有一计", effect: "每场正赛开始额外获得 1 ERS 与 1 枚晚刹标记。" },
  pit_execution: { name: "工程师太爱你了", effect: "每场首次进站额外移除 1 热量并恢复 1 ERS。" },
};

export const SIGNATURE_CUSTOMIZATION_NOTE = "单人版本就这样凑合过了；多人版本中，招牌动作是定制内容。";

export const TALENT_ACTIONS: Record<TalentActionId, { name: string; effect: string }> = {
  tire_conserve: { name: "磨损减半", effect: "本回合产生的全部磨损减半，向下取整。每场一次。" },
  tire_extra_care: { name: "轮胎不敢告诉你它已经没了", effect: "本回合末额外移除 1 点磨损。每场一次。" },
  strategist_cycle: { name: "物理学不存在了", effect: "本回合末移除 1 热量并恢复 1 ERS。每场一次。" },
  segment_plan: { name: "赛段规划", effect: "本回合末移除 1 热量并恢复 1 ERS；本回合禁用晚刹标记。每场一次。" },
  extreme_duel: { name: "极限对决", effect: "下一次对抗 +2；失败必定进入接触判定。每场一次。" },
  specialist_duel: { name: "专精对决", effect: "本回合下一次超车或防守对抗 +2。每场一次。" },
  extreme_late_brake: { name: "极限晚刹", effect: "下一次晚刹忽略刹车热修正并直接成功。每场一次。" },
  overtake_salvage: { name: "继续北伐", effect: "本回合第一次超车失败改为轻接触流程。每场一次。" },
};

export const TALENT_UPGRADES: Record<TalentId, [string, string, string]> = {
  late_braker: [
    "每场额外获得 1 次不增加刹车热的晚刹 +2。",
    "每场一次把勉强晚刹改判为成功。",
    "每场一次极限晚刹：忽略刹车热并视为成功。",
  ],
  tire_whisperer: [
    "每场一回合将该回合全部磨损减半。",
    "软胎自然磨损改为隔回合增加。",
    "每场一次在回合末额外移除 1 磨损。",
  ],
  rain_master: [
    "雨地抓地检定额外 +1，不受天气转变时点限制。",
    "动态天气由干地转为雨地后的首回合，抓地检定额外 +2。",
    "雨段做出最快三圈时额外 +1 分，每场一次。",
  ],
  overtake_maniac: [
    "进攻方对抗再 +1。",
    "解锁“继续北伐”：每场一次将进攻失败改为轻接触流程。",
    "每场一次，同圈第二次超车对抗再 +1。",
  ],
  wide_train: [
    "每回合免费防守获得 +1 修正。",
    "每场额外增加一次免费防守，同一对抗不叠加。",
    "同圈连续成功防守两次，该圈结束时恢复 1 ERS。",
  ],
  strategist: [
    "每场两次将一枚战术标记转换为另一类型。",
    "解锁“物理学不存在了”：每场一回合结束时移除 1 热量并恢复 1 ERS。",
    "每场开始时再获得 1 枚任意战术标记。",
  ],
};

/** Effects which still have no legal trigger in the selected ruleset. */
export function talentUpgradeUnavailableReason(_talent: TalentId, _rank: number): string | null {
  return null;
}

export const TALENT_NODES: TalentNodeDefinition[] = [
  { id: "RC-1", branch: "racecraft", tier: 1, name: "刹车点读秒", prerequisites: [], minLevel: 1, effect: "晚刹检定 +1；每场一次可把失败改判为勉强。", active: true },
  { id: "RC-2", branch: "racecraft", tier: 1, name: "轮对轮意识", prerequisites: [], minLevel: 1, effect: "轻接触的 REL 检定 +1。", active: true },
  { id: "RC-3", branch: "racecraft", tier: 2, name: "外线节奏", prerequisites: ["RC-2"], minLevel: 2, effect: "弯道外线对抗 +1。", active: true },
  { id: "RC-4", branch: "racecraft", tier: 2, name: "出弯牵引", prerequisites: [], minLevel: 2, effect: "使用 MECH 的超车对抗 +1；成功外线超车后当回合再 +1 MP。", active: true },
  { id: "RC-5", branch: "racecraft", tier: 3, name: "攻防切换", prerequisites: ["RC-1", "RC-2"], minLevel: 3, effect: "同圈先防守成功再完成超车时额外 +5 本地分，每场一次。", active: true },
  { id: "RC-6", branch: "racecraft", tier: 4, name: "极限对决", prerequisites: ["RC-3", "RC-4"], minLevel: 4, effect: "每场一次，对抗前声明 +2；失败必触发接触并先结算。", active: true },
  { id: "ST-1", branch: "strategy", tier: 1, name: "能量管理", prerequisites: [], minLevel: 1, effect: "省油模式在回合末额外恢复 1 ERS。", active: true },
  { id: "ST-2", branch: "strategy", tier: 1, name: "进站窗口感知", prerequisites: [], minLevel: 1, effect: "SC/VSC 期间换胎维修服务额外少等 1 回合，最低为 0。", active: true },
  { id: "ST-3", branch: "strategy", tier: 2, name: "胎温掌控", prerequisites: [], minLevel: 2, effect: "换软胎维修后获得三枚保护标记；出站起每个行驶回合消耗一枚，免除该回合自然磨损，不免过弯和事件磨损。", active: true },
  { id: "ST-4", branch: "strategy", tier: 2, name: "灵活战术", prerequisites: ["ST-1"], minLevel: 2, effect: "每场一次，将一枚战术标记转换为另一类型。", active: true },
  { id: "ST-5", branch: "strategy", tier: 3, name: "安全车嗅觉", prerequisites: ["ST-2"], minLevel: 3, effect: "SC/VSC 触发回合获得 1 ERS 并移除 1 热量。", active: true },
  { id: "ST-6", branch: "strategy", tier: 4, name: "赛段规划", prerequisites: ["ST-3", "ST-4"], minLevel: 4, effect: "每场一次预先规划回合末 +1 ERS、-1 热量；该回合禁用晚刹标记。", active: true },
  { id: "TE-1", branch: "technical", tier: 1, name: "制动冷却", prerequisites: [], minLevel: 1, effect: "使用冷却标记时同时移除 1 刹车热。", active: true },
  { id: "TE-2", branch: "technical", tier: 1, name: "能量回收", prerequisites: [], minLevel: 1, effect: "本回合未部署 ERS 时，回合末额外恢复 1 ERS。", active: true },
  { id: "TE-3", branch: "technical", tier: 2, name: "底盘保护", prerequisites: [], minLevel: 2, effect: "每场首次轻损伤改为忽略。", active: true },
  { id: "TE-4", branch: "technical", tier: 2, name: "优秀空动", prerequisites: [], minLevel: 2, effect: "DRS 的 +1 MP 改为 +2 MP，每回合一次。", active: true },
  { id: "TE-5", branch: "technical", tier: 3, name: "可靠性调校", prerequisites: [], minLevel: 3, effect: "热量超标检定 +1。", active: true },
  { id: "TE-6", branch: "technical", tier: 4, name: "顺手的事", prerequisites: ["TE-1", "TE-3"], minLevel: 4, effect: "进站回合额外移除 1 热量并恢复 1 ERS。", active: true },
];

const UNLOCK_SLOTS: Array<{ level: number; tier: 1 | 2 | 3 | 4; flexible?: boolean; fallbackTier1?: boolean }> = [
  { level: 2, tier: 1 }, { level: 4, tier: 1 }, { level: 5, tier: 2, fallbackTier1: true },
  { level: 8, tier: 2 }, { level: 9, tier: 3 }, { level: 10, tier: 1 },
  { level: 13, tier: 4 }, { level: 14, tier: 3 }, { level: 16, tier: 4 },
  { level: 17, tier: 4, flexible: true }, { level: 20, tier: 4, flexible: true },
];

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function levelFromXp(xp: number): number {
  let level = 1;
  LEVEL_XP.forEach((threshold, index) => { if (xp >= threshold) level = index + 1; });
  return Math.min(20, level);
}

export function talentUpgradeRank(level: number): 0 | 1 | 2 | 3 {
  if (level >= 18) return 3;
  if (level >= 12) return 2;
  if (level >= 6) return 1;
  return 0;
}

export function createDriverCareer(startLevel = 1): DriverCareer {
  const level = Math.max(1, Math.min(20, Math.trunc(startLevel)));
  return { xp: LEVEL_XP[level - 1], level, races: 0, wins: 0, podiums: 0, dnfs: 0, season: 1, seasonStarts: 0, seasonPoints: 0, selectedNodes: [], processedRaceIds: [], preparationAvailable: true, preparationSeed: 1, preparationHistory: [] };
}

export function createTeamDevelopment(name: string, stats: CarStats): TeamDevelopment {
  return { name: name.trim() || "独立车队", developmentPoints: 0, totalDevelopmentPoints: 0, baseStats: clone(stats), upgrades: [], facilities: {}, facilityUpgrades: [] };
}

export function normalizeProfileDevelopment(profile: DriverProfile): DriverProfile {
  const career = { ...createDriverCareer(), ...clone(profile.career ?? {}) };
  career.level = levelFromXp(career.xp);
  career.selectedNodes = Array.isArray(career.selectedNodes) ? career.selectedNodes : [];
  career.processedRaceIds = Array.isArray(career.processedRaceIds) ? career.processedRaceIds.slice(-80) : [];
  career.preparationAvailable = career.preparationAvailable ?? true;
  career.preparationSeed = Number.isInteger(career.preparationSeed) ? career.preparationSeed : 1;
  career.preparationHistory = Array.isArray(career.preparationHistory) ? career.preparationHistory.slice(-12) : [];
  const teamDefaults = createTeamDevelopment(profile.team?.name ?? `${profile.abbreviation} 车队`, profile.stats);
  const storedTeam = clone(profile.team ?? teamDefaults);
  const team = {
    ...teamDefaults,
    ...storedTeam,
    facilities: { ...teamDefaults.facilities, ...(storedTeam.facilities ?? {}) },
    facilityUpgrades: Array.isArray(storedTeam.facilityUpgrades) ? storedTeam.facilityUpgrades : [],
    upgrades: Array.isArray(storedTeam.upgrades) ? storedTeam.upgrades : [],
  };
  return { ...clone(profile), career, team };
}

function nextPreparationRoll(seed: number): { seed: number; roll: number } {
  const value = (seed + 0x6d2b79f5) | 0;
  let mixed = Math.imul(value ^ (value >>> 15), value | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  const unit = ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  return { seed: value, roll: Math.floor(unit * 12) + 1 };
}

// Starting a race closes the action window, but the pending effect stays on the
// profile until a completed official race consumes it. This also preserves the
// effect when an unfinished local race is abandoned and recreated.
export function closePreparationWindow(profile: DriverProfile): DriverProfile {
  const normalized = normalizeProfileDevelopment(profile);
  normalized.career!.preparationAvailable = false;
  return normalized;
}

export function performOffTrackAction(profile: DriverProfile, actionId: OffTrackActionId): OffTrackActionResult {
  const normalized = normalizeProfileDevelopment(profile);
  const career = normalized.career!;
  const action = OFF_TRACK_ACTIONS[actionId];
  if (!action) return { ok: false, profile: normalized, error: "未知赛前训练项目。", roll: 0, modifier: 0, total: 0, summary: "训练未执行" };
  if (!career.preparationAvailable) return { ok: false, profile: normalized, error: "训练窗口已关闭；完成一场正式正赛后重新开放。", roll: 0, modifier: 0, total: 0, summary: "训练窗口已关闭" };
  const random = nextPreparationRoll(career.preparationSeed ?? 1);
  career.preparationSeed = random.seed;
  const modifier = normalized.stats.rel + (actionId === "simulator" && career.level >= 3 ? 1 : 0);
  const total = random.roll + modifier;
  const success = total >= action.target;
  career.preparationAvailable = false;
  career.pendingPreparation = success ? {
    actionId,
    startMp: actionId === "simulator" ? 1 : 0,
    lateBrakeBonus: actionId === "simulator" && total >= 14 ? 1 : 0,
    lightDamageShield: actionId === "fitness" ? 1 : 0,
  } : undefined;
  career.preparationHistory ??= [];
  career.preparationHistory.push({ actionId, roll: random.roll, modifier, total, success, season: career.season });
  career.preparationHistory = career.preparationHistory.slice(-12);
  const summary = success
    ? `${action.name}成功：D12(${random.roll}) + 修正(${modifier}) = ${total}`
    : `${action.name}未通过：D12(${random.roll}) + 修正(${modifier}) = ${total}`;
  return { ok: true, profile: normalized, roll: random.roll, modifier, total, summary };
}

export function pendingTalentSlot(profile: DriverProfile) {
  const career = normalizeProfileDevelopment(profile).career!;
  return UNLOCK_SLOTS.filter((slot) => slot.level <= career.level)[career.selectedNodes.length] ?? null;
}

export function availableTalentNodes(profile: DriverProfile): TalentNodeDefinition[] {
  const normalized = normalizeProfileDevelopment(profile);
  const career = normalized.career!;
  const slot = pendingTalentSlot(normalized);
  if (!slot) return [];
  const selected = new Set(career.selectedNodes);
  const eligible = TALENT_NODES.filter((node) =>
    !selected.has(node.id) &&
    node.minLevel <= career.level &&
    node.prerequisites.every((id) => selected.has(id)) &&
    (slot.flexible ? node.tier <= slot.tier : node.tier === slot.tier),
  );
  if (eligible.length || !slot.fallbackTier1) return eligible;
  return TALENT_NODES.filter((node) => !selected.has(node.id) && node.tier === 1 && node.minLevel <= career.level);
}

export function unlockTalentNode(profile: DriverProfile, nodeId: TalentNodeId): DevelopmentResult {
  const normalized = normalizeProfileDevelopment(profile);
  const node = availableTalentNodes(normalized).find((candidate) => candidate.id === nodeId);
  if (!node) {
    return { ok: false, profile: normalized, error: "该节点不符合当前等级、层级或前置条件。" };
  }
  if (!node.active) return { ok: false, profile: normalized, error: "该节点依赖尚未启用的 SC/VSC 赛制。" };
  normalized.career!.selectedNodes.push(nodeId);
  return { ok: true, profile: normalized };
}

export function selectSignatureMove(profile: DriverProfile, move: SignatureMoveId): DevelopmentResult {
  const normalized = normalizeProfileDevelopment(profile);
  if (normalized.career!.level < 10) return { ok: false, profile: normalized, error: "车手达到 Lv10 后才能选择招牌动作。" };
  if (normalized.career!.signatureMove) return { ok: false, profile: normalized, error: "招牌动作已经确定。" };
  normalized.career!.signatureMove = move;
  return { ok: true, profile: normalized };
}

export function selectDriverSpecialization(profile: DriverProfile, specialization: DriverSpecializationId): DevelopmentResult {
  const normalized = normalizeProfileDevelopment(profile);
  if (normalized.career!.level < 3) return { ok: false, profile: normalized, error: "车手达到 Lv3 后才能选择专精路径。" };
  if (normalized.career!.specialization) return { ok: false, profile: normalized, error: "专精路径已经确定。" };
  normalized.career!.specialization = specialization;
  return { ok: true, profile: normalized };
}

export function upgradeSignatureMove(profile: DriverProfile, choice: "extra_use" | "enhanced"): DevelopmentResult {
  const normalized = normalizeProfileDevelopment(profile);
  if (normalized.career!.level < 20 || !normalized.career!.signatureMove) {
    return { ok: false, profile: normalized, error: "车手达到 Lv20 且已选择招牌动作后才能升级。" };
  }
  if (normalized.career!.signatureUpgrade) return { ok: false, profile: normalized, error: "招牌动作已经升级。" };
  normalized.career!.signatureUpgrade = choice;
  return { ok: true, profile: normalized };
}

export function teamUpgradeCost(currentValue: number): number {
  return ({ 1: 3, 2: 5, 3: 7, 4: 10 } as Record<number, number>)[currentValue] ?? Number.POSITIVE_INFINITY;
}

export function purchaseTeamUpgrade(profile: DriverProfile, stat: StatKey): DevelopmentResult {
  const normalized = normalizeProfileDevelopment(profile);
  const current = normalized.stats[stat];
  const total = Object.values(normalized.stats).reduce((sum, value) => sum + value, 0);
  if (current >= 5) return { ok: false, profile: normalized, error: "该属性已经达到研发上限 5。" };
  if (total >= 15) return { ok: false, profile: normalized, error: "赛车性能指数已经达到赛季上限 15。" };
  const cost = teamUpgradeCost(current);
  if (normalized.team!.developmentPoints < cost) return { ok: false, profile: normalized, error: `需要 ${cost} 点研发点。` };
  normalized.team!.developmentPoints -= cost;
  normalized.stats[stat] = current + 1;
  normalized.team!.upgrades.push({ stat, from: current, to: current + 1, season: normalized.career!.season });
  return { ok: true, profile: normalized };
}

export function purchaseTeamFacility(profile: DriverProfile, facilityId: TeamFacilityId): DevelopmentResult {
  const normalized = normalizeProfileDevelopment(profile);
  const definition = TEAM_FACILITIES.find((item) => item.id === facilityId);
  if (!definition) return { ok: false, profile: normalized, error: "未知车队研发项目。" };
  const level = normalized.team!.facilities?.[facilityId] ?? 0;
  if (level >= definition.costs.length) return { ok: false, profile: normalized, error: "该研发项目已经达到最高等级。" };
  const cost = definition.costs[level];
  if (normalized.team!.developmentPoints < cost) return { ok: false, profile: normalized, error: `需要 ${cost} 点研发点。` };
  normalized.team!.developmentPoints -= cost;
  normalized.team!.facilities ??= {};
  normalized.team!.facilityUpgrades ??= [];
  normalized.team!.facilities[facilityId] = level + 1;
  normalized.team!.facilityUpgrades.push({ facility: facilityId, level: level + 1, cost, season: normalized.career!.season });
  return { ok: true, profile: normalized };
}

export function applyRaceDevelopment(profile: DriverProfile, game: GameState): { profile: DriverProfile; reward: CareerReward | null } {
  // Test sessions must not normalize or otherwise mutate persistent development.
  if (game.sessionMode === "simulation" || profile.id !== game.humanDriverId) return { profile: clone(profile), reward: null };
  const normalized = normalizeProfileDevelopment(profile);
  const career = normalized.career!;
  if (game.phase !== "finished" || career.processedRaceIds.includes(game.id)) return { profile: normalized, reward: null };
  const result = game.results.find((entry) => entry.driverId === game.humanDriverId);
  if (!result) return { profile: normalized, reward: null };
  const championshipPoints = result.points;
  const developmentPoints = result.status === "dnf" ? 1 : result.rank === 1 ? 6 : result.rank === 2 ? 5 : result.rank === 3 ? 4 : 3;
  const levelBefore = career.level;
  career.xp += championshipPoints;
  career.level = levelFromXp(career.xp);
  career.races += 1;
  career.seasonStarts += 1;
  career.seasonPoints += championshipPoints;
  if (result.rank === 1 && result.status !== "dnf") career.wins += 1;
  if (result.rank <= 3 && result.status !== "dnf") career.podiums += 1;
  if (result.status === "dnf") career.dnfs += 1;
  career.processedRaceIds.push(game.id);
  career.processedRaceIds = career.processedRaceIds.slice(-80);
  normalized.team!.developmentPoints += developmentPoints;
  normalized.team!.totalDevelopmentPoints += developmentPoints;
  career.preparationAvailable = true;
  career.pendingPreparation = undefined;
  return { profile: normalized, reward: { championshipPoints, developmentPoints, levelBefore, levelAfter: career.level } };
}

export function hasTalentNode(profile: DriverProfile, nodeId: TalentNodeId): boolean {
  return Boolean(profile.career?.selectedNodes.includes(nodeId));
}

export function hasMinorTalent(profile: DriverProfile, talentId: MinorTalentId): boolean {
  return Boolean(profile.minorTalents?.includes(talentId));
}

export function availableTalentActions(profile: DriverProfile): TalentActionId[] {
  const normalized = normalizeProfileDevelopment(profile);
  const rank = talentUpgradeRank(normalized.career!.level);
  const result: TalentActionId[] = [];
  if (normalized.talent === "tire_whisperer" && rank >= 1) result.push("tire_conserve");
  if (normalized.talent === "tire_whisperer" && rank >= 3) result.push("tire_extra_care");
  if (normalized.talent === "strategist" && rank >= 2) result.push("strategist_cycle");
  if (normalized.talent === "late_braker" && rank >= 3) result.push("extreme_late_brake");
  if (normalized.talent === "overtake_maniac" && rank >= 2) result.push("overtake_salvage");
  if (hasTalentNode(normalized, "ST-6")) result.push("segment_plan");
  if (hasTalentNode(normalized, "RC-6")) result.push("extreme_duel");
  if (normalized.career!.specialization === "duel") result.push("specialist_duel");
  return result;
}

export function tokenSwapAllowance(profile: DriverProfile): number {
  const normalized = normalizeProfileDevelopment(profile);
  const strategist = normalized.talent === "strategist" && talentUpgradeRank(normalized.career!.level) >= 1 ? 2 : 0;
  const specialization = normalized.career!.specialization === "strategy" ? 1 : 0;
  return strategist + specialization + (hasTalentNode(normalized, "ST-4") ? 1 : 0);
}

export function rolloverSeason(profile: DriverProfile): DevelopmentResult {
  const normalized = normalizeProfileDevelopment(profile);
  const career = normalized.career!;
  const requiredStarts = Math.ceil(career.level / 5);
  if (career.seasonStarts < requiredStarts) {
    const lostLevels = Math.min(3, requiredStarts - career.seasonStarts);
    career.level = Math.max(1, career.level - lostLevels);
    career.xp = Math.min(career.xp, LEVEL_XP[career.level - 1]);
    const permittedNodes = UNLOCK_SLOTS.filter((slot) => slot.level <= career.level).length;
    career.selectedNodes = career.selectedNodes.slice(0, permittedNodes);
    if (career.level < 3) career.specialization = undefined;
    if (career.level < 10) career.signatureMove = undefined;
    if (career.level < 20) career.signatureUpgrade = undefined;
  }
  career.season += 1;
  career.seasonStarts = 0;
  career.seasonPoints = 0;
  return { ok: true, profile: normalized };
}
