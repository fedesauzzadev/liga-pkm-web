// AC: SPEC-I/T-074/AC-1 — ReorderTeam: reordenar el equipo arrastrando es legal
// solo en `organize` y sin decisión pendiente; mueve el PKM y emite TeamReordered.
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { parsePkmUid } from '../packages/content/src/ids.ts'
import { loadContent } from '../packages/content/src/node.ts'
import {
  applyCommand,
  legalCommands,
  newGame,
  type Command,
  type Ctx,
  type GameState,
  type PkmInstance,
} from '../packages/engine/src/index.ts'

const content = loadContent(join(process.cwd(), 'content'))
const rng = { d6: () => 6, int: () => 0, snapshot: () => 0 }
const ctx: Ctx = { content, rng }

const started = newGame({ seed: 7, starterDeck: 'montana', ruleset: content.ruleset }, content)
if (!started.ok) throw new Error(started.error.message)

const extra = (uid: string, cardId: string): PkmInstance => ({
  uid: parsePkmUid(uid),
  cardId: cardId as PkmInstance['cardId'],
  damage: 0,
  xp: 0,
  equipped: [],
  multicolor: [],
  fainted: false,
})

/** Partida en organize con 3 PKM en el equipo (para probar posiciones). */
const withTeam = (): GameState => {
  const player = started.value.state.players[0]!
  return {
    ...started.value.state,
    players: [{ ...player, team: [...player.team, extra('p1-squirtle', 'squirtle'), extra('p1-poliwag', 'poliwag')] }],
  }
}

const run = (state: GameState, command: Command) => applyCommand(state, command, ctx)

const uids = (state: GameState): readonly string[] =>
  state.players[0]!.team.map((pkm) => pkm.uid)

test('AC: SPEC-I/T-074/AC-1 - ReorderTeam en organize mueve el PKM y emite TeamReordered', () => {
  const state = withTeam()
  const result = run(state, { type: 'ReorderTeam', uid: 'p1-poliwag', to: 0 })
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(uids(result.value.state)).toEqual(['p1-poliwag', 'p1-starter', 'p1-squirtle'])
  expect(result.value.events).toEqual([
    { type: 'TeamReordered', player: 'p1', uid: 'p1-poliwag', to: 0 },
  ])
  // Mover al mismo lugar: legal, sin efecto.
  const same = run(result.value.state, { type: 'ReorderTeam', uid: 'p1-poliwag', to: 0 })
  expect(same.ok && uids(same.value.state)[0]).toBe('p1-poliwag')
})

test('AC: SPEC-I/T-074/AC-1 - fuera de organize o con pending es ilegal', () => {
  const state = withTeam()
  const rolled = run(state, { type: 'RollMove' })
  expect(rolled.ok).toBe(true)
  if (!rolled.ok) return
  const whileMoving = run(rolled.value.state, { type: 'ReorderTeam', uid: 'p1-starter', to: 1 })
  expect(whileMoving.ok).toBe(false)

  const pendingState: GameState = {
    ...state,
    phase: 'tileResolution',
    pending: { type: 'OakSwap' },
  }
  const whilePending = run(pendingState, { type: 'ReorderTeam', uid: 'p1-starter', to: 1 })
  expect(whilePending.ok).toBe(false)
})

test('AC: SPEC-I/T-074/AC-1 - uid ajeno o posición inválida son ilegales', () => {
  const state = withTeam()
  expect(run(state, { type: 'ReorderTeam', uid: 'p1-nadie', to: 0 }).ok).toBe(false)
  expect(run(state, { type: 'ReorderTeam', uid: 'p1-starter', to: 3 }).ok).toBe(false)
  expect(run(state, { type: 'ReorderTeam', uid: 'p1-starter', to: -1 }).ok).toBe(false)
})

test('AC: SPEC-I/T-074/AC-1 - legalCommands ofrece ReorderTeam en organize para cada destino', () => {
  const state = withTeam()
  const commands = legalCommands(state, ctx)
  expect(commands).toContainEqual({ type: 'ReorderTeam', uid: 'p1-poliwag', to: 0 })
  expect(commands).not.toContainEqual({ type: 'ReorderTeam', uid: 'p1-starter', to: 0 })
  const rolled = run(state, { type: 'RollMove' })
  if (!rolled.ok) throw new Error(rolled.error.message)
  expect(legalCommands(rolled.value.state, ctx).some((c) => c.type === 'ReorderTeam')).toBe(false)
})
