// AC: SPEC-I/T-074/AC-1..AC-6 — HUD: panel-team (6 slots), panel-players,
// panel-turn (btn-roll), Reserva de Oak (btn-oak) y menú. Proxy SSR
// (renderToString, sin DOM, patrón T-033/T-061); lo visual lo revisa el dueño.
import { parseCardId, parseNodeId, parsePlayerId, parsePkmUid } from '@liga/content'
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { createInitialState, type GameState, type PlayerState, type PkmInstance, type PokemonCard } from '@liga/engine'
import { es } from '../i18n/es'
import { MenuSettings } from './MenuSettings'
import { OakReserve } from './OakReserve'
import { PlayersPanel } from './PlayersPanel'
import { TeamStrip } from './TeamStrip'
import { TurnPanel } from './TurnPanel'
import { canReorder, energyChips, hpOf, playerLabel, playersVm } from './model'

/** Carta mínima para la vista (solo usa name/hp/element/dex; el resto no importa). */
const squirtleCard = {
  id: 'squirtle',
  dex: 7,
  name: 'Squirtle',
  hp: 50,
  element: 'water',
} as unknown as PokemonCard

const cardOf = (cardId: string): PokemonCard | undefined =>
  cardId === 'squirtle' ? squirtleCard : undefined

const pkm = (uid: string, overrides: Partial<PkmInstance> = {}): PkmInstance => ({
  uid: parsePkmUid(uid),
  cardId: parseCardId('squirtle'),
  damage: 0,
  xp: 0,
  equipped: [],
  multicolor: [],
  fainted: false,
  ...overrides,
})

const player = (team: readonly PkmInstance[], id = 'p1'): PlayerState => ({
  id: parsePlayerId(id),
  position: parseNodeId('paleta'),
  cameFrom: null,
  team,
  oakPile: [],
  elements: [],
  multicolor: 0,
  items: { pokeball: 0, potion: 0, oportunidad: 0, super_potion: 0, ultraball: 0, masterball: 0 },
  medals: [],
})

const baseState = (overrides: Partial<GameState> = {}): GameState => ({
  ...createInitialState(),
  turn: 3,
  phase: 'organize',
  players: [player([pkm('p1-a', { damage: 10 })])],
  activePlayerId: parsePlayerId('p1'),
  ...overrides,
})

const strip = (props: Partial<Parameters<typeof TeamStrip>[0]> = {}): string =>
  renderToString(
    <TeamStrip
      player={player([pkm('p1-a'), pkm('p1-b', { fainted: true })])}
      cardOf={cardOf}
      sprites={null}
      battle={null}
      slots={6}
      reorderable={false}
      onSelect={() => undefined}
      onReorder={() => undefined}
      {...props}
    />,
  )

// AC: SPEC-I/T-074/AC-1 — 6 slots, mini-carta completa y vacíos punteados.
test('AC-1 panel-team: 6 slots con nombre, barra de HP y vacíos punteados', () => {
  const html = strip({ player: player([pkm('p1-a', { damage: 10 })]) })
  const slots = html.match(/data-testid="team-slot"/g) ?? []
  expect(slots.length).toBe(6)
  expect((html.match(/data-empty="true"/g) ?? []).length).toBe(5)
  expect(html).toContain('Squirtle')
  expect(html).toContain('data-hp="40/50"')
  expect(html).toContain('data-hp-ratio="0.80"')
  expect(html).toContain('data-uid="p1-a"')
  expect(html).toContain('data-testid="team-slot-open"')
})

// AC: SPEC-I/T-074/AC-1 — estados y fichas de energía (hasta 6 + "+n").
test('AC-1 panel-team: estados (activo, debilitado, dormido, envenenado) y energías +n', () => {
  const eight = Array.from({ length: 8 }, (_, i) => ({
    id: parseCardId(`element_water#${i + 1}`),
    element: 'water' as const,
  }))
  expect(energyChips(eight)).toEqual({ shown: eight.slice(0, 6).map((c) => c.element), extra: 2 })
  const html = strip({
    player: player([pkm('p1-a'), pkm('p1-b'), pkm('p1-c', { fainted: true })]),
    battle: {
      kind: 'wild',
      card: parseCardId('poliwag'),
      deck: 'pantano',
      rival: [],
      active: [parsePkmUid('p1-a'), parsePkmUid('r1')],
      turnSide: 0,
      conditions: {
        'p1-a': { poison: 10, asleep: { wakeFaces: [5, 6] } },
      },
      trainerId: null,
      firstTurn: [],
      participants: [],
      won: false,
      noAttackThisTurn: false,
      actedThisTurn: false,
      lostCount: 0,
    },
  })
  expect(html).toContain('data-active="true"')
  expect(html).toContain('data-fainted="true"')
  expect(html).toContain('data-asleep="true"')
  expect(html).toContain('data-poisoned="true"')
  expect(html).toContain(es.hudActiveBadge)
  expect(html).toContain(es.teamFainted)
  expect(html).toContain(es.battleStatusSleep)
  expect(html).toContain(es.battleStatusPoison)
})

// AC: SPEC-I/T-074/AC-1 — reordenar arrastrando solo en Organize.
test('AC-1 panel-team: slots arrastrables solo cuando es legal reordenar', () => {
  expect(strip({ reorderable: false })).toContain('data-draggable="false"')
  expect(strip({ reorderable: true })).toContain('draggable="true"')
  expect(strip({ reorderable: true })).toContain('data-reorderable="true"')
})

// AC: SPEC-I/T-074/AC-2 — Reserva de Oak: solo lectura salvo pending OakSwap.
test('AC-2 Reserva de Oak: lectura; con OakSwap aparecen los botones de intercambio', () => {
  const pile = [{ uid: 'p1-oak-1', name: 'Poliwag' }]
  const team = [{ uid: 'p1-a', name: 'Squirtle' }]
  const pairs = [{ teamUid: 'p1-a', pileUid: 'p1-oak-1' }]
  const readOnly = renderToString(
    <OakReserve pile={pile} team={team} canSwap={false} pairs={pairs} onCommand={() => undefined} onClose={() => undefined} />,
  )
  expect(readOnly).toContain(es.oakReserveTitle)
  expect(readOnly).toContain(es.oakReserveReadOnly)
  expect(readOnly).not.toContain('data-testid="btn-oak-swap"')
  const swap = renderToString(
    <OakReserve pile={pile} team={team} canSwap pairs={pairs} onCommand={() => undefined} onClose={() => undefined} />,
  )
  expect(swap).toContain('data-testid="btn-oak-swap"')
  expect(swap).toContain('data-command="SwapWithOak"')
  expect(swap).toContain(es.tileSwapPair.replace('{team}', 'Squirtle').replace('{pile}', 'Poliwag'))
})

// AC: SPEC-I/T-074/AC-3 + AC-6 — panel-players: filas, resaltado y vista.
test('AC-3/AC-6 panel-players: 1 fila en MVP, activo resaltado y medallas del visto', () => {
  const one = playersVm(baseState())
  expect(one.length).toBe(1)
  expect(one[0]!.label).toBe(playerLabel(0))
  const html = renderToString(<PlayersPanel players={one} viewedId="p1" onView={() => undefined} />)
  expect((html.match(/data-testid="players-row"/g) ?? []).length).toBe(1)
  expect(html).toContain('data-active="true"')
  expect(html).toContain('data-viewed="true"')
  expect(html).toContain('data-medals-count="0"')
  expect(html).toContain(es.teamMedals)
  // Con N jugadores el panel agrega filas sin cambiar de layout (AC-6).
  const two = playersVm({
    ...baseState(),
    players: [player([pkm('p1-a')]), player([pkm('p2-a')], 'p2')],
  })
  const html2 = renderToString(<PlayersPanel players={two} viewedId="p1" onView={() => undefined} />)
  expect((html2.match(/data-testid="players-row"/g) ?? []).length).toBe(2)
})

// AC: SPEC-I/T-074/AC-4 — panel-turn: turno de {nombre} + btn-roll grande.
test('AC-4 panel-turn: Turno de Jugador 1, número y botón Tirar dado cuando se puede', () => {
  const html = renderToString(
    <TurnPanel
      turn={3}
      playerLabel={playerLabel(0)}
      phaseLabel={es.phaseNames.organize}
      canRoll
      canAdvance={false}
      onRoll={() => undefined}
      onAdvance={() => undefined}
    />,
  )
  expect(html).toContain(es.hudTurnOf.replace('{name}', 'Jugador 1'))
  expect(html).toContain('data-turn-number="3"')
  expect(html).toContain(es.hudTurnNumber.replace('{n}', '3'))
  expect(html).toContain('data-testid="btn-roll"')
  expect(html).toContain('data-command="RollMove"')
  expect(html).not.toContain('data-testid="btn-advance"')
  const waiting = renderToString(
    <TurnPanel
      turn={4}
      playerLabel={playerLabel(0)}
      phaseLabel={es.phaseNames.tileResolution}
      canRoll={false}
      canAdvance
      onRoll={() => undefined}
      onAdvance={() => undefined}
    />,
  )
  expect(waiting).not.toContain('data-testid="btn-roll"')
  expect(waiting).toContain('data-testid="btn-advance"')
  expect(waiting).toContain('data-command="Advance"')
})

// AC: SPEC-I/T-074/AC-5 — Ajustes del menú: velocidad, efectos y 2D/3D.
test('AC-5 Ajustes del menú: velocidad, reducir movimiento y tablero 2D/3D', () => {
  const changes: string[] = []
  const html = renderToString(
    <MenuSettings
      settings={{ speed: '1x', sound: false, reducedMotion: false, board: '3d' }}
      onChange={(next) => changes.push(next.speed)}
    />,
  )
  expect((html.match(/data-testid="menu-speed"/g) ?? []).length).toBe(3)
  expect((html.match(/data-testid="menu-board"/g) ?? []).length).toBe(2)
  expect(html).toContain('data-testid="menu-reduced"')
  expect(html).toContain(es.settingsReduced)
  expect(changes.length).toBe(0)
})

// Helpers puros del modelo (AC-1): HP y legalidad de reordenar.
test('AC-1 modelo: hpOf y canReorder (solo jugador propio en organize sin pending)', () => {
  expect(hpOf(50, pkm('p1-a', { damage: 20 }))).toEqual({ current: 30, max: 50, ratio: 0.6 })
  expect(hpOf(null, pkm('p1-a'))).toEqual({ current: 1, max: 1, ratio: 1 })
  const state = baseState()
  expect(canReorder(state, 'p1')).toBe(true)
  expect(canReorder({ ...state, phase: 'moving' }, 'p1')).toBe(false)
  expect(canReorder({ ...state, pending: { type: 'OakSwap' } }, 'p1')).toBe(false)
})
