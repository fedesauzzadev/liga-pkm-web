// bench — compara benchmarks contra perf-budget.json (SPEC-A/T-006/AC-9).
// Mediana de muestras; falla si un benchmark supera su presupuesto o si no tiene.
// T-011 agregó tablero:mover; T-020 agrega combate:turno (T-021 sumará efectos).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { loadContent } from '../packages/content/src/loader.ts'
import { validateContent } from '../packages/content/src/validate.ts'
import type { BoardGraph } from '../packages/content/src/index.ts'
import { parseCardId, parseNodeId } from '../packages/content/src/index.ts'
import { applyCommand, createRng, legalCommands, newGame } from '../packages/engine/src/index.ts'
import type { Command, Content, Ctx, GameState } from '../packages/engine/src/index.ts'

const root = fileURLToPath(new URL('..', import.meta.url))

interface Benchmark {
  readonly name: string
  readonly samples: number
  run(): void
}

/** Un movimiento completo de tablero (tirada + decisiones + fin de turno) determinista. */
function tableroMover(): () => void {
  const content: Content = loadContent(join(root, 'content'))
  const started = newGame({ seed: 2026_1011, starterDeck: 'montana', ruleset: content.ruleset }, content)
  if (!started.ok) throw new Error(started.error.message)
  let state: GameState = started.value.state
  const ctx: Ctx = { content, rng: createRng(state.rngState) }
  return () => {
    const rolled = applyCommand(state, { type: 'RollMove' }, ctx)
    if (!rolled.ok) throw new Error(rolled.error.message)
    state = rolled.value.state
    for (let guard = 0; state.pending !== null && guard < 64; guard += 1) {
      const pending = state.pending
      const command: Command | null =
        pending.type === 'ChoosePath'
          ? { type: 'ChoosePath', to: pending.options[0]! }
          : pending.type === 'StopOrContinue'
            ? { type: 'ContinueMoving' }
            : null
      if (command === null) break
      const answered = applyCommand(state, command, ctx)
      if (!answered.ok) throw new Error(answered.error.message)
      state = answered.value.state
    }
    const advanced = applyCommand(state, { type: 'Advance' }, ctx)
    if (!advanced.ok) throw new Error(advanced.error.message)
    state = advanced.value.state
    // T-012: un robo de PKM deja FightOrRelease; el driver lo deja ir (T-020 trae Fight).
    if (state.pending?.type === 'FightOrRelease') {
      const released = applyCommand(state, { type: 'ReleaseWild' }, ctx)
      if (!released.ok) throw new Error(released.error.message)
      state = released.value.state
    }
  }
}

/** Un turno de combate completo (SPEC-C/T-020): ataque del jugador + turno del rival. */
function combateTurno(): () => void {
  const content: Content = loadContent(join(root, 'content'))
  const board: BoardGraph = {
    meta: { id: 't020-bench', status: 'VERIFIED' },
    gyms: {},
    nodes: [{ id: 'm1', type: 'deck', shape: 'round', x: 0, y: 0, deck: 'pantano' }],
    edges: [],
  }
  const battleContent: Content = { ...content, board }
  const started = newGame({ seed: 2026_1009, starterDeck: 'montana', ruleset: content.ruleset }, content)
  if (!started.ok) throw new Error(started.error.message)
  const base: GameState = {
    ...started.value.state,
    phase: 'tileResolution',
    stepsLeft: 0,
    decks: { ...started.value.state.decks, pantano: [parseCardId('poliwag')], item: [] },
    players: started.value.state.players.map((p) => ({
      ...p,
      position: parseNodeId('m1'),
      cameFrom: null,
    })),
  }
  return () => {
    const ctx: Ctx = { content: battleContent, rng: createRng(42) }
    const drawn = applyCommand(base, { type: 'Advance' }, ctx)
    if (!drawn.ok) throw new Error(drawn.error.message)
    const fight = applyCommand(drawn.value.state, { type: 'FightEncounter', pkmUid: 'p1-starter' }, ctx)
    if (!fight.ok) throw new Error(fight.error.message)
    let state = fight.value.state
    for (let guard = 0; guard < 200; guard += 1) {
      if (state.pending?.type === 'ChooseReplacement') {
        const sent = applyCommand(state, { type: 'SendOut', pkmUid: state.pending.options[0]! }, ctx)
        if (!sent.ok) throw new Error(sent.error.message)
        state = sent.value.state
        continue
      }
      if (state.phase !== 'battle' || state.battle === null) break // ganó/perdió (T-022 sigue)
      if (state.battle.turnSide === 0) {
        const attack = legalCommands(state, ctx).find((c): c is Extract<Command, { type: 'Attack' }> => c.type === 'Attack')
        const command: Command = attack ?? { type: 'Advance' } // pasar si no puede atacar
        const next = applyCommand(state, command, ctx)
        if (!next.ok) throw new Error(next.error.message)
        state = next.value.state
      } else {
        const next = applyCommand(state, { type: 'Advance' }, ctx)
        if (!next.ok) throw new Error(next.error.message)
        state = next.value.state
      }
    }
  }
}

const benchmarks: readonly Benchmark[] = [
  {
    // §3: "carga y validación de todo el contenido < 300 ms".
    name: 'content:load-validate',
    samples: 5,
    run: () => {
      const dir = join(root, 'content')
      loadContent(dir)
      validateContent(dir)
    },
  },
  {
    // §3: "un movimiento de tablero < 2 ms" (SPEC-B/T-011).
    name: 'tablero:mover',
    samples: 25,
    run: tableroMover(),
  },
  {
    // §3: "un turno de combate completo < 5 ms" (SPEC-C/T-020).
    name: 'combate:turno',
    samples: 25,
    run: combateTurno(),
  },
]

const budgetFile = JSON.parse(readFileSync(join(root, 'perf-budget.json'), 'utf8')) as {
  budgets: Record<string, number>
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

let failed = false
const seen = new Set<string>()
for (const bench of benchmarks) {
  seen.add(bench.name)
  const budget = budgetFile.budgets[bench.name]
  if (budget === undefined) {
    console.error(`bench ${bench.name} FALLA — sin presupuesto en perf-budget.json`)
    failed = true
    continue
  }
  bench.run() // warmup
  const times: number[] = []
  for (let i = 0; i < bench.samples; i++) {
    const start = performance.now()
    bench.run()
    times.push(performance.now() - start)
  }
  const med = median(times)
  const ok = med <= budget
  console.log(`bench ${bench.name} ${med.toFixed(1)} ms / ${budget} ms ${ok ? 'OK' : 'FALLA'}`)
  if (!ok) failed = true
}
for (const name of Object.keys(budgetFile.budgets)) {
  if (!seen.has(name)) {
    console.error(`bench ${name} FALLA — presupuesto sin benchmark registrado`)
    failed = true
  }
}
if (failed) process.exit(1)
