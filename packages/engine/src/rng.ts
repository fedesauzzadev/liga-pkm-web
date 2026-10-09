// RNG determinista (mulberry32): el único azar del motor entra por esta interfaz
// inyectada en Ctx (AGENTS.md: packages/engine no usa Math.random).
import type { Face } from '@liga/content'

export interface Rng {
  /** Próxima tirada de dado (D-13: todas las tiradas son 1d6). */
  d6(): Face
  /** Entero uniforme en [0, maxExclusive) — p. ej. barajar mazos. Comparte stream con d6(). */
  int(maxExclusive: number): number
  /** Estado interno actual; `createRng(rng.snapshot())` reanuda la secuencia. */
  snapshot(): number
}

export function createRng(seed: number): Rng {
  let a = seed | 0
  const nextUint32 = (): number => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return (t ^ (t >>> 14)) >>> 0
  }
  return {
    d6: () => (nextUint32() % 6) + 1,
    int: (maxExclusive: number): number => {
      if (!Number.isInteger(maxExclusive) || maxExclusive < 2) {
        throw new Error(`Rng.int espera un entero >= 2, recibio ${String(maxExclusive)}`)
      }
      // Rechazo para evitar sesgo de modulo (determinista: mismo stream).
      const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive
      let value = nextUint32()
      while (value >= limit) value = nextUint32()
      return value % maxExclusive
    },
    snapshot: () => a >>> 0,
  }
}
