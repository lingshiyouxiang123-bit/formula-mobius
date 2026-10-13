"use client";

import { useEffect, useMemo, useState } from "react";
import { CareerDevelopmentPanel } from "@/components/career/CareerDevelopmentPanel";
import { CircuitProjection } from "@/components/race/CircuitProjection";
import { CarSystemsVisual } from "@/components/visual/CarSystemsVisual";
import type { AppSection } from "@/components/shell/LandingPage";
import { createDriverCareer, createTeamDevelopment, DRIVER_SPECIALIZATIONS, LEVEL_XP, OFF_TRACK_ACTIONS, SIGNATURE_MOVES, TALENT_NODES, TEAM_FACILITIES } from "@/game/career";
import { MINOR_TALENTS, TALENTS } from "@/game/config";
import { TRACKS } from "@/game/tracks";
import { generateTrack } from "@/game/trackGenerator";
import { loadGeneratedTracks, saveGeneratedTracks } from "@/game/storage";
import { sortedConstructorStandings, sortedSeasonStandings } from "@/game/season";
import { currentAtrPeriod, projectPrice, RESEARCH_PHILOSOPHIES } from "@/game/seasonDevelopment";
import { SPONSORS } from "@/game/seasonMarket";
import { DEFAULT_ADVANCED_ENTRY } from "@/game/advancedSeason";
import { STAT_LABELS, TALENT_LABELS } from "@/game/uiLabels";
import type { AdvancedModuleSettings, AdvancedRaceEntryChoice, CarStats, CreateGameOptions, DriverProfile, DriverSpecializationId, GameState, MediaChannelSettings, MinorTalentId, PressResponseIntent, ResearchPhilosophyId, ResearchProjectMode, SeasonPerformanceAction, SeasonPublicAction, SeasonState, SignatureMoveId, SponsorId, StatKey, TalentId, TalentNodeId, TeamFacilityId, TeamProfile, Track, TrackArchetype, TrackComplexity, TrackSize, WeatherMode, WeekendMode } from "@/game/types";

const STAT_KEYS: StatKey[] = ["eng", "aero", "mech", "brk", "rel"];
const TALENT_KEYS = Object.keys(TALENTS) as TalentId[];
const MINOR_TALENT_KEYS = Object.keys(MINOR_TALENTS) as MinorTalentId[];
const DEFAULT_STATS: CarStats = { eng: 3, aero: 2, mech: 2, brk: 2, rel: 2 };
const ADVANCED_LABELS: Record<keyof AdvancedModuleSettings, string> = { componentPool: "动力单元 / 变速箱池", scrutineering: "赛后车检", aggressiveAccounting: "激进核算", appeals: "判罚证据复核", rookiePractice: "新秀练习", entertainmentDeck: "轻量娱乐牌组" };

export function bindDriverToTeam(driver: DriverProfile, team: TeamProfile): DriverProfile {
  return { ...driver, teamId: team.id, stats: { ...team.stats }, team: { ...team.development, name: team.name } };
}

export function WorkspaceHeader({ active, index, title, detail, onBack, onNavigate }: { active: AppSection; index: string; title: string; detail: string; onBack: () => void; onNavigate: (section: AppSection) => void }) {
  const destinations: Array<{ id: AppSection; index: string; label: string }> = [
    { id: "races", index: "01", label: "比赛" },
    { id: "drivers", index: "02", label: "车手" },
    { id: "teams", index: "03", label: "车队" },
    { id: "social", index: "04", label: "社交" },
  ];
  return <header className="workspace-header"><button onClick={onBack}>← 目录</button><span>{index}</span><div><p>{detail}</p><h1>{title}</h1></div><nav aria-label="工作区切换">{destinations.map((destination) => <button type="button" className={destination.id === active ? "active" : ""} aria-current={destination.id === active ? "page" : undefined} onClick={() => onNavigate(destination.id)} key={destination.id}><i>{destination.index}</i>{destination.label}</button>)}</nav></header>;
}

export function DriverCenter({ profiles, teams, season, onCreate, onUpdate, onDelete, onAssign, onBack, onNavigate }: {
  profiles: DriverProfile[];
  teams: TeamProfile[];
  season?: SeasonState | null;
  onCreate: (profile: DriverProfile) => void;
  onUpdate: (profile: DriverProfile) => void;
  onDelete: (id: string) => void;
  onAssign: (driverId: string, teamId: string) => void;
  onBack: () => void;
  onNavigate: (section: AppSection) => void;
}) {
  const [selectedId, setSelectedId] = useState(profiles[0]?.id ?? "");
  const selected = profiles.find((profile) => profile.id === selectedId) ?? profiles[0];
  const team = selected ? teams.find((item) => item.id === selected.teamId) : undefined;
  const bound = selected && team ? bindDriverToTeam(selected, team) : selected;
  return <div className="workspace-page driver-workspace">
    <WorkspaceHeader active="drivers" index="02" title="车手中心" detail={`${profiles.length} DRIVER PROFILES`} onBack={onBack} onNavigate={onNavigate} />
    <div className="workspace-split">
      <aside className="entity-rail"><div className="entity-rail-heading"><strong>车手</strong><span>{profiles.length}</span></div>{profiles.map((profile) => <button className={profile.id === selected?.id ? "active" : ""} key={profile.id} onClick={() => setSelectedId(profile.id)}><i style={{ background: profile.color }} /><span><strong>{profile.name}</strong><small>{profile.abbreviation} · {TALENT_LABELS[profile.talent]}</small></span><b>Lv{profile.career?.level ?? 1}</b></button>)}</aside>
      <main className="entity-stage">
        {selected && bound ? <>
          <div className="entity-command"><div><span className="driver-chip" style={{ background: selected.color }}>{selected.abbreviation}</span><p><strong>{selected.name}</strong><small>{TALENT_LABELS[selected.talent]} · {team?.name ?? "待签约"}</small></p></div><label>所属车队<select value={team?.id ?? ""} disabled={teams.length === 0} onChange={(event) => onAssign(selected.id, event.target.value)}><option value="" disabled>选择车队</option>{teams.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><button className="text-danger" onClick={() => window.confirm(`删除车手“${selected.name}”？`) && onDelete(selected.id)}>删除车手</button></div>
          <CareerDevelopmentPanel key={selected.id} profile={bound} section="driver" teamDevelopmentLocked={Boolean(season?.status === "active")} onUpdate={(updated) => onUpdate({ ...selected, talent: updated.talent, minorTalents: updated.minorTalents, career: updated.career })} />
        </> : <div className="empty-state">{teams.length ? "还没有车手，请在下方创建。" : <>先建立一支车队，再创建车手。<button className="button ghost" onClick={() => onNavigate("teams")}>新建车队 →</button></>}</div>}
        <DriverCreator teams={teams} onCreate={(profile) => { onCreate(profile); setSelectedId(profile.id); }} />
      </main>
    </div>
  </div>;
}

function DriverCreator({ teams, onCreate }: { teams: TeamProfile[]; onCreate: (profile: DriverProfile) => void }) {
  const [name, setName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [color, setColor] = useState("#ef4444");
  const [talent, setTalent] = useState<TalentId>("late_braker");
  const [startLevel, setStartLevel] = useState(1);
  const [minorTalents, setMinorTalents] = useState<MinorTalentId[]>([]);
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [savedName, setSavedName] = useState("");
  const activeTeamId = teams.some((team) => team.id === teamId) ? teamId : teams[0]?.id ?? "";
  const validCode = /^[A-Za-z0-9\u4e00-\u9fff]{2,4}$/.test(abbreviation.trim());
  const missing = [!teams.length && "先建立车队", !name.trim() && "填写车手名称", !validCode && "简称需为 2–4 个中文、字母或数字", minorTalents.length !== 2 && `再选 ${2 - minorTalents.length} 个副天赋`].filter(Boolean);
  const toggleMinorTalent = (id: MinorTalentId) => setMinorTalents((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 2 ? [...current, id] : current);
  const create = () => {
    const team = teams.find((item) => item.id === activeTeamId);
    if (!team || minorTalents.length !== 2 || !name.trim() || !validCode) return;
    onCreate({ id: crypto.randomUUID(), name: name.trim(), abbreviation: abbreviation.trim().toUpperCase(), color, talent, minorTalents, teamId: team.id, stats: { ...team.stats }, team: { ...team.development }, career: createDriverCareer(startLevel) });
    setSavedName(name.trim());
    setName(""); setAbbreviation(""); setMinorTalents([]);
  };
  return <details className="entity-creator">
    <summary><span>NEW DRIVER</span><strong>新建车手</strong><i>＋</i></summary>
    <div className="entity-form">
      <label>车手名称<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>简称<input maxLength={4} pattern="[A-Za-z0-9\u4e00-\u9fff]{2,4}" title="2–4 个中文、字母或数字" value={abbreviation} onChange={(event) => setAbbreviation(event.target.value)} /></label>
      <label>所属车队<select value={activeTeamId} disabled={!teams.length} onChange={(event) => setTeamId(event.target.value)}>{!teams.length && <option value="">尚未建立车队</option>}{teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label>
      <label>主天赋<select value={talent} onChange={(event) => setTalent(event.target.value as TalentId)}>{TALENT_KEYS.map((id) => <option value={id} key={id}>{TALENT_LABELS[id]}</option>)}</select></label>
      <label>识别颜色<input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
      <label>起始等级<select value={startLevel} onChange={(event) => setStartLevel(Number(event.target.value))}>{LEVEL_XP.map((xp, index) => <option key={index} value={index + 1}>Lv{index + 1} · {xp} XP</option>)}</select><small>天赋树、专精与招牌在创建后选择。</small></label>
      <fieldset className="minor-talent-selector"><legend>副天赋 · 选择 2 个（{minorTalents.length}/2）</legend>{MINOR_TALENT_KEYS.map((id) => <button type="button" aria-pressed={minorTalents.includes(id)} className={minorTalents.includes(id) ? "active" : ""} title={MINOR_TALENTS[id].description} onClick={() => toggleMinorTalent(id)} key={id}><strong>{MINOR_TALENTS[id].name}</strong><small>{MINOR_TALENTS[id].description}</small></button>)}</fieldset>
      <div className="creation-feedback" role="status"><span>{savedName && `已创建 ${savedName}。`}{missing.length ? `待完成：${missing.join("；")}` : "配置完整，可以保存车手。"}</span></div>
      <button className="button primary" disabled={missing.length > 0} onClick={create}>保存车手</button>
      <p>{teams.length ? `${TALENTS[talent].description}${TALENTS[talent].inactiveNote ? ` · 当前赛制：${TALENTS[talent].inactiveNote}` : ""}` : "需要先在车队中心建立车队。"}</p>
    </div>
  </details>;
}

export function TeamCenter({ teams, profiles, season, onCreate, onUpdate, onDelete, onBack, onNavigate }: {
  teams: TeamProfile[];
  profiles: DriverProfile[];
  season?: SeasonState | null;
  onCreate: (team: TeamProfile) => void;
  onUpdate: (team: TeamProfile) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
  onNavigate: (section: AppSection) => void;
}) {
  const [selectedId, setSelectedId] = useState(teams[0]?.id ?? "");
  const selected = teams.find((team) => team.id === selectedId) ?? teams[0];
  const assigned = selected ? profiles.filter((driver) => driver.teamId === selected.id) : [];
  const proxy = selected ? bindDriverToTeam(assigned[0] ?? { id: `team-${selected.id}`, name: selected.name, abbreviation: selected.abbreviation, color: selected.color, talent: "strategist", stats: selected.stats, career: createDriverCareer() }, selected) : undefined;
  return <div className="workspace-page team-workspace">
    <WorkspaceHeader active="teams" index="03" title="车队中心" detail={`${teams.length} TEAM PROFILES`} onBack={onBack} onNavigate={onNavigate} />
    <div className="workspace-split">
      <aside className="entity-rail"><div className="entity-rail-heading"><strong>车队</strong><span>{teams.length}</span></div>{teams.map((team) => <button className={team.id === selected?.id ? "active" : ""} key={team.id} onClick={() => setSelectedId(team.id)}><i style={{ background: team.color }} /><span><strong>{team.name}</strong><small>{team.abbreviation} · {profiles.filter((driver) => driver.teamId === team.id).length} 名车手</small></span><b>{Object.values(team.stats).reduce((sum, value) => sum + value, 0)}</b></button>)}</aside>
      <main className="entity-stage">
        {selected && proxy ? <>
          <div className="entity-command">
            <div><span className="driver-chip" style={{ background: selected.color }}>{selected.abbreviation}</span><p><strong>{selected.name}</strong><small>{assigned.length ? assigned.map((driver) => driver.name).join(" / ") : "暂无签约车手"}</small></p></div>
            <button className="text-danger" onClick={() => window.confirm(`删除车队“${selected.name}”？所属车手将变为待签约状态。`) && onDelete(selected.id)}>删除车队</button>
          </div>
          <CarSystemsVisual stats={selected.stats} color={selected.color} name={selected.name} />
          <CareerDevelopmentPanel key={selected.id} profile={proxy} section="team" teamDevelopmentLocked={Boolean(season?.status === "active" && season.playerTeam.teamId === selected.id)} onUpdate={(updated) => onUpdate({ ...selected, stats: updated.stats, development: updated.team! })} />
        </> : <p className="empty-state">建立第一支车队后，研发台会显示在这里。</p>}
        <TeamCreator onCreate={(team) => { onCreate(team); setSelectedId(team.id); }} />
      </main>
    </div>
  </div>;
}

function TeamCreator({ onCreate }: { onCreate: (team: TeamProfile) => void }) {
  const [name, setName] = useState(""); const [abbreviation, setAbbreviation] = useState(""); const [color, setColor] = useState("#38bdf8"); const [stats, setStats] = useState<CarStats>(DEFAULT_STATS);
  const [philosophy, setPhilosophy] = useState<ResearchPhilosophyId>("reliability");
  const [savedName, setSavedName] = useState("");
  const total = STAT_KEYS.reduce((sum, key) => sum + stats[key], 0);
  const validCode = /^[A-Za-z0-9\u4e00-\u9fff]{2,4}$/.test(abbreviation.trim());
  const missing = [!name.trim() && "填写车队名称", !validCode && "简称需为 2–4 个中文、字母或数字", total < 11 ? `还有 ${11 - total} 点性能未分配` : total > 11 ? `性能超出 ${total - 11} 点，请减少` : false].filter(Boolean);
  const create = () => {
    if (missing.length) return;
    onCreate({ id: crypto.randomUUID(), name: name.trim(), abbreviation: abbreviation.trim().toUpperCase(), color, stats: { ...stats }, development: createTeamDevelopment(name.trim(), stats), researchPhilosophy: philosophy });
    setSavedName(name.trim()); setName(""); setAbbreviation(""); setStats(DEFAULT_STATS);
  };
  return <details className="entity-creator">
    <summary><span>NEW TEAM</span><strong>新建车队</strong><i>＋</i></summary>
    <div className="entity-form team-form">
      <label>车队名称<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>简称<input maxLength={4} pattern="[A-Za-z0-9\u4e00-\u9fff]{2,4}" title="2–4 个中文、字母或数字" value={abbreviation} onChange={(event) => setAbbreviation(event.target.value)} /></label>
      <label>识别颜色<input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
      <label>研发理念<select value={philosophy} onChange={(event) => setPhilosophy(event.target.value as ResearchPhilosophyId)}>{(Object.keys(RESEARCH_PHILOSOPHIES) as ResearchPhilosophyId[]).map((id) => <option value={id} key={id}>{RESEARCH_PHILOSOPHIES[id].name}</option>)}</select><small>{RESEARCH_PHILOSOPHIES[philosophy].description}</small></label>
      <div className="team-stat-editor"><span>性能指数 <b className={total === 11 ? "valid-total" : "invalid-total"}>{total}/11</b></span>{STAT_KEYS.map((stat) => <label key={stat}><small>{stat.toUpperCase()} · {STAT_LABELS[stat]}</small><input type="range" min="1" max="4" value={stats[stat]} onChange={(event) => setStats({ ...stats, [stat]: Number(event.target.value) })} /><strong>{stats[stat]}</strong></label>)}</div>
      <div className="creation-feedback" role="status"><span>{savedName && `已创建 ${savedName}。`}{missing.length ? `待完成：${missing.join("；")}` : "配置完整，可以保存车队。"}</span></div>
      <button className="button primary" disabled={missing.length > 0} onClick={create}>保存车队</button>
    </div>
  </details>;
}

export function RaceCenter({ profiles, teams, savedMatch, season, onResume, onStart, onCreateSeason, onChooseSeasonSponsor, onAcceptContract, onAdvancedSettings, onAccountingCredit, onStartSeasonRound, onSubmitSeasonActions, onStartSeasonProject, onUpgradeSeasonFacility, onAbandonSeason, debugControls, onBack, onNavigate }: {
  profiles: DriverProfile[];
  teams: TeamProfile[];
  savedMatch?: GameState | null;
  season?: SeasonState | null;
  onResume?: () => void;
  onStart: (profile: DriverProfile, aiCount: number, track: Track, mode: "official" | "simulation", seed?: number, options?: CreateGameOptions) => void;
  onCreateSeason?: (profile: DriverProfile, aiCount: number) => void;
  onChooseSeasonSponsor?: (sponsorId: SponsorId) => void;
  onAcceptContract?: (offerId: string) => void;
  onPressResponse?: (raceId: string, questionId: string, intent: PressResponseIntent) => void;
  onMediaSettings?: (settings: MediaChannelSettings) => void;
  onAdvancedSettings?: (settings: AdvancedModuleSettings) => void;
  onAccountingCredit?: (amount: 1 | 2) => void;
  onStartSeasonRound?: (profile: DriverProfile, advancedChoice?: AdvancedRaceEntryChoice) => void;
  onSubmitSeasonActions?: (performance: SeasonPerformanceAction, publicAction: SeasonPublicAction) => void;
  onStartSeasonProject?: (stat: StatKey, mode: ResearchProjectMode) => void;
  onUpgradeSeasonFacility?: (facility: TeamFacilityId) => void;
  onAbandonSeason?: () => void;
  /** TEMP_SEASON_DEBUG: remove this prop and the rendering seam with the debug module. */
  debugControls?: React.ReactNode;
  onBack: () => void;
  onNavigate: (section: AppSection) => void;
}) {
  const [mode, setMode] = useState<"official" | "simulation">("official");
  const [weekendMode, setWeekendMode] = useState<WeekendMode>("quick");
  const [weatherMode, setWeatherMode] = useState<WeatherMode>("fixed");
  const [sprintEnabled, setSprintEnabled] = useState(false);
  const [seasonPerformance, setSeasonPerformance] = useState<SeasonPerformanceAction>("simulator");
  const [seasonPublic, setSeasonPublic] = useState<SeasonPublicAction>("media");
  const [advancedEntry, setAdvancedEntry] = useState<AdvancedRaceEntryChoice>({ ...DEFAULT_ADVANCED_ENTRY });
  const [researchMode, setResearchMode] = useState<ResearchProjectMode>("standard");
  const [driverId, setDriverId] = useState(profiles[0]?.id ?? "");
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [trackId, setTrackId] = useState(TRACKS[0].id);
  const [generatedTracks, setGeneratedTracks] = useState<Track[]>([]);
  const [trackSource, setTrackSource] = useState<"preset" | "generated">("preset");
  const [trackArchetype, setTrackArchetype] = useState<TrackArchetype>("mixed");
  const [trackSize, setTrackSize] = useState<TrackSize>("standard");
  const [trackComplexity, setTrackComplexity] = useState<TrackComplexity>("medium");
  const [trackSeed, setTrackSeed] = useState("24005");
  const [trackAlias, setTrackAlias] = useState("");
  const [trackError, setTrackError] = useState("");
  const [aiCount, setAiCount] = useState(3);
  const [simTalent, setSimTalent] = useState<TalentId>("late_braker");
  const [simMinorTalents, setSimMinorTalents] = useState<MinorTalentId[]>(["drs_expert", "ers_management"]);
  const [simLevel, setSimLevel] = useState(10);
  const [simSpecialization, setSimSpecialization] = useState<DriverSpecializationId | "">("qualifying");
  const [simNodes, setSimNodes] = useState<TalentNodeId[]>([]);
  const [signature, setSignature] = useState<SignatureMoveId | "">("");
  const [signatureUpgrade, setSignatureUpgrade] = useState<"extra_use" | "enhanced" | "">("");
  const [simSeed, setSimSeed] = useState("42");
  const [simStats, setSimStats] = useState<CarStats>({ ...(teams[0]?.stats ?? DEFAULT_STATS) });
  const [simFacilities, setSimFacilities] = useState<Partial<Record<TeamFacilityId, number>>>({ ...(teams[0]?.development.facilities ?? {}) });
  const [visualMode, setVisualMode] = useState<"track" | "car">("track");
  const driver = profiles.find((item) => item.id === driverId) ?? profiles[0];
  const officialTeam = teams.find((item) => item.id === driver?.teamId);
  const officialRaceProfile = driver && officialTeam ? bindDriverToTeam(driver, officialTeam) : null;
  const seasonDriver = season ? profiles.find((item) => item.id === season.humanDriverId) : undefined;
  const seasonTeam = teams.find((item) => item.id === seasonDriver?.teamId);
  const seasonRaceProfile = seasonDriver && seasonTeam ? bindDriverToTeam(seasonDriver, seasonTeam) : null;
  const selectedTeam = mode === "official" ? officialTeam : teams.find((item) => item.id === teamId) ?? teams[0];
  useEffect(() => {
    const load = window.setTimeout(() => setGeneratedTracks(loadGeneratedTracks()), 0);
    return () => window.clearTimeout(load);
  }, []);
  const allTracks = useMemo<Track[]>(() => [...TRACKS, ...generatedTracks], [generatedTracks]);
  const track = allTracks.find((item) => item.id === trackId) ?? TRACKS[0];
  const visualStats = mode === "simulation" ? simStats : selectedTeam?.stats ?? DEFAULT_STATS;
  const simPerformance = STAT_KEYS.reduce((sum, stat) => sum + simStats[stat], 0);
  const seedValue = Number(simSeed);
  const seedValid = /^\d+$/.test(simSeed) && Number.isInteger(seedValue) && seedValue >= 1 && seedValue <= 4294967295;
  const raceProfile = useMemo(() => {
    if (!driver || !selectedTeam) return null;
    if (mode === "official" && driver.contract?.role === "reserve") return null;
    const minorTalents = mode === "official" ? driver.minorTalents ?? [] : simMinorTalents;
    if (minorTalents.length !== 2 || (mode === "simulation" && (simPerformance < 11 || simPerformance > 15))) return null;
    const bound = bindDriverToTeam(driver, selectedTeam);
    if (mode === "official") return bound;
    return {
      ...bound,
      talent: simTalent,
      minorTalents,
      stats: { ...simStats },
      team: { ...bound.team!, facilities: { ...simFacilities } },
      career: {
        ...createDriverCareer(),
        level: simLevel,
        xp: LEVEL_XP[simLevel - 1],
        selectedNodes: simNodes,
        specialization: simLevel >= 3 ? simSpecialization || undefined : undefined,
        signatureMove: simLevel >= 10 ? signature || undefined : undefined,
        signatureUpgrade: simLevel >= 20 && signature ? signatureUpgrade || undefined : undefined,
      },
    };
  }, [driver, mode, selectedTeam, signature, signatureUpgrade, simFacilities, simLevel, simMinorTalents, simNodes, simPerformance, simSpecialization, simStats, simTalent]);
  const loadDriverConfiguration = () => {
    if (!driver) return;
    setSimTalent(driver.talent);
    setSimMinorTalents([...(driver.minorTalents ?? [])]);
    setSimLevel(driver.career?.level ?? 1);
    setSimNodes([...(driver.career?.selectedNodes ?? [])]);
    setSimSpecialization(driver.career?.specialization ?? "");
    setSignature(driver.career?.signatureMove ?? "");
    setSignatureUpgrade(driver.career?.signatureUpgrade ?? "");
  };
  const toggleNode = (id: TalentNodeId) => setSimNodes((current) => current.includes(id) ? current.filter((node) => node !== id) : [...current, id]);
  const toggleSimMinorTalent = (id: MinorTalentId) => setSimMinorTalents((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 2 ? [...current, id] : current);
  const cycleFacility = (id: TeamFacilityId, maxLevel: number) => setSimFacilities((current) => ({ ...current, [id]: ((current[id] ?? 0) + 1) % (maxLevel + 1) }));
  const selectSimulationTeam = (id: string) => {
    setTeamId(id);
    const team = teams.find((item) => item.id === id);
    if (!team) return;
    setSimStats({ ...team.stats });
    setSimFacilities({ ...(team.development.facilities ?? {}) });
  };
  const createGeneratedTrack = () => {
    const seed = Number(trackSeed);
    try {
      const generated = generateTrack({ seed, archetype: trackArchetype, size: trackSize, complexity: trackComplexity });
      const next = [...generatedTracks.filter((item) => item.id !== generated.id), generated];
      setGeneratedTracks(next);
      saveGeneratedTracks(next);
      setTrackId(generated.id);
      setTrackSource("generated");
      setTrackError("");
    } catch (cause) {
      setTrackError(cause instanceof Error ? cause.message : "赛道生成失败");
    }
  };
  const renameGeneratedTrack = () => {
    if (!track.generated || !trackAlias.trim()) return;
    const next = generatedTracks.map((item) => item.id === track.id ? { ...item, name: trackAlias.trim() } : item);
    setGeneratedTracks(next);
    saveGeneratedTracks(next);
    setTrackAlias("");
  };
  const deleteGeneratedTrack = () => {
    if (!track.generated || !generatedTracks.some(item => item.id === track.id)) return;
    if (!window.confirm(`从赛道库删除“${track.name}”？已保存的比赛不受影响；相同种子可以重新生成。`)) return;
    const next = generatedTracks.filter(item => item.id !== track.id);
    saveGeneratedTracks(next);
    setGeneratedTracks(next);
    setTrackId(next[0]?.id ?? TRACKS[0].id);
    if (!next.length) setTrackSource("preset");
    setTrackAlias("");
    setTrackError("");
  };
  const readyChecks = [
    { label: "车手档案", ok: Boolean(driver), value: driver ? `${driver.abbreviation} / Lv${mode === "simulation" ? simLevel : driver.career?.level ?? 1}` : "未建立" },
    { label: "副天赋", ok: mode === "simulation" ? simMinorTalents.length === 2 : driver?.minorTalents?.length === 2, value: mode === "simulation" ? `${simMinorTalents.length}/2 已选` : driver?.minorTalents?.length === 2 ? driver.minorTalents.map((id) => MINOR_TALENTS[id].name).join(" / ") : "请在车手中心补选" },
    { label: "赛车设定", ok: mode === "official" || (simPerformance >= 11 && simPerformance <= 15), value: mode === "simulation" ? `PI ${simPerformance}/15` : selectedTeam ? `PI ${Object.values(selectedTeam.stats).reduce((sum, value) => sum + value, 0)}/15` : "未载入" },
    { label: "车队席位", ok: Boolean(selectedTeam) && (mode !== "official" || driver?.contract?.role !== "reserve"), value: selectedTeam ? mode === "official" && driver?.contract?.role === "reserve" ? "储备席位不可参加正式赛" : `${selectedTeam.abbreviation} / PI ${Object.values(selectedTeam.stats).reduce((sum, value) => sum + value, 0)}` : mode === "official" ? "车手尚未签约" : "未建立" },
    { label: "赛前训练", ok: true, value: mode === "simulation" ? "SIM 不读取" : driver?.career?.pendingPreparation ? OFF_TRACK_ACTIONS[driver.career.pendingPreparation.actionId].name : driver?.career?.preparationAvailable ? "可在车手中心执行" : "窗口关闭 · 无待用效果" },
    { label: "赛道配置", ok: Boolean(track), value: `${track.name} / ${track.laps} 圈` },
  ];
  const atr = season ? currentAtrPeriod(season) : null;
  const constructorStandings = season ? sortedConstructorStandings(season) : [];

  return <div className="workspace-page race-center">
    <WorkspaceHeader active="races" index="01" title="比赛中心" detail="OFFICIAL / SIMULATION" onBack={onBack} onNavigate={onNavigate} />
    {savedMatch && onResume && <div className="race-resume-bar"><div><strong>{savedMatch.sessionMode === "simulation" ? "SIM" : "正式正赛"} · {savedMatch.track.name}</strong><span>{savedMatch.drivers.find((item) => item.id === savedMatch.humanDriverId)?.profile.name} · {savedMatch.phase === "finished" ? "已完赛" : savedMatch.round > 0 ? `第 ${savedMatch.round} 回合` : "赛前准备"} · {savedMatch.drivers.length} 辆车</span></div><button type="button" className="button secondary" onClick={onResume}>{savedMatch.phase === "finished" ? "查看比赛结果" : "恢复比赛"}</button></div>}
    <section className="season-console" aria-label="六站本地赛季">
      <div><span>LOCAL CHAMPIONSHIP</span><strong>{season ? season.status === "finished" ? "赛季结束" : `第 ${season.currentRound}/6 站` : "未建立赛季"}</strong><small>{season ? `${season.calendar[season.currentRound - 1]?.sprint ? "冲刺周末" : "标准周末"} · ${season.standings.length ? `领跑 ${sortedSeasonStandings(season)[0].name} ${sortedSeasonStandings(season)[0].championshipPoints} 分` : "积分待产生"}` : "固定六站；建立赛季时随机选两站冲刺"}</small>{season && <em>RP {season.playerTeam.developmentPoints} · BU {season.playerTeam.budgetRemaining}/{season.playerTeam.budgetCap} · ATR {atr?.coefficient}% / {atr?.slots ?? 0} 槽</em>}</div>
      {!season ? <button type="button" className="button secondary" disabled={!officialRaceProfile || officialRaceProfile.contract?.role === "reserve"} onClick={() => officialRaceProfile && onCreateSeason?.(officialRaceProfile, aiCount)}>建立六站赛季</button> : season.awaitingInterRoundActions ? <div className="season-actions"><label>性能槽<select value={seasonPerformance} onChange={(event) => setSeasonPerformance(event.target.value as SeasonPerformanceAction)}><option value="simulator">模拟器</option><option value="fitness">体能</option><option value="development_support">研发协作</option></select></label><label>公共事务槽<select value={seasonPublic} onChange={(event) => setSeasonPublic(event.target.value as SeasonPublicAction)}><option value="media">媒体</option><option value="sponsor">赞助</option><option value="community">社区</option><option value="rest">休息</option></select></label><button type="button" className="button secondary" onClick={() => onSubmitSeasonActions?.(seasonPerformance, seasonPublic)}>提交并进入下一站</button></div> : season.status === "active" ? <button type="button" className="button primary" disabled={!seasonRaceProfile || !season.sponsor} onClick={() => seasonRaceProfile && onStartSeasonRound?.(seasonRaceProfile, advancedEntry)}>{season.sponsor ? `开始本站 · ${seasonDriver?.abbreviation ?? "—"}` : "先选择赞助目标"}</button> : <span className="season-champion">冠军 · {sortedSeasonStandings(season)[0]?.name ?? "—"}</span>}
      {season && <button type="button" className="button ghost danger" onClick={onAbandonSeason}>清除赛季</button>}
    </section>
    {debugControls}
    {season && <section className="season-market-console" aria-label="合同、声望与赞助">
      <p className="rule-note">声望系统目前是框架版，完整社交生态的声望玩法尚未实装。</p>
      <header><span>DRIVER MARKET</span><strong>声望 {season.reputation}/10</strong><small>{season.currentContract.teamName} · {season.currentContract.role === "primary" ? "一号车手条款" : season.currentContract.role === "race" ? "正式席位" : "储备席位"}</small></header>
      {!season.sponsor && season.rounds.length === 0 ? <div className="sponsor-selector">{(Object.keys(SPONSORS) as SponsorId[]).map((id) => <button type="button" onClick={() => onChooseSeasonSponsor?.(id)} key={id}><strong>{SPONSORS[id].name}</strong><span>{SPONSORS[id].description}</span></button>)}</div> : season.sponsor ? <div className="sponsor-progress"><span style={{ color: season.sponsor.accent }}>{season.sponsor.name}</span><strong>{season.sponsor.progress}/{season.sponsor.target}</strong><small>{season.sponsor.evaluated ? season.sponsor.fulfilled ? "目标完成 · 声望 +1" : "目标未完成 · 不触发机械惩罚" : "赛季目标进行中"}</small></div> : null}
      {season.publicActionResults.length > 0 && <p className="public-action-result">最近公共事务 · {season.publicActionResults.at(-1)?.message}</p>}
      {season.status === "finished" && <div className="contract-offers">{season.contractOffers.map((offer) => <article className={offer.status} key={offer.id}><span>{offer.abbreviation}</span><strong>{offer.teamName}</strong><small>D12 {offer.roll} + 声望 {offer.reputation} + 成绩 {offer.performanceModifier >= 0 ? "+" : ""}{offer.performanceModifier} + 契合 {offer.fitModifier >= 0 ? "+" : ""}{offer.fitModifier} = {offer.total}</small><b>{offer.role === "primary" ? "一号车手" : offer.role === "race" ? "正式席位" : offer.role === "reserve" ? "储备席位" : offer.blockedReason ?? "无报价"}</b>{offer.role && offer.status === "pending" && <button type="button" onClick={() => onAcceptContract?.(offer.id)}>接受</button>}{offer.status === "accepted" && <em>已签约</em>}</article>)}</div>}
    </section>}
    {season && <details className="advanced-season-console"><summary><span>OPTIONAL SYSTEMS</span><strong>高级赛季模块</strong><i>{Object.values(season.advanced.settings).filter(Boolean).length}/6 启用</i></summary><div className="advanced-season-grid"><section><p>所有模块默认关闭；仅首站前可切换。关闭时不改变基础赛季结算。</p><div className="advanced-toggle-grid">{(Object.keys(ADVANCED_LABELS) as Array<keyof AdvancedModuleSettings>).map((id) => <label key={id}><input type="checkbox" disabled={season.rounds.length > 0 || season.advanced.raceRecords.length > 0} checked={season.advanced.settings[id]} onChange={(event) => onAdvancedSettings?.({ ...season.advanced.settings, [id]: event.target.checked })} /><strong>{ADVANCED_LABELS[id]}</strong></label>)}</div></section><section><div className="advanced-entry-controls"><label>动力单元<select disabled={!season.advanced.settings.componentPool} value={advancedEntry.powerUnit} onChange={(event) => setAdvancedEntry({ ...advancedEntry, powerUnit: event.target.value as "keep" | "new" })}><option value="keep">沿用 · 超过 2 站 REL -1</option><option value="new">安装新件 · 超额后退 3 位</option></select></label><label>变速箱<select disabled={!season.advanced.settings.componentPool} value={advancedEntry.gearbox} onChange={(event) => setAdvancedEntry({ ...advancedEntry, gearbox: event.target.value as "keep" | "new" })}><option value="keep">沿用 · 超过 2 站 REL -1</option><option value="new">安装新件 · 超额后退 3 位</option></select></label><label><input type="checkbox" disabled={!season.advanced.settings.rookiePractice} checked={advancedEntry.useRookie} onChange={(event) => setAdvancedEntry({ ...advancedEntry, useRookie: event.target.checked })} />新秀参加练习：+1 RP，本站强制均衡调校</label><label><input type="checkbox" disabled={!season.advanced.settings.scrutineering || season.playerTeam.pendingCorrelationStats.length === 0} checked={advancedEntry.acceptComplianceRisk} onChange={(event) => setAdvancedEntry({ ...advancedEntry, acceptComplianceRisk: event.target.checked })} />使用待验证升级：保留属性并接受赛后车检；不选则本站扣回对应属性</label></div><div className="advanced-ledger"><span>PU {season.advanced.powerUnits.units.length}/{season.advanced.powerUnits.allowance}</span><span>GB {season.advanced.gearboxes.units.length}/{season.advanced.gearboxes.allowance}</span><span>新秀 {season.advanced.rookieAppearances}</span><span>核算负债 {season.advanced.accountingLiability} BU</span></div>{season.awaitingInterRoundActions && season.advanced.settings.aggressiveAccounting && season.advanced.accountingCredit < 2 && <button type="button" className="button ghost" onClick={() => onAccountingCredit?.(1)}>提前使用 1 BU</button>}{season.advanced.accountingAudit && <p>赛季审计 · D12 {season.advanced.accountingAudit.roll} + REL = {season.advanced.accountingAudit.total} · {season.advanced.accountingAudit.result} · 处罚 {season.advanced.accountingAudit.penalty}</p>}</section></div></details>}
    {season?.advanced.rookieObligationPenalty !== undefined && <p className="advanced-season-result">新秀练习义务结算 · 完成 {season.advanced.rookieAppearances}/2 次 · 扣除 {season.advanced.rookieObligationPenalty} RP</p>}
    <div className="paddock-link"><span>车迷讨论、赛后热帖和车队动态</span><button type="button" onClick={() => onNavigate("social")}>打开围场社交 →</button></div>
    {season && <details className="season-development-console"><summary><span>ENGINEERING / CONSTRUCTORS</span><strong>赛季工程与制造商</strong><i>{season.playerTeam.emergencySpares ? "应急备件 · REL -1" : `${season.playerTeam.projects.filter((project) => project.status === "active" || project.status === "delayed").length} 个在研项目`}</i></summary><div className="season-development-grid"><section><div className="development-subhead"><strong>{season.playerTeam.name}</strong><span>{RESEARCH_PHILOSOPHIES[season.playerTeam.philosophy].name} · 队友关系 {season.playerTeam.teammateRelationship > 0 ? "+" : ""}{season.playerTeam.teammateRelationship}</span></div><div className="season-resource-strip"><span><small>成本帽</small><b>{season.playerTeam.budgetRemaining}/{season.playerTeam.budgetCap} BU</b></span><span><small>工程能力</small><b>{season.playerTeam.developmentPoints} RP</b></span><span><small>ATR 周期</small><b>{atr?.coefficient}% · {atr?.projectsStarted}/{atr?.slots}</b></span></div>{season.awaitingInterRoundActions && season.status === "active" && <><label className="season-project-mode">项目方式<select value={researchMode} onChange={(event) => setResearchMode(event.target.value as ResearchProjectMode)}><option value="standard">标准 · 两站后交付</option><option value="rush">赶工 · 立即检定</option><option value="aggressive">激进 · 交付时检定</option></select></label><div className="season-project-buttons">{STAT_KEYS.map((stat) => { const price = projectPrice(season.playerTeam, stat); const active = season.playerTeam.projects.some((project) => (project.status === "active" || project.status === "delayed") && project.stat === stat); return <button type="button" disabled={active || season.playerTeam.stats[stat] >= 5} onClick={() => onStartSeasonProject?.(stat, researchMode)} key={stat}><span>{stat.toUpperCase()} {season.playerTeam.stats[stat]} → {season.playerTeam.stats[stat] + 1}</span><strong>{price.rp} RP / {price.bu} BU</strong><small>{active ? "已有项目" : researchMode === "rush" ? "D12 + REL" : researchMode === "aggressive" ? "交付时检定相关性" : "确定性交付"}</small></button>; })}</div></>}<div className="season-project-ledger">{season.playerTeam.projects.filter((project) => project.startedAfterRound > 0).slice(-6).reverse().map((project) => <p key={project.id}><b>{project.stat.toUpperCase()}</b><span>{project.mode.toUpperCase()} · {project.status}</span><small>{project.roll ? `D12 ${project.roll} · 总值 ${project.total}` : `第 ${project.deliveryAfterRound} 站后交付`} · {project.result ?? "pending"}</small></p>)}</div></section><section><div className="development-subhead"><strong>技术设施</strong><span>升级同时消耗 RP / BU</span></div><div className="season-facility-grid">{TEAM_FACILITIES.map((facility) => { const level = season.playerTeam.facilities[facility.id] ?? 0; const complete = level >= facility.costs.length; const rp = complete ? 0 : facility.costs[level]; const bu = Math.ceil(rp / 3); return <button type="button" disabled={!season.awaitingInterRoundActions || complete} onClick={() => onUpgradeSeasonFacility?.(facility.id)} key={facility.id}><span>LV {level}/{facility.costs.length}</span><strong>{facility.name}</strong><small>{complete ? "完成" : `${rp} RP / ${bu} BU`}{season.playerTeam.pausedFacilities.includes(facility.id) ? " · 暂停" : ""}</small></button>; })}</div><div className="development-subhead constructor-head"><strong>制造商积分</strong><span>{constructorStandings.length ? `${constructorStandings.length} 支双车队` : "第二辆车完成比赛后启用"}</span></div>{constructorStandings.map((standing, index) => <p className="constructor-row" key={standing.teamId}><b>P{index + 1}</b><span>{standing.name}</span><strong>{standing.championshipPoints}</strong><small>{standing.driverIds.length} 车</small></p>)}</section></div></details>}
    <div className="race-mode-switch">
      <button className={mode === "official" ? "active" : ""} onClick={() => setMode("official")}><span>正式正赛</span><strong>使用车手与所属车队的固定培养配置</strong></button>
      <button className={mode === "simulation" ? "active" : ""} onClick={() => setMode("simulation")}><span>SIM RACING</span><strong>临时测试等级、主天赋与天赋树，不写入档案</strong></button>
    </div>
    <div className="race-lab-layout">
      <section className="race-lab-controls">
        <div className="lab-row">
          <label>车手<select value={driver?.id ?? ""} onChange={(event) => setDriverId(event.target.value)}><option value="" disabled>选择车手</option>{profiles.map((item) => <option value={item.id} key={item.id}>{item.name}{item.teamId ? "" : "（待签约）"}</option>)}</select></label>
          <label>车队<select value={selectedTeam?.id ?? ""} disabled={mode === "official"} onChange={(event) => selectSimulationTeam(event.target.value)}><option value="" disabled>{mode === "official" ? "由车手合同确定" : "选择车队"}</option>{teams.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>AI 车手<select value={aiCount} onChange={(event) => setAiCount(Number(event.target.value))}>{[1,2,3,4,5].map((count) => <option value={count} key={count}>{count} 名</option>)}</select></label>
        </div>
        <div className="lab-row weekend-format-row">
          <label>周末格式<select value={weekendMode} onChange={(event) => { const value = event.target.value as WeekendMode; setWeekendMode(value); if (value === "full") setWeatherMode("dynamic"); }}><option value="quick">快速比赛 · 排位 + 正赛</option><option value="full">完整周末 · 练习调校 + 排位 + 正赛</option></select></label>
          <label>天气模式<select value={weekendMode === "full" ? "dynamic" : weatherMode} disabled={weekendMode === "full"} onChange={(event) => setWeatherMode(event.target.value as WeatherMode)}><option value="fixed">整场固定</option><option value="dynamic">每回合动态</option></select></label>
          <label className="inline-check"><input type="checkbox" checked={sprintEnabled} disabled={weekendMode !== "full"} onChange={(event) => setSprintEnabled(event.target.checked)} />启用 3 圈冲刺赛</label>
        </div>
        {mode === "simulation" && <div className="sim-tuning">
          <div className="development-subhead"><strong>测试配置</strong><button type="button" className="button ghost" disabled={!driver} onClick={loadDriverConfiguration}>载入当前车手培养</button><span>仅本场有效</span></div>
          <div className="lab-row sim-driver-row">
            <label>等级<input type="range" min="1" max="20" value={simLevel} onChange={(event) => setSimLevel(Number(event.target.value))} /><b>Lv{simLevel}</b></label>
            <label>主天赋<select value={simTalent} onChange={(event) => setSimTalent(event.target.value as TalentId)}>{TALENT_KEYS.map((id) => <option value={id} key={id}>{TALENT_LABELS[id]}</option>)}</select></label>
            <label>专精路径<select value={simLevel >= 3 ? simSpecialization : ""} disabled={simLevel < 3} onChange={(event) => setSimSpecialization(event.target.value as DriverSpecializationId | "")}><option value="">{simLevel < 3 ? "Lv3 解锁" : "无"}</option>{(Object.keys(DRIVER_SPECIALIZATIONS) as DriverSpecializationId[]).map((id) => <option value={id} key={id}>{DRIVER_SPECIALIZATIONS[id].name}</option>)}</select></label>
            <label>招牌动作<select value={simLevel >= 10 ? signature : ""} disabled={simLevel < 10} onChange={(event) => setSignature(event.target.value as SignatureMoveId | "")}><option value="">{simLevel < 10 ? "Lv10 解锁" : "无"}</option>{(Object.keys(SIGNATURE_MOVES) as SignatureMoveId[]).map((id) => <option value={id} key={id}>{SIGNATURE_MOVES[id].name}</option>)}</select></label>
          </div>
          <div className="lab-row">
            <label>Lv20 招牌升级<select value={simLevel >= 20 && signature ? signatureUpgrade : ""} disabled={simLevel < 20 || !signature} onChange={(event) => setSignatureUpgrade(event.target.value as typeof signatureUpgrade)}><option value="">{simLevel < 20 ? "Lv20 解锁" : !signature ? "先选择招牌动作" : "不升级"}</option><option value="extra_use">每场 2 次</option><option value="enhanced">强化效果</option></select></label>
            <label>测试随机种子<input type="text" inputMode="numeric" value={simSeed} aria-invalid={!seedValid} aria-describedby="sim-seed-help" onChange={(event) => setSimSeed(event.target.value)} /><small id="sim-seed-help">{seedValid ? "相同配置与选择可复现骰点；改变行动会改变后续骰序。" : "请输入 1–4294967295 的整数。"}</small></label>
          </div>
          <fieldset className="minor-talent-selector compact"><legend>副天赋 · 选择 2 个（{simMinorTalents.length}/2）</legend>{MINOR_TALENT_KEYS.map((id) => <button type="button" aria-pressed={simMinorTalents.includes(id)} className={simMinorTalents.includes(id) ? "active" : ""} title={MINOR_TALENTS[id].description} onClick={() => toggleSimMinorTalent(id)} key={id}><strong>{MINOR_TALENTS[id].name}</strong><small>{MINOR_TALENTS[id].description}</small></button>)}</fieldset>
          <details className="sim-config-section"><summary><strong>天赋树节点</strong><span>{simNodes.length} 已选</span><i>展开</i></summary><div className="sim-node-grid">{TALENT_NODES.map((node) => <button type="button" className={simNodes.includes(node.id) ? "active" : ""} disabled={!node.active} title={node.effect} onClick={() => toggleNode(node.id)} key={node.id}><span>{node.id} / T{node.tier}</span><strong>{node.name}</strong>{!node.active && <small>SC/VSC 赛制未启用</small>}</button>)}</div></details>
          <details className="sim-config-section"><summary><strong>赛车与设施测试配置</strong><span>PI {simPerformance}/15 · {TEAM_FACILITIES.filter((facility) => (simFacilities[facility.id] ?? 0) > 0).length} 项设施</span><i>展开</i></summary><div className="sim-car-config"><div className="sim-stat-lines">{STAT_KEYS.map((stat) => <label key={stat}><small>{stat.toUpperCase()} · {STAT_LABELS[stat]}</small><input type="range" min="1" max="5" value={simStats[stat]} onChange={(event) => setSimStats({ ...simStats, [stat]: Number(event.target.value) })} /><strong>{simStats[stat]}</strong></label>)}</div><div className="sim-facility-lines">{TEAM_FACILITIES.map((facility) => { const level = simFacilities[facility.id] ?? 0; return <button type="button" className={level > 0 ? "active" : ""} title={facility.effect} onClick={() => cycleFacility(facility.id, facility.costs.length)} key={facility.id}><span>LV {level}/{facility.costs.length}</span><strong>{facility.name}</strong></button>; })}</div></div></details>
        </div>}
        <div className="track-source-switch" role="group" aria-label="赛道来源"><button type="button" className={trackSource === "preset" ? "active" : ""} onClick={() => setTrackSource("preset")}>预设赛道</button><button type="button" className={trackSource === "generated" ? "active" : ""} onClick={() => setTrackSource("generated")}>生成赛道</button></div>
        {trackSource === "generated" && <div className="track-generator-controls">
          <label>结构原型<select value={trackArchetype} onChange={(event) => setTrackArchetype(event.target.value as TrackArchetype)}><option value="power">动力型</option><option value="street">街道型</option><option value="flowing">流线型</option><option value="mixed">综合型</option></select></label>
          <label>赛道规模<select value={trackSize} onChange={(event) => setTrackSize(event.target.value as TrackSize)}><option value="compact">紧凑 · 20 格</option><option value="standard">标准 · 28 格</option><option value="long">长赛道 · 40 格</option></select></label>
          <label>复杂度<select value={trackComplexity} onChange={(event) => setTrackComplexity(event.target.value as TrackComplexity)}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
          <label>生成种子<input inputMode="numeric" value={trackSeed} onChange={(event) => setTrackSeed(event.target.value)} /></label>
          <button type="button" className="button secondary" onClick={createGeneratedTrack}>生成并保存</button>
          <button type="button" className="button ghost" onClick={() => setTrackSeed(String(Math.max(1, (Number(trackSeed) || 0) + 1)))}>换一个种子</button>
          {trackError && <p className="track-generator-error" role="alert">{trackError}</p>}
        </div>}
        <div className="track-test-selector">{(trackSource === "preset" ? TRACKS : generatedTracks).map((item) => <button type="button" className={item.id === trackId ? "active" : ""} onClick={() => setTrackId(item.id)} key={item.id}><strong>{item.name}</strong><span>{item.totalLength} 格 · {item.laps} 圈 · {item.segments.filter((segment) => segment.type === "corner").length} 弯区</span></button>)}</div>
        {trackSource === "generated" && generatedTracks.length === 0 && <p className="track-generator-empty">选择参数并生成第一条赛道；无效几何不会写入存档。</p>}
        {trackSource === "generated" && track.generated && <div className="track-alias-control"><label>赛道别名<input placeholder={track.name} value={trackAlias} onChange={(event) => setTrackAlias(event.target.value)} /></label><button type="button" className="button ghost" disabled={!trackAlias.trim()} onClick={renameGeneratedTrack}>保存别名</button><button type="button" className="button ghost danger" onClick={deleteGeneratedTrack}>删除此赛道</button></div>}
        {track.analysis && <div className="track-analysis-strip" aria-label="赛道分析"><span><small>有效负荷</small><strong>{track.analysis.effectiveRaceLoad}</strong></span><span><small>直道占比</small><strong>{Math.round(track.analysis.straightRatio * 100)}%</strong></span><span><small>重刹点</small><strong>{track.analysis.brakingZones}</strong></span><span><small>DRS 覆盖</small><strong>{Math.round(track.analysis.drsCoverage * 100)}%</strong></span><span><small>风险</small><strong>{track.analysis.dangerRating}/5</strong></span><span><small>预计回合</small><strong>{track.analysis.expectedRounds.minimum}–{track.analysis.expectedRounds.maximum}</strong></span></div>}
        <div className="race-readiness" aria-label="比赛准备状态">{readyChecks.map((check) => <span className={check.ok ? "ready" : "blocked"} key={check.label}><i /> <small>{check.label}</small><strong>{check.value}</strong></span>)}</div>
        <button className="button primary large full" disabled={!raceProfile || (mode === "simulation" && !seedValid)} onClick={() => raceProfile && (mode !== "simulation" || seedValid) && onStart(raceProfile, aiCount, track, mode, mode === "simulation" ? seedValue : undefined, { weekendMode, weatherMode: weekendMode === "full" ? "dynamic" : weatherMode, sprintEnabled: weekendMode === "full" && sprintEnabled })}>{!raceProfile ? "完成上方必需配置" : mode === "simulation" && !seedValid ? "请修正测试随机种子" : weekendMode === "full" ? "进入完整比赛周末" : mode === "official" ? "进入快速正赛" : "启动模拟测试"}</button>
      </section>
      <aside className="race-lab-visual">
        <div className="lab-visual-switch" aria-label="测试对象预览">
          <button type="button" className={visualMode === "track" ? "active" : ""} onClick={() => setVisualMode("track")}>赛道图</button>
          <button type="button" className={visualMode === "car" ? "active" : ""} onClick={() => setVisualMode("car")}>赛车系统</button>
        </div>
        {visualMode === "track"
          ? <CircuitProjection track={track} />
          : <CarSystemsVisual stats={visualStats} color={selectedTeam?.color ?? driver?.color ?? "#67d8f3"} name={selectedTeam?.name ?? "未选择车队"} />}
        <div className="setup-readout"><span><small>DRIVER</small><strong>{driver?.abbreviation ?? "—"}</strong></span><span><small>TEAM</small><strong>{selectedTeam?.abbreviation ?? "—"}</strong></span><span><small>LEVEL</small><strong>{mode === "simulation" ? simLevel : driver?.career?.level ?? 1}</strong></span><span><small>GRID</small><strong>{aiCount + 1}</strong></span></div>
      </aside>
    </div>
  </div>;
}
