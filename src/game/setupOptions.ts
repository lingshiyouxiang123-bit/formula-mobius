import type { WeekendSetup } from "./types";

export const BALANCED_WEEKEND_SETUP: WeekendSetup = {
  aero: "balanced",
  cooling: "balanced",
  suspension: "balanced",
};

/** Executable setup contract for the complete-weekend practice phase. */
export const WEEKEND_SETUP_GROUPS = [
  {
    id: "aero",
    name: "气动",
    options: [
      { id: "low", name: "低下压力", description: "每回合首次从直道开始 +1 MP；弯角消耗 +1。", effects: { firstStraightMp: 1, cornerCost: 1, draftBonus: 0 } },
      { id: "balanced", name: "平衡", description: "不修改 MP、弯角消耗或气流奖励。", effects: { firstStraightMp: 0, cornerCost: 0, draftBonus: 0 } },
      { id: "high", name: "高下压力", description: "弯角消耗 −1（最低 0）；DRS/尾流合计奖励 −1。", effects: { firstStraightMp: 0, cornerCost: -1, draftBonus: -1 } },
    ],
  },
  {
    id: "cooling",
    name: "冷却",
    options: [
      { id: "closed", name: "紧闭", description: "平衡/进攻模式 +1 MP；该回合额外 +1 热量。", effects: { mp: 1, heat: 1 } },
      { id: "balanced", name: "平衡", description: "不修改 MP 或回合末热量。", effects: { mp: 0, heat: 0 } },
      { id: "open", name: "开放", description: "总 MP −1；回合末额外移除 1 热量。", effects: { mp: -1, heat: -1 } },
    ],
  },
  {
    id: "suspension",
    name: "悬挂",
    options: [
      { id: "soft", name: "偏软", description: "每回合首次弯道磨损 −1；晚刹检定 −1。", effects: { firstCornerWear: -1, lateBrake: -1 } },
      { id: "balanced", name: "平衡", description: "不修改弯道磨损或晚刹检定。", effects: { firstCornerWear: 0, lateBrake: 0 } },
      { id: "stiff", name: "偏硬", description: "晚刹检定 +1；每次进入弯道额外磨损 +1。", effects: { firstCornerWear: 1, lateBrake: 1 } },
    ],
  },
] as const;
