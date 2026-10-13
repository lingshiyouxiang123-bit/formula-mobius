import type { BurdenId, MinorTalentId, TalentId, TireCompound } from "./types";

export const TALENTS: Record<TalentId, { name: string; description: string; inactiveNote?: string }> = {
  late_braker: { name: "晚刹高手", description: "晚刹检定 +2；失败时轻伤改为 +1 刹车热。" },
  tire_whisperer: { name: "轮胎保姆", description: "回合末移除 1 点磨损；软胎改为隔回合移除。" },
  rain_master: {
    name: "雨战之神",
    description: "雨地抓地检定 +2；不能绕过雨天 DRS 与尾流关闭。",
  },
  overtake_maniac: { name: "超车狂人", description: "进攻超车 +2；失败时进入轻接触流程。" },
  wide_train: { name: "宽体火车", description: "每回合获得一次免费的防守效果。" },
  strategist: { name: "策略家", description: "赛前额外获得一枚任意战术标记。" },
};

export const MINOR_TALENTS: Record<MinorTalentId, { name: string; description: string }> = {
  drs_expert: { name: "DRS 达人", description: "DRS 区加速额外 +1 MP，且照常获得 ERS 充能。" },
  ers_management: { name: "ERS 管理", description: "未部署 ERS 时，回合末自然回充额外 +1。" },
  pit_perfection: { name: "进站极致", description: "换胎维修后实际出站当回合 +3 MP。" },
  outside_specialist: { name: "弯中专精", description: "弯中进攻与防守对抗 +1。" },
  durability: { name: "振金悬挂", description: "每场第一次轻损伤无效。" },
  launch_rocket: { name: "发车火箭", description: "第一回合 +2 MP，且被追上时必须通过对抗才能被超越。" },
  cooling_skill: { name: "冷却技巧", description: "冷却标记移除 3 热量，而非 2。" },
};

export const BURDENS: Record<BurdenId, { name: string; description: string }> = {
  high_heat: { name: "高热负担", description: "进攻模式额外 +1 热量。" },
  tire_wear: { name: "磨胎负担", description: "回合末自然磨损 +1。" },
  scrutiny: { name: "监管盯防", description: "判罚检定 -1。" },
  budget_cap: { name: "预算帽", description: "少一份自选初始战术资源。" },
  slow_pit: { name: "进站慢", description: "不增加停站等待；换胎维修后仅实际出站当回合 -3 MP。" },
};

export const TIRES: Record<TireCompound, { name: string; description: string }> = {
  hard: { name: "硬胎", description: "过弯 +1 磨损；无自然磨损。" },
  medium: { name: "中胎", description: "过弯 +1；每两回合自然 +1。" },
  soft: { name: "软胎", description: "直线 +1 MP；过弯 +2；每回合自然 +1。" },
  intermediate: { name: "绿胎", description: "雨中过弯 +1；干地每回合 +2。" },
  wet: { name: "蓝胎", description: "雨中过弯 +1；干地每回合 +3。" },
};

export const MODE_BONUS = { save: 0, balanced: 1, attack: 2 } as const;
export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;
