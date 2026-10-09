// Planificador de movimiento (SPEC-B/T-011): función pura que calcula pasos y
// desenlace a partir de tablero + ruleset, sin tocar el estado. La aplicación del
// plan al draft y los eventos del tramo viven acá desde T-012 (límite 400 líneas).
// Reglas: RULES §2 (bifurcaciones sin retroceso, cuadrados/redondos) y D-01 (rebote).
import type { WritableDraft } from 'immer'
import { parseNodeId } from '@liga/content'
import type { Ruleset } from '@liga/content'
import type { BoardIndex } from './board.ts'
import { EngineError } from './errors.ts'
import type { GameEvent } from './events.ts'
import type { GameState } from './state.ts'

/** Cómo arranca el plan: saliendo del nodo actual o llegando a él. */
export type MovementStart = 'depart' | 'arrive'

export interface MovementStep {
  readonly from: string
  readonly to: string
  /** Consume un paso del dado; los forzados por `junction` (sin pasos) no. */
  readonly decrement: boolean
}

export type MovementOutcome =
  | { readonly kind: 'landed'; readonly node: string }
  | { readonly kind: 'choosePath'; readonly options: readonly string[] }
  | { readonly kind: 'stopOrContinue' }

export interface MovementPlan {
  readonly steps: readonly MovementStep[]
  readonly outcome: MovementOutcome
  /** Posición/cameFrom/stepsLeft finales al aplicar el plan. */
  readonly position: string
  readonly cameFrom: string | null
  readonly stepsLeft: number
}

export interface MovementInput {
  readonly position: string
  readonly cameFrom: string | null
  readonly stepsLeft: number
}

/**
 * Regla de salida de cada nodo: `options = vecinos \ {cameFrom}` (AC-2/AC-3);
 * `>1` ⇒ ChoosePath, `=1` ⇒ avanza solo, `=0` ⇒ callejón: rebote si quedan pasos
 * y el ruleset lo permite (D-01) o freno descartando. Llegada a un nodo:
 * `junction` nunca destino ni frenable (AC-8) ⇒ sigue (paso forzado); con 0
 * pasos aterriza (AC-5: el redondo solo cae exacto); `square` con pasos ⇒
 * StopOrContinue (AC-4).
 */
export function planMovement(
  board: BoardIndex,
  ruleset: Pick<Ruleset, 'deadEndBounce'>,
  input: MovementInput,
  start: MovementStart,
): MovementPlan {
  let position = input.position
  let cameFrom = input.cameFrom
  let stepsLeft = input.stepsLeft
  const steps: MovementStep[] = []
  // Tope defensivo: contenido válido no lo alcanza (evita ciclos de junctions).
  const budget = input.stepsLeft + board.nodeCount() + 1
  let arriving = start === 'arrive'

  const finish = (outcome: MovementOutcome): MovementPlan => {
    const landed = outcome.kind === 'landed'
    return {
      steps,
      outcome,
      position,
      cameFrom: landed ? null : cameFrom,
      stepsLeft: landed ? 0 : stepsLeft,
    }
  }

  while (true) {
    if (arriving) {
      const node = board.node(position)
      const junction = node.type === 'junction'
      if (!junction) {
        if (stepsLeft === 0) return finish({ kind: 'landed', node: position })
        if (node.shape === 'square') return finish({ kind: 'stopOrContinue' })
      }
      // `junction` sigue caminando: nunca es destino final ni frenable (AC-8).
    }
    arriving = true
    if (steps.length >= budget) {
      throw new EngineError(
        'ILLEGAL_COMMAND',
        `movimiento sin fin desde "${input.position}" (¿ciclo de junctions?)`,
      )
    }

    const options = board.forwardOptions(position, cameFrom)
    const only = options[0]
    let next: string
    if (options.length > 1) {
      return finish({ kind: 'choosePath', options })
    }
    if (only !== undefined) {
      next = only
    } else if (cameFrom !== null && ((stepsLeft > 0 && ruleset.deadEndBounce) || board.node(position).type === 'junction')) {
      // Callejón con pasos restantes ⇒ rebote (D-01); junction callejón ⇒ vuelta forzada.
      next = cameFrom
    } else if (cameFrom !== null && stepsLeft > 0) {
      // Callejón con rebote deshabilitado por ruleset: frena acá y descarta.
      return finish({ kind: 'landed', node: position })
    } else {
      throw new EngineError('ILLEGAL_COMMAND', `nodo aislado "${position}"`)
    }

    const decrement = stepsLeft > 0
    if (decrement) stepsLeft -= 1
    steps.push({ from: position, to: next, decrement })
    cameFrom = position
    position = next
  }
}

/** Eventos de un plan: un MoveStep por paso + Landed si aterrizó (T-011 AC-1/AC-6). */
export function movementEvents(playerId: string, plan: MovementPlan): GameEvent[] {
  const events: GameEvent[] = plan.steps.map((step) => ({
    type: 'MoveStep',
    player: playerId,
    from: step.from,
    to: step.to,
  }))
  if (plan.outcome.kind === 'landed') {
    events.push({ type: 'Landed', player: playerId, node: plan.outcome.node })
  }
  return events
}

/** Aplica el plan al draft: pasos + desenlace (fase, pending, cameFrom, stepsLeft). */
export function applyPlan(draft: WritableDraft<GameState>, plan: MovementPlan): void {
  const player = draft.players.find((p) => p.id === draft.activePlayerId)
  if (player === undefined) throw new EngineError('ILLEGAL_COMMAND', 'sin jugador activo')
  for (const step of plan.steps) {
    player.position = parseNodeId(step.to)
    player.cameFrom = parseNodeId(step.from)
  }
  draft.stepsLeft = plan.stepsLeft
  if (plan.outcome.kind === 'landed') {
    player.cameFrom = null // frenó/aterrizó ⇒ el próximo turno va en cualquier dirección (AC-3)
    draft.pending = null
    draft.phase = 'tileResolution' // T-012 resuelve el casillero en Advance
  } else if (plan.outcome.kind === 'choosePath') {
    draft.pending = { type: 'ChoosePath', options: [...plan.outcome.options] }
  } else {
    draft.pending = { type: 'StopOrContinue' }
  }
}
