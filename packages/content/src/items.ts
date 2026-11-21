// Ítems (content/items.json, SPEC-F/T-002b). Cantidades confirmadas por el
// dueño; efectos de captura y Oportunidad: RULES.md D-12, D-19, D-21.
import { z } from 'zod'
import { FacesSchema } from './effects.ts'

/** Momento en que una bola puede capturar (D-12). */
export const CaptureTimingSchema = z.enum(['afterDefeat', 'duringBattle'])
export type CaptureTiming = z.infer<typeof CaptureTimingSchema>

/** Reglas de captura de cada bola (ruleset.capture / items.json). */
export const CaptureRuleSchema = z.object({
  timing: CaptureTimingSchema,
  maxRemainingHp: z.number().int().min(0).optional(), // Ultra Ball: hp − daño ≤ 40
  guaranteed: z.boolean().optional(), // Master Ball
})
export type CaptureRule = z.infer<typeof CaptureRuleSchema>

/** Efecto de un ítem (vocabulario propio de ítems, no de ataques). */
export const ItemEffectSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('heal'), amount: z.union([z.number().int().min(0), z.literal('all')]) }),
  z.object({
    op: z.literal('rollDraw'),
    faces: FacesSchema,
    from: z.literal('sorpresa'),
    minMedals: z.number().int().min(0),
  }),
])
export type ItemEffect = z.infer<typeof ItemEffectSchema>

export const ItemKindSchema = z.enum(['energy', 'consumable', 'ball'])
export type ItemKind = z.infer<typeof ItemKindSchema>

export const ItemSchema = z.object({
  id: z.string().min(1),
  es: z.string().min(1),
  deck: z.enum(['item', 'sorpresa']),
  copies: z.number().int().min(1),
  kind: ItemKindSchema,
  effect: ItemEffectSchema.optional(),
  capture: CaptureRuleSchema.optional(),
  text: z.string().optional(),
})
export type Item = z.infer<typeof ItemSchema>

export const ItemsFileSchema = z.object({
  _status: z.string().optional(),
  _comment: z.string().optional(),
  items: z.array(ItemSchema).min(1),
})
export type ItemsFile = z.infer<typeof ItemsFileSchema>
