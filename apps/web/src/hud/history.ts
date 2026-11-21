// Modelo del panel de historial (SPEC-I/T-072): acumula entradas a partir de
// los eventos del motor (via eventToLog) y las agrupa por combate (AC-3).
// Puro y testeable: el panel solo renderiza.
import type { GameEvent, GameState } from '@liga/engine'
import { es } from '../i18n/es'
import { type EventLogI18n, eventToLog } from '../i18n/event-log'
import { cardOf, gameContent } from '../game/content'
import { cardLabel } from '../game/TilePanel'

/** AC-1: máximo de entradas visibles; las más viejas se descartan. */
export const HISTORY_LIMIT = 200

/** Categoría de la entrada (define el ícono por color, AC-1). */
export type HistoryKind =
  | 'dice'
  | 'move'
  | 'card'
  | 'energy'
  | 'heal'
  | 'battle'
  | 'damage'
  | 'status'
  | 'xp'
  | 'medal'
  | 'item'
  | 'turn'
  | 'system'

export interface HistoryEntry {
  readonly id: number
  readonly turn: number
  readonly playerLabel: string
  readonly playerId: string | null
  readonly kind: HistoryKind
  readonly text: string
  /** Grupo de combate (AC-3): clave + nombre del rival; null fuera de combate. */
  readonly battle: { readonly key: number; readonly name: string } | null
}

const KIND_BY_EVENT: Readonly<Record<string, HistoryKind>> = {
  DieRolled: 'dice',
  MoveStep: 'move',
  Landed: 'move',
  CardDrawn: 'card',
  DeckEmpty: 'card',
  CardToBottom: 'item',
  EnergyGained: 'energy',
  ElementEquipped: 'energy',
  ElementUnequipped: 'energy',
  MulticolorAssigned: 'energy',
  MulticolorUnassigned: 'energy',
  PartyHealed: 'heal',
  Healed: 'heal',
  BattleStarted: 'battle',
  AttackUsed: 'battle',
  NoAttack: 'battle',
  AttackDodged: 'battle',
  PkmRetired: 'battle',
  PkmSentOut: 'battle',
  RivalSentOut: 'battle',
  BattleEnded: 'battle',
  DamageTaken: 'damage',
  PokemonFainted: 'damage',
  ConditionApplied: 'status',
  ConditionCleared: 'status',
  SelfHit: 'status',
  WokeUp: 'status',
  XpGained: 'xp',
  PkmEvolved: 'xp',
  MedalWon: 'medal',
  PrizePkmWon: 'medal',
  GameWon: 'medal',
  GymLocked: 'system',
  GymAlreadyWon: 'system',
  OakSwapped: 'system',
  TeamReordered: 'system',
  GameStarted: 'system',
  TileResolved: 'system',
  TurnAdvanced: 'turn',
  UnsupportedEffect: 'system',
}

const kindOf = (event: GameEvent): HistoryKind => KIND_BY_EVENT[event.type] ?? 'system'

const playerIdOf = (event: GameEvent): string | null =>
  'player' in event && typeof event.player === 'string' ? event.player : null

const playerLabelOf = (state: GameState, i18n: EventLogI18n, playerId: string | null): string => {
  if (playerId === null) return ''
  const index = state.players.findIndex((player) => player.id === playerId)
  return index < 0 ? playerId : i18n.texts.hudPlayerName.replace('{n}', String(index + 1))
}

/** Estado para resolver nombres: el post-comando, salvo la batalla que cerró. */
function resolutionState(before: GameState, after: GameState): GameState {
  return after.battle === null && before.battle !== null ? { ...after, battle: before.battle } : after
}

/**
 * AC-1: entradas nuevas por evento (descarta los que no aportan mensaje), con
 * turno/jugador por entrada, grupos de combate (AC-3) y tope de 200.
 */
export function appendHistory(
  prev: readonly HistoryEntry[],
  events: readonly GameEvent[],
  before: GameState,
  after: GameState,
  i18n: EventLogI18n,
): readonly HistoryEntry[] {
  const state = resolutionState(before, after)
  const activeId = before.activePlayerId ?? after.activePlayerId
  let turn = before.turn
  let battleKey = prev.reduce((max, entry) => Math.max(max, entry.battle?.key ?? 0), 0)
  let battle: HistoryEntry['battle'] = null
  let id = prev.at(-1)?.id ?? 0
  const added: HistoryEntry[] = []
  for (const event of events) {
    if (event.type === 'TurnAdvanced') turn = event.turn
    if (event.type === 'BattleStarted') {
      battleKey += 1
      battle = { key: battleKey, name: i18n.cardName(event.rival) }
    }
    const text = eventToLog(event, state, i18n)
    if (text !== null) {
      id += 1
      const playerId = playerIdOf(event) ?? activeId
      added.push({
        id,
        turn,
        playerId,
        playerLabel: playerLabelOf(after, i18n, playerId),
        kind: kindOf(event),
        text,
        battle,
      })
    }
    if (event.type === 'BattleEnded') battle = null
  }
  return added.length === 0 ? prev : [...prev, ...added].slice(-HISTORY_LIMIT)
}

/** AC-3: filas del panel — entradas sueltas o grupos de combate consecutivos. */
export type HistoryRow =
  | { readonly type: 'entry'; readonly entry: HistoryEntry }
  | { readonly type: 'battle'; readonly key: number; readonly name: string; readonly entries: readonly HistoryEntry[] }

export function groupHistory(entries: readonly HistoryEntry[]): readonly HistoryRow[] {
  const rows: HistoryRow[] = []
  let group: { readonly type: 'battle'; readonly key: number; readonly name: string; entries: HistoryEntry[] } | null =
    null
  for (const entry of entries) {
    if (entry.battle === null) {
      group = null
      rows.push({ type: 'entry', entry })
      continue
    }
    if (group === null || group.key !== entry.battle.key) {
      group = { type: 'battle', key: entry.battle.key, name: entry.battle.name, entries: [] }
      rows.push(group)
    }
    group.entries.push(entry)
  }
  return rows
}

/** i18n del historial armado con el contenido real de la app (nombres/labels). */
export function historyLogI18n(): EventLogI18n {
  return {
    texts: es,
    cardName: cardLabel,
    nodeName: (nodeId) =>
      gameContent.board.nodes.find((node) => node.id === nodeId)?.label ?? nodeId,
    attackName: (cardId, attackId) =>
      cardOf(cardId)?.attacks.find((attack) => attack.id === attackId)?.name ?? attackId,
  }
}
