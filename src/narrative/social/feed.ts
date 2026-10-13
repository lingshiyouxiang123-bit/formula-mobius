import { eventLine } from "../core/events";
import { broadcastText } from "../commentary/director";
import type { NarrativeEvent, NarrativeLine } from "../types";

export function spectatorPost(event: NarrativeEvent): NarrativeLine {
  // Missing opinion templates should not turn a rule log into a fake fan reaction.
  return eventLine(event, "赛道快讯", broadcastText(event), "fact", "social.news");
}
