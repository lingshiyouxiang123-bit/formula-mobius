"use client";

import { useEffect, useState } from "react";
import type { GameState, SeasonState } from "@/game/types";
import { clearDialogueSession, createDialogueSession, loadDialogueSession, replyToUser, saveDialogueSession } from "@/nlg";
import { NLG_PERSONAS } from "@/nlg/data/personas";
import type { DialogueSession, GeneratedUtterance, NlgPersonaId } from "@/nlg/types";

const QUICK_QUESTIONS = ["我现在第几？", "轮胎和赛车状态怎么样？", "最近发生了什么事故？", "解释一下晚刹规则", "赛季积分和研发情况"];

export function F1DialogueConsole({ game, season }: { game?: GameState | null; season?: SeasonState | null }) {
  const [session, setSession] = useState<DialogueSession>(() => createDialogueSession());
  const [input, setInput] = useState("");
  const [lastMeta, setLastMeta] = useState<GeneratedUtterance | null>(null);
  useEffect(() => {
    const load = window.setTimeout(() => setSession(loadDialogueSession()), 0);
    return () => window.clearTimeout(load);
  }, []);

  const send = (text = input) => {
    const clean = text.trim();
    if (!clean) return;
    const result = replyToUser(session, clean, { game, season });
    setSession(result.session);
    saveDialogueSession(result.session);
    setLastMeta(result.utterance);
    setInput("");
  };
  const setPersona = (persona: NlgPersonaId) => {
    const next = { ...session, persona };
    setSession(next); saveDialogueSession(next);
  };

  return <details className="nlg-console">
    <summary><span>PADDOCK TERMINAL</span><strong>围场对话终端</strong><i>{session.turns.length ? `${Math.floor(session.turns.length / 2)} 轮` : "离线"}</i></summary>
    <div className="nlg-layout">
      <aside><label>说话方式<select value={session.persona} onChange={(event) => setPersona(event.target.value as NlgPersonaId)}>{(Object.keys(NLG_PERSONAS) as NlgPersonaId[]).map((id) => <option value={id} key={id}>{NLG_PERSONAS[id].name}</option>)}</select></label><p>{NLG_PERSONAS[session.persona].description}</p><small>只读取当前本地比赛与赛季；不会执行比赛命令，也不连接网络。</small><button type="button" className="nlg-clear" onClick={() => { setSession(clearDialogueSession()); setLastMeta(null); }}>清除对话</button></aside>
      <section>
        <div className="nlg-transcript" aria-live="polite">{session.turns.length ? session.turns.slice(-8).map((turn) => <p className={turn.role} key={turn.id}><b>{turn.role === "user" ? "你" : NLG_PERSONAS[session.persona].name}</b><span>{turn.text}</span></p>) : <p className="empty">输入问题，或从下方选择一个当前数据问题。</p>}</div>
        <div className="nlg-quick">{QUICK_QUESTIONS.map((question) => <button type="button" onClick={() => send(question)} key={question}>{question}</button>)}</div>
        <form onSubmit={(event) => { event.preventDefault(); send(); }}><input value={input} maxLength={280} onChange={(event) => setInput(event.target.value)} placeholder="询问车手、策略、事故、积分、研发或规则" /><button type="submit" disabled={!input.trim()}>发送</button></form>
        {lastMeta && <div className="nlg-evidence"><span>{lastMeta.fallback ? "需要更多上下文" : `${lastMeta.certainty.toUpperCase()} · 意图 ${lastMeta.intent} · 置信 ${Math.round(lastMeta.confidence * 100)}%`}</span><small>{lastMeta.sourceEventIds.length ? `比赛日志 #${lastMeta.sourceEventIds.join(", #")}` : lastMeta.ruleRefs.length ? lastMeta.ruleRefs.join(" · ") : `${lastMeta.claimFactIds.length} 条本地事实`}</small></div>}
      </section>
    </div>
  </details>;
}
