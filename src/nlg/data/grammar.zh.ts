import type { GrammarRule } from "../types";

/** Only discourse structure lives here; all race claims are injected from facts. */
export const CHINESE_GRAMMAR: GrammarRule[] = [
  { id: "answer.fact", variants: ["{opening}{facts}", "{facts}", "{opening}{facts}"] },
  { id: "answer.why", variants: ["{opening}{facts}", "{facts}"] },
  { id: "answer.forecast", variants: ["{opening}{facts} {forecast} {qualifier}", "{facts} {forecast} {qualifier}"] },
  { id: "answer.rephrase", variants: ["简单说：{facts}", "{facts}"] },
];
