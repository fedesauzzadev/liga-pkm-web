// AC: SPEC-I/T-072/AC-1..AC-4 — panel-history: lista cronológica con etiquetas,
// filtro Todos/Solo yo, tope de 200, grupos de combate plegables y snapshot de
// una secuencia fija. Proxy SSR (renderToString, patrón T-074).
import { parseCardId, parseNodeId, parsePlayerId, parsePkmUid } from '@liga/content'
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { createInitialState, type BattleState, type GameEvent, type GameState, type PlayerState, type PkmInstance } from '@liga/engine'
import { es } from '../i18n/es'
import type { EventLogI18n } from '../i18n/event-log'
import { HistoryPanel } from './HistoryPanel'
import { HISTORY_LIMIT, appendHistory, groupHistory } from './history'

const i18n: EventLogI18n = {
  texts: es,
  cardName: (cardId) => ({ squirtle: 'Squirtle', weedle: 'Weedle' })[cardId] ?? cardId,
  nodeName: (nodeId) => ({ paleta: 'Pueblo Paleta', plateada: 'Ciudad Plateada' })[nodeId] ?? nodeId,
  attackName: (_cardId, attackId) => ({ burbujas: 'Burbujas' })[attackId] ?? attackId,
}

const pkm = (uid: string, cardId = 'squirtle'): PkmInstance => ({
  uid: parsePkmUid(uid),
  cardId: parseCardId(cardId),
  damage: 0,
  xp: 0,
  equipped: [],
  multicolor: [],
  fainted: false,
})

const player = (id: string): PlayerState => ({
  id: parsePlayerId(id),
  position: parseNodeId('paleta'),
  cameFrom: null,
  team: id === 'p1' ? [pkm('p1-a')] : [pkm('p2-a')],
  oakPile: [],
  elements: [],
  multicolor: 0,
  items: { pokeball: 0, potion: 0, oportunidad: 0, super_potion: 0, ultraball: 0, masterball: 0 },
  medals: [],
})

const wildBattle = (): BattleState => ({
  kind: 'wild',
  card: parseCardId('weedle'),
  deck: 'bosque',
  rival: [{ uid: parsePkmUid('rival-1'), cardId: parseCardId('weedle'), damage: 0, fainted: false }],
  active: [parsePkmUid('p1-a'), parsePkmUid('rival-1')],
  turnSide: 0,
  conditions: {},
  trainerId: null,
  firstTurn: [],
  participants: [parsePkmUid('p1-a')],
  won: false,
  noAttackThisTurn: false,
  actedThisTurn: false,
  lostCount: 0,
})

const stateOf = (overrides: Partial<GameState> = {}): GameState => ({
  ...createInitialState(),
  turn: 1,
  phase: 'organize',
  players: [player('p1')],
  activePlayerId: parsePlayerId('p1'),
  ...overrides,
})

const twoPlayers = stateOf({ players: [player('p1'), player('p2')] })

const panel = (props: Partial<Parameters<typeof HistoryPanel>[0]> = {}): string =>
  renderToString(
    <HistoryPanel
      entries={[]}
      myPlayerId="p1"
      filter="all"
      onFilterChange={() => undefined}
      collapsed={[]}
      onToggleGroup={() => undefined}
      {...props}
    />,
  )

// AC: SPEC-I/T-072/AC-1 — cronológico (nuevo abajo), etiqueta de turno y
// jugador por entrada, e ícono por categoría.
test('AC-1 appendHistory: orden, turno por evento y etiqueta turno · jugador', () => {
  const before = stateOf({ turn: 1 })
  const after = stateOf({ turn: 2 })
  const entries = appendHistory(
    [],
    [
      { type: 'DieRolled', purpose: 'move', value: 4 },
      { type: 'Landed', player: 'p1', node: 'plateada' },
      { type: 'TurnAdvanced', turn: 2 },
    ],
    before,
    after,
    i18n,
  )
  expect(entries.map((entry) => entry.text)).toEqual([
    'Sacaste un 4.',
    'Te moviste a Ciudad Plateada.',
    'Empieza el turno 2.',
  ])
  expect(entries.map((entry) => entry.turn)).toEqual([1, 1, 2])
  expect(entries.every((entry) => entry.playerId === 'p1' && entry.playerLabel === 'Jugador 1')).toBe(true)
  expect(entries[0]!.kind).toBe('dice')
  // El panel renderiza newest abajo + etiqueta "Turno n · Jugador m".
  const html = panel({ entries })
  expect(html).toContain('data-history-panel="true"')
  expect(html).toContain('data-testid="history-entry"')
  expect(html).toContain('data-turn="1"')
  // renderToString separa nodos de texto con <!-- -->: se aserta por partes.
  expect(html).toContain('Turno 1')
  expect(html).toContain('· Jugador 1')
})

// AC: SPEC-I/T-072/AC-1 — filtro "Todos / Solo yo": lo del otro jugador se oculta.
test('AC-1 filtro: "Solo yo" oculta las acciones del otro jugador', () => {
  const entries = appendHistory(
    [],
    [
      { type: 'Landed', player: 'p1', node: 'plateada' },
      { type: 'Landed', player: 'p2', node: 'paleta' },
    ],
    twoPlayers,
    twoPlayers,
    i18n,
  )
  expect(entries.map((entry) => entry.playerId)).toEqual(['p1', 'p2'])
  const all = panel({ entries, filter: 'all' })
  expect((all.match(/data-testid="history-entry"/g) ?? []).length).toBe(2)
  expect(all).toContain('data-testid="history-filter-me"')
  const mine = panel({ entries, filter: 'me', myPlayerId: 'p1' })
  expect((mine.match(/data-testid="history-entry"/g) ?? []).length).toBe(1)
  expect(mine).not.toContain('Te moviste a Pueblo Paleta.')
})

// AC: SPEC-I/T-072/AC-1 — máximo 200 entradas visibles (se descartan las viejas).
test('AC-1 tope: con más de 200 eventos quedan las últimas 200 entradas', () => {
  const many: readonly GameEvent[] = Array.from({ length: HISTORY_LIMIT + 10 }, (_, i) => ({
    type: 'TurnAdvanced' as const,
    turn: i + 1,
  }))
  const entries = appendHistory([], many, stateOf({ turn: 1 }), stateOf({ turn: 2 }), i18n)
  expect(entries.length).toBe(HISTORY_LIMIT)
  expect(entries[0]!.text).toBe('Empieza el turno 11.')
  expect(entries.at(-1)!.text).toBe('Empieza el turno 210.')
})

// AC: SPEC-I/T-072/AC-3 — lo de combate se agrupa bajo "Combate vs X" plegable.
test('AC-3 grupos: BattleStarted..BattleEnded bajo encabezado plegable Combate vs X', () => {
  const before = stateOf({ turn: 1, battle: null, phase: 'tileResolution' })
  const after = stateOf({ turn: 1, battle: wildBattle(), phase: 'battle' })
  const entries = appendHistory(
    [],
    [
      { type: 'BattleStarted', player: 'p1', kind: 'wild', rival: 'weedle', active: 'p1-a' },
      { type: 'AttackUsed', attacker: 'p1-a', attackId: 'burbujas', target: 'rival-1' },
      { type: 'DamageTaken', pkmUid: 'rival-1', amount: 20, cause: 'attack' },
      { type: 'BattleEnded', player: 'p1', result: 'won' },
      { type: 'TurnAdvanced', turn: 2 },
    ],
    before,
    after,
    i18n,
  )
  const rows = groupHistory(entries)
  expect(rows[0]!.type).toBe('battle')
  expect(rows[0]).toMatchObject({ key: 1, name: 'Weedle' })
  if (rows[0]!.type !== 'battle') return
  expect(rows[0]!.entries.length).toBe(4)
  expect(rows[1]).toMatchObject({ type: 'entry' })
  // El panel: encabezado plegable (aria-expanded) que oculta las entradas.
  const open = panel({ entries })
  expect(open).toContain('Combate vs Weedle')
  expect(open).toContain('data-testid="history-group-toggle"')
  expect(open).toContain('aria-expanded="true"')
  expect(open).toContain('Squirtle usó Burbujas.')
  // AC: N-0006/AC-1 — ningún <li> cuelga directo de otro <li> (va en su <ul>).
  const liDepth = [...open.matchAll(/<(\/?)(li|ul)\b/g)].reduce<string[][]>(
    (acc, [, close, tag]) => {
      const stack = acc.at(-1)!
      return [...acc, close === '/' ? stack.slice(0, -1) : [...stack, tag!]]
    },
    [[]],
  )
  expect(liDepth.some((stack) => stack.at(-1) === 'li' && stack.at(-2) === 'li')).toBe(false)
  expect(open).toMatch(/<ul class="[^"]*historyGroupList/)
  const closed = panel({ entries, collapsed: [1] })
  expect(closed).toContain('aria-expanded="false"')
  expect(closed).not.toContain('Squirtle usó Burbujas.')
})

// AC: SPEC-I/T-072/AC-4 — una secuencia fija produce exactamente el texto esperado.
test('AC-4 snapshot de texto: secuencia fija ⇒ textos exactos', () => {
  const entries = appendHistory(
    [],
    [
      { type: 'GameStarted', player: 'p1', starterDeck: 'isla', starter: 'squirtle', position: 'paleta' },
      { type: 'TurnAdvanced', turn: 1 },
      { type: 'DieRolled', purpose: 'move', value: 4 },
      { type: 'Landed', player: 'p1', node: 'plateada' },
      { type: 'CardDrawn', player: 'p1', deck: 'bosque', card: 'weedle' },
      { type: 'EnergyGained', player: 'p1', element: 'grass' },
      { type: 'DeckEmpty', player: 'p1', deck: 'isla' },
      { type: 'MoveStep', player: 'p1', from: 'paleta', to: 'plateada' },
    ],
    stateOf({ turn: 1, phase: 'idle' }),
    stateOf({ turn: 2 }),
    i18n,
  )
  expect(entries.map((entry) => entry.text)).toEqual([
    'Jugador 1 empezó la partida con Squirtle.',
    'Empieza el turno 1.',
    'Sacaste un 4.',
    'Te moviste a Ciudad Plateada.',
    'Sacaste una carta de Bosque: Weedle.',
    'La energía de Planta quedó en tu inventario.',
    'El mazo Isla está vacío: no se puede robar.',
  ])
})
