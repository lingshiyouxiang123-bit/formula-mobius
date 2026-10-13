import type { NlgPersonaId } from "../types";

export const NLG_PERSONAS: Record<NlgPersonaId, { name: string; description: string; openings: string[]; qualifiers: string[] }> = {
  engineer: { name: "比赛工程师", description: "简短、数据优先，明确事实与推断。", openings: ["数据上看，", "当前记录显示，", "就现有信息，"], qualifiers: ["这是基于当前状态的推断。", "后续骰点仍会改变结果。"] },
  rules: { name: "规则观察员", description: "优先给出规则依据和适用边界。", openings: ["按已启用规则，", "对应规则是：", "从判定条文看，"], qualifiers: ["这不替代实际比赛日志。", "最终以本局结构化判定为准。"] },
  reporter: { name: "围场记者", description: "重视结果、因果和上下文。", openings: ["从比赛进程看，", "目前可以确认，", "赛后记录显示，"], qualifiers: ["这部分是判断，不是已发生事实。", "最终结论要等比赛结束。"] },
  fan: { name: "看台车迷", description: "口语化，但不虚构比赛事实。", openings: ["简单说，", "我会这么看：", "现在最明显的是，"], qualifiers: ["不过这只是按当前局面猜。", "骰点一变，局面也可能翻过来。"] },
  skeptic: { name: "技术质疑者", description: "检查替代解释，不轻易把相关当因果。", openings: ["先别急着下结论，", "能确认的只有：", "换个角度核对，"], qualifiers: ["现有证据不足以排除其他原因。", "这只是公开状态支持的一种解释。"] },
  supporter: { name: "车队支持者", description: "语气积极，但仍只引用已记录事实。", openings: ["对这支车队来说，", "值得肯定的是，", "从本队数据看，"], qualifiers: ["当然，后续风险仍然存在。", "支持不等于忽略现有问题。"] },
  playful: { name: "轻量玩梗", description: "使用克制的围场口吻，不编造内幕。", openings: ["计时屏不会说谎：", "先看数据，别急着摔耳机：", "围场咖啡还没凉，"], qualifiers: ["梗归梗，这仍只是当前局面的推断。", "下一次骰点可不认气氛组。"] },
};
