import type { Track } from "./types";
import { analyzeTrack, generateTrack } from "./trackGenerator";

/**
 * Built-in track catalogue.
 *
 * Add or edit preset circuits in this file. Segment lengths must add up to
 * `totalLength`, and `mapPoints` should contain one point for every track cell.
 */
export const DEMO_TRACK: Track = {
  id: "rules-example",
  name: "规则示例赛道",
  subtitle: "高速三角环 · 一段长弯",
  laps: 6,
  totalLength: 14,
  pitEntryCell: 13,
  pitExitCell: 0,
  segments: [
    { id: "straight-c", name: "DRS 直道 C", type: "straight", length: 6, drs: true },
    { id: "corner-1", name: "四号弯", type: "corner", length: 4, cornerCost: 4 },
    { id: "straight-d", name: "直道 D", type: "straight", length: 4 },
  ],
  mapPoints: [[90,76],[170,76],[250,76],[330,76],[410,76],[490,76],[570,76],[612,120],[616,208],[574,292],[510,346],[405,278],[300,211],[195,143]],
};

export const TECHNICAL_TRACK: Track = {
  id: "technical-loop",
  name: "技术环线",
  subtitle: "短直道 · 双弯区 · 高刹车负荷",
  laps: 6,
  totalLength: 14,
  pitEntryCell: 13,
  pitExitCell: 0,
  segments: [
    { id: "tech-straight-a", name: "主直道", type: "straight", length: 4, drs: true },
    { id: "tech-corner-a", name: "东侧组合弯", type: "corner", length: 3, cornerCost: 3 },
    { id: "tech-straight-b", name: "后直道", type: "straight", length: 3 },
    { id: "tech-corner-b", name: "终点发卡弯", type: "corner", length: 4, cornerCost: 5 },
  ],
  mapPoints: [[105,82],[220,82],[335,82],[450,82],[555,94],[602,146],[570,208],[480,224],[385,224],[290,224],[196,244],[126,300],[70,242],[68,152]],
};

export const POWER_TRACK: Track = {
  id: "power-loop",
  name: "动力环线",
  subtitle: "超长 DRS · 低下压力 · 高速回程",
  laps: 6,
  totalLength: 14,
  pitEntryCell: 13,
  pitExitCell: 0,
  segments: [
    { id: "power-straight-a", name: "主 DRS 直道", type: "straight", length: 7, drs: true },
    { id: "power-corner", name: "南端高速弯", type: "corner", length: 3, cornerCost: 4 },
    { id: "power-straight-b", name: "回程直道", type: "straight", length: 4 },
  ],
  mapPoints: [[70,90],[145,90],[220,90],[295,90],[370,90],[445,90],[520,90],[588,92],[625,150],[590,220],[520,278],[410,238],[300,198],[185,156]],
};

function presetFromGenerator(
  id: string,
  name: string,
  subtitle: string,
  archetype: NonNullable<Track["archetype"]>,
  seed: number,
): Track {
  const generated = generateTrack({ seed, archetype, size: "standard", complexity: "medium" });
  const preset: Track = { ...generated, id, name, subtitle, generated: undefined };
  return { ...preset, analysis: analyzeTrack(preset) };
}

export const POWER_GRAND_TRACK = presetFromGenerator("power-grand", "动力大奖赛道", "长直道 · 重刹区 · 低下压力", "power", 24001);
export const STREET_GRAND_TRACK = presetFromGenerator("street-grand", "港区街道赛道", "短直道 · 连续低速弯 · 排位优先", "street", 24002);
export const FLOWING_GRAND_TRACK = presetFromGenerator("flowing-grand", "高速流线赛道", "连续 S 弯 · 发卡 · 高速弧弯", "flowing", 24003);
export const MIXED_GRAND_TRACK = presetFromGenerator("mixed-grand", "综合大奖赛道", "动力与下压力平衡 · 规则基准", "mixed", 24004);

export const TRACKS = [
  { ...DEMO_TRACK, analysis: analyzeTrack(DEMO_TRACK) },
  { ...TECHNICAL_TRACK, analysis: analyzeTrack(TECHNICAL_TRACK) },
  { ...POWER_TRACK, analysis: analyzeTrack(POWER_TRACK) },
  POWER_GRAND_TRACK,
  STREET_GRAND_TRACK,
  FLOWING_GRAND_TRACK,
  MIXED_GRAND_TRACK,
] as const;
