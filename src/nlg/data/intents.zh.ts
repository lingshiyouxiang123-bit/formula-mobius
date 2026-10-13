import type { IntentRule } from "../types";

export const INTENT_RULES: IntentRule[] = [
  { intent: "greeting", weight: 3, keywords: ["你好", "嗨", "hello", "在吗"] },
  { intent: "goodbye", weight: 3, keywords: ["再见", "拜拜", "结束对话"] },
  { intent: "why", weight: 4, keywords: ["为什么", "原因", "怎么会", "咋"] },
  { intent: "compare", weight: 4, keywords: ["比较", "对比", "谁更", "差多少"] },
  { intent: "forecast", weight: 4, keywords: ["预测", "会赢", "可能赢", "接下来", "胜算"] },
  { intent: "result", weight: 3, keywords: ["结果", "名次", "第几", "完赛", "冠军"] },
  { intent: "performance", weight: 3, keywords: ["表现", "速度", "快", "慢", "遥测", "数据"] },
  { intent: "strategy", weight: 3, keywords: ["策略", "轮胎", "进站", "换胎", "ers", "模式"] },
  { intent: "incident", weight: 3, keywords: ["事故", "接触", "碰撞", "处罚", "判罚", "退赛", "黄旗", "红旗"] },
  { intent: "standings", weight: 3, keywords: ["积分", "排名", "榜首", "锦标赛"] },
  { intent: "development", weight: 3, keywords: ["研发", "预算", "成本帽", "atr", "设施", "rp", "bu"] },
  { intent: "rules", weight: 2, keywords: ["规则", "怎么判", "drs", "安全车", "vsc", "晚刹", "磨损"] },
  { intent: "rephrase", weight: 4, keywords: ["换个说法", "没听懂", "简单点", "重说"] },
  { intent: "agree", weight: 2, keywords: ["同意", "对", "确实", "是的"] },
  { intent: "disagree", weight: 2, keywords: ["不同意", "不对", "不是", "错了"] },
  { intent: "follow_up", weight: 1, keywords: ["然后呢", "还有呢", "那呢", "继续"] },
];

