// Modelo de presentación del equipo (SPEC-D/T-033): funciones puras que derivan
// opciones de comando desde el estado del motor. La legalidad la decide el motor
// (`canAssignMulticolor` + handlers Equip/Unequip/AssignMulticolor/Evolve); acá
// solo se arma lo que la vista muestra (ADR-1: la UI nunca decide reglas).
import { ELEMENTS } from '@liga/content'
import {
  canAssignMulticolor,
  type Command,
  type Element,
  type PkmInstance,
  type PlayerState,
  type PokemonCard,
} from '@liga/engine'

/** Comandos que emite la vista de equipo (AC-2/AC-3; T-104 agrega quitar Multicolor). */
export type TeamCommand = Extract<
  Command,
  { readonly type: 'Equip' | 'Unequip' | 'AssignMulticolor' | 'UnassignMulticolor' | 'Evolve' }
>

/** Puerto de contenido: la vista no conoce de dónde vienen las cartas. */
export type CardOf = (cardId: string) => PokemonCard | undefined

export interface TeamEntry {
  readonly pkm: PkmInstance
  readonly card: PokemonCard | undefined
}

export function teamEntries(player: PlayerState, cardOf: CardOf): readonly TeamEntry[] {
  return player.team.map((pkm) => ({ pkm, card: cardOf(pkm.cardId) }))
}

export interface EvolveChoice {
  readonly id: string
  readonly name: string
  readonly xp: number
}

/**
 * Evoluciones ofrecidas (AC-3): entradas `evolvesTo` con XP cumplido y carta
 * existente. Espejo de `evolveOptions` de legal.ts; el motor vuelve a validar
 * al aplicar el comando `Evolve`.
 */
export function evolveChoices(
  pkm: PkmInstance,
  card: PokemonCard | undefined,
  cardOf: CardOf,
): readonly EvolveChoice[] {
  if (card === undefined) return []
  return card.evolvesTo.flatMap((entry) => {
    const target = cardOf(entry.id)
    if (target === undefined || pkm.xp < entry.xp) return []
    return [{ id: entry.id, name: target.name, xp: entry.xp }]
  })
}

/** Elementos asignables como carta Multicolor (AC-2): máx 1 por PKM, reasignable (RULES §3, D-23). */
export function multicolorChoices(player: PlayerState, pkmUid: string): readonly Element[] {
  return canAssignMulticolor(player, pkmUid) ? ELEMENTS : []
}

/** Cartas Multicolor sin asignar (contador del encabezado, AC-4). */
export function freeMulticolor(player: PlayerState): number {
  const assigned = player.team.reduce((count, pkm) => count + pkm.multicolor.length, 0)
  return player.multicolor - assigned
}

/** Espacios de medalla: ocupados primero y luego vacíos, hasta `total` (AC-4). */
export function medalSlots(medals: readonly string[], total = 8): readonly (string | null)[] {
  const slots: (string | null)[] = medals.slice(0, total)
  while (slots.length < total) slots.push(null)
  return slots
}
