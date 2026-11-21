// AC: SPEC-R/T-103 — modelo puro de la ventana de carta: spec por origen
// (equipo/pila Oak/rival), acciones legales espejo de legalCommands, grupos de
// energías disponibles, etiquetas de costo faltante y geometría (AC-3/4/5).
import { expect, test } from 'vitest'
import { parseCardId, parseNodeId, parsePlayerId, parsePkmUid } from '@liga/content'
import {
  createRng,
  legalCommands,
  type Attack,
  type BattleState,
  type Command,
  type ElementCard,
  type GameState,
  type PlayerState,
  type PkmInstance,
} from '@liga/engine'
import { gameContent } from '../game/content'
import { uiLayout } from '../shell/layout'
import { cardModalConfig } from './config'
import {
  availableEnergies,
  cardModalActions,
  cardModalGeometry,
  cardModalSpec,
  costGaps,
  MULTICOLOR_OPTIONS,
} from './model'

const pkm = (uid: string, cardId = 'squirtle', damage = 0, xp = 0): PkmInstance => ({
  uid: parsePkmUid(uid),
  cardId: parseCardId(cardId),
  damage,
  xp,
  equipped: [],
  multicolor: [],
  fainted: false,
})

const elementCard = (id: string, element: 'water' | 'fire'): ElementCard => ({
  id: parseCardId(id),
  element,
})

const player = (id: string): PlayerState => ({
  id: parsePlayerId(id),
  position: parseNodeId('paleta'),
  cameFrom: null,
  team: [pkm('p1-a'), { ...pkm('p1-b', 'poliwag'), damage: 10 }],
  oakPile: [pkm('p1-oak', 'poliwag')],
  elements: [elementCard('element_fire#1', 'fire')],
  multicolor: 1,
  items: { pokeball: 1, potion: 1, oportunidad: 0, super_potion: 1, ultraball: 0, masterball: 0 },
  medals: [],
})

const wildBattle = (): BattleState => ({
  kind: 'wild',
  card: parseCardId('poliwag'),
  deck: 'bosque',
  rival: [{ uid: parsePkmUid('rival-1'), cardId: parseCardId('poliwag'), damage: 0, fainted: false }],
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
  version: 1,
  turn: 1,
  phase: 'organize',
  pending: null,
  battle: null,
  stepsLeft: 0,
  rngState: 0,
  dieLog: [],
  ruleset: gameContent.ruleset,
  players: [player('p1')],
  activePlayerId: parsePlayerId('p1'),
  decks: { bosque: [], montana: [], isla: [], llanura: [], pantano: [], item: [], sorpresa: [] },
  ...overrides,
})

const legal = (state: GameState): readonly Command[] =>
  legalCommands(state, { content: gameContent, rng: createRng(0) })

// AC: SPEC-R/T-103/AC-1 - cada origen resuelve SU carta: equipo, pila de Oak y
// rival del combate activo; uid inexistente ⇒ null (se cierra la ventana).
test('AC: SPEC-R/T-103/AC-1 - cardModalSpec por origen (equipo, Oak, rival)', () => {
  const state = stateOf()
  const team = cardModalSpec(state, state.players[0]!, { source: 'team', uid: 'p1-a' })
  expect(team).not.toBeNull()
  expect(team!.card.name).toBe('Squirtle')
  expect(team!.active).toBe(true)
  expect(team!.readOnly).toBe(false)

  const oak = cardModalSpec(state, state.players[0]!, { source: 'oak', uid: 'p1-oak' })
  expect(oak).not.toBeNull()
  expect(oak!.readOnly).toBe(true)
  expect(oak!.notice).toBe('oak')
  expect(oak!.elements).toEqual([])

  const battling = stateOf({ phase: 'battle', battle: wildBattle() })
  const rival = cardModalSpec(battling, battling.players[0]!, { source: 'rival' })
  expect(rival).not.toBeNull()
  expect(rival!.card.name).toBe('Poliwag')
  expect(rival!.readOnly).toBe(true)

  expect(cardModalSpec(state, state.players[0]!, { source: 'team', uid: 'no-existe' })).toBeNull()
  expect(cardModalSpec(stateOf(), stateOf().players[0]!, { source: 'rival' })).toBeNull()
})

// AC: SPEC-R/T-103/AC-14 - solo lectura: otro jugador (D-28), pila de Oak,
// carta del rival y combate activo (aunque sea tu propio equipo).
test('AC: SPEC-R/T-103/AC-14 -readOnly para espectador, Oak, rival y combate', () => {
  const own = player('p1')
  const other = { ...player('p2'), id: parsePlayerId('p2') }
  const spectated = stateOf({ players: [own, other] })
  expect(cardModalSpec(spectated, other, { source: 'team', uid: 'p1-a' })!.notice).toBe('spectator')

  const battling = stateOf({ phase: 'battle', battle: wildBattle() })
  const inBattle = cardModalSpec(battling, battling.players[0]!, { source: 'team', uid: 'p1-a' })
  expect(inBattle!.readOnly).toBe(true)
  expect(inBattle!.notice).toBe('battle')
})

// AC: SPEC-R/T-103/AC-12,AC-13 - las acciones son un espejo de legalCommands:
// Equip/Unequip en organize, Multicolor con selector de 13, poción solo al
// dañado y Evolve solo con XP cumplida.
test('AC: SPEC-R/T-103/AC-12,AC-13 - cardModalActions refleja legalCommands', () => {
  const state = stateOf()
  const commands = legal(state)
  const healthy = cardModalActions(state, commands, 'p1-a')
  expect(healthy.equipElementIds.has('element_fire#1')).toBe(true)
  expect(healthy.multicolorOptions).toHaveLength(13) // 13 energías con carta (D-24)
  expect(healthy.potions).toEqual([]) // sano: sin poción
  expect(healthy.evolutions).toEqual([])

  const damaged = cardModalActions(state, commands, 'p1-b')
  expect(damaged.potions).toEqual([{ item: 'potion' }, { item: 'super_potion' }])
  expect(damaged.equipElementIds.has('element_fire#1')).toBe(true) // legal para todo el equipo
  expect(damaged.evolutions).toEqual([]) // sin XP cumplida
})

test('AC: SPEC-R/T-103/AC-13 - Evolve refleja legalCommands (con D-06 en tileResolution)', () => {
  // Con el contenido de desarrollo solo hay 4 cartas y NINGUNA evolución
  // tiene su destino cargado (poliwhirl/wartortle no existen): el motor no
  // ofrece Evolve y la ventana tampoco. El camino positivo (botón por opción,
  // Eevee incluido) lo cubre CardModal.test AC-13 con acciones armadas.
  const state = stateOf({
    phase: 'tileResolution',
    players: [{ ...player('p1'), team: [{ ...pkm('p1-a'), xp: 9 }] }],
  })
  const healthy = cardModalActions(state, legal(state), 'p1-a')
  expect(healthy.evolutions).toEqual([])
  // Y el espejo es exacto contra el motor: Evolve legal ⇒ aparece.
  const crafted: readonly Command[] = [
    { type: 'Evolve', pkmUid: parsePkmUid('p1-a'), toId: 'charmander' },
  ]
  expect(cardModalActions(state, crafted, 'p1-a').evolutions).toEqual([])
  // charmander no está en evolvesTo de squirtle ⇒ descartado por consistencia.
  const poliwagState = stateOf({
    players: [{ ...player('p1'), team: [{ ...pkm('p1-a', 'poliwag', 0, 1) }] }],
  })
  const withTarget: readonly Command[] = [
    { type: 'Evolve', pkmUid: parsePkmUid('p1-a'), toId: 'poliwhirl' },
  ]
  // poliwhirl no está cargado en el contenido ⇒ tampoco (defensa del modelo).
  expect(cardModalActions(poliwagState, withTarget, 'p1-a').evolutions).toEqual([])
})

// AC: SPEC-R/T-103/AC-11 - disponibles agrupadas por elemento con contador.
test('AC: SPEC-R/T-103/AC-11 - availableEnergies agrupa por elemento con contador', () => {
  const groups = availableEnergies([
    elementCard('element_water#2', 'water'),
    elementCard('element_water#3', 'water'),
    elementCard('element_fire#1', 'fire'),
  ])
  expect(groups).toHaveLength(2)
  expect(groups[0]).toEqual({ element: 'water', count: 2, exampleId: 'element_water#2' })
  expect(groups[1]!.count).toBe(1)
  expect(availableEnergies([])).toEqual([])
})

// AC: SPEC-R/T-103/AC-9 - etiqueta de costo faltante: misma matemática que
// canUse (multicolor cuenta como su elemento asignado; any = total).
test('AC: SPEC-R/T-103/AC-9 - costGaps: falta específico y genérico', () => {
  const withFire = { ...pkm('p1-a'), equipped: [elementCard('element_fire#1', 'fire')] }
  const attack: Attack = {
    id: 'x',
    name: 'X',
    kind: 'attack',
    rollFaces: [1],
    cost: ['fire', 'fire', 'any'],
    element: 'fire',
    damage: { base: 10 },
    effects: [],
    rawText: '',
  }
  const gaps = costGaps(withFire, attack)
  expect(gaps).toEqual([
    { element: 'fire', missing: 1 },
    { element: 'any', missing: 2 },
  ])
  const paid = {
    ...withFire,
    equipped: [
      elementCard('element_fire#1', 'fire'),
      elementCard('element_fire#2', 'fire'),
      elementCard('element_water#1', 'water'),
    ],
  }
  expect(costGaps(paid, attack)).toEqual([])
})

// AC: plan costo-normal-any/AC-5 - costGaps con 2 slots `any` nunca reporta
// "Falta Normal" (no hay energía Normal, D-24): con 1 sola energía reporta el
// gap genérico (element: 'any').
test('AC: plan costo-normal-any/AC-5 - costGaps ["any","any"] sin gap Normal', () => {
  const attack: Attack = {
    id: 'rasgunos',
    name: 'Rasguños',
    kind: 'attack',
    rollFaces: [1],
    cost: ['any', 'any'],
    element: 'normal',
    damage: { base: 20 },
    effects: [],
    rawText: '',
  }
  const none = pkm('p1-a')
  expect(costGaps(none, attack)).toEqual([{ element: 'any', missing: 2 }])
  const one = { ...none, equipped: [elementCard('element_fire#1', 'fire')] }
  expect(costGaps(one, attack)).toEqual([{ element: 'any', missing: 1 }])
  const two = {
    ...one,
    equipped: [elementCard('element_fire#1', 'fire'), elementCard('element_water#1', 'water')],
  }
  expect(costGaps(two, attack)).toEqual([])
  for (const target of [none, one, two]) {
    expect(costGaps(target, attack).some((gap) => gap.element === 'normal')).toBe(false)
  }
})

// AC: SPEC-R/T-103/AC-3,AC-4 - geometría: alto 86 % con clamps px, carta con
// aspecto 0,63 ± 0,03 y panel lateral de 300 px.
test('AC: SPEC-R/T-103/AC-3,AC-4 - geometría a 1366×768 y 1024×600', () => {
  const at768 = cardModalGeometry(1366, 768, cardModalConfig, uiLayout)
  expect(Math.round(at768.window.h)).toBe(Math.round(Math.min(760, Math.max(520, 768 * 0.86))))
  expect(at768.window.h).toBeGreaterThanOrEqual(520)
  expect(at768.window.h).toBeLessThanOrEqual(760)
  expect(Math.abs(at768.cardW / at768.cardH - cardModalConfig.card.aspect)).toBeLessThan(
    cardModalConfig.card.aspectTolerance,
  )
  expect(at768.sideW).toBe(cardModalConfig.sidePanel.widthPx)
  expect(at768.stacked).toBe(false)

  const at600 = cardModalGeometry(1024, 600, cardModalConfig, uiLayout)
  expect(at600.window.h).toBe(520) // 0,86×600 = 516 → clamp mínimo
  // Ventana dentro del viewport.
  expect(at768.window.x).toBeGreaterThanOrEqual(0)
  expect(at768.window.x + at768.window.w).toBeLessThanOrEqual(1366)
})

// AC: SPEC-R/T-103/AC-5 - no tapa panel-dice ni panel-turn si hay espacio; la
// ventana queda centrada y sin solapes a los tamaños soportados.
test('AC: SPEC-R/T-103/AC-5 - sin solape con panel-dice/panel-turn a los tamaños soportados', () => {
  for (const [vw, vh] of [
    [1024, 600],
    [1366, 768],
    [1920, 1080],
  ] as const) {
    const geo = cardModalGeometry(vw, vh, cardModalConfig, uiLayout)
    expect(geo.coversPanel, `${String(vw)}×${String(vh)}`).toBe(false)
    // Centrada (±2 px): no hubo que correrla.
    expect(Math.abs(geo.window.x - (vw - geo.window.w) / 2)).toBeLessThanOrEqual(2)
  }
})

// AC: SPEC-R/T-103/AC-4 - por debajo de stackBelowPx el panel va debajo.
test('AC: SPEC-R/T-103/AC-4 - stack por debajo de 900 px de ancho', () => {
  const geo = cardModalGeometry(700, 600, cardModalConfig, uiLayout)
  expect(geo.stacked).toBe(true)
})

// AC: SPEC-R/T-103/AC-12 - selector Multicolor = las 13 energías con carta.
test('AC: SPEC-R/T-103/AC-12 - MULTICOLOR_OPTIONS son las 13 energías (D-24)', () => {
  expect(MULTICOLOR_OPTIONS).toHaveLength(13)
  expect(MULTICOLOR_OPTIONS).not.toContain('normal')
  expect(MULTICOLOR_OPTIONS).not.toContain('dragon')
})
