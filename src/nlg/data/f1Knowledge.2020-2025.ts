import type { NlgFact } from "../types";

/** Stable, deliberately small 2020–2025 rules/ecosystem pack; no live claims. */
const provenance = { sourceDate: "2025-01-01", applicableYears: "2020–2025", expiresWhen: "启用 2026 或更新规则包" };

const knowledge: NlgFact[] = [
  { id: "rule-drs", topic: "rules", predicate: "drs", value: true, certainty: "fact", ruleRef: "赛会规则 / DRS", text: "DRS 只在允许的赛段和条件下使用；本游戏在雨天及赛会控制期间关闭 DRS。" },
  { id: "rule-sc", topic: "rules", predicate: "safety_car", value: true, certainty: "fact", ruleRef: "赛会规则 / 安全车", text: "安全车阶段车阵被压缩并禁止正常超车；重新起步后才恢复竞赛。" },
  { id: "rule-vsc", topic: "rules", predicate: "virtual_safety_car", value: true, certainty: "fact", ruleRef: "赛会规则 / VSC", text: "VSC 要求全场降速并禁止正常超车，本游戏用受限移动模拟这一点。" },
  { id: "rule-tyres", topic: "rules", predicate: "tyre_compounds", value: true, certainty: "fact", ruleRef: "赛会规则 / 轮胎义务", text: "干地正赛通常需要使用不同规格的干胎；雨胎或中性胎条件下例外。本游戏在完整周末执行轮胎义务。" },
  { id: "rule-parc-ferme", topic: "rules", predicate: "parc_ferme", value: true, certainty: "fact", ruleRef: "赛会规则 / 封闭车场", text: "排位后的封闭车场限制设定修改；本游戏把违规改装处理为维修区发车。" },
  { id: "rule-cost-cap", topic: "development", predicate: "cost_cap", value: true, certainty: "fact", ruleRef: "赛会规则 / 预算", text: "车队受预算限制；本游戏用 BU 限制赛季研发、设施和维修开销。" },
  { id: "rule-atr", topic: "development", predicate: "atr", value: true, certainty: "fact", ruleRef: "赛会规则 / 空气动力学测试", text: "空气动力学测试限制按成绩分配不同测试额度；本游戏每两站重算 ATR 系数和研发槽。" },
  { id: "rule-late-brake", topic: "rules", predicate: "late_brake", value: true, certainty: "fact", ruleRef: "补充规则 4.4", text: "晚刹检定总值 10 以上成功，6–9 勉强，5 以下锁死；勉强后仍付不起弯角消耗也按锁死处理。" },
  { id: "rule-contact", topic: "rules", predicate: "contact", value: true, certainty: "fact", ruleRef: "补充规则 4.6", text: "攻防差值绝对值不超过 1 时发生接触；较高者取得位置，平手时防守者保位。" },
  { id: "rule-wear", topic: "rules", predicate: "wear", value: true, certainty: "fact", ruleRef: "补充规则 5.2", text: "轮胎磨损达到 9 后损失 1 MP，达到 12 会完全失去抓地并失控退赛。" },
];

export const F1_KNOWLEDGE_2020_2025: NlgFact[] = knowledge.map((fact) => ({ ...fact, ...provenance }));
