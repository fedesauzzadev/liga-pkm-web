// AC: SPEC-B/T-011 — Movimiento: dado, bifurcaciones, cuadrados, rebote.
// Un test por AC del spec; el property test de AC-7 vive en t011-property.test.ts.
// El dado entra por un Rng "guiado" (DI, SDD §3) para tener tiradas exactas.
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { BoardGraph, NodeType, NodeShape } from '../packages/content/src/board.ts'
import type { Face } from '../packages/content/src/effects.ts'
import { parseNodeId } from '../packages/content/src/ids.ts'
import { loadContent } from '../packages/content/src/node.ts'
import {
  applyCommand,
  EngineError,
  legalCommands,
  newGame,
  type Command,
  type Content,
  type Ctx,
  type GameEvent,
  type GameState,
  type Rng,
  type Result,
  type CommandOk,
} from '../packages/engine/src/index.ts'

const content = loadContent(join(process.cwd(), 'content'))

/** Rng guiado: devuelve los valores de la cola (cicla) — tiradas exactas en tests. */
const riggedRng = (values: readonly number[]): Rng => {
  let i = 0
  return {
    d6: (): Face => {
      const v = values[i % values.length] ?? 6
      i += 1
      return v as Face
    },
    int: (maxExclusive: number): number => i % maxExclusive,
    snapshot: () => 0,
  }
}

type NodeSpec = readonly [id: string, type: NodeType, shape: NodeShape]

/** Tablero sintético mínimo para casos controlados (AC-2..AC-5, AC-8). */
const board = (nodes: readonly NodeSpec[], edges: readonly (readonly [string, string])[]): BoardGraph => ({
  meta: { id: 't011-test', status: 'VERIFIED' },
  gyms: {},
  nodes: nodes.map(([id, type, shape]) => ({ id, type, shape, x: 0, y: 0 })),
  edges: edges.map(([a, b]) => [a, b]),
})

const withBoard = (b: BoardGraph): Content => ({ ...content, board: b })

/** Partida real con el jugador ubicado a mano en un nodo del tablero dado. */
const gameAt = (
  b: BoardGraph,
  position: string,
  cameFrom: string | null = null,
  dieValues: readonly number[] = [1],
): { state: GameState; ctx: Ctx } => {
  const started = newGame({ seed: 7, starterDeck: 'montana', ruleset: content.ruleset }, content)
  if (!started.ok) throw new Error(started.error.message)
  const base = started.value.state
  const player = base.players[0]!
  const state: GameState = {
    ...base,
    players: [
      { ...player, position: parseNodeId(position), cameFrom: cameFrom === null ? null : parseNodeId(cameFrom) },
    ],
  }
  return { state, ctx: { content: withBoard(b), rng: riggedRng(dieValues) } }
}

const run = (state: GameState, command: Command, ctx: Ctx): Result<CommandOk, EngineError> =>
  applyCommand(state, command, ctx)

const stepsOf = (events: readonly GameEvent[]): readonly { from: string; to: string }[] =>
  events
    .filter((e): e is Extract<GameEvent, { type: 'MoveStep' }> => e.type === 'MoveStep')
    .map((e) => ({ from: e.from, to: e.to }))

// ── Tableros sintéticos compartidos entre tests ──
/** n0 bifurca en a y b. */
const bifurca = board(
  [
    ['n0', 'empty', 'round'],
    ['a', 'empty', 'round'],
    ['b', 'empty', 'round'],
  ],
  [
    ['n0', 'a'],
    ['n0', 'b'],
  ],
)
/** Línea simple n0 → n1 → n2 → n3. */
const linea = board(
  [
    ['n0', 'empty', 'round'],
    ['n1', 'empty', 'round'],
    ['n2', 'empty', 'round'],
    ['n3', 'empty', 'round'],
  ],
  [
    ['n0', 'n1'],
    ['n1', 'n2'],
    ['n2', 'n3'],
  ],
)
/** m0 → m1 → f; f bifurca en x/y (se llega con cameFrom = m1). */
const camino = board(
  [
    ['m0', 'empty', 'round'],
    ['m1', 'empty', 'round'],
    ['f', 'empty', 'round'],
    ['x', 'empty', 'round'],
    ['y', 'empty', 'round'],
  ],
  [
    ['m0', 'm1'],
    ['m1', 'f'],
    ['f', 'x'],
    ['f', 'y'],
  ],
)
/** s0 → sq (centro, cuadrado) → s1 → s2. */
const cuadrado = board(
  [
    ['s0', 'empty', 'round'],
    ['sq', 'centro', 'square'],
    ['s1', 'empty', 'round'],
    ['s2', 'empty', 'round'],
  ],
  [
    ['s0', 'sq'],
    ['sq', 's1'],
    ['s1', 's2'],
  ],
)
/** r0 → r1 (mercado, redondo) → r2 → r3. */
const redondos = board(
  [
    ['r0', 'empty', 'round'],
    ['r1', 'mercado', 'round'],
    ['r2', 'empty', 'round'],
    ['r3', 'empty', 'round'],
  ],
  [
    ['r0', 'r1'],
    ['r1', 'r2'],
    ['r2', 'r3'],
  ],
)

// AC: SPEC-B/T-011/AC-1 — RollMove emite DieRolled{move} y fija stepsLeft.
test('AC-1 RollMove emite DieRolled{purpose:"move"} y fija stepsLeft', () => {
  const { state, ctx } = gameAt(bifurca, 'n0', null, [4])

  const result = run(state, { type: 'RollMove' }, ctx)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  const { state: next, events } = result.value

  const dice = events.filter((e): e is Extract<GameEvent, { type: 'DieRolled' }> => e.type === 'DieRolled')
  expect(dice).toEqual([{ type: 'DieRolled', purpose: 'move', value: 4 }])
  expect(next.dieLog).toEqual(dice)
  expect(next.stepsLeft).toBe(4) // fija stepsLeft (queda en espera de ChoosePath)
  expect(next.phase).toBe('moving')
})

// AC: SPEC-B/T-011/AC-2 — bifurcación deja ChoosePath; salida única avanza solo.
test('AC-2 nodo con >1 salida deja pending=ChoosePath; con 1 salida avanza solo', () => {
  const { state, ctx } = gameAt(bifurca, 'n0', null, [6])

  const result = run(state, { type: 'RollMove' }, ctx)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  expect(result.value.state.pending).toEqual({ type: 'ChoosePath', options: ['a', 'b'] })
  expect(legalCommands(result.value.state, ctx)).toEqual([
    { type: 'ChoosePath', to: 'a' },
    { type: 'ChoosePath', to: 'b' },
  ])

  // Salida única: línea — avanza solo hasta agotar pasos y aterriza.
  const line = gameAt(linea, 'n0', null, [2])
  const auto = run(line.state, { type: 'RollMove' }, line.ctx)
  expect(auto.ok).toBe(true)
  if (!auto.ok) throw new Error(auto.error.message)
  expect(auto.value.state.pending).toBeNull()
  expect(auto.value.state.phase).toBe('tileResolution')
  expect(stepsOf(auto.value.events)).toEqual([
    { from: 'n0', to: 'n1' },
    { from: 'n1', to: 'n2' },
  ])
  expect(auto.value.events).toContainEqual({ type: 'Landed', player: 'p1', node: 'n2' })
})

// AC: SPEC-B/T-011/AC-3 — nunca se ofrece volver a cameFrom; al frenar cameFrom=null.
test('AC-3 nunca se ofrece cameFrom durante el movimiento; al frenar en cuadrado cameFrom=null', () => {
  // m0 → m1 → f (bifurca a x/y): las opciones en f excluyen m1.
  const { state, ctx } = gameAt(camino, 'm0', null, [3])

  const first = run(state, { type: 'RollMove' }, ctx)
  expect(first.ok).toBe(true)
  if (!first.ok) throw new Error(first.error.message)
  const atFork = first.value.state
  expect(atFork.pending).toEqual({ type: 'ChoosePath', options: ['x', 'y'] }) // m1 NO se ofrece
  expect(atFork.players[0]!.cameFrom).toBe('m1')

  const second = run(atFork, { type: 'ChoosePath', to: 'x' }, ctx)
  expect(second.ok).toBe(true)
  if (!second.ok) throw new Error(second.error.message)
  expect(second.value.state.phase).toBe('tileResolution')

  // Frenar en un cuadrado (pasa por sq con pasos restantes).
  const pass = gameAt(cuadrado, 's0', null, [3])
  const rolled = run(pass.state, { type: 'RollMove' }, pass.ctx)
  expect(rolled.ok).toBe(true)
  if (!rolled.ok) throw new Error(rolled.error.message)
  expect(rolled.value.state.pending).toEqual({ type: 'StopOrContinue' })

  const stopped = run(rolled.value.state, { type: 'StopHere' }, pass.ctx)
  expect(stopped.ok).toBe(true)
  if (!stopped.ok) throw new Error(stopped.error.message)
  expect(stopped.value.state.players[0]!.cameFrom).toBeNull() // frenó ⇒ cameFrom=null
  expect(stopped.value.state.players[0]!.position).toBe('sq')
})

// AC: SPEC-B/T-011/AC-4 — pasar por cuadrado con pasos ⇒ StopOrContinue; frenar descarta.
test('AC-4 pasar por nodo cuadrado con pasos restantes deja StopOrContinue; frenar descarta pasos y aterriza', () => {
  const { state, ctx } = gameAt(cuadrado, 's0', null, [3])

  const rolled = run(state, { type: 'RollMove' }, ctx)
  expect(rolled.ok).toBe(true)
  if (!rolled.ok) throw new Error(rolled.error.message)
  expect(rolled.value.state.pending).toEqual({ type: 'StopOrContinue' })
  expect(rolled.value.state.stepsLeft).toBe(2)
  expect(legalCommands(rolled.value.state, ctx)).toEqual([{ type: 'StopHere' }, { type: 'ContinueMoving' }])

  // Frenar: descarta los 2 pasos restantes y aterriza (Landed marca el casillero).
  const stopped = run(rolled.value.state, { type: 'StopHere' }, ctx)
  expect(stopped.ok).toBe(true)
  if (!stopped.ok) throw new Error(stopped.error.message)
  expect(stopped.value.state.stepsLeft).toBe(0)
  expect(stopped.value.state.phase).toBe('tileResolution')
  expect(stopped.value.events).toContainEqual({ type: 'Landed', player: 'p1', node: 'sq' })

  // Seguir: consume los pasos restantes desde el cuadrado (el paso s0→sq ya
  // lo emitió el RollMove; este comando solo agrega los pasos que faltan).
  const continued = run(rolled.value.state, { type: 'ContinueMoving' }, ctx)
  expect(continued.ok).toBe(true)
  if (!continued.ok) throw new Error(continued.error.message)
  expect(stepsOf(continued.value.events)).toEqual([
    { from: 'sq', to: 's1' },
    { from: 's1', to: 's2' },
  ])
  expect(continued.value.state.players[0]!.position).toBe('s2')
  expect(continued.value.state.phase).toBe('tileResolution')
})

// AC: SPEC-B/T-011/AC-5 — redondo solo se resuelve cayendo exacto; al pasar no pasa nada.
test('AC-5 un nodo redondo solo se resuelve con caída exacta; al pasar no genera decisión ni Landed', () => {
  // Pasa por r1 con 1 paso restante: nada.
  const passing = gameAt(redondos, 'r0', null, [2])
  const pass = run(passing.state, { type: 'RollMove' }, passing.ctx)
  expect(pass.ok).toBe(true)
  if (!pass.ok) throw new Error(pass.error.message)
  expect(pass.value.state.pending).toBeNull() // sin StopOrContinue ni ChoosePath
  expect(pass.value.events).not.toContainEqual({ type: 'Landed', player: 'p1', node: 'r1' })
  expect(pass.value.events).toContainEqual({ type: 'Landed', player: 'p1', node: 'r2' })

  // Cae exacto en r1 ⇒ Landed en r1 (punto de resolución para T-012).
  const exact = gameAt(redondos, 'r0', null, [1])
  const land = run(exact.state, { type: 'RollMove' }, exact.ctx)
  expect(land.ok).toBe(true)
  if (!land.ok) throw new Error(land.error.message)
  expect(land.value.events).toContainEqual({ type: 'Landed', player: 'p1', node: 'r1' })
  expect(land.value.state.players[0]!.position).toBe('r1')
  expect(land.value.state.players[0]!.cameFrom).toBe('r0') // exacto en redondo NO libera dirección
})

// AC: SPEC-B/T-011/AC-6 — rebote en fin de camino (D-01): 2 pasos de sorpresa, tirada 5.
test('AC-6 rebote: a 2 pasos de un fin de camino con tirada 5 avanza 2 y retrocede 3', () => {
  // Tablero real: pb_sn2 — pb_sn3 — pb_sn4 — sorpresa (sorpresa es callejón redondo).
  const started = newGame({ seed: 11, starterDeck: 'montana', ruleset: content.ruleset }, content)
  expect(started.ok).toBe(true)
  if (!started.ok) throw new Error(started.error.message)
  const player = started.value.state.players[0]!
  const state: GameState = {
    ...started.value.state,
    players: [
      { ...player, position: parseNodeId('pb_sn3'), cameFrom: parseNodeId('pb_sn2') },
    ],
  }
  const ctx: Ctx = { content, rng: riggedRng([5]) }

  const result = run(state, { type: 'RollMove' }, ctx)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)

  // pb_sn3 → pb_sn4 → sorpresa (2 adelante) y vuelve pb_sn4 → pb_sn3 → pb_sn2 (3 atrás).
  expect(stepsOf(result.value.events)).toEqual([
    { from: 'pb_sn3', to: 'pb_sn4' },
    { from: 'pb_sn4', to: 'sorpresa' },
    { from: 'sorpresa', to: 'pb_sn4' },
    { from: 'pb_sn4', to: 'pb_sn3' },
    { from: 'pb_sn3', to: 'pb_sn2' },
  ])
  expect(result.value.state.players[0]!.position).toBe('pb_sn2')
  expect(result.value.state.phase).toBe('tileResolution')
  expect(result.value.state.stepsLeft).toBe(0)
})

// AC: SPEC-B/T-011/AC-8 — un junction nunca es destino final ni se puede frenar en él.
test('AC-8 un nodo junction nunca es destino final ni se puede frenar en él', () => {
  // Caída exacta sobre el junction ⇒ paso extra forzado hasta n2.
  const conJunction = board(
    [
      ['n0', 'empty', 'round'],
      ['j1', 'junction', 'none'],
      ['n2', 'empty', 'round'],
    ],
    [
      ['n0', 'j1'],
      ['j1', 'n2'],
    ],
  )
  const exact = gameAt(conJunction, 'n0', null, [1])
  const result = run(exact.state, { type: 'RollMove' }, exact.ctx)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  expect(result.value.state.players[0]!.position).toBe('n2') // no frenó en j1
  expect(result.value.events).not.toContainEqual({ type: 'Landed', player: 'p1', node: 'j1' })
  expect(stepsOf(result.value.events)).toEqual([
    { from: 'n0', to: 'j1' },
    { from: 'j1', to: 'n2' }, // paso forzado sin consumir dado
  ])

  // Junction callejón sin pasos: vuelve forzado; nunca aterriza en el junction.
  const junctionCallejon = board(
    [
      ['n0', 'empty', 'round'],
      ['j2', 'junction', 'none'],
    ],
    [['n0', 'j2']],
  )
  const deadEnd = gameAt(junctionCallejon, 'n0', null, [1])
  const bounced = run(deadEnd.state, { type: 'RollMove' }, deadEnd.ctx)
  expect(bounced.ok).toBe(true)
  if (!bounced.ok) throw new Error(bounced.error.message)
  expect(bounced.value.state.players[0]!.position).toBe('n0')
  expect(bounced.value.events).toContainEqual({ type: 'Landed', player: 'p1', node: 'n0' })
  expect(bounced.value.events).not.toContainEqual({ type: 'Landed', player: 'p1', node: 'j2' })
})

// Extra (sin AC): guardas de ilegalidad sobre los comandos nuevos.
test('comandos de movimiento ilegales devuelven EngineError tipado', () => {
  const aislado = board([['n0', 'empty', 'round']], [])
  const { state, ctx } = gameAt(aislado, 'n0')

  const prePartida = applyCommand({ ...state, phase: 'idle' }, { type: 'RollMove' }, ctx)
  expect(prePartida.ok).toBe(false)
  if (!prePartida.ok) expect(prePartida.error.code).toBe('ILLEGAL_COMMAND')

  const g = gameAt(bifurca, 'n0', null, [6])
  const rolled = run(g.state, { type: 'RollMove' }, g.ctx)
  expect(rolled.ok).toBe(true)
  if (!rolled.ok) throw new Error(rolled.error.message)

  const fueraDeOpciones = run(rolled.value.state, { type: 'ChoosePath', to: 'zzz' }, g.ctx)
  expect(fueraDeOpciones.ok).toBe(false)
  if (!fueraDeOpciones.ok) expect(fueraDeOpciones.error.code).toBe('ILLEGAL_COMMAND')

  const otroComando = run(rolled.value.state, { type: 'RollMove' }, g.ctx)
  expect(otroComando.ok).toBe(false)
  if (!otroComando.ok) expect(otroComando.error.code).toBe('PENDING_DECISION')
})
