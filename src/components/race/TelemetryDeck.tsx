"use client";

import { useState } from "react";
import { ersCapacity, getCellIndex } from "@/game/engine";
import { TIRE_LABELS } from "@/game/uiLabels";
import { availableTalentActions, TALENT_ACTIONS, talentUpgradeRank } from "@/game/career";
import type { DriverState, GameState } from "@/game/types";

type Channel = "speed" | "throttle" | "brake" | "rpm";

export function TelemetryDeck({ driver, game }: { driver: DriverState; game: GameState }) {
  const [channel, setChannel] = useState<Channel>("speed");
  const cell = driver.progress < 0 ? 0 : getCellIndex(game, driver);
  const offsets = game.track.segments.map((_, index) => game.track.segments.slice(0, index).reduce((sum, prior) => sum + prior.length, 0));
  const segment = game.track.segments.find((item, index) => cell >= offsets[index] && cell < offsets[index] + item.length) ?? game.track.segments[0];
  const mode = game.plans[driver.id]?.mode ?? "balanced";
  const actions = availableTalentActions(driver.profile);
  const uses = driver.careerUses;
  const rank = talentUpgradeRank(driver.profile.career?.level ?? 1);
  const straight = segment.type === "straight";
  const speed = Math.max(48, Math.round((straight ? 225 : 82) + driver.profile.stats.eng * 17 + (straight ? driver.profile.stats.aero * 4 : driver.profile.stats.aero * 12) + (mode === "attack" ? 21 : mode === "save" ? -18 : 0) - driver.wear * 2 - (driver.heavyDamage ? 34 : 0)));
  const gear = Math.max(1, Math.min(8, Math.round(speed / 43)));
  const rpm = Math.min(15000, 7600 + gear * 820 + ((game.rngState + cell * 137) % 620));
  const throttle = straight ? (mode === "save" ? 76 : 96) : Math.max(28, 64 - (segment.cornerCost ?? 0) * 6);
  const brake = straight ? 0 : Math.min(100, 42 + (segment.cornerCost ?? 0) * 11 + driver.brakeHeat * 3);
  const tireTemp = Math.round(78 + driver.wear * 1.7 + driver.heat * 3 + (mode === "attack" ? 7 : 0));
  const gap = Math.max(0, Math.max(...game.drivers.map((item) => item.progress)) - driver.progress) * .38;
  const channelMeta = {
    speed: { label: "SPEED TRACE", unit: "KM/H", value: speed, min: 60, max: 360 },
    throttle: { label: "THROTTLE TRACE", unit: "%", value: throttle, min: 0, max: 100 },
    brake: { label: "BRAKE TRACE", unit: "%", value: brake, min: 0, max: 100 },
    rpm: { label: "ENGINE TRACE", unit: "RPM", value: rpm, min: 5000, max: 15000 },
  }[channel];
  const trace = Array.from({ length: 24 }, (_, index) => {
    const cornerPulse = Math.max(0, Math.sin((index + cell) * .78));
    const noise = ((index * 11 + game.rngState) % 9) / 9;
    if (channel === "speed") return Math.max(60, speed - cornerPulse * 128 - noise * 18);
    if (channel === "throttle") return Math.max(4, throttle - cornerPulse * 62 + noise * 8);
    if (channel === "brake") return Math.min(100, cornerPulse * 84 + noise * 12);
    return Math.max(5000, rpm - cornerPulse * 4600 - noise * 520);
  });
  const tracePoints = trace.map((value, index) => {
    const x = index * (204 / (trace.length - 1));
    const normalized = (value - channelMeta.min) / Math.max(1, channelMeta.max - channelMeta.min);
    return `${x.toFixed(1)},${(50 - Math.max(0, Math.min(1, normalized)) * 42).toFixed(1)}`;
  }).join(" ");
  const playhead = Math.max(0, Math.min(204, cell / Math.max(1, game.track.totalLength - 1) * 204));
  const playheadIndex = Math.min(trace.length - 1, Math.round(playhead / 204 * (trace.length - 1)));
  const playheadNormalized = (trace[playheadIndex] - channelMeta.min) / Math.max(1, channelMeta.max - channelMeta.min);
  const playheadY = 50 - Math.max(0, Math.min(1, playheadNormalized)) * 42;

  return (
    <section className="telemetry-deck">
      <div className="telemetry-identity"><span>{`CELL ${cell + 1} // ${segment.id.toUpperCase()}`}</span><div><span className="car-badge" style={{ backgroundColor: driver.profile.color }}>{driver.profile.abbreviation}</span><strong>{driver.profile.name}</strong></div><small>{segment.name} · {mode.toUpperCase()}</small></div>
      <div className="speed-cluster"><span>SPEED</span><strong>{speed}</strong><small>KM/H</small><b>GEAR {gear}</b></div>
      <div className="rpm-cluster"><div><span>ENGINE</span><strong>{rpm.toLocaleString()} RPM</strong></div><i><b style={{ width: `${rpm / 150}%` }} /></i><div className="input-bars"><span>THR <b style={{ width: `${throttle}%` }} /></span><span>BRK <b style={{ width: `${brake}%` }} /></span></div></div>
      <div className="telemetry-trace">
        <div className="trace-heading"><span>{channelMeta.label}</span><strong>{Math.round(channelMeta.value).toLocaleString()} <small>{channelMeta.unit}</small></strong></div>
        <div className="trace-channels" role="group" aria-label="遥测通道">{(["speed", "throttle", "brake", "rpm"] as const).map((key) => <button type="button" aria-pressed={channel === key} className={channel === key ? "active" : ""} key={key} onClick={() => setChannel(key)}>{key === "throttle" ? "THR" : key === "brake" ? "BRK" : key.toUpperCase()}</button>)}</div>
        <svg key={`${channel}-${cell}`} viewBox="0 0 204 55" preserveAspectRatio="none" aria-label={`${channelMeta.label} 模拟曲线`}><defs><clipPath id="player-trace-reveal"><rect x="0" y="0" width={Math.max(2, playhead + 2)} height="55" /></clipPath></defs><g className="trace-grid"><line x1="68" y1="0" x2="68" y2="55" /><line x1="136" y1="0" x2="136" y2="55" /><line x1="0" y1="27.5" x2="204" y2="27.5" /></g><g clipPath="url(#player-trace-reveal)"><polyline pathLength="1" points={tracePoints} /></g><line className="trace-playhead" x1={playhead} y1="0" x2={playhead} y2="55" /><circle className="trace-dot" cx={playhead} cy={playheadY} r="2.8" /></svg>
        <div className="trace-footer"><span>S1</span><span>S2</span><span>S3</span><small>DELTA +{gap.toFixed(2)}s</small></div>
      </div>
      <div className="sensor-grid player-sensors"><span><small>ERS</small><strong>{driver.ers}/{ersCapacity(driver)}</strong></span><span><small>TYRE WEAR</small><strong>{driver.wear}/12</strong></span><span><small>TYRE °C · EST.</small><strong>{tireTemp}</strong></span><span><small>BRAKE °C · EST.</small><strong>{Math.round(185 + driver.brakeHeat * 72 + (straight ? 0 : (segment.cornerCost ?? 0) * 18))}</strong></span><span><small>CAR HEAT</small><strong>{driver.heat}/6</strong></span><span><small>DAMAGE</small><strong>{driver.heavyDamage ? "HEAVY" : driver.lightDamage ? `LIGHT ×${driver.lightDamage}` : "CLEAR"}</strong></span></div>
      <div className="player-resource-strip"><span><small>COMPOUND</small><strong>{TIRE_LABELS[driver.tire]}</strong></span><span><small>规则刹车热</small><strong>{driver.brakeHeat}/4</strong></span><span><small>晚刹标记</small><strong>{driver.tactical.lateBrake}</strong></span><span><small>防守标记</small><strong>{driver.tactical.defense}</strong></span><span><small>冷却标记</small><strong>{driver.tactical.cooling}</strong></span><span><small>快修</small><strong>{driver.tactical.quickRepair}</strong></span></div>
      {(actions.length > 0 || (driver.profile.talent === "late_braker" && rank >= 1) || (driver.profile.talent === "wide_train" && rank >= 2) || (driver.profile.talent === "overtake_maniac" && rank >= 3)) && <div className="talent-usage-ledger"><h3>培养效果 · 本场状态</h3>
        {actions.map((action) => {
          const used = uses?.talentActions.includes(action);
          const resolved = uses?.resolvedTalentActions?.includes(action);
          const active = used && !resolved && game.phase !== "strategy" && game.phase !== "finished" && game.plans[driver.id]?.talentAction === action;
          return <p key={action}><span title={TALENT_ACTIONS[action].effect}>{TALENT_ACTIONS[action].name}</span><strong className={active ? "available" : ""}>{resolved ? "已触发" : active ? "本回合已声明" : used ? "本场已用" : "可声明"}</strong></p>;
        })}
        {driver.profile.talent === "late_braker" && rank >= 1 && <p><span>无额外刹车热的晚刹标记</span><strong>剩余 {uses?.safeLateBrakeTokens ?? 0} 次</strong></p>}
        {driver.profile.talent === "late_braker" && rank >= 2 && <p><span>勉强改判成功</span><strong>{uses?.marginalUpgradeUsed ? "已用" : "剩余 1 次"}</strong></p>}
        {driver.profile.talent === "wide_train" && rank >= 2 && <p><span>额外免费防守</span><strong>{uses?.extraFreeDefenseUsed ? "已用" : "剩余 1 次"}</strong></p>}
        {driver.profile.talent === "wide_train" && rank >= 3 && <p><span>连续防守奖励</span><strong>{uses?.defenseRewardLap ? `第 ${uses.defenseRewardLap} 圈跨线结算` : "未待结算"}</strong></p>}
        {driver.profile.talent === "overtake_maniac" && rank >= 3 && <p><span>二连击</span><strong>{uses?.doubleAttackUsed ? "已用" : "剩余 1 次"}</strong></p>}
      </div>}
    </section>
  );
}
