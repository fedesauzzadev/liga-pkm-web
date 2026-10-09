// Equipamiento, costos e inventario (SPEC-B/T-013). Reglas: RULES §3 (un ataque se
// evalúa solo, comodín = 1 elemento del asignado, máx 1 por PKM) y §4 (primer
// ataque). Funciones puras + mutadores de draft immer; los handlers de engine.ts
// validan fase (`organize`, AC-3) y despachan. Sin azar, sin DOM (ADR-1).
import type { WritableDraft } from 'immer'
import { ELEMENTS } from '@liga/content'
import type { Attack, CardId, Element, PokemonCard } from '@liga/content'
import { EngineError } from './errors.ts'
import type { Result } from './errors.ts'
import type {
  ElementEquipped,
  ElementUnequipped,
  GameEvent,
  WildcardAssigned,
} from './events.ts'
import type { GameState, PlayerState, PkmInstance } from './state.ts'

type Draft = WritableDraft<GameState>
type PlayerDraft = WritableDraft<PlayerState>
type PkmDraft = WritableDraft<PkmInstance>

function illegal(message: string): Result<never, EngineError> {
  return { ok: false, error: new EngineError('ILLEGAL_COMMAND', message) }
}

/** Cuenta un elemento entre equipados y comodines asignados de un PKM. */
function have(pkm: PkmInstance, element: Element): number {
  const equipped = pkm.equipped.filter((card) => card.element === element).length
  const wildcards = pkm.wildcards.filter((assigned) => assigned === element).length
  return equipped + wildcards
}

/**
 * ¿El PKM propio puede usar `attack`? (AC-1, RULES §3): por cada elemento
 * específico, #equipados + comodines asignados ≥ requeridos del mismo; total
 * equipado (+comodines) ≥ `cost.length`. Cada ataque se evalúa solo; los
 * elementos no se consumen. Costo vacío (salvajes/líderes) ⇒ siempre true.
 */
export function canUse(pkm: PkmInstance, attack: Attack): boolean {
  const total = pkm.equipped.length + pkm.wildcards.length
  if (total < attack.cost.length) return false
  for (const element of ELEMENTS) {
    const required = attack.cost.filter((slot) => slot === element).length
    if (required > 0 && have(pkm, element) < required) return false
  }
  return true
}

/** Primer ataque de cada elemento de la carta, en orden de aparición (RULES §4). */
function firstPerElement(card: PokemonCard): Map<Element, Attack> {
  const firsts = new Map<Element, Attack>()
  for (const attack of card.attacks) {
    if (!firsts.has(attack.element)) firsts.set(attack.element, attack)
  }
  return firsts
}

/**
 * Ataques permitidos para un PKM propio (AC-4): los que pagan el costo
 * (`canUse`) y, en su primer turno de la carta, la regla de "primer ataque"
 * (RULES §4): 1.º Normal ⇒ solo ese; 1.º Especial ⇒ el 1.º de cada elemento
 * (incluido el normal); una habilidad siempre puede empezar. Después, todos.
 */
export function legalAttacks(
  card: PokemonCard,
  pkm: PkmInstance,
  isFirstTurn: boolean,
): readonly Attack[] {
  const usable = card.attacks.filter((attack) => canUse(pkm, attack))
  if (!isFirstTurn) return usable
  const first = card.attacks[0]!
  if (first.element === 'normal') {
    return usable.filter((attack) => attack.id === first.id || attack.kind === 'ability')
  }
  const firsts = firstPerElement(card)
  return usable.filter(
    (attack) => attack.kind === 'ability' || firsts.get(attack.element)?.id === attack.id,
  )
}

/** Comodines del jugador ya asignados a su equipo. */
function assignedWildcardCount(player: PlayerState): number {
  return player.team.reduce((count, pkm) => count + pkm.wildcards.length, 0)
}

/** ¿Queda un comodín libre para `pkmUid`, o el PKM ya tiene uno que reasignar? (AC-2) */
export function canAssignWildcard(player: PlayerState, pkmUid: string): boolean {
  const target = player.team.find((pkm) => pkm.uid === pkmUid)
  if (target === undefined) return false
  return target.wildcards.length > 0 || assignedWildcardCount(player) < player.wildcards
}

/** PKM del equipo por uid (draft) o error tipado. */
function teamPkm(player: PlayerDraft, pkmUid: string): Result<PkmDraft, EngineError> {
  const found = player.team.find((pkm) => pkm.uid === pkmUid)
  return found === undefined ? illegal(`"${pkmUid}" no está en el equipo`) : { ok: true, value: found }
}

/** Equipa la carta `elementId` (debe estar en el inventario) en el PKM (AC-3). */
export function equipElement(
  draft: Draft,
  command: { readonly pkmUid: string; readonly elementId: string },
): Result<readonly GameEvent[], EngineError> {
  const player = draft.players.find((p) => p.id === draft.activePlayerId)
  if (player === undefined) return illegal('sin jugador activo')
  const pkm = teamPkm(player, command.pkmUid)
  if (!pkm.ok) return pkm
  const at = player.elements.findIndex((card) => card.id === command.elementId)
  if (at < 0) return illegal(`"${command.elementId}" no está en el inventario de elementos`)
  const card = player.elements[at]!
  player.elements.splice(at, 1)
  pkm.value.equipped.push(card)
  const event: ElementEquipped = {
    type: 'ElementEquipped',
    player: player.id,
    pkmUid: command.pkmUid,
    elementId: command.elementId,
  }
  return { ok: true, value: [event] }
}

/** Desequipa la carta `elementId` del PKM y vuelve al inventario (AC-3). */
export function unequipElement(
  draft: Draft,
  command: { readonly pkmUid: string; readonly elementId: string },
): Result<readonly GameEvent[], EngineError> {
  const player = draft.players.find((p) => p.id === draft.activePlayerId)
  if (player === undefined) return illegal('sin jugador activo')
  const pkm = teamPkm(player, command.pkmUid)
  if (!pkm.ok) return pkm
  const at = pkm.value.equipped.findIndex((card) => card.id === command.elementId)
  if (at < 0) return illegal(`"${command.elementId}" no está equipada en "${command.pkmUid}"`)
  const card: CardId = pkm.value.equipped[at]!.id
  const element = pkm.value.equipped[at]!.element
  pkm.value.equipped.splice(at, 1)
  player.elements.push({ id: card, element })
  const event: ElementUnequipped = {
    type: 'ElementUnequipped',
    player: player.id,
    pkmUid: command.pkmUid,
    elementId: command.elementId,
  }
  return { ok: true, value: [event] }
}

/** Asigna/reasigna un comodín al PKM como `element` (AC-2/AC-3, RULES §3). */
export function assignWildcard(
  draft: Draft,
  command: { readonly pkmUid: string; readonly element: Element },
): Result<readonly GameEvent[], EngineError> {
  const player = draft.players.find((p) => p.id === draft.activePlayerId)
  if (player === undefined) return illegal('sin jugador activo')
  const pkm = teamPkm(player, command.pkmUid)
  if (!pkm.ok) return pkm
  if (!canAssignWildcard(player, command.pkmUid)) {
    return illegal('no quedan comodines sin asignar (reasigná uno ya asignado)')
  }
  pkm.value.wildcards = [command.element]
  const event: WildcardAssigned = {
    type: 'WildcardAssigned',
    player: player.id,
    pkmUid: command.pkmUid,
    element: command.element,
  }
  return { ok: true, value: [event] }
}
