// Ediciones de la casa (content/house-edits/*.json, SPEC-F/T-048; esquema en
// T-002b/AC-1): cambios del dueño sobre las cartas SIN tocar la transcripción
// original (D-26). La aplicación (fusión + revalidación) es de T-048.
import { z } from 'zod'
import { AttackSchema, PokemonCardSchema } from './cards.ts'

/** Parche profundo sobre un ataque existente (fusión, no reemplazo). */
const AttackPatchSchema = AttackSchema.partial().extend({
  damage: AttackSchema.shape.damage.partial().optional(),
})

export const HouseEditSchema = z.object({
  id: z.string().min(1),
  target: z.string().min(1), // id de carta
  reason: z.string().optional(),
  set: PokemonCardSchema.partial().optional(), // campos de la carta
  attacks: z.record(z.string().min(1), AttackPatchSchema).optional(), // fusión por id de ataque
  addAttacks: z.array(AttackSchema).optional(),
  removeAttacks: z.array(z.string().min(1)).optional(),
})
export type HouseEdit = z.infer<typeof HouseEditSchema>

export const HouseEditsFileSchema = z.object({
  _comment: z.string().optional(),
  enabled: z.boolean(),
  edits: z.array(HouseEditSchema),
})
export type HouseEditsFile = z.infer<typeof HouseEditsFileSchema>
