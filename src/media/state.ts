import type { MediaChannelSettings, SeasonState } from "../game/types";

export const DEFAULT_MEDIA_SETTINGS: MediaChannelSettings = { briefing: true, commentary: true, press: true, blog: true, forum: true, poster: true };

export function migrateSeasonMedia(input: SeasonState): SeasonState {
  const state = structuredClone(input);
  state.mediaSettings = { ...DEFAULT_MEDIA_SETTINGS, ...(state.mediaSettings ?? {}) };
  state.mediaArchive ??= [];
  state.mediaArchive = state.mediaArchive.map((bundle) => ({ ...bundle, seasonTopics: bundle.seasonTopics ?? [], sourceEvents: bundle.sourceEvents ?? [] }));
  return state;
}

export function configureMediaChannels(input: SeasonState, settings: MediaChannelSettings): SeasonState {
  const state = migrateSeasonMedia(input);
  state.mediaSettings = { ...settings };
  return state;
}
