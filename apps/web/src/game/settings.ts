// Ajustes persistentes (SPEC-D/T-034/AC-3): velocidad de animación, sonido
// (placeholder, desactivado), reducir movimiento y semilla visible. Se
// validan con Zod en la frontera del storage; valor inválido ⇒ defaults.
import { z } from 'zod'
import type { PlaybackSpeed } from '../events/anim.config'
import type { StorageLike } from './save'

export const SETTINGS_KEY = 'liga-pkm:settings'

export interface GameSettings {
  readonly speed: PlaybackSpeed
  readonly sound: boolean
  readonly reducedMotion: boolean
  /** T-062/AC-8: selector manual de tablero; sin WebGL se cae al 2D igual. */
  readonly board: '3d' | '2d'
}

export const DEFAULT_SETTINGS: GameSettings = { speed: '1x', sound: false, reducedMotion: false, board: '3d' }

const SettingsSchema = z.object({
  speed: z.enum(['1x', '2x', 'skip']),
  sound: z.boolean(),
  reducedMotion: z.boolean(),
  // .default(): saves anteriores (sin la clave) siguen siendo válidos.
  board: z.enum(['3d', '2d']).default('3d'),
})

export function readSettings(storage: StorageLike): GameSettings {
  const raw = storage.getItem(SETTINGS_KEY)
  if (raw === null) return DEFAULT_SETTINGS
  try {
    const parsed = SettingsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function writeSettings(storage: StorageLike, settings: GameSettings): void {
  storage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

/** Storage del navegador; null en SSR/tests (se usa el de memoria inyectado). */
export const createBrowserStorage = (): StorageLike | null => {
  if (typeof localStorage !== 'object' || localStorage === null) return null
  return {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => {
      localStorage.setItem(key, value)
    },
    removeItem: (key) => {
      localStorage.removeItem(key)
    },
  }
}
