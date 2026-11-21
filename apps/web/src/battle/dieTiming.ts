// Duración REAL de una tirada del dado de combate (fix-animacion-dados-combate/
// AC-3, AC-4): la coreografía debe esperar exactamente lo que rueda el dado en
// pantalla (misma fórmula y misma seed), sin doble escalado por el factor de
// velocidad de `Timing`. Puro, sin DOM ni React: lo comparten la UI del dado
// (BattleDie) y la espera del coreógrafo (choreo/timing.ts).
export type DieSpeed = '1x' | '2x' | 'skip'

export const DIE_ROLL_1X_MS = 1600
export const DIE_ROLL_2X_MS = 800
export const DIE_FADE_MS = 200
/** Margen para que la cara final quede asentada antes del siguiente evento. */
export const DIE_ROLL_SETTLE_MS = 120
/** arreglar-dados-combate/AC-3: la coreografía patchea el dado pero React lo
 * dispara recién en el efecto del slot (≥ 1 render/commit después) — la espera
 * cubre ese retardo para que ningún evento posterior se adelante al giro. */
export const DIE_EFFECT_DELAY_MS = 80

/** Fracción determinista [0,1) de la seed (hash entero; sin azar). */
export const seedFraction = (seed: number): number => {
  const mixed = Math.abs(Math.trunc(seed * 2654435761 + 0x9e3779b9)) % 1000
  return mixed / 1000
}

/** Duración escalada ±10 % por seed (1600 a 1×, 800 a 2×, 0 skip). */
export function rollDurationMs(seed: number, speed: DieSpeed): number {
  if (speed === 'skip') return 0
  const base = speed === '2x' ? DIE_ROLL_2X_MS : DIE_ROLL_1X_MS
  return Math.round(base * (0.9 + 0.2 * seedFraction(seed)))
}

/** Espera del coreógrafo para no pisar la tirada (arreglar-dados-combate/AC-3):
 * 0 con skip, el fundido con reducedMotion (pacing; el dado corta al instante)
 * y tirada real + retardo disparo→efecto + asentamiento en los otros casos. */
export function dieRollWaitMs(seed: number, speed: DieSpeed, reducedMotion: boolean): number {
  if (speed === 'skip') return 0
  if (reducedMotion) return DIE_FADE_MS
  return rollDurationMs(seed, speed) + DIE_EFFECT_DELAY_MS + DIE_ROLL_SETTLE_MS
}
