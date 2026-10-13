import type { NarrativeEvent, NarrativeLine } from "../types";
import { eventLine } from "../core/events";
import type { GameState } from "../../game/types";

/** Only repeatable status facts are merged; penalties and real passes keep their event IDs. */
export function broadcastFactKey(game: GameState, line: NarrativeLine): string | undefined {
  const evidence = game.logs.filter(event => line.eventIds.includes(event.id));
  // A composed line can cover DRS AND a completed pass. Do not classify that
  // whole line as a repeatable status and accidentally remove the real pass.
  if (evidence.some(event => event.code === 'movement.step' && ['overtake','defended'].includes(event.details?.result ?? '') || event.code?.startsWith('penalty.'))) return;
  const log = evidence[0];
  if (!log) return;
  const input = log.details?.input ?? {}, result = log.details?.result ?? '';
  let action: string | undefined;
  if (result.startsWith('blue_flag_')) action = result;
  else if (/蓝旗/.test(log.message)) action = /收到/.test(log.message) ? 'blue_flag_blocked' : /通过被套圈/.test(log.message) ? 'blue_flag_passed' : /执行蓝旗/.test(log.message) ? 'blue_flag_yielded' : 'blue_flag_waiting';
  else if (log.code === 'incident.race_control') action = result;
  else if (result === 'drs_used') action = result;
  if (!action) return;
  const subjects = [input.driverId, input.otherDriverId].filter(id => typeof id === 'string');
  if (!subjects.length) subjects.push(...game.drivers.filter(driver => log.message.includes(driver.profile.name)).map(driver => driver.id));
  return `${game.raceSession ?? 'race'}:${log.round}:${action}:${subjects.join(':')}:${input.lap ?? ''}`;
}

export function deduplicateBroadcasts(game: GameState, lines: NarrativeLine[]): NarrativeLine[] {
  const seen = new Map<string, NarrativeLine>();
  return lines.filter(line => {
    const key = broadcastFactKey(game, line);
    if (!key) return true;
    const previous = seen.get(key);
    if (!previous) { seen.set(key, line); return true; }
    previous.eventIds = [...new Set([...previous.eventIds, ...line.eventIds])];
    previous.factIds = [...new Set([...previous.factIds, ...line.factIds])];
    return false;
  });
}

/** The event's recorded fact is the only source for a broadcast claim. */
export function broadcastText(event: NarrativeEvent): string {
  return event.text
    .replace(/\s*判罚骰为\s*\d+，/g, "：")
    .replace(/花费 \d+ MP 完成对 (.+?) 的超车/, "完成对 $1 的超越")
    .replace(/所有策略将在移动前锁定。?/, "车阵已经准备就绪。")
    .replace(/赛后扣 (\d+) VP/g, "将被扣除 $1 分")
    .replace(/；轻损伤保留.*$/, "。")
    .replace(/，比赛立即结束。/, "，本场比赛结束。");
}

export function addBroadcast(lines: NarrativeLine[], event: NarrativeEvent): void {
  // One recorded event per line; syncNarrative retains the existing overall cap.
  lines.push(eventLine(event, "现场解说", broadcastText(event), "fact", "commentary.event"));
}
