export const F1_LEXICON: Record<string, string[]> = {
  drs: ["drs", "尾翼", "可变尾翼", "尾翼开启", "drs区", "检测点"],
  safety_car: ["安全车", "sc", "安全车阶段", "安全车重启", "跟车队列"],
  virtual_safety_car: ["虚拟安全车", "vsc", "虚拟安全车阶段", "全场限速", "delta"],
  tyre: ["轮胎", "胎", "软胎", "红胎", "中胎", "黄胎", "硬胎", "白胎", "半雨胎", "绿胎", "全雨胎", "蓝胎", "雨胎", "胎龄", "磨损", "爆胎", "失去抓地"],
  pit: ["进站", "维修区", "维修通道", "换胎", "停站", "双车叠停", "undercut", "undercut", "overcut", "大修", "快修", "慢行处罚"],
  strategy: ["策略", "战术", "ers", "能量回收", "电量", "省油", "平衡模式", "进攻模式", "轮胎管理", "窗口", "一停", "两停"],
  incident: ["事故", "接触", "碰撞", "擦碰", "追尾", "受损", "轻损伤", "重损伤", "故障", "处罚", "判罚", "罚分", "退赛", "dnf", "黄旗", "红旗", "失控"],
  late_brake: ["晚刹", "延迟刹车", "刹车点"],
  result: ["结果", "赛果", "名次", "第几", "赢", "获胜", "冠军", "领奖台", "完赛", "分类", "冲线"],
  performance: ["表现", "速度", "快", "慢", "节奏", "长距离", "单圈", "遥测", "数据", "圈速", "差距", "移动", "超车", "防守"],
  standings: ["积分", "得分", "排名", "榜首", "领跑", "锦标赛", "车手榜", "制造商榜", "车队榜", "赛季", "同分"],
  development: ["研发", "开发", "升级", "预算", "成本帽", "atr", "风洞", "cfd", "设施", "项目", "相关性", "rp", "bu", "可靠性"],
  qualifying: ["排位", "排位赛", "杆位", "发车位", "飞行圈", "拖车", "尾流", "q1", "q2", "q3"],
  weather: ["天气", "晴天", "阴天", "小雨", "大雨", "湿地", "干地", "降雨", "雨势", "天气变化"],
  race_control: ["赛事控制", "赛会控制", "干事", "重启", "禁超", "限速", "赛道阻塞", "清理赛道"],
  heat: ["热量", "过热", "散热", "冷却", "刹车热", "温度", "热衰退"],
  damage: ["损伤", "损坏", "赛车受损", "前翼", "悬挂", "底板", "维修", "备件"],
  contract: ["合同", "签约", "续约", "席位", "正式车手", "储备车手", "一号车手", "转会", "报价"],
  sponsor: ["赞助", "赞助商", "履约", "公共事务", "媒体活动", "社区活动", "声望", "商业"],
  team_order: ["队令", "让车", "交换位置", "优先车手", "车队指令", "拒绝队令", "队友关系"],
  track_limit: ["赛道边界", "出界", "白线", "警告", "取消圈速", "越界"],
  setup: ["调校", "设定", "下压力", "机械抓地", "刹车平衡", "悬挂", "封闭车场", "parc ferme"],
  negation: ["不", "没有", "不是", "别", "不该", "不能", "不会", "没必要"],
};

export function matchLexicon(normalized: string): string[] {
  const candidates = Object.entries(F1_LEXICON).flatMap(([entity, aliases]) => aliases.flatMap((alias) => {
    const start = normalized.indexOf(alias);
    return start < 0 ? [] : [{ entity, alias, start, end: start + alias.length }];
  })).sort((left, right) => right.alias.length - left.alias.length || left.start - right.start);
  const occupied: Array<[number, number]> = [];
  const entities: string[] = [];
  for (const candidate of candidates) {
    if (occupied.some(([start, end]) => candidate.start < end && candidate.end > start)) continue;
    occupied.push([candidate.start, candidate.end]);
    if (!entities.includes(candidate.entity)) entities.push(candidate.entity);
  }
  return entities;
}
