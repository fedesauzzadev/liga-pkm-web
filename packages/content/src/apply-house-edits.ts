// Aplicación de ediciones de la casa (SPEC-F/T-048, D-26): función PURA que
// comparten el loader Node (validate.ts) y la carga de la UI (apps/web). Recibe
// las cartas originales y los archivos de ediciones ya parseados; devuelve
// copias editadas (los originales nunca se tocan ni se escriben a disco) y
// errores con el id de la edición y el archivo (AC-3).
import { PokemonCardSchema, type PokemonCard } from './cards.ts'
import { HouseEditsFileSchema, type HouseEdit, type HouseEditsFile } from './house-edits.ts'

/** Un archivo de ediciones parseado (doc ya validado con HouseEditsFileSchema). */
export interface HouseEditSource {
  readonly file: string
  readonly doc: HouseEditsFile
}

/** Un archivo de ediciones SIN parsear (doc crudo, ej. módulo JSON de Vite). */
export interface HouseEditDocInput {
  readonly file: string
  readonly doc: unknown
}

export interface HouseEditsResult {
  readonly cards: PokemonCard[]
  readonly errors: string[]
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Fusión profunda de objetos planos (SPEC-F/T-048/AC-2: `attacks.<id>` fusiona,
 * no reemplaza); los arrays y primitivas del parche reemplazan al original. */
function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch as T
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    const base = out[key]
    out[key] = isPlainObject(value) && isPlainObject(base) ? deepMerge(base, value) : value
  }
  return out as T
}

/** Aplica una edición sobre una copia de la carta. Devuelve null (y reporta el
 * error) si la edición es estructuralmente inválida: target/ataque inexistente
 * o ataque duplicado en addAttacks. */
function applyEdit(
  card: PokemonCard,
  edit: HouseEdit,
  report: (message: string) => void,
): Record<string, unknown> | null {
  const working = structuredClone(card) as unknown as Record<string, unknown>
  const attacks: Record<string, unknown>[] = (working.attacks as Record<string, unknown>[]).map(
    (attack) => ({ ...attack }),
  )

  if (edit.set !== undefined) {
    for (const [key, value] of Object.entries(edit.set)) working[key] = value
  }

  if (edit.attacks !== undefined) {
    for (const [attackId, patch] of Object.entries(edit.attacks)) {
      const index = attacks.findIndex((attack) => attack.id === attackId)
      if (index === -1) {
        report(`el ataque "${attackId}" no existe en la carta "${card.id}"`)
        return null
      }
      const base = attacks[index]
      if (base !== undefined) attacks[index] = deepMerge(base, patch)
    }
  }

  let nextAttacks = attacks
  const remove = edit.removeAttacks
  if (remove !== undefined && remove.length > 0) {
    for (const attackId of remove) {
      if (!nextAttacks.some((attack) => attack.id === attackId)) {
        report(`removeAttacks: el ataque "${attackId}" no existe en la carta "${card.id}"`)
        return null
      }
    }
    nextAttacks = nextAttacks.filter((attack) => !remove.some((id) => id === attack.id))
  }

  if (edit.addAttacks !== undefined) {
    for (const attack of edit.addAttacks) {
      if (nextAttacks.some((existing) => existing.id === attack.id)) {
        report(`addAttacks: el ataque "${attack.id}" ya existe en la carta "${card.id}"`)
        return null
      }
      nextAttacks.push(structuredClone(attack) as unknown as Record<string, unknown>)
    }
  }

  working.attacks = nextAttacks
  // AC-2: la carta editada queda marcada (solo en memoria).
  const source = isPlainObject(working.source) ? { ...working.source } : {}
  source.houseEdited = true
  source.editId = edit.id
  working.source = source
  return working
}

/**
 * Aplica los archivos de ediciones sobre las cartas: orden alfabético por
 * archivo y por `edits[]` dentro de cada archivo (AC-1); las ediciones encadenan
 * (un archivo parte del resultado del anterior). Cada resultado se revalida con
 * Zod (AC-2); la primera edición inválida de una carta se descarta y se reporta.
 */
export function applyHouseEdits(
  cards: readonly PokemonCard[],
  sources: readonly HouseEditSource[],
): HouseEditsResult {
  const errors: string[] = []
  const byId = new Map<string, PokemonCard>()
  for (const card of cards) byId.set(card.id, card)

  const sorted = [...sources].sort((a, b) => a.file.localeCompare(b.file))
  for (const source of sorted) {
    for (const edit of source.doc.edits) {
      const target = byId.get(edit.target)
      if (target === undefined) {
        errors.push(`${source.file}#${edit.id}: la carta "${edit.target}" no existe`)
        continue
      }
      const working = applyEdit(target, edit, (message) => {
        errors.push(`${source.file}#${edit.id}: ${message}`)
      })
      if (working === null) continue
      const check = PokemonCardSchema.safeParse(working)
      if (!check.success) {
        errors.push(
          `${source.file}#${edit.id}: la carta editada no valida — ` +
            check.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
        )
        continue
      }
      byId.set(edit.target, check.data)
    }
  }

  return { cards: cards.map((card) => byId.get(card.id) ?? card), errors }
}

/**
 * T-048b — resuelve las ediciones para la carga de la UI SIN romper la app:
 * parsea cada doc (safeParse), aplica los `enabled` con `applyHouseEdits` y
 * devuelve cartas + errores combinados. Los archivos con esquema inválido y
 * las ediciones que no aplican se reportan y se saltean (degradación, no
 * todo-o-nada); `content:validate` sigue fallando en CI. Nunca lanza.
 */
export function resolveHouseEdits(
  cards: readonly PokemonCard[],
  docs: readonly HouseEditDocInput[],
  featureEnabled: boolean,
): HouseEditsResult {
  if (!featureEnabled) return { cards: [...cards], errors: [] }
  const errors: string[] = []
  const sources: HouseEditSource[] = []
  for (const input of docs) {
    const parsed = HouseEditsFileSchema.safeParse(input.doc)
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')
      errors.push(`${input.file}: esquema inválido — ${detail}`)
      continue
    }
    if (parsed.data.enabled) sources.push({ file: input.file, doc: parsed.data })
  }
  const applied = applyHouseEdits(cards, sources)
  return { cards: applied.cards, errors: [...errors, ...applied.errors] }
}
