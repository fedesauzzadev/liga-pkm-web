// Ajuste del sprite del PKM en el recuadro de arte (SPEC-U/T-105/AC-2): una
// sola regla de escala para todas las cartas — los chicos suben hasta el tope
// `maxScale`, los grandes llenan un `fill` de la caja sin desbordar ni
// deformarse. Config en content/ui/card-art.json (nada de medidas mágicas).
import { CardArtSchema, type CardArt } from '@liga/content'
import cardArtJson from '../../../../content/ui/card-art.json'

export const cardArtConfig: CardArt = CardArtSchema.parse(cardArtJson)

export interface SpriteSize {
  readonly width: number
  readonly height: number
}

/** Config de escala de una caja: `fill` deja margen, `maxScale` tope anti-pixelado. */
export interface SpriteFitScale {
  readonly fill: number
  readonly maxScale: number
}

/**
 * fitSprite (AC-2): `fitScale = min(anchoCaja/anchoNatural, altoCaja/altoNatural)`;
 * `escala = min(fitScale · fill, maxScale)`. Devuelve px enteros con la
 * proporción conservada; piso de 1 px (un ajuste a sub-píxel no invisible).
 * Pura: sin DOM, sin estado, sin azar.
 */
export function fitSprite(natural: SpriteSize, box: SpriteSize, cfg: SpriteFitScale): SpriteSize {
  const fitScale = Math.min(box.width / natural.width, box.height / natural.height)
  const scale = Math.min(fitScale * cfg.fill, cfg.maxScale)
  return {
    width: Math.max(1, Math.round(natural.width * scale)),
    height: Math.max(1, Math.round(natural.height * scale)),
  }
}
