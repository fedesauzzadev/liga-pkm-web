// Tabla de imágenes de efectos del adaptador: tamaños de SpriteData de Showdown
// (battle-animations.ts, BattleEffects). Las URLs vienen del manifest fx.json (T-043).
export interface FxImage {
  readonly url: string
  readonly w: number
  readonly h: number
}

export const FX_IMAGE_SIZES: Readonly<Record<string, Readonly<{ w: number; h: number }>>> = {
  fireball: { w: 64, h: 64 },
  iceball: { w: 100, h: 100 },
  energyball: { w: 100, h: 100 },
  lightning: { w: 41, h: 229 },
  wisp: { w: 100, h: 100 },
  leftslash: { w: 57, h: 56 },
  rightslash: { w: 57, h: 56 },
  leaf1: { w: 32, h: 26 },
  leaf2: { w: 40, h: 26 },
}

// Combina tamaños + manifest; las claves sin asset descargado quedan afuera (fallback).
export function buildFxImages(manifest: Readonly<Record<string, string>>): ReadonlyMap<string, FxImage> {
  const images = new Map<string, FxImage>()
  for (const [key, size] of Object.entries(FX_IMAGE_SIZES)) {
    const url = manifest[key]
    if (typeof url === 'string' && url.length > 0) images.set(key, { url, w: size.w, h: size.h })
  }
  return images
}
