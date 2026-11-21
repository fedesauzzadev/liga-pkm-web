// Ruleset de la Partida Clásica (MVP-0). Defaults de RULES.md (tabla D-xx) viven acá.
import { z } from 'zod'
import { FacesSchema } from './effects.ts'
import { CaptureRuleSchema } from './items.ts'

export const RulesetSchema = z.object({
  id: z.string().min(1),
  mode: z.string().min(1),
  // D-18: flags que deshabilitan modos fuera de MVP-0.
  features: z.object({
    sorpresa: z.boolean(), // casillero Sorpresa del tablero
    sorpresaDeck: z.boolean(), // el mazo Sorpresa existe (Oportunidad / premios)
    liga: z.boolean(),
    pokedexChart: z.boolean(),
    duelo: z.boolean(),
    houseEdits: z.boolean(), // content/house-edits/*.json aplicables (D-26)
  }),
  // Inicio (RULES §1): 2 Multicolor, 5 pokebolas, 1 carta de energía del inicial.
  start: z.object({
    multicolor: z.number().int().min(0), // D-23: se llama Multicolor
    pokeballs: z.number().int().min(0),
    starterEnergyCards: z.number().int().min(0),
  }),
  teamLimit: z.number().int().min(1), // 6 (límite de equipo; resto a la pila de Oak)
  medalsToWin: z.number().int().min(1), // 8
  giovanniRequiresMedals: z.number().int().min(0), // 7
  gymTeamSize: z.number().int().min(1), // 2 PKM por líder
  potionHeal: z.number().int().min(0), // cura hasta 30
  diceFaces: z.literal(6), // D-13: todas las tiradas son 1d6
  deadEndBounce: z.boolean(), // D-01: rebote en todo fin de camino
  // Capturas por bola (D-12/D-19).
  capture: z.object({
    pokeball: CaptureRuleSchema,
    ultraball: CaptureRuleSchema,
    masterball: CaptureRuleSchema,
  }),
  // Carta Oportunidad (D-21): 4-5-6 roba del mazo Sorpresa con ≥ minMedals.
  oportunidad: z.object({
    faces: FacesSchema,
    draws: z.literal('sorpresa'),
    minMedals: z.number().int().min(0),
  }),
})
export type Ruleset = z.infer<typeof RulesetSchema>
