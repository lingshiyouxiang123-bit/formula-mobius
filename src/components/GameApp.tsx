"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { BURDEN_LABELS, MODE_LABELS, TIRE_LABELS, WEATHER_LABELS } from "@/game/uiLabels";
import { BURDENS, TIRES } from "@/game/config";
import { TRACKS } from "@/game/tracks";
import { RACE_RULE_REFERENCE } from "@/game/ruleReference";
import { racePenaltyTotals } from "@/game/penalties";
import { weatherForecast } from "@/game/raceRules";
import { RaceEventLog } from "@/components/race/RaceEventLog";
import { objectiveProgress, RACE_OBJECTIVES } from "@/game/objectives";
import { lanePoint, startingGridPoint } from "@/game/trackGeometry";
import { isDrsCell } from "@/game/trackGenerator";
import { WEEKEND_SETUP_GROUPS } from "@/game/setupOptions";
import {
  calculateMpBreakdown,
  createGame,
  dispatchGameCommand,
  ersCapacity,
  getCellIndex,
  getSegmentAtCell,
  previewRaceSetup,
  requiredBurdenCount,
  strategyWaitReason,
} from "@/game/engine";
import { clearMatch, clearSeason, hasTeamArchive, loadMatch, loadProfiles, loadSeason, loadTeams, saveMatch, saveProfiles, saveSeason, saveTeams } from "@/game/storage";
import { createSeasonState, recordSeasonRound, submitSeasonActions } from "@/game/season";
import { migrateSeasonDevelopment, purchaseSeasonFacility, startResearchProject, syncTeamFromSeason } from "@/game/seasonDevelopment";
import { acceptContractOffer, createCurrentContract, migrateSeasonMarket, selectSeasonSponsor } from "@/game/seasonMarket";
import { advancedRaceCarStats, configureAdvancedModules, prepareLockedSeasonRaceEntry, reviewPenaltyEvidence, takeAggressiveAccountingCredit } from "@/game/advancedSeason";
import { configureMediaChannels, resolvePressResponse } from "@/media";
import {
  applyRaceDevelopment,
  availableTalentActions,
  closePreparationWindow,
  createTeamDevelopment,
  hasMinorTalent,
  normalizeProfileDevelopment,
  SIGNATURE_MOVES,
  TALENT_ACTIONS,
  talentUpgradeRank,
  tokenSwapAllowance,
} from "@/game/career";
import { introCopy } from "@/commentary/generated/zhCN";
import { CircuitProjection } from "@/components/race/CircuitProjection";
import { TelemetryDeck } from "@/components/race/TelemetryDeck";
import { ShaderRaceBackdrop } from "@/components/visual/ShaderRaceBackdrop";
import { MovingVehicle } from "@/components/race/MovingVehicle";
import { MetricValue } from "@/components/race/MetricValue";
import { CommentaryPanel, TeamRadioPanel } from "@/components/race/NarrativePanels";
import { SocialMediaPage } from "@/components/media/SocialMediaPage";
import { syncNarrative } from "@/narrative/engine";
import type { RaceNarrative } from "@/narrative/engine";
import { loadNarratives, saveNarrative, loadSocialHistory } from "@/narrative/storage";
import {initializeSocialWorlds} from '@/narrative/social/worldStorage';
import { MediaHub } from "@/components/media/MediaHub";
import { LandingPage, type AppSection } from "@/components/shell/LandingPage";
import { bindDriverToTeam, DriverCenter, RaceCenter, TeamCenter } from "@/components/shell/GarageCenters";
// TEMP_SEASON_DEBUG: removable import and debugControls seam below.
import { debugFinishSeasonRace, SeasonDebugControls } from "@/components/debug/SeasonDebugControls";
import type {
  AdvancedModuleSettings,
  AdvancedRaceEntryChoice,
  BurdenId,
  AeroSetup,
  CarStats,
  CreateGameOptions,
  DriverProfile,
  DriverState,
  EngineMode,
  GameCommand,
  GameState,
  MediaChannelSettings,
  PressResponseIntent,
  SeasonPerformanceAction,
  SeasonPublicAction,
  SeasonState,
  SponsorId,
  ResearchProjectMode,
  StatKey,
  TacticalResourceId,
  TireCompound,
  CoolingSetup,
  SuspensionSetup,
  TeamProfile,
  TeamFacilityId,
  Track,
  TurnPlan,
} from "@/game/types";

const BURDEN_KEYS = Object.keys(BURDENS) as BurdenId[];
const TIRE_KEYS = Object.keys(TIRES) as TireCompound[];
const MODE_KEYS: EngineMode[] = ["save", "balanced", "attack"];
const REACTION_BOARD_KEY = "f1game.reaction-board.v1";
const RESOURCE_LABELS: Record<TacticalResourceId, string> = { ers: "ERS", lateBrake: "晚刹", defense: "防守", cooling: "冷却", quickRepair: "快修" };

const DEFAULT_PLAN: TurnPlan = {
  mode: "balanced",
  deployErs: false,
  pit: false,
  pitTire: "medium",
  useCooling: false,
  useQuickRepair: false,
};

export function GameApp() {
  const [hydrated, setHydrated] = useState(false);
  const [profiles, setProfiles] = useState<DriverProfile[]>([]);
  const [teams, setTeams] = useState<TeamProfile[]>([]);
  const [savedMatch, setSavedMatch] = useState<GameState | null>(null);
  const [season, setSeason] = useState<SeasonState | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [section, setSection] = useState<AppSection>("landing");
  const [narratives, setNarratives] = useState<Record<string, RaceNarrative>>({});
  const navigationTransition = useRef<{ skipTransition: () => void } | null>(null);
  const navigationSequence = useRef(0);
  const [error, setError] = useState("");

  useEffect(() => {
    queueMicrotask(() => {
      let loadedProfiles = loadProfiles();
      let loadedTeams = loadTeams();
      let migratedLegacyTeams = false;
      if (!hasTeamArchive() && loadedProfiles.length > 0) {
        migratedLegacyTeams = true;
        loadedTeams = loadedProfiles.map((profile, index) => {
          const development = profile.team ?? createTeamDevelopment(`${profile.abbreviation} 车队`, profile.stats);
          return { id: profile.teamId ?? `migrated-team-${profile.id}`, name: development.name, abbreviation: `T${index + 1}`, color: profile.color, stats: { ...profile.stats }, development };
        });
      }
      if (migratedLegacyTeams && loadedTeams.length > 0) {
        loadedProfiles = loadedProfiles.map((profile, index) => ({ ...profile, teamId: profile.teamId && loadedTeams.some((team) => team.id === profile.teamId) ? profile.teamId : loadedTeams[Math.min(index, loadedTeams.length - 1)].id }));
      }
      loadedProfiles = loadedProfiles.map((profile) => {
        const team = loadedTeams.find((item) => item.id === profile.teamId);
        if (!team || profile.contract) return profile;
        return { ...profile, contract: createCurrentContract(team.id, team.name, profile.career?.season ?? 1) };
      });
      setProfiles(loadedProfiles);
      setTeams(loadedTeams);
      saveProfiles(loadedProfiles);
      saveTeams(loadedTeams);
      setSavedMatch(loadMatch());
      const loadedSeason = loadSeason();
      if (loadedSeason) {
        const seasonDriver = loadedProfiles.find((profile) => profile.id === loadedSeason.humanDriverId);
        const seasonTeam = loadedTeams.find((team) => team.id === seasonDriver?.teamId);
        const migratedSeason = migrateSeasonMarket(migrateSeasonDevelopment(loadedSeason, seasonTeam), seasonTeam, loadedTeams, loadedProfiles);
        setSeason(migratedSeason);
        saveSeason(migratedSeason);
      } else setSeason(null);
      const hashSection = window.location.hash.slice(1) as AppSection;
      if (["races", "drivers", "teams", "social"].includes(hashSection)) setSection(hashSection);
      const records=loadNarratives();
      setNarratives(records);
      void initializeSocialWorlds(records).then(()=>{setNarratives(loadNarratives());setHydrated(true);});
    });
  }, []);

  useEffect(() => {
    const syncSectionFromHistory = () => {
      navigationSequence.current += 1;
      navigationTransition.current?.skipTransition();
      const hashSection = window.location.hash.slice(1) as AppSection;
      setSection(["races", "drivers", "teams", "social"].includes(hashSection) ? hashSection : "landing");
    };
    window.addEventListener("popstate", syncSectionFromHistory);
    return () => {
      window.removeEventListener("popstate", syncSectionFromHistory);
      navigationSequence.current += 1;
      navigationTransition.current?.skipTransition();
    };
  }, []);

  useEffect(() => {
    if (hydrated && game) {
      saveMatch(game);
      const records=loadNarratives();
      const next = syncNarrative(records[game.id], game, season??undefined,loadSocialHistory(game,records),{profiles,teams});
      saveNarrative(next);
      queueMicrotask(() => setNarratives(loadNarratives()));
    }
  }, [game, hydrated, season, profiles, teams]);

  const dispatch = (command: GameCommand) => {
    if (!game) return;
    const result = dispatchGameCommand(game, command);
    if (!result.ok) setError(result.error);
    else {
      setError("");
      setGame(result.state);
      if (game.phase !== "finished" && result.state.phase === "finished") awardRaceDevelopment(result.state);
    }
  };

  // TEMP_SEASON_DEBUG: seasonInput lets a quick finish use its just-locked entry.
  // When removing debug, restore this parameter and its three uses to `season`.
  const awardRaceDevelopment = (completedGame: GameState, seasonInput = season) => {
    if (completedGame.sessionMode === "simulation") return;
    let recordedSeason: SeasonState | null = null;
    if (seasonInput && completedGame.seasonId === seasonInput.id) {
      try {
        const nextSeason = recordSeasonRound(seasonInput, completedGame, loadNarratives()[completedGame.id]);
        recordedSeason = nextSeason;
        setSeason(nextSeason);
        saveSeason(nextSeason);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "赛季结果写入失败");
        return;
      }
    }
    const driver = profiles.find((profile) => profile.id === completedGame.humanDriverId);
    if (!driver) return;
    const raceProfile = completedGame.drivers.find((item) => item.id === completedGame.humanDriverId)?.profile;
    const team = teams.find((item) => item.id === raceProfile?.teamId);
    const development = applyRaceDevelopment(team ? bindDriverToTeam(driver, team) : driver, completedGame);
    if (development.reward) {
      const nextProfiles = profiles.map((profile) => profile.id === driver.id ? { ...profile, career: development.profile.career } : profile);
      setProfiles(nextProfiles); saveProfiles(nextProfiles);
    }
    if (team) {
      let updatedTeam: TeamProfile = development.reward ? { ...team, stats: development.profile.stats, development: development.profile.team! } : team;
      if (recordedSeason) updatedTeam = syncTeamFromSeason(updatedTeam, recordedSeason);
      const nextTeams = teams.map((item) => item.id === team.id ? updatedTeam : item);
      setTeams(nextTeams); saveTeams(nextTeams);
    }
  };

  const saveProfile = (profile: DriverProfile) => {
    if (profile.teamId && profile.contract?.role !== "reserve" && profiles.filter((item) => item.teamId === profile.teamId && item.contract?.role !== "reserve").length >= 2) {
      setError("每支车队最多登记两名正式车手；储备席将在合同阶段实现。");
      return;
    }
    const next = [...profiles, profile];
    setProfiles(next);
    saveProfiles(next);
  };

  const deleteProfile = (id: string) => {
    const next = profiles.filter((profile) => profile.id !== id);
    setProfiles(next);
    saveProfiles(next);
  };

  const updateProfile = (profile: DriverProfile) => {
    const next = profiles.map((item) => item.id === profile.id ? normalizeProfileDevelopment(profile) : item);
    setProfiles(next);
    saveProfiles(next);
  };

  const saveTeam = (team: TeamProfile) => { const next = [...teams, team]; setTeams(next); saveTeams(next); };
  const updateTeam = (team: TeamProfile) => { const next = teams.map((item) => item.id === team.id ? team : item); setTeams(next); saveTeams(next); };
  const deleteTeam = (id: string) => {
    const nextTeams = teams.filter((team) => team.id !== id);
    const nextProfiles = profiles.map((profile) => profile.teamId === id ? { ...profile, teamId: undefined, contract: undefined } : profile);
    setTeams(nextTeams); saveTeams(nextTeams); setProfiles(nextProfiles); saveProfiles(nextProfiles);
  };
  const assignDriver = (driverId: string, teamId: string) => {
    if (profiles.filter((profile) => profile.teamId === teamId && profile.id !== driverId && profile.contract?.role !== "reserve").length >= 2) {
      setError("每支车队最多登记两名正式车手；储备席将在合同阶段实现。");
      return;
    }
    const team = teams.find((item) => item.id === teamId);
    const next = profiles.map((profile) => profile.id === driverId ? { ...profile, teamId, contract: team ? createCurrentContract(team.id, team.name, profile.career?.season ?? 1) : profile.contract } : profile);
    setProfiles(next); saveProfiles(next);
  };

  const createSeason = (profile: DriverProfile, aiCount: number) => {
    if (season && !window.confirm("已有本地赛季存档。建立新赛季将替换它，确定继续？")) return;
    const team = teams.find((item) => item.id === profile.teamId);
    if (!team) { setError("建立赛季前需要为车手选择车队"); return; }
    const teammate = profiles.find((item) => item.id !== profile.id && item.teamId === team.id && item.contract?.role !== "reserve");
    if (profile.contract?.role === "reserve") { setError("储备席位不能参加正式赛季；请先在合同市场获得正式席位。"); return; }
    const next = createSeasonState(profile.id, aiCount, Date.now(), team, teammate?.id ?? `${profile.id}-teammate`, teams, profile.talent, profile.contract, profile.contract?.season ?? profile.career?.season ?? 1, profiles);
    setSeason(next);
    saveSeason(next);
  };

  const startSeasonProject = (stat: StatKey, mode: ResearchProjectMode) => {
    if (!season) return;
    const result = startResearchProject(season, stat, mode);
    if (!result.ok) { setError(result.error); return; }
    setSeason(result.state); saveSeason(result.state);
    const nextTeams = teams.map((team) => syncTeamFromSeason(team, result.state));
    setTeams(nextTeams); saveTeams(nextTeams); setError("");
  };

  const upgradeSeasonFacility = (facility: TeamFacilityId) => {
    if (!season) return;
    const result = purchaseSeasonFacility(season, facility);
    if (!result.ok) { setError(result.error); return; }
    setSeason(result.state); saveSeason(result.state);
    const nextTeams = teams.map((team) => syncTeamFromSeason(team, result.state));
    setTeams(nextTeams); saveTeams(nextTeams); setError("");
  };

  const submitInterRoundActions = (performance: SeasonPerformanceAction, publicAction: SeasonPublicAction) => {
    if (!season) return;
    try {
      const next = submitSeasonActions(season, performance, publicAction);
      setSeason(next);
      saveSeason(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "站间行动提交失败");
    }
  };

  const chooseSeasonSponsor = (sponsorId: SponsorId) => {
    if (!season) return;
    try {
      const next = selectSeasonSponsor(season, sponsorId);
      setSeason(next); saveSeason(next); setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "赞助目标选择失败");
    }
  };

  const signSeasonContract = (offerId: string) => {
    if (!season) return;
    try {
      const nextSeason = acceptContractOffer(season, offerId);
      const team = teams.find((item) => item.id === nextSeason.currentContract.teamId);
      if (!team) throw new Error("合同引用的车队档案不存在。");
      const otherSeats = profiles.filter((profile) => profile.id !== season.humanDriverId && profile.teamId === team.id);
      if (nextSeason.currentContract.role === "reserve" && otherSeats.some((profile) => profile.contract?.role === "reserve")) throw new Error("该车队的储备席已经占用。");
      if (nextSeason.currentContract.role !== "reserve" && otherSeats.filter((profile) => profile.contract?.role !== "reserve").length >= 2) throw new Error("该车队的两个正式席位已经占用。");
      const nextProfiles = profiles.map((profile) => profile.id === season.humanDriverId
        ? { ...profile, teamId: team.id, contract: nextSeason.currentContract }
        : profile);
      setProfiles(nextProfiles); saveProfiles(nextProfiles);
      setSeason(nextSeason); saveSeason(nextSeason); setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "合同确认失败");
    }
  };

  const respondToPress = (raceId: string, questionId: string, intent: PressResponseIntent) => {
    if (!season) return;
    try {
      const next = resolvePressResponse(season, raceId, questionId, intent);
      setSeason(next); saveSeason(next); setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "记者会回答提交失败");
    }
  };

  const setMediaChannels = (settings: MediaChannelSettings) => {
    if (!season) return;
    const next = configureMediaChannels(season, settings);
    setSeason(next); saveSeason(next);
  };

  const setAdvancedModules = (settings: AdvancedModuleSettings) => {
    if (!season) return;
    try {
      const next = configureAdvancedModules(season, settings);
      setSeason(next); saveSeason(next); setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "高级模块配置失败");
    }
  };

  const useAccountingCredit = (amount: 1 | 2) => {
    if (!season) return;
    try {
      const next = takeAggressiveAccountingCredit(season, amount);
      setSeason(next); saveSeason(next); setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "激进核算失败");
    }
  };

  const reviewPenalty = (race: GameState, eventId: number) => {
    if (!season) return;
    try {
      const next = reviewPenaltyEvidence(season, race, eventId);
      setSeason(next); saveSeason(next); setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "判罚证据复核失败");
    }
  };

  const startSeasonRound = (profile: DriverProfile, advancedChoice?: AdvancedRaceEntryChoice, debugRank?: number) => {
    if (!season || season.status !== "active" || season.awaitingInterRoundActions) return;
    if (!season.sponsor) { setError("首站开始前必须选择一个赛季赞助目标。"); return; }
    const calendarRound = season.calendar[season.currentRound - 1];
    const track = TRACKS.find((item) => item.id === calendarRound.trackId);
    if (!track) { setError("赛季赛历引用了不存在的赛道"); return; }
    if (savedMatch && savedMatch.phase !== "finished" && !window.confirm("已有未完成比赛。开始赛季本站将替换该存档，确定继续？")) return;
    try {
      const prepared = prepareLockedSeasonRaceEntry(season, advancedChoice);
      const advancedRecord = prepared.record;
      const entryState = prepared.state;
      const entryEffects = prepared.effects;
      const seasonTeam = entryState.playerTeam;
      const storedTeam = teams.find((item) => item.id === seasonTeam.teamId);
      if (!storedTeam) throw new Error("赛季车队档案不存在");
      const activeFacilities = Object.fromEntries(Object.entries(seasonTeam.facilities).filter(([id]) => !seasonTeam.pausedFacilities.includes(id as TeamFacilityId))) as Partial<Record<TeamFacilityId, number>>;
      const raceStats = advancedRaceCarStats(entryState, advancedRecord);
      const raceTeam: TeamProfile = { ...storedTeam, stats: raceStats, development: { ...storedTeam.development, facilities: activeFacilities } };
      const raceProfile = { ...bindDriverToTeam(profile, raceTeam), raceEntryEffects: { ...entryEffects, gridPenalty: advancedRecord.gridPenalty, wornComponentPenalty: advancedRecord.wornComponentPenalty, rookiePractice: advancedRecord.rookieUsed, entertainmentEvent: advancedRecord.entertainmentEvent, complianceRisk: advancedRecord.complianceRisk } };
      const teammateArchive = profiles.find((item) => item.id !== profile.id && item.teamId === raceTeam.id && item.contract?.role !== "reserve");
      const teammateProfile = teammateArchive ? { ...bindDriverToTeam(teammateArchive, raceTeam), raceEntryEffects: { emergencySpares: entryEffects.emergencySpares } } : undefined;
      const priorityDriverId = (() => {
        if (season.currentContract.role === "primary") return profile.id;
        const humanPoints = season.standings.find((standing) => standing.driverId === profile.id)?.championshipPoints ?? 0;
        const teammatePoints = season.standings.find((standing) => standing.driverId === (teammateArchive?.id ?? season.teammateDriverId))?.championshipPoints ?? 0;
        return teammatePoints > humanPoints ? (teammateArchive?.id ?? season.teammateDriverId) : profile.id;
      })();
      const next = createGame(raceProfile, season.aiCount, (season.seed + season.currentRound * 1009) >>> 0, track, "official", { weekendMode: "full", weatherMode: "dynamic", sprintEnabled: calendarRound.sprint, enableTeammate: true, teammateProfile, priorityDriverId });
      next.seasonId = season.id;
      next.seasonRound = season.currentRound;
      // TEMP_SEASON_DEBUG: remove this branch and the optional debugRank parameter.
      if (debugRank !== undefined) {
        const completed = debugFinishSeasonRace(next, debugRank);
        awardRaceDevelopment(completed, entryState);
        setGame(null);
        setSavedMatch(completed);
        saveMatch(completed);
        setError("");
        return;
      }
      setSeason(entryState); saveSeason(entryState);
      setGame(next);
      setSavedMatch(next);
      setError("");
      const nextProfiles = profiles.map((item) => item.id === profile.id ? closePreparationWindow(item) : item);
      setProfiles(nextProfiles);
      saveProfiles(nextProfiles);
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "赛季本站创建失败");
    }
  };

  const abandonSeason = () => {
    if (!window.confirm("清除当前六站赛季存档？已完成站次无法恢复。")) return;
    clearSeason();
    setSeason(null);
  };

  const startConfiguredRace = (profile: DriverProfile, aiCount: number, track: Track, mode: "official" | "simulation", seed?: number, options?: CreateGameOptions) => {
    if (mode === "official" && profile.contract?.role === "reserve") { setError("储备席位不能参加正式正赛；SIM 测试仍可使用该车手。"); return; }
    if (savedMatch && savedMatch.phase !== "finished" && !window.confirm(`已有未完成的${savedMatch.sessionMode === "simulation" ? " SIM 测试" : "正式比赛"}（${savedMatch.track.name}）。开始新比赛将替换该存档，确定继续？`)) return;
    let nextGame: GameState;
    try {
      const teammateArchive = mode === "official" ? profiles.find((item) => item.id !== profile.id && item.teamId === profile.teamId && item.contract?.role !== "reserve") : undefined;
      const teammateTeam = teams.find((item) => item.id === teammateArchive?.teamId);
      const teammateProfile = teammateArchive && teammateTeam ? bindDriverToTeam(teammateArchive, teammateTeam) : undefined;
      nextGame = createGame(profile, aiCount, mode === "simulation" ? seed ?? Date.now() : Date.now(), track, mode, { ...options, enableTeammate: mode === "official", teammateProfile, priorityDriverId: profile.id });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "比赛配置无效，未替换当前存档。");
      return;
    }
    setError("");
    setGame(nextGame);
    setSavedMatch(nextGame);
    window.scrollTo({ top: 0, behavior: "auto" });
    if (mode !== "official") return;
    const nextProfiles = profiles.map((item) => item.id === profile.id
      ? closePreparationWindow(item)
      : item);
    setProfiles(nextProfiles);
    saveProfiles(nextProfiles);
  };

  const navigateSection = (nextSection: AppSection) => {
    if (nextSection === "social") {
      const records=loadNarratives(),snapshot=game??loadMatch();
      if(snapshot) {
        const updated=syncNarrative(records[snapshot.id],snapshot,season??undefined,loadSocialHistory(snapshot,records),{profiles,teams});
        saveNarrative(updated); records[snapshot.id]=updated;
      }
      setNarratives(records);
    }
    const sequence = ++navigationSequence.current;
    navigationTransition.current?.skipTransition();
    const nextUrl = nextSection === "landing" ? `${window.location.pathname}${window.location.search}` : `${window.location.pathname}${window.location.search}#${nextSection}`;
    window.history.pushState(null, "", nextUrl);
    const commitNavigation = () => {
      if (sequence !== navigationSequence.current) return;
      // The new DOM must be committed before the browser captures its new-page snapshot.
      flushSync(() => setSection(nextSection));
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const transition = document.startViewTransition(commitNavigation);
      navigationTransition.current = transition;
      // Skipping an interrupted animation rejects ready, but must not break navigation.
      void transition.ready.catch(() => {});
      void transition.finished.then(() => {
        if (navigationTransition.current === transition) navigationTransition.current = null;
      }).catch(() => {});
    } else commitNavigation();
  };

  const abandonRace = () => {
    clearMatch();
    setGame(null);
    setSavedMatch(null);
    setError("");
  };
  const resumeRace = () => {
    if (!savedMatch) return;
    if (savedMatch.phase === "finished") awardRaceDevelopment(savedMatch);
    setError("");
    setGame(savedMatch);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  if (!hydrated) return <main className="loading">正在读取本地资料……</main>;
  const openRaceSocial=()=>{if(game){saveMatch(game);setSavedMatch(game);setGame(null);navigateSection('social');}};
  const isRaceSession = Boolean(game && !["practice", "setup", "qualifying", "preRace"].includes(game.phase));
  const isSocialPage = !game && section === "social";

  return (
    <main className={`app-shell ${isRaceSession ? "race-session" : ""} ${!game && section === "landing" ? "landing-shell" : "workspace-shell"} ${isSocialPage ? "social-shell" : "mobius-interface"}`}>
      {!isSocialPage && (section !== "landing" || game) ? <AmbientRaceBackdrop phase={game?.phase ?? "garage"} suspended={Boolean(game?.broadcast?.active || isRaceSession)} game={game} /> : null}
      {game && <header className="topbar">
        <div>
          <p className="eyebrow">{game.track.name} · 第 {game.round} 回合 · {game.sessionMode === "simulation" ? `SIM${game.initialSeed !== undefined ? ` · 种子 ${game.initialSeed}` : ""}` : "正式正赛"}</p>
          <h1><span>FORMULA:</span> MOBIUS</h1>
        </div>
        {game && (game.phase === "finished" ? <div className="session-actions"><button className="button ghost" onClick={openRaceSocial}>本场围场讨论</button><button className="button ghost" onClick={abandonRace}>返回车库</button></div> : <div className="session-actions">
          <button className="button ghost" onClick={openRaceSocial}>围场社交</button>
          <button className="button ghost" onClick={() => { saveMatch(game); setSavedMatch(game); setGame(null); setError(""); }}>保存并返回</button>
          <button className="button ghost danger" onClick={() => { if (window.confirm("放弃本场比赛并清除进行中的存档？")) abandonRace(); }}>放弃本场</button>
        </div>)}
      </header>}

      {error && <div className="error-banner">{error}</div>}

      {!game ? section === "landing" ? (
        <LandingPage driverCount={profiles.length} teamCount={teams.length} hasSavedRace={Boolean(savedMatch)} onNavigate={navigateSection} onResume={resumeRace} />
      ) : section === "drivers" ? (
        <DriverCenter profiles={profiles} teams={teams} season={season} onCreate={saveProfile} onUpdate={updateProfile} onDelete={deleteProfile} onAssign={assignDriver} onBack={() => navigateSection("landing")} onNavigate={navigateSection} />
      ) : section === "teams" ? (
        <TeamCenter teams={teams} profiles={profiles} season={season} onCreate={saveTeam} onUpdate={updateTeam} onDelete={deleteTeam} onBack={() => navigateSection("landing")} onNavigate={navigateSection} />
      ) : section === "social" ? (
        <SocialMediaPage narratives={narratives} season={season} savedMatch={savedMatch} onNavigate={navigateSection} onResume={resumeRace} onMediaSettings={setMediaChannels} />
      ) : (
        <RaceCenter profiles={profiles} teams={teams} savedMatch={savedMatch} season={season} onResume={resumeRace} onBack={() => navigateSection("landing")} onNavigate={navigateSection} onStart={startConfiguredRace} onCreateSeason={createSeason} onChooseSeasonSponsor={chooseSeasonSponsor} onAcceptContract={signSeasonContract} onPressResponse={respondToPress} onMediaSettings={setMediaChannels} onAdvancedSettings={setAdvancedModules} onAccountingCredit={useAccountingCredit} onStartSeasonRound={startSeasonRound} onSubmitSeasonActions={submitInterRoundActions} onStartSeasonProject={startSeasonProject} onUpgradeSeasonFacility={upgradeSeasonFacility} onAbandonSeason={abandonSeason}
          debugControls={season && <SeasonDebugControls season={season} disabled={!profiles.some(profile => profile.id === season.humanDriverId && profile.contract?.role !== "reserve")} onFinish={rank => { const profile = profiles.find(profile => profile.id === season.humanDriverId); if (profile) startSeasonRound(profile, undefined, rank); }} />} />
      ) : game.phase === "practice" ? (
        <PracticeSetup game={game} onDispatch={dispatch} />
      ) : game.phase === "setup" ? (
        <QualifyingSetup game={game} onDispatch={dispatch} />
      ) : game.phase === "preRace" ? (
        <PreRaceSetup game={game} onDispatch={dispatch} />
      ) : (
        <RaceScreen game={game} narrative={narratives[game.id]} season={season} onPressResponse={respondToPress} onMediaSettings={setMediaChannels} onPenaltyReview={reviewPenalty} onDispatch={dispatch} onReturnHome={abandonRace} onOpenSocial={openRaceSocial} />
      )}
    </main>
  );
}

function AmbientRaceBackdrop({ phase, suspended = false, game }: { phase: GameState["phase"] | "garage"; suspended?: boolean; game?: GameState | null }) {
  const humanHeat = game?.drivers.find((driver) => driver.id === game.humanDriverId)?.heat ?? 0;
  return (
    <div className={`ambient-race-bg ambient-${phase}`} aria-hidden="true">
      {!suspended && <ShaderRaceBackdrop phase={phase} variant="print" interactive={false} weather={game?.weather} yellow={Boolean(game?.yellowFlagSegmentId)} heat={humanHeat} />}
    </div>
  );
}

function PracticeSetup({ game, onDispatch }: GameProps) {
  const [aero, setAero] = useState<AeroSetup>("balanced");
  const [cooling, setCooling] = useState<CoolingSetup>("balanced");
  const [suspension, setSuspension] = useState<SuspensionSetup>("balanced");
  const values = { aero, cooling, suspension };
  return (
    <div className="stage-layout qualifying-stage">
      <section className="panel stage-panel">
        <StageHeader step="00" title="练习与调校" description="三组调校各选择一项；排位提交后进入 parc fermé。" />
        <div className="practice-setup-grid">
          {WEEKEND_SETUP_GROUPS.map((group) => {
            const value = values[group.id];
            const setValue = group.id === "aero" ? setAero : group.id === "cooling" ? setCooling : setSuspension;
            return <label key={group.id}><span>{group.name}</span><select value={value} onChange={(event) => setValue(event.target.value as never)}>{group.options.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select><small>{group.options.find((option) => option.id === value)?.description}</small></label>;
          })}
        </div>
        <div className="qualifying-formula"><span>当前调校</span><strong>{WEEKEND_SETUP_GROUPS[0].options.find((item) => item.id === aero)?.name}</strong><i>+</i><strong>{WEEKEND_SETUP_GROUPS[1].options.find((item) => item.id === cooling)?.name}</strong><i>+</i><strong>{WEEKEND_SETUP_GROUPS[2].options.find((item) => item.id === suspension)?.name}</strong></div>
        <button className="button primary large full" onClick={() => onDispatch({ type: "COMPLETE_PRACTICE", setup: { aero, cooling, suspension } })}>锁定练习调校并进入排位</button>
      </section>
      <aside className="qualifying-command"><CircuitProjection track={game.track} /><div className="command-readout"><span>周末格式</span><strong>完整周末</strong><dl><div><dt>天气</dt><dd>动态</dd></div><div><dt>冲刺</dt><dd>{game.weekend?.sprintEnabled ? "启用" : "关闭"}</dd></div><div><dt>正赛</dt><dd>{game.track.laps} 圈</dd></div></dl></div></aside>
    </div>
  );
}

function QualifyingSetup({ game, onDispatch }: GameProps) {
  const [mode, setMode] = useState<EngineMode>("balanced");
  const human = game.drivers.find((driver) => driver.id === game.humanDriverId)!;
  const modeBonus = mode === "save" ? 0 : mode === "balanced" ? 1 : 2;
  const qualifyingSignature = human.profile.career?.signatureMove === "qualifying_push";
  const signatureUpgrade = human.profile.career?.signatureUpgrade;
  const qualifyingDice = qualifyingSignature ? signatureUpgrade === "extra_use" ? 3 : 2 : 1;
  const signatureBonus = qualifyingSignature && signatureUpgrade === "enhanced" ? 1 : 0;
  const specializationBonus = human.profile.career?.specialization === "qualifying" ? 1 : 0;
  const qualifyingDieLabel = qualifyingDice === 1 ? "D12" : `${qualifyingDice}×D12 取高`;
  if (game.teamOrder?.status === "pending") {
    return (
      <div className="stage-layout qualifying-stage">
        <section className="panel stage-panel">
          <StageTimeline active={1} />
          <TeamOrderPanel game={game} onDispatch={onDispatch} />
        </section>
        <aside className="qualifying-command" aria-label="排位赛道与车队安排">
          <CircuitProjection track={game.track} />
          <RaceRoster drivers={game.drivers} />
        </aside>
      </div>
    );
  }
  return (
    <div className="stage-layout qualifying-stage">
      <section className="panel stage-panel">
        <StageTimeline active={1} />
        <StageHeader step="01" title="排位赛" description="所有车手暗选模式，然后自动掷 D12。进攻模式的热量会带入正赛。" />
        <OptionCards
          values={MODE_KEYS}
          selected={mode}
          onSelect={setMode}
          render={(value) => ({ title: MODE_LABELS[value], body: qualifyingModeText(value) })}
        />
        <div className="qualifying-formula" aria-label="当前排位公式">
          <span>排位检定</span>
          <strong>{qualifyingDieLabel}</strong><i>+</i><strong>{human.profile.stats.eng}</strong><i>+</i><strong>{modeBonus + signatureBonus + specializationBonus}</strong><b>= {1 + human.profile.stats.eng + modeBonus + signatureBonus + specializationBonus}—{12 + human.profile.stats.eng + modeBonus + signatureBonus + specializationBonus}</b>
          <small>{qualifyingDice > 1 ? `${SIGNATURE_MOVES.qualifying_push.name} · ${qualifyingDice} 枚骰取最高${signatureBonus ? "后 +1" : ""}` : "骰点"} + ENG + 模式修正{specializationBonus ? " + 排位专精 1" : ""}；同分依次比较 AERO 与决胜骰</small>
        </div>
        <button className="button primary large full" onClick={() => onDispatch({ type: "START_QUALIFYING", mode })}>
          锁定模式并进行排位
        </button>
      </section>
      <aside className="qualifying-command" aria-label="排位赛道与参赛车辆">
        <CircuitProjection track={game.track} />
        <div className="command-readout">
          <span>排位设定</span>
          <strong>{MODE_LABELS[mode]}</strong>
          <dl><div><dt>起始热量</dt><dd>{mode === "attack" ? "+1" : "0"}</dd></div><div><dt>动力修正</dt><dd>+{modeBonus}</dd></div><div><dt>参赛车辆</dt><dd>{game.drivers.length}</dd></div></dl>
        </div>
        <RaceRoster drivers={game.drivers} />
      </aside>
    </div>
  );
}

function PreRaceSetup({ game, onDispatch }: GameProps) {
  const human = game.drivers.find((driver) => driver.id === game.humanDriverId)!;
  const burdenCount = requiredBurdenCount(human.profile.stats);
  const [tire, setTire] = useState<TireCompound>(game.weather === "heavy_rain" ? "wet" : game.weather === "light_rain" ? "intermediate" : "medium");
  const [burdens, setBurdens] = useState<BurdenId[]>([]);
  const [budgetRemoval, setBudgetRemoval] = useState<"ers" | "lateBrake" | "defense" | "cooling">("cooling");
  const [strategistBonus, setStrategistBonus] = useState<"ers" | "lateBrake" | "defense" | "cooling" | "quickRepair">("quickRepair");
  const [strategistBonus2, setStrategistBonus2] = useState<TacticalResourceId>("ers");
  const [teamBonus, setTeamBonus] = useState<TacticalResourceId>("defense");
  const lockedSetup = game.weekend?.lockedSetup ?? game.weekend?.setup;
  const [aeroSetup, setAeroSetup] = useState<AeroSetup>(lockedSetup?.aero ?? "balanced");
  const [coolingSetup, setCoolingSetup] = useState<CoolingSetup>(lockedSetup?.cooling ?? "balanced");
  const [suspensionSetup, setSuspensionSetup] = useState<SuspensionSetup>(lockedSetup?.suspension ?? "balanced");
  const sprintPending = Boolean(game.weekendMode === "full" && game.weekend?.sprintEnabled && !game.weekend.sprintCompleted);
  const hasStrategyTools = (human.profile.team?.facilities?.strategy_tools ?? 0) > 0;
  const strategistRank = human.profile.talent === "strategist" ? talentUpgradeRank(human.profile.career?.level ?? 1) : 0;
  const setupPreview = previewRaceSetup(
    human,
    tire,
    burdens,
    burdens.includes("budget_cap") ? budgetRemoval : undefined,
    human.profile.talent === "strategist" ? strategistBonus : undefined,
    strategistRank >= 3 ? strategistBonus2 : undefined,
    hasStrategyTools ? teamBonus : undefined,
  );

  const toggleBurden = (id: BurdenId) => {
    setBurdens((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < burdenCount ? [...current, id] : current);
  };

  return (
    <div className="stage-layout">
      <section className="panel stage-panel">
        <StageTimeline active={2} />
        <StageHeader step="02" title={sprintPending ? "冲刺赛准备" : "赛前准备"} description={`${game.weatherMode === "dynamic" ? "当前天气已公开，之后每回合末更新。" : "天气整场固定。"}选择本场负担、首发轮胎与特殊资源。`} />
        <div className="weather-banner">
          <span>天气 D12：{game.weatherRoll}</span>
          <strong>{game.weather ? WEATHER_LABELS[game.weather] : "—"}</strong>
          <small>{game.weather === "sunny" || game.weather === "cloudy" ? `干地规则${game.weatherMode === "dynamic" ? " · 回合末重新掷天气" : ""}` : "雨天：DRS 与尾流关闭；错误轮胎入弯前进行抓地检定"}</small>
        </div>
        {game.weatherMode === "dynamic" && game.weather && <div className="weather-probability" aria-label="下一回合天气概率"><span>下一回合预测</span>{weatherForecast(game.weather).map((item) => <strong key={item.weather}>{WEATHER_LABELS[item.weather]} {Math.round(item.chance * 100)}%</strong>)}</div>}

        {game.weekendMode === "full" && !sprintPending && lockedSetup && <div className="parc-ferme-control"><div><strong>PARC FERMÉ</strong><span>修改任意调校将从维修区发车</span></div><label>气动<select value={aeroSetup} onChange={(event) => setAeroSetup(event.target.value as AeroSetup)}>{WEEKEND_SETUP_GROUPS[0].options.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>冷却<select value={coolingSetup} onChange={(event) => setCoolingSetup(event.target.value as CoolingSetup)}>{WEEKEND_SETUP_GROUPS[1].options.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>悬挂<select value={suspensionSetup} onChange={(event) => setSuspensionSetup(event.target.value as SuspensionSetup)}>{WEEKEND_SETUP_GROUPS[2].options.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div>}

        {game.weekend?.sprintResults && !sprintPending && <div className="sprint-summary"><strong>冲刺赛结果</strong>{game.weekend.sprintResults.slice(0, 3).map((result) => <span key={result.driverId}>P{result.rank} {game.drivers.find((driver) => driver.id === result.driverId)?.profile.name ?? result.driverId} · {result.points} 分</span>)}</div>}

        <h3>首发轮胎</h3>
        <OptionCards
          values={TIRE_KEYS}
          selected={tire}
          onSelect={setTire}
          render={(value) => ({ title: TIRE_LABELS[value], body: TIRES[value].description })}
        />

        <div className="section-heading">
          <h3>本场负担</h3>
          <span>选择 {burdenCount} 个 · 已选 {burdens.length}</span>
        </div>
        <div className="check-grid">
          {BURDEN_KEYS.map((id) => (
            <label className={burdens.includes(id) ? "checked" : ""} key={id}>
              <input type="checkbox" checked={burdens.includes(id)} onChange={() => toggleBurden(id)} />
              <strong>{BURDEN_LABELS[id]}</strong>
              <small>{BURDENS[id].description}</small>
            </label>
          ))}
        </div>

        {burdens.includes("budget_cap") && (
          <label>
            预算帽移除资源
            <select value={budgetRemoval} onChange={(event) => setBudgetRemoval(event.target.value as typeof budgetRemoval)}>
              <option value="ers">1 点 ERS</option><option value="lateBrake">1 枚晚刹</option>
              <option value="defense">1 枚防守</option><option value="cooling">1 枚冷却</option>
            </select>
          </label>
        )}
        {human.profile.talent === "strategist" && (
          <label>
            策略家额外标记
            <select value={strategistBonus} onChange={(event) => setStrategistBonus(event.target.value as typeof strategistBonus)}>
              <option value="ers">1 点 ERS</option><option value="lateBrake">1 枚晚刹</option>
              <option value="defense">1 枚防守</option><option value="cooling">1 枚冷却</option>
              <option value="quickRepair">1 枚快修</option>
            </select>
          </label>
        )}
        {strategistRank >= 3 && (
          <label>
            策略家升级 III 额外标记
            <select value={strategistBonus2} onChange={(event) => setStrategistBonus2(event.target.value as TacticalResourceId)}>
              <option value="ers">1 点 ERS</option><option value="lateBrake">1 枚晚刹</option>
              <option value="defense">1 枚防守</option><option value="cooling">1 枚冷却</option>
              <option value="quickRepair">1 枚快修</option>
            </select>
          </label>
        )}
        {hasStrategyTools && (
          <label>
            策略工具团队标记
            <select value={teamBonus} onChange={(event) => setTeamBonus(event.target.value as TacticalResourceId)}>
              <option value="ers">1 点 ERS</option><option value="lateBrake">1 枚晚刹</option>
              <option value="defense">1 枚防守</option><option value="cooling">1 枚冷却</option>
              <option value="quickRepair">1 枚快修</option>
            </select>
          </label>
        )}
        <div className="setup-forecast" aria-live="polite" aria-label="预计发车资源">
          <span><small>轮胎</small><strong>{TIRE_LABELS[setupPreview.tire]}</strong></span>
          <span><small>ERS</small><strong>{setupPreview.ers}<i>/{ersCapacity(human)}</i></strong></span>
          <span><small>晚刹</small><strong>{setupPreview.tactical.lateBrake}</strong></span>
          <span><small>防守</small><strong>{setupPreview.tactical.defense}</strong></span>
          <span><small>冷却</small><strong>{setupPreview.tactical.cooling}</strong></span>
          <span><small>快修</small><strong>{setupPreview.tactical.quickRepair}</strong></span>
          <span className={setupPreview.heat >= 5 ? "warning" : ""}><small>热量</small><strong>{setupPreview.heat}<i>/6</i></strong></span>
        </div>
        <button
          className="button primary large full"
          disabled={burdens.length !== burdenCount}
          onClick={() => onDispatch(sprintPending
            ? { type: "START_SPRINT", tire, burdens, budgetRemoval, strategistBonus, strategistBonus2: strategistRank >= 3 ? strategistBonus2 : undefined, teamBonus: hasStrategyTools ? teamBonus : undefined }
            : { type: "START_RACE", tire, burdens, budgetRemoval, strategistBonus, strategistBonus2: strategistRank >= 3 ? strategistBonus2 : undefined, teamBonus: hasStrategyTools ? teamBonus : undefined, setupOverride: game.weekendMode === "full" ? { aero: aeroSetup, cooling: coolingSetup, suspension: suspensionSetup } : undefined })}
        >{sprintPending ? "进入 3 圈冲刺赛" : "进入正赛"}</button>
      </section>

      <section className="panel qualifying-results">
        <div className="classification-heading"><div><p className="section-kicker">排位结果</p><h2>发车顺序</h2></div><span>{game.qualifying.length} 辆车</span></div>
        {game.qualifying.map((entry, index) => {
          const driver = game.drivers.find((item) => item.id === entry.driverId)!;
          const best = game.qualifying.find((item) => !item.invalid)?.total || 1;
          return (
            <div className="qualifying-row" key={entry.driverId}>
              <span className="rank">P{index + 1}</span>
              <span className="driver-chip small" style={{ backgroundColor: driver.profile.color }}>{driver.profile.abbreviation}</span>
              <span className="grow"><strong>{driver.profile.name}</strong><small>{entry.invalid ? "排位过热故障 · 成绩作废" : `D12 ${entry.roll} · ENG ${driver.profile.stats.eng} · ${MODE_LABELS[entry.mode]}${entry.tieBreakRoll ? ` · 决胜 D12 ${entry.tieBreakRoll}` : ""}`}</small><i className="qualifying-meter"><b style={{ width: entry.invalid ? "0%" : `${Math.max(18, entry.total / best * 100)}%` }} /></i></span>
              <strong className="qualifying-total">{entry.invalid ? "DNQ" : entry.total}</strong>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function RaceScreen({ game, narrative, season, onPressResponse, onMediaSettings, onPenaltyReview, onDispatch, onReturnHome, onOpenSocial }: GameProps & { narrative?: RaceNarrative; season?: SeasonState | null; onPressResponse?: (raceId: string, questionId: string, intent: PressResponseIntent) => void; onMediaSettings?: (settings: MediaChannelSettings) => void; onPenaltyReview?: (game: GameState, eventId: number) => void; onReturnHome: () => void; onOpenSocial:()=>void }) {
  const human = game.drivers.find((driver) => driver.id === game.humanDriverId)!;
  const waiting = strategyWaitReason(human);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(900);
  useEffect(() => {
    if (!autoPlay) return;
    if (game.presentation || game.teamOrder?.status === "pending") return;
    if ((game.phase === "movement" && !game.pendingDecision) || (game.phase === "strategy" && waiting)) {
      const timer = window.setTimeout(() => onDispatch({ type: "CONTINUE_MOVEMENT" }), playbackSpeed);
      return () => window.clearTimeout(timer);
    }
  }, [autoPlay, game, onDispatch, playbackSpeed, waiting]);
  if (game.broadcast?.active) return <BroadcastIntro game={game} onDispatch={onDispatch} />;
  if (game.phase === "finished") return <div className="results-layout"><ResultPanel game={game} season={season} onPressResponse={onPressResponse} onMediaSettings={onMediaSettings} onPenaltyReview={onPenaltyReview} onReturnHome={onReturnHome} onOpenSocial={onOpenSocial} /></div>;
  return (
    <div className="race-cockpit" style={{ "--race-signal": raceSignalColor(game) } as React.CSSProperties}>
      <RaceHeader game={game} />
      <RaceProgressRail game={game} selectedDriverId={selectedDriverId} onSelect={setSelectedDriverId} />
      <RaceOrder game={game} selectedDriverId={selectedDriverId} onSelect={setSelectedDriverId} />
      <div className="race-circuit-stage" id="race-circuit">
        <TrackBoard game={game} selectedDriverId={selectedDriverId} onSelect={setSelectedDriverId} />
      </div>
      <CommentaryPanel narrative={narrative} />
      <RaceFocusStrip game={game} driver={human} />
      <aside className="race-sidebar" id="race-action">
        {game.phase === "redFlag" ? (
          <RedFlagPanel game={game} onDispatch={onDispatch} />
        ) : game.teamOrder?.status === "pending" ? (
          <TeamOrderPanel game={game} onDispatch={onDispatch} />
        ) : game.phase === "strategy" && waiting ? (
          <section className="panel action-panel strategy-panel">
            <p className="section-kicker">第 {game.round} 回合 · 无需策略选择</p>
            <h2>等待回合</h2><p>{waiting}</p>
            <button className="button primary large full" onClick={() => onDispatch({ type: "CONTINUE_MOVEMENT" })}>继续回合</button>
          </section>
        ) : game.phase === "strategy" ? (
          <StrategyPanel key={`${game.id}:${game.round}`} driver={human} game={game} narrative={narrative} onDispatch={onDispatch} />
        ) : game.pendingDecision ? (
          <DecisionPanel key={`${game.round}-${game.pendingDecision.kind}-${game.pendingDecision.driverId}`} game={game} onDispatch={onDispatch} />
        ) : (
          <PlaybackPanel game={game} autoPlay={autoPlay} speed={playbackSpeed} onAutoPlay={setAutoPlay} onSpeed={setPlaybackSpeed} onDispatch={onDispatch} />
        )}
        {(game.phase !== "strategy" || waiting || game.teamOrder?.status === "pending") && <TeamRadioPanel key={game.id} game={game} narrative={narrative} />}
      </aside>
      <RaceInstrumentDeck game={game} season={season} driver={human} />
      <nav className="race-jump" aria-label="比赛页面导航"><a href="#race-circuit">赛道</a><a className={game.pendingDecision ? "needs-decision" : ""} href="#race-action">{game.pendingDecision ? "需要决策" : game.phase === "strategy" && !waiting ? "设置策略" : "行动控制"}</a><a href="#race-log">日志</a><a href="#race-rules">规则</a></nav>
      {game.presentation && <ResolutionOverlay game={game} onDispatch={onDispatch} />}
    </div>
  );
}

function TeamOrderPanel({ game, onDispatch }: GameProps) {
  const order = game.teamOrder!;
  const beneficiary = game.drivers.find((driver) => driver.id === order.beneficiaryId)!;
  const yielding = game.drivers.find((driver) => driver.id === order.yieldingDriverId)!;
  const reason = { championship_priority: "争冠优先", strategy_split: "不同轮胎策略", pit_window: "保护进站窗口", qualifying_tow: "排位拖车" }[order.reason];
  const qualifyingTow = order.reason === "qualifying_tow";
  return <section className="strategy-panel team-order-panel"><p className="section-kicker">TEAM ORDER · {qualifyingTow ? "排位准备" : `第 ${game.round} 回合`}</p><h2>{qualifyingTow ? "排位拖车安排" : "车队请求让位"}</h2><p>{yielding.profile.name} → {beneficiary.profile.name}</p><div className="team-order-reason"><span>触发条件</span><strong>{reason}</strong><small>{qualifyingTow ? "接受后，提供拖车的车手锁定省油排位模式；双方骰序不因这项选择变化。" : "两车已同格。接受后让出线路，原行动按剩余 MP 继续；拒绝则按正常超车规则处理。"}</small></div><div className="decision-buttons"><button className="button primary" onClick={() => onDispatch({ type: "RESOLVE_TEAM_ORDER", accept: true })}>接受队令</button><button className="button ghost danger" onClick={() => onDispatch({ type: "RESOLVE_TEAM_ORDER", accept: false })}>拒绝队令</button></div></section>;
}

function RedFlagPanel({ game, onDispatch }: GameProps) {
  const [tire, setTire] = useState<TireCompound>(game.weather === "heavy_rain" ? "wet" : game.weather === "light_rain" ? "intermediate" : "medium");
  return <section className="strategy-panel red-flag-panel"><p className="section-kicker">RACE CONTROL</p><h2>红旗 · 等待静止发车</h2><p>当前顺序已锁定。可免费换胎并移除 2 热量、1 刹车热；损伤与 ERS 不变。</p><label>重启轮胎<select value={tire} onChange={(event) => setTire(event.target.value as TireCompound)}>{TIRE_KEYS.map((id) => <option value={id} key={id}>{TIRE_LABELS[id]}</option>)}</select></label><button className="button primary full" onClick={() => onDispatch({ type: "RESTART_RED_FLAG", tire })}>确认轮胎并静止发车</button></section>;
}

function RaceInstrumentDeck({ game, driver }: { game: GameState; season?: SeasonState | null; driver: DriverState }) {
  return <div className="race-instrument-deck">
    <section className="race-reference" id="race-log" aria-labelledby="race-log-title">
      <header><h2 id="race-log-title">比赛日志</h2><span>最新在前 · 最近 {Math.min(80, game.logs.length)} 条</span></header>
      <div className="race-reference-scroll" tabIndex={0} role="region" aria-label="比赛日志内容"><EventLog game={game} embedded /></div>
    </section>
    <section className="race-reference" id="race-rules" aria-labelledby="race-rules-title">
      <header><h2 id="race-rules-title">当前规则</h2><span>{game.pendingDecision ? "对应当前决策" : `第 ${game.round} 回合`}</span></header>
      <div className="race-reference-scroll" tabIndex={0} role="region" aria-label="规则与遥测内容">
        <RaceControlDock game={game} embedded />
        <details className="race-extra-telemetry"><summary>查看车辆详细遥测</summary><TelemetryDeck driver={driver} game={game} /></details>
      </div>
    </section>
  </div>;
}

function BroadcastIntro({ game, onDispatch }: GameProps) {
  const stage = game.broadcast?.stage ?? 0;
  const copy = introCopy(game, stage);
  const [litCount, setLitCount] = useState(0);
  const [lightsOut, setLightsOut] = useState(false);
  const [reactionMs, setReactionMs] = useState<number | null>(null);
  const [falseStart, setFalseStart] = useState(false);
  const [reactionBoard, setReactionBoard] = useState<number[]>([]);
  const reactionStart = useRef(0);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(REACTION_BOARD_KEY) ?? "[]");
        if (Array.isArray(stored)) setReactionBoard(stored.filter((value): value is number => typeof value === "number").slice(0, 5));
      } catch {
        setReactionBoard([]);
      }
    });
  }, []);
  useEffect(() => {
    if (stage >= 4) return;
    const timer = window.setTimeout(() => onDispatch({ type: "ADVANCE_BROADCAST" }), 3600);
    return () => window.clearTimeout(timer);
  }, [onDispatch, stage]);
  useEffect(() => {
    if (stage !== 4 || falseStart) return;
    const timers: number[] = [];
    for (let count = 1; count <= 5; count += 1) {
      timers.push(window.setTimeout(() => setLitCount(count), count * 520));
    }
    const randomHold = 700 + Math.floor(Math.random() * 2300);
    timers.push(window.setTimeout(() => {
      setLitCount(0);
      setLightsOut(true);
      reactionStart.current = performance.now();
    }, 5 * 520 + randomHold));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [falseStart, stage]);
  const recordReaction = () => {
    if (reactionMs !== null || falseStart) return;
    if (!lightsOut) {
      setFalseStart(true);
      setLitCount(0);
      return;
    }
    const result = Math.max(1, Math.round(performance.now() - reactionStart.current));
    setReactionMs(result);
    const next = [...reactionBoard, result].sort((a, b) => a - b).slice(0, 5);
    setReactionBoard(next);
    window.localStorage.setItem(REACTION_BOARD_KEY, JSON.stringify(next));
  };
  const points = game.track.mapPoints ?? TRACKS[0].mapPoints;
  const path = `${points.map((point) => point.join(",")).join(" ")} ${points[0].join(",")}`;
  const ordered = game.drivers.slice().sort((a, b) => a.qualifyingRank - b.qualifyingRank);
  const reactionRank = reactionMs === null ? -1 : reactionBoard.indexOf(reactionMs);
  const startCopy = stage === 4 ? {
    kicker: falseStart ? "START STATUS" : lightsOut ? "LIGHT STATE 0/5" : `LIGHT STATE ${litCount}/5`,
    title: falseStart ? "抢跑" : reactionMs !== null ? `${reactionMs} ms` : lightsOut ? "LIGHTS OUT" : litCount === 5 ? "5/5" : `${litCount}/5`,
    body: falseStart ? "红灯熄灭前点火，本次成绩无效" : reactionMs !== null ? `${reactionRank >= 0 ? `本机排名 P${reactionRank + 1}` : "未进入本机前五"} · 最佳 ${reactionBoard[0] ?? reactionMs} ms` : lightsOut ? "计时已开始" : litCount === 5 ? "随机熄灯等待中" : "红灯依次点亮",
  } : copy;
  return (
    <section className={`broadcast-intro intro-stage-${stage}`} key={stage}>
      <ShaderRaceBackdrop phase="preRace" variant="tunnel" interactive={false} poster />
      <header className="intro-network"><span>{`${game.track.name} // ${game.track.totalLength} CELLS // ${game.sessionLaps ?? game.track.laps} LAPS`}</span><strong>{stage + 1}/5</strong></header>
      <div className="intro-visual">
        {(stage === 0 || stage === 1) && <svg className="intro-track" viewBox="0 0 700 430"><polyline className="intro-track-shadow" points={path} /><polyline className="intro-track-line" pathLength="1" points={path} />{points.map((point, index) => <circle style={{ "--point-index": index } as React.CSSProperties} key={index} cx={point[0]} cy={point[1]} r="5" />)}</svg>}
        {stage === 2 && <div className={`weather-orbit ${game.weather === "heavy_rain" || game.weather === "light_rain" ? "wet" : "dry"}`}><i /><i /><i /><strong>{game.weatherRoll}</strong><span>WEATHER D12</span></div>}
        {stage === 3 && <div className="intro-grid">{ordered.map((driver, index) => <div style={{ "--grid-index": index } as React.CSSProperties} key={driver.id}><span>P{index + 1}</span><CarBadge driver={driver} /><strong>{driver.profile.name}</strong><small>{formatStats(driver.profile.stats)}</small></div>)}</div>}
        {stage === 4 && <div className="start-sequence" aria-label="发车灯与反应计时">
          <div className={`start-lights ${lightsOut ? "out" : ""}`}>{[0,1,2,3,4].map((light) => <i className={!lightsOut && light < litCount ? "lit" : ""} key={light} />)}</div>
          <div className="start-status" aria-live="polite">{falseStart ? "抢跑" : lightsOut ? "LIGHTS OUT" : "\u00a0"}</div>
          <button className={`reaction-trigger ${lightsOut ? "armed" : ""} ${falseStart ? "false-start" : ""}`} disabled={reactionMs !== null || falseStart} onClick={recordReaction}>{falseStart ? "抢跑" : reactionMs === null ? "点火" : `${reactionMs} ms`}</button>
          <div className="reaction-result">
            {reactionMs !== null && <ol>{reactionBoard.map((result, index) => <li className={result === reactionMs ? "current" : ""} key={`${result}-${index}`}><span>P{index + 1}</span><strong>{result}</strong><small>ms</small></li>)}</ol>}
            {falseStart && <strong className="false-start-label">成绩无效</strong>}
          </div>
        </div>}
      </div>
      <div className="intro-copy"><p>{startCopy.kicker}</p><h2>{startCopy.title}</h2><span>{startCopy.body}</span></div>
      <div className="intro-progress">{[0,1,2,3,4].map((page) => <i className={page <= stage ? "active" : ""} key={page} />)}</div>
      <div className="intro-actions"><button onClick={() => onDispatch({ type: "SKIP_BROADCAST" })}>跳过开场</button>{stage < 4 ? <button onClick={() => onDispatch({ type: "ADVANCE_BROADCAST" })}>下一项数据</button> : reactionMs !== null || falseStart ? <button onClick={() => onDispatch({ type: "ADVANCE_BROADCAST" })}>进入比赛</button> : null}</div>
    </section>
  );
}

function RaceFocusStrip({ game, driver }: { game: GameState; driver: DriverState }) {
  const active = game.drivers.find((item) => item.id === game.movement?.activeDriverId);
  const playerLocation = driver.status === "dnf" ? "已退赛" : driver.pit ? "维修道" : driver.progress < 0 ? "发车区" : `第 ${Math.min(game.sessionLaps ?? game.track.laps, Math.floor(driver.progress / game.track.totalLength) + 1)} 圈 · ${getCellIndex(game, driver) + 1} 格`;
  const current = game.pendingDecision ? "等待玩家决策" : game.presentation ? "等待确认结果" : game.phase === "strategy" ? "设置本回合策略" : active ? `${active.profile.abbreviation} 行动中` : "等待下一步骤";
  return (
    <div className="race-focus-strip" aria-label="实时比赛重点">
      <div className="focus-state"><small>当前状态 · R{game.round}</small><strong>{current}</strong><span>{driver.profile.abbreviation} · {playerLocation}{game.movement && active ? ` · ${active.profile.abbreviation} 余 ${game.movement.remainingMp} MP` : ""}</span></div>
      <div className="focus-resources"><span><small>{TIRE_LABELS[driver.tire]} / 磨损</small><strong><MetricValue value={driver.wear} label="轮胎磨损" /><i>/12</i></strong></span><span><small>赛车热量</small><strong><MetricValue value={driver.heat} label="赛车热量" /><i>/6</i></strong></span><span><small>刹车热</small><strong><MetricValue value={driver.brakeHeat} label="刹车热" /><i>/4</i></strong></span><span><small>ERS</small><strong><MetricValue value={driver.ers} label="ERS" /></strong></span></div>
      <div className="tactical-strip"><span>晚刹 <b>{driver.tactical.lateBrake}</b></span><span>防守 <b>{driver.tactical.defense}</b></span><span>冷却 <b>{driver.tactical.cooling}</b></span><span>快修 <b>{driver.tactical.quickRepair}</b></span><span className={(driver.trackLimitWarnings ?? 0) >= 3 ? "warning-text" : ""}>边界 <b>{driver.trackLimitWarnings ?? 0}</b></span><span className={driver.heavyDamage || driver.lightDamage ? "warning-text" : ""}>{driver.heavyDamage ? `重伤 · MP ${driver.profile.career?.specialization === "endurance" ? "−1" : "−2"}` : `轻伤 ${driver.lightDamage}`}</span></div>
    </div>
  );
}

function PlaybackPanel({ game, autoPlay, speed, onAutoPlay, onSpeed, onDispatch }: GameProps & { autoPlay: boolean; speed: number; onAutoPlay: (value: boolean) => void; onSpeed: (value: number) => void }) {
  const active = game.movement?.activeDriverId ? game.drivers.find((driver) => driver.id === game.movement?.activeDriverId) : undefined;
  const queueTotal = game.movement?.queue.length ?? 0;
  const queueIndex = queueTotal ? Math.min((game.movement?.queueIndex ?? 0) + 1, queueTotal) : 0;
  const queueDrivers = (game.movement?.queue ?? []).map((id) => game.drivers.find((driver) => driver.id === id)).filter((driver): driver is DriverState => Boolean(driver));
  return (
    <section className="playback-console">
      <p className="section-kicker">行动队列 {queueIndex}/{queueTotal}</p>
      <h2>{active ? `${active.profile.abbreviation} 正在行动` : "等待下一车手"}</h2>
      <div className="movement-queue" aria-label="本回合车辆行动顺序">
        {queueDrivers.map((driver, index) => <span className={index < queueIndex - 1 ? "done" : index === queueIndex - 1 ? "active" : "pending"} key={driver.id}><CarBadge driver={driver} /><small>{index < queueIndex - 1 ? "完成" : index === queueIndex - 1 ? "行动中" : `第 ${index + 1} 位`}</small></span>)}
      </div>
      {autoPlay && game.phase === "movement" && !game.pendingDecision && <div key={`${game.nextLogId}-${queueIndex}`} className="autoplay-clock" style={{ "--playback-duration": `${speed}ms` } as React.CSSProperties}><i /></div>}
      <div className="playback-readout"><span>剩余 MP</span><strong>{game.movement?.remainingMp ?? 0}</strong><small>{active ? `${active.isHuman ? "玩家" : "AI"} · ${active.profile.name}` : "回合队列结算"}</small></div>
      <button className="button primary full" onClick={() => onDispatch({ type: "CONTINUE_MOVEMENT" })}>推进一个动作</button>
      <div className="playback-controls">
        <label><input type="checkbox" checked={autoPlay} onChange={(event) => onAutoPlay(event.target.checked)} />自动播放</label>
        <select aria-label="播放速度" value={speed} onChange={(event) => onSpeed(Number(event.target.value))}><option value={1400}>慢速</option><option value={900}>标准</option><option value={500}>快速</option></select>
      </div>
      <p>队列 {queueIndex}/{queueTotal} · 已移动 {game.movement?.movedDriverIds.length ?? 0} 车 · R{game.round}</p>
    </section>
  );
}

function ResolutionOverlay({ game, onDispatch }: GameProps) {
  const step = game.presentation!;
  const involved = game.drivers.filter((driver) => step.driverIds.includes(driver.id));
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return (
    <div ref={dialog} className={`resolution-scrim ${step.kind}`} role="dialog" aria-modal="true" aria-labelledby="resolution-title" onKeyDown={(event) => {
      if (event.key === "Tab") { event.preventDefault(); dialog.current?.querySelector<HTMLButtonElement>("button")?.focus(); }
    }}>
      <section className="resolution-overlay">
        <div className="resolution-stripe"><span>第 {game.round} 回合 · 事件 {step.id}</span><strong>{({ turn: "回合", move: "移动", roll: "掷骰", incident: "事故", result: "结算" })[step.kind]}</strong></div>
        <div className="resolution-main">
          <h2 id="resolution-title">{step.title}</h2>
          {involved.length > 0 && <div className="resolution-drivers">{involved.map((driver) => <span key={driver.id}><CarBadge driver={driver} />{driver.profile.name}</span>)}</div>}
          <div className="formula-stack">{step.messages.map((message, index) => <div style={{ "--reveal-delay": `${Math.min(index, 8) * 150}ms` } as React.CSSProperties} key={`${step.id}-${index}`} className={`${message.includes("D12") || message.includes(" vs ") ? "formula" : "outcome"} ${index === step.messages.length - 1 ? "final-line" : ""}`}>
            {message.includes("D12(") && <div className="dice-strip" aria-label="D12 原始点数">{Array.from(message.matchAll(/D12\((\d+)\)/g), (match, rollIndex) => <span className="die-result" key={rollIndex}><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 2 59 17v30L32 62 5 47V17Z M32 2 18 23 5 47m13-24 28 0 13 24M46 23 32 2M18 23l-2 24 16 15 16-15-2-24M16 47h32" /></svg><strong>{match[1]}</strong><small>D12</small></span>)}</div>}
            <p>{message}</p>
          </div>)}</div>
          <button className="button primary large full" onClick={() => onDispatch({ type: "DISMISS_PRESENTATION" })}>确认结果，继续</button>
        </div>
      </section>
    </div>
  );
}


function RaceControlDock({ game, embedded = false }: { game: GameState; embedded?: boolean }) {
  const [referenceId, setReferenceId] = useState("current");
  const reference = RACE_RULE_REFERENCE.find((item) => item.id === referenceId);
  const prompt = game.pendingDecision;
  const wet = game.weather === "heavy_rain" || game.weather === "light_rain";
  const activeDriver = game.drivers.find((driver) => driver.id === game.movement?.activeDriverId);
  const activeSegment = activeDriver && activeDriver.progress >= 0 ? getSegmentAtCell(game, getCellIndex(game, activeDriver))?.segment : undefined;
  const drsAvailable = Boolean(activeDriver && calculateMpBreakdown(game, activeDriver, DEFAULT_PLAN).drs);
  const drsBlocked = wet || game.raceControl !== "green" || Boolean(game.yellowFlagSegmentId && activeSegment?.id === game.yellowFlagSegmentId);
  let heading = "回合流程";
  let rule = "所有车手先锁定策略，再按回合开始时的赛道顺序依次移动；AI 不读取玩家本回合的行动结果。";
  const blocked: string[] = [];
  if (game.phase === "strategy") {
    const waiting = strategyWaitReason(game.drivers.find(driver => driver.id === game.humanDriverId)!);
    heading = waiting ? "等待回合" : "策略声明";
    rule = waiting ?? "选择发动机模式、ERS 与进站意图。ERS 消耗资源并增加 MP；只有车辆经过维修道入口时，进站意图才会执行。";
  } else if (prompt?.kind === "corner") {
    heading = `${prompt.segmentName} · 入弯规则`;
    rule = `车辆需先支付弯角值，再花 1 MP 进入首格。AERO ≥ 3 且弯中无其他车辆时，理想内线使弯角消耗 -2；MP 不足才可尝试晚刹。`;
    if (!prompt.canNormal) blocked.push(`正常外线：需要 ${prompt.baseCost + 1} MP，当前只有 ${prompt.remainingMp}。`);
    if (!prompt.canIdeal) blocked.push(`理想内线：${prompt.idealReason ?? "当前条件不满足"}。`);
    if (!prompt.canLateBrake) blocked.push(`晚刹：${prompt.lateBrakeReason ?? (prompt.remainingMp < 1 ? "至少保留 1 MP 才能进入弯道首格" : "仅在 MP 不足以正常入弯时开放")}。`);
  } else if (prompt?.kind === "attack") {
    heading = "超车对抗";
    rule = "可选择暂不超车，保持原位并结束本次移动。发起进攻时掷 D12 并选择 ENG 或 MECH，防守方选择 AERO 或 BRK。进攻高出至少 2 才是干净超车；绝对差值 ≤ 1 时发生轻接触。";
  } else if (prompt?.kind === "defense") {
    heading = "防守对抗";
    rule = "防守可选择 AERO 或 BRK。防守资源可提供 +2，或在对方成功时令其额外消耗 1 MP；平手由防守方保位。";
    if (!prompt.canUseToken && !prompt.hasFreeDefense) blocked.push("强化防守：没有防守标记，也没有本回合免费防守。 ");
  } else if (game.raceControl !== "green") {
    heading = game.raceControl === "red_flag" ? "红旗" : game.raceControl === "vsc" ? "虚拟安全车" : game.raceControlPhase === "sc_restart" ? "安全车重启" : "安全车部署";
    rule = game.raceControl === "vsc" ? "VSC 期间基础 MP 固定为 5，叠加损伤、出站当回合的惩罚与奖励，禁止超车；进站等待减少 1。含触发回合最多两回合，到期回合末滚动恢复绿旗，圈数与位置保留。" : game.raceControl === "sc" ? "SC 期间基础 MP 固定为 5，叠加损伤、出站当回合的惩罚与奖励，禁止超车；含触发回合最多两回合，到期回合末全场滚动恢复绿旗。每车最多收拢 4 格，留至少 3 格间距，不跨圈。" : "红旗立即停止当前回合；各车保留圈数，在自己的所在圈起点附近双列重启，可免费换胎并降低热量，但不修复损伤、不恢复 ERS。";
  } else if (game.yellowFlagSegmentId) {
    heading = "局部黄旗";
    rule = "黄旗只持续事故发生回合的剩余部分，并作用于事故赛段：禁止超车，该赛段相关加速能力暂不生效。";
  } else if (game.phase === "finished") {
    heading = "比赛分类";
    rule = "首车冲线时冻结全场进度；5/10/20 秒罚时分别退 2/4/10 格，累加后重排并按新排名给分。同进度沿用快照顺序；DNF 排在有效车辆之后。";
  }

  const content = <>
      <div className="control-status">
        <span><small>TRACK</small><strong className={game.raceControl === "red_flag" ? "red-text" : game.raceControl !== "green" || game.yellowFlagSegmentId ? "yellow-text" : "green-text"}>{game.raceControl === "red_flag" ? "RED" : game.raceControl === "vsc" ? "VSC" : game.raceControl === "sc" ? "SC" : game.yellowFlagSegmentId ? "YELLOW" : "GREEN"}</strong></span>
        <span><small>SURFACE</small><strong>{wet ? "WET" : "DRY"}</strong></span>
        <span><small>DRS · LOCAL</small><strong className={drsAvailable ? "green-text" : "red-text"}>{drsAvailable ? "ACTIVE" : drsBlocked ? "OFF" : "NO GAP"}</strong></span>
      </div>
      {game.weatherMode === "dynamic" && game.weather && <div className="weather-probability"><span>下一回合</span>{weatherForecast(game.weather).map((item) => <strong key={item.weather}>{WEATHER_LABELS[item.weather]} {Math.round(item.chance * 100)}%</strong>)}</div>}
      <label className="rule-reference-picker">规则速查<select value={referenceId} onChange={(event) => setReferenceId(event.target.value)}><option value="current">当前决策 · {heading}</option>{RACE_RULE_REFERENCE.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <article className="context-rule"><h3>{reference?.title ?? heading}</h3>{reference ? reference.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>) : <p>{rule}</p>}</article>
      {reference && <button type="button" className="rule-return-current" onClick={() => setReferenceId("current")}>返回当前决策规则</button>}
      {blocked.length > 0 && <div className="blocked-rules"><strong>为什么有选项不可用</strong>{blocked.map((item) => <p key={item}>{item}</p>)}</div>}
  </>;
  if (embedded) return <section className="race-control-content">{content}</section>;
  return (
    <details className="race-control-dock">
      <summary><span>RACE CONTROL</span><strong>赛事控制与规则</strong><i>展开</i></summary>
      {content}
    </details>
  );
}

function RaceOrder({ game, selectedDriverId, onSelect }: { game: GameState; selectedDriverId: string | null; onSelect: (driverId: string | null) => void }) {
  const ordered = game.drivers.slice().sort((a, b) => {
    if (game.phase === "finished") return (game.results.find(result => result.driverId === a.id)?.rank ?? 99) - (game.results.find(result => result.driverId === b.id)?.rank ?? 99);
    if (a.status === "finished" && b.status === "finished") return (a.finishOrder ?? 99) - (b.finishOrder ?? 99);
    if (a.status === "finished") return -1;
    if (b.status === "finished") return 1;
    if (a.status === "classified" && b.status === "classified") return (a.finishOrder ?? 99) - (b.finishOrder ?? 99);
    if (a.status === "classified") return -1;
    if (b.status === "classified") return 1;
    if (a.status === "dnf" && b.status !== "dnf") return 1;
    if (b.status === "dnf" && a.status !== "dnf") return -1;
    return b.progress - a.progress;
  });
  const leaderProgress = ordered.find((driver) => driver.status !== "dnf")?.progress ?? 0;
  return (
    <section className="order-rail panel-cut">
      <div className="rail-title"><span>{game.phase === "finished" ? "最终排名" : "赛道顺序"}</span><strong>{game.phase === "finished" ? "罚时已结算" : `${game.drivers.filter((driver) => driver.status === "racing").length} 车在赛`}</strong></div>
      <div className="order-items">
        {ordered.map((driver, index) => {
          const sessionLaps = game.sessionLaps ?? game.track.laps;
          const lap = driver.progress < 0 ? 0 : Math.min(sessionLaps, Math.floor(driver.progress / game.track.totalLength) + 1);
          const gap = Math.max(0, leaderProgress - driver.progress);
          const raceResult = game.phase === "finished" ? game.results.find(result => result.driverId === driver.id) : undefined;
          const penaltySeconds = raceResult?.penaltySeconds ?? (game.phase === "finished" ? 0 : racePenaltyTotals(driver).seconds);
          return (
            <button type="button" aria-pressed={selectedDriverId === driver.id} onClick={() => onSelect(selectedDriverId === driver.id ? null : driver.id)} className={`order-item ${driver.isHuman ? "player" : ""} ${driver.status} ${selectedDriverId === driver.id ? "selected" : ""}`} key={driver.id} style={{ "--order-progress": `${Math.max(0, Math.min(100, driver.progress / (sessionLaps * game.track.totalLength) * 100))}%` } as React.CSSProperties}>
              <span className="order-pos">{index + 1}</span>
              <CarBadge driver={driver} />
              <span className="order-name">{driver.profile.name}<small>{driver.status === "dnf" ? "DNF" : game.phase === "finished" ? `赛道 P${raceResult?.onTrackRank ?? index + 1}${penaltySeconds ? ` · 罚时 ${penaltySeconds} 秒` : ""}` : `L${lap} · ${gap === 0 ? "LEADER" : `+${gap} 格`}${penaltySeconds ? ` · 罚时 ${penaltySeconds} 秒` : ""}`}</small></span>
              {driver.isHuman && <span className="order-condition">{driver.pit ? "维修中" : `${TIRE_LABELS[driver.tire]} ${driver.wear}/12 · 热 ${driver.heat}`}</span>}
              <i className="order-progress" aria-hidden="true"><b /></i>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RaceProgressRail({ game, selectedDriverId, onSelect }: { game: GameState; selectedDriverId: string | null; onSelect: (driverId: string | null) => void }) {
  const sessionLaps = game.sessionLaps ?? game.track.laps;
  const total = sessionLaps * game.track.totalLength;
  return <div className="race-progress-rail" aria-label="全赛程车辆进度">
    <span className="progress-start">START</span>
    <div className="race-progress-lane">
      {Array.from({ length: sessionLaps - 1 }, (_, index) => <i className="lap-marker" key={index} style={{ left: `${(index + 1) / sessionLaps * 100}%` }} />)}
      {game.drivers.filter((driver) => driver.status !== "dnf").map((driver, index) => <button type="button" key={driver.id} className={`race-progress-car ${driver.isHuman ? "player" : ""} ${selectedDriverId === driver.id ? "selected" : ""}`} style={{ "--progress": `${Math.max(0, Math.min(100, driver.progress / total * 100))}%`, "--car-color": driver.profile.color, "--stack-offset": index % 2 ? "2px" : "-6px" } as React.CSSProperties} onClick={() => onSelect(selectedDriverId === driver.id ? null : driver.id)} title={`${driver.profile.name} · ${Math.max(0, driver.progress)}/${total} 格`} aria-label={`查看 ${driver.profile.name}，赛程进度 ${Math.max(0, driver.progress)}/${total} 格`}><span>{driver.profile.abbreviation}</span></button>)}
    </div>
    <span className="progress-finish">FINISH</span>
  </div>;
}

function RaceHeader({ game }: { game: GameState }) {
  const leader = game.drivers.filter((driver) => driver.status === "racing").sort((a, b) => b.progress - a.progress)[0];
  const activeDriver = game.drivers.find((driver) => driver.id === game.movement?.activeDriverId) ?? game.drivers.find((driver) => driver.id === game.humanDriverId);
  const activeLocation = activeDriver && activeDriver.progress >= 0 ? getSegmentAtCell(game, getCellIndex(game, activeDriver)) : undefined;
  const sessionLaps = game.sessionLaps ?? game.track.laps;
  const lap = leader ? Math.min(sessionLaps, Math.max(1, Math.floor(Math.max(0, leader.progress) / game.track.totalLength) + 1)) : sessionLaps;
  const wet = game.weather === "heavy_rain" || game.weather === "light_rain";
  const drsEnabled = Boolean(activeDriver && calculateMpBreakdown(game, activeDriver, DEFAULT_PLAN).drs);
  const drsBlocked = wet || game.raceControl !== "green" || Boolean(game.yellowFlagSegmentId && activeLocation?.segment.id === game.yellowFlagSegmentId);
  return (
    <section className="race-header">
      <div className="round-cell"><span>TURN</span><strong>{String(game.round).padStart(2, "0")}</strong></div>
      <div className="lap-cell"><span>{game.raceSession === "sprint" ? "SPRINT DISTANCE" : "RACE DISTANCE"}</span><strong>LAP {lap}<small> / {sessionLaps}</small></strong></div>
      <div className="surface-cell"><span>TRACK SURFACE</span><strong>{game.weather ? `${WEATHER_LABELS[game.weather]} · ${wet ? "WET" : "DRY"}` : "—"}</strong></div>
      <div className={drsEnabled ? "status-green" : "status-red"}><span>DRS · 当前车辆</span><strong>{drsEnabled ? "ACTIVE" : drsBlocked ? "DISABLED" : "OUT OF RANGE"}</strong></div>
      <div className={game.raceControl === "red_flag" ? "status-red" : game.raceControl !== "green" || game.yellowFlagSegmentId ? "yellow-flag" : "status-green"}><span>赛道状态</span><strong>{game.raceControl === "red_flag" ? "RED FLAG · 比赛暂停" : game.raceControl === "vsc" ? "VSC · 全场限速禁超" : game.raceControl === "sc" ? `${game.raceControlPhase === "sc_restart" ? "SC RESTART" : "SAFETY CAR"} · 全场禁超` : game.yellowFlagSegmentId ? "黄旗 · 该赛段禁超车" : "绿旗 · 正常比赛"}</strong>{game.yellowFlagSegmentId && <small>{game.track.segments.find((segment) => segment.id === game.yellowFlagSegmentId)?.name}</small>}</div>
    </section>
  );
}

function TrackBoard({ game, selectedDriverId, onSelect }: { game: GameState; selectedDriverId: string | null; onSelect: (driverId: string | null) => void }) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverDrag = useRef<{ pointerId: number; offsetX: number; offsetY: number; shellLeft: number; shellTop: number; maxLeft: number; maxTop: number } | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const [viewMode, setViewMode] = useState<"iso" | "top">("iso");
  const [showLabels, setShowLabels] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setFocused(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [focused]);
  const gridCars = game.drivers.filter((driver) => driver.status === "racing" && driver.progress < 0);
  const pitCars = game.drivers.filter((driver) => driver.pit);
  const activeDriverId = game.movement?.activeDriverId;
  const selected = game.drivers.find((driver) => driver.id === selectedDriverId);
  const points = game.track.mapPoints ?? TRACKS[0].mapPoints;
  const startingGridPoints = game.drivers.map((driver) => startingGridPoint(points, driver.lane, driver.qualifyingRank));
  const mapBounds = [...points, ...startingGridPoints];
  const mapMinX = Math.min(...mapBounds.map((point) => point[0]));
  const mapMaxX = Math.max(...mapBounds.map((point) => point[0]));
  const mapMinY = Math.min(...mapBounds.map((point) => point[1]));
  const mapMaxY = Math.max(...mapBounds.map((point) => point[1]));
  const mapViewBox = `${mapMinX - 54} ${mapMinY - 61} ${mapMaxX - mapMinX + 108} ${mapMaxY - mapMinY + 122}`;
  const pitEntry = points[game.track.pitEntryCell];
  const pitExit = points[game.track.pitExitCell];
  const pitControl: [number, number] = [mapMinX - 38, Math.max(pitEntry[1], pitExit[1]) + 30];
  const segmentStarts = game.track.segments.map((_, index) => game.track.segments.slice(0, index).reduce((sum, item) => sum + item.length, 0));
  const segmentAt = (cell: number) => game.track.segments.find((segment, index) => cell >= segmentStarts[index] && cell < segmentStarts[index] + segment.length)!;
  const carsOnCircuit = game.drivers.filter((driver) => driver.status === "racing" && !driver.pit && driver.progress >= 0);
  const visibleCars = game.drivers.filter((driver) => driver.status === "racing" && !driver.pit);
  const activeDriver = game.drivers.find((driver) => driver.id === activeDriverId);
  const activeCell = activeDriver && activeDriver.progress >= 0 && !activeDriver.pit ? getCellIndex(game, activeDriver) : null;
  const wetTrack = game.weather === "heavy_rain" || game.weather === "light_rain";
  const activeMode = activeDriver ? game.plans[activeDriver.id]?.mode ?? "balanced" : "balanced";
  const signalColor = raceSignalColor(game);
  const lanePolyline = (lane: "left" | "right") => `${points.map((_, cell) => lanePoint(points, cell, lane).join(",")).join(" ")} ${lanePoint(points, 0, lane).join(",")}`;
  const activeRoute = activeCell !== null && activeDriver ? {
    current: lanePoint(points, activeCell, activeDriver.lane),
    next: lanePoint(points, (activeCell + 1) % points.length, activeDriver.lane),
  } : null;
  const selectDriver = (driverId: string) => {
    onSelect(driverId);
    setPopoverPosition(null);
  };
  const beginPopoverDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button") || !popoverRef.current) return;
    const shell = popoverRef.current.closest(".circuit-shell");
    if (!(shell instanceof HTMLElement)) return;
    const popoverRect = popoverRef.current.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    popoverDrag.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - popoverRect.left,
      offsetY: event.clientY - popoverRect.top,
      shellLeft: shellRect.left,
      shellTop: shellRect.top,
      maxLeft: Math.max(8, shellRect.width - popoverRect.width - 8),
      maxTop: Math.max(8, shellRect.height - popoverRect.height - 8),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePopover = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = popoverDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPopoverPosition({
      left: Math.max(8, Math.min(drag.maxLeft, event.clientX - drag.shellLeft - drag.offsetX)),
      top: Math.max(8, Math.min(drag.maxTop, event.clientY - drag.shellTop - drag.offsetY)),
    });
  };
  const endPopoverDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (popoverDrag.current?.pointerId === event.pointerId) popoverDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const tiltScene = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || viewMode === "top") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - .5;
    const y = (event.clientY - rect.top) / rect.height - .5;
    event.currentTarget.style.setProperty("--scene-rotate-x", `${15 - y * 7}deg`);
    event.currentTarget.style.setProperty("--scene-rotate-z", `${-1.5 + x * 3}deg`);
    event.currentTarget.style.setProperty("--scene-shift-x", `${x * 10}px`);
  };
  const resetScene = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.removeProperty("--scene-rotate-x");
    event.currentTarget.style.removeProperty("--scene-rotate-z");
    event.currentTarget.style.removeProperty("--scene-shift-x");
  };
  return (
    <section className={`track-panel view-${viewMode} ${wetTrack ? "wet" : "dry"} ${game.yellowFlagSegmentId ? "under-yellow" : ""} control-${game.raceControl} mode-${activeMode} ${focused ? "focused" : ""}`} style={{ "--signal-accent": signalColor } as React.CSSProperties}>
      <div className="track-toolbar">
        <div className="section-heading track-heading">
          <div><p className="section-kicker">CIRCUIT MAP</p><h2>{game.track.name}</h2></div>
        </div>
        <div className="track-camera" aria-label="赛道视图控制">
        <button type="button" aria-pressed={viewMode === "iso"} className={viewMode === "iso" ? "active" : ""} onClick={() => setViewMode("iso")}>立体</button>
        <button type="button" aria-pressed={viewMode === "top"} className={viewMode === "top" ? "active" : ""} onClick={() => setViewMode("top")}>俯视</button>
        <button type="button" aria-pressed={showLabels} className={showLabels ? "active" : ""} onClick={() => setShowLabels((value) => !value)}>赛段名</button>
        <button type="button" aria-label="缩小赛道" onClick={() => setZoom((value) => Math.max(.82, value - .09))}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="放大赛道" onClick={() => setZoom((value) => Math.min(1.27, value + .09))}>+</button>
        <button type="button" aria-pressed={focused} className={focused ? "active" : ""} onClick={() => setFocused((value) => !value)}>{focused ? "退出" : "全屏"}</button>
        </div>
      </div>
      <div className={`circuit-shell view-${viewMode}`} style={{ "--scene-zoom": zoom } as React.CSSProperties} onPointerMove={tiltScene} onPointerLeave={resetScene}>
        <svg className="circuit-map" viewBox={mapViewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`闭合赛道地图，箭头指示前进方向，含 ${game.track.totalLength} 个格位、双线路与维修道`}>
          <defs>
            <filter id="carGlow"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          <g className="circuit-depth-stack" aria-hidden="true">{[26, 20, 14, 8].map((offset) => <polyline key={offset} className="circuit-depth-layer" transform={`translate(0 ${offset})`} points={`${points.map((point) => point.join(",")).join(" ")} ${points[0].join(",")}`} />)}</g>
          <polyline className="circuit-bed" points={`${points.map((point) => point.join(",")).join(" ")} ${points[0].join(",")}`} />
          <polyline className="circuit-flow" pathLength="1" points={`${points.map((point) => point.join(",")).join(" ")} ${points[0].join(",")}`} />
           {points.map((point, cell) => {
            const next = points[(cell + 1) % points.length];
            const segment = segmentAt(cell);
            const yellow = game.yellowFlagSegmentId === segment.id;
             return <line key={`sector-${cell}`} className={`circuit-sector ${segment.type} ${isDrsCell(game.track, cell) ? "drs" : ""} ${yellow ? "yellow" : ""} ${activeCell === cell ? "active" : ""}`} x1={point[0]} y1={point[1]} x2={next[0]} y2={next[1]} />;
           })}
           <polyline className="circuit-lane lane-inner" points={lanePolyline("left")} />
           <polyline className="circuit-lane lane-outer" points={lanePolyline("right")} />
          <path className="pit-path" d={`M ${pitEntry[0]} ${pitEntry[1]} Q ${pitControl[0]} ${pitControl[1]} ${pitExit[0]} ${pitExit[1]}`} />
          <text className="pit-label" x={pitControl[0] + 9} y={pitControl[1] - 7}>PIT</text>
          {Array.from({ length: 4 }, (_, index) => Math.min(points.length - 1, Math.floor(points.length * (index + 1) / 5))).map((cell) => {
            const point = points[cell];
            const next = points[(cell + 1) % points.length];
            const angle = Math.atan2(next[1] - point[1], next[0] - point[0]) * 180 / Math.PI;
            return <g className="direction-marker" key={`direction-${cell}`} transform={`translate(${(point[0] + next[0]) / 2} ${(point[1] + next[1]) / 2}) rotate(${angle})`} aria-hidden="true"><path d="M-8-5L-1 0L-8 5M0-5L7 0L0 5" /></g>;
          })}
          {points.map((point, cell) => {
            const segment = segmentAt(cell);
            return <g className={`circuit-cell ${activeCell === cell ? "active" : ""}`} key={`cell-${cell}`}><circle cx={point[0]} cy={point[1]} r="8" /><text x={point[0]} y={point[1] + 3}>{cell + 1}</text><title>{`${segment.name} · ${segment.type === "corner" ? `弯角 ${segment.cornerCost}` : segment.drs ? "DRS 直道" : "直道"}`}</title></g>;
          })}
          <g className="start-line" transform={`translate(${points[0][0]} ${points[0][1]}) rotate(90)`}><line x1="-17" y1="0" x2="17" y2="0" /><text x="21" y="4">START</text></g>
          {showLabels && <g className="segment-caption">{game.track.segments.map((segment, index) => { const cell = segmentStarts[index] + Math.floor(segment.length / 2); const point = points[cell]; return <text key={segment.id} x={point[0]} y={point[1] - 29}>{segment.name}{segment.type === "corner" ? ` · COST ${segment.cornerCost}` : segment.drs ? " · DRS" : ""}</text>; })}</g>}
           {activeRoute && <g className="active-route" aria-hidden="true"><line x1={activeRoute.current[0]} y1={activeRoute.current[1]} x2={activeRoute.next[0]} y2={activeRoute.next[1]} /><circle cx={activeRoute.next[0]} cy={activeRoute.next[1]} r="12" /></g>}
          {visibleCars.map((driver) => {
            const onGrid = driver.progress < 0;
            const cell = onGrid ? 0 : getCellIndex(game, driver);
            const nextPoint = points[(cell + 1) % points.length];
            const peers = onGrid ? [] : carsOnCircuit.filter((other) => other.id !== driver.id && getCellIndex(game, other) === cell && other.lane === driver.lane);
            const stack = peers.filter((other) => other.id < driver.id).length;
            const [x, y] = onGrid
              ? startingGridPoint(points, driver.lane, driver.qualifyingRank)
              : lanePoint(points, cell, driver.lane, stack);
            const directionStart = onGrid ? points[points.length - 1] : points[cell];
            const directionEnd = onGrid ? points[0] : nextPoint;
            const angle = Math.atan2(directionEnd[1] - directionStart[1], directionEnd[0] - directionStart[0]) * 180 / Math.PI;
            const isActive = activeDriverId === driver.id;
            return (
              <MovingVehicle key={driver.id} x={x} y={y} angle={angle} label={`查看 ${driver.profile.name}`} className={`map-car ${driver.isHuman ? "player" : ""} ${isActive ? "active" : ""} ${selectedDriverId === driver.id ? "selected" : ""}`} onSelect={() => selectDriver(driver.id)}>
                {isActive && <circle className="active-ring" r="25" />}
                {isActive && <g className="velocity-trail" aria-hidden="true"><line x1="-66" y1="-5" x2="-21" y2="-5" /><line x1="-52" y1="0" x2="-21" y2="0" /><line x1="-73" y1="5" x2="-21" y2="5" /></g>}
                <MapCarGlyph color={driver.profile.color} abbreviation={driver.profile.abbreviation} />
                <title>{onGrid
                  ? `${driver.profile.name} · 发车位 P${driver.qualifyingRank} · ${driver.lane === "left" ? "内/左线" : "外/右线"}`
                  : `${driver.profile.name} · 第 ${Math.floor(driver.progress / game.track.totalLength) + 1} 圈 · ${driver.lane === "left" ? "内/左线" : "外/右线"}`}</title>
              </MovingVehicle>
            );
          })}
        </svg>
        {selected && <div ref={popoverRef} style={popoverPosition ? { left: popoverPosition.left, top: popoverPosition.top, right: "auto" } : undefined} className={`track-popover ${selected.isHuman ? "player-private" : "rival-public"}`}><div className="track-popover-head" onPointerDown={beginPopoverDrag} onPointerMove={movePopover} onPointerUp={endPopoverDrag} onPointerCancel={endPopoverDrag}><CarBadge driver={selected} /><strong>{selected.profile.name}</strong><i>拖动</i><button onClick={() => onSelect(null)} aria-label="关闭车辆详情">×</button></div><p>{selected.status === "racing" ? `第 ${Math.max(1, Math.floor(Math.max(0, selected.progress) / game.track.totalLength) + 1)} 圈 · ${selected.progress < 0 ? "发车区" : `${getCellIndex(game, selected) + 1} 格`} · ${selected.lane === "left" ? "内/左线" : "外/右线"}` : selected.status.toUpperCase()}</p>{selected.isHuman ? <span>{TIRE_LABELS[selected.tire]} · 磨损 {selected.wear}/12 · 热量 {selected.heat}/6 · ERS {selected.ers}/{ersCapacity(selected)}</span> : <span className="privacy-label">车辆状态情报请询问工程师无线电。</span>}</div>}
      </div>
      <div className="track-footer">
        <div className="circuit-legend">
          <span><i className={`legend-line drs ${wetTrack || game.raceControl !== "green" ? "disabled" : ""}`} />{wetTrack || game.raceControl !== "green" ? "DRS 关闭" : "DRS 区"}</span><span><i className="legend-line lane" />双线路</span><span><i className="legend-line corner" />弯道</span>{game.yellowFlagSegmentId && <span><i className="legend-line yellow" />黄旗赛段</span>}<span><i className="legend-car" />当前行动</span>
        </div>
        <div className="pit-lane">{gridCars.length > 0 ? <><strong>发车区</strong><span>{gridCars.length} 车</span></> : <><strong>维修道状态</strong>{pitCars.length ? pitCars.map((driver) => <CarBadge key={driver.id} driver={driver} />) : <span>CLEAR</span>}</>}</div>
      </div>
    </section>
  );
}

function CarBadge({ driver }: { driver: DriverState }) {
  return <span className="car-badge" title={driver.profile.name} style={{ backgroundColor: driver.profile.color }}>{driver.profile.abbreviation}</span>;
}

function MapCarGlyph({ color, abbreviation }: { color: string; abbreviation: string }) {
  return (
    <g className="map-car-glyph">
      <rect className="map-car-wheel" x="-11" y="-10" width="8" height="5" />
      <rect className="map-car-wheel" x="-11" y="5" width="8" height="5" />
      <rect className="map-car-wheel" x="7" y="-8" width="7" height="4" />
      <rect className="map-car-wheel" x="7" y="4" width="7" height="4" />
      <rect className="map-car-wing" x="-17" y="-9" width="4" height="18" fill={color} />
      <path className="map-car-body" d="M-13-5h8l4-4h7l3 5 10 2v4L9 4 6 9h-7l-4-4h-8l-3-3v-4z" fill={color} />
      <rect className="map-car-wing" x="17" y="-7" width="3" height="14" fill={color} />
      <text className="map-car-code" x="0" y="2.5">{abbreviation}</text>
    </g>
  );
}

function StrategyPanel({ driver, game, narrative, onDispatch }: { driver: DriverState; game: GameState; narrative?: RaceNarrative; onDispatch: (command: GameCommand) => void }) {
  const [plan, setPlan] = useState<TurnPlan>(() => {
    const draft = loadNarratives()[game.id]?.draft;
    if (draft?.round === game.round && (draft.raceSession ?? "race") === (game.raceSession ?? "race")) return draft.plan;
    return {
    ...DEFAULT_PLAN,
    pitTire: driver.tire,
    pit: driver.heavyDamage || driver.wear >= 9,
    };
  });
  useEffect(() => {
    const stored = loadNarratives()[game.id];
    if (stored) saveNarrative({ ...stored, draft: { round: game.round, raceSession: game.raceSession ?? "race", plan } });
  }, [game.id, game.round, game.raceSession, plan]);
  const mp = calculateMpBreakdown(game, driver, plan);
  const talentActions = availableTalentActions(driver.profile).filter((action) => !driver.careerUses?.talentActions.includes(action));
  const swapRemaining = Math.max(0, tokenSwapAllowance(driver.profile) - (driver.careerUses?.tokenSwaps ?? 0));
  const coolingAmount = hasMinorTalent(driver.profile, "cooling_skill") ? 3 : 2;
  const neutralized = game.raceControl === "vsc" || game.raceControl === "sc";
  const liveRank = game.drivers.slice().sort((a, b) => b.progress - a.progress || a.qualifyingRank - b.qualifyingRank).findIndex((item) => item.id === driver.id) + 1;
  const nextHeat = Math.min(6, Math.max(0, driver.heat - (plan.useCooling ? coolingAmount : 0)) + (!neutralized && plan.mode === "attack" ? 1 + Number(driver.burdens.includes("high_heat")) : 0) + (!neutralized && plan.deployErs && driver.ers > 0 && driver.powerPenaltyRounds === 0 ? 1 + Number(driver.profile.stats.eng >= 4) : 0));
  const mpParts = [
    ["模式", mp.mode], ["ENG", mp.engine], ["车队", mp.teamEngine], ["发车", mp.launch], ["专精", mp.specialization], ["训练", mp.preparation], ["ERS", mp.ers + mp.ersStraight],
    ["尾流", mp.slipstream], ["DRS", mp.drs], ["软胎", mp.softTire],
    ["磨损", mp.wear], ["重伤", mp.heavyDamage], ["动力", mp.powerLoss], ["进站慢", mp.slowPit], ["出站奖励", mp.pitExit], ["黄旗", mp.yellowFlag], ["调校", mp.setup],
  ] as const;
  return (
    <section className="panel action-panel strategy-panel">
      <div className="strategy-fields">
      <p className="section-kicker">第 {game.round} 回合</p>
      <h2>锁定策略</h2>
      <TeamRadioPanel game={game} narrative={narrative} onAdopt={patch => setPlan(current => ({ ...current, ...patch }))} />
      <fieldset className="mode-switch">
        <legend>发动机模式</legend>
        {MODE_KEYS.map((mode) => <button type="button" key={mode} disabled={neutralized && mode !== "balanced"} aria-pressed={plan.mode === mode} className={plan.mode === mode ? "active" : ""} onClick={() => setPlan({ ...plan, mode })}><span>{MODE_LABELS[mode]}</span><small>{neutralized ? mode === "balanced" ? "赛事控制 · 基础 MP 5" : "VSC/SC 不应用模式" : mode === "save" ? "MP +0 · 不增热" : mode === "balanced" ? "MP +1 · 标准" : "MP +2 · 热量 +1"}</small></button>)}
      </fieldset>
      <div className={`strategy-forecast ${nextHeat >= 5 ? "heat-warning" : ""}`} aria-live="polite">
        <div><span><small>预计 MP</small><strong><MetricValue value={mp.total} label="预计 MP" /></strong></span><span><small>预计热量</small><strong><MetricValue value={nextHeat} label="预计热量" /><i>/6</i></strong></span></div>
        <p>6 基础 {mpParts.filter(([, value]) => value !== 0).map(([label, value]) => `${value > 0 ? "+" : ""}${value} ${label}`).join(" · ") || "· 无修正"}</p>
      </div>
      <div className="toggle-list">
        <label><input type="checkbox" checked={plan.deployErs} disabled={neutralized || driver.ers <= 0 || driver.powerPenaltyRounds > 0} onChange={(event) => setPlan({ ...plan, deployErs: event.target.checked })} /><span><strong>部署 ERS</strong><small>{neutralized ? "不可用：VSC/SC 期间禁止部署 ERS。" : driver.powerPenaltyRounds > 0 ? "不可用：动力故障期间禁止部署 ERS。" : driver.ers <= 0 ? "不可用：当前 ERS 为 0。" : `当前 ${driver.ers}/${ersCapacity(driver)}；+2 MP，起步位置在直道再 +1`}</small></span></label>
        <label><input type="checkbox" checked={plan.useCooling} disabled={driver.tactical.cooling <= 0} onChange={(event) => setPlan({ ...plan, useCooling: event.target.checked })} /><span><strong>使用冷却</strong><small>{driver.tactical.cooling <= 0 ? `不可用：没有冷却标记；冷却标记可令本回合热量 -${coolingAmount}。` : `标记 ${driver.tactical.cooling}；本回合热量 -${coolingAmount}`}</small></span></label>
        <label><input type="checkbox" checked={plan.pit} onChange={(event) => setPlan({ ...plan, pit: event.target.checked })} /><span><strong>经过入口时维修</strong><small>{driver.heavyDamage ? "重伤要求维修" : driver.wear >= 9 ? "轮胎已进入危险区" : "本回合到达入口才会执行"}</small></span></label>
      </div>
      {(talentActions.length > 0 || swapRemaining > 0) && <div className="round-development-actions">
        {talentActions.length > 0 && <label>本回合培养动作<select value={plan.talentAction ?? ""} onChange={(event) => setPlan({ ...plan, talentAction: event.target.value ? event.target.value as TurnPlan["talentAction"] : undefined })}><option value="">不使用</option>{talentActions.map((action) => <option key={action} value={action}>{TALENT_ACTIONS[action].name}</option>)}</select><small>{plan.talentAction ? TALENT_ACTIONS[plan.talentAction].effect : "本场剩余可声明动作"}</small></label>}
        {swapRemaining > 0 && <div className="token-swap-control"><label className="inline-check"><input type="checkbox" checked={Boolean(plan.tokenSwap)} onChange={(event) => setPlan({ ...plan, tokenSwap: event.target.checked ? { from: "lateBrake", to: "defense" } : undefined })} />战术置换（剩余 {swapRemaining} 次）</label>{plan.tokenSwap && <div><select aria-label="置换来源" value={plan.tokenSwap.from} onChange={(event) => setPlan({ ...plan, tokenSwap: { ...plan.tokenSwap!, from: event.target.value as TacticalResourceId } })}>{(Object.keys(RESOURCE_LABELS) as TacticalResourceId[]).map((resource) => <option key={resource} value={resource}>{RESOURCE_LABELS[resource]}</option>)}</select><span>→</span><select aria-label="置换目标" value={plan.tokenSwap.to} onChange={(event) => setPlan({ ...plan, tokenSwap: { ...plan.tokenSwap!, to: event.target.value as TacticalResourceId } })}>{(Object.keys(RESOURCE_LABELS) as TacticalResourceId[]).map((resource) => <option key={resource} value={resource}>{RESOURCE_LABELS[resource]}</option>)}</select></div>}</div>}
      </div>}
      {plan.pit && (
        <div className="pit-options">
          <label>换用轮胎<select value={plan.pitTire} onChange={(event) => setPlan({ ...plan, pitTire: event.target.value as TireCompound })}>{TIRE_KEYS.map((tire) => <option key={tire} value={tire}>{TIRE_LABELS[tire]}</option>)}</select></label>
          <label className="inline-check"><input type="checkbox" checked={plan.useQuickRepair} disabled={driver.tactical.quickRepair <= 0 || driver.lightDamage <= 0} onChange={(event) => setPlan({ ...plan, useQuickRepair: event.target.checked })} />使用快修移除 1 轻伤（剩余 {driver.tactical.quickRepair}）</label>
        </div>
      )}
      <p className="secret-note">AI 策略会基于当前快照同时锁定，不会读取本回合行动结果。</p>
      {game.objectives && <details className="race-objectives-live"><summary>赛事目标 · {game.objectives.length} 项</summary>{game.objectives.map((objective) => <p key={objective.id}><b>{objective.difficulty} · {objective.points} 分</b><strong>{objective.title}</strong><small>{RACE_OBJECTIVES[objective.id].condition}</small><em>{objectiveProgress(objective.id, driver, liveRank)}</em></p>)}</details>}
      </div>
      <button className="button primary large full" onClick={() => onDispatch({ type: "SUBMIT_STRATEGY", plan })}>提交并运行回合</button>
    </section>
  );
}

function DecisionPanel({ game, onDispatch }: GameProps) {
  const prompt = game.pendingDecision!;
  const decisionDriver = game.drivers.find((driver) => driver.id === prompt.driverId)!;
  const [defenseStat, setDefenseStat] = useState<"aero" | "brk">(() => decisionDriver.profile.stats.aero >= decisionDriver.profile.stats.brk ? "aero" : "brk");
  const opponentId = prompt.kind === "attack" ? prompt.defenderId : prompt.kind === "defense" ? prompt.attackerId : undefined;
  const opponent = game.drivers.find((driver) => driver.id === opponentId);
  return (
    <section className="panel action-panel decision-panel">
      <p className="section-kicker">需要你的决定</p>
      {prompt.kind === "corner" && (
        <>
          <h2>{prompt.segmentName}</h2>
          <p>弯角值 {prompt.baseCost}。理想线减免 2 MP，晚刹仅在 MP 不足时可用。</p>
          <div className="eligibility-readout">
            <span>剩余 MP <strong>{prompt.remainingMp}</strong></span>
            <span className={prompt.canIdeal ? "available" : "blocked"}>
              {prompt.canIdeal ? "理想线可用" : `理想线不可用：${prompt.idealReason}`}
            </span>
          </div>
          <div className="decision-buttons">
            <button className="button secondary decision-option" disabled={!prompt.canNormal} onClick={() => onDispatch({ type: "RESOLVE_CORNER", choice: "normal" })}><strong>外线 · 共 {prompt.baseCost + 1} MP</strong><small>弯角 {prompt.baseCost} + 首格 1{prompt.canNormal ? ` · 入弯后余 ${prompt.remainingMp - prompt.baseCost - 1}` : ` · 当前仅 ${prompt.remainingMp}`}</small></button>
            <button className="button secondary decision-option" disabled={!prompt.canIdeal} onClick={() => onDispatch({ type: "RESOLVE_CORNER", choice: "ideal" })}><strong>理想内线 · 共 {Math.max(0, prompt.baseCost - 2) + 1} MP</strong><small>{prompt.canIdeal ? `弯角 ${Math.max(0, prompt.baseCost - 2)} + 首格 1 · 入弯后余 ${prompt.remainingMp - Math.max(0, prompt.baseCost - 2) - 1}` : prompt.idealReason ?? "当前条件不满足"}</small></button>
            <button className="button warning" disabled={!prompt.canLateBrake} onClick={() => onDispatch({ type: "RESOLVE_CORNER", choice: "late_brake" })}>尝试晚刹</button>
            <button className="button warning" disabled={!prompt.canLateBrake || decisionDriver.tactical.lateBrake <= 0} onClick={() => onDispatch({ type: "RESOLVE_CORNER", choice: "late_brake", useToken: true })}>晚刹 +2 标记（{decisionDriver.tactical.lateBrake}）</button>
            <button className="button ghost" onClick={() => onDispatch({ type: "RESOLVE_CORNER", choice: "stop" })}>停在弯前</button>
          </div>
          {(!prompt.canNormal || !prompt.canIdeal || !prompt.canLateBrake) && <details className="unavailable-rules">
            <summary>为什么有选项不可用</summary>
            {!prompt.canNormal && <p><b>正常外线</b>：规则要求支付弯角 {prompt.baseCost} MP，再支付 1 MP 进入弯道；当前仅 {prompt.remainingMp} MP。</p>}
            {!prompt.canIdeal && <p><b>理想内线</b>：{prompt.idealReason}。规则要求 AERO ≥ 3、弯中无其他车辆，并有足够 MP 支付减免后的弯角与首格。</p>}
            {!prompt.canLateBrake && <p><b>晚刹</b>：{prompt.lateBrakeReason ?? "仅在无法正常支付入弯总消耗且至少还有 1 MP 时可选"}。</p>}
          </details>}
        </>
      )}
      {prompt.kind === "attack" && (
        <>
          <h2>超车进攻</h2><p>目标：{opponent?.profile.name ?? "前车"}。选择进攻属性，或暂不超车。</p>
          <div className="decision-buttons two">
            {(["eng", "mech"] as const).map((stat) => <button key={stat} className="button secondary decision-option" onClick={() => onDispatch({ type: "RESOLVE_ATTACK", stat })}><strong>{stat.toUpperCase()} · {decisionDriver.profile.stats[stat]}</strong><small>D12 + {decisionDriver.profile.stats[stat]} + 适用修正</small></button>)}
          </div>
          <button className="button ghost decision-option full" onClick={() => onDispatch({ type: "SKIP_ATTACK" })}><strong>暂不超车</strong><small>保持原位，结束本次移动 · 不掷骰</small></button>
          <p>进攻高出至少 2：干净超车；差值绝对值 ≤1：接触，平手防守者保位。天赋与设施修正在掷骰日志中逐项结算。</p>
        </>
      )}
      {prompt.kind === "defense" && (
        <>
          <h2>遭遇超车</h2><p>进攻车手：{opponent?.profile.name ?? "后车"}。先选属性，再提交防守方式。</p>
          <div className="defense-stat-switch" role="group" aria-label="防守属性">{(["aero", "brk"] as const).map((stat) => <button type="button" key={stat} aria-pressed={defenseStat === stat} onClick={() => setDefenseStat(stat)}><span>{stat.toUpperCase()}</span><strong>{decisionDriver.profile.stats[stat]}</strong></button>)}</div>
          <p aria-live="polite">基础：D12 + {decisionDriver.profile.stats[defenseStat]}（{defenseStat.toUpperCase()}），另加适用天赋与设施修正。{prompt.hasFreeDefense ? "本回合有免费防守。" : `防守标记剩余 ${decisionDriver.tactical.defense} 枚。`}</p>
          <div className="decision-buttons">
            <button className="button secondary" onClick={() => onDispatch({ type: "RESOLVE_DEFENSE", stat: defenseStat, choice: "none" })}>普通防守</button>
            <button className="button primary" disabled={!prompt.canUseToken && !prompt.hasFreeDefense} onClick={() => onDispatch({ type: "RESOLVE_DEFENSE", stat: defenseStat, choice: "bonus" })}>防守 +2</button>
            <button className="button secondary" disabled={!prompt.canUseToken && !prompt.hasFreeDefense} onClick={() => onDispatch({ type: "RESOLVE_DEFENSE", stat: defenseStat, choice: "extra_mp" })}>迫使多耗 1 MP</button>
          </div>
          {!prompt.canUseToken && !prompt.hasFreeDefense && <details className="unavailable-rules"><summary>为什么强化防守不可用</summary><p><b>强化防守</b>：需要 1 枚防守标记，或由天赋提供本回合免费防守；当前两项都没有。</p></details>}
        </>
      )}
    </section>
  );
}

function ResultPanel({ game, season, onPressResponse, onMediaSettings, onPenaltyReview, onReturnHome, onOpenSocial }: { game: GameState; season?: SeasonState | null; onPressResponse?: (raceId: string, questionId: string, intent: PressResponseIntent) => void; onMediaSettings?: (settings: MediaChannelSettings) => void; onPenaltyReview?: (game: GameState, eventId: number) => void; onReturnHome: () => void; onOpenSocial:()=>void }) {
  const human = game.drivers.find((driver) => driver.id === game.humanDriverId)!;
  const humanResult = game.results.find((result) => result.driverId === human.id)!;
  const stats = human.raceStats ?? {
    cellsMoved: 0, attacks: 0, overtakes: 0, timesOvertaken: 0, defensesWon: 0,
    contacts: 0, pitStops: 0, ersUsed: 0, idealLines: 0, lateBrakes: 0,
    peakHeat: human.heat, peakWear: human.wear,
  };
  const highlights = game.logs.filter((event) => event.type === "incident" || event.type === "result").slice(-5).reverse();
  const penaltyEvents = game.logs.filter((event) => event.code === "dice.penalty" || event.code?.startsWith("penalty"));
  const appealReview = season?.advanced.appealReviews.find((review) => review.raceId === game.id);
  const development = game.sessionMode === "simulation" ? null : applyRaceDevelopment(human.profile, game).reward;
  return (
    <section className="post-race-report">
      <div className="result-hero">
        <span>{game.sessionMode === "simulation" ? "模拟测试结果" : "正式比赛结果"}</span>
        <strong>P{humanResult?.rank ?? "—"}</strong>
        <div><CarBadge driver={human} /><h2>{human.profile.name}</h2><p>{humanResult?.status === "dnf" ? `DNF · ${human.dnfReason ?? "退赛"}` : `${humanResult?.points ?? 0} 分 · ${game.track.name}`}</p></div>
      </div>
      {development && <div className="result-development">
        <div className="debrief-title"><span>赛后培养结算</span><strong>发展进度</strong></div>
        <div><span><small>车手积分</small><strong>+{development.championshipPoints}</strong></span><span><small>车队研发</small><strong>+{development.developmentPoints} RP</strong></span><span><small>等级</small><strong>{development.levelBefore === development.levelAfter ? `Lv${development.levelAfter}` : `Lv${development.levelBefore} → Lv${development.levelAfter}`}</strong></span></div>
      </div>}
      {game.objectives && <div className="objective-results">
        <div className="debrief-title"><span>{game.objectives.reduce((sum, objective) => sum + (objective.awardedPoints ?? (objective.completed ? objective.points : 0)), 0)} VP</span><strong>赛事目标</strong></div>
        {game.objectives.map((objective) => <p className={objective.completed ? "complete" : "failed"} key={objective.id}><i>{objective.completed ? "完成" : "未完成"}</i><strong>{objective.title}</strong><span>{RACE_OBJECTIVES[objective.id].condition}</span><b>{objective.completed ? `+${objective.awardedPoints ?? objective.points}` : "0"}</b></p>)}
      </div>}
      <div className="driver-debrief">
        <div className="debrief-title"><span>{humanResult?.status === "dnf" ? "DNF" : `P${humanResult?.rank ?? "—"}`} · {humanResult?.points ?? 0} 分</span><strong>车手数据</strong></div>
        <div className="debrief-metrics">
          <span><small>前进</small><strong>{stats.cellsMoved}</strong><i>格</i></span>
          <span><small>超车</small><strong>{stats.overtakes}</strong><i>次</i></span>
          <span><small>防守成功</small><strong>{stats.defensesWon}</strong><i>次</i></span>
          <span><small>进站</small><strong>{stats.pitStops}</strong><i>次</i></span>
          <span><small>ERS 部署</small><strong>{stats.ersUsed}</strong><i>次</i></span>
          <span><small>理想线</small><strong>{stats.idealLines}</strong><i>次</i></span>
          <span><small>晚刹</small><strong>{stats.lateBrakes}</strong><i>次</i></span>
          <span><small>接触</small><strong>{stats.contacts}</strong><i>次</i></span>
        </div>
        <div className="debrief-pressure">
          <span><small>峰值赛车热量</small><b style={{ width: `${stats.peakHeat / 6 * 100}%` }} /><strong>{stats.peakHeat}/6</strong></span>
          <span><small>峰值轮胎磨损</small><b style={{ width: `${stats.peakWear / 12 * 100}%` }} /><strong>{stats.peakWear}/12</strong></span>
        </div>
      </div>
      <div className="result-classification">
        <div className="debrief-title"><span>{game.results.length} 辆车 · 第 {game.round} 回合结束</span><strong>最终排名</strong></div>
        {game.results.map((result) => {
          const driver = game.drivers.find((item) => item.id === result.driverId)!;
          const seconds = result.penaltySeconds ?? 0;
          const cells = result.penaltyCells ?? 0;
          const legacyPenalty = result.penaltySeconds === undefined && driver.penalties.vp ? ` · 旧赛制扣 ${driver.penalties.vp} 分` : "";
          return <div className={`result-row ${driver.isHuman ? "player" : ""}`} key={result.driverId}><span className="rank">P{result.rank}</span><CarBadge driver={driver} /><span className="grow"><strong>{driver.profile.name}</strong><small>{result.status === "dnf" ? `DNF · ${driver.dnfReason ?? "退赛"}` : `${result.status === "classified" ? "已分类" : "冲线"}${seconds ? ` · +${seconds} 秒 / 退 ${cells} 格${result.onTrackRank ? ` · 原赛道 P${result.onTrackRank}` : ""}` : legacyPenalty}`}</small></span><strong>{result.points} 分</strong></div>;
        })}
      </div>
      {highlights.length > 0 && <div className="race-highlights"><div className="debrief-title"><span>{highlights.length} 条事故、判罚或进站记录</span><strong>关键事件</strong></div>{highlights.map((event) => <p key={event.id}><span>R{event.round}</span>{event.message}</p>)}</div>}
      {season?.advanced.settings.appeals && penaltyEvents.length > 0 && <section className="appeal-review"><div className="debrief-title"><span>每场一次 · 不自动改写赛果</span><strong>判罚证据复核</strong></div>{appealReview ? <p>{appealReview.summary}</p> : penaltyEvents.map((event) => <button type="button" onClick={() => onPenaltyReview?.(game, event.id)} key={event.id}>复核日志 #{event.id} · R{event.round} · {event.message}</button>)}</section>}
      {season?.mediaArchive.find((bundle) => bundle.raceId === game.id) && <MediaHub defaultOpen allowedTabs={["press"]} bundle={season.mediaArchive.find((bundle) => bundle.raceId === game.id)!} settings={season.mediaSettings} onPressResponse={onPressResponse} onSettingsChange={onMediaSettings} />}
      <EventLog game={game} />
      <button className="button ghost large full" onClick={onOpenSocial}>看看本站赛果、车队复盘与看台讨论</button>
      <button className="button primary large full" onClick={onReturnHome}>结束比赛并返回车库</button>
    </section>
  );
}

function EventLog({ game, embedded = false }: { game: GameState; embedded?: boolean }) {
  const list = <RaceEventLog game={game} />;
  if (embedded) return list;
  return (
    <details className="panel log-panel">
      <summary><strong>比赛日志</strong><span>最近 80 条 · {game.logs.length} 条记录</span></summary>
      {list}
    </details>
  );
}

function RaceRoster({ drivers }: { drivers: DriverState[] }) {
  return <div className="roster">{drivers.map((driver) => <div key={driver.id}><CarBadge driver={driver} /><span><strong>{driver.profile.name}</strong><small>{formatStats(driver.profile.stats)}</small></span></div>)}</div>;
}

function StageHeader({ step, title, description }: { step: string; title: string; description: string }) {
  return <div className="stage-header"><span>{step}</span><div><p className="section-kicker">比赛流程</p><h2>{title}</h2><p>{description}</p></div></div>;
}

function StageTimeline({ active }: { active: 1 | 2 }) {
  return <nav className="stage-timeline" aria-label="比赛准备进度">
    {["创建比赛", "排位赛", "赛前设定", "正赛"].map((label, index) => {
      const step = index;
      return <span className={step < active ? "complete" : step === active ? "active" : ""} key={label}><i>{String(step).padStart(2, "0")}</i><b>{label}</b></span>;
    })}
  </nav>;
}

function OptionCards<T extends string>({ values, selected, onSelect, render }: { values: T[]; selected: T; onSelect: (value: T) => void; render: (value: T) => { title: string; body: string } }) {
  return <div className="option-cards">{values.map((value) => { const content = render(value); return <button type="button" className={selected === value ? "selected" : ""} key={value} onClick={() => onSelect(value)}><strong>{content.title}</strong><small>{content.body}</small></button>; })}</div>;
}

function formatStats(stats: CarStats): string {
  return `ENG ${stats.eng} · AERO ${stats.aero} · MECH ${stats.mech} · BRK ${stats.brk} · REL ${stats.rel}`;
}

function raceSignalColor(game: GameState): string {
  if (game.raceControl === "red_flag") return "#ff2f3d";
  if (game.raceControl === "sc" || game.raceControl === "vsc") return "#ffd447";
  if (game.yellowFlagSegmentId) return "#ffc24a";
  if (game.weather === "heavy_rain" || game.weather === "light_rain") return "#5bd8ff";
  const active = game.drivers.find((driver) => driver.id === game.movement?.activeDriverId);
  if (active && active.heat >= 5) return "#ff9a4c";
  const mode = active ? game.plans[active.id]?.mode : undefined;
  if (mode === "attack") return "#ff5549";
  if (mode === "save") return "#a1bbc1";
  return "#8de9fb";
}

function qualifyingModeText(mode: EngineMode): string {
  if (mode === "save") return "+0，无额外热量";
  if (mode === "balanced") return "+1，无额外热量";
  return "+2，正赛初始热量 +1";
}

interface GameProps {
  game: GameState;
  onDispatch: (command: GameCommand) => void;
}
