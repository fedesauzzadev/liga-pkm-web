// Guardado en localStorage (SPEC-D/T-034/AC-2): {version, seed, starterDeck,
// commandLog, stateHash}. Zod en la frontera (estándar §2: partida guardada se
// valida, nunca `as`); el storage se inyecta para tests/SSR. El hash permite
// verificar al continuar que el replay reproduce el estado guardado.
import { z } from 'zod'
import { DeckIdSchema, type DeckId } from '@liga/content'
import type { Command, GameState } from '@liga/engine'

export const SAVE_VERSION = 1
export const SAVE_KEY = 'liga-pkm:save'

/** Subset de localStorage suficiente (inyectable en tests/SSR). */
export interface StorageLike {
  readonly getItem: (key: string) => string | null
  readonly setItem: (key: string, value: string) => void
  readonly removeItem: (key: string) => void
}

export interface SaveData {
  readonly version: number
  readonly seed: number
  readonly starterDeck: DeckId
  readonly commandLog: readonly Command[]
  readonly stateHash: string
  /** T-048: hash del contenido CON ediciones de la casa al momento de guardar;
   * ausente en saves pre-T-048 (no bloquea la carga). */
  readonly contentHash?: string | undefined
}

/** La validación fina de cada comando la hace el motor al reaplicar; acá solo
 * garantizamos la forma mínima (objeto con `type` string). */
const isCommand = (value: unknown): value is Command =>
  typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'

const SaveDataSchema = z.object({
  version: z.number().int(),
  seed: z.number().int(),
  starterDeck: DeckIdSchema,
  commandLog: z.array(z.custom<Command>(isCommand)),
  stateHash: z.string().min(1),
  contentHash: z.string().min(1).optional(),
})

const VersionProbeSchema = z.object({ version: z.number().int() })

export type SaveRead =
  | { readonly kind: 'none' }
  | { readonly kind: 'ok'; readonly save: SaveData }
  | { readonly kind: 'unknown-version'; readonly found: number }
  | { readonly kind: 'invalid' }

export function readSave(storage: StorageLike): SaveRead {
  const raw = storage.getItem(SAVE_KEY)
  if (raw === null) return { kind: 'none' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: 'invalid' }
  }
  const probe = VersionProbeSchema.safeParse(parsed)
  if (probe.success && probe.data.version !== SAVE_VERSION) {
    return { kind: 'unknown-version', found: probe.data.version }
  }
  const full = SaveDataSchema.safeParse(parsed)
  if (!full.success) return { kind: 'invalid' }
  return { kind: 'ok', save: full.data }
}

export function writeSave(storage: StorageLike, save: SaveData): void {
  storage.setItem(SAVE_KEY, JSON.stringify(save))
}

export function clearSave(storage: StorageLike): void {
  storage.removeItem(SAVE_KEY)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** JSON canónico (claves ordenadas) para que el hash no dependa del orden. */
const canonical = (value: unknown): string => {
  if (isRecord(value)) {
    const keys = Object.keys(value).sort()
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return JSON.stringify(value) ?? 'null'
}

/** FNV-1a 32 bits sobre el JSON canónico del estado (verificación al continuar). */
const fnv1a = (text: string): string => {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export const hashState = (state: GameState): string => hashJson(state)

/** FNV-1a sobre el JSON canónico de cualquier valor serializable (T-048:
 * `contentHash` del contenido CON ediciones de la casa). */
export const hashJson = (value: unknown): string => fnv1a(canonical(value))

export const createMemoryStorage = (): StorageLike => {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
}
