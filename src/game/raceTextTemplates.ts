import type { RaceEventCode } from "./types";

/**
 * Stable display labels for event-driven text. Detailed sentences remain event facts;
 * later commentary/media layers select templates by these keys instead of inspecting UI text.
 */
export const RACE_TEXT_TEMPLATES: Record<RaceEventCode, { title: string; factKeys: string[] }> = {
  "race.info": { title: "比赛状态", factKeys: ["round", "phase"] },
  "dice.qualifying": { title: "排位判定", factKeys: ["driverId", "roll", "total"] },
  "dice.grip": { title: "雨地抓地", factKeys: ["driverId", "weather", "tire", "roll", "total"] },
  "dice.late_brake": { title: "晚刹判定", factKeys: ["driverId", "segmentId", "roll", "total"] },
  "dice.duel": { title: "攻防对抗", factKeys: ["attackerId", "defenderId", "rolls", "delta"] },
  "dice.contact": { title: "接触可靠性", factKeys: ["attackerId", "defenderId", "rolls", "loserId"] },
  "dice.penalty": { title: "赛会判罚", factKeys: ["driverId", "roll", "result"] },
  "dice.reliability": { title: "可靠性检定", factKeys: ["driverId", "roll", "result"] },
  "resource.change": { title: "资源变化", factKeys: ["driverId", "resource", "delta"] },
  "movement.step": { title: "车辆移动", factKeys: ["driverId", "from", "to"] },
  "incident.damage": { title: "车辆损伤", factKeys: ["driverId", "damage", "reason"] },
  "incident.contact": { title: "两车接触", factKeys: ["attackerId", "defenderId", "affectedDriverId", "damage"] },
  "incident.yellow": { title: "局部黄旗", factKeys: ["segmentId", "reason"] },
  "incident.race_control": { title: "赛事控制", factKeys: ["level", "roll", "total", "segmentId"] },
  "weather.transition": { title: "天气更新", factKeys: ["from", "to", "roll"] },
  "weekend.setup": { title: "周末调校", factKeys: ["aero", "cooling", "suspension"] },
  "weekend.sprint": { title: "冲刺赛", factKeys: ["rank", "points"] },
  "penalty.tire_obligation": { title: "轮胎义务", factKeys: ["driverId", "compounds", "penalty"] },
  "penalty.track_limit": { title: "赛道边界", factKeys: ["driverId", "count", "result"] },
  "penalty.time": { title: "赛后罚时", factKeys: ["driverId", "seconds", "cells"] },
  "pit.service": { title: "维修区服务", factKeys: ["driverId", "service", "wait"] },
  "ai.strategy": { title: "AI 策略公开", factKeys: ["driverId", "mode", "deployErs", "pit", "reason"] },
  "ai.decision": { title: "AI 行动决策", factKeys: ["driverId", "decision", "reason"] },
  "development.project": { title: "研发项目", factKeys: ["teamId", "stat", "mode", "result"] },
  "team.order": { title: "队令", factKeys: ["beneficiaryId", "yieldingDriverId", "reason", "result"] },
  "classification.result": { title: "比赛分类", factKeys: ["driverId", "rank", "status"] },
};
