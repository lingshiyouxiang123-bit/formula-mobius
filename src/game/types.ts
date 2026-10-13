export type StatKey = "eng" | "aero" | "mech" | "brk" | "rel";
export type CarStats = Record<StatKey, number>;

export type TalentId =
  | "late_braker"
  | "tire_whisperer"
  | "rain_master"
  | "overtake_maniac"
  | "wide_train"
  | "strategist";

export type MinorTalentId =
  | "drs_expert"
  | "ers_management"
  | "pit_perfection"
  | "outside_specialist"
  | "durability"
  | "launch_rocket"
  | "cooling_skill";

export type TalentBranch = "racecraft" | "strategy" | "technical";
export type TalentNodeId =
  | "RC-1" | "RC-2" | "RC-3" | "RC-4" | "RC-5" | "RC-6"
  | "ST-1" | "ST-2" | "ST-3" | "ST-4" | "ST-5" | "ST-6"
  | "TE-1" | "TE-2" | "TE-3" | "TE-4" | "TE-5" | "TE-6";
export type SignatureMoveId = "qualifying_push" | "race_launch" | "pit_execution";
export type DriverSpecializationId = "qualifying" | "strategy" | "duel" | "endurance";
export type OffTrackActionId = "simulator" | "fitness";
export type TalentActionId =
  | "tire_conserve"
  | "tire_extra_care"
  | "strategist_cycle"
  | "segment_plan"
  | "extreme_duel"
  | "specialist_duel"
  | "extreme_late_brake"
  | "overtake_salvage";
export type TacticalResourceId = "ers" | "lateBrake" | "defense" | "cooling" | "quickRepair";
export type RaceObjectiveId =
  | "clean_race"
  | "defend_once"
  | "late_brake_pair"
  | "defend_twice"
  | "no_stop_finish"
  | "back_row_podium"
  | "ers_minimal"
  | "clean_podium"
  | "defense_wall"
  | "no_stop_podium";
export type TeamFacilityId =
  | "wind_tunnel"
  | "engine_mapping"
  | "mechanical_department"
  | "brake_department"
  | "reliability_package"
  | "battery_recovery"
  | "pit_training"
  | "strategy_tools";
export type ResearchPhilosophyId = "straight_efficiency" | "high_downforce" | "mechanical_grip" | "braking_control" | "reliability";
export type ResearchProjectMode = "standard" | "rush" | "aggressive";
export type ResearchProjectStatus = "active" | "delayed" | "completed" | "failed";
export type ContractRole = "reserve" | "race" | "primary";
export type ContractOfferStatus = "pending" | "accepted" | "declined";
export type SponsorId = "technical_partner" | "community_foundation" | "media_network";
export type SponsorGoalKind = "classified_finishes" | "clean_finishes" | "public_appearances";
export type MediaContentType = "briefing" | "commentary" | "press" | "blog" | "forum" | "poster";
export type PressResponseIntent = "honest" | "team_first" | "hardline" | "skip";
export type MediaPersona = "engineer" | "fan" | "rules" | "skeptic" | "supporter" | "playful";
export type PosterLayerId = "background" | "foreground" | "teamMark" | "overlay";
export type AdvancedModuleId = "componentPool" | "scrutineering" | "aggressiveAccounting" | "appeals" | "rookiePractice" | "entertainmentDeck";
export type ComponentKind = "powerUnit" | "gearbox";

export interface DriverCareer {
  xp: number;
  level: number;
  races: number;
  wins: number;
  podiums: number;
  dnfs: number;
  season: number;
  seasonStarts: number;
  seasonPoints: number;
  selectedNodes: TalentNodeId[];
  signatureMove?: SignatureMoveId;
  signatureUpgrade?: "extra_use" | "enhanced";
  specialization?: DriverSpecializationId;
  processedRaceIds: string[];
  preparationAvailable?: boolean;
  preparationSeed?: number;
  pendingPreparation?: {
    actionId: OffTrackActionId;
    startMp: number;
    lateBrakeBonus: number;
    lightDamageShield: number;
  };
  preparationHistory?: Array<{
    actionId: OffTrackActionId;
    roll: number;
    modifier: number;
    total: number;
    success: boolean;
    season: number;
  }>;
}

export interface TeamDevelopment {
  name: string;
  developmentPoints: number;
  totalDevelopmentPoints: number;
  baseStats: CarStats;
  upgrades: Array<{ stat: StatKey; from: number; to: number; season: number }>;
  facilities?: Partial<Record<TeamFacilityId, number>>;
  facilityUpgrades?: Array<{ facility: TeamFacilityId; level: number; cost: number; season: number }>;
}

export interface TeamProfile {
  id: string;
  name: string;
  abbreviation: string;
  color: string;
  stats: CarStats;
  development: TeamDevelopment;
  researchPhilosophy?: ResearchPhilosophyId;
}

export type BurdenId =
  | "high_heat"
  | "tire_wear"
  | "scrutiny"
  | "budget_cap"
  | "slow_pit";

export type TireCompound = "hard" | "medium" | "soft" | "intermediate" | "wet";
export type EngineMode = "save" | "balanced" | "attack";
export type Weather = "heavy_rain" | "light_rain" | "sunny" | "cloudy";
export type WeatherMode = "fixed" | "dynamic";
export type WeekendMode = "quick" | "full";
export type RaceSessionKind = "sprint" | "race";
export type AeroSetup = "low" | "balanced" | "high";
export type CoolingSetup = "closed" | "balanced" | "open";
export type SuspensionSetup = "soft" | "balanced" | "stiff";
export interface WeekendSetup {
  aero: AeroSetup;
  cooling: CoolingSetup;
  suspension: SuspensionSetup;
}
export type Lane = "left" | "right";
export type TrackArchetype = "power" | "street" | "flowing" | "mixed";
export type TrackSize = "compact" | "standard" | "long";
export type TrackComplexity = "low" | "medium" | "high";
export type CornerClass = "hairpin" | "slow" | "medium" | "fast";
export type CornerDirection = "left" | "right";
export type DriverStatus = "racing" | "finished" | "classified" | "dnf";
export type GamePhase =
  | "practice"
  | "setup"
  | "qualifying"
  | "preRace"
  | "strategy"
  | "movement"
  | "roundEnd"
  | "redFlag"
  | "finished";
export type RaceControl = "green" | "sc" | "vsc" | "red_flag";
export type RaceControlPhase = "vsc" | "sc_deployment" | "sc_restart" | "red_flag";

export interface DriverProfile {
  id: string;
  name: string;
  abbreviation: string;
  color: string;
  stats: CarStats;
  talent: TalentId;
  minorTalents?: MinorTalentId[];
  teamId?: string;
  career?: DriverCareer;
  team?: TeamDevelopment;
  contract?: DriverContract;
  /** Assigned when a season race is created; never written back to the profile archive. */
  raceEntryEffects?: {
    emergencySpares?: boolean;
    correlationPenaltyStat?: StatKey;
    freeFacilityUses?: TeamFacilityId[];
    gridPenalty?: number;
    wornComponentPenalty?: number;
    rookiePractice?: boolean;
    entertainmentEvent?: string;
    complianceRisk?: boolean;
  };
}

export interface DriverContract {
  id: string;
  teamId: string;
  teamName: string;
  role: ContractRole;
  season: number;
  startsAfterSeason: number;
  expiresAfterSeason: number;
  sourceOfferId?: string;
}

export interface TrackSegment {
  id: string;
  name: string;
  type: "straight" | "corner";
  length: number;
  drs?: boolean;
  cornerCost?: number;
  cornerClass?: CornerClass;
  direction?: CornerDirection;
  sequenceId?: string;
  sector?: 1 | 2 | 3;
  elevation?: number;
}

export interface DrsZone {
  id: string;
  segmentId: string;
  detectionCell: number;
  startCell: number;
  endCell: number;
}

export interface TrackAnalysis {
  straightRatio: number;
  cornerLoad: number;
  effectiveLapLoad: number;
  effectiveRaceLoad: number;
  longestStraight: number;
  brakingZones: number;
  idealLineOpportunities: number;
  drsCoverage: number;
  powerStress: number;
  aeroStress: number;
  brakeStress: number;
  tireStress: number;
  dangerRating: number;
  expectedRounds: { minimum: number; maximum: number };
}

export interface Track {
  id: string;
  name: string;
  subtitle: string;
  laps: number;
  totalLength: number;
  pitEntryCell: number;
  pitExitCell: number;
  segments: TrackSegment[];
  mapPoints: Array<[number, number]>;
  drsZones?: DrsZone[];
  archetype?: TrackArchetype;
  size?: TrackSize;
  analysis?: TrackAnalysis;
  generated?: {
    seed: number;
    generatorVersion: number;
    complexity: TrackComplexity;
  };
  bridgeLevels?: Record<number, number>;
}

export interface TacticalResources {
  lateBrake: number;
  defense: number;
  cooling: number;
  quickRepair: number;
}

export interface PitState {
  remainingRounds: number;
  tire: TireCompound;
  useQuickRepair: boolean;
  service: boolean;
}

export interface TurnPlan {
  mode: EngineMode;
  deployErs: boolean;
  pit: boolean;
  pitTire: TireCompound;
  useCooling: boolean;
  useQuickRepair: boolean;
  talentAction?: TalentActionId;
  tokenSwap?: { from: TacticalResourceId; to: TacticalResourceId };
}

export interface DriverRaceStats {
  cellsMoved: number;
  attacks: number;
  overtakes: number;
  timesOvertaken: number;
  defensesWon: number;
  contacts: number;
  pitStops: number;
  ersUsed: number;
  idealLines: number;
  lateBrakes: number;
  lateBrakeSuccesses?: number;
  penaltiesReceived?: number;
  trackLimitWarnings?: number;
  peakHeat: number;
  peakWear: number;
  heavyDamageEvents?: number;
}

export type RaceTimePenalty = 5 | 10 | 20;

export interface DriverState {
  id: string;
  profile: DriverProfile;
  isHuman: boolean;
  status: DriverStatus;
  dnfReason?: string;
  progress: number;
  lane: Lane;
  qualifyingRank: number;
  finishOrder?: number;
  retirementRound?: number;
  tire: TireCompound;
  wear: number;
  heat: number;
  brakeHeat: number;
  ers: number;
  tactical: TacticalResources;
  burdens: BurdenId[];
  lightDamage: number;
  heavyDamage: boolean;
  reliabilityPenalty: number;
  breakdowns: number;
  stoppedRounds: number;
  powerPenaltyRounds: number;
  pit?: PitState;
  /** Legacy out-lap marker; no longer used to apply a whole-lap MP penalty. */
  slowPitOutLap?: number;
  /** Actual service exit round: all positive/negative exit MP effects last this round only. */
  pitExitRound?: number;
  /** vp/driveThrough are legacy save fields; new penalties are individual time tickets. */
  penalties: { vp: number; driveThrough: number; time?: RaceTimePenalty[] };
  /** Version-1 saves may omit the following race-control counters. */
  trackLimitWarnings?: number;
  blueFlagYielding?: boolean;
  /** Optional so version-1 local saves created before race statistics remain resumable. */
  raceStats?: DriverRaceStats;
  /** Per-race progression effects; optional for older saves. */
  careerUses?: {
    lightDamageIgnored: boolean;
    lightDamageIgnoresUsed?: number;
    /** Legacy saves may only contain pitExecutionUsed. */
    pitExecutionUsed?: boolean;
    pitExecutionUses: number;
    softTireProtection: boolean;
    softTireProtectionRound?: number;
    softTireProtectionCharges?: number;
    talentActions: TalentActionId[];
    resolvedTalentActions?: TalentActionId[];
    tokenSwaps: number;
    safeLateBrakeTokens: number;
    marginalUpgradeUsed: boolean;
    brakePointRecoveryUsed?: boolean;
    defensesThisRound: number;
    attacksThisRound: number;
    attackLap?: number;
    attacksThisLap?: number;
    doubleAttackUsed?: boolean;
    extraFreeDefenseUsed?: boolean;
    defenseLap?: number;
    consecutiveDefenses?: number;
    defenseRewardLap?: number;
    lastDefenseRewardLap?: number;
    defendedThisRound: boolean;
    lastSuccessfulDefenseLap?: number;
    racecraftBonusAwarded: boolean;
    roundStartWear: number;
    firstStraightSetupRound?: number;
    firstCornerSetupRound?: number;
    ersUsedRound?: number;
    teamFacilityUses?: Partial<Record<TeamFacilityId, number>>;
    preparationLateBrakeUsed?: boolean;
  };
  bonusPoints?: number;
  /** Completed-lap durations measured in game rounds; optional for version-1 saves. */
  lapTiming?: {
    lastCompletionRound: number;
    completedRounds: number[];
    /** Durations of laps completed while the active weather was rain. */
    wetCompletedRounds?: number[];
  };
  /** M5: compounds actually fitted during the active session. */
  tireCompoundsUsed?: TireCompound[];
  /** A parc-ferme breach starts behind the grid and loses the first action. */
  pitLaneStart?: boolean;
  /** M8: true for the locally AI-controlled second car in the player's team. */
  isTeammate?: boolean;
  /** One aggressive-project correlation penalty carried into this race. */
  correlationPenaltyStat?: StatKey;
  correlationPenaltyConsumed?: boolean;
}

export type TeamOrderReason = "championship_priority" | "strategy_split" | "pit_window" | "qualifying_tow";

export interface TeamOrderState {
  id: string;
  round: number;
  reason: TeamOrderReason;
  beneficiaryId: string;
  yieldingDriverId: string;
  status: "pending" | "accepted" | "refused";
}

export interface QualifyingEntry {
  driverId: string;
  mode: EngineMode;
  roll: number;
  total: number;
  invalid?: boolean;
  tieBreakRoll?: number;
}

export type RaceEventCode =
  | "race.info"
  | "dice.qualifying"
  | "dice.grip"
  | "dice.late_brake"
  | "dice.duel"
  | "dice.contact"
  | "dice.penalty"
  | "dice.reliability"
  | "resource.change"
  | "movement.step"
  | "incident.damage"
  | "incident.contact"
  | "incident.yellow"
  | "incident.race_control"
  | "weather.transition"
  | "weekend.setup"
  | "weekend.sprint"
  | "penalty.tire_obligation"
  | "penalty.track_limit"
  | "penalty.time"
  | "pit.service"
  | "ai.strategy"
  | "ai.decision"
  | "development.project"
  | "team.order"
  | "classification.result";

export interface GameEventDetails {
  input?: Record<string, string | number | boolean | null>;
  dice?: number[];
  modifiers?: Record<string, number>;
  result?: string;
}

export type PublicResourceBand = "low" | "medium" | "high" | "critical";

export interface PublicDriverInfo {
  tire: TireCompound;
  wear: PublicResourceBand;
  heat: PublicResourceBand;
  ers: PublicResourceBand;
  damage: "clear" | "light" | "heavy";
  penalty: "clear" | "time";
}

export interface GameEvent {
  id: number;
  round: number;
  type: "info" | "roll" | "resource" | "move" | "incident" | "result";
  code?: RaceEventCode;
  ruleRef?: string;
  details?: GameEventDetails;
  message: string;
}

export type DecisionPrompt =
  | {
      kind: "corner";
      driverId: string;
      segmentId: string;
      segmentName: string;
      baseCost: number;
      remainingMp: number;
      canIdeal: boolean;
      idealReason?: string;
      canNormal: boolean;
      canLateBrake: boolean;
      lateBrakeReason?: string;
    }
  | {
      kind: "attack";
      driverId: string;
      defenderId: string;
      canUseLateBrakeToken: boolean;
    }
  | {
      kind: "defense";
      driverId: string;
      attackerId: string;
      canUseToken: boolean;
      hasFreeDefense: boolean;
    };

export interface PendingCornerContext {
  kind: "corner";
  driverId: string;
  segmentId: string;
}

export interface PendingAttackContext {
  kind: "attack";
  attackerId: string;
  defenderId: string;
  contested: boolean;
}

export interface PendingDefenseContext {
  kind: "defense";
  attackerId: string;
  defenderId: string;
  attackStat: "eng" | "mech";
}

export type PendingContext = PendingCornerContext | PendingAttackContext | PendingDefenseContext;

export interface MovementRuntime {
  queue: string[];
  queueIndex: number;
  activeDriverId?: string;
  remainingMp: number;
  paidCornerIds: string[];
  started: boolean;
  freeDefenseUsed: string[];
  movedDriverIds: string[];
  teamOrderPass?: { beneficiaryId: string; yieldingDriverId: string };
  pendingAiContest?: {
    attackerId: string;
    defenderId: string;
    attackStat: "eng" | "mech";
  };
}

export interface RaceResult {
  driverId: string;
  rank: number;
  points: number;
  status: DriverStatus;
  /** Frozen when the first car finishes; optional for completed legacy races. */
  snapshotProgress?: number;
  adjustedProgress?: number;
  onTrackRank?: number;
  penaltySeconds?: number;
  penaltyCells?: number;
}

export interface RaceObjectiveState {
  id: RaceObjectiveId;
  title: string;
  difficulty: "易" | "中" | "难";
  points: number;
  completed?: boolean;
  awardedPoints?: number;
}

export interface PresentationStep {
  id: number;
  kind: "turn" | "move" | "roll" | "incident" | "result";
  title: string;
  messages: string[];
  driverIds: string[];
}

export interface BroadcastState {
  active: boolean;
  stage: number;
}

export interface GameState {
  schemaVersion: 1;
  id: string;
  sessionMode?: "official" | "simulation";
  seasonId?: string;
  seasonRound?: number;
  phase: GamePhase;
  track: Track;
  round: number;
  weekendMode?: WeekendMode;
  raceSession?: RaceSessionKind;
  sessionLaps?: number;
  weatherMode?: WeatherMode;
  weather?: Weather;
  weatherRoll?: number;
  weatherHistory?: Array<{ round: number; roll: number; from: Weather; to: Weather }>;
  raceWeatherWasWet?: boolean;
  rngState: number;
  initialSeed?: number;
  humanDriverId: string;
  drivers: DriverState[];
  qualifying: QualifyingEntry[];
  plans: Record<string, TurnPlan>;
  /** AI plans are locked with the player plan; explanations stay hidden until that AI acts. */
  aiPlanNotes?: Record<string, string>;
  pendingDecision: DecisionPrompt | null;
  pendingContext: PendingContext | null;
  movement: MovementRuntime | null;
  raceControl: RaceControl;
  raceControlPhase?: RaceControlPhase;
  raceControlStartedRound?: number;
  raceControlEndsAfterRound?: number;
  safetyCarLeaderId?: string;
  redFlagOrder?: string[];
  restartLaunchRound?: number;
  yellowFlagSegmentId?: string;
  weekend?: {
    setup?: WeekendSetup;
    lockedSetup?: WeekendSetup;
    parcFermeBroken?: boolean;
    sprintEnabled: boolean;
    sprintCompleted: boolean;
    sprintResults?: RaceResult[];
  };
  presentation?: PresentationStep;
  broadcast?: BroadcastState;
  logs: GameEvent[];
  nextLogId: number;
  results: RaceResult[];
  objectives?: RaceObjectiveState[];
  teamOrder?: TeamOrderState;
  teamOrderHistory?: TeamOrderState[];
  teammateRelationshipDelta?: number;
  teamPriorityDriverId?: string;
  advanced?: {
    gridPenalty: number;
    wornComponentPenalty: number;
    rookiePractice: boolean;
    complianceRisk: boolean;
    entertainmentEvent?: string;
  };
}

export type DefenseChoice = "none" | "bonus" | "extra_mp";

export type GameCommand =
  | { type: "COMPLETE_PRACTICE"; setup: WeekendSetup }
  | { type: "START_QUALIFYING"; mode: EngineMode }
  | {
      type: "START_RACE";
      tire: TireCompound;
      burdens: BurdenId[];
      budgetRemoval?: "ers" | "lateBrake" | "defense" | "cooling";
      strategistBonus?: "ers" | "lateBrake" | "defense" | "cooling" | "quickRepair";
      strategistBonus2?: TacticalResourceId;
      teamBonus?: TacticalResourceId;
      setupOverride?: WeekendSetup;
    }
  | {
      type: "START_SPRINT";
      tire: TireCompound;
      burdens: BurdenId[];
      budgetRemoval?: "ers" | "lateBrake" | "defense" | "cooling";
      strategistBonus?: "ers" | "lateBrake" | "defense" | "cooling" | "quickRepair";
      strategistBonus2?: TacticalResourceId;
      teamBonus?: TacticalResourceId;
    }
  | { type: "RESTART_RED_FLAG"; tire: TireCompound }
  | { type: "RESOLVE_TEAM_ORDER"; accept: boolean }
  | { type: "SUBMIT_STRATEGY"; plan: TurnPlan }
  | { type: "CONTINUE_MOVEMENT" }
  | { type: "DISMISS_PRESENTATION" }
  | { type: "ADVANCE_BROADCAST" }
  | { type: "SKIP_BROADCAST" }
  | { type: "RESOLVE_CORNER"; choice: "normal" | "ideal" | "late_brake" | "stop"; useToken?: boolean }
  | { type: "RESOLVE_ATTACK"; stat: "eng" | "mech" }
  | { type: "SKIP_ATTACK" }
  | { type: "RESOLVE_DEFENSE"; stat: "aero" | "brk"; choice: DefenseChoice };

export type DispatchResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; error: string };

export interface CreateGameOptions {
  weekendMode?: WeekendMode;
  weatherMode?: WeatherMode;
  sprintEnabled?: boolean;
  enableTeammate?: boolean;
  teammateProfile?: DriverProfile;
  priorityDriverId?: string;
}

export type SeasonPerformanceAction = "simulator" | "fitness" | "development_support";
export type SeasonPublicAction = "media" | "sponsor" | "community" | "rest";

export interface SeasonResearchProject {
  id: string;
  stat: StatKey;
  mode: ResearchProjectMode;
  status: ResearchProjectStatus;
  startedAfterRound: number;
  deliveryAfterRound: number;
  rpCost: number;
  buCost: number;
  roll?: number;
  total?: number;
  result?: "on_time" | "delayed" | "failed" | "clean" | "free_facility" | "correlation_risk" | "legacy";
}

export interface SeasonAtrPeriod {
  period: number;
  startRound: number;
  rank: number;
  fieldSize: number;
  coefficient: number;
  slots: number;
  projectsStarted: number;
}

export interface SeasonTeamState {
  teamId: string;
  name: string;
  abbreviation: string;
  stats: CarStats;
  facilities: Partial<Record<TeamFacilityId, number>>;
  pausedFacilities: TeamFacilityId[];
  developmentPoints: number;
  totalDevelopmentPoints: number;
  budgetCap: number;
  budgetRemaining: number;
  philosophy: ResearchPhilosophyId;
  emergencySpares: boolean;
  repairSpend: number;
  projects: SeasonResearchProject[];
  atrPeriods: SeasonAtrPeriod[];
  pendingCorrelationStats: StatKey[];
  pendingFreeFacilityUses: TeamFacilityId[];
  teammateRelationship: number;
}

export interface SponsorState {
  id: SponsorId;
  name: string;
  accent: string;
  goalKind: SponsorGoalKind;
  progress: number;
  target: number;
  fulfilled: boolean;
  evaluated: boolean;
  renewalEligible?: boolean;
}

export interface ContractMarketTeam {
  teamId: string;
  name: string;
  abbreviation: string;
  philosophy: ResearchPhilosophyId;
  raceSeatsFilled: number;
  reserveSeatsFilled: number;
}

export interface ContractOffer {
  id: string;
  teamId: string;
  teamName: string;
  abbreviation: string;
  roll: number;
  reputation: number;
  performanceModifier: number;
  fitModifier: number;
  total: number;
  role?: ContractRole;
  blockedReason?: string;
  status: ContractOfferStatus;
}

export interface SeasonPublicActionResult {
  afterRound: number;
  action: SeasonPublicAction;
  roll?: number;
  modifier?: number;
  total?: number;
  reputationDelta: number;
  sponsorProgressDelta: number;
  message: string;
}

export interface MediaSourceRef {
  factIds: string[];
  eventIds: number[];
  statePaths: string[];
}

export interface PostRaceStats {
  raceId: string;
  round: number;
  trackName: string;
  driverId: string;
  startRank: number;
  finishRank?: number;
  status: DriverStatus;
  positionsGained: number;
  pitStops: number;
  overtakes: number;
  defenses: number;
  lateBrakes: number;
  contacts: number;
  penalties: number;
  peakHeat: number;
  peakWear: number;
  source: MediaSourceRef;
}

export interface MediaPost {
  id: string;
  author: string;
  persona: MediaPersona;
  text: string;
  score: number;
  source: MediaSourceRef;
  replyToId?: string;
}

export interface ForumTopic {
  id: string;
  category: "result" | "strategy" | "incident" | "driver" | "team" | "fun" | "market" | "development" | "standings";
  title: string;
  score: number;
  posts: MediaPost[];
  source: MediaSourceRef;
}

export interface PressQuestion {
  id: string;
  category: "result" | "event" | "team";
  text: string;
  accountabilityEligible: boolean;
  source: MediaSourceRef;
  answeredWith?: PressResponseIntent;
  resultText?: string;
  roll?: number;
  total?: number;
  reputationDelta?: number;
  relationshipDelta?: number;
}

export interface TeamBlogSection {
  id: "result" | "turning_point" | "strategy" | "reliability" | "development" | "next_round";
  heading: string;
  text: string;
  source: MediaSourceRef;
}

export interface PosterAssetSlot {
  id: PosterLayerId;
  label: string;
  assetId?: string;
  crop: { x: number; y: number; width: number; height: number };
  blendMode: "normal" | "screen" | "multiply" | "overlay";
  opacity: number;
}

export interface PosterAssetReference {
  id: string;
  fileName: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";
  width: number;
  height: number;
}

export interface PosterTemplate {
  id: string;
  name: string;
  width: number;
  height: number;
  safeArea: { x: number; y: number; width: number; height: number };
  slots: PosterAssetSlot[];
}

export interface PostRacePoster {
  id: string;
  templateId: string;
  width: number;
  height: number;
  safeArea: { x: number; y: number; width: number; height: number };
  layers: PosterAssetSlot[];
  text: { driver: string; team: string; track: string; result: string; status: string; dateLabel: string };
  palette: { background: string; foreground: string; accent: string };
  source: MediaSourceRef;
}

export interface MediaRoundBundle {
  raceId: string;
  seasonRound: number;
  seed: number;
  generatedAtSequence: number;
  stats: PostRaceStats;
  briefing: MediaPost[];
  commentary: MediaPost[];
  pressQuestions: PressQuestion[];
  blog: TeamBlogSection[];
  socialPosts?: import('../narrative/types').NarrativeLine[];
  socialResult?: import('../narrative/types').RaceNarrative['result'];
  socialTopics?: import('../narrative/types').SocialTopic[];
  forum: ForumTopic[];
  seasonTopics: ForumTopic[];
  poster: PostRacePoster;
  sourceEvents: Array<Pick<GameEvent, "id" | "round" | "type" | "code" | "ruleRef" | "message">>;
}

export interface MediaChannelSettings {
  briefing: boolean;
  commentary: boolean;
  press: boolean;
  blog: boolean;
  forum: boolean;
  poster: boolean;
}

export interface ComponentUnit {
  id: string;
  kind: ComponentKind;
  uses: number;
  installedRound: number;
}

export interface ComponentPoolState {
  allowance: number;
  units: ComponentUnit[];
  activeUnitId: string;
}

export interface AdvancedModuleSettings {
  componentPool: boolean;
  scrutineering: boolean;
  aggressiveAccounting: boolean;
  appeals: boolean;
  rookiePractice: boolean;
  entertainmentDeck: boolean;
}

export interface AdvancedRaceEntryChoice {
  powerUnit: "keep" | "new";
  gearbox: "keep" | "new";
  useRookie: boolean;
  acceptComplianceRisk: boolean;
}

export interface AdvancedRaceRecord {
  round: number;
  powerUnitId?: string;
  gearboxId?: string;
  gridPenalty: number;
  wornComponentPenalty: number;
  rookieUsed: boolean;
  complianceRisk: boolean;
  scrutineering?: { roll: number; total: number; result: "clear" | "fine"; budgetFine: number };
  entertainmentEvent?: string;
  entryEffects?: DriverProfile["raceEntryEffects"];
}

export interface AppealReview {
  raceId: string;
  eventId: number;
  completeEvidence: boolean;
  summary: string;
}

export interface AdvancedSeasonState {
  settings: AdvancedModuleSettings;
  powerUnits: ComponentPoolState;
  gearboxes: ComponentPoolState;
  accountingCredit: number;
  accountingLiability: number;
  rookieAppearances: number;
  raceRecords: AdvancedRaceRecord[];
  appealReviews: AppealReview[];
  accountingAudit?: { roll: number; total: number; result: "clear" | "rp_penalty" | "points_penalty"; penalty: number };
  rookieObligationPenalty?: number;
}

export interface SeasonCalendarRound {
  round: number;
  trackId: string;
  sprint: boolean;
}

export interface SeasonStanding {
  driverId: string;
  name: string;
  abbreviation: string;
  championshipPoints: number;
  sprintPoints: number;
  racePoints: number;
  raceFinishes: number[];
}

export interface ConstructorStanding {
  teamId: string;
  name: string;
  abbreviation: string;
  driverIds: string[];
  championshipPoints: number;
  racePoints: number;
  sprintPoints: number;
  raceFinishes: number[];
}

export interface SeasonRoundRecord {
  round: number;
  raceId: string;
  trackId: string;
  raceResults: Array<{ driverId: string; rank: number; points: number; status: DriverStatus }>;
  sprintResults: RaceResult[];
}

export interface SeasonState {
  schemaVersion: 1;
  id: string;
  seed: number;
  rngState: number;
  status: "active" | "finished";
  humanDriverId: string;
  aiCount: number;
  currentRound: number;
  calendar: SeasonCalendarRound[];
  standings: SeasonStanding[];
  constructors: ConstructorStanding[];
  playerTeam: SeasonTeamState;
  teammateDriverId?: string;
  seasonNumber: number;
  reputation: number;
  currentContract: DriverContract;
  contractMarket: ContractMarketTeam[];
  contractOffers: ContractOffer[];
  acceptedContractOfferId?: string;
  sponsor?: SponsorState;
  publicActionResults: SeasonPublicActionResult[];
  driverTalent?: TalentId;
  mediaSettings: MediaChannelSettings;
  mediaArchive: MediaRoundBundle[];
  advanced: AdvancedSeasonState;
  rounds: SeasonRoundRecord[];
  awaitingInterRoundActions: boolean;
  actionHistory: Array<{
    afterRound: number;
    performance: SeasonPerformanceAction;
    public: SeasonPublicAction;
  }>;
}
