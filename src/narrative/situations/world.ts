import { TIRE_LABELS } from '../../game/uiLabels';
import type { DriverState, GameState } from '../../game/types';
import type { NarrativeEvent } from '../types';
import type { VoiceChannel } from '../raceVoiceContext';
import type { Observation, Situation, SpeakerView, VoiceMemory, WorldFact } from './types';
import { composeMessage } from './composer';

export const NEARBY_CELLS = 8;
export const controlLabels: Record<string, string> = { green: '绿旗', sc: 'SC', vsc: 'VSC', red_flag: '红旗', yellow: '黄旗' };
export function raceActive(game: GameState) {
  return game.round > 0 && !['setup', 'practice', 'qualifying', 'preRace', 'finished'].includes(game.phase);
}
export function newVoiceMemory(game: GameState): VoiceMemory {
  return { session: game.raceSession ?? 'race', sampledRound: -1, observations: {}, published: [], spoken: {}, sequence: 0 };
}
export function sameCrew(game: GameState, driverId: string, crewDriverId = game.humanDriverId): boolean {
  const driver = game.drivers.find(d => d.id === driverId), crew = game.drivers.find(d => d.id === crewDriverId);
  return driverId === crewDriverId || !!(driver?.profile.teamId && driver.profile.teamId === crew?.profile.teamId)
    || !!(crewDriverId === game.humanDriverId && driver?.isTeammate);
}
function hearRaceRadios(game: GameState, memory: VoiceMemory) {
  memory.heardRadio ??= []; memory.radioRounds ??= {};
  for (const driver of game.drivers) {
    if (sameCrew(game, driver.id) || driver.status !== 'racing' || game.round - (memory.radioRounds[driver.id] ?? -3) < 3) continue;
    // This is that car's OWN engineer using its OWN telemetry, speaking on a radio we can hear.
    const tag = driver.wear >= 9 ? 'own_tire_danger' : driver.heat >= 4 || driver.brakeHeat >= 3 ? 'own_heat_high'
      : driver.ers <= 2 ? 'own_ers_low' : driver.tactical.defense <= 1 ? 'own_defense_low' : undefined;
    if (!tag) continue;
    const resource = tag === 'own_tire_danger' ? 'wear' : tag === 'own_heat_high' ? 'heat' : tag === 'own_ers_low' ? 'ers' : 'defense';
    const situation = liveSituation(game, resource === 'wear' || resource === 'heat' ? 'tires' : 'duel', driver.id);
    const text = composeMessage({ situation, channel: 'engineer', persona: 'engineer', act: 'warn', stance: 'critical',
      facts: [], tags: [tag], preferredTags: [tag], slots: { driver: driver.profile.name, wear: driver.wear, heat: driver.heat,
        brakeHeat: driver.brakeHeat, ers: driver.ers, defense: driver.tactical.defense } }, [], (game.initialSeed ?? 905) + game.round * 97 + memory.sequence++);
    if (!text) continue;
    memory.heardRadio.push({ id: `${game.raceSession ?? 'race'}:${game.round}:${driver.id}:radio`, driverId: driver.id, round: game.round, text: text.text, resource, tag });
    memory.radioRounds[driver.id] = game.round;
  }
  memory.heardRadio = memory.heardRadio.filter(message => game.round - message.round <= 3).slice(-20);
}
export function prepareMemory(game: GameState, previous?: VoiceMemory): VoiceMemory {
  const memory = previous?.session === (game.raceSession ?? 'race') ? previous : newVoiceMemory(game);
  if (!raceActive(game) || memory.sampledRound === game.round) return memory;
  hearRaceRadios(game, memory);
  // Opponents have no telemetry feed. Estimate from visible timing/deployment/duels and heard radio.
  for (const driver of game.drivers) if (driver.status === 'racing' && !driver.pit) {
    const old = memory.observations[driver.id];
    const pitStops = driver.raceStats?.pitStops ?? 0;
    const stintStartRound = old?.pitStops === pitStops ? old.stintStartRound ?? 1 : game.round;
    const ersUses = driver.raceStats?.ersUsed ?? 0;
    const deployed = ersUses > (old?.ersUses ?? 0);
    const deployStreak = deployed ? (old?.deployStreak ?? 0) + 1 : 0;
    const recoveryStreak = deployed ? 0 : (old?.recoveryStreak ?? 0) + 1;
    const laps = driver.lapTiming?.completedRounds ?? [];
    const paceDropped = laps.length >= 2 && laps.at(-1)! - laps.at(-2)! >= 2;
    const observation: Observation = { driverId: driver.id, round: game.round, pitStops, stintStartRound, ersUses, deployStreak, recoveryStreak,
      wear: game.round - stintStartRound >= 6 || paceDropped ? 'high' : game.round - stintStartRound <= 2 ? 'low' : undefined,
      ers: deployStreak >= 2 ? 'low' : recoveryStreak >= 2 ? 'high' : undefined,
      defense: (driver.raceStats?.defensesWon ?? 0) >= 2 ? 'low' : 'available',
      sources: { wear: '圈速和stint', ers: '直道部署', defense: '攻防动作' } };
    for (const radio of memory.heardRadio ?? []) if (radio.driverId === driver.id && radio.resource !== 'heat') {
      if (radio.resource === 'wear') observation.wear = 'high';
      else if (radio.resource === 'ers') observation.ers = 'low';
      else observation.defense = 'low';
      observation.sources![radio.resource] = '对方无线电';
      observation.resourceRounds ??= {};
      observation.resourceRounds[radio.resource] = radio.round;
    }
    memory.observations[driver.id] = observation;
  }
  memory.sampledRound = game.round;
  memory.published = memory.published.filter(f => game.round - f.round <= 3);
  memory.spoken = Object.fromEntries(Object.entries(memory.spoken).filter(([, round]) => game.round - round <= 5));
  return memory;
}
export function fieldFact(game: GameState, driverId: string, predicate: string, value: WorldFact['value'], visibility: WorldFact['visibility'] = 'public', unit?: string): WorldFact {
  return { id: `${game.raceSession ?? 'race'}:${game.round}:${driverId}:${predicate}`, subjectId: driverId, predicate, value, unit, round: game.round, source: 'state', visibility, eventIds: [] };
}
export function liveSituation(game: GameState, topic: Situation['topic'], driverId: string, otherId?: string): Situation {
  return { id: `${game.id}:${game.raceSession ?? 'race'}:${game.round}:${topic}:${driverId}:${otherId ?? ''}`, topic, round: game.round,
    subjectIds: [driverId, ...(otherId ? [otherId] : [])], facts: [], importance: 2, focus: topic === 'duel' ? 'duel_close' : topic === 'tires' ? 'tire_worn' : 'control_neutral' };
}

// Event extraction is small and explicit. Language selection does not branch on combinations of these facts.
export function collectSituations(game: GameState, events: NarrativeEvent[]): Situation[] {
  const groups = new Map<string, Situation>();
  for (const event of events) {
    const log = game.logs.find(l => l.id === event.eventIds[0]);
    if (!log) continue;
    const input = log.details?.input ?? {}, result = log.details?.result;
    let topic: Situation['topic'] | undefined, focus: string | undefined;
    let subjects = event.subjects;
    let control: string | undefined;
    if (log.code === 'resource.change' && result === 'drs_used') {
      topic = 'duel'; focus = 'drs_used'; subjects = [String(input.driverId), ...(typeof input.otherDriverId === 'string' ? [input.otherDriverId] : [])];
    } else if (log.code === 'movement.step' && (result === 'overtake' || result === 'defended')) {
      topic = 'duel'; focus = result;
      subjects = result === 'overtake' ? [String(input.attackerId), String(input.defenderId)] : [String(input.defenderId), String(input.attackerId)];
    } else if (log.code === 'incident.contact') {
      topic = 'incident'; focus = 'contact'; subjects = [String(input.attackerId), String(input.defenderId)];
    } else if (log.code === 'pit.service' && (input.service === true || result === 'exited')) {
      topic = 'tires'; focus = result === 'exited' ? 'pit_exit' : 'pit_entry'; subjects = [String(input.driverId)];
    } else if (log.code === 'classification.result' && result === 'retired') {
      topic = 'incident'; focus = 'retired'; subjects = [String(input.driverId)];
    } else if (log.code === 'incident.yellow') {
      topic = 'incident'; focus = 'yellow'; control = 'yellow';
    } else if (log.code === 'incident.race_control') {
      control = ({ vsc_deployed: 'vsc', sc_deployed: 'sc', red_flag: 'red_flag', green: 'green' } as Record<string, string>)[result ?? ''];
      if (control) { topic = 'incident'; focus = control === 'green' ? 'control_green' : control === 'red_flag' ? 'control_stop' : 'control_neutral'; }
    }
    if (!topic || !focus) continue;
    subjects = subjects.filter(id => game.drivers.some(d => d.id === id));
    const key = `${log.round}:${topic}:${focus === 'yellow' || focus.startsWith('control_') ? 'flags' : subjects.join(':')}`;
    const group = groups.get(key) ?? { id: `${game.id}:${game.raceSession ?? 'race'}:${key}`, topic, round: log.round, subjectIds: subjects,
      facts: [], importance: event.importance, focus };
    const eventFact = (predicate: string, value: WorldFact['value'], subjectId = subjects[0] ?? 'race') => {
      group.facts.push({ id: `event-${log.id}:${predicate}`, subjectId, predicate, value, round: log.round, source: 'event', visibility: 'public', eventIds: [log.id] });
    };
    eventFact(focus, true);
    for (const key of ['position', 'lap', 'gapCells', 'lastLapRounds']) if (typeof input[key] === 'number') eventFact(key, input[key]);
    if (typeof input.gapCells === 'number' && input.gapCells <= NEARBY_CELLS) eventFact('duel_close', true);
    if (focus === 'contact') {
      const first = game.drivers.find(d => d.id === subjects[0]), second = game.drivers.find(d => d.id === subjects[1]);
      if (first?.profile.teamId && first.profile.teamId === second?.profile.teamId) eventFact('same_team', true);
      if (typeof input.damage === 'string') eventFact('damage', input.damage, String(input.affectedDriverId));
    }
    if (control) {
      // Later control message supersedes the local yellow in the same incoming batch.
      group.facts = group.facts.filter(f => f.predicate !== 'control');
      eventFact('control', control, 'race');
    }
    if (log.code === 'pit.service') {
      if (typeof input.tire === 'string') eventFact('tire', input.tire);
      if (typeof input.oldTire === 'string') eventFact('oldTire', input.oldTire);
    }
    group.focus = focus; group.importance = Math.max(group.importance, event.importance);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.importance - a.importance);
}

function addObservation(facts: WorldFact[], observation: Observation, predicates?: string[]) {
  const entries: Array<['wear' | 'ers' | 'defense', string | undefined]> = [['wear', observation.wear], ['ers', observation.ers], ['defense', observation.defense]];
  for (const [resource, value] of entries) if (value !== undefined && (!predicates || predicates.includes(resource))) facts.push({
    id: `observation:${observation.round}:${observation.driverId}:${resource}`, subjectId: observation.driverId, predicate: `intel_${resource}_${value}`,
    value, round: observation.resourceRounds?.[resource] ?? observation.round, source: observation.sources?.[resource] === '对方无线电' ? 'radio' : 'observation', sourceLabel: observation.sources?.[resource], visibility: 'intel', eventIds: [],
  });
}
export function speakerView(game: GameState, situation: Situation, channel: VoiceChannel, memory: VoiceMemory): SpeakerView {
  const primary = game.drivers.find(d => d.id === situation.subjectIds[0]);
  const other = game.drivers.find(d => d.id === situation.subjectIds[1]);
  const own = game.drivers.find(d => d.id === game.humanDriverId)!;
  const facts = [...situation.facts];
  const current = situation.round === game.round;
  const slots: SpeakerView['slots'] = {};
  for (const fact of facts) if (['position', 'lap', 'gapCells', 'lastLapRounds'].includes(fact.predicate)) slots[fact.predicate] = Number(fact.value);
  if (slots.gapCells !== undefined) slots.gap = slots.gapCells;
  if (primary) slots.driver = primary.profile.name;
  if (other) slots.otherDriver = other.profile.name;
  if (current && primary) {
    const ordered = game.drivers.filter(d => d.status !== 'dnf').slice().sort((a, b) => b.progress - a.progress || a.qualifyingRank - b.qualifyingRank);
    if (primary.status !== 'dnf' && slots.position === undefined) { slots.position = game.phase === 'finished' ? game.results.find(result => result.driverId === primary.id)?.rank ?? ordered.findIndex(d => d.id === primary.id) + 1 : ordered.findIndex(d => d.id === primary.id) + 1; facts.push(fieldFact(game, primary.id, 'position', slots.position)); }
    if (slots.lap === undefined) { slots.lap = Math.max(1, Math.min(game.sessionLaps ?? game.track.laps, Math.floor(Math.max(0, primary.progress) / game.track.totalLength) + 1)); facts.push(fieldFact(game, primary.id, 'lap', slots.lap)); }
    if (slots.lastLapRounds === undefined && primary.lapTiming?.completedRounds.length) { slots.lastLapRounds = primary.lapTiming.completedRounds.at(-1)!; facts.push(fieldFact(game, primary.id, 'lastLapRounds', slots.lastLapRounds, 'public', 'rounds')); }
    facts.push(fieldFact(game, primary.id, 'tire', primary.tire));
    const observation = memory.observations[primary.id];
    if (observation?.wear === 'high') facts.push(fieldFact(game, primary.id, 'tire_worn', true));
    if (observation?.wear === 'low') facts.push(fieldFact(game, primary.id, 'tire_fresh', true));
    if (other && primary.status === 'racing' && other.status === 'racing' && !primary.pit && !other.pit) {
      const gap = Math.abs(primary.progress - other.progress);
      if (slots.gapCells === undefined) { slots.gap = gap; slots.gapCells = gap; facts.push(fieldFact(game, primary.id, 'gap', gap, 'public', 'cells')); facts.push(fieldFact(game, primary.id, 'gapCells', gap, 'public', 'cells')); }
      if (gap <= NEARBY_CELLS) facts.push(fieldFact(game, primary.id, 'duel_close', true));
    }
    if (channel === 'engineer' && sameCrew(game, primary.id)) {
      slots.wear = primary.wear; slots.heat = primary.heat; slots.brakeHeat = primary.brakeHeat; slots.ers = primary.ers; slots.defense = primary.tactical.defense;
      for (const [resource, value] of Object.entries({ wear: primary.wear, heat: primary.heat, brakeHeat: primary.brakeHeat, ers: primary.ers, defense: primary.tactical.defense })) facts.push({ ...fieldFact(game, primary.id, resource, value, 'own'), source: 'telemetry' });
      facts.push({ ...fieldFact(game, primary.id, 'team_telemetry', true, 'own'), source: 'telemetry' });
      if (primary.wear >= 6) facts.push(fieldFact(game, primary.id, 'tire_worn', true, 'own'));
      if (primary.wear >= 9) facts.push(fieldFact(game, primary.id, 'own_tire_danger', true, 'own'));
      if (primary.heat >= 4 || primary.brakeHeat >= 3) facts.push(fieldFact(game, primary.id, 'own_heat_high', true, 'own'));
    }
    const observed = primary.id !== own.id ? memory.observations[primary.id] : undefined;
    if (channel === 'engineer' && !sameCrew(game, primary.id)) {
      if (observed && game.round - observed.round <= 3) addObservation(facts, observed);
      else facts.push(fieldFact(game, primary.id, 'intel_pending', true, 'intel'));
      if (observed?.sources) slots.intelSource = [...new Set(Object.values(observed.sources))].join('、');
    }
    if (channel === 'commentary' && game.round % 4 === 0 && observed && Math.abs(primary.progress - own.progress) <= NEARBY_CELLS) {
      // One coarse resource hint, not the whole private radio transcript.
      addObservation(facts, observed, [observed.defense === 'low' ? 'defense' : 'wear']);
      slots.intelSource = observed.defense === 'low' ? observed.sources?.defense ?? '攻防动作' : observed.sources?.wear ?? '圈速和stint';
    }
    if (channel === 'social') for (const fact of memory.published) if (fact.subjectId === primary.id && game.round - fact.round <= 3) facts.push({ ...fact, source: 'broadcast', visibility: 'public' });
  }
  const tire = facts.findLast(f => f.predicate === 'tire');
  if (tire) slots.tire = TIRE_LABELS[tire.value as DriverState['tire']];
  const old = facts.find(f => f.predicate === 'oldTire');
  if (old) slots.oldTire = TIRE_LABELS[old.value as DriverState['tire']];
  const control = facts.findLast(f => f.predicate === 'control');
  if (control) slots.control = controlLabels[String(control.value)];
  else if (current) slots.control = controlLabels[game.raceControl];
  const intel = facts.filter(f => f.predicate.startsWith('intel_') && f.predicate !== 'intel_pending');
  const intelRound = intel.length ? Math.min(...intel.map(f => f.round)) : undefined;
  const tags = [...new Set(facts.map(f => f.predicate))];
  if (intelRound !== undefined) {
    slots.intelAge = game.round - intelRound;
    if (intelRound < game.round) tags.push('intel_delayed');
    if (channel === 'social') tags.push('published_intel');
  }
  return { situation, channel, facts, slots, tags, intelRound };
}
