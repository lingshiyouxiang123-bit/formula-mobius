import type { BurdenId, EngineMode, StatKey, TalentId, TireCompound, Weather } from "./types";

export const STAT_LABELS: Record<StatKey, string> = { eng: "ENG", aero: "AERO", mech: "MECH", brk: "BRK", rel: "REL" };
export const TALENT_LABELS: Record<TalentId, string> = { late_braker: "晚刹高手", tire_whisperer: "轮胎保姆", rain_master: "雨战之神", overtake_maniac: "超车狂人", wide_train: "宽体火车", strategist: "策略家" };
export const BURDEN_LABELS: Record<BurdenId, string> = { high_heat: "高热负担", tire_wear: "磨胎负担", scrutiny: "监管盯防", budget_cap: "预算帽", slow_pit: "进站慢" };
export const TIRE_LABELS: Record<TireCompound, string> = { hard: "硬胎", medium: "中胎", soft: "软胎", intermediate: "绿胎", wet: "蓝胎" };
export const MODE_LABELS: Record<EngineMode, string> = { save: "省油", balanced: "平衡", attack: "进攻" };
export const WEATHER_LABELS: Record<Weather, string> = { heavy_rain: "大雨", light_rain: "小雨", sunny: "晴天", cloudy: "阴天" };
