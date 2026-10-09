// Núcleo comando → reductor puro → eventos (SDD §3, ADR-1). Un handler por
// comando (Strategy + Registry); el dispatcher solo reparte (estándar §1).
import { produce } from 'immer'
import type { Content } from '@liga/content'
import { createRng } from './rng.ts'
import type { Rng } from './rng.ts'
import { resolvesPending, type Command } from './commands.ts'
import { boardIndexFor } from './board.ts'
import { EngineError } from './errors.ts'
import type { Result } from './errors.ts'
import type { DieRolled, GameEvent } from './events.ts'
import { turnAdvanced, withDraft } from './dispatch.ts'
import { applyPlan, movementEvents, planMovement } from './movement.ts'
import type { MovementPlan, MovementStep } from './movement.ts'
import { releaseWild, resolveTile, swapWithOak } from './tiles.ts'
import { assignWildcard, equipElement, unequipElement } from './equipment.ts'
import { captureWild, evolvePkm, releaseCaptured } from './progression.ts'
import { acceptGymChallenge } from './gyms.ts'
import {
  advanceBattle,
  attackCommand,
  fightEncounter,
  retire,
  sendOut,
  usePotion,
} from './battle-commands.ts'
import {
  assertInvariants,
  invariantChecksEnabled,
} from './invariants.ts'
import { NoopLogger } from './logger.ts'
import type { Logger } from './logger.ts'
import { createInitialState } from './state.ts'
import type { GameState, PlayerState } from './state.ts'

export interface Ctx {
  readonly content: Content
  readonly rng: Rng
  /** Logger inyectado (estándar §5); si no viene, NoopLogger. */
  readonly log?: Logger
}

export interface CommandOk {
  readonly state: GameState
  readonly events: readonly GameEvent[]
}

type Handler<C extends Command> = (state: GameState, command: C, ctx: Ctx) => Result<CommandOk, EngineError>

/** Post-condición compartida: invariantes + log de eventos y dados (T-006). */
function finish(result: Result<CommandOk, EngineError>, log: Logger): Result<CommandOk, EngineError> {
  if (!result.ok) return result
  if (invariantChecksEnabled()) assertInvariants(result.value.state)
  log.events(result.value.events)
  for (const event of result.value.events) {
    if (event.type === 'DieRolled') log.die(event)
  }
  return result
}

function illegal(message: string): Result<CommandOk, EngineError> {
  return { ok: false, error: new EngineError('ILLEGAL_COMMAND', message) }
}

function activePlayer(state: GameState): PlayerState | undefined {
  return state.players.find((p) => p.id === state.activePlayerId)
}

/** planMovement puede lanzar por contenido degenerado; se devuelve como error tipado. */
function planOrError(
  state: GameState,
  ctx: Ctx,
  input: { position: string; cameFrom: string | null; stepsLeft: number },
  start: 'depart' | 'arrive',
): Result<MovementPlan, EngineError> {
  if (state.ruleset === null) {
    return { ok: false, error: new EngineError('ILLEGAL_COMMAND', 'no hay partida iniciada (falta ruleset)') }
  }
  try {
    return {
      ok: true,
      value: planMovement(boardIndexFor(ctx.content.board), state.ruleset, input, start),
    }
  } catch (error) {
    if (error instanceof EngineError) return { ok: false, error }
    throw error
  }
}

// Registro exhaustivo: agregar una variante a Command sin su handler no compila.
const handlers: {
  readonly [K in Command['type']]: Handler<Extract<Command, { readonly type: K }>>
} = {
  Advance: (state, _command, ctx) => {
    // Stub pre-partida de T-004 (fase `idle`).
    if (state.phase === 'idle') {
      const turn = state.turn + 1
      return {
        ok: true,
        value: {
          state: produce(state, (draft) => {
            draft.turn = turn
          }),
          events: [{ type: 'TurnAdvanced', turn }],
        },
      }
    }
    // Batalla: procesa hasta la próxima decisión del jugador (SPEC-C/T-020).
    if (state.phase === 'battle') {
      return withDraft(state, (draft) => advanceBattle(draft, ctx))
    }
    // T-012: resuelve el casillero (SDD §5) y termina el turno; si el robo dejó
    // un encuentro pendiente, el turno espera a FightOrRelease.
    if (state.phase === 'tileResolution') {
      const resolved = withDraft(state, (draft) => resolveTile(draft, ctx.content))
      if (!resolved.ok) return resolved
      if (resolved.value.state.pending !== null) return resolved
      const turn = resolved.value.state.turn + 1
      const finished = produce(resolved.value.state, (draft) => {
        draft.turn = turn
        draft.phase = 'organize'
      })
      return {
        ok: true,
        value: { state: finished, events: [...resolved.value.events, { type: 'TurnAdvanced', turn }] },
      }
    }
    return illegal(`Advance no aplica en fase "${state.phase}"`)
  },
  Roll: (state, _command, ctx) => {
    // Stub pre-partida de T-004 (fase `idle`); en partida se usa RollMove.
    if (state.phase !== 'idle') return illegal('Roll es un stub pre-partida; en partida usá RollMove')
    const dieRolled: DieRolled = { type: 'DieRolled', purpose: 'move', value: ctx.rng.d6() }
    return {
      ok: true,
      value: {
        state: produce(state, (draft) => {
          draft.dieLog.push(dieRolled)
          draft.rngState = ctx.rng.snapshot()
        }),
        events: [dieRolled],
      },
    }
  },
  RollMove: (state, _command, ctx) => {
    if (state.phase !== 'organize') return illegal('RollMove requiere fase "organize"')
    const player = activePlayer(state)
    if (player === undefined) return illegal('RollMove sin jugador activo')
    const value = ctx.rng.d6()
    const dieRolled: DieRolled = { type: 'DieRolled', purpose: 'move', value }
    const planned = planOrError(
      state,
      ctx,
      { position: player.position, cameFrom: player.cameFrom, stepsLeft: value },
      'depart',
    )
    if (!planned.ok) return planned
    const plan = planned.value
    const events: GameEvent[] = [dieRolled, ...movementEvents(player.id, plan)]
    return {
      ok: true,
      value: {
        state: produce(state, (draft) => {
          draft.dieLog.push(dieRolled)
          draft.rngState = ctx.rng.snapshot()
          draft.phase = 'moving'
          draft.stepsLeft = value
          applyPlan(draft, plan)
        }),
        events,
      },
    }
  },
  ChoosePath: (state, command, ctx) => {
    const pending = state.pending
    if (pending?.type !== 'ChoosePath' || state.phase !== 'moving') {
      return illegal('ChoosePath requiere decisión ChoosePath pendiente en fase "moving"')
    }
    if (!pending.options.includes(command.to)) {
      return illegal(`destino "${command.to}" no está entre las opciones`)
    }
    const player = activePlayer(state)
    if (player === undefined) return illegal('sin jugador activo')
    // Paso elegido + continuación desde la llegada al nodo elegido.
    const decrement = state.stepsLeft > 0
    const stepsLeft = decrement ? state.stepsLeft - 1 : 0
    const chosen: MovementStep = { from: player.position, to: command.to, decrement }
    const planned = planOrError(
      state,
      ctx,
      { position: command.to, cameFrom: player.position, stepsLeft },
      'arrive',
    )
    if (!planned.ok) return planned
    const plan: MovementPlan = { ...planned.value, steps: [chosen, ...planned.value.steps] }
    return {
      ok: true,
      value: {
        state: produce(state, (draft) => {
          draft.pending = null
          applyPlan(draft, plan)
        }),
        events: movementEvents(player.id, plan),
      },
    }
  },
  StopHere: (state) => {
    if (state.pending?.type !== 'StopOrContinue' || state.phase !== 'moving') {
      return illegal('StopHere requiere decisión StopOrContinue pendiente en fase "moving"')
    }
    const player = activePlayer(state)
    if (player === undefined) return illegal('sin jugador activo')
    // Frenar descarta los pasos restantes y aterriza (AC-4); cameFrom=null (AC-3).
    return {
      ok: true,
      value: {
        state: produce(state, (draft) => {
          const p = draft.players.find((q) => q.id === draft.activePlayerId)
          if (p === undefined) throw new EngineError('ILLEGAL_COMMAND', 'sin jugador activo')
          p.cameFrom = null
          draft.pending = null
          draft.stepsLeft = 0
          draft.phase = 'tileResolution'
        }),
        events: [{ type: 'Landed', player: player.id, node: player.position }],
      },
    }
  },
  ContinueMoving: (state, _command, ctx) => {
    if (state.pending?.type !== 'StopOrContinue' || state.phase !== 'moving') {
      return illegal('ContinueMoving requiere decisión StopOrContinue pendiente en fase "moving"')
    }
    if (state.stepsLeft <= 0) return illegal('no quedan pasos para continuar')
    const player = activePlayer(state)
    if (player === undefined) return illegal('sin jugador activo')
    const planned = planOrError(
      state,
      ctx,
      { position: player.position, cameFrom: player.cameFrom, stepsLeft: state.stepsLeft },
      'depart',
    )
    if (!planned.ok) return planned
    const plan = planned.value
    return {
      ok: true,
      value: {
        state: produce(state, (draft) => {
          draft.pending = null
          applyPlan(draft, plan)
        }),
        events: movementEvents(player.id, plan),
      },
    }
  },
  ReleaseWild: (state) => {
    if (state.pending?.type !== 'FightOrRelease' || state.phase !== 'tileResolution') {
      return illegal('ReleaseWild requiere decisión FightOrRelease pendiente')
    }
    return turnAdvanced(withDraft(state, (draft) => releaseWild(draft)))
  },
  SwapWithOak: (state, command, ctx) => {
    if (state.phase !== 'tileResolution' || state.pending !== null) {
      return illegal('SwapWithOak requiere fase "tileResolution" sin decisión pendiente')
    }
    return withDraft(state, (draft) =>
      swapWithOak(draft, ctx.content, command.teamUid, command.pileUid),
    )
  },
  // T-013: equipar/desequipar/asignar comodín solo en Organize (AC-3: nunca en combate).
  Equip: (state, command) => {
    if (state.phase !== 'organize') return illegal('Equip requiere fase "organize"')
    return withDraft(state, (draft) => equipElement(draft, command))
  },
  Unequip: (state, command) => {
    if (state.phase !== 'organize') return illegal('Unequip requiere fase "organize"')
    return withDraft(state, (draft) => unequipElement(draft, command))
  },
  AssignWildcard: (state, command) => {
    if (state.phase !== 'organize') return illegal('AssignWildcard requiere fase "organize"')
    return withDraft(state, (draft) => assignWildcard(draft, command))
  },
  // ── Batalla (SPEC-C/T-020): el dominio vive en battle-commands.ts. ──
  FightEncounter: (state, command, ctx) => withDraft(state, (draft) => fightEncounter(draft, ctx, command)),
  UsePotion: (state, command) => withDraft(state, (draft) => usePotion(draft, command)),
  Retire: (state, command) => withDraft(state, (draft) => retire(draft, command)),
  Attack: (state, command, ctx) => withDraft(state, (draft) => attackCommand(draft, ctx, command)),
  SendOut: (state, command, ctx) => withDraft(state, (draft) => sendOut(draft, ctx, command)),
  // ── Progresión (SPEC-C/T-022): captura/liberación y evolución. ──
  Capture: (state, _command, ctx) => turnAdvanced(withDraft(state, (draft) => captureWild(draft, ctx.content))),
  Release: (state) => turnAdvanced(withDraft(state, (draft) => releaseCaptured(draft))),
  Evolve: (state, command, ctx) => withDraft(state, (draft) => evolvePkm(draft, ctx.content, command)),
  // ── Gimnasios (SPEC-C/T-023): el desafío es opcional (D-17). ──
  AcceptGymChallenge: (state, command, ctx) =>
    withDraft(state, (draft) => acceptGymChallenge(draft, ctx.content, command)),
}

export function applyCommand(
  state: GameState,
  command: Command,
  ctx: Ctx,
): Result<CommandOk, EngineError> {
  const log = ctx.log ?? NoopLogger
  log.command(command)
  if (state.pending !== null && !resolvesPending(command, state.pending)) {
    return {
      ok: false,
      error: new EngineError('PENDING_DECISION', `decisión pendiente: ${state.pending.type}`),
    }
  }
  switch (command.type) {
    case 'Advance':
      return finish(handlers.Advance(state, command, ctx), log)
    case 'Roll':
      return finish(handlers.Roll(state, command, ctx), log)
    case 'RollMove':
      return finish(handlers.RollMove(state, command, ctx), log)
    case 'ChoosePath':
      return finish(handlers.ChoosePath(state, command, ctx), log)
    case 'StopHere':
      return finish(handlers.StopHere(state, command, ctx), log)
    case 'ContinueMoving':
      return finish(handlers.ContinueMoving(state, command, ctx), log)
    case 'ReleaseWild':
      return finish(handlers.ReleaseWild(state, command, ctx), log)
    case 'SwapWithOak':
      return finish(handlers.SwapWithOak(state, command, ctx), log)
    case 'Equip':
      return finish(handlers.Equip(state, command, ctx), log)
    case 'Unequip':
      return finish(handlers.Unequip(state, command, ctx), log)
    case 'AssignWildcard':
      return finish(handlers.AssignWildcard(state, command, ctx), log)
    case 'FightEncounter':
      return finish(handlers.FightEncounter(state, command, ctx), log)
    case 'UsePotion':
      return finish(handlers.UsePotion(state, command, ctx), log)
    case 'Retire':
      return finish(handlers.Retire(state, command, ctx), log)
    case 'Attack':
      return finish(handlers.Attack(state, command, ctx), log)
    case 'SendOut':
      return finish(handlers.SendOut(state, command, ctx), log)
    case 'Capture':
      return finish(handlers.Capture(state, command, ctx), log)
    case 'Release':
      return finish(handlers.Release(state, command, ctx), log)
    case 'Evolve':
      return finish(handlers.Evolve(state, command, ctx), log)
    case 'AcceptGymChallenge':
      return finish(handlers.AcceptGymChallenge(state, command, ctx), log)
    default: {
      const unreachable: never = command // exhaustivo: falla si falta un case
      return {
        ok: false,
        error: new EngineError('ILLEGAL_COMMAND', `comando desconocido: ${String(unreachable)}`),
      }
    }
  }
}

export interface ReplayOk {
  readonly state: GameState
  readonly events: readonly GameEvent[]
}

/** Misma semilla + mismos comandos ⇒ misma partida (SDD §2: determinismo). */
export function replay(
  seed: number,
  commands: readonly Command[],
  content: Content,
): Result<ReplayOk, EngineError> {
  const ctx: Ctx = { content, rng: createRng(seed) }
  let state = createInitialState()
  const events: GameEvent[] = []
  for (const command of commands) {
    const result = applyCommand(state, command, ctx)
    if (!result.ok) return result
    state = result.value.state
    events.push(...result.value.events)
  }
  return { ok: true, value: { state, events } }
}
