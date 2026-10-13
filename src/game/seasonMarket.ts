import { rollSeasonD12 } from "./seasonDevelopment";
import type {
  ContractMarketTeam,
  ContractOffer,
  ContractRole,
  DriverContract,
  GameState,
  ResearchPhilosophyId,
  SeasonPublicAction,
  SeasonState,
  SponsorId,
  SponsorState,
  TalentId,
  TeamProfile,
} from "./types";

export const SPONSORS: Record<SponsorId, Omit<SponsorState, "progress" | "fulfilled" | "evaluated"> & { description: string }> = {
  technical_partner: {
    id: "technical_partner",
    name: "技术合作伙伴",
    accent: "#45d6ff",
    goalKind: "classified_finishes",
    target: 4,
    description: "六站内完成 4 次正式分类。完成后声望 +1。",
  },
  community_foundation: {
    id: "community_foundation",
    name: "社区基金会",
    accent: "#ffcc48",
    goalKind: "clean_finishes",
    target: 3,
    description: "六站内完成 3 场无接触、无判罚正赛。完成后声望 +1。",
  },
  media_network: {
    id: "media_network",
    name: "赛事媒体网络",
    accent: "#ff4c59",
    goalKind: "public_appearances",
    target: 2,
    description: "在站间完成 2 次媒体或赞助活动。完成后声望 +1。",
  },
};

const clampReputation = (value: number) => Math.max(0, Math.min(10, value));

function inferredPhilosophy(team?: TeamProfile): ResearchPhilosophyId {
  if (team?.researchPhilosophy) return team.researchPhilosophy;
  if (!team) return "reliability";
  const order: Array<[keyof TeamProfile["stats"], ResearchPhilosophyId]> = [
    ["eng", "straight_efficiency"], ["aero", "high_downforce"], ["mech", "mechanical_grip"],
    ["brk", "braking_control"], ["rel", "reliability"],
  ];
  return order.sort((left, right) => team.stats[right[0]] - team.stats[left[0]])[0][1];
}

export function contractMarketFromTeams(teams: TeamProfile[], currentTeam?: TeamProfile, roster: Array<{ id: string; teamId?: string; contract?: DriverContract }> = [], humanDriverId?: string): ContractMarketTeam[] {
  const source = teams.length ? teams : currentTeam ? [currentTeam] : [];
  return source.map((team) => {
    const otherDrivers = roster.filter((driver) => driver.id !== humanDriverId && driver.teamId === team.id);
    return {
      teamId: team.id,
      name: team.name,
      abbreviation: team.abbreviation,
      philosophy: inferredPhilosophy(team),
      raceSeatsFilled: otherDrivers.filter((driver) => driver.contract?.role !== "reserve").length,
      reserveSeatsFilled: otherDrivers.filter((driver) => driver.contract?.role === "reserve").length,
    };
  });
}

export function createCurrentContract(teamId: string, teamName: string, season = 1, role: ContractRole = "race"): DriverContract {
  return {
    id: `contract-${season}-${teamId}`,
    teamId,
    teamName,
    role,
    season,
    startsAfterSeason: Math.max(0, season - 1),
    expiresAfterSeason: season,
  };
}

/** Adds M9 fields to a version-1 M6–M8 save without changing the storage key. */
export function migrateSeasonMarket(input: SeasonState, team?: TeamProfile, marketTeams: TeamProfile[] = [], roster: Array<{ id: string; teamId?: string; contract?: DriverContract }> = []): SeasonState {
  const state = structuredClone(input);
  state.seasonNumber ??= 1;
  state.reputation = clampReputation(state.reputation ?? 5);
  const teamId = state.playerTeam?.teamId ?? team?.id ?? "legacy-local-team";
  const teamName = state.playerTeam?.name ?? team?.name ?? "本地车队";
  state.currentContract ??= createCurrentContract(teamId, teamName, state.seasonNumber);
  state.contractMarket ??= team
    ? contractMarketFromTeams([], team)
    : [{ teamId, name: teamName, abbreviation: state.playerTeam?.abbreviation ?? "LOC", philosophy: state.playerTeam?.philosophy ?? "reliability", raceSeatsFilled: 1, reserveSeatsFilled: 0 }];
  state.contractMarket = state.contractMarket.map((entry) => ({ ...entry, raceSeatsFilled: entry.raceSeatsFilled ?? 0, reserveSeatsFilled: entry.reserveSeatsFilled ?? 0 }));
  if (marketTeams.length > 0 && state.contractMarket.length <= 1) state.contractMarket = contractMarketFromTeams(marketTeams, team, roster, state.humanDriverId);
  state.contractOffers ??= [];
  state.publicActionResults ??= [];
  return state;
}

export function selectSeasonSponsor(input: SeasonState, sponsorId: SponsorId): SeasonState {
  if (input.status !== "active" || input.rounds.length > 0) throw new Error("赞助目标只能在赛季首站开始前确定。");
  const state = structuredClone(input);
  const definition = SPONSORS[sponsorId];
  state.sponsor = { ...definition, progress: 0, fulfilled: false, evaluated: false };
  delete (state.sponsor as SponsorState & { description?: string }).description;
  return state;
}

function humanRaceWasClean(game: GameState, humanDriverId: string): boolean {
  const driver = game.drivers.find((item) => item.id === humanDriverId);
  if (!driver) return false;
  const contacts = driver.raceStats?.contacts ?? 0;
  const penalties = (driver.penalties?.time?.length ?? 0) + (driver.penalties?.vp ?? 0) + (driver.penalties?.driveThrough ?? 0);
  return contacts === 0 && penalties === 0;
}

export function updateSponsorFromRace(input: SeasonState, game: GameState): SeasonState {
  const state = structuredClone(input);
  if (!state.sponsor || state.sponsor.evaluated) return state;
  const result = game.results.find((item) => item.driverId === state.humanDriverId);
  let delta = 0;
  if (state.sponsor.goalKind === "classified_finishes" && result && result.status !== "dnf") delta = 1;
  if (state.sponsor.goalKind === "clean_finishes" && result && result.status !== "dnf" && humanRaceWasClean(game, state.humanDriverId)) delta = 1;
  state.sponsor.progress = Math.min(state.sponsor.target, state.sponsor.progress + delta);
  state.sponsor.fulfilled = state.sponsor.progress >= state.sponsor.target;
  return state;
}

export function resolveSeasonPublicAction(input: SeasonState, action: SeasonPublicAction): SeasonState {
  const state = structuredClone(input);
  let roll: number | undefined;
  let modifier: number | undefined;
  let total: number | undefined;
  let reputationDelta = 0;
  let sponsorProgressDelta = 0;
  let message = "本次公共事务不改变声望。";

  if (action === "media") {
    roll = rollSeasonD12(state);
    modifier = state.playerTeam.stats.rel;
    total = roll + modifier;
    if (total >= 10) {
      reputationDelta = 1;
      message = `媒体检定 ${roll} + REL ${modifier} = ${total}：表达清晰，声望 +1。`;
    } else if (total <= 5) {
      reputationDelta = -1;
      message = `媒体检定 ${roll} + REL ${modifier} = ${total}：回应失误，声望 -1。`;
    } else message = `媒体检定 ${roll} + REL ${modifier} = ${total}：未改变声望。`;
  } else if (action === "community") {
    const priorRewards = state.publicActionResults.filter((item) => item.action === "community" && item.reputationDelta > 0).length;
    if (priorRewards < 2) {
      reputationDelta = 1;
      message = "社区活动完成：声望 +1；本赛季此类正收益最多两次。";
    } else message = "社区活动完成：本赛季两次声望收益已经用完。";
  } else if (action === "sponsor") message = "赞助商活动完成。";
  else message = "休息完成：声望与赞助进度不变。";

  if (state.sponsor?.goalKind === "public_appearances" && (action === "media" || action === "sponsor")) {
    const previous = state.sponsor.progress;
    state.sponsor.progress = Math.min(state.sponsor.target, previous + 1);
    sponsorProgressDelta = state.sponsor.progress - previous;
    state.sponsor.fulfilled = state.sponsor.progress >= state.sponsor.target;
  }
  const before = state.reputation;
  state.reputation = clampReputation(state.reputation + reputationDelta);
  reputationDelta = state.reputation - before;
  state.publicActionResults.push({ afterRound: state.currentRound, action, roll, modifier, total, reputationDelta, sponsorProgressDelta, message });
  return state;
}

export function seasonPerformanceModifier(state: SeasonState): number {
  const ordered = state.standings.slice().sort((left, right) => right.championshipPoints - left.championshipPoints || left.name.localeCompare(right.name, "zh-CN"));
  const rank = ordered.findIndex((standing) => standing.driverId === state.humanDriverId) + 1;
  if (rank <= 0) return -2;
  if (rank === 1) return 3;
  if (rank <= Math.ceil(ordered.length / 2)) return 2;
  if (rank <= Math.ceil(ordered.length * 0.75)) return 0;
  return -1;
}

export function contractFit(philosophy: ResearchPhilosophyId, talent?: TalentId): -1 | 0 | 1 {
  const matches: Partial<Record<ResearchPhilosophyId, TalentId[]>> = {
    straight_efficiency: ["overtake_maniac"],
    high_downforce: ["wide_train"],
    mechanical_grip: ["tire_whisperer", "rain_master"],
    braking_control: ["late_braker"],
    reliability: ["strategist"],
  };
  if (talent && matches[philosophy]?.includes(talent)) return 1;
  const opposites: Partial<Record<ResearchPhilosophyId, TalentId[]>> = {
    straight_efficiency: ["wide_train"], high_downforce: ["overtake_maniac"],
    mechanical_grip: ["late_braker"], braking_control: ["tire_whisperer"], reliability: ["overtake_maniac"],
  };
  return talent && opposites[philosophy]?.includes(talent) ? -1 : 0;
}

export function roleForContractTotal(total: number): ContractRole | undefined {
  if (total >= 16) return "primary";
  if (total >= 13) return "race";
  if (total >= 10) return "reserve";
  return undefined;
}

export function finalizeSeasonMarket(input: SeasonState): SeasonState {
  const state = structuredClone(input);
  if (state.status !== "finished" || state.contractOffers.length) return state;
  if (state.sponsor && !state.sponsor.evaluated) {
    state.sponsor.fulfilled = state.sponsor.progress >= state.sponsor.target;
    state.sponsor.evaluated = true;
    state.sponsor.renewalEligible = state.sponsor.fulfilled;
    if (state.sponsor.fulfilled) state.reputation = clampReputation(state.reputation + 1);
  }
  const performanceModifier = seasonPerformanceModifier(state);
  state.contractOffers = state.contractMarket.map((team): ContractOffer => {
    const roll = rollSeasonD12(state);
    const fitModifier = contractFit(team.philosophy, state.driverTalent);
    const total = roll + state.reputation + performanceModifier + fitModifier;
    let role = roleForContractTotal(total);
    let blockedReason: string | undefined;
    if ((role === "race" || role === "primary") && team.raceSeatsFilled >= 2) {
      role = team.reserveSeatsFilled < 1 ? "reserve" : undefined;
      if (!role) blockedReason = "正式与储备席均已占用";
    }
    if (role === "reserve" && team.reserveSeatsFilled >= 1) {
      role = undefined;
      blockedReason = "储备席已占用";
    }
    return {
      id: `offer-${state.seasonNumber}-${team.teamId}`,
      teamId: team.teamId,
      teamName: team.name,
      abbreviation: team.abbreviation,
      roll,
      reputation: state.reputation,
      performanceModifier,
      fitModifier,
      total,
      role,
      blockedReason,
      status: "pending",
    };
  });
  return state;
}

/** Reprices unsigned offers after an explicit post-race reputation change. */
export function repricePendingContractOffers(input: SeasonState): SeasonState {
  const state = structuredClone(input);
  state.contractOffers = state.contractOffers.map((offer) => {
    if (offer.status !== "pending") return offer;
    const market = state.contractMarket.find((team) => team.teamId === offer.teamId);
    const total = offer.roll + state.reputation + offer.performanceModifier + offer.fitModifier;
    let role = roleForContractTotal(total);
    let blockedReason: string | undefined;
    if (market && (role === "race" || role === "primary") && market.raceSeatsFilled >= 2) {
      role = market.reserveSeatsFilled < 1 ? "reserve" : undefined;
      if (!role) blockedReason = "正式与储备席均已占用";
    }
    if (market && role === "reserve" && market.reserveSeatsFilled >= 1) {
      role = undefined;
      blockedReason = "储备席已占用";
    }
    return { ...offer, reputation: state.reputation, total, role, blockedReason };
  });
  return state;
}

export function acceptContractOffer(input: SeasonState, offerId: string): SeasonState {
  if (input.status !== "finished") throw new Error("合同只能在赛季结束后确认。");
  const state = structuredClone(input);
  const offer = state.contractOffers.find((item) => item.id === offerId);
  if (!offer?.role) throw new Error("该车队没有提供可接受席位。");
  state.contractOffers = state.contractOffers.map((item) => ({ ...item, status: item.id === offerId ? "accepted" : "declined" }));
  state.acceptedContractOfferId = offerId;
  state.currentContract = {
    id: `contract-${state.seasonNumber + 1}-${offer.teamId}`,
    teamId: offer.teamId,
    teamName: offer.teamName,
    role: offer.role,
    season: state.seasonNumber + 1,
    startsAfterSeason: state.seasonNumber,
    expiresAfterSeason: state.seasonNumber + 1,
    sourceOfferId: offer.id,
  };
  return state;
}
