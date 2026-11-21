// Composición de mazos. Dos formatos:
// - `content/decks.json` (DecksFileSchema): las cantidades confirmadas por el
//   dueño (energías por mazo, ítems, Sorpresa) + listas `pokemon` que completa
//   T-042c a partir de las fotos. D-14.
// - `content/decks.dev.json` (DeckListSchema): mazos de desarrollo (devOnly,
//   tools/gen-dev-decks.ts T-044) mientras el real no está completo.
import { z } from 'zod'
import { DECK_IDS, ElementSchema, type DeckId } from './cards.ts'
import type { EnergyFile } from './energy.ts'

// ── Formato real (content/decks.json)

const TerrainDeckSpecSchema = z.object({
  photo: z.string().optional(),
  energy: z.partialRecord(ElementSchema, z.number().int().min(0)),
  expectedPokemonInPhoto: z.number().int().min(0),
  expectedTotal: z.number().int().min(0),
  pokemon: z.array(z.string().min(1)), // ids de cartas; las completa T-042c
})
export type TerrainDeckSpec = z.infer<typeof TerrainDeckSpecSchema>

const ItemDeckSpecSchema = z.object({
  multicolor: z.number().int().min(0),
  potion: z.number().int().min(0),
  pokeball: z.number().int().min(0),
  oportunidad: z.number().int().min(0),
  total: z.number().int().min(0),
})
export type ItemDeckSpec = z.infer<typeof ItemDeckSpecSchema>

const SorpresaDeckSpecSchema = z.object({
  super_potion: z.number().int().min(0),
  ultraball: z.number().int().min(0),
  masterball: z.number().int().min(0),
  expectedPokemonInPhoto: z.number().int().min(0),
  expectedTotal: z.number().int().min(0),
  pokemon: z.array(z.string().min(1)),
})
export type SorpresaDeckSpec = z.infer<typeof SorpresaDeckSpecSchema>

export const DecksFileSchema = z.object({
  _status: z.string().optional(),
  _check: z.string().optional(),
  terrain: z.object({
    bosque: TerrainDeckSpecSchema,
    montana: TerrainDeckSpecSchema,
    isla: TerrainDeckSpecSchema,
    llanura: TerrainDeckSpecSchema,
    pantano: TerrainDeckSpecSchema,
  }),
  item: ItemDeckSpecSchema,
  sorpresa: SorpresaDeckSpecSchema,
  evolucion: z.object({
    photos: z.array(z.string()),
    expectedPokemonInPhotos: z.number().int().min(0),
    pokemon: z.array(z.string().min(1)),
  }),
  gimnasio: z.object({
    photos: z.array(z.string()),
    leaders: z.number().int().min(0),
    expectedCardsInPhotos: z.number().int().min(0),
  }),
  liga: z.object({
    photos: z.array(z.string()),
    trainers: z.number().int().min(0),
    expectedCardsInPhotos: z.number().int().min(0),
  }),
  iniciales: z.object({ photo: z.string().optional(), note: z.string().optional() }),
})
export type DecksFile = z.infer<typeof DecksFileSchema>

// ── Formato de desarrollo (content/decks.dev.json, T-044)

export const DeckKeySchema = z.enum([...DECK_IDS, 'item', 'sorpresa'] as const)
export type DeckKey = z.infer<typeof DeckKeySchema>
/** Todas las pilas de robo (5 mazos de elemento + mazo Ítem + mazo Sorpresa, T-049). */
export const DECK_KEYS = [...DECK_IDS, 'item', 'sorpresa'] as const

export const DeckEntrySchema = z.object({
  id: z.string().min(1), // id de carta de PKM o de carta de elemento ("element_water")
  count: z.number().int().min(1),
})
export type DeckEntry = z.infer<typeof DeckEntrySchema>

export const DeckSpecSchema = z.object({
  entries: z.array(DeckEntrySchema),
  devOnly: z.boolean().optional(), // mazo de desarrollo (tools/gen-dev-decks.ts, T-044)
})
export type DeckSpec = z.infer<typeof DeckSpecSchema>

export const DeckListSchema = z.object({
  decks: z.record(DeckKeySchema, DeckSpecSchema),
})
export type DeckList = z.infer<typeof DeckListSchema>

// ── Chequeos cruzados (SPEC-F/T-002b AC-3/AC-4)

/** Energías por mazo confirmadas por el dueño (D-14). */
export const EXPECTED_TERRAIN_ENERGY: Readonly<Record<DeckId, number>> = {
  bosque: 40,
  montana: 40,
  isla: 38,
  llanura: 38,
  pantano: 40,
}

export interface DeckTotal {
  deck: DeckId
  /** Cartas de energía del mazo. */
  energy: number
  /** PKM cargados en la lista `pokemon`. */
  pkm: number
  total: number
  expected: number
}

export function deckTotals(decks: DecksFile): Record<DeckId, DeckTotal> {
  const out = {} as Record<DeckId, DeckTotal>
  for (const deck of DECK_IDS) {
    const spec = decks.terrain[deck]
    const energy = Object.values(spec.energy).reduce((a, b) => a + b, 0)
    out[deck] = {
      deck,
      energy,
      pkm: spec.pokemon.length,
      total: energy + spec.pokemon.length,
      expected: spec.expectedTotal,
    }
  }
  return out
}

/**
 * AC-3: energías por mazo = 40/40/38/38/40 · mazo Ítem = 60 · no-PKM de
 * Sorpresa = 12 · todo tipo de energía existe en energy.json con
 * `energyCard:true`. AC-4: warning VERIFY (sin fallar) si un mazo cuyo
 * `pokemon` ya está completo no suma `expectedTotal` (esperado: isla 58,
 * pantano 59 hasta aclararlo con el dueño).
 */
export function crossCheckDecks(
  decks: DecksFile,
  energy: EnergyFile,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  const byId = new Map(energy.types.map((type) => [type.id, type]))
  if (byId.size !== energy.types.length) {
    errors.push('content/energy.json: tipos de energía duplicados')
  }

  for (const deck of DECK_IDS) {
    const spec = decks.terrain[deck]
    for (const element of Object.keys(spec.energy)) {
      const type = byId.get(element as (typeof energy.types)[number]['id'])
      if (type === undefined) {
        errors.push(`content/decks.json: energía "${element}" del mazo ${deck} no existe en energy.json`)
      } else if (!type.energyCard) {
        errors.push(`content/energy.json: "${element}" se usa en ${deck} pero tiene energyCard:false`)
      }
    }
    const total = deckTotals(decks)[deck]!
    if (total.energy !== EXPECTED_TERRAIN_ENERGY[deck]) {
      errors.push(
        `content/decks.json: mazo ${deck} tiene ${total.energy} energías, se esperaban ${EXPECTED_TERRAIN_ENERGY[deck]}`,
      )
    }
    if (spec.pokemon.length >= spec.expectedPokemonInPhoto && total.total !== total.expected) {
      // PKM ya cargados y el mazo no cierra: VERIFY (no falla) — AC-4.
      warnings.push(
        `VERIFY content/decks.json: mazo ${deck} suma ${total.total} ≠ ${total.expected} con los PKM cargados`,
      )
    }
  }

  const item = decks.item
  const itemSum = item.multicolor + item.potion + item.pokeball + item.oportunidad
  if (itemSum !== 60 || item.total !== 60) {
    errors.push(`content/decks.json: mazo Ítem suma ${itemSum} (total: ${item.total}), se esperaban 60`)
  }

  const sorpresa = decks.sorpresa
  const sorpresaItems = sorpresa.super_potion + sorpresa.ultraball + sorpresa.masterball
  if (sorpresaItems !== 12) {
    errors.push(`content/decks.json: Sorpresa sin PKM suma ${sorpresaItems}, se esperaban 12`)
  }

  return { errors, warnings }
}
