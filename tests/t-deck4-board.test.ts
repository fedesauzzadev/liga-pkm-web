// AC: deck4 (.opencode/plan/deck4.md) — 4 nodos por mazo, preservación del
// grafo vs .bak, separación ≥ 65 px, robo en nodo nuevo y caminata de 200
// movimientos con semilla fija. Tablero real content/board/kanto.json.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { fileURLToPath } from 'node:url'
import {
  BoardGraphSchema,
  boardFacts,
  EXPECTED_CLASSIC_COUNTS,
} from '../packages/content/src/index.ts'
import { parseCardId, parseNodeId } from '../packages/content/src/ids.ts'
import type { DeckKey } from '../packages/content/src/index.ts'
import { loadContent } from '../packages/content/src/node.ts'
import {
  applyCommand,
  createRng,
  newGame,
  type Command,
  type Ctx,
  type GameState,
  type Rng,
} from '../packages/engine/src/index.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const readBoard = (file: string) =>
  BoardGraphSchema.parse(JSON.parse(readFileSync(join(repoRoot, 'content', 'board', file), 'utf8')) as unknown)
const board = readBoard('kanto.json')
const bak = readBoard('kanto.json.bak')

const neighborsOf = (b: typeof board): Map<string, Set<string>> => {
  const map = new Map<string, Set<string>>(b.nodes.map((n) => [n.id, new Set<string>()]))
  for (const [a, bId] of b.edges) {
    map.get(a)?.add(bId)
    map.get(bId)?.add(a)
  }
  return map
}
const edgesOf = (b: typeof board): Set<string> =>
  new Set(b.edges.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)))
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y)

// AC: deck4 — cada mazo de terreno tiene exactamente 4 nodos en UNA tirada
// consecutiva (componente conexa de aristas internas).
test('deck4: cada mazo tiene exactamente 4 nodos consecutivos (una sola tirada)', () => {
  const byDeck = new Map<string, string[]>()
  for (const n of board.nodes) {
    if (n.type === 'deck' && n.deck !== undefined) byDeck.set(n.deck, [...(byDeck.get(n.deck) ?? []), n.id])
  }
  expect(byDeck.size).toBe(5)
  const neighbors = neighborsOf(board)
  for (const [deck, ids] of byDeck) {
    expect(ids.length, `mazo ${deck}`).toBe(4)
    // Una sola tirada: la componente conexa via aristas internas son los 4 nodos.
    const idSet = new Set(ids)
    const seen = new Set([ids[0]!])
    const queue = [ids[0]!]
    while (queue.length > 0) {
      const id = queue.pop()!
      for (const next of neighbors.get(id) ?? []) {
        if (idSet.has(next) && !seen.has(next)) {
          seen.add(next)
          queue.push(next)
        }
      }
    }
    expect([...seen].sort(), `tirada única de ${deck}`).toEqual([...idSet].sort())
  }
  expect(boardFacts(board).countsByType.deck).toBe(EXPECTED_CLASSIC_COUNTS.deck)
})

// AC: deck4 — exactamente +5 nodos y +5 aristas respecto de la copia .bak,
// grafo conexo, meta registrada (+deck4, fecha y factor).
test('deck4: +5 nodos y +5 aristas vs .bak; conexo; meta.status con +deck4', () => {
  expect(board.nodes.length).toBe(bak.nodes.length + 5)
  expect(board.edges.length).toBe(bak.edges.length + 5)
  const facts = boardFacts(board)
  expect(facts.connected, `inalcanzables: ${facts.unreachable.join(', ')}`).toBe(true)
  expect(board.meta.status.endsWith('+deck4')).toBe(true)
  expect(board.meta.deck4).toBeDefined()
  expect(board.meta.deck4?.scale).toBeGreaterThanOrEqual(1)
  expect(board.meta.deck4?.scale).toBeLessThanOrEqual(1.15)
})

// AC: deck4 — todo nodo existente conserva id/type/deck, x e y (no hubo escala),
// su grado no cambia y sus vecinos solo se re-enrutan por el nodo nuevo.
test('deck4: nodos existentes intactos (id/type/deck/x/y/grado/vecinos)', () => {
  const factor = board.meta.deck4?.scale ?? 1
  const bakNodes = new Map(bak.nodes.map((n) => [n.id, n]))
  const newIds = new Set(board.nodes.map((n) => n.id).filter((id) => !bakNodes.has(id)))
  expect(newIds.size).toBe(5)

  // Aristas partidas: las 5 de .bak que desaparecen; cada una reemplazada por
  // [a,nuevo] y [nuevo,b].
  const oldEdges = edgesOf(bak)
  const newEdges = edgesOf(board)
  const removed = [...oldEdges].filter((e) => !newEdges.has(e))
  const added = [...newEdges].filter((e) => !oldEdges.has(e))
  expect(removed.length).toBe(5)
  expect(added.length).toBe(10)

  const neighborsOld = neighborsOf(bak)
  const neighborsNew = neighborsOf(board)
  for (const old of bak.nodes) {
    const current = board.nodes.find((n) => n.id === old.id)
    expect(current, `nodo ${old.id} sigue existiendo`).toBeDefined()
    expect(current!.type).toBe(old.type)
    expect(current!.deck).toBe(old.deck)
    if (factor === 1) {
      expect(current!.x).toBe(old.x)
      expect(current!.y).toBe(old.y)
    }
    expect(neighborsNew.get(old.id)!.size, `grado de ${old.id}`).toBe(neighborsOld.get(old.id)!.size)
    // Vecinos: igual salvo el extremo de la arista partida, que pasa por el nuevo.
    const split = removed.map((key) => key.split('|')).find(([a, b]) => a === old.id || b === old.id)
    const expected = new Set(neighborsOld.get(old.id)!)
    if (split !== undefined) {
      const other = split[0] === old.id ? split[1]! : split[0]!
      const nuevo = [...newIds].find(
        (id) => neighborsNew.get(id)!.has(split[0]!) && neighborsNew.get(id)!.has(split[1]!),
      )!
      expected.delete(other)
      expected.add(nuevo)
    }
    expect([...neighborsNew.get(old.id)!].sort(), `vecinos de ${old.id}`).toEqual([...expected].sort())
  }
  // Bifurcaciones y extremos siguen igual (grado != 2 no cambia).
  expect(boardFacts(board).nonDegree2).toEqual(boardFacts(bak).nonDegree2)
})

// AC: deck4 — cada nodo nuevo es deck/round del mazo correcto, está a ≥ 65 px
// (o ≥ 65 × factor) de sus vecinos y sobre el segmento original.
test('deck4: nodos nuevos a >=65 px de sus vecinos y sobre el segmento', () => {
  const factor = board.meta.deck4?.scale ?? 1
  const minSep = 65 * factor
  const bakIds = new Set(bak.nodes.map((n) => n.id))
  const nodeById = new Map(board.nodes.map((n) => [n.id, n]))
  const neighbors = neighborsOf(board)
  for (const n of board.nodes.filter((nd) => !bakIds.has(nd.id))) {
    expect(n.type).toBe('deck')
    expect(n.shape).toBe('round')
    const vecinos = [...neighbors.get(n.id)!]
    expect(vecinos.length).toBe(2)
    for (const v of vecinos) {
      expect(dist(n, nodeById.get(v)!), `${n.id}—${v}`).toBeGreaterThanOrEqual(minSep - 1e-9)
    }
    if (factor === 1) {
      // Sobre el segmento original: a+b por el nuevo ≈ distancia original.
      const pts = vecinos.map((v) => nodeById.get(v)!)
      const a = pts[0]!
      const b = pts[1]!
      expect(dist(a, n) + dist(n, b) - dist(a, b), `${n.id} colineal`).toBeLessThanOrEqual(2)
    }
  }
})

// AC: deck4 — robar en un nodo nuevo funciona igual que en los otros del mismo
// mazo (motor, dado forzado): elemento → CardDrawn + inventario; PKM → FightOrRelease.
const content = loadContent(join(process.cwd(), 'content'))
const forcedRng: Rng = { d6: () => 6, int: () => 0, snapshot: () => 0 }

const atNewNode = (at: string, deck: string, stack: readonly string[]): { state: GameState; ctx: Ctx } => {
  const started = newGame({ seed: 7, starterDeck: 'montana', ruleset: content.ruleset }, content)
  if (!started.ok) throw new Error(started.error.message)
  const base = started.value.state
  const decks = { ...base.decks }
  decks[deck as DeckKey] = stack.map((id) => parseCardId(id))
  const state: GameState = {
    ...base,
    phase: 'tileResolution',
    stepsLeft: 0,
    decks,
    players: [{ ...base.players[0]!, position: parseNodeId(at), cameFrom: null }],
  }
  return { state, ctx: { content, rng: forcedRng } }
}

const NEW_DECK_NODES: readonly [id: string, deck: string][] = [
  ['mont_4', 'montana'],
  ['isla_4', 'isla'],
  ['bosque_4', 'bosque'],
  ['pant_4', 'pantano'],
  ['llan_4', 'llanura'],
]

test('deck4: robar en un nodo nuevo da CardDrawn del mazo correcto', () => {
  for (const [id, deck] of NEW_DECK_NODES) {
    const game = atNewNode(id, deck, ['element_fire'])
    const drawn = applyCommand(game.state, { type: 'Advance' }, game.ctx)
    expect(drawn.ok, `${id}: ${drawn.ok ? '' : drawn.error.message}`).toBe(true)
    if (!drawn.ok) throw new Error(drawn.error.message)
    expect(drawn.value.events).toContainEqual({ type: 'CardDrawn', player: 'p1', deck, card: 'element_fire' })
    expect(drawn.value.state.pending).toBeNull()
    expect(drawn.value.state.phase).toBe('organize')
  }

  // PKM en un nodo nuevo: mismo pending FightOrRelease que en cualquier nodo del mazo.
  const pkmGame = atNewNode('pant_4', 'pantano', ['abra'])
  const pkm = applyCommand(pkmGame.state, { type: 'Advance' }, pkmGame.ctx)
  expect(pkm.ok).toBe(true)
  if (!pkm.ok) throw new Error(pkm.error.message)
  expect(pkm.value.state.pending).toEqual({ type: 'FightOrRelease', card: 'abra', deck: 'pantano' })
})

// AC: deck4 — caminata de 200 movimientos con semilla fija nunca se traba ni
// pisa un nodo inexistente (propiedad compacta; la completa vive en t011-property).
test('deck4: 200 movimientos con semilla fija terminan siempre en nodos existentes', () => {
  const nodeIds = new Set(content.board.nodes.map((n) => n.id))
  const seed = 20261024
  const started = newGame({ seed, starterDeck: 'montana', ruleset: content.ruleset }, content)
  if (!started.ok) throw new Error(started.error.message)
  const ctx: Ctx = { content, rng: createRng(started.value.state.rngState) }
  const choices = createRng((seed ^ 0x5eed_5eed) >>> 0)
  let state = started.value.state

  for (let move = 0; move < 200; move++) {
    const rolled = applyCommand(state, { type: 'RollMove' }, ctx)
    if (!rolled.ok) throw new Error(`movimiento ${move}: ${rolled.error.message}`)
    state = rolled.value.state
    let guard = 0
    while (state.pending !== null) {
      if (guard++ > 64) throw new Error('movimiento sin fin')
      const command: Command | null =
        state.pending.type === 'ChoosePath'
          ? { type: 'ChoosePath', to: state.pending.options[choices.int(state.pending.options.length)]! }
          : state.pending.type === 'StopOrContinue'
            ? choices.d6() <= 3
              ? { type: 'StopHere' }
              : { type: 'ContinueMoving' }
            : null
      if (command === null) throw new Error(`decisión inesperada: ${state.pending.type}`)
      const answered = applyCommand(state, command, ctx)
      if (!answered.ok) throw new Error(answered.error.message)
      state = answered.value.state
    }
    expect(nodeIds.has(state.players[0]!.position)).toBe(true)
    const advanced = applyCommand(state, { type: 'Advance' }, ctx)
    if (!advanced.ok) throw new Error(advanced.error.message)
    state = advanced.value.state
    if (state.pending?.type === 'FightOrRelease') {
      const released = applyCommand(state, { type: 'ReleaseWild' }, ctx)
      if (!released.ok) throw new Error(released.error.message)
      state = released.value.state
    }
    if (state.pending?.type === 'OakSwap' || state.pending?.type === 'ChallengeGym') {
      const skipped = applyCommand(state, { type: 'Advance' }, ctx)
      if (!skipped.ok) throw new Error(skipped.error.message)
      state = skipped.value.state
    }
  }
})
