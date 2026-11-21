// Referencia PokeAPI (T-045): esquemas de content/reference/pokeapi/*.json (bajados con
// `pnpm pokeapi`, gitignored) + chequeos cruzados dex↔nombre↔tipo y evoluciones (AC-2).
import { z } from 'zod'
import { ELEMENTS, ElementSchema, type Element, type PokemonCard } from './cards.ts'

// 18 tipos de PokeAPI; el juego usa 15 (sin dark/steel/fairy). Se guardan crudos.
export const POKEAPI_TYPES = [
  'normal', 'fire', 'water', 'grass', 'electric', 'psychic', 'fighting', 'poison',
  'ground', 'flying', 'bug', 'ghost', 'ice', 'dragon', 'rock', 'dark', 'steel', 'fairy',
] as const
export const PokeApiTypeSchema = z.enum(POKEAPI_TYPES)
export type PokeApiType = z.infer<typeof PokeApiTypeSchema>

export const SpeciesEntrySchema = z.object({
  dex: z.number().int().min(1).max(151),
  nameEn: z.string().min(1),
  nameEs: z.string().min(1),
  types: z.array(PokeApiTypeSchema).min(1).max(2),
})
export const SpeciesFileSchema = z.object({
  _comment: z.string().optional(),
  species: z.array(SpeciesEntrySchema),
})
export type SpeciesEntry = z.infer<typeof SpeciesEntrySchema>

export const MoveEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  nameEn: z.string().min(1),
  nameEs: z.string().min(1),
  type: PokeApiTypeSchema,
})
export const MovesFileSchema = z.object({
  _comment: z.string().optional(),
  moves: z.array(MoveEntrySchema),
})
export type MoveEntry = z.infer<typeof MoveEntrySchema>

export const EvolutionTargetSchema = z.object({
  dex: z.number().int().min(1).max(151),
  nameEn: z.string().min(1),
  nameEs: z.string().min(1),
})
export const SpeciesEvolutionsSchema = z.object({
  dex: z.number().int().min(1).max(151),
  nameEn: z.string().min(1),
  evolvesTo: z.array(EvolutionTargetSchema),
})
export const EvolutionsFileSchema = z.object({
  _comment: z.string().optional(),
  evolutions: z.array(SpeciesEvolutionsSchema),
})
export type SpeciesEvolutions = z.infer<typeof SpeciesEvolutionsSchema>

/** Nombre comparable: minúsculas, sin acentos ni símbolos ("Nidoran♀"→"nidoran"). */
export function normalizeName(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

const ELEMENT_SET: ReadonlySet<string> = new Set(ELEMENTS)

/**
 * Traduce un tipo PokeAPI al elemento del juego. Gen 1 no tenía fairy/dark/steel:
 * las especies fairy (línea Clefairy, etc.) son cartas "normal" (default Q-023);
 * dark/steel no aparecen como primario en especies de Gen 1 ⇒ null.
 */
export function typeToElement(type: PokeApiType): Element | null {
  if (ELEMENT_SET.has(type)) {
    const parsed = ElementSchema.safeParse(type)
    return parsed.success ? parsed.data : null
  }
  return type === 'fairy' ? 'normal' : null
}

/** Estructura mínima de un archivo de cartas cargado (compatible con PokemonFileLoaded). */
export interface LoadedFileRef {
  file: string
  cards: PokemonCard[]
  pending: string[]
}

// ── Chequeos cruzados (AC-2): dex↔nombre↔tipo y evoluciones contra la referencia. ──
export function crossCheckReference(
  files: readonly LoadedFileRef[],
  species: readonly SpeciesEntry[],
  evolutions: readonly SpeciesEvolutions[],
): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  if (species.length > 0 && species.length !== 151) {
    warnings.push(`referencia pokeapi incompleta: ${species.length}/151 especies — corré pnpm pokeapi de nuevo`)
  }
  const byDex = new Map(species.map((s) => [s.dex, s]))
  const evoByDex = new Map(evolutions.map((e) => [e.dex, e]))
  for (const f of files) {
    for (const card of f.cards) {
      const sp = byDex.get(card.dex)
      if (sp === undefined) {
        errors.push(`${f.file}#${card.id}: dex ${card.dex} no está en la referencia (corré pnpm pokeapi)`)
        continue
      }
      const wanted = [normalizeName(sp.nameEn), normalizeName(sp.nameEs)]
      if (!wanted.includes(normalizeName(card.name))) {
        errors.push(`${f.file}#${card.id}: dex ${card.dex} es "${sp.nameEn}" (es: "${sp.nameEs}"), la carta dice "${card.name}"`)
      }
      const els = sp.types.map(typeToElement).filter((e): e is Element => e !== null)
      if (!els.includes(card.element)) {
        errors.push(`${f.file}#${card.id}: "${card.name}" es ${sp.types.join('/')} en la referencia, la carta usa "${card.element}"`)
      }
      if (card.evolvesTo.length > 0) {
        const evo = evoByDex.get(card.dex)
        if (evo === undefined) {
          errors.push(`${f.file}#${card.id}: sin datos de evolución para dex ${card.dex} en la referencia`)
        } else {
          for (const target of card.evolvesTo) {
            const tn = normalizeName(target.id)
            const match = evo.evolvesTo.find((t) => tn === normalizeName(t.nameEn) || tn === normalizeName(t.nameEs))
            if (match === undefined) {
              const valid = evo.evolvesTo.map((t) => t.nameEn).join(', ')
              errors.push(
                `${f.file}#${card.id}: evolvesTo "${target.id}" no es evolución de ${sp.nameEn} según la referencia (evoluciona a: ${valid.length > 0 ? valid : 'nada'})`,
              )
            }
          }
        }
      }
    }
  }
  return { errors, warnings }
}

// ── Orquestación de la lectura: valida los 3 archivos y cruza con las cartas. ──
export interface ReferenceCheck {
  errors: string[]
  warnings: string[]
  /** moves.json parseado (para el chequeo de officialMove); null si falta o es inválido. */
  moves: MoveEntry[] | null
}

const issueLines = (file: string, error: z.ZodError): string[] =>
  error.issues.map((i) => `content/reference/pokeapi/${file}: ${i.path.join('.')}: ${i.message}`)

export function checkReferenceFiles(
  read: (name: string) => unknown | undefined | null,
  files: readonly LoadedFileRef[],
): ReferenceCheck {
  const errors: string[] = []
  const warnings: string[] = []
  const speciesRaw = read('species.json')
  const movesRaw = read('moves.json')
  const evoRaw = read('evolutions.json')

  let moves: MoveEntry[] | null = null
  if (movesRaw !== undefined && movesRaw !== null) {
    const m = MovesFileSchema.safeParse(movesRaw)
    if (!m.success) errors.push(...issueLines('moves.json', m.error))
    else moves = m.data.moves
  }

  if (speciesRaw !== undefined || evoRaw !== undefined) {
    if (speciesRaw === undefined || speciesRaw === null || evoRaw === undefined || evoRaw === null) {
      errors.push('content/reference/pokeapi: referencia incompleta (faltan species.json/evolutions.json) — corré pnpm pokeapi')
    } else {
      const s = SpeciesFileSchema.safeParse(speciesRaw)
      const e = EvolutionsFileSchema.safeParse(evoRaw)
      if (!s.success) errors.push(...issueLines('species.json', s.error))
      if (!e.success) errors.push(...issueLines('evolutions.json', e.error))
      if (s.success && e.success) {
        const check = crossCheckReference(files, s.data.species, e.data.evolutions)
        errors.push(...check.errors)
        warnings.push(...check.warnings)
      }
    }
  }

  return { errors, warnings, moves }
}
