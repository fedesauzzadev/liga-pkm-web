// Líderes de gimnasio (content/gyms.json, SPEC-F/T-002b AC-5). Reemplaza al
// bloque `gyms` de board/kanto.json (obsoleto: se ignora con warning). Los PKM
// de cada líder se vinculan por `gym: { leader, slot }` en las cartas (T-042c).
import { z } from 'zod'
import { DECK_IDS } from './cards.ts'

/** Origen del premio: robo de un mazo de terreno, del mazo Ítem o del Sorpresa. */
export const PrizeSourceSchema = z.enum([...DECK_IDS, 'item', 'sorpresa'] as const)
export type PrizeSource = z.infer<typeof PrizeSourceSchema>

/**
 * Premio del líder (p.50): n cartas de un mazo. Se mantiene la variante PKM
 * explícita (RULES §4 "Premio PKM ⇒ se conserva sin gastar Pokebola") para
 * cartas que lo declaren; el gyms.json confirmado solo usa { from, count }.
 */
export const GymPrizeSchema = z.union([
  z.object({ from: PrizeSourceSchema, count: z.number().int().min(1) }),
  z.object({ kind: z.literal('pkm'), card: z.string().min(1) }),
])
export type GymPrize = z.infer<typeof GymPrizeSchema>

/** Datos del líder SIN el id (la key del record en gyms.json es el id). */
const GymLeaderBodySchema = z.object({
  name: z.string().min(1),
  city: z.string().min(1), // nodo del tablero (key)
  cityLabel: z.string().min(1),
  medal: z.string().min(1),
  prize: GymPrizeSchema,
  /** PKM del líder (2; Giovanni: 3). Las cartas se vinculan en T-042c. */
  pokemonCount: z.number().int().min(1),
  requiresMedals: z.number().int().min(0).optional(), // Giovanni: 7
})

export const GymLeaderSchema = GymLeaderBodySchema.extend({ id: z.string().min(1) })
export type GymLeader = z.infer<typeof GymLeaderSchema>

export const GymsFileSchema = z.object({
  _status: z.string().optional(),
  leaders: z.record(z.string().min(1), GymLeaderBodySchema),
})
export type GymsFile = z.infer<typeof GymsFileSchema>

/** Convierte el record del archivo en la lista con `id` que consume el motor. */
export function gymsToList(file: GymsFile): readonly GymLeader[] {
  return Object.entries(file.leaders).map(([id, leader]) => ({ id, ...leader }))
}
