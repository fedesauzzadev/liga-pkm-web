// AC: SPEC-B/T-011/AC-7 — property: 1000 partidas × 200 movimientos con semillas
// fijas nunca violan AC-3 (no ofrecer cameFrom) y siempre terminan en un nodo
// existente del tablero real de kanto. Los AC deterministas están en t011-movement.test.ts.
import { join } from 'node:path'
import { test } from 'vitest'
import fc from 'fast-check'
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

const content = loadContent(join(process.cwd(), 'content'))
const nodeIds = new Set(content.board.nodes.map((n) => n.id))

test(
  'AC-7 property: 1000 partidas de 200 movimientos nunca ofrecen cameFrom y terminan en nodos existentes',
  () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 - 1 }), (seed) => {
        const started = newGame({ seed, starterDeck: 'montana', ruleset: content.ruleset }, content)
        if (!started.ok) throw new Error(started.error.message)

        // El stream del dado continúa donde newGame dejó el RNG (state.rngState).
        const ctx: Ctx = { content, rng: createRng(started.value.state.rngState) }
        const choices = createRng((seed ^ 0x5eed_5eed) >>> 0)
        let state = started.value.state

        for (let move = 0; move < 200; move++) {
          const rolled = applyCommand(state, { type: 'RollMove' }, ctx)
          if (!rolled.ok) throw new Error(`movimiento ${move}: ${rolled.error.message}`)
          state = rolled.value.state
          for (const event of rolled.value.events) {
            if (event.type === 'MoveStep') {
              if (!nodeIds.has(event.to)) throw new Error(`paso a nodo inexistente: ${event.to}`)
            }
          }

          let guard = 0
          while (state.pending !== null) {
            if (guard++ > 64) throw new Error('movimiento sin fin')
            const command: Command | null =
              state.pending.type === 'ChoosePath'
                ? { type: 'ChoosePath', to: pickOption(state, choices) }
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

          const player = state.players[0]!
          if (state.phase !== 'tileResolution') throw new Error(`fase final: ${state.phase}`)
          if (!nodeIds.has(player.position)) throw new Error(`posición inexistente: ${player.position}`)
          if (player.cameFrom !== null && !nodeIds.has(player.cameFrom)) {
            throw new Error(`cameFrom inexistente: ${player.cameFrom}`)
          }
          if (state.stepsLeft !== 0) throw new Error('aterrizó con pasos restantes')

          const advanced = applyCommand(state, { type: 'Advance' }, ctx)
          if (!advanced.ok) throw new Error(advanced.error.message)
          state = advanced.value.state
          // T-012: si el casillero robó un PKM, el turno espera FightOrRelease;
          // el driver lo deja ir (pelear llega con T-020).
          if (state.pending?.type === 'FightOrRelease') {
            const released = applyCommand(state, { type: 'ReleaseWild' }, ctx)
            if (!released.ok) throw new Error(released.error.message)
            state = released.value.state
          }
          if (state.phase !== 'organize') throw new Error(`tras Advance: ${state.phase}`)
        }
      }),
      { numRuns: 1000, seed: 195_936_478 }, // semillas fijas ⇒ corrida reproducible
    )
  },
  600_000,
)

/** Elige una opción de ChoosePath sin ofrecer nunca el cameFrom (AC-3). */
function pickOption(state: GameState, choices: Rng): string {
  const pending = state.pending
  if (pending?.type !== 'ChoosePath') throw new Error('pickOption sin ChoosePath')
  const cameFrom = state.players[0]!.cameFrom
  if (cameFrom !== null && pending.options.includes(cameFrom)) {
    throw new Error(`AC-3 violada: se ofreció volver a cameFrom (${cameFrom})`)
  }
  const index = pending.options.length >= 2 ? choices.int(pending.options.length) : 0
  return pending.options[index] ?? pending.options[0]!
}
