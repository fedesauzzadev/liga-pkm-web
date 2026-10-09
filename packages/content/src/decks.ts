// Composición de mazos (content/decks.json): ids y cantidades.
// D-14: la lista real sale de la ingesta; mientras tanto, mazos de desarrollo (devOnly).
import { z } from 'zod'
import { DECK_IDS } from './cards.ts'

export const DeckKeySchema = z.enum([...DECK_IDS, 'item'] as const)
export type DeckKey = z.infer<typeof DeckKeySchema>
/** Todas las pilas de robo (5 mazos de elemento + mazo Ítem), p. ej. para invariantes. */
export const DECK_KEYS = [...DECK_IDS, 'item'] as const

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
