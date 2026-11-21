// AC: SPEC-I/T-073/AC-1..AC-6 — Mochila: 5 filas, drag con pointer events
// (resalto/atenúa), reglas de soltado (resolveDrop → comando correcto), drop
// ilegal (motivo, sin comando), alternativa táctil (selección) y quitar energía
// (unequip). Proxy SSR (renderToString, patrón T-074); la interacción real de
// puntero la cubre e2e/t073-backpack.mjs.
import { parseCardId, parseNodeId, parsePlayerId, parsePkmUid } from '@liga/content'
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import {
  createInitialState,
  type Command,
  type GameState,
  type PlayerState,
  type PkmInstance,
  type PokemonCard,
} from '@liga/engine'
import { es } from '../i18n/es'
import { gameContent } from '../game/content'
import { applyToSession, startSession } from '../game/session'
import { BackpackPanel } from './BackpackPanel'
import { TeamStrip } from './TeamStrip'
import {
  MULTICOLOR_ELEMENTS,
  backpackReasonText,
  backpackRows,
  resolveDrop,
  type BackpackReason,
  type DragPayload,
} from './backpack'
import { resetCarryForTests, useCarryStore } from './carry'

const squirtleCard = {
  id: 'squirtle',
  dex: 7,
  name: 'Squirtle',
  hp: 50,
  element: 'water',
} as unknown as PokemonCard

const cardOf = (cardId: string): PokemonCard | undefined =>
  cardId === 'squirtle' ? squirtleCard : gameContent.cards.find((card) => card.id === cardId)

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

const waterCard = (n: number) => ({ id: parseCardId(`element_water#${String(n)}`), element: 'water' as const })

const player = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: parsePlayerId('p1'),
  position: parseNodeId('paleta'),
  cameFrom: null,
  team: [pkm('p1-a'), pkm('p1-b')],
  oakPile: [],
  elements: [waterCard(1), waterCard(2)],
  multicolor: 1,
  items: { pokeball: 3, potion: 2, oportunidad: 1, super_potion: 1, ultraball: 1, masterball: 1 },
  medals: [],
  ...overrides,
})

const wildBattle = (rivalDamage = 0): GameState['battle'] => ({
  kind: 'wild',
  card: parseCardId('poliwag'),
  deck: 'pantano',
  rival: [
    { uid: parsePkmUid('rival-1'), cardId: parseCardId('poliwag'), damage: rivalDamage, fainted: false },
  ],
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

const baseState = (overrides: Partial<GameState> = {}): GameState => ({
  ...createInitialState(),
  phase: 'organize',
  ruleset: gameContent.ruleset,
  players: [player()],
  activePlayerId: parsePlayerId('p1'),
  ...overrides,
})

const panel = (props: Partial<Parameters<typeof BackpackPanel>[0]> = {}): string =>
  renderToString(
    <BackpackPanel
      player={player()}
      state={baseState()}
      onCommand={() => true}
      {...props}
    />,
  )

const strip = (props: Partial<Parameters<typeof TeamStrip>[0]> = {}): string =>
  renderToString(
    <TeamStrip
      player={player()}
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

const element: DragPayload = { kind: 'element', elementId: 'element_water#1', element: 'water' }
const multicolor: DragPayload = { kind: 'multicolor' }
const potion: DragPayload = { kind: 'potion', item: 'potion' }
const superPotion: DragPayload = { kind: 'potion', item: 'super_potion' }
const ultraBall: DragPayload = { kind: 'ball', ball: 'ultraball' }
const masterBall: DragPayload = { kind: 'ball', ball: 'masterball' }
const pokeball: DragPayload = { kind: 'ball', ball: 'pokeball' }
const oportunidad: DragPayload = { kind: 'oportunidad' }
const unequip: DragPayload = { kind: 'unequip', pkmUid: 'p1-a', elementId: 'element_water#1', element: 'water' }

// AC: SPEC-I/T-073/AC-1 — 5 filas fijas, contadores y destinos resaltados/atenuados.
test('AC-1 mochila: 5 filas fijas con fichas y contadores; slots marcan válido/inválido', () => {
  resetCarryForTests()
  const rows = backpackRows(player())
  expect(rows.map((row) => row.key)).toEqual(['energies', 'multicolor', 'potions', 'balls', 'special'])
  expect(rows[0]!.tokens[0]).toMatchObject({ key: 'element_water', count: 2 })
  expect(rows[1]!.tokens[0]).toMatchObject({ key: 'multicolor', count: 1 })
  expect(rows[2]!.tokens.map((token) => token.count)).toEqual([2, 1])
  expect(rows[3]!.tokens.map((token) => token.count)).toEqual([3, 1, 1])
  expect(MULTICOLOR_ELEMENTS.length).toBe(13)

  const html = panel()
  expect((html.match(/data-testid="backpack-row"/g) ?? []).length).toBe(5)
  expect(html).toContain('data-token="element_water" data-count="2"')
  expect(html).toContain(es.backpackRowEnergies)
  expect(html).toContain(es.backpackRowBalls)

  // Con una carta seleccionada, los slots válidos resaltan y los inválidos se atenúan.
  const carried = { payload: element, mode: 'select' } as const
  const teamHtml = strip({
    carryOverride: carried,
    resolveCarry: (payload, target) => resolveDrop(payload, target, baseState(), cardOf).ok,
  })
  expect(teamHtml).toContain('data-drop-state="valid"')
  expect(teamHtml).toContain('data-drop-target="pkm"')
  resetCarryForTests()
})

// AC: SPEC-I/T-073/AC-2 — cada combinación legal produce el comando correcto.
test('AC-2 resolveDrop: ítem→destino legal produce el comando exacto del motor', () => {
  const state = baseState()
  expect(resolveDrop(element, { kind: 'pkm', uid: 'p1-a' }, state, cardOf)).toEqual({
    ok: true,
    command: { type: 'Equip', pkmUid: 'p1-a', elementId: 'element_water#1' },
  })
  expect(resolveDrop(multicolor, { kind: 'pkm', uid: 'p1-b' }, state, cardOf)).toEqual({
    ok: true,
    chooseElementFor: 'p1-b',
  })
  const hurt = baseState({
    players: [player({ team: [pkm('p1-a', { damage: 40 }), pkm('p1-b')] })],
  })
  expect(resolveDrop(potion, { kind: 'pkm', uid: 'p1-a' }, hurt, cardOf)).toEqual({
    ok: true,
    command: { type: 'UsePotion', pkmUid: 'p1-a', target: 'p1-a' },
  })
  expect(resolveDrop(superPotion, { kind: 'pkm', uid: 'p1-a' }, hurt, cardOf)).toEqual({
    ok: true,
    command: { type: 'UsePotion', pkmUid: 'p1-a', target: 'p1-a', item: 'super_potion' },
  })
  const inBattle = baseState({
    phase: 'battle',
    battle: wildBattle(),
    players: [player({ team: [pkm('p1-a', { damage: 20 }), pkm('p1-b')] })],
  })
  expect(resolveDrop(potion, { kind: 'pkm', uid: 'p1-a' }, inBattle, cardOf)).toEqual({
    ok: true,
    command: { type: 'UsePotion', pkmUid: 'p1-a', target: 'p1-a' },
  })
  const won = baseState({
    phase: 'tileResolution',
    pending: {
      type: 'CaptureOrRelease',
      card: 'poliwag',
      deck: 'pantano',
      participants: ['p1-a'],
    },
  })
  expect(resolveDrop(pokeball, { kind: 'rival' }, won, cardOf)).toEqual({
    ok: true,
    command: { type: 'Capture' },
  })
  expect(resolveDrop(masterBall, { kind: 'rival' }, inBattle, cardOf)).toEqual({
    ok: true,
    command: { type: 'ThrowBall', ball: 'masterball' },
  })
  const weakened = baseState({
    phase: 'battle',
    battle: wildBattle(30), // al rival le quedan ≤ 40 de vida: Ultra Ball legal (D-12)
    players: [player({ team: [pkm('p1-a', { damage: 20 }), pkm('p1-b')] })],
  })
  expect(resolveDrop(ultraBall, { kind: 'rival' }, weakened, cardOf)).toEqual({
    ok: true,
    command: { type: 'ThrowBall', ball: 'ultraball' },
  })
  expect(resolveDrop(unequip, { kind: 'backpack' }, state, cardOf)).toEqual({
    ok: true,
    command: { type: 'Unequip', pkmUid: 'p1-a', elementId: 'element_water#1' },
  })
})

// AC: SPEC-I/T-073/AC-2 — Oportunidad usa botón "Usar" en Organize.
test('AC-2 Oportunidad: botón Usar visible con stock, deshabilitado fuera de Organize', () => {
  const html = panel()
  expect(html).toContain('data-testid="btn-oportunidad"')
  expect(html).toContain('data-command="UseOportunidad"')
  expect(html).toContain(es.backpackUse)
  const moving = panel({ state: baseState({ phase: 'moving' }) })
  expect(moving).toContain('disabled=""')
})

// AC: SPEC-I/T-073/AC-3 — soltado ilegal: motivo y sin comando; sacudida vía store.
test('AC-3 resolveDrop: cada ilegal devuelve motivo y ningún comando; reject sacude', () => {
  const state = baseState()
  const cases: readonly (readonly [DragPayload, Parameters<typeof resolveDrop>[1], BackpackReason])[] = [
    [element, { kind: 'backpack' }, 'invalid-target'],
    [element, { kind: 'none' }, 'no-target'],
    [oportunidad, { kind: 'pkm', uid: 'p1-a' }, 'button-only'],
    [potion, { kind: 'pkm', uid: 'p1-b' }, 'no-damage'],
    [unequip, { kind: 'pkm', uid: 'p1-a' }, 'invalid-target'],
    [ultraBall, { kind: 'rival' }, 'ball-wild-only'],
    [pokeball, { kind: 'rival' }, 'capture-only'],
  ]
  for (const [payload, target, reason] of cases) {
    const resolution = resolveDrop(payload, target, state, cardOf)
    expect(resolution).toEqual({ ok: false, reason })
    expect(backpackReasonText(reason).length).toBeGreaterThan(3)
  }
  expect(resolveDrop(element, { kind: 'pkm', uid: 'p1-a' }, baseState({ phase: 'moving' }), cardOf)).toEqual({
    ok: false,
    reason: 'organize',
  })
  const gym = baseState({
    phase: 'battle',
    battle: {
      kind: 'gym',
      gym: 'erika',
      medal: 'arcoiris',
      prize: { kind: 'pkm', card: 'exeggutor' },
      rival: [{ uid: parsePkmUid('rival-1'), cardId: parseCardId('exeggutor'), damage: 0, fainted: false }],
      active: [parsePkmUid('p1-a'), parsePkmUid('rival-1')],
      turnSide: 0,
      conditions: {},
      trainerId: 'erika',
      firstTurn: [],
      participants: [parsePkmUid('p1-a')],
      won: false,
      noAttackThisTurn: false,
      actedThisTurn: false,
      lostCount: 0,
    },
  })
  expect(resolveDrop(masterBall, { kind: 'rival' }, gym, cardOf)).toEqual({ ok: false, reason: 'ball-gym' })
  const hurtBattle = baseState({
    phase: 'battle',
    battle: wildBattle(),
    players: [player({ team: [pkm('p1-a', { damage: 50 }), pkm('p1-b')] })],
  })
  expect(resolveDrop(potion, { kind: 'pkm', uid: 'p1-b' }, hurtBattle, cardOf)).toEqual({
    ok: false,
    reason: 'active-only',
  })
  // La nota del panel muestra el motivo y el store avisa la sacudida (AC-3).
  const withNote = panel({ note: es.backpackDropInvalid.replace('{reason}', backpackReasonText('organize')) })
  expect(withNote).toContain('data-testid="backpack-note"')
  resetCarryForTests()
  useCarryStore.getState().reject()
  expect(useCarryStore.getState().rejected).toBe(1)
  resetCarryForTests()
})

// AC: SPEC-I/T-073/AC-4 — sin arrastrar: seleccionar la carta (teclado/tap) y tocar el slot.
test('AC-4 selección: la ficha queda marcada, muestra detalle y se puede deseleccionar', () => {
  resetCarryForTests()
  const store = useCarryStore.getState()
  store.select(element)
  expect(useCarryStore.getState().carried).toEqual({ payload: element, mode: 'select' })
  const html = panel({ carryOverride: { payload: element, mode: 'select' } })
  expect(html).toContain('data-selected="true"')
  expect(html).toContain('data-testid="backpack-detail"')
  expect(html).toContain(es.backpackDetailElement)
  store.select(element) // toggle: soltar la selección
  expect(useCarryStore.getState().carried).toBeNull()
  // tapTarget registra el destino elegido (lo consume BackpackHud).
  store.tapTarget({ kind: 'pkm', uid: 'p1-a' })
  const tap = useCarryStore.getState().tap
  expect(tap?.target).toEqual({ kind: 'pkm', uid: 'p1-a' })
  resetCarryForTests()
})

// AC: SPEC-I/T-073/AC-5 — quitar energía: arrastrar la ficha equipada a la mochila.
test('AC-5 unequip: chips arrastrables solo en Organize; drop en mochila = Unequip', () => {
  const equipped = player({ team: [pkm('p1-a', { equipped: [waterCard(1)] }), pkm('p1-b')] })
  const draggable = strip({ player: equipped, chipDraggable: true })
  expect(draggable).toContain('data-testid="equip-chip"')
  expect(draggable).toContain('data-draggable="true"')
  expect(draggable).toContain('data-energy-count="1"')
  const fixed = strip({ player: equipped, chipDraggable: false })
  expect(fixed).toContain('data-draggable="false"')
  expect(resolveDrop(unequip, { kind: 'backpack' }, baseState(), cardOf)).toEqual({
    ok: true,
    command: { type: 'Unequip', pkmUid: 'p1-a', elementId: 'element_water#1' },
  })
  expect(resolveDrop(unequip, { kind: 'backpack' }, baseState({ phase: 'battle' }), cardOf)).toEqual({
    ok: false,
    reason: 'organize',
  })
})

// AC: SPEC-I/T-073/AC-2 — selector de tipo de 13 energías para el Multicolor.
test('AC-2 Multicolor: selector con las 13 energías con carta', () => {
  const html = panel({
    multicolorChoice: {
      pkmName: 'Squirtle',
      elements: MULTICOLOR_ELEMENTS,
      onPick: () => undefined,
      onCancel: () => undefined,
    },
  })
  expect(html).toContain('data-testid="multicolor-picker"')
  expect((html.match(/data-testid="multicolor-option"/g) ?? []).length).toBe(13)
  expect(html).toContain(es.backpackMulticolorFor.replace('{name}', 'Squirtle'))
})

// AC: SPEC-I/T-073/AC-6 — cada comando legal actualiza contadores; el ilegal no cambia nada.
test('AC-6 integración: los comandos de la mochila mueven el estado y los ilegales no', () => {
  const started = startSession({ seed: 7, starterDeck: 'isla' }, gameContent)
  if (!started.ok) throw new Error(started.error.message)
  const craft = (state: GameState): GameState => ({
    ...state,
    phase: 'organize',
    ruleset: gameContent.ruleset,
    players: [
      state.players[0] === undefined
        ? player()
        : {
            ...state.players[0],
            // Id de instancia único: el starter ya trae element_water#1..n equipadas.
            elements: [{ id: parseCardId('element_fire#77'), element: 'fire' }],
            multicolor: 1,
            items: { pokeball: 1, potion: 1, oportunidad: 0, super_potion: 0, ultraball: 0, masterball: 1 },
          },
    ],
  })
  const session = { ...started.value, state: craft(started.value.state) }
  const step = (command: Command) => applyToSession(session, command, gameContent)
  const equip = step({ type: 'Equip', pkmUid: session.state.players[0]!.team[0]!.uid, elementId: 'element_fire#77' })
  expect(equip.ok).toBe(true)
  if (equip.ok) {
    const owner = equip.value.session.state.players[0]!
    expect(owner.elements.length).toBe(0)
    const before = session.state.players[0]!.team[0]!.equipped.length
    expect(owner.team[0]!.equipped.length).toBe(before + 1)
  }
  const assign = step({ type: 'AssignMulticolor', pkmUid: session.state.players[0]!.team[0]!.uid, element: 'fire' })
  expect(assign.ok).toBe(true)
  if (assign.ok) {
    expect(assign.value.session.state.players[0]!.team[0]!.multicolor).toEqual(['fire'])
  }
  const potions = startSession({ seed: 7, starterDeck: 'isla' }, gameContent)
  if (!potions.ok) throw new Error(potions.error.message)
  const hurtBase = craft(potions.value.state)
  const hurtSession = {
    ...potions.value,
    state: {
      ...hurtBase,
      players: [
        {
          ...hurtBase.players[0]!,
          team: [{ ...hurtBase.players[0]!.team[0]!, damage: 40 }],
        },
      ],
    },
  }
  const uid = hurtSession.state.players[0]!.team[0]!.uid
  const healed = applyToSession(hurtSession, { type: 'UsePotion', pkmUid: uid, target: uid }, gameContent)
  expect(healed.ok).toBe(true)
  if (healed.ok) {
    expect(healed.value.session.state.players[0]!.team[0]!.damage).toBe(40 - gameContent.ruleset.potionHeal)
    expect(healed.value.session.state.players[0]!.items.potion).toBe(0)
  }
  // Ilegal (motor): no cambia nada.
  const illegal = applyToSession(
    hurtSession,
    { type: 'Unequip', pkmUid: uid, elementId: 'element_fire#77' },
    gameContent,
  )
  expect(illegal.ok).toBe(false)
})
