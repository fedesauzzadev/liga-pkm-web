// Cartas de PKM y ataques. Tipos canónicos del dominio (SDD §4); el motor solo usa estos.
import { z } from 'zod'
import { EffectSchema, FacesSchema } from './effects.ts'

export const ELEMENTS = [
  'normal', 'fire', 'water', 'grass', 'electric', 'psychic', 'fighting', 'poison',
  'ground', 'flying', 'bug', 'ghost', 'ice', 'rock', 'dragon',
] as const
export const ElementSchema = z.enum(ELEMENTS)
export type Element = z.infer<typeof ElementSchema>

export const DECK_IDS = ['bosque', 'montana', 'isla', 'llanura', 'pantano'] as const
export const DeckIdSchema = z.enum(DECK_IDS)
export type DeckId = z.infer<typeof DeckIdSchema>

// `deck` de la carta: mazo de los 5 elementos + grupos especiales (SDD §4).
export const CardGroupSchema = z.enum([...DECK_IDS, 'gimnasio', 'liga', 'sorpresa', 'evolucion'] as const)
export type CardGroup = z.infer<typeof CardGroupSchema>

export const StageSchema = z.enum(['basic', 'evolution', 'gym', 'league', 'surprise'])
export type Stage = z.infer<typeof StageSchema>

// 'any' = ícono gris "cualquier elemento" (RULES §3).
export const CostSlotSchema = z.enum([...ELEMENTS, 'any'] as const)
export type CostSlot = z.infer<typeof CostSlotSchema>

// 17 arquetipos de FX propios (docs/FX-ADAPTER.md). Respaldo siempre disponible.
export const FX_ARCHETYPES = [
  'contact', 'projectile', 'beam', 'flame', 'water', 'electric', 'leaves', 'psychic', 'poison',
  'sleep', 'heal', 'explosion', 'quake', 'wind', 'ice', 'ghost', 'buff',
] as const
export const FxArchetypeSchema = z.enum(FX_ARCHETYPES)
export type FxArchetype = z.infer<typeof FxArchetypeSchema>

export const OfficialMoveStatusSchema = z.enum(['proposed', 'verified', 'unmapped'])

export const AttackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['attack', 'ability']), // ability = texto en cursiva y entre comillas
  rollFaces: FacesSchema, // cara(s) que eligen este ataque para PKM salvaje/gimnasio
  cost: z.array(CostSlotSchema), // vacío para salvajes/gimnasio
  element: ElementSchema, // 'normal' = ataque sin elemento
  damage: z.object({
    base: z.number().int().min(0),
    ifRoll: z.object({ faces: FacesSchema, damage: z.number().int().min(0) }).optional(),
  }),
  effects: z.array(EffectSchema),
  rawText: z.string(), // texto original de la carta (trazabilidad)
  officialMove: z.string().min(1).optional(), // id PokeAPI/Showdown, ej. 'flamethrower'
  officialMoveStatus: OfficialMoveStatusSchema.optional(),
  fx: FxArchetypeSchema.optional(), // arquetipo de respaldo (docs/FX-ADAPTER.md)
})
export type Attack = z.infer<typeof AttackSchema>

export const PokemonCardSchema = z.object({
  id: z.string().min(1),
  dex: z.number().int().min(1).max(151),
  name: z.string().min(1),
  stage: StageSchema,
  deck: CardGroupSchema,
  hp: z.number().int().positive(),
  element: ElementSchema,
  attacks: z.array(AttackSchema).min(1),
  specialties: z.array(EffectSchema), // efectos pasivos permanentes
  evolvesTo: z.array(z.object({ id: z.string().min(1), xp: z.number().int().min(0) })),
  chances: z.number().int().min(1).optional(), // "Oportunidad" (solo Sorpresa)
  gym: z.object({ leader: z.string().min(1), slot: z.union([z.literal(1), z.literal(2)]) }).optional(),
  source: z.object({
    manualPage: z.number().int().min(1).optional(),
    photo: z.string().optional(),
    verified: z.boolean(),
  }),
})
export type PokemonCard = z.infer<typeof PokemonCardSchema>

// Archivo content/pokemon/*.json. `pending` = ids de evoluciones aún no ingresadas.
export const PokemonFileSchema = z.object({
  _comment: z.string().optional(),
  cards: z.array(PokemonCardSchema),
  pending: z.array(z.string().min(1)).optional(),
})
export type PokemonFile = z.infer<typeof PokemonFileSchema>
