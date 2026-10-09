// Líderes de gimnasio (SPEC-C/T-023, AC-5): content/pokemon/gyms.json es opcional;
// mientras no exista, los tests usan fixtures. Cada líder aporta nombre y premio
// (RULES §4 p.50); el equipo se arma desde las cartas con `gym: { leader, slot }`
// (SDD §4, muestra `tangela_erika`) — el id del líder es la key de board.gyms.
import { z } from 'zod'
import { DeckIdSchema } from './cards.ts'

/** Premio del líder (p.50): robo de mazo (Erika: 1 Bosque), ítems (Surge 1,
 * Sabrina 2) o un PKM que se conserva sin gastar Pokebola. */
export const GymPrizeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('deck'), deck: DeckIdSchema, count: z.number().int().min(1) }),
  z.object({ kind: z.literal('item'), count: z.number().int().min(1) }),
  z.object({ kind: z.literal('pkm'), card: z.string().min(1) }),
])
export type GymPrize = z.infer<typeof GymPrizeSchema>

export const GymLeaderSchema = z.object({
  id: z.string().min(1), // key del gimnasio en board.gyms (ej. 'brock')
  name: z.string().min(1),
  prize: GymPrizeSchema,
  verified: z.boolean(),
})
export type GymLeader = z.infer<typeof GymLeaderSchema>

export const GymsFileSchema = z.object({
  _comment: z.string().optional(),
  leaders: z.array(GymLeaderSchema).min(1),
})
export type GymsFile = z.infer<typeof GymsFileSchema>
