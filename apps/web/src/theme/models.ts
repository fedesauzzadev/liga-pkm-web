// Colores neutros por kind de decoración (T-086/AC-2 + AC-5): cuando un modelo
// no tiene textura cargada (o su Kd es negro puro), el material usa el color
// neutro del kind — NUNCA negro. Valores en theme (NO-VISION §6); el catálogo
// de kinds vive en @liga/content y este Record exhaustivo obliga a cubrirlos.
import type { DecorKind } from '@liga/content'

/** Color neutro de referencia (gris medio) para kinds desconocidos/sin color. */
export const NEUTRAL_MODEL_FALLBACK = '#C9C9C9'

/** Color neutro por kind: tonos apagados del material típico (madera, piedra,
 *  hoja, agua…). Ninguno es negro puro: un `map` ausente no puede verse negro. */
export const NEUTRAL_MODEL_COLORS: Readonly<Record<DecorKind, string>> = {
  house: '#EADBB8',
  pokecenter: '#E8DCC8',
  market: '#DFD0B4',
  lab: '#E4DCC8',
  gym: '#C2B9A6',
  tree: '#6E8F5A',
  deadTree: '#8A7B6A',
  bush: '#6E8F5A',
  rock: '#A9A296',
  mountain: '#9A938A',
  pond: '#8FB6D8',
  reeds: '#8FA87A',
  grassTuft: '#8DBF6A',
  flowerPatch: '#D9A9C0',
  lavaPool: '#C98A5A',
  mist: '#C9CDD4',
  fence: '#A98A6A',
  sign: '#A98A6A',
  lamp: '#C9CDD4',
  flag: '#C9A96A',
}

/** Color neutro del kind (AC-2): `null`/desconocido ⇒ gris de referencia. */
export const neutralModelColor = (kind: DecorKind | null | undefined): string =>
  kind === null || kind === undefined ? NEUTRAL_MODEL_FALLBACK : NEUTRAL_MODEL_COLORS[kind]

/** ¿Es negro puro (#000000)? Lo que nunca debe quedar sin textura (AC-5). */
export const isPureBlackColor = (hex: string): boolean =>
  /^#0{3}$|^#0{6}$/i.test(hex.trim())
