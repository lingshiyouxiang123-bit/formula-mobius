import { rollSeasonD12 } from "../game/seasonDevelopment";
import { repricePendingContractOffers } from "../game/seasonMarket";
import type { PressResponseIntent, SeasonState } from "../game/types";

const clamp = (value: number) => Math.max(0, Math.min(10, value));

export function resolvePressResponse(input: SeasonState, raceId: string, questionId: string, intent: PressResponseIntent): SeasonState {
  let state = structuredClone(input);
  const bundle = state.mediaArchive.find((item) => item.raceId === raceId);
  const question = bundle?.pressQuestions.find((item) => item.id === questionId);
  if (!question) throw new Error("记者会问题不存在。");
  if (question.answeredWith) throw new Error("该问题已经回答。");
  question.answeredWith = intent;
  question.reputationDelta = 0;
  question.relationshipDelta = 0;
  if (intent === "skip") question.resultText = "已跳过；没有数值变化。";
  else if (intent === "honest") {
    const before = state.reputation;
    if (question.accountabilityEligible) state.reputation = clamp(state.reputation + 1);
    question.reputationDelta = state.reputation - before;
    question.resultText = question.reputationDelta ? "坦诚承担与已记录失误相符：声望 +1。" : "回答已记录；该问题不涉及已记录失误，声望不变。";
  } else if (intent === "team_first") {
    const before = state.playerTeam.teammateRelationship;
    state.playerTeam.teammateRelationship = Math.min(2, before + 1);
    question.relationshipDelta = state.playerTeam.teammateRelationship - before;
    question.resultText = question.relationshipDelta ? "车队优先：队友关系 +1。" : "队友关系已达 +2，回答已记录但不再提高。";
  } else {
    const roll = rollSeasonD12(state);
    const modifier = state.playerTeam.stats.rel;
    const total = roll + modifier;
    const before = state.reputation;
    if (total >= 10) state.reputation = clamp(state.reputation + 2);
    else if (total <= 5) state.reputation = clamp(state.reputation - 2);
    question.roll = roll;
    question.total = total;
    question.reputationDelta = state.reputation - before;
    question.resultText = `强硬反击：D12 ${roll} + REL ${modifier} = ${total}；声望 ${question.reputationDelta >= 0 ? "+" : ""}${question.reputationDelta}。`;
  }
  if (state.reputation !== input.reputation && state.contractOffers.some((offer) => offer.status === "pending")) {
    state = repricePendingContractOffers(state);
  }
  return state;
}
