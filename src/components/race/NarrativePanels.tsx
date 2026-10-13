"use client";
import { useEffect, useState } from "react";
import { askEngineer, engineerAdvice } from "@/narrative/engine";
import { askEngineerQuery, engineerQuestions, type EngineerQuestion } from '@/narrative/radio/engineer';
import { sameCrew } from '@/narrative/situations/world';
import type { NarrativeLine, RaceNarrative } from "@/narrative/engine";
import { loadNarratives, saveNarrative } from "@/narrative/storage";
import { createDialogueSession } from "@/nlg";
import type { GameState, TurnPlan } from "@/game/types";

export function CommentaryPanel({ narrative }: { narrative?: RaceNarrative }) {
  return <section className="live-commentary" aria-label="直播解说"><header><span>LIVE</span><strong>现场解说</strong><details><summary>解说记录</summary><div>{narrative?.commentary.slice().reverse().map(line => <p key={line.id}><small>R{line.round} · {line.speaker}</small>{line.text}</p>)}</div></details></header><div className="commentary-latest" aria-live="polite">{narrative?.commentary.slice(-2).map(line => <p key={line.id}><small>R{line.round}</small>{line.text}</p>) ?? <p>等待发车，现场解说即将开始。</p>}</div></section>;
}

export function TeamRadioPanel({ game, narrative, onAdopt }: { game: GameState; narrative?: RaceNarrative; onAdopt?: (patch: Partial<TurnPlan>) => void }) {
  const [input, setInput] = useState("");
  const [dialogue, setDialogue] = useState(() => createDialogueSession("engineer"));
  const [responses, setResponses] = useState<NarrativeLine[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [queryDetails,setQueryDetails]=useState<string|undefined>();
  const [targetId,setTargetId]=useState(game.humanDriverId);
  useEffect(() => { const timer = window.setTimeout(() => { const stored = loadNarratives()[game.id]; if (stored) { setDialogue(stored.dialogue); setResponses(stored.radio.filter(l => l.speaker === "车手" || l.speaker === "操作记录")); } }, 0); return () => clearTimeout(timer); }, [game.id]);
  const send = (text: string, question?:EngineerQuestion) => {
    if (!text.trim()) return;
    const result = question ? askEngineerQuery(dialogue,question,targetId,game,narrative?.voiceMemory) : askEngineer(dialogue, text.trim(), game, narrative?.voiceMemory);
    setDialogue(result.session); setInput("");setQueryDetails(result.details);
    const stored = loadNarratives()[game.id] ?? narrative;
    if (stored) saveNarrative({ ...stored, dialogue: result.session });
  };
  const respond = (advice: NarrativeLine, accept: boolean) => {
    if (accept && advice.patch) onAdopt?.(advice.patch);
    setDismissed(current => [...current, advice.id]);
    const line: NarrativeLine = { ...advice, id: `${advice.id}:response:${accept}`, speaker: "操作记录", text: accept ? "已更新策略草稿，尚未提交。" : "已忽略此建议，策略草稿未变。", patch: undefined, kind: "fact", templateId: "radio.driver-response", plan: undefined };
    setResponses(current => [...current, line]);
    const stored = loadNarratives()[game.id] ?? narrative;
    if (stored) saveNarrative({ ...stored, radio: [...stored.radio, line].slice(-100) });
  };
  const advice = engineerAdvice(game, narrative?.voiceMemory).filter(l => l.patch && !dismissed.includes(l.id) && !responses.some(response => response.id.startsWith(`${l.id}:response:`)));
  const latest = [...(narrative?.radio ?? []), ...responses.filter(l => !narrative?.radio.some(saved => saved.id === l.id))].sort((a,b) => a.round-b.round).slice(-4);
  const preview = advice[0]?.text ?? latest.filter(l => l.speaker === "比赛工程师").at(-1)?.text ?? "联系工程师，获取策略与赛车状态。";
  const ordered=game.drivers.filter(d=>d.status!=='dnf').slice().sort((a,b)=>b.progress-a.progress||a.qualifyingRank-b.qualifyingRank);
  const ownIndex=ordered.findIndex(d=>d.id===game.humanDriverId);
  const queries=<div className="radio-query-picker"><label>询问目标 <select aria-label="无线电询问目标" value={targetId} onChange={event=>setTargetId(event.target.value)}>{game.drivers.map(driver=><option key={driver.id} value={driver.id}>{driver.profile.name} · {driver.id===game.humanDriverId?'本车':sameCrew(game,driver.id)?'队友':driver.id===ordered[ownIndex-1]?.id?'前车':driver.id===ordered[ownIndex+1]?.id?'后车':'对手'}{driver.status==='dnf'?' / DNF':''}</option>)}</select></label><div className="radio-quick">{engineerQuestions.map(question=><button type="button" key={question.id} disabled={question.id==='gap'&&targetId===game.humanDriverId} onClick={()=>send(question.text,question.id)}>{question.label}</button>)}</div></div>;
  return <details className="team-radio"><summary><span>TEAM RADIO</span><strong>车队无线电</strong><i>R{game.round}</i><small className="radio-preview" aria-live="polite">{preview}</small></summary><div className="radio-body"><div className="radio-messages" aria-live="polite">{latest.map(line => <p key={line.id} className={line.speaker === "车手" ? "driver" : ""}><small>{line.speaker} · R{line.round}</small>{line.text}</p>)}{dialogue.turns.slice(-4).map(turn => <p key={turn.id} className={turn.role === "user" ? "driver" : ""}><small>{turn.role === "user" ? "车手" : "比赛工程师"}</small>{turn.text}</p>)}</div>{advice.map(line => <div className="radio-advice" key={line.id}><p>{line.text}</p><div><button type="button" disabled={!onAdopt} onClick={() => respond(line, true)}>采纳建议</button><button type="button" onClick={() => respond(line, false)}>维持计划</button></div>{!onAdopt && <small>下一次策略声明时可采纳。</small>}</div>)}{queryDetails&&<details className="radio-query-details"><summary>计算条件</summary><p>{queryDetails}</p></details>}{queries}<form onSubmit={event => { event.preventDefault(); send(input); }}><input aria-label="联系比赛工程师" maxLength={280} value={input} onChange={event => setInput(event.target.value)} placeholder="也可以自由询问或报告赛车感受…" /><button type="submit" disabled={!input.trim()}>呼叫</button></form></div></details>;
}
