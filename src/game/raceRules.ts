import type { GameEvent, RaceEventCode, Weather } from "./types";

export const RACE_RULES = {
  qualifyingOverheat: { success: 8, compromised: 6, failure: 5 },
  lateBrake: { success: 10, marginal: 6, lockup: 5 },
  contact: { maximumCleanDelta: 1, heavyDamageMargin: 4 },
  penalty: { twentySecondMaximum: 1, fiveSecondMaximum: 6 },
  damage: { heatCap: 6, brakeHeatCap: 4, wornThreshold: 9, punctureThreshold: 12 },
  pit: { serviceRounds: 1, slowOutLapMpPenalty: 3, heavyRepairExtra: 1 },
  trackLimits: { formalWarning: 3, twentySecondPenalty: 4, fiveSecondPenaltyFrom: 5 },
  blueFlag: { lapGap: 1 },
  neutralization: { maxRounds: 2, restartGap: 3, maxCatchUpCells: 4 },
  wetGrip: {
    lightRainSlick: { success: 8, marginal: 6, failure: 5 },
    heavyRainSlick: { success: 10, marginal: 6, failure: 5 },
    heavyRainIntermediate: { success: 8, marginal: 6, failure: 5 },
    rainMasterBonus: 2,
  },
} as const;

export const INITIAL_WEATHER_BY_D12: ReadonlyArray<{ maximum: number; weather: Weather }> = [
  { maximum: 2, weather: "heavy_rain" },
  { maximum: 4, weather: "light_rain" },
  { maximum: 10, weather: "sunny" },
  { maximum: 12, weather: "cloudy" },
];

export function initialWeatherForRoll(roll: number): Weather {
  return INITIAL_WEATHER_BY_D12.find((entry) => roll <= entry.maximum)?.weather ?? "cloudy";
}

export const DYNAMIC_WEATHER_BY_D12: Record<Weather, ReadonlyArray<{ maximum: number; weather: Weather }>> = {
  sunny: [
    { maximum: 1, weather: "light_rain" },
    { maximum: 4, weather: "cloudy" },
    { maximum: 12, weather: "sunny" },
  ],
  cloudy: [
    { maximum: 1, weather: "heavy_rain" },
    { maximum: 4, weather: "light_rain" },
    { maximum: 6, weather: "sunny" },
    { maximum: 12, weather: "cloudy" },
  ],
  light_rain: [
    { maximum: 3, weather: "heavy_rain" },
    { maximum: 6, weather: "cloudy" },
    { maximum: 7, weather: "sunny" },
    { maximum: 12, weather: "light_rain" },
  ],
  heavy_rain: [
    { maximum: 4, weather: "light_rain" },
    { maximum: 5, weather: "cloudy" },
    { maximum: 12, weather: "heavy_rain" },
  ],
};

export function dynamicWeatherForRoll(current: Weather, roll: number): Weather {
  return DYNAMIC_WEATHER_BY_D12[current].find((entry) => roll <= entry.maximum)?.weather ?? current;
}

export function weatherForecast(current: Weather): Array<{ weather: Weather; chance: number }> {
  const counts = new Map<Weather, number>();
  for (let roll = 1; roll <= 12; roll += 1) {
    const weather = dynamicWeatherForRoll(current, roll);
    counts.set(weather, (counts.get(weather) ?? 0) + 1);
  }
  return [...counts.entries()].map(([weather, count]) => ({ weather, chance: count / 12 }));
}

export const RACE_EVENT_RULES: Record<RaceEventCode, { ruleRef: string; label: string }> = {
  "race.info": { ruleRef: "18.2", label: "比赛状态" },
  "dice.qualifying": { ruleRef: "18.2.5", label: "排位判定" },
  "dice.grip": { ruleRef: "18.2.4", label: "雨地抓地" },
  "dice.late_brake": { ruleRef: "18.2.3", label: "晚刹判定" },
  "dice.duel": { ruleRef: "18.2.3", label: "攻防对抗" },
  "dice.contact": { ruleRef: "18.2.3", label: "接触 REL" },
  "dice.penalty": { ruleRef: "18.2.3", label: "赛会判罚" },
  "dice.reliability": { ruleRef: "18.2.3 / 18.2.5", label: "可靠性" },
  "resource.change": { ruleRef: "18.2", label: "资源变化" },
  "movement.step": { ruleRef: "18.2.6 / 18.2.7", label: "车辆移动" },
  "incident.damage": { ruleRef: "18.2.3", label: "损伤事故" },
  "incident.contact": { ruleRef: "18.2.3", label: "两车接触" },
  "incident.yellow": { ruleRef: "18.2.6", label: "局部黄旗" },
  "incident.race_control": { ruleRef: "18.4.2–18.4.5", label: "赛事控制" },
  "weather.transition": { ruleRef: "18.4.1", label: "动态天气" },
  "weekend.setup": { ruleRef: "18.5", label: "周末调校" },
  "weekend.sprint": { ruleRef: "18.5", label: "冲刺赛" },
  "penalty.tire_obligation": { ruleRef: "18.5", label: "轮胎义务" },
  "development.project": { ruleRef: "18.7", label: "研发项目" },
  "team.order": { ruleRef: "18.8", label: "队令" },
  "penalty.track_limit": { ruleRef: "18.2.7", label: "赛道边界" },
  "penalty.time": { ruleRef: "18.2.3", label: "赛后罚时" },
  "pit.service": { ruleRef: "18.2.2", label: "维修区" },
  "ai.strategy": { ruleRef: "18.10 / M3", label: "AI 策略公开" },
  "ai.decision": { ruleRef: "18.10 / M3", label: "AI 行动决策" },
  "classification.result": { ruleRef: "18.2.1", label: "比赛分类" },
};

export function defaultEventCode(type: GameEvent["type"]): RaceEventCode {
  if (type === "roll") return "dice.reliability";
  if (type === "resource") return "resource.change";
  if (type === "move") return "movement.step";
  if (type === "incident") return "incident.damage";
  if (type === "result") return "classification.result";
  return "race.info";
}
