// AC: SPEC-B/T-012 — Casilleros y mazos: robo, mercado, centro, Oak, dejar ir.
// Un test por AC del spec; tableros sintéticos para casos controlados (patrón t011).
// El jugador se coloca a mano en `tileResolution` con pilas de mazo controladas.
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { BoardGraph, BoardNode, NodeType, NodeShape } from '../packages/content/src/board.ts'
import { parseCardId, parseNodeId, parsePkmUid } from '../packages/content/src/ids.ts'
import type { CardId, DeckKey } from '../packages/content/src/index.ts'
import { loadContent } from '../packages/content/src/node.ts'
import {
  applyCommand,
  EngineError,
  legalCommands,
  newGame,
  pushToBottom,
  type Command,
  type CommandOk,
  type Ctx,
  type GameEvent,
  type GameState,
  type PlayerState,
  type Result,
} from '../packages/engine/src/index.ts'

const content = loadContent(join(process.cwd(), 'content'))

type TileSpec = readonly [id: string, type: NodeType, shape: NodeShape, deck?: string]

/** Tablero sintético mínimo: un solo casillero (no se mueve, solo se resuelve). */
const tileBoard = (tiles: readonly TileSpec[]): BoardGraph => ({
  meta: { id: 't012-test', status: 'VERIFIED' },
  gyms: {},
  nodes: tiles.map(
    ([id, type, shape, deck]): BoardNode => (deck === undefined ? { id, type, shape, x: 0, y: 0 } : { id, type, shape, x: 0, y: 0, deck: deck as BoardNode['deck'] }),
  ),
  edges: [],
})

interface TileGameOptions {
  readonly board: BoardGraph
  readonly at: string
  readonly decks?: Partial<Record<DeckKey, readonly string[]>>
  readonly player?: (player: PlayerState) => PlayerState
}

/** Partida real con el jugador en `at`, fase tileResolution y pilas controladas. */
const atTile = (options: TileGameOptions): { state: GameState; ctx: Ctx } => {
  const started = newGame({ seed: 7, starterDeck: 'montana', ruleset: content.ruleset }, content)
  if (!started.ok) throw new Error(started.error.message)
  const base = started.value.state
  const basePlayer = base.players[0]!
  const decks = { ...base.decks }
  for (const [key, stack] of Object.entries(options.decks ?? {})) {
    decks[key as DeckKey] = (stack ?? []).map((id) => parseCardId(id))
  }
  const player = options.player === undefined ? basePlayer : options.player(basePlayer)
  const state: GameState = {
    ...base,
    phase: 'tileResolution',
    stepsLeft: 0,
    decks,
    players: [{ ...player, position: parseNodeId(options.at), cameFrom: null }],
  }
  return { state, ctx: { content: { ...content, board: options.board }, rng: { d6: () => 6, int: () => 0, snapshot: () => 0 } } }
}

const run = (state: GameState, command: Command, ctx: Ctx): Result<CommandOk, EngineError> =>
  applyCommand(state, command, ctx)

const oakPkm = {
  uid: parsePkmUid('p1-oak-1'),
  cardId: parseCardId('poliwag'),
  damage: 0,
  xp: 0,
  equipped: [],
  multicolor: [],
  fainted: false,
}

const mazoMontana = tileBoard([['m1', 'deck', 'round', 'montana']])
const mercadoTile = tileBoard([['mer', 'mercado', 'round']])
const centroTile = tileBoard([['cen', 'centro', 'square']])
const oakTile = tileBoard([['oak1', 'oak', 'square']])
const deshabilitados = tileBoard([
  ['du1', 'duelo', 'round'],
  ['so1', 'sorpresa', 'round'],
  ['li1', 'liga', 'square'],
])

// AC: SPEC-B/T-012/AC-1 — deck: robar cima; elemento ⇒ elements; PKM ⇒ FightOrRelease.
test('AC-1 deck roba la carta superior: elemento va a elements, PKM deja pending=FightOrRelease', () => {
  // Carta de elemento: se queda en el inventario con id de instancia único.
  const elementGame = atTile({ board: mazoMontana, at: 'm1', decks: { montana: ['element_fire', 'element_grass'] } })
  const element = run(elementGame.state, { type: 'Advance' }, elementGame.ctx)
  expect(element.ok).toBe(true)
  if (!element.ok) throw new Error(element.error.message)
  expect(element.value.state.players[0]!.elements).toEqual([{ id: 'element_fire#2', element: 'fire' }]) // #1 es del inicial
  expect(element.value.state.decks.montana).toEqual([parseCardId('element_grass')])
  expect(element.value.state.pending).toBeNull()
  expect(element.value.state.phase).toBe('organize')
  expect(element.value.events).toContainEqual({ type: 'CardDrawn', player: 'p1', deck: 'montana', card: 'element_fire' })

  // Carta de PKM: encuentro pendiente (pelear llega con T-020; hoy se puede dejar ir).
  const pkmGame = atTile({ board: mazoMontana, at: 'm1', decks: { montana: ['charmander'] } })
  const pkm = run(pkmGame.state, { type: 'Advance' }, pkmGame.ctx)
  expect(pkm.ok).toBe(true)
  if (!pkm.ok) throw new Error(pkm.error.message)
  expect(pkm.value.state.pending).toEqual({ type: 'FightOrRelease', card: 'charmander', deck: 'montana' })
  expect(pkm.value.state.phase).toBe('tileResolution')
  expect(pkm.value.state.turn).toBe(pkmGame.state.turn) // el turno no avanza hasta resolver
  // T-020: pelear con cualquier sano + dejar ir (D-08).
  expect(legalCommands(pkm.value.state, pkmGame.ctx)).toEqual([
    { type: 'FightEncounter', pkmUid: 'p1-starter' },
    { type: 'ReleaseWild' },
  ])
})

// AC: SPEC-B/T-012/AC-2 — mercado roba del mazo ítem; centro cura a todos; oak intercambia.
test('AC-2 mercado roba del mazo ítem, centro cura a todos y oak intercambia curando al que pasa a la pila', () => {
  // Mercado: la cima del mazo Ítem entra a la bolsa.
  const mercadoGame = atTile({ board: mercadoTile, at: 'mer', decks: { item: ['potion', 'pokeball'] } })
  const mercado = run(mercadoGame.state, { type: 'Advance' }, mercadoGame.ctx)
  expect(mercado.ok).toBe(true)
  if (!mercado.ok) throw new Error(mercado.error.message)
  const emptyBag = { pokeball: 5, potion: 0, oportunidad: 0, super_potion: 0, ultraball: 0, masterball: 0 }
  expect(mercadoGame.state.players[0]!.items).toEqual(emptyBag)
  expect(mercado.value.state.players[0]!.items).toEqual({ ...emptyBag, potion: 1 })
  expect(mercado.value.state.decks.item).toEqual([parseCardId('pokeball')])
  expect(mercado.value.events).toContainEqual({ type: 'CardDrawn', player: 'p1', deck: 'item', card: 'potion' })

  // Centro PKM: cura TODO el equipo (daño 0, sin derrotas).
  const centroGame = atTile({
    board: centroTile,
    at: 'cen',
    player: (p) => ({ ...p, team: p.team.map((pkm) => ({ ...pkm, damage: 20, fainted: true })) }),
  })
  const centro = run(centroGame.state, { type: 'Advance' }, centroGame.ctx)
  expect(centro.ok).toBe(true)
  if (!centro.ok) throw new Error(centro.error.message)
  expect(centro.value.state.players[0]!.team).toEqual([
    { uid: 'p1-starter', cardId: 'charmander', damage: 0, xp: 0, equipped: [{ id: 'element_fire#1', element: 'fire' }], multicolor: [], fainted: false },
  ])
  expect(centro.value.events).toContainEqual({ type: 'PartyHealed', player: 'p1', count: 1 })

  // Prof. Oak: intercambio 1 a 1 equipo ↔ pila; el que pasa a la pila se cura; respeta el límite.
  const oakGame = atTile({
    board: oakTile,
    at: 'oak1',
    player: (p) => ({
      ...p,
      team: p.team.map((pkm) => ({ ...pkm, damage: 30 })),
      oakPile: [oakPkm],
    }),
  })
  // T-061: el casillero deja pending=OakSwap (decisión opcional) al resolverse.
  const atOak = run(oakGame.state, { type: 'Advance' }, oakGame.ctx)
  expect(atOak.ok).toBe(true)
  if (!atOak.ok) throw new Error(atOak.error.message)
  expect(atOak.value.state.pending).toEqual({ type: 'OakSwap' })
  expect(atOak.value.state.turn).toBe(oakGame.state.turn) // el turno espera la decisión
  expect(legalCommands(atOak.value.state, oakGame.ctx)).toContainEqual({
    type: 'SwapWithOak',
    teamUid: 'p1-starter',
    pileUid: 'p1-oak-1',
  })
  const swapped = run(atOak.value.state, { type: 'SwapWithOak', teamUid: 'p1-starter', pileUid: 'p1-oak-1' }, oakGame.ctx)
  expect(swapped.ok).toBe(true)
  if (!swapped.ok) throw new Error(swapped.error.message)
  const after = swapped.value.state.players[0]!
  expect(after.team).toHaveLength(1) // 1 a 1 ⇒ el equipo nunca supera el límite de 6
  expect(after.team[0]!.uid).toBe('p1-oak-1')
  expect(after.oakPile).toEqual([
    { uid: 'p1-starter', cardId: 'charmander', damage: 0, xp: 0, equipped: [{ id: 'element_fire#1', element: 'fire' }], multicolor: [], fainted: false }, // se cura al pasar
  ])
  expect(swapped.value.events).toContainEqual({ type: 'OakSwapped', player: 'p1', teamUid: 'p1-starter', pileUid: 'p1-oak-1' })
  expect(swapped.value.state.phase).toBe('tileResolution') // puede seguir intercambiando o terminar
})

// AC: SPEC-B/T-012/AC-3 — "dejar ir" devuelve la carta al FONDO; mazo vacío ⇒ DeckEmpty.
test('AC-3 dejar ir devuelve la carta al fondo del mazo; mazo vacío emite DeckEmpty sin error', () => {
  const game = atTile({ board: mazoMontana, at: 'm1', decks: { montana: ['charmander', 'element_fire'] } })
  const drawn = run(game.state, { type: 'Advance' }, game.ctx)
  expect(drawn.ok).toBe(true)
  if (!drawn.ok) throw new Error(drawn.error.message)

  const released = run(drawn.value.state, { type: 'ReleaseWild' }, game.ctx)
  expect(released.ok).toBe(true)
  if (!released.ok) throw new Error(released.error.message)
  expect(released.value.state.decks.montana).toEqual([parseCardId('element_fire'), parseCardId('charmander')]) // al FONDO
  expect(released.value.state.pending).toBeNull()
  expect(released.value.state.phase).toBe('organize')
  expect(released.value.events).toContainEqual({ type: 'CardToBottom', player: 'p1', deck: 'montana', card: 'charmander' })

  // Mazo vacío (D-10): no se roba, se avisa; no es error y el turno sigue.
  const empty = atTile({ board: mazoMontana, at: 'm1', decks: { montana: [] } })
  const emptied = run(empty.state, { type: 'Advance' }, empty.ctx)
  expect(emptied.ok).toBe(true)
  if (!emptied.ok) throw new Error(emptied.error.message)
  expect(emptied.value.state.decks.montana).toEqual([])
  expect(emptied.value.state.players[0]!.elements).toEqual([])
  expect(emptied.value.state.phase).toBe('organize')
  expect(emptied.value.events).toContainEqual({ type: 'DeckEmpty', player: 'p1', deck: 'montana' })
})

// AC: SPEC-B/T-012/AC-4 — duelo/sorpresa/liga deshabilitados se comportan como vacíos.
test('AC-4 duelo, sorpresa y liga deshabilitados por el ruleset se comportan como vacíos', () => {
  expect(content.ruleset.features).toEqual({ sorpresa: false, sorpresaDeck: true, liga: false, pokedexChart: false, duelo: false, houseEdits: true })
  for (const node of ['du1', 'so1', 'li1'] as const) {
    const game = atTile({ board: deshabilitados, at: node })
    const before = game.state.decks
    const result = run(game.state, { type: 'Advance' }, game.ctx)
    expect(result.ok, node).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.value.state.phase, node).toBe('organize')
    expect(result.value.state.decks, node).toEqual(before) // no roba nada
    // T-061: avisa por qué no pasó nada (TileResolved{disabledByRuleset}) y cierra el turno.
    expect(result.value.events, node).toEqual([
      { type: 'TileResolved', player: 'p1', info: 'disabledByRuleset' },
      { type: 'TurnAdvanced', turn: result.value.state.turn },
    ])
  }
})

// AC: SPEC-B/T-012/AC-5 — ítems usados vuelven al fondo del mazo ítem; los elementos nunca vuelven.
test('AC-5 ítems usados vuelven al fondo del mazo ítem; las cartas de elemento nunca vuelven', () => {
  // El ítem robado sale del mazo y entra a la bolsa; al usarse (T-020+) vuelve por
  // pushToBottom — única vía de retorno del motor — y queda al FONDO.
  const game = atTile({ board: mercadoTile, at: 'mer', decks: { item: ['pokeball', 'pokeball'] } })
  const drawn = run(game.state, { type: 'Advance' }, game.ctx)
  expect(drawn.ok).toBe(true)
  if (!drawn.ok) throw new Error(drawn.error.message)
  expect(drawn.value.state.decks.item).toEqual([parseCardId('pokeball')])
  const afterUse: readonly CardId[] = pushToBottom(drawn.value.state.decks.item, parseCardId('potion'))
  expect(afterUse).toEqual([parseCardId('pokeball'), parseCardId('potion')])

  // La carta de elemento robada se queda para siempre: nada la devuelve al mazo.
  const elementGame = atTile({ board: mazoMontana, at: 'm1', decks: { montana: ['element_fire', 'element_fire'] } })
  const element = run(elementGame.state, { type: 'Advance' }, elementGame.ctx)
  expect(element.ok).toBe(true)
  if (!element.ok) throw new Error(element.error.message)
  expect(element.value.state.decks.montana).toEqual([parseCardId('element_fire')]) // perdió una definitiva
  expect(element.value.state.players[0]!.elements).toHaveLength(1)
  expect(element.value.state.pending).toBeNull() // nunca genera encuentro ni retorno
})

// Extra (sin AC): guardas de ilegalidad sobre los comandos y contenido nuevos.
test('guardas: ReleaseWild sin encuentro, SwapWithOak fuera de oak o con uid inexistente devuelven EngineError', () => {
  // ReleaseWild sin decisión pendiente.
  const centroGame = atTile({ board: centroTile, at: 'cen' })
  const noEncuentro = run(centroGame.state, { type: 'ReleaseWild' }, centroGame.ctx)
  expect(noEncuentro.ok).toBe(false)
  if (!noEncuentro.ok) expect(noEncuentro.error.code).toBe('ILLEGAL_COMMAND')

  // Con encuentro pendiente, otro comando (Advance) no puede colarse.
  const pkmGame = atTile({ board: mazoMontana, at: 'm1', decks: { montana: ['charmander'] } })
  const drawn = run(pkmGame.state, { type: 'Advance' }, pkmGame.ctx)
  expect(drawn.ok).toBe(true)
  if (!drawn.ok) throw new Error(drawn.error.message)
  const colado = run(drawn.value.state, { type: 'Advance' }, pkmGame.ctx)
  expect(colado.ok).toBe(false)
  if (!colado.ok) expect(colado.error.code).toBe('PENDING_DECISION')

  // SwapWithOak fuera del casillero de Oak o con uids que no están (T-061: con pending).
  const fueraDeOak = run(centroGame.state, { type: 'SwapWithOak', teamUid: 'p1-starter', pileUid: 'p1-oak-1' }, centroGame.ctx)
  expect(fueraDeOak.ok).toBe(false)
  if (!fueraDeOak.ok) expect(fueraDeOak.error.code).toBe('ILLEGAL_COMMAND')

  const oakGame = atTile({ board: oakTile, at: 'oak1', player: (p) => ({ ...p, oakPile: [oakPkm] }) })
  const atOak = run(oakGame.state, { type: 'Advance' }, oakGame.ctx)
  expect(atOak.ok).toBe(true)
  if (!atOak.ok) throw new Error(atOak.error.message)
  const uidInexistente = run(
    atOak.value.state,
    { type: 'SwapWithOak', teamUid: 'p1-starter', pileUid: 'no-esta' },
    oakGame.ctx,
  )
  expect(uidInexistente.ok).toBe(false)
  if (!uidInexistente.ok) expect(uidInexistente.error.code).toBe('ILLEGAL_COMMAND')

  // Carta del mazo que no existe en content/pokemon ⇒ error tipado, sin crash.
  const roto = atTile({ board: mazoMontana, at: 'm1', decks: { montana: ['no-existe'] } })
  const invalida = run(roto.state, { type: 'Advance' }, roto.ctx)
  expect(invalida.ok).toBe(false)
  if (!invalida.ok) {
    expect(invalida.error.code).toBe('INVALID_CONTENT')
    expect(invalida.error.message).toContain('no-existe')
  }

  // Casillero habilitado por el ruleset pero sin implementar ⇒ falla explícito (sin silencio).
  const habilitado = tileBoard([['so9', 'sorpresa', 'round']])
  const game = atTile({ board: habilitado, at: 'so9' })
  const state = { ...game.state, ruleset: { ...content.ruleset, features: { ...content.ruleset.features, sorpresa: true } } }
  const result = run(state, { type: 'Advance' }, game.ctx)
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error.code).toBe('INVALID_CONTENT')
})

// Extra (sin AC): los eventos de robo alimentan la UI sin tocar el estado a mano.
test('eventos: CardDrawn/CardToBottom/DeckEmpty reflejan el mazo y la carta de cada operación', () => {
  const game = atTile({ board: mazoMontana, at: 'm1', decks: { montana: ['poliwag'] } })
  const drawn = run(game.state, { type: 'Advance' }, game.ctx)
  expect(drawn.ok).toBe(true)
  if (!drawn.ok) throw new Error(drawn.error.message)
  const kinds = (events: readonly GameEvent[]): string[] => events.map((e) => e.type)
  expect(kinds(drawn.value.events)).toEqual(['CardDrawn'])
  const released = run(drawn.value.state, { type: 'ReleaseWild' }, game.ctx)
  expect(released.ok).toBe(true)
  if (!released.ok) throw new Error(released.error.message)
  expect(kinds(released.value.events)).toEqual(['CardToBottom', 'TurnAdvanced'])
})
