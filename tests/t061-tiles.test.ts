// AC: SPEC-G/T-061 — Casilleros de punta a punta: eventos nuevos (EnergyGained),
// decisión salteable y partida nunca trabada (AC-7). AC-2 vive en t060 (un test
// por tipo de casillero); la UI (AC-3/AC-4) en apps/web; el e2e (AC-5) en e2e/.
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { BoardGraph, BoardNode, NodeType, NodeShape } from '../packages/content/src/board.ts'
import { parseCardId, parseNodeId, parsePkmUid } from '../packages/content/src/ids.ts'
import type { DeckKey } from '../packages/content/src/index.ts'
import { loadContent } from '../packages/content/src/node.ts'
import {
  applyCommand,
  EngineError,
  legalCommands,
  newGame,
  resolvesPending,
  type Command,
  type CommandOk,
  type Ctx,
  type GameState,
  type PlayerState,
  type Result,
} from '../packages/engine/src/index.ts'

const content = loadContent(join(process.cwd(), 'content'))

type TileSpec = readonly [id: string, type: NodeType, shape: NodeShape, deckOrGym?: string]

const tileBoard = (tiles: readonly TileSpec[], gyms: BoardGraph['gyms'] = {}): BoardGraph => ({
  meta: { id: 't061-test', status: 'VERIFIED' },
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

// AC: SPEC-G/T-061/AC-1 — la energía robada avisa que entró al inventario.
test('AC-1 deck: elemento ⇒ CardDrawn + EnergyGained y queda en el inventario', () => {
  const game = atTile({
    board: tileBoard([['m1', 'deck', 'round', 'montana']]),
    at: 'm1',
    decks: { montana: ['element_fire'] },
  })
  const result = run(game.state, { type: 'Advance' }, game.ctx)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  expect(result.value.events).toEqual([
    { type: 'CardDrawn', player: 'p1', deck: 'montana', card: 'element_fire' },
    { type: 'EnergyGained', player: 'p1', element: 'fire' },
    { type: 'TurnAdvanced', turn: result.value.state.turn },
  ])
  expect(result.value.state.players[0]!.elements).toHaveLength(1)
})

// AC: SPEC-G/T-061/AC-6 — robo con mazo vacío: mensaje de D-10, sin errores.
test('AC-6 mazo de elemento e Ítem vacíos emiten DeckEmpty y el turno sigue', () => {
  const deckGame = atTile({
    board: tileBoard([['m1', 'deck', 'round', 'bosque']]),
    at: 'm1',
    decks: { bosque: [] },
  })
  const deckEmpty = run(deckGame.state, { type: 'Advance' }, deckGame.ctx)
  expect(deckEmpty.ok).toBe(true)
  if (!deckEmpty.ok) throw new Error(deckEmpty.error.message)
  expect(deckEmpty.value.events).toContainEqual({ type: 'DeckEmpty', player: 'p1', deck: 'bosque' })
  expect(deckEmpty.value.state.phase).toBe('organize')

  const mercadoGame = atTile({
    board: tileBoard([['mer', 'mercado', 'round']]),
    at: 'mer',
    decks: { item: [] },
  })
  const itemEmpty = run(mercadoGame.state, { type: 'Advance' }, mercadoGame.ctx)
  expect(itemEmpty.ok).toBe(true)
  if (!itemEmpty.ok) throw new Error(itemEmpty.error.message)
  expect(itemEmpty.value.events).toContainEqual({ type: 'DeckEmpty', player: 'p1', deck: 'item' })
  expect(itemEmpty.value.state.phase).toBe('organize')
})

// AC: SPEC-G/T-061/AC-7 — ningún casillero deja la partida trabada: con pending
// siempre hay un comando legal que lo resuelve; sin pending, Advance es legal.
test('AC-7 toda decisión de casillero tiene comando legal y el turno siempre puede cerrar', () => {
  const cases: readonly { name: string; game: { state: GameState; ctx: Ctx } }[] = [
    {
      name: 'FightOrRelease sin PKM sanos',
      game: atTile({
        board: tileBoard([['m1', 'deck', 'round', 'montana']]),
        at: 'm1',
        decks: { montana: ['charmander'] },
        player: (p) => ({ ...p, team: p.team.map((pkm) => ({ ...pkm, fainted: true })) }),
      }),
    },
    {
      name: 'OakSwap con equipo y pila',
      game: atTile({
        board: tileBoard([['oak1', 'oak', 'square']]),
        at: 'oak1',
        player: (p) => ({ ...p, oakPile: [oakPkm] }),
      }),
    },
    {
      name: 'ChallengeGym en gimnasio desafiable',
      game: atTile({
        board: tileBoard([['eri1', 'gym', 'square', 'erika']], {
          erika: { city: 'azulona', medal: 'Arcoíris', verified: true },
        }),
        at: 'eri1',
      }),
    },
    {
      name: 'gym cerrojo (GymLocked)',
      game: atTile({
        board: tileBoard([['giov', 'gym', 'square', 'giovanni']], {
          giovanni: { city: 'verde', medal: 'Tierra', verified: true, requiresMedals: 7 },
        }),
        at: 'giov',
      }),
    },
  ]
  for (const { name, game } of cases) {
    const resolved = run(game.state, { type: 'Advance' }, game.ctx)
    expect(resolved.ok, name).toBe(true)
    if (!resolved.ok) throw new Error(resolved.error.message)
    const state = resolved.value.state
    const legal = legalCommands(state, game.ctx)
    expect(legal.length, name).toBeGreaterThan(0)
    if (state.pending !== null) {
      expect(legal.some((command) => resolvesPending(command, state.pending!)), name).toBe(true)
    } else {
      expect(legal, name).toContainEqual({ type: 'RollMove' })
    }
  }
})

// AC: SPEC-G/T-061/AC-7 — Advance saltea las decisiones opcionales y cierra el turno.
test('AC-7 Advance saltea OakSwap y ChallengeGym cerrando el turno', () => {
  const oakGame = atTile({
    board: tileBoard([['oak1', 'oak', 'square']]),
    at: 'oak1',
    player: (p) => ({ ...p, oakPile: [oakPkm] }),
  })
  const oakPending = run(oakGame.state, { type: 'Advance' }, oakGame.ctx)
  if (!oakPending.ok) throw new Error(oakPending.error.message)
  expect(oakPending.value.state.pending).toEqual({ type: 'OakSwap' })
  const oakSkipped = run(oakPending.value.state, { type: 'Advance' }, oakGame.ctx)
  expect(oakSkipped.ok).toBe(true)
  if (!oakSkipped.ok) throw new Error(oakSkipped.error.message)
  expect(oakSkipped.value.state.pending).toBeNull()
  expect(oakSkipped.value.state.phase).toBe('organize')

  const gymGame = atTile({
    board: tileBoard([['eri1', 'gym', 'square', 'erika']], {
      erika: { city: 'azulona', medal: 'Arcoíris', verified: true },
    }),
    at: 'eri1',
  })
  const gymPending = run(gymGame.state, { type: 'Advance' }, gymGame.ctx)
  if (!gymPending.ok) throw new Error(gymPending.error.message)
  expect(gymPending.value.state.pending).toEqual({ type: 'ChallengeGym', gym: 'erika' })
  const gymSkipped = run(gymPending.value.state, { type: 'Advance' }, gymGame.ctx)
  expect(gymSkipped.ok).toBe(true)
  if (!gymSkipped.ok) throw new Error(gymSkipped.error.message)
  expect(gymSkipped.value.state.pending).toBeNull()
  expect(gymSkipped.value.state.phase).toBe('organize')
})
