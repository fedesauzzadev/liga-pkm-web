// Ruleset de la Partida Clásica (MVP-0). Defaults de RULES.md (tabla D-xx) viven acá.
import { z } from 'zod'

export const RulesetSchema = z.object({
  id: z.string().min(1),
  mode: z.string().min(1),
  // D-18: flags que deshabilitan modos fuera de MVP-0.
  features: z.object({
    sorpresa: z.boolean(),
    liga: z.boolean(),
    pokedexChart: z.boolean(),
    duelo: z.boolean(),
  }),
  // Inicio (RULES §1): 2 comodines, 5 pokebolas, 1 carta del elemento del inicial.
  start: z.object({
    wildcards: z.number().int().min(0),
    pokeballs: z.number().int().min(0),
    starterElementCards: z.number().int().min(0),
  }),
  teamLimit: z.number().int().min(1), // 6 (límite de equipo; resto a la pila de Oak)
  medalsToWin: z.number().int().min(1), // 8
  giovanniRequiresMedals: z.number().int().min(0), // 7
  gymTeamSize: z.number().int().min(1), // 2 PKM por líder
  potionHeal: z.number().int().min(0), // cura hasta 30
  diceFaces: z.literal(6), // D-13: todas las tiradas son 1d6
  deadEndBounce: z.boolean(), // D-01: rebote en todo fin de camino
})
export type Ruleset = z.infer<typeof RulesetSchema>
