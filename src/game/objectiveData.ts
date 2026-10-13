import type { RaceObjectiveId, RaceObjectiveState } from "./types";

export const RACE_OBJECTIVES: Record<RaceObjectiveId, Omit<RaceObjectiveState, "id" | "completed" | "awardedPoints"> & { condition: string }> = {
  clean_race: { title: "干净驾驶", difficulty: "易", points: 2, condition: "已分类、全场接触为 0，且没有赛会处罚。" },
  defend_once: { title: "防守一次", difficulty: "易", points: 2, condition: "已分类并成功防守至少一次超车对抗。" },
  late_brake_pair: { title: "晚刹大师", difficulty: "中", points: 3, condition: "已分类并取得至少两次 10+ 的成功晚刹。" },
  defend_twice: { title: "防守专家", difficulty: "中", points: 3, condition: "已分类并累计成功防守至少两次。" },
  no_stop_finish: { title: "无进站完赛", difficulty: "中", points: 3, condition: "不进站并正常冲线或获得分类。" },
  back_row_podium: { title: "逆袭领奖台", difficulty: "难", points: 4, condition: "至少四车参赛，从 P4 或之后起步并以 P1–P3 分类。" },
  ers_minimal: { title: "ERS 极简", difficulty: "难", points: 4, condition: "已分类、全场部署 ERS 不超过一次，并进入前二。" },
  clean_podium: { title: "零接触零罚", difficulty: "难", points: 4, condition: "已分类、无接触、无处罚并进入前三。" },
  defense_wall: { title: "防守之墙", difficulty: "难", points: 4, condition: "至少四车参赛，已分类、成功防守至少三次且没有处罚。" },
  no_stop_podium: { title: "零停领奖台", difficulty: "难", points: 4, condition: "至少三车参赛，不进站并以 P1–P3 分类。" },
};

export const EASY_OBJECTIVE_IDS: RaceObjectiveId[] = ["clean_race", "defend_once"];
export const CHALLENGE_OBJECTIVE_IDS: RaceObjectiveId[] = ["late_brake_pair", "defend_twice", "no_stop_finish", "back_row_podium", "ers_minimal", "clean_podium", "defense_wall", "no_stop_podium"];
