// Utilidades de despacho de engine.ts: draft immer con error tipado y cierre
// de turno. Extraídas en T-022 para mantener engine.ts ≤ 400 líneas.
import { produce, type WritableDraft } from 'immer'
import { EngineError } from './errors.ts'
import type { Result } from './errors.ts'
import type { GameEvent } from './events.ts'
import type { GameState } from './state.ts'

export interface EventedState {
  readonly state: GameState
  readonly events: readonly GameEvent[]
}

/**
 * Corre `fn` sobre un draft immer y arma el resultado; si `fn` devuelve error se
 * lanza dentro de la receta ⇒ immer descarta el draft y queda el error tipado.
 */
export function withDraft(
  state: GameState,
  fn: (draft: WritableDraft<GameState>) => Result<readonly GameEvent[], EngineError>,
): Result<EventedState, EngineError> {
  let events: readonly GameEvent[] = []
  try {
    const next = produce(state, (draft) => {
      const result = fn(draft)
      if (!result.ok) throw result.error
      events = result.value
    })
    return { ok: true, value: { state: next, events } }
  } catch (error) {
    if (error instanceof EngineError) return { ok: false, error }
    throw error
  }
}

/** TurnAdvanced + estado ya avanzado (cierra el turno en `organize`). */
export function turnAdvanced(result: Result<EventedState, EngineError>): Result<EventedState, EngineError> {
  if (!result.ok) return result
  const { state, events } = result.value
  return {
    ok: true,
    value: { state, events: [...events, { type: 'TurnAdvanced', turn: state.turn }] },
  }
}
