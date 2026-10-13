import { TIRE_LABELS, WEATHER_LABELS } from "../../game/uiLabels";
import type { GameState, TurnPlan } from "../../game/types";
import { buildRaceFactIndex, replyToUser } from "../../nlg";
import type { DialogueSession } from "../../nlg";
import type { NarrativeLine } from "../types";
import {ownTireLookup} from './tireLookup';
import { composeOwnAlert, engineerSituationReply, situationAdvice } from '../situations/runtime';
import type { VoiceMemory } from '../situations/types';
import { sameCrew } from '../situations/world';

export const engineerQuestions = [
  {id:'position',label:'位置 / 名次',text:'现在第几？'},
  {id:'gap',label:'与我间隔',text:'与我的车距差多少？'},
  {id:'wear',label:'胎耗',text:'轮胎磨损什么情况？'},
  {id:'ers',label:'ERS',text:'ERS还有多少？'},
  {id:'defense',label:'防守资源',text:'防守资源还有多少？'},
  {id:'telemetry',label:'赛车遥测',text:'赛车遥测什么情况？'},
  {id:'tire_life',label:'还能过几个弯',text:'轮胎还能过几个弯？'},
  {id:'pit',label:'本车进站建议',text:'现在建议进站吗？'},
  {id:'weather',label:'天气预报',text:'接下来天气预报？'},
] as const;
export type EngineerQuestion = typeof engineerQuestions[number]['id'];
export function askEngineerQuery(session: DialogueSession, question: EngineerQuestion, targetId: string, game: GameState, memory?: VoiceMemory) {
  const selected = engineerQuestions.find(q=>q.id===question)!;
  const target = game.drivers.find(d=>d.id===targetId) ?? game.drivers.find(d=>d.id===game.humanDriverId)!;
  // Entity IDs resolve custom names; the buttons don't rely on players guessing text keywords.
  const own = question==='pit'||question==='weather';
  return askEngineer(session,`${own?'':`${target.id===game.humanDriverId?'本车':target.profile.name}：`}${selected.text}`,game,memory,
    {question,targetId:own?game.humanDriverId:target.id});
}

export function engineerAdvice(game: GameState, memory?: VoiceMemory): NarrativeLine[] {
  const d = game.drivers.find(d => d.id === game.humanDriverId)!;
  const suggestions: NarrativeLine[] = [];
  const add = (key: string, text: string, patch?: Partial<TurnPlan>) => suggestions.push({ id: `${game.id}:${game.raceSession ?? "race"}:${game.round}:${key}`, round: game.round, speaker: "比赛工程师", text, kind: patch ? "advice" : "fact", factIds: [`driver-${d.id}-status`, "race-weather"], eventIds: [], templateId: key, patch });
  if (game.round < 1 || ["setup", "practice", "qualifying", "preRace", "finished"].includes(game.phase)) return suggestions;
  const tire = game.weather === "heavy_rain" ? "wet" : game.weather === "light_rain" ? "intermediate" : "medium";
  const wrong = tire === "medium" ? ["wet", "intermediate"].includes(d.tire) : !["wet", "intermediate"].includes(d.tire) || (tire === "wet" && d.tire === "intermediate");
  if (d.status === "dnf") { add("dnf", `赛车已退赛：${d.dnfReason ?? "等待赛会记录"}。`); return suggestions; }
  if (d.heavyDamage || d.wear >= 9 || wrong) add("pit", `${d.heavyDamage ? "赛车有重损伤。" : wrong ? "当前轮胎不适合天气。" : composeOwnAlert(game, 'pit', memory) ?? `轮胎磨损 ${d.wear}/12，已进入危险区。`}建议经过入口时进站，更换${TIRE_LABELS[tire]}。`, { pit: true, pitTire: tire });
  else if (d.wear >= 6) add("wear", composeOwnAlert(game, 'wear', memory) ?? `轮胎磨损 ${d.wear}/12。留意进站窗口。`);
  if (d.heat >= 4 || d.brakeHeat >= 3) {
    const neutralized = game.raceControl === "sc" || game.raceControl === "vsc";
    add("heat", composeOwnAlert(game, 'heat', memory) ?? `热量 ${d.heat}/6，刹车热 ${d.brakeHeat}/4。${d.tactical.cooling > 0 ? "可用冷却。" : "无冷却可用。"}${neutralized ? "SC/VSC，平衡模式。" : "可切省油。"}`, { mode: neutralized ? "balanced" : "save", deployErs: false, useCooling: d.tactical.cooling > 0 });
  }
  if (game.raceControl !== "green") add(`control-${game.raceControl}`, `赛会状态：${game.raceControl.toUpperCase()}。按当前限制执行。`);
  if (game.teamOrder?.status === "pending") add("order", "车队请求队令，等你确认。");
  if (Math.floor(d.progress / game.track.totalLength) + 1 >= (game.sessionLaps ?? game.track.laps)) add("last-lap", "最后一圈。轮胎和温度盯一下。");
  if (game.round === 1) add("start", `P${d.qualifyingRank}发车，天气${WEATHER_LABELS[game.weather ?? "sunny"]}。`);
  suggestions.push(...situationAdvice(game, memory));
  return suggestions;
}

export function askEngineer(session: DialogueSession, text: string, game: GameState, memory?: VoiceMemory, query?: {question:EngineerQuestion;targetId:string}) {
  const d = game.drivers.find(d => d.id === game.humanDriverId)!;
  const ordered = game.drivers.filter(d => d.status !== "dnf").slice().sort((a,b) => b.progress-a.progress || a.qualifyingRank-b.qualifyingRank);
  const position = ordered.findIndex(item => item.id === d.id);
  const front = position > 0 ? ordered[position-1] : undefined;
  const named = game.drivers.find(driver => text.includes(driver.profile.name) || text.toLowerCase().includes(driver.profile.abbreviation.toLowerCase()));
  const teammate = /队友|另一辆|第二辆/.test(text) ? game.drivers.find(driver => driver.id !== d.id && sameCrew(game, driver.id)) : undefined;
  const target = (query ? game.drivers.find(driver=>driver.id===query.targetId) : undefined) ?? named ?? teammate ?? (/前车/.test(text) ? front : /后车/.test(text) ? ordered[position+1] : undefined) ?? d;
  let factIds = [`driver-${d.id}-status`, "race-weather"];
  let answer: string | undefined;
  let details:string|undefined;
  const intentText = query ? engineerQuestions.find(q=>q.id===query.question)!.text : text;
  const telemetryQuery = /遥测|热量|刹车热|冷却|晚刹|快修|损伤/.test(intentText);
  const situationReply = telemetryQuery || query?.question==='gap' ? undefined : engineerSituationReply(session, intentText, game, memory, query?.targetId);
  if (telemetryQuery) {
    if (sameCrew(game, target.id)) {
      const readings: Array<[RegExp, string]> = [[/遥测|热量/, `热量${target.heat}/6`], [/遥测|刹车/, `刹车热${target.brakeHeat}/4`],
        [/遥测|冷却/, `冷却${target.tactical.cooling}`], [/遥测|晚刹/, `晚刹${target.tactical.lateBrake}`], [/遥测|快修/, `快修${target.tactical.quickRepair}`],
        [/遥测|损伤/, target.heavyDamage ? '重损伤' : target.lightDamage ? `轻损伤${target.lightDamage}` : '无损伤']];
      answer = `${target.id === d.id ? '本车' : target.profile.name}：${readings.filter(([pattern])=>pattern.test(intentText)).map(([,reading])=>reading).join('，')}。`;
      details = '本队遥测，包含队友。'; factIds = [`driver-${target.id}-status`];
    } else {
      const heard = memory?.heardRadio?.findLast(message=>message.driverId === target.id && message.resource === 'heat');
      answer = /热量|刹车热/.test(text) && heard ? `他们的无线电（R${heard.round}）：${heard.text}` : '没有这辆车的遥测。我们在检查赛道表现和无线电。';
      details = '对手没有接入本队遥测。'; factIds = heard ? [heard.id] : [];
    }
  }
  else if (situationReply) { answer = situationReply.text; factIds = situationReply.factIds; details = situationReply.details; }
  else if (/第几|名次|位置/.test(intentText)) {
    const result = game.results.find(result => result.driverId === target.id);
    answer = result ? `${target.profile.name}最终 P${result.rank}，${result.points} 分${result.status === "dnf" ? "，已退赛" : ""}。` : target.status === "dnf" ? `${target.profile.name}已退赛，最终分类请以赛会结果为准。` : `${target.id === d.id ? "你" : target.profile.name}当前 P${ordered.findIndex(item => item.id === target.id)+1}，第 ${Math.min(game.sessionLaps ?? game.track.laps, Math.max(1, Math.floor(target.progress / game.track.totalLength)+1))} 圈。`;
    factIds = [`driver-${target.id}-position`];
  }
  else if (/天气|下雨|雨势|预报/.test(intentText)) {
    const current = game.weather ?? 'sunny';
    const lastChange = game.logs.findLast(log => log.code === 'weather.transition' && log.details?.input?.from !== log.details?.result);
    const forecast = /预报|会不会|会下|多久|什么时候|接下来/.test(text);
    const trend = lastChange?.details?.result === 'light_rain' && lastChange.details.input?.from === 'cloudy' ? '雨可能还会加大' : lastChange?.details?.result === 'cloudy' && lastChange.details.input?.from === 'light_rain' ? '雨可能停一阵' : `短期估计仍是${WEATHER_LABELS[current]}`;
    answer = `当前${WEATHER_LABELS[current]}。${game.weatherMode === 'dynamic' ? forecast ? `预报：${trend}，不一定准。` : '预报有变化再报。' : '预计保持。'}`; factIds = ['race-weather'];
  }
  else if (/前车|后车|差多少|车距/.test(intentText)) {
    const other = query ? target : /后车/.test(text) ? ordered[position+1] : front;
    answer = other ? `${other.profile.name}，相差 ${Math.abs(other.progress-d.progress)} 格，${TIRE_LABELS[other.tire]}。${/ERS|精确|多少|数值/i.test(text) ? '对手没有接入我们的遥测。' : ''}` : "这边没有车。";
    factIds = [`driver-${d.id}-position`, ...(other ? [`driver-${other.id}-position`, `driver-${other.id}-status`] : [])];
  } else if (/还能|寿命|多久|几个弯|多少弯/.test(intentText)) {
    if (sameCrew(game, target.id)) { const lookup=ownTireLookup(target.id === d.id ? game : { ...game, humanDriverId: target.id },intentText);answer=`${target.id === d.id ? '' : `${target.profile.name}：`}${lookup.text}`;details=lookup.details; factIds = [`driver-${target.id}-status`, 'race-weather']; }
    else answer = '没有对手胎耗遥测，只能看圈速和他们的无线电来估计。';
  }
  else if (sameCrew(game,target.id) && /ERS|电量|防守|磨损|胎耗/i.test(intentText)) {
    answer = `${target.id===d.id?'本车':target.profile.name}：${/ERS|电量/i.test(intentText)?`ERS ${target.ers}`:/防守/.test(intentText)?`防守 ${target.tactical.defense}`:`${TIRE_LABELS[target.tire]}，磨损 ${target.wear}/12`}。`;
    factIds = [`driver-${target.id}-status`]; details = '本队遥测，包含队友。';
  }
  else if (/建议|进站吗|怎么办/.test(intentText)) answer = engineerAdvice(game).find(l => l.kind === "advice")?.text || "当前没有进站或冷却建议。";
  else if (/抓地|转向|赛车感觉/.test(text)) answer = `收到你的反馈。当前天气${WEATHER_LABELS[game.weather ?? "sunny"]}，使用${TIRE_LABELS[d.tire]}，磨损 ${d.wear}/12。${engineerAdvice(game).find(l => l.templateId === "pit")?.text ?? "正赛中无法重新调校，先通过模式和轮胎管理应对。"}`;
  // Old rules dialogue is a fallback; radio gameplay intelligence is deliberately separate.
  const result = replyToUser(session, text, { game, visibility: "public" });
  if (answer) {
    result.session.turns[result.session.turns.length-1].text = answer;
    result.session.turns[result.session.turns.length-1].claimFactIds = factIds;
    const answerTarget = situationReply?.targetId ?? target.id;
    result.session.turns[result.session.turns.length-1].entityIds = [answerTarget];
    result.utterance = { ...result.utterance, text: answer, claimFactIds: factIds, entityIds: [answerTarget], sourceEventIds: [], ruleRefs: [], grammarRuleIds: situationReply?.fragmentIds ?? ["radio.answer"], fallback: false, confidence: situationReply ? 0.65 : 1, certainty: situationReply || /建议|寿命|多久|还能|几个弯|多少弯|抓地|转向|怎么办|预报|会不会|接下来/.test(text) ? "inference" : "fact" };
  }
  if (situationReply) result.session.voiceMemory = situationReply.memory;
  const facts = buildRaceFactIndex({ game, visibility: "public" });
  if (situationReply) for (const fact of situationReply.plan.facts) if (!facts.some(existing => existing.id === fact.id)) facts.push({
    id: fact.id, topic: situationReply.plan.situation.topic, subject: fact.subjectId, predicate: fact.predicate, value: fact.value,
    unit: fact.unit, certainty: ['observation', 'radio'].includes(fact.source) ? 'inference' : 'fact', sourceEventIds: fact.eventIds, text: String(fact.value),
  });
  return { ...result, facts, details };
}
