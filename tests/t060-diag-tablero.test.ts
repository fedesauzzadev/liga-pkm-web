// AC: SPEC-G/T-060/AC-2 — Diagnóstico de casilleros de punta a punta: un test de
// integración por tipo (deck×5, mercado, centro, oak, duelo, gym, empty, start,
// sorpresa, liga). Jugador colocado en el nodo en fase tileResolution (estado
// exacto tras terminar el movimiento); comando de fin de movimiento = Advance.
// Los que hoy no cumplen el contrato de T-061 quedan marcados con el id T-061.
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { BoardGraph, BoardNode, NodeType, NodeShape } from '../packages/content/src/board.ts'
import { parseCardId, parseNodeId, parsePkmUid } from '../packages/content/src/ids.ts'
import type { DeckId, DeckKey } from '../packages/content/src/index.ts'
import { loadContent } from '../packages/content/src/node.ts'
import {
  applyCommand,
  EngineError,
  newGame,
  type Command,
  type CommandOk,
  type Ctx,
  type GameState,
  type PlayerState,
  type Result,
} from '../packages/engine/src/index.ts'

const content = loadContent(join(process.cwd(), 'content'))

type TileSpec = readonly [id: string, type: NodeType, shape: NodeShape, deckOrGym?: string]

/** Tablero sintético mínimo (patrón t012): un solo casillero, sin aristas. */
const tileBoard = (tiles: readonly TileSpec[], gyms: BoardGraph['gyms'] = {}): BoardGraph => ({
  meta: { id: 't060-test', status: 'VERIFIED' },
  gyms,
  nodes: tiles.map(([id, type, shape, extra]): BoardNode => {
    if (extra === undefined) return { id, type, shape, x: 0, y: 0 }
    return type === 'deck'
      ? { id, type, shape, x: 0, y: 0, deck: extra as BoardNode['deck'] }
      : { id, type, shape, x: 0, y: 0, gym: extra }
  }),
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
  return {
    state,
    ctx: {
      content: { ...content, board: options.board },
      rng: { d6: () => 6, int: () => 0, snapshot: () => 0 },
    },
  }
}

const run = (state: GameState, command: Command, ctx: Ctx): Result<CommandOk, EngineError> =>
  applyCommand(state, command, ctx)

/** PKM en la pila de Oak para el caso de intercambio (T-061). */
const oakPkm = {
  uid: parsePkmUid('p1-oak-1'),
  cardId: parseCardId('poliwag'),
  damage: 0,
  xp: 0,
  equipped: [],
  multicolor: [],
  fainted: false,
}

/**
 * Mazo de cada ciudad: elemento esperado y carta PKM para el encuentro.
 * OJO: content/pokemon solo tiene cargados charmander/squirtle/poliwag; para
 * bosque/llanura se usa poliwag (el motor valida existencia, no pertenencia).
 */
const DECK_CASES: readonly { readonly deck: DeckId; readonly element: string; readonly wild: string }[] = [
  { deck: 'bosque', element: 'grass', wild: 'poliwag' },
  { deck: 'montana', element: 'fire', wild: 'charmander' },
  { deck: 'isla', element: 'water', wild: 'squirtle' },
  { deck: 'llanura', element: 'fighting', wild: 'poliwag' },
  { deck: 'pantano', element: 'psychic', wild: 'poliwag' },
 ]

// AC: SPEC-G/T-060/AC-2 — deck×5: elemento ⇒ CardDrawn + inventario; PKM ⇒ FightOrRelease.
for (const { deck, element, wild } of DECK_CASES) {
  test(`AC-2 deck:${deck} roba elemento (CardDrawn + inventario) y PKM (pending=FightOrRelease)`, () => {
    const board = tileBoard([[`deck_${deck}`, 'deck', 'round', deck]])
    const elementGame = atTile({ board, at: `deck_${deck}`, decks: { [deck]: [`element_${element}`] } })
    const elementResult = run(elementGame.state, { type: 'Advance' }, elementGame.ctx)
    expect(elementResult.ok).toBe(true)
    if (!elementResult.ok) throw new Error(elementResult.error.message)
    expect(elementResult.value.events).toContainEqual({
      type: 'CardDrawn',
      player: 'p1',
      deck,
      card: `element_${element}`,
    })
    expect(elementResult.value.state.players[0]!.elements).toHaveLength(1)
    expect(elementResult.value.state.players[0]!.elements[0]!.element).toBe(element)
    expect(elementResult.value.state.pending).toBeNull()
    expect(elementResult.value.state.phase).toBe('organize')

    const pkmGame = atTile({ board, at: `deck_${deck}`, decks: { [deck]: [wild] } })
    const pkmResult = run(pkmGame.state, { type: 'Advance' }, pkmGame.ctx)
    expect(pkmResult.ok).toBe(true)
    if (!pkmResult.ok) throw new Error(pkmResult.error.message)
    expect(pkmResult.value.state.pending).toEqual({ type: 'FightOrRelease', card: wild, deck })
    expect(pkmResult.value.events).toContainEqual({
      type: 'CardDrawn',
      player: 'p1',
      deck,
      card: wild,
    })
  })
}

// AC: SPEC-G/T-060/AC-2 — mercado: roba del mazo Ítem y entra a la bolsa.
test('AC-2 mercado roba del mazo Ítem (CardDrawn{deck:"item"} + bolsa)', () => {
  const game = atTile({ board: tileBoard([['mer', 'mercado', 'round']]), at: 'mer', decks: { item: ['potion'] } })
  const result = run(game.state, { type: 'Advance' }, game.ctx)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  expect(result.value.events).toContainEqual({ type: 'CardDrawn', player: 'p1', deck: 'item', card: 'potion' })
  expect(result.value.state.players[0]!.items.potion).toBe(1)
  expect(result.value.state.phase).toBe('organize')
})

// AC: SPEC-G/T-060/AC-2 — centro: cura a todo el equipo y lo informa.
test('AC-2 centro cura a todo el equipo (PartyHealed{count})', () => {
  const game = atTile({
    board: tileBoard([['cen', 'centro', 'square']]),
    at: 'cen',
    player: (p) => ({ ...p, team: p.team.map((pkm) => ({ ...pkm, damage: 20, fainted: true })) }),
  })
  const result = run(game.state, { type: 'Advance' }, game.ctx)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  expect(result.value.events).toContainEqual({ type: 'PartyHealed', player: 'p1', count: 1 })
  expect(result.value.state.players[0]!.team[0]!.damage).toBe(0)
  expect(result.value.state.players[0]!.team[0]!.fainted).toBe(false)
  expect(result.value.state.phase).toBe('organize')
})

// AC: SPEC-G/T-060/AC-2 — gym con medallas exigidas: GymLocked (hoy funciona).
test('AC-2 gym cerrojo por medallas emite GymLocked (regla de Giovanni)', () => {
  const board = tileBoard([['giov', 'gym', 'square', 'giovanni']], {
    giovanni: { city: 'verde', medal: 'Tierra', verified: true, requiresMedals: 7 },
  })
  const game = atTile({ board, at: 'giov' })
  const result = run(game.state, { type: 'Advance' }, game.ctx)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  expect(result.value.events).toContainEqual({
    type: 'GymLocked',
    player: 'p1',
    gym: 'giovanni',
    requiresMedals: 7,
  })
  expect(result.value.state.phase).toBe('organize')
})

// ── Contrato T-061 (SPEC-G/T-061/AC-2): reactivado en T-061. ──

// AC: SPEC-G/T-061/AC-2 — oak: pending=OakSwap si hay equipo y pila; si no, TileResolved.
test('AC-2 oak deja decisión de intercambio (T-061)', () => {
  const game = atTile({
    board: tileBoard([['oak1', 'oak', 'square']]),
    at: 'oak1',
    player: (p) => ({ ...p, oakPile: [oakPkm] }),
  })
  const result = run(game.state, { type: 'Advance' }, game.ctx)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  expect(result.value.state.pending).toEqual({ type: 'OakSwap' })
  expect(result.value.events).toContainEqual({ type: 'TileResolved', player: 'p1', info: 'oak' })
  // Sin pila no hay decisión: solo avisa y el turno sigue.
  const sinPila = atTile({ board: tileBoard([['oak2', 'oak', 'square']]), at: 'oak2' })
  const infoOnly = run(sinPila.state, { type: 'Advance' }, sinPila.ctx)
  expect(infoOnly.ok).toBe(true)
  if (!infoOnly.ok) throw new Error(infoOnly.error.message)
  expect(infoOnly.value.state.pending).toBeNull()
  expect(infoOnly.value.events).toContainEqual({ type: 'TileResolved', player: 'p1', info: 'oak' })
  expect(infoOnly.value.state.phase).toBe('organize')
})

// AC: SPEC-G/T-061/AC-2 — gym desafiable: pending=ChallengeGym (opcional, D-17).
// erika es el único líder con cartas cargadas en el contenido (tangela_erika).
test('AC-2 gym desafiable deja pending=ChallengeGym (T-061)', () => {
  const board = tileBoard([['eri1', 'gym', 'square', 'erika']], {
    erika: { city: 'azulona', medal: 'Arcoíris', verified: true },
  })
  const game = atTile({ board, at: 'eri1' })
  const result = run(game.state, { type: 'Advance' }, game.ctx)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  expect(result.value.state.pending).toEqual({ type: 'ChallengeGym', gym: 'erika' })
  expect(result.value.state.turn).toBe(game.state.turn) // espera la decisión opcional
})

// AC: SPEC-G/T-061/AC-2 — empty/start: emiten TileResolved{none}.
test('AC-2 empty emite TileResolved{none} (T-061)', () => {
  const game = atTile({ board: tileBoard([['vac', 'empty', 'round']]), at: 'vac' })
  const result = run(game.state, { type: 'Advance' }, game.ctx)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  expect(result.value.events).toContainEqual({ type: 'TileResolved', player: 'p1', info: 'none' })
  expect(result.value.state.phase).toBe('organize')
})

test('AC-2 start emite TileResolved{none} (T-061)', () => {
  const game = atTile({ board: tileBoard([['ini', 'start', 'square']]), at: 'ini' })
  const result = run(game.state, { type: 'Advance' }, game.ctx)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  expect(result.value.events).toContainEqual({ type: 'TileResolved', player: 'p1', info: 'none' })
  expect(result.value.state.phase).toBe('organize')
})

// AC: SPEC-G/T-061/AC-2 — duelo/sorpresa/liga deshabilitados por el ruleset:
// emiten TileResolved{disabledByRuleset}.
for (const node of ['duelo', 'sorpresa', 'liga'] as const) {
  test(`AC-2 ${node} deshabilitado emite TileResolved{disabledByRuleset} (T-061)`, () => {
    const game = atTile({ board: tileBoard([[`n_${node}`, node, 'round']]), at: `n_${node}` })
    const result = run(game.state, { type: 'Advance' }, game.ctx)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.value.events).toContainEqual({
      type: 'TileResolved',
      player: 'p1',
      info: 'disabledByRuleset',
    })
    expect(result.value.state.phase).toBe('organize')
  })
}
