// Modo desarrollo (T-061/AC-4): ?seed=<n> fuerza la semilla del setup y
// ?dice=3,5,1 sirve valores de dado en orden (la cola vive acá, no en el motor).
// Solo fuera de producción: en build de producción no hay window de búsqueda y
// las factory devuelven el RNG normal del motor.
import { createRng, type Rng } from '@liga/engine'

const DEV = import.meta.env.DEV

/** Plan probar-encuentro-abra: ¿se exponen las herramientas dev? (solo DEV). */
export const devToolsEnabled = (): boolean => DEV

const searchOf = (): string => {
  if (!DEV || typeof window === 'undefined') return ''
  return window.location.search
}

/** Parsea los overrides de dev (puro, para tests): seed y dados forzados [1-6]. */
export function parseDevOverrides(search: string): {
  readonly seed: number | null
  readonly dice: readonly number[]
} {
  const params = new URLSearchParams(search)
  const rawSeed = params.get('seed')
  const parsedSeed = rawSeed === null ? Number.NaN : Number.parseInt(rawSeed, 10)
  const seed = Number.isInteger(parsedSeed) && parsedSeed >= 0 ? parsedSeed : null
  const dice = (params.get('dice') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^[1-6]$/.test(value))
    .map((value) => Number.parseInt(value, 10))
  return { seed, dice }
}

/** Semilla forzada por ?seed= (null si no vino o no es válida). */
export function devSeed(): number | null {
  return parseDevOverrides(searchOf()).seed
}

/**
 * Fábrica de RNG con dados forzados: d6() sirve la cola en orden y después
 * delega en el stream real (int/snapshot siempre delegan). La cola se consume
 * de forma global, igual que el juego: una por tirada, a través de comandos.
 */
export function createDevRng(dice: readonly number[]): (seed: number) => Rng {
  let cursor = 0
  return (seed: number): Rng => {
    const base = createRng(seed)
    return {
      d6: () => {
        if (cursor < dice.length) return dice[cursor++]! as ReturnType<Rng['d6']>
        return base.d6()
      },
      int: (maxExclusive: number): number => base.int(maxExclusive),
      snapshot: (): number => base.snapshot(),
    }
  }
}

const overrides = parseDevOverrides(searchOf())

/** RNG de dev con los dados de ?dice (null si no hay forzados o en producción). */
export const devRng: ((seed: number) => Rng) | null = overrides.dice.length > 0
  ? createDevRng(overrides.dice)
  : null
