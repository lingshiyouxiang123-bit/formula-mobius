import { syncNarrative } from '../narrative/engine';
import type { NarrativeLine, RaceNarrative } from '../narrative/types';
import type {
  ForumTopic,
  GameEvent,
  GameState,
  MediaPersona,
  MediaPost,
  MediaRoundBundle,
  MediaSourceRef,
  PostRacePoster,
  PostRaceStats,
  SeasonState,
  TeamBlogSection,
} from "../game/types";
import { POSTER_TEMPLATES } from "./poster";

/** Archive projections retain the exact social IDs, authors, text and direct parent chain. */
export function socialForum(lines: NarrativeLine[]): ForumTopic[] {
  const byId=new Map(lines.map(p=>[p.id,p]));
  const rootId=(line:NarrativeLine)=>{
    const seen=new Set<string>();let current=line;
    while(current.replyToId&&byId.has(current.replyToId)&&!seen.has(current.id)) {seen.add(current.id);current=byId.get(current.replyToId)!;}
    return current.id;
  };
  return lines.filter(p=>!p.replyToId&&!p.repostOfId).map(root=>{
    const thread=lines.filter(p=>rootId(p)===root.id);
    const posts:MediaPost[]=thread.map(p=>({id:p.id,author:p.speaker,persona:(p.account?.role==='team'?'supporter':p.plan?.stance==='critical'?'skeptic':'fan') as MediaPersona,
      text:p.text,score:lines.filter(r=>r.replyToId===p.id).length,replyToId:p.replyToId,source:{factIds:p.factIds,eventIds:p.eventIds,statePaths:[]}}));
    const category:ForumTopic['category']=root.socialContext?.tags.includes('standings_update')?'standings':root.socialKind==='blog'?'team':root.socialContext?.tags.includes('contact')?'incident':root.card?'result':'strategy';
    return {id:root.id,category,title:`${root.speaker} · ${root.card?.title??root.text.slice(0,48)}`,posts,score:thread.length-1,
      source:{factIds:[...new Set(thread.flatMap(p=>p.factIds))],eventIds:[...new Set(thread.flatMap(p=>p.eventIds))],statePaths:[]}};
  }).sort((a,b)=>b.score-a.score);
}

function socialBlog(lines: NarrativeLine[], game: GameState): TeamBlogSection[] {
  const teamId=game.drivers.find(d=>d.id===game.humanDriverId)?.profile.teamId;
  const teamPosts=lines.filter(p=>p.account?.role==='team'&&p.account.teamId===teamId);
  const recap=teamPosts.findLast(p=>p.socialKind==='blog');
  const update=teamPosts.findLast(p=>p.socialKind==='update');
  const sections:TeamBlogSection[]=[];
  if(recap)sections.push({id:'result',heading:`${recap.speaker} · 本站复盘`,text:recap.text,source:{factIds:recap.factIds,eventIds:recap.eventIds,statePaths:[]}});
  if(update)sections.push({id:'turning_point',heading:'比赛中更新',text:update.text,source:{factIds:update.factIds,eventIds:update.eventIds,statePaths:[]}});
  return sections;
}

function hash32(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function deriveMediaSeed(seasonSeed: number, round: number, type: string, index = 0): number {
  return hash32(`${seasonSeed >>> 0}:${round}:${type}:${index}`);
}


function eventsFor(game: GameState, predicate: (event: GameEvent) => boolean): GameEvent[] {
  return game.logs.filter(predicate);
}

function source(factIds: string[], events: GameEvent[] = [], statePaths: string[] = []): MediaSourceRef {
  return { factIds, eventIds: [...new Set(events.map((event) => event.id))], statePaths: [...new Set(statePaths)] };
}

export function buildPostRaceStats(game: GameState): PostRaceStats {
  const driver = game.drivers.find((item) => item.id === game.humanDriverId)!;
  const result = game.results.find((item) => item.driverId === game.humanDriverId);
  const stats = driver.raceStats ?? { cellsMoved: 0, attacks: 0, overtakes: 0, timesOvertaken: 0, defensesWon: 0, contacts: 0, pitStops: 0, ersUsed: 0, idealLines: 0, lateBrakes: 0, peakHeat: 0, peakWear: 0 };
  const finishRank = result?.rank;
  return {
    raceId: game.id,
    round: game.round,
    trackName: game.track.name,
    driverId: driver.id,
    startRank: driver.qualifyingRank,
    finishRank,
    status: result?.status ?? driver.status,
    positionsGained: finishRank ? driver.qualifyingRank - finishRank : 0,
    pitStops: stats.pitStops,
    overtakes: stats.overtakes,
    defenses: stats.defensesWon,
    lateBrakes: stats.lateBrakes,
    contacts: stats.contacts,
    penalties: (driver.penalties?.time?.length ?? 0) + (driver.penalties?.vp ?? 0) + (driver.penalties?.driveThrough ?? 0),
    peakHeat: stats.peakHeat,
    peakWear: stats.peakWear,
    source: source([`driver-${driver.id}-position`, `driver-${driver.id}-stats`], eventsFor(game, (event) => event.code === "classification.result" || event.details?.input?.driverId === driver.id), [`GameState.results.${driver.id}`, `GameState.drivers.${driver.id}.raceStats`]),
  };
}


function buildPress(game: GameState, stats: PostRaceStats) {
  const human = game.drivers.find((driver) => driver.id === game.humanDriverId)!;
  const incident = game.logs.slice().reverse().find((event) => event.type === "incident" || event.code?.startsWith("penalty"));
  const resultText = stats.finishRank ? `P${stats.finishRank}` : "DNF";
  const recordedMistake = game.logs.some((event) => event.code === "dice.late_brake" && Number(event.details?.result) <= 5);
  const unmetObjective = game.objectives?.some((objective) => !objective.completed) ?? false;
  const accountabilityEligible = recordedMistake || stats.penalties > 0 || unmetObjective;
  return [
    { id: `press-${game.id}-result`, category: "result" as const, text: `你从 P${stats.startRank} 出发，以 ${resultText} 结束比赛，如何评价结果？`, accountabilityEligible, source: source([`driver-${human.id}-position`], eventsFor(game, (event) => event.code === "classification.result"), [`GameState.results.${human.id}`, "GameState.objectives"]) },
    { id: `press-${game.id}-event`, category: "event" as const, text: incident ? `第 ${incident.round} 回合的事件成为比赛转折，你如何回应？` : `本场没有记录到事故或判罚，哪项执行最关键？`, accountabilityEligible, source: incident ? source([`event-${incident.id}`], [incident]) : source([`driver-${human.id}-stats`], [], [`GameState.drivers.${human.id}.raceStats`]) },
    { id: `press-${game.id}-team`, category: "team" as const, text: `${human.profile.team?.name ?? "车队"} 本站获得了哪些可用于下一站的信息？`, accountabilityEligible: false, source: source(["season-budget"], [], ["SeasonState.playerTeam"]) },
  ];
}


function buildCommentary(game: GameState): MediaPost[] {
  const priority = new Set(["classification.result", "incident.damage", "incident.race_control", "pit.service", "dice.duel", "dice.late_brake", "dice.reliability", "penalty.track_limit", "penalty.tire_obligation", "penalty.time"]);
  const keyPosts = game.logs.filter((event) => priority.has(event.code ?? "")).slice(-12).map((event, index) => ({ id: `commentary-${game.id}-${event.id}`, author: "race_feed", persona: "engineer" as const, text: `R${event.round} · ${event.message}`, score: 12 - index, source: source([`event-${event.id}`], [event]) }));
  const ordinaryMoves = game.logs.filter((event) => event.code === "movement.step");
  if (ordinaryMoves.length) {
    const first = ordinaryMoves[0];
    const last = ordinaryMoves[ordinaryMoves.length - 1];
    const boundaries = first.id === last.id ? [first] : [first, last];
    keyPosts.unshift({ id: `commentary-${game.id}-moves`, author: "race_feed", persona: "engineer", text: `${ordinaryMoves.length} 条连续普通移动已合并；事故、超车、进站和判定保持单独记录。`, score: 0, source: source(boundaries.map((event) => `event-${event.id}`), boundaries, ["GameState.logs[code=movement.step]"]) });
  }
  return keyPosts;
}

function buildBriefing(game: GameState, season: SeasonState): MediaPost[] {
  const text = `${game.track.name}，${game.sessionLaps ?? game.track.laps} 圈，${game.track.totalLength} 格；起始天气 ${game.weather ?? "排位后确定"}。车手榜当前记录 ${season.standings.length} 人，公开赛季目标与轮胎义务以赛前界面为准。`;
  return [{ id: `briefing-${game.id}`, author: "pitwall_brief", persona: "engineer", text, score: 0, source: source(["race-track", "race-weather"], [], ["GameState.track", "GameState.weather", "SeasonState.standings"]) }];
}

export function createPosterPlaceholder(game: GameState, season: SeasonState, stats: PostRaceStats): PostRacePoster {
  const driver = game.drivers.find((item) => item.id === game.humanDriverId)!;
  const template = POSTER_TEMPLATES[0];
  return {
    id: `poster-${game.id}`,
    templateId: "technical-grid-v1",
    width: template.width,
    height: template.height,
    safeArea: { ...template.safeArea },
    layers: structuredClone(template.slots),
    text: { driver: driver.profile.name, team: driver.profile.team?.name ?? season.playerTeam.name, track: game.track.name, result: stats.finishRank ? `P${stats.finishRank}` : "DNF", status: stats.status.toUpperCase(), dateLabel: `SEASON ${season.seasonNumber} · ROUND ${season.currentRound}` },
    palette: { background: "#05080b", foreground: "#edf8ff", accent: driver.profile.color },
    source: stats.source,
  };
}

export function generateMediaRound(game: GameState, season: SeasonState, previousNarrative?: RaceNarrative): MediaRoundBundle {
  const stats = buildPostRaceStats(game);
  const briefing = buildBriefing(game, season);
  const commentary = buildCommentary(game);
  const pressQuestions = buildPress(game, stats);
  const narrative=syncNarrative(previousNarrative,game,season);
  const socialPosts=[...narrative.social,...(narrative.socialQueue??[]).map(p=>p.line)];
  const blog = socialBlog(socialPosts,game);
  const topics=socialForum(socialPosts);
  const forum = topics.filter(t=>t.category!=='standings');
  const seasonTopics = topics.filter(t=>t.category==='standings');
  const poster = createPosterPlaceholder(game, season, stats);
  const sources = [
    stats.source,
    ...briefing.map((post) => post.source),
    ...commentary.map((post) => post.source),
    ...pressQuestions.map((question) => question.source),
    ...blog.map((section) => section.source),
    ...forum.flatMap((topic) => [topic.source, ...topic.posts.map((post) => post.source)]),
    ...seasonTopics.flatMap((topic) => [topic.source, ...topic.posts.map((post) => post.source)]),
    poster.source,
  ];
  const sourceIds = new Set(sources.flatMap((item) => item.eventIds));
  return {
    raceId: game.id,
    seasonRound: season.currentRound,
    seed: deriveMediaSeed(season.seed, season.currentRound, "bundle"),
    generatedAtSequence: season.rounds.length,
    stats,
    briefing,
    commentary,
    pressQuestions,
    blog,
    socialPosts,
    socialResult:narrative.result,
    socialTopics:narrative.socialTopics,
    forum,
    seasonTopics,
    poster,
    sourceEvents: game.logs.filter((event) => sourceIds.has(event.id)).map(({ id, round, type, code, ruleRef, message }) => ({ id, round, type, code, ruleRef, message })),
  };
}
