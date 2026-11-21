// Sesión de juego real (SPEC-D/T-034): newGame + log de comandos; el restore
// replays el log y verifica el hash del estado (AC-2). Funciones puras sobre el
// motor; la UI (PlayScreen) solo las llama y reproduce los eventos.
import type { DeckId } from '@liga/content'
import {
  applyCommand,
  createRng,
  newGame,
  type Command,
  type Content,
  type GameEvent,
  type GameState,
  type Result,
  type Rng,
} from '@liga/engine'
import { SAVE_VERSION, hashState, type SaveData } from './save'

export interface GameSession {
  readonly seed: number
  readonly starterDeck: DeckId
  readonly commandLog: readonly Command[]
  readonly state: GameState
}

export interface SessionStep {
  readonly session: GameSession
  readonly events: readonly GameEvent[]
}

export type SessionErrorCode = 'setup' | 'illegal' | 'hash' | 'corrupt'
export interface SessionError {
  readonly code: SessionErrorCode
  readonly message: string
}

export function startSession(
  options: { readonly seed: number; readonly starterDeck: DeckId },
  content: Content,
): Result<GameSession, SessionError> {
  const started = newGame({ ...options, ruleset: content.ruleset }, content)
  if (!started.ok) {
    return { ok: false, error: { code: 'setup', message: started.error.message } }
  }
  return {
    ok: true,
    value: { seed: options.seed, starterDeck: options.starterDeck, commandLog: [], state: started.value.state },
  }
}

/**
 * Aplica un comando retomando el stream del RNG donde quedó (rngState).
 * `rngFor` permite inyectar dados forzados en desarrollo (T-061/AC-4).
 */
export function applyToSession(
  session: GameSession,
  command: Command,
  content: Content,
  rngFor: (rngState: number) => Rng = createRng,
): Result<SessionStep, SessionError> {
  const result = applyCommand(session.state, command, {
    content,
    rng: rngFor(session.state.rngState),
  })
  if (!result.ok) {
    return { ok: false, error: { code: 'illegal', message: result.error.message } }
  }
  return {
    ok: true,
    value: {
      session: {
        ...session,
        state: result.value.state,
        commandLog: [...session.commandLog, command],
      },
      events: result.value.events,
    },
  }
}

/** ¿El paso cerró un turno? (dispara el guardado automático por turno). */
export const turnEnded = (events: readonly GameEvent[]): boolean =>
  events.some((event) => event.type === 'TurnAdvanced')

export function saveFromSession(session: GameSession, contentHash?: string): SaveData {
  return {
    version: SAVE_VERSION,
    seed: session.seed,
    starterDeck: session.starterDeck,
    commandLog: session.commandLog,
    stateHash: hashState(session.state),
    ...(contentHash === undefined ? {} : { contentHash }),
  }
}

/**
 * Restaura una partida (AC-2): newGame con la semilla guardada + replay del log
 * de comandos; al final verifica el hash del estado. No re-emite los eventos
 * históricos: "Continuar" deja el juego en el mismo punto, sin reproducir todo.
 */
export function restoreSession(
  save: SaveData,
  content: Content,
): Result<SessionStep, SessionError> {
  let current = startSession({ seed: save.seed, starterDeck: save.starterDeck }, content)
  if (!current.ok) return current
  for (const command of save.commandLog) {
    const step = applyToSession(current.value, command, content)
    if (!step.ok) {
      return {
        ok: false,
        error: { code: 'corrupt', message: `comando del save rechazado: ${step.error.message}` },
      }
    }
    current = { ok: true, value: step.value.session }
  }
  const restored = current.value
  if (hashState(restored.state) !== save.stateHash) {
    return {
      ok: false,
      error: {
        code: 'hash',
        message: 'la partida guardada no coincide con el estado reconstruido',
      },
    }
  }
  return { ok: true, value: { session: restored, events: [] } }
}
