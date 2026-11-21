// Pilas de mazos del tablero (content/board/deck-stacks.json) validadas con
// Zod en la frontera (estándar §2). Solo lo consume el chunk 3D (ADR-8).
// T-090/AC-1: los pedestales Ítem/Sorpresa se quitaron (placements.removeStacks);
// solo quedan los 5 paneles de terreno.
import { z } from 'zod'
import type { DeckId } from '@liga/content'
import deckStacksJson from '../../../../content/board/deck-stacks.json'

const RectSchema = z.object({
  x: z.number().positive(),
  y: z.number().positive(),
  w: z.number().positive(),
  h: z.number().positive(),
  label: z.string().min(1),
  symbol: z.string().min(1),
})

const DeckStacksSchema = z.object({
  stacks: z.record(z.string().min(1), RectSchema),
})

export interface DeckRect {
  readonly key: string
  readonly deck: DeckId
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly label: string
  readonly symbol: string
}

export interface DeckStacksFile {
  readonly panels: readonly DeckRect[]
}

const parsed = DeckStacksSchema.parse(deckStacksJson)

export const deckStacks: DeckStacksFile = {
  panels: Object.entries(parsed.stacks).map(([key, rect]) => ({ key, deck: key as DeckId, ...rect })),
}
