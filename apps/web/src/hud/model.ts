// Modelo de presentación del HUD (SPEC-I/T-074): funciones puras que derivan
// lo que muestran panel-team, panel-players, panel-turn y la Reserva de Oak.
// La legalidad la decide el motor (ReorderTeam/SwapWithOak); acá solo se arma
// la vista (ADR-1: la UI nunca decide reglas).
import type { BattleState, Element, GameState, PlayerState, PkmInstance } from '@liga/engine'
import { es } from '../i18n/es'

/** Nombre visible por índice de jugador (el motor no guarda nombres, T-010). */
export const playerLabel = (index: number): string => es.hudPlayerName.replace('{n}', String(index + 1))

/** Paleta fija de fichas de jugador (layout.json no define colores). */
export const PLAYER_COLORS: readonly string[] = ['#d94f2b', '#2d6ee4', '#2fa85c', '#c9a227', '#8e44ad', '#0e8a8a']

export const playerColor = (index: number): string =>
  PLAYER_COLORS[index % PLAYER_COLORS.length] ?? '#d94f2b'

export interface PlayerVm {
  readonly id: string
  readonly label: string
  readonly color: string
  readonly active: boolean
  readonly medals: readonly string[]
}

/** Filas de panel-players: nombre, color de ficha y medallas (D-28). */
export function playersVm(state: GameState): readonly PlayerVm[] {
  return state.players.map((player, index) => ({
    id: player.id,
    label: playerLabel(index),
    color: playerColor(index),
    active: player.id === state.activePlayerId,
    medals: player.medals,
  }))
}

/** PKM "activo": en combate el del frente; fuera, el primero sano del equipo. */
export function leaderUid(player: PlayerState, battle: BattleState | null): string | null {
  if (battle !== null) return battle.active[0]
  return player.team.find((pkm) => !pkm.fainted)?.uid ?? null
}

export interface SlotConditions {
  readonly asleep: boolean
  readonly poisoned: boolean
}

/** Estados de combate visibles en el slot (SPEC-I/AC-1: dormido, envenenado). */
export function slotConditions(
  battle: BattleState | null,
  uid: string,
): SlotConditions {
  const conditions = battle?.conditions[uid]
  return {
    asleep: conditions?.asleep !== undefined,
    poisoned: conditions?.poison !== undefined,
  }
}

export interface HpBar {
  readonly current: number
  readonly max: number
  /** 0..1 para la barra CSS (sin carta conocida: barra llena neutra). */
  readonly ratio: number
}

export function hpOf(hpMax: number | null, pkm: PkmInstance): HpBar {
  const current = hpMax === null ? 1 : Math.max(0, hpMax - pkm.damage)
  return { current, max: hpMax ?? current, ratio: hpMax === null || hpMax <= 0 ? 1 : current / hpMax }
}

/** Fichas de energía visibles en el slot: máx `visible` y "+n" por el resto. */
export function energyChips(
  equipped: readonly { readonly element: Element }[],
  visible = 6,
): { readonly shown: readonly Element[]; readonly extra: number } {
  return { shown: equipped.slice(0, visible).map((card) => card.element), extra: Math.max(0, equipped.length - visible) }
}

/** ¿Se puede reordenar el equipo? Solo el propio, en Organize y sin pending (AC-1). */
export function canReorder(state: GameState, viewedPlayerId: string): boolean {
  return (
    state.phase === 'organize' &&
    state.pending === null &&
    viewedPlayerId === state.activePlayerId
  )
}

/** ¿Se puede tirar el dado ahora? (panel-turn, AC-4). */
export function canRoll(state: GameState): boolean {
  return state.phase === 'organize' && state.pending === null
}

/** ¿Hay que ofrecer "Resolver casillero"? (tileResolution sin decisión). */
export function canAdvance(state: GameState): boolean {
  return state.phase === 'tileResolution' && state.pending === null
}

/** Pares de intercambio de la Reserva de Oak (AC-2/D-27): pila × slots del equipo. */
export interface OakPair {
  readonly teamUid: string
  readonly pileUid: string
}

export function oakPairs(team: readonly PkmInstance[], pile: readonly PkmInstance[]): readonly OakPair[] {
  return team.flatMap((teamPkm) =>
    pile.map((pilePkm) => ({ teamUid: teamPkm.uid, pileUid: pilePkm.uid })),
  )
}
