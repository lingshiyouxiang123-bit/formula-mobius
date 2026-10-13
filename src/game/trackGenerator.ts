import type {
  CornerClass,
  CornerDirection,
  DrsZone,
  Track,
  TrackAnalysis,
  TrackArchetype,
  TrackComplexity,
  TrackSegment,
  TrackSize,
} from "./types";

export const TRACK_GENERATOR_VERSION = 1;

export interface TrackGeneratorOptions {
  seed: number;
  archetype: TrackArchetype;
  size: TrackSize;
  complexity: TrackComplexity;
  drsCount?: number;
}

interface TemplateSection {
  key: string;
  name: string;
  type: "straight" | "corner";
  minimum: number;
  weight: number;
  start: [number, number];
  end: [number, number];
  control?: [number, number];
  cornerCost?: number;
  cornerClass?: CornerClass;
  direction?: CornerDirection;
  sequenceId?: string;
  drsCandidate?: boolean;
}

const ARCHETYPE_CODE: Record<TrackArchetype, string> = {
  power: "PWR",
  street: "STR",
  flowing: "FLW",
  mixed: "MIX",
};

const SIZE_TARGET: Record<TrackSize, number> = { compact: 20, standard: 28, long: 40 };

const TEMPLATES: Record<TrackArchetype, TemplateSection[]> = {
  power: [
    { key: "main", name: "主 DRS 直道", type: "straight", minimum: 6, weight: 5, start: [100, 78], end: [520, 78], drsCandidate: true },
    { key: "first-stop", name: "一号重刹弯", type: "corner", minimum: 2, weight: 1, start: [520, 78], end: [610, 168], control: [612, 76], cornerCost: 5, cornerClass: "hairpin", direction: "right" },
    { key: "back", name: "后场 DRS 直道", type: "straight", minimum: 4, weight: 4, start: [610, 168], end: [430, 320], drsCandidate: true },
    { key: "south", name: "南端发卡弯", type: "corner", minimum: 2, weight: 1, start: [430, 320], end: [250, 330], control: [335, 382], cornerCost: 5, cornerClass: "hairpin", direction: "right" },
    { key: "return", name: "动力回程段", type: "straight", minimum: 3, weight: 3, start: [250, 330], end: [72, 176], drsCandidate: true },
    { key: "final", name: "终点高速弧弯", type: "corner", minimum: 3, weight: 2, start: [72, 176], end: [100, 78], control: [42, 92], cornerCost: 3, cornerClass: "fast", direction: "right" },
  ],
  street: [
    { key: "main", name: "港区主直道", type: "straight", minimum: 6, weight: 3, start: [118, 70], end: [500, 70], drsCandidate: true },
    { key: "harbour", name: "港口重刹弯", type: "corner", minimum: 2, weight: 2, start: [500, 70], end: [594, 144], control: [592, 70], cornerCost: 5, cornerClass: "hairpin", direction: "right" },
    { key: "wall-a", name: "围墙短直道", type: "straight", minimum: 2, weight: 1, start: [594, 144], end: [548, 238] },
    { key: "pool-a", name: "泳池左弯", type: "corner", minimum: 2, weight: 2, start: [548, 238], end: [454, 270], control: [520, 292], cornerCost: 4, cornerClass: "slow", direction: "left", sequenceId: "street-esses" },
    { key: "pool-b", name: "泳池右弯", type: "corner", minimum: 2, weight: 2, start: [454, 270], end: [360, 230], control: [405, 205], cornerCost: 4, cornerClass: "slow", direction: "right", sequenceId: "street-esses" },
    { key: "tunnel", name: "隧道短直道", type: "straight", minimum: 2, weight: 2, start: [360, 230], end: [224, 304], drsCandidate: true },
    { key: "station", name: "车站发卡弯", type: "corner", minimum: 2, weight: 2, start: [224, 304], end: [78, 202], control: [72, 316], cornerCost: 5, cornerClass: "hairpin", direction: "right" },
    { key: "finish", name: "终点接近段", type: "straight", minimum: 2, weight: 2, start: [78, 202], end: [118, 70] },
  ],
  flowing: [
    { key: "main", name: "主直道", type: "straight", minimum: 6, weight: 3, start: [94, 78], end: [492, 78], drsCandidate: true },
    { key: "esses-a", name: "S 弯前段", type: "corner", minimum: 2, weight: 3, start: [492, 78], end: [588, 160], control: [574, 76], cornerCost: 3, cornerClass: "medium", direction: "right", sequenceId: "flowing-esses" },
    { key: "esses-b", name: "S 弯后段", type: "corner", minimum: 2, weight: 3, start: [588, 160], end: [498, 238], control: [584, 244], cornerCost: 3, cornerClass: "medium", direction: "left", sequenceId: "flowing-esses" },
    { key: "ridge", name: "山脊直道", type: "straight", minimum: 3, weight: 2, start: [498, 238], end: [330, 302], drsCandidate: true },
    { key: "hairpin", name: "低速发卡弯", type: "corner", minimum: 2, weight: 1, start: [330, 302], end: [186, 286], control: [246, 360], cornerCost: 5, cornerClass: "hairpin", direction: "right" },
    { key: "sweeper", name: "高速长弧弯", type: "corner", minimum: 3, weight: 4, start: [186, 286], end: [66, 170], control: [54, 278], cornerCost: 2, cornerClass: "fast", direction: "right" },
    { key: "finish", name: "终点接近段", type: "straight", minimum: 2, weight: 2, start: [66, 170], end: [94, 78] },
  ],
  mixed: [
    { key: "main", name: "主 DRS 直道", type: "straight", minimum: 6, weight: 3, start: [96, 76], end: [500, 76], drsCandidate: true },
    { key: "turn-one", name: "一号制动弯", type: "corner", minimum: 2, weight: 2, start: [500, 76], end: [598, 170], control: [598, 78], cornerCost: 5, cornerClass: "slow", direction: "right" },
    { key: "middle", name: "中段直道", type: "straight", minimum: 3, weight: 2, start: [598, 170], end: [442, 300], drsCandidate: true },
    { key: "complex-a", name: "组合弯前段", type: "corner", minimum: 2, weight: 2, start: [442, 300], end: [302, 324], control: [374, 360], cornerCost: 4, cornerClass: "medium", direction: "right", sequenceId: "mixed-complex" },
    { key: "complex-b", name: "组合弯后段", type: "corner", minimum: 2, weight: 2, start: [302, 324], end: [184, 270], control: [246, 250], cornerCost: 3, cornerClass: "medium", direction: "left", sequenceId: "mixed-complex" },
    { key: "return", name: "回程直道", type: "straight", minimum: 3, weight: 2, start: [184, 270], end: [68, 170], drsCandidate: true },
    { key: "final", name: "终点高速弯", type: "corner", minimum: 2, weight: 2, start: [68, 170], end: [96, 76], control: [40, 90], cornerCost: 3, cornerClass: "fast", direction: "right" },
  ],
};

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    let value = (state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function allocateLengths(template: TemplateSection[], target: number, complexity: TrackComplexity, random: () => number): number[] {
  const lengths = template.map((section) => section.minimum);
  let remaining = target - lengths.reduce((sum, value) => sum + value, 0);
  if (remaining < 0) throw new Error("所选原型无法压缩到目标格数");
  while (remaining > 0) {
    const weights = template.map((section) => {
      const bias = complexity === "high" ? (section.type === "corner" ? 1.7 : .8) : complexity === "low" ? (section.type === "straight" ? 1.6 : .7) : 1;
      return section.weight * bias;
    });
    const total = weights.reduce((sum, value) => sum + value, 0);
    let cursor = random() * total;
    let index = 0;
    for (; index < weights.length - 1; index += 1) {
      cursor -= weights[index];
      if (cursor <= 0) break;
    }
    lengths[index] += 1;
    remaining -= 1;
  }
  return lengths;
}

function sampleSection(section: TemplateSection, length: number): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let index = 0; index < length; index += 1) {
    const t = index / length;
    if (!section.control) {
      points.push([
        section.start[0] + (section.end[0] - section.start[0]) * t,
        section.start[1] + (section.end[1] - section.start[1]) * t,
      ]);
      continue;
    }
    const inverse = 1 - t;
    points.push([
      inverse * inverse * section.start[0] + 2 * inverse * t * section.control[0] + t * t * section.end[0],
      inverse * inverse * section.start[1] + 2 * inverse * t * section.control[1] + t * t * section.end[1],
    ]);
  }
  return points.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
}

function chooseLaps(effectiveLapLoad: number): number {
  const legal = [2, 3, 4, 5, 6].filter((laps) => effectiveLapLoad * laps >= 105 && effectiveLapLoad * laps <= 150);
  const candidates = legal.length ? legal : [2, 3, 4, 5, 6];
  return candidates.sort((a, b) => Math.abs(effectiveLapLoad * a - 120) - Math.abs(effectiveLapLoad * b - 120) || b - a)[0];
}

function zoneForSegment(segment: TrackSegment, start: number, index: number): DrsZone {
  const startCell = Math.min(start + Math.max(1, Math.floor(segment.length * .2)), start + segment.length - 1);
  return {
    id: `drs-${index + 1}`,
    segmentId: segment.id,
    detectionCell: (startCell - 1 + 10_000) % 10_000,
    startCell,
    endCell: start + segment.length - 1,
  };
}

export function analyzeTrack(track: Omit<Track, "analysis"> | Track): TrackAnalysis {
  const straightCells = track.segments.filter((segment) => segment.type === "straight").reduce((sum, segment) => sum + segment.length, 0);
  const cornerSegments = track.segments.filter((segment) => segment.type === "corner");
  const cornerLoad = cornerSegments.reduce((sum, segment) => sum + (segment.cornerCost ?? 0), 0);
  const effectiveLapLoad = track.totalLength + cornerLoad;
  const drsCells = track.drsZones?.reduce((sum, zone) => sum + Math.max(0, zone.endCell - zone.startCell + 1), 0)
    ?? track.segments.filter((segment) => segment.drs).reduce((sum, segment) => sum + segment.length, 0);
  const brakingZones = track.segments.filter((segment, index) => segment.type === "straight" && track.segments[(index + 1) % track.segments.length]?.type === "corner").length;
  const longestStraight = Math.max(0, ...track.segments.filter((segment) => segment.type === "straight").map((segment) => segment.length));
  const powerStress = Math.min(5, Math.max(1, Math.round(straightCells / track.totalLength * 5 + longestStraight / 10)));
  const aeroStress = Math.min(5, Math.max(1, Math.round(cornerSegments.length / 2 + cornerSegments.filter((segment) => segment.cornerClass === "fast").length)));
  const brakeStress = Math.min(5, Math.max(1, cornerSegments.filter((segment) => (segment.cornerCost ?? 0) >= 4).length + 1));
  const tireStress = Math.min(5, Math.max(1, Math.round(cornerSegments.length * track.laps / 5)));
  return {
    straightRatio: straightCells / track.totalLength,
    cornerLoad,
    effectiveLapLoad,
    effectiveRaceLoad: effectiveLapLoad * track.laps,
    longestStraight,
    brakingZones,
    idealLineOpportunities: cornerSegments.length,
    drsCoverage: drsCells / track.totalLength,
    powerStress,
    aeroStress,
    brakeStress,
    tireStress,
    dangerRating: Math.min(5, Math.max(1, Math.round((brakeStress + tireStress + cornerSegments.filter((segment) => (segment.cornerCost ?? 0) >= 5).length) / 2))),
    expectedRounds: {
      minimum: Math.max(1, Math.ceil(effectiveLapLoad * track.laps / 10)),
      maximum: Math.max(2, Math.ceil(effectiveLapLoad * track.laps / 5)),
    },
  };
}

function cross(a: [number, number], b: [number, number], c: [number, number]): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function edgesIntersect(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  const abC = cross(a, b, c); const abD = cross(a, b, d); const cdA = cross(c, d, a); const cdB = cross(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

export function validateTrack(track: Track): string[] {
  const errors: string[] = [];
  const length = track.segments.reduce((sum, segment) => sum + segment.length, 0);
  if (length !== track.totalLength) errors.push(`赛段长度 ${length} 与总格数 ${track.totalLength} 不一致`);
  if (track.mapPoints.length !== track.totalLength) errors.push("地图点数量必须等于总格数");
  if (track.totalLength < 14 || track.totalLength > 48) errors.push("赛道格数必须在 14–48 之间");
  if (track.totalLength >= 24 && !track.segments.some((segment) => segment.type === "straight" && segment.length >= 6)) errors.push("长赛道缺少可容纳六车双列发车的主直道");
  const brakingZones = track.segments.filter((segment, index) => segment.type === "straight" && track.segments[(index + 1) % track.segments.length]?.type === "corner").length;
  if (track.totalLength >= 24 && brakingZones < 2) errors.push("长赛道至少需要两个直道末端制动区");
  if (track.segments.some((segment) => segment.type === "corner" && ((segment.cornerCost ?? 0) < 2 || (segment.cornerCost ?? 0) > 6))) errors.push("弯角值必须在 2–6 之间");
  if (track.pitEntryCell < Math.floor(track.totalLength * .8) || track.pitEntryCell >= track.totalLength) errors.push("维修区入口必须位于路线最后 20%");
  if (track.pitExitCell < 0 || track.pitExitCell > Math.ceil(track.totalLength * .2)) errors.push("维修区出口必须位于路线最初 20%");
  const fallbackDrsCount = track.segments.filter((segment) => segment.type === "straight" && segment.drs).length;
  const drsCount = track.drsZones?.length ?? fallbackDrsCount;
  if (drsCount < 1 || drsCount > 3) errors.push("赛道必须包含 1–3 个 DRS 区");
  for (const zone of track.drsZones ?? []) {
    const segment = track.segments.find((item) => item.id === zone.segmentId);
    if (!segment || segment.type !== "straight" || segment.length < 4) errors.push(`${zone.id} 不在至少 4 格的直道上`);
    if (zone.startCell > zone.endCell || zone.startCell < 0 || zone.endCell >= track.totalLength) errors.push(`${zone.id} 的启用区间无效`);
  }
  const points = track.mapPoints;
  for (let index = 0; index < points.length; index += 1) {
    const nextIndex = (index + 1) % points.length;
    if (!Number.isFinite(points[index][0]) || !Number.isFinite(points[index][1])) errors.push("地图包含非有限坐标");
    if (Math.hypot(points[index][0] - points[nextIndex][0], points[index][1] - points[nextIndex][1]) < 1) errors.push(`第 ${index + 1} 格与下一格重叠`);
    for (let other = index + 2; other < points.length; other += 1) {
      const otherNext = (other + 1) % points.length;
      if (otherNext === index || nextIndex === other) continue;
      if (edgesIntersect(points[index], points[nextIndex], points[other], points[otherNext])) errors.push(`地图边 ${index + 1} 与 ${other + 1} 自交`);
    }
  }
  return [...new Set(errors)];
}

function buildCandidate(options: TrackGeneratorOptions, attempt: number): Track {
  const random = seededRandom((options.seed + attempt * 0x9e3779b9) >>> 0);
  const template = TEMPLATES[options.archetype];
  const lengths = allocateLengths(template, SIZE_TARGET[options.size], options.complexity, random);
  const costDelta = options.complexity === "high" ? 1 : options.complexity === "low" ? -1 : 0;
  const segments: TrackSegment[] = template.map((section, index) => ({
    id: `${ARCHETYPE_CODE[options.archetype].toLowerCase()}-${section.key}`,
    name: section.name,
    type: section.type,
    length: lengths[index],
    cornerCost: section.type === "corner" ? Math.min(6, Math.max(2, (section.cornerCost ?? 3) + costDelta)) : undefined,
    cornerClass: section.cornerClass,
    direction: section.direction,
    sequenceId: section.sequenceId,
    sector: (index < template.length / 3 ? 1 : index < template.length * 2 / 3 ? 2 : 3) as 1 | 2 | 3,
    elevation: Math.round((random() - .5) * 6),
  }));
  const starts: number[] = [];
  segments.reduce((cursor, segment) => { starts.push(cursor); return cursor + segment.length; }, 0);
  const drsCandidates = template
    .map((section, index) => ({ section, index, length: lengths[index] }))
    .filter(({ section, length }) => section.type === "straight" && section.drsCandidate && length >= 4)
    .sort((a, b) => b.length - a.length || a.index - b.index);
  const desiredDrs = Math.min(3, Math.max(1, options.drsCount ?? (options.archetype === "power" ? 3 : options.archetype === "street" || options.archetype === "flowing" ? 1 : 2)));
  const selected = drsCandidates.slice(0, desiredDrs);
  selected.forEach(({ index }) => { segments[index].drs = true; });
  const totalLength = lengths.reduce((sum, value) => sum + value, 0);
  const drsZones = selected.map(({ index }, zoneIndex) => {
    const zone = zoneForSegment(segments[index], starts[index], zoneIndex);
    zone.detectionCell %= totalLength;
    return zone;
  });
  const cornerLoad = segments.reduce((sum, segment) => sum + (segment.cornerCost ?? 0), 0);
  const laps = chooseLaps(totalLength + cornerLoad);
  const seedCode = (options.seed >>> 0).toString(16).toUpperCase().padStart(8, "0").slice(-4);
  const base: Track = {
    id: `generated-${TRACK_GENERATOR_VERSION}-${options.archetype}-${options.size}-${options.complexity}-${options.seed >>> 0}`,
    name: `GEN-${ARCHETYPE_CODE[options.archetype]}-${seedCode}`,
    subtitle: `${options.archetype.toUpperCase()} · ${options.size.toUpperCase()} · SEED ${options.seed >>> 0}`,
    laps,
    totalLength,
    pitEntryCell: totalLength - 2,
    pitExitCell: 1,
    segments,
    mapPoints: template.flatMap((section, index) => sampleSection(section, lengths[index])),
    drsZones,
    archetype: options.archetype,
    size: options.size,
    generated: { seed: options.seed >>> 0, generatorVersion: TRACK_GENERATOR_VERSION, complexity: options.complexity },
  };
  return { ...base, analysis: analyzeTrack(base) };
}

export function generateTrack(options: TrackGeneratorOptions): Track {
  if (!Number.isInteger(options.seed) || options.seed < 1 || options.seed > 0xffffffff) throw new Error("赛道种子必须是 1–4294967295 的整数");
  let lastErrors: string[] = [];
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const candidate = buildCandidate(options, attempt);
    lastErrors = validateTrack(candidate);
    if (lastErrors.length === 0) return candidate;
  }
  throw new Error(`该种子无法生成合法赛道：${lastErrors.join("；")}`);
}

export function isDrsCell(track: Track, cell: number): boolean {
  const normalized = ((cell % track.totalLength) + track.totalLength) % track.totalLength;
  if (track.drsZones?.length) return track.drsZones.some((zone) => normalized >= zone.startCell && normalized <= zone.endCell);
  let cursor = 0;
  for (const segment of track.segments) {
    if (normalized >= cursor && normalized < cursor + segment.length) return Boolean(segment.drs);
    cursor += segment.length;
  }
  return false;
}
