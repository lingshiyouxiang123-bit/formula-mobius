import type { PostRacePoster, PosterAssetReference, PosterLayerId, PosterTemplate } from "../game/types";

export const POSTER_TEMPLATES: PosterTemplate[] = [{
  id: "technical-grid-v1",
  name: "技术网格 4:5",
  width: 1080,
  height: 1350,
  safeArea: { x: 84, y: 80, width: 912, height: 1190 },
  slots: [
    { id: "background", label: "背景", crop: { x: 0, y: 0, width: 1080, height: 1350 }, blendMode: "normal", opacity: 1 },
    { id: "foreground", label: "车手 / 赛车前景", crop: { x: 90, y: 250, width: 900, height: 810 }, blendMode: "normal", opacity: 1 },
    { id: "teamMark", label: "车队标识", crop: { x: 84, y: 80, width: 300, height: 140 }, blendMode: "normal", opacity: 1 },
    { id: "overlay", label: "光效 / 纹理", crop: { x: 0, y: 0, width: 1080, height: 1350 }, blendMode: "screen", opacity: 0.65 },
  ],
}];

export function validatePosterAssets(assets: Partial<Record<PosterLayerId, PosterAssetReference>>): string[] {
  const errors: string[] = [];
  for (const [layer, asset] of Object.entries(assets) as Array<[PosterLayerId, PosterAssetReference]>) {
    if (!asset.id.trim() || !asset.fileName.trim()) errors.push(`${layer} 素材缺少 ID 或文件名`);
    if (asset.width <= 0 || asset.height <= 0) errors.push(`${layer} 素材尺寸无效`);
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(asset.mimeType)) errors.push(`${layer} 素材类型不支持`);
  }
  return errors;
}

/** Records asset references only. Rendering/export waits for real user-provided files. */
export function bindPosterAssets(poster: PostRacePoster, assets: Partial<Record<PosterLayerId, PosterAssetReference>>): PostRacePoster {
  const errors = validatePosterAssets(assets);
  if (errors.length) throw new Error(errors.join("；"));
  const next = structuredClone(poster);
  next.layers = next.layers.map((layer) => ({ ...layer, assetId: assets[layer.id]?.id }));
  return next;
}
