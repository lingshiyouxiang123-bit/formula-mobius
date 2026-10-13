"use client";

import { useEffect, useRef } from "react";
import { MobiusWordmark } from "@/components/visual/MobiusWordmark";
import { ShaderRaceBackdrop } from "@/components/visual/ShaderRaceBackdrop";
import { MobiusBackdropGlyph } from "@/components/visual/MobiusBackdropGlyph";
import { TRACKS } from "@/game/tracks";

export type AppSection = "landing" | "races" | "drivers" | "teams" | "social";

export function LandingPage({ driverCount, teamCount, hasSavedRace, onNavigate, onResume }: {
  driverCount: number;
  teamCount: number;
  hasSavedRace: boolean;
  onNavigate: (section: AppSection) => void;
  onResume: () => void;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const page = pageRef.current;
    const hero = page?.querySelector('.landing-hero');
    if (!page || !hero) return;
    let inView = true;
    const updateMotion = () => page.classList.toggle('motion-paused', document.hidden || !inView);
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; updateMotion(); });
    observer.observe(hero);
    document.addEventListener('visibilitychange', updateMotion);
    updateMotion();
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', updateMotion); };
  }, []);
  return (
    <div className="landing-page" ref={pageRef}>
      <section className="landing-hero" id="top">
        <ShaderRaceBackdrop phase="movement" variant="tunnel" interactive={false} poster />
        <div className="landing-grid" aria-hidden="true" />
        <header className="landing-nav">
          <a href="#top" className="landing-mark" aria-label="Formula Mobius 首页"><b>FORMULA<span>:</span></b><strong>MOBIUS</strong></a>
          <nav><button onClick={() => onNavigate("races")}>比赛</button><button onClick={() => onNavigate("drivers")}>车手</button><button onClick={() => onNavigate("teams")}>车队</button><button onClick={() => onNavigate("social")}>社交</button></nav>
        </header>
        <div className="landing-telemetry" aria-label="本地数据">
          <span><small>DRIVERS</small><strong>{String(driverCount).padStart(2, "0")}</strong></span>
          <span><small>TEAMS</small><strong>{String(teamCount).padStart(2, "0")}</strong></span>
          <span><small>TRACKS</small><strong>{String(TRACKS.length).padStart(2, "0")}</strong></span>
          <span><small>RACE SAVE</small><strong>{hasSavedRace ? "READY" : "EMPTY"}</strong></span>
        </div>
        <div className="landing-title">
          <h1 aria-label="FORMULA: MOBIUS"><MobiusWordmark /></h1>
        </div>
        <div className="landing-poster-note poster-note-left" aria-hidden="true">THIS SENTENCE IS HERE<br />PURELY FOR VISUAL DESIGN.</div>
        <div className="landing-poster-note poster-note-right" aria-hidden="true">THIS SENTENCE IS HERE<br />PURELY FOR VISUAL DESIGN.</div>
        <a className="landing-scroll" href="#directory"><span>目录</span><i /></a>
      </section>

      <section className="landing-directory" id="directory">
        <MobiusBackdropGlyph className="directory-mobius-glyph" />
        <div className="directory-design-note" aria-hidden="true">THIS SENTENCE IS HERE PURELY FOR VISUAL DESIGN.</div>
        <div className="directory-heading"><p>目录 / LOCAL DATA</p><h2>选择工作区</h2><span>{driverCount} 名车手 · {teamCount} 支车队 · {TRACKS.length} 条赛道</span></div>
        {hasSavedRace && <button className="resume-line" onClick={onResume}><span>进行中的比赛</span><strong>继续比赛</strong><i>→</i></button>}
        <div className="directory-links">
          <button className={driverCount > 0 && teamCount > 0 ? "ready" : "needs-setup"} onClick={() => onNavigate("races")}><span>01</span><strong>比赛中心</strong><small>{teamCount === 0 ? "需要先建立车队" : driverCount === 0 ? "需要先建立车手" : "正式正赛 / 模拟测试"}</small><i>→</i></button>
          <button className={teamCount > 0 ? "ready" : "needs-setup"} onClick={() => onNavigate("drivers")}><span>02</span><strong>车手培养</strong><small>{teamCount > 0 ? "等级 / 天赋树 / 所属车队" : "需要先建立车队"}</small><i>→</i></button>
          <button className="ready" onClick={() => onNavigate("teams")}><span>03</span><strong>车队培养</strong><small>赛车属性 / RP / 技术设施</small><i>→</i></button>
          <button className="ready" onClick={() => onNavigate("social")}><span>04</span><strong>围场社交</strong><small>直播讨论 / 赛后热帖 / 车队动态</small><i>→</i></button>
        </div>
      </section>
    </div>
  );
}
