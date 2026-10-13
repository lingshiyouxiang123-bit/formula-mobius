import { INTENT_RULES } from "./data/intents.zh";
import { matchLexicon } from "./data/lexicon.zh";
import { NLG_PERSONAS } from "./data/personas";
import { CHINESE_GRAMMAR } from "./data/grammar.zh";
import { buildRaceFactIndex } from "./factIndex";
import { normalizeChineseInput } from "./normalize";
import type { DialogueSession, DialogueTurn, GeneratedUtterance, NlgContext, NlgFact, NlgGenerationContext, NlgIntent, NlgPersonaId, ResponsePlan } from "./types";

function nextRandom(state: number): { state: number; value: number } {
  let value = (state + 0x6d2b79f5) | 0;
  const nextState = value >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return { state: nextState, value: ((value ^ (value >>> 14)) >>> 0) / 4294967296 };
}

function pick<T>(items: T[], state: number): { item: T; state: number } {
  const random = nextRandom(state);
  return { item: items[Math.floor(random.value * items.length)] ?? items[0], state: random.state };
}

function classifyIntent(normalized: string, previousTopic?: string): { intent: NlgIntent; confidence: number } {
  let best: { intent: NlgIntent; score: number } = { intent: "unknown", score: 0 };
  for (const rule of INTENT_RULES) {
    const hits = rule.keywords.filter((keyword) => normalized.includes(keyword)).length;
    const score = hits * rule.weight;
    if (score > best.score) best = { intent: rule.intent, score };
  }
  if (normalized.includes("规则") || normalized.includes("怎么判")) best = { intent: "rules", score: Math.max(best.score, 6) };
  if (best.intent === "follow_up" && previousTopic) return { intent: previousTopic as NlgIntent, confidence: 0.65 };
  return { intent: best.intent, confidence: Math.min(0.98, best.score ? 0.5 + best.score / 10 : 0.2) };
}

function oneEditOrLess(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  const rows = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) for (let j = 1; j <= right.length; j += 1) rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
  return rows[left.length][right.length] <= 1;
}

function extractEntities(normalized: string, context: NlgContext, session: DialogueSession): string[] {
  const dynamic: Array<{ id: string; labels: string[] }> = [];
  for (const driver of context.game?.drivers ?? []) dynamic.push({ id: driver.id, labels: [driver.profile.name, driver.profile.abbreviation] });
  for (const standing of context.season?.standings ?? []) dynamic.push({ id: standing.driverId, labels: [standing.name, standing.abbreviation] });
  if (context.season) dynamic.push({ id: context.season.playerTeam.teamId, labels: [context.season.playerTeam.name, context.season.playerTeam.abbreviation] });
  for (const driver of context.game?.drivers ?? []) if (driver.profile.teamId) dynamic.push({ id: driver.profile.teamId, labels: [driver.profile.team?.name ?? driver.profile.teamId] });
  if (context.game) dynamic.push({ id: context.game.track.id, labels: [context.game.track.name] });
  const words = normalized.split(" ");
  const result = dynamic.filter((entity) => entity.labels.some((label) => {
    const candidate = label.toLocaleLowerCase("zh-CN");
    return normalized.includes(candidate) || (candidate.length >= 3 && words.some((word) => oneEditOrLess(word, candidate)));
  })).map((entity) => entity.id);
  if (/(他|她|它|这次|这场|刚才)/.test(normalized) && result.length === 0) {
    const recentEntities = session.turns.slice(-16).reverse().find((turn) => turn.entityIds?.length)?.entityIds ?? [];
    result.push(...recentEntities);
  }
  return [...new Set([...result, ...matchLexicon(normalized)])];
}

function latestAssistant(session: DialogueSession): DialogueTurn | undefined {
  return session.turns.slice().reverse().find((turn) => turn.role === "assistant");
}

function makePlan(intent: NlgIntent, entities: string[], facts: NlgFact[], context: NlgContext, session: DialogueSession): ResponsePlan {
  const humanId = context.game?.humanDriverId ?? context.season?.humanDriverId;
  const subjectIds = entities.filter((id) => facts.some((fact) => fact.subject === id));
  const factBy = (filter: (fact: NlgFact) => boolean, limit = 3) => facts.filter(filter).slice(0, limit).map((fact) => fact.id);
  let topic = intent;
  let factIds: string[] = [];
  if (intent === "result") factIds = factBy((fact) => fact.topic === "result" && (!humanId || fact.subject === humanId), 2);
  else if (intent === "performance") factIds = factBy((fact) => fact.topic === "performance" && (!subjectIds.length ? fact.subject === humanId : subjectIds.includes(fact.subject ?? "")), 3);
  else if (intent === "strategy") factIds = factBy((fact) => fact.id === "race-weather" || (fact.topic === "performance" && fact.subject === (subjectIds[0] ?? humanId)), 3);
  else if (intent === "incident" || intent === "why") {
    topic = "incident";
    factIds = facts.filter((fact) => fact.topic === "incident" || fact.topic === "event").slice(-2).map((fact) => fact.id);
  } else if (intent === "rules") {
    const lexiconEntities = entities.filter((id) => !subjectIds.includes(id));
    factIds = factBy((fact) => fact.topic === "rules" && (!lexiconEntities.length || lexiconEntities.some((entity) => fact.predicate.includes(entity) || fact.id.includes(entity))), 2);
  } else if (intent === "compare") factIds = factBy((fact) => fact.topic === "result" && (subjectIds.length >= 2 ? subjectIds.slice(0, 2).includes(fact.subject ?? "") : true), 2);
  else if (intent === "standings") factIds = factBy((fact) => fact.topic === "standings" && (!subjectIds.length || subjectIds.includes(fact.subject ?? "")), 3);
  else if (intent === "development") factIds = factBy((fact) => fact.topic === "development", 4);
  else if (intent === "forecast") factIds = factBy((fact) => fact.topic === "result" && (!humanId || fact.subject === humanId), 1);
  else if (intent === "rephrase") factIds = latestAssistant(session)?.claimFactIds ?? [];
  const certainty: NlgFact["certainty"] = intent === "forecast" ? "forecast" : "fact";
  return { intent, topic, entityIds: subjectIds, factIds, certainty, fallback: !factIds.length && !["greeting", "goodbye", "agree", "disagree"].includes(intent) };
}

export function generateUtterance(plan: ResponsePlan, context: NlgGenerationContext): { text: string; rngState: number; grammarRuleId?: string } {
  const { facts, persona: personaId } = context;
  const persona = NLG_PERSONAS[personaId];
  const selected = plan.factIds.map((id) => facts.find((fact) => fact.id === id)).filter((fact): fact is NlgFact => Boolean(fact));
  const simple = (text: string) => ({ text, rngState: context.rngState });
  if (plan.intent === "greeting") return simple("你好，想问什么？");
  if (plan.intent === "goodbye") return simple("好，回头聊。");
  if (plan.intent === "agree") return simple("嗯，懂你意思。");
  if (plan.intent === "disagree") return simple("我不太同意。你指的是哪位车手或哪件事？");
  if (plan.fallback || selected.length === 0) return simple(plan.clarificationOptions?.length ? `我无法确定你指的是谁：${plan.clarificationOptions.join("、")}？` : "我没有找到足够的当前数据。可以具体问名次、某位车手、轮胎/进站、事故、积分、研发或某条规则。");
  const unusedOpenings = persona.openings.filter((opening) => !(context.recentAssistantTexts ?? []).slice(-6).some((text) => text.startsWith(opening)));
  const opening = pick(unusedOpenings.length ? unusedOpenings : persona.openings, context.rngState);
  const qualifier = pick(persona.qualifiers, opening.state);
  const grammarId = plan.intent === "why" ? "answer.why" : plan.intent === "forecast" ? "answer.forecast" : plan.intent === "rephrase" ? "answer.rephrase" : "answer.fact";
  const grammar = CHINESE_GRAMMAR.find((rule) => rule.id === grammarId)!;
  const template = pick(grammar.variants, qualifier.state);
  const factText = selected.map((fact) => fact.text).join(plan.intent === "rephrase" ? "；" : " ");
  const text = template.item
    .replace("{opening}", opening.item)
    .replace("{facts}", factText)
    .replace("{forecast}", "按眼下数据，竞争力还在。")
    .replace("{qualifier}", qualifier.item)
    .slice(0, 320);
  return { text, rngState: template.state, grammarRuleId: grammar.id };
}

function verify(plan: ResponsePlan, facts: NlgFact[]): string[] {
  const known = new Set(facts.map((fact) => fact.id));
  return plan.factIds.filter((id) => known.has(id));
}

export function createDialogueSession(persona: NlgPersonaId = "engineer", seed = 905): DialogueSession {
  return { schemaVersion: 1, id: `dialogue-${seed >>> 0}`, persona, rngState: seed >>> 0, variantIndex: 0, turns: [] };
}

export function replyToUser(sessionInput: DialogueSession, userText: string, context: NlgContext): { session: DialogueSession; utterance: GeneratedUtterance } {
  const session = structuredClone(sessionInput);
  const normalized = normalizeChineseInput(userText.slice(0, 280));
  const previous = latestAssistant(session);
  const classified = classifyIntent(normalized, previous?.topic);
  const entities = extractEntities(normalized, context, session);
  const facts = buildRaceFactIndex(context);
  const plan = makePlan(classified.intent, entities, facts, context, session);
  const hasUnresolvedPronoun = /(他|她|它|这次|这场|刚才)/.test(normalized) && !entities.some((id) => facts.some((fact) => fact.subject === id));
  if (hasUnresolvedPronoun && (context.game?.drivers.length ?? 0) > 1) {
    plan.fallback = true;
    plan.factIds = [];
    plan.responseAct = "clarify";
    plan.clarificationOptions = context.game!.drivers.slice(0, 3).map((driver) => driver.profile.name);
  }
  const verifiedFactIds = verify(plan, facts);
  plan.factIds = verifiedFactIds;
  if (!verifiedFactIds.length && !["greeting", "goodbye", "agree", "disagree"].includes(plan.intent)) plan.fallback = true;
  const realized = generateUtterance(plan, { facts, persona: session.persona, rngState: session.rngState, recentAssistantTexts: session.turns.filter((turn) => turn.role === "assistant").slice(-6).map((turn) => turn.text) });
  session.rngState = realized.rngState;
  session.variantIndex += 1;
  const chosenFacts = verifiedFactIds.map((id) => facts.find((fact) => fact.id === id)!);
  const now = Date.now();
  const turnSuffix = session.turns.length;
  session.turns.push(
    { id: `u-${now}-${turnSuffix}`, role: "user", text: userText.trim(), normalizedText: normalized, createdAt: now, intent: classified.intent, topic: plan.topic, entityIds: entities },
    { id: `a-${now}-${turnSuffix}`, role: "assistant", text: realized.text, createdAt: now + 1, intent: classified.intent, topic: plan.topic, entityIds: entities, claimFactIds: verifiedFactIds },
  );
  session.turns = session.turns.slice(-80);
  return {
    session,
    utterance: {
      text: realized.text,
      intent: classified.intent,
      topic: plan.topic,
      entityIds: entities,
      claimFactIds: verifiedFactIds,
      sourceEventIds: [...new Set(chosenFacts.flatMap((fact) => fact.sourceEventIds ?? []))],
      ruleRefs: [...new Set(chosenFacts.map((fact) => fact.ruleRef).filter((value): value is string => Boolean(value)))],
      grammarRuleIds: realized.grammarRuleId ? [realized.grammarRuleId] : [],
      confidence: plan.fallback ? Math.min(classified.confidence, 0.35) : classified.confidence,
      certainty: plan.certainty,
      fallback: Boolean(plan.fallback),
      clarificationOptions: plan.clarificationOptions,
    },
  };
}
