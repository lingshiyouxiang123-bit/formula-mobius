"use client";

import { useState } from "react";
import { MINOR_TALENTS } from "@/game/config";
import { TalentTreeMap } from "@/components/career/TalentTreeMap";
import {
  availableTalentNodes,
  DRIVER_SPECIALIZATIONS,
  LEVEL_XP,
  normalizeProfileDevelopment,
  OFF_TRACK_ACTIONS,
  pendingTalentSlot,
  performOffTrackAction,
  purchaseTeamFacility,
  purchaseTeamUpgrade,
  rolloverSeason,
  selectSignatureMove,
  selectDriverSpecialization,
  SIGNATURE_MOVES,
  SIGNATURE_CUSTOMIZATION_NOTE,
  TALENT_NODES,
  TALENT_UPGRADES,
  talentUpgradeUnavailableReason,
  TEAM_FACILITIES,
  talentUpgradeRank,
  teamUpgradeCost,
  unlockTalentNode,
  upgradeSignatureMove,
} from "@/game/career";
import { requiredBurdenCount } from "@/game/engine";
import { STAT_LABELS, TALENT_LABELS } from "@/game/uiLabels";
import type { DriverProfile, DriverSpecializationId, MinorTalentId, OffTrackActionId, SignatureMoveId, StatKey } from "@/game/types";

const STAT_KEYS: StatKey[] = ["eng", "aero", "mech", "brk", "rel"];
const MINOR_TALENT_KEYS = Object.keys(MINOR_TALENTS) as MinorTalentId[];

export function CareerDevelopmentPanel({ profile, onUpdate, section = "all", teamDevelopmentLocked = false }: { profile: DriverProfile; onUpdate: (profile: DriverProfile) => void; section?: "all" | "driver" | "team"; teamDevelopmentLocked?: boolean }) {
  const developed = normalizeProfileDevelopment(profile);
  const career = developed.career!;
  const team = developed.team!;
  const [message, setMessage] = useState("");
  const nextThreshold = career.level < 20 ? LEVEL_XP[career.level] : LEVEL_XP[19];
  const previousThreshold = LEVEL_XP[career.level - 1];
  const levelProgress = career.level >= 20 ? 100 : Math.max(0, Math.min(100, (career.xp - previousThreshold) / (nextThreshold - previousThreshold) * 100));
  const available = availableTalentNodes(developed);
  const slot = pendingTalentSlot(developed);
  const performanceTotal = Object.values(developed.stats).reduce((sum, value) => sum + value, 0);
  const canDevelop = !teamDevelopmentLocked && performanceTotal < 15 && STAT_KEYS.some((stat) => developed.stats[stat] < 5 && team.developmentPoints >= teamUpgradeCost(developed.stats[stat]));
  const canDevelopFacility = !teamDevelopmentLocked && TEAM_FACILITIES.some((facility) => {
    const level = team.facilities?.[facility.id] ?? 0;
    return level < facility.costs.length && team.developmentPoints >= facility.costs[level];
  });
  const [driverView, setDriverView] = useState<"overview" | "talent" | "preparation" | "season">(slot ? "talent" : "overview");
  const [teamView, setTeamView] = useState<"performance" | "facilities" | "history">(canDevelop ? "performance" : canDevelopFacility ? "facilities" : "performance");
  const attention = slot && available.some((node) => node.active) ? "天赋待选" : canDevelop || canDevelopFacility ? "研发可用" : "展开";
  const selectedNodes = career.selectedNodes.map((id) => TALENT_NODES.find((node) => node.id === id)).filter((node): node is (typeof TALENT_NODES)[number] => Boolean(node));
  const selectedMinorTalents = developed.minorTalents ?? [];
  const requiredStarts = Math.ceil(career.level / 5);
  const remainingStarts = Math.max(0, requiredStarts - career.seasonStarts);
  const applyResult = (result: { ok: boolean; profile: DriverProfile; error?: string }, success: string) => {
    if (!result.ok) return setMessage(result.error ?? "操作失败");
    setMessage(success);
    onUpdate(result.profile);
  };

  return (
    <details className="development-drawer" open={section !== "all"}>
      <summary>
        <span>车手与车队培养</span>
        <strong>Lv{career.level} · {career.xp} 分</strong>
        <b>{team.developmentPoints} RP</b>
        <i className={attention === "展开" ? "" : "attention"}>{attention}</i>
      </summary>
      {message && <p className="development-message" role="status">{message}</p>}
      <div className="development-console">
        {section !== "team" && <section className="driver-development">
          <header className="development-header">
            <div><p className="section-kicker">DRIVER DEVELOPMENT</p><h2>{developed.name}</h2><span>{TALENT_LABELS[developed.talent]} · 主天赋升级 {talentUpgradeRank(career.level)}/3{career.level < 20 ? ` · 距 Lv${career.level + 1} 还差 ${nextThreshold - career.xp} 分` : " · 等级上限"}</span></div>
            <strong>LV {String(career.level).padStart(2, "0")}</strong>
          </header>
          <nav className="development-tabs driver-development-tabs" aria-label="车手培养视图">
            <button className={driverView === "overview" ? "active" : ""} onClick={() => setDriverView("overview")}><span>01</span>当前配置</button>
            <button className={driverView === "talent" ? "active" : ""} onClick={() => setDriverView("talent")}><span>02</span>天赋路径{slot && <i>待选</i>}</button>
            <button className={driverView === "preparation" ? "active" : ""} onClick={() => setDriverView("preparation")}><span>03</span>赛前训练{career.preparationAvailable && <i>可用</i>}</button>
            <button className={driverView === "season" ? "active" : ""} onClick={() => setDriverView("season")}><span>04</span>赛季维持{remainingStarts > 0 && <i>{remainingStarts}</i>}</button>
          </nav>
          {driverView === "overview" && <div className="development-view driver-overview">
            <div className="level-rail" aria-label={`等级进度 ${Math.round(levelProgress)}%`}><i style={{ width: `${levelProgress}%` }} /></div>
            <div className="main-talent-progression">{TALENT_UPGRADES[developed.talent].map((effect, index) => {
            const rank = index + 1;
            const unavailable = talentUpgradeUnavailableReason(developed.talent, rank);
            const unlocked = talentUpgradeRank(career.level) >= rank;
            return <span className={unavailable ? "inactive" : unlocked ? "active" : "locked"} key={effect}><b>Lv{[6,12,18][index]}</b><small>{effect}</small>{unavailable && <i>{unavailable}</i>}</span>;
            })}</div>
            <div className="driver-minor-talents">
            <div className="development-subhead"><strong>副天赋</strong><span>{selectedMinorTalents.length}/2</span></div>
            {selectedMinorTalents.length === 2 ? <div className="selected-node-line">{selectedMinorTalents.map((id) => <span key={id}><b>{MINOR_TALENTS[id].name}</b>{MINOR_TALENTS[id].description}</span>)}</div> : <div className="minor-talent-selector legacy-choice">{MINOR_TALENT_KEYS.filter((id) => !selectedMinorTalents.includes(id)).map((id) => <button type="button" title={MINOR_TALENTS[id].description} onClick={() => onUpdate({ ...developed, minorTalents: [...selectedMinorTalents, id] })} key={id}><strong>{MINOR_TALENTS[id].name}</strong><small>{MINOR_TALENTS[id].description}</small></button>)}</div>}
            </div>
            <div className="career-metrics">
            <span><small>生涯积分</small><strong>{career.xp}</strong></span>
            <span><small>出赛</small><strong>{career.races}</strong></span>
            <span><small>胜场</small><strong>{career.wins}</strong></span>
            <span><small>领奖台</small><strong>{career.podiums}</strong></span>
            <span><small>本季积分</small><strong>{career.seasonPoints}</strong></span>
            </div>
            <div className="driver-specialization">
            <div className="development-subhead"><strong>专精路径</strong><span>Lv3 确定</span></div>
            {career.specialization ? <div className="specialization-current"><b>{DRIVER_SPECIALIZATIONS[career.specialization].name}</b><span>{DRIVER_SPECIALIZATIONS[career.specialization].effect}</span></div> : career.level >= 3 ? <div className="specialization-selector">{(Object.keys(DRIVER_SPECIALIZATIONS) as DriverSpecializationId[]).map((id) => <button type="button" key={id} onClick={() => applyResult(selectDriverSpecialization(developed, id), `已确定专精：${DRIVER_SPECIALIZATIONS[id].name}`)}><strong>{DRIVER_SPECIALIZATIONS[id].name}</strong><small>{DRIVER_SPECIALIZATIONS[id].effect}</small></button>)}</div> : <p className="rule-note">还需 {3 - career.level} 级解锁。</p>}
            </div>
          </div>}
          {driverView === "talent" && <div className="development-view driver-talent-view"><div className="talent-path">
            <div className="development-subhead"><strong>天赋树</strong><span>{selectedNodes.length} 个节点{slot ? ` · 待选 Tier ${slot.flexible ? "1–4" : slot.tier}` : ""}</span></div>
            {selectedNodes.length === 0 ? <p className="rule-note">Lv2 解锁第一个 Tier-1 节点。</p> : <div className="selected-node-line">{selectedNodes.map((node) => <span key={node.id}><b>{node.id}</b>{node.name}</span>)}</div>}
            <TalentTreeMap profile={developed} available={available} onUnlock={(nodeId) => { const node = TALENT_NODES.find((item) => item.id === nodeId)!; applyResult(unlockTalentNode(developed, nodeId), `已解锁 ${node.id} ${node.name}`); }} />
          </div>
          <div className="signature-row">
            <div className="development-subhead"><strong>招牌动作</strong><span>Lv10 解锁 · Lv20 升级</span></div>
            <p className="rule-note">{SIGNATURE_CUSTOMIZATION_NOTE}</p>
            {career.signatureMove ? <div className="signature-current"><strong>{SIGNATURE_MOVES[career.signatureMove].name}</strong><span>{SIGNATURE_MOVES[career.signatureMove].effect}</span>{career.level >= 20 && !career.signatureUpgrade && <div><button className="button ghost" onClick={() => applyResult(upgradeSignatureMove(developed, "extra_use"), "招牌动作每场可使用两次")}>每场 2 次</button><button className="button ghost" onClick={() => applyResult(upgradeSignatureMove(developed, "enhanced"), "招牌动作升级为强化效果")}>强化效果</button></div>}</div> : career.level >= 10 ? <div className="signature-choices">{(Object.keys(SIGNATURE_MOVES) as SignatureMoveId[]).map((id) => <button type="button" key={id} onClick={() => applyResult(selectSignatureMove(developed, id), `已选择 ${SIGNATURE_MOVES[id].name}`)}><strong>{SIGNATURE_MOVES[id].name}</strong><small>{SIGNATURE_MOVES[id].effect}</small></button>)}</div> : <p className="rule-note">还需 {10 - career.level} 级解锁。</p>}
          </div></div>}
          {driverView === "preparation" && <div className="development-view preparation-view">
            <div className="preparation-status">
              <span><small>训练窗口</small><strong>{career.preparationAvailable ? "可训练" : "已关闭"}</strong></span>
              <span><small>下一场效果</small><strong>{career.pendingPreparation ? OFF_TRACK_ACTIONS[career.pendingPreparation.actionId].name : "无"}</strong></span>
              <span><small>可靠性</small><strong>REL {developed.stats.rel}</strong></span>
            </div>
            {!career.preparationAvailable && <p className="rule-note">本次训练已执行或正式比赛已创建；完成一场正式正赛后重新开放。SIM 不改变训练窗口。</p>}
            <div className="preparation-actions">{(Object.keys(OFF_TRACK_ACTIONS) as OffTrackActionId[]).map((id) => {
              const action = OFF_TRACK_ACTIONS[id];
              return <button type="button" disabled={!career.preparationAvailable} key={id} onClick={() => {
                const result = performOffTrackAction(developed, id);
                if (!result.ok) return setMessage(result.error ?? "训练未执行");
                setMessage(result.summary);
                onUpdate(result.profile);
              }}><span>{action.check} · 目标 {action.target}</span><strong>{action.name}</strong><small>{action.effect}</small><i>执行检定 →</i></button>;
            })}</div>
            {career.pendingPreparation && <div className="preparation-loadout"><span>待带入下一场正式正赛</span><strong>{career.pendingPreparation.startMp ? `第 1 回合 +${career.pendingPreparation.startMp} MP` : ""}{career.pendingPreparation.lateBrakeBonus ? ` · 首次晚刹 +${career.pendingPreparation.lateBrakeBonus}` : ""}{career.pendingPreparation.lightDamageShield ? " · 首次轻损伤无效" : ""}</strong></div>}
            {(career.preparationHistory?.length ?? 0) > 0 && <div className="preparation-history"><div className="development-subhead"><strong>最近检定</strong><span>{career.preparationHistory!.length} 条</span></div>{career.preparationHistory!.slice(-4).reverse().map((entry, index) => <p key={`${entry.season}-${entry.actionId}-${index}`}><span>S{entry.season}</span><b>{OFF_TRACK_ACTIONS[entry.actionId].name}</b><small>D12 {entry.roll} + {entry.modifier}</small><strong className={entry.success ? "available" : "warning-text"}>{entry.total} / {entry.success ? "通过" : "未通过"}</strong></p>)}</div>}
          </div>}
          {driverView === "season" && <div className="development-view driver-season-view">
            <div className="season-forecast">
              <span><small>当前赛季</small><strong>S{career.season}</strong></span>
              <span><small>维持要求</small><strong>{career.seasonStarts}/{requiredStarts}</strong></span>
              <span><small>仍需出赛</small><strong className={remainingStarts ? "warning-text" : "available"}>{remainingStarts}</strong></span>
              <span><small>赛季积分</small><strong>{career.seasonPoints}</strong></span>
            </div>
            <p className="season-rule">{remainingStarts > 0 ? `现在结束赛季将下降 ${Math.min(3, remainingStarts)} 级；完成 ${remainingStarts} 场正式正赛可以维持当前等级。` : "当前出赛数已经满足等级维持要求。"}</p>
            <div className="season-control">
            <span><small>等级维持</small><strong>第 {career.season} 赛季 · 已出赛 {career.seasonStarts} / {requiredStarts}</strong></span>
            <button className="button ghost" onClick={() => { if (window.confirm(`结束第 ${career.season} 赛季并结算等级维持？`)) applyResult(rolloverSeason(developed), `第 ${career.season + 1} 赛季开始`); }}>结束赛季</button>
            </div>
          </div>}
        </section>}

        {section !== "driver" && <section className="team-development">
          {teamDevelopmentLocked && <p className="rule-note">六站赛季进行中：属性与设施改由比赛中心的工程台使用 RP + BU 和项目队列管理，旧即时购买暂时锁定。</p>}
          <header className="development-header">
            <div><p className="section-kicker">TEAM DEVELOPMENT</p><h2>{team.name}</h2><span>性能指数 {performanceTotal}/15</span></div>
            <strong>{team.developmentPoints}<small> RP</small></strong>
          </header>
          <nav className="development-tabs" aria-label="车队培养视图">
            <button className={teamView === "performance" ? "active" : ""} onClick={() => setTeamView("performance")}><span>01</span>赛车性能{canDevelop && <i>可升级</i>}</button>
            <button className={teamView === "facilities" ? "active" : ""} onClick={() => setTeamView("facilities")}><span>02</span>技术设施{canDevelopFacility && <i>可升级</i>}</button>
            <button className={teamView === "history" ? "active" : ""} onClick={() => setTeamView("history")}><span>03</span>研发记录</button>
          </nav>
          {teamView === "performance" && <div className="development-view team-performance-view">
            <div className="rd-ledger"><span>本季 {career.season}</span><span>累计研发 {team.totalDevelopmentPoints}</span><span>升级 {team.upgrades.length + (team.facilityUpgrades?.length ?? 0)}</span></div>
            <div className="upgrade-table">
            {STAT_KEYS.map((stat) => {
              const value = developed.stats[stat];
              const cost = teamUpgradeCost(value);
              const blocked = teamDevelopmentLocked || value >= 5 || performanceTotal >= 15 || team.developmentPoints < cost;
              const unavailableReason = teamDevelopmentLocked ? "赛季中请使用比赛中心工程台" : value >= 5 ? "该属性已达到上限 5" : performanceTotal >= 15 ? "赛车性能指数已达到上限 15" : team.developmentPoints < cost ? `还需要 ${cost - team.developmentPoints} RP` : `消耗 ${cost} RP 升级`;
              const nextBurdens = requiredBurdenCount({ ...developed.stats, [stat]: value + 1 });
              const increasesBurdens = nextBurdens > requiredBurdenCount(developed.stats);
              return <div key={stat}>
                <span><small>{stat.toUpperCase()}</small><strong>{STAT_LABELS[stat]}</strong></span>
                <b>{value}<i>/5</i></b>
                <span className="upgrade-pips">{[1,2,3,4,5].map((step) => <i className={step <= value ? "filled" : ""} key={step} />)}</span>
                <button title={unavailableReason} aria-label={`${STAT_LABELS[stat]}：${unavailableReason}`} disabled={blocked} onClick={() => applyResult(purchaseTeamUpgrade(developed, stat), `${STAT_LABELS[stat]} ${value} → ${value + 1} · 消耗 ${cost} RP · 余额 ${team.developmentPoints - cost} RP`)}>{value >= 5 ? "MAX" : performanceTotal >= 15 ? "CAP" : `${cost} RP`}</button>
                <p className="upgrade-readout">{blocked ? unavailableReason : `${value} → ${value + 1} · 购买后剩余 ${team.developmentPoints - cost} RP`}{value < 5 && performanceTotal < 15 && increasesBurdens && <em>升级后赛前需选 {nextBurdens} 项负担</em>}</p>
              </div>;
            })}
            </div>
            <p className="development-load">研发负担：当前赛前需要选择 {requiredBurdenCount(developed.stats)} 项负担。</p>
          </div>}
          {teamView === "facilities" && <div className="development-view team-facility-view"><div className="facility-development">
            <div className="development-subhead"><strong>技术设施</strong><span>{TEAM_FACILITIES.filter((facility) => (team.facilities?.[facility.id] ?? 0) >= facility.costs.length).length}/{TEAM_FACILITIES.length} 完成</span></div>
            <div className="facility-grid">{TEAM_FACILITIES.map((facility) => {
              const level = team.facilities?.[facility.id] ?? 0;
              const complete = level >= facility.costs.length;
              const cost = complete ? 0 : facility.costs[level];
              const blocked = teamDevelopmentLocked || complete || team.developmentPoints < cost;
              const reason = teamDevelopmentLocked ? "赛季中请使用比赛中心工程台" : complete ? "项目已经完成" : team.developmentPoints < cost ? `还需要 ${cost - team.developmentPoints} RP` : `消耗 ${cost} RP`;
              return <article className={complete ? "complete" : ""} key={facility.id}><span>LV {level}/{facility.costs.length}</span><strong>{facility.name}</strong><small>{facility.effect}</small><button title={reason} disabled={blocked} onClick={() => applyResult(purchaseTeamFacility(developed, facility.id), `${facility.name}研发至 Lv${level + 1} · 消耗 ${cost} RP · 余额 ${team.developmentPoints - cost} RP`)}>{complete ? "完成" : `${cost} RP`}</button><p className="upgrade-readout">{blocked ? reason : `购买后剩余 ${team.developmentPoints - cost} RP`}</p></article>;
            })}</div>
          </div></div>}
          {teamView === "history" && <div className="development-view team-history-view">
            {team.upgrades.length > 0 ? <div className="upgrade-history"><div className="development-subhead"><strong>赛车属性</strong><span>{team.upgrades.length} 次永久升级</span></div>{team.upgrades.slice(-6).reverse().map((upgrade, index) => <p key={`${upgrade.season}-${upgrade.stat}-${index}`}><span>S{upgrade.season}</span><b>{upgrade.stat.toUpperCase()}</b><small>{STAT_LABELS[upgrade.stat]}</small><strong>{upgrade.from} → {upgrade.to}</strong></p>)}</div> : <p className="rule-note">尚无赛车属性升级记录。</p>}
            {(team.facilityUpgrades?.length ?? 0) > 0 ? <div className="upgrade-history facility-history"><div className="development-subhead"><strong>技术设施</strong><span>{team.facilityUpgrades!.length} 次升级</span></div>{team.facilityUpgrades!.slice(-6).reverse().map((upgrade, index) => { const facility = TEAM_FACILITIES.find((item) => item.id === upgrade.facility)!; return <p key={`${upgrade.season}-${upgrade.facility}-${index}`}><span>S{upgrade.season}</span><b>LV{upgrade.level}</b><small>{facility.name}</small><strong>{upgrade.cost} RP</strong></p>; })}</div> : <p className="rule-note">尚无技术设施升级记录。</p>}
          </div>}
        </section>}
      </div>
    </details>
  );
}
