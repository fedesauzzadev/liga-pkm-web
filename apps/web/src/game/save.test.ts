// AC: SPEC-D/T-034/AC-2 — guardado {version, seed, commandLog} en localStorage
// (storage inyectable), restore determinista con verificación de hash y
// versión desconocida detectada. Fixture: partida real con content parseado.
import { expect, test } from 'vitest'
import type { GameEvent, Result } from '@liga/engine'
import { gameContent } from './content'
import {
  SAVE_KEY,
  createMemoryStorage,
  hashState,
  readSave,
  writeSave,
} from './save'
import {
  applyToSession,
  restoreSession,
  saveFromSession,
  startSession,
  turnEnded,
  type GameSession,
} from './session'

const must = <T>(result: Result<T, { readonly message: string }>): T => {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

/** Juega un turno completo con el motor real (dado → decisiones → casillero). */
const driveTurn = (start: GameSession): { session: GameSession; events: GameEvent[] } => {
  let step = must(applyToSession(start, { type: 'RollMove' }, gameContent))
  const events: GameEvent[] = [...step.events]
  for (let guard = 0; guard < 64; guard++) {
    const state = step.session.state
    if (state.pending?.type === 'ChoosePath') {
      const to = state.pending.options[0]
      if (to === undefined) break
      step = must(applyToSession(step.session, { type: 'ChoosePath', to }, gameContent))
    } else if (state.pending?.type === 'StopOrContinue') {
      step = must(applyToSession(step.session, { type: 'StopHere' }, gameContent))
    } else if (state.pending?.type === 'FightOrRelease') {
      step = must(applyToSession(step.session, { type: 'ReleaseWild' }, gameContent))
    } else if (state.phase === 'tileResolution') {
      step = must(applyToSession(step.session, { type: 'Advance' }, gameContent))
    } else {
      break
    }
    events.push(...step.events)
    if (step.session.state.turn > start.state.turn) return { session: step.session, events }
  }
  return { session: step.session, events }
}

const playedSession = (): GameSession => {
  const started = must(startSession({ seed: 42, starterDeck: 'isla' }, gameContent))
  return driveTurn(started).session
}

test('AC: SPEC-D/AC-2 - roundtrip del save: writeSave → readSave ok con semilla, mazo y log', () => {
  const storage = createMemoryStorage()
  const session = playedSession()
  writeSave(storage, saveFromSession(session))
  const read = readSave(storage)
  expect(read.kind).toBe('ok')
  if (read.kind !== 'ok') return
  expect(read.save.version).toBe(1)
  expect(read.save.seed).toBe(42)
  expect(read.save.starterDeck).toBe('isla')
  expect(read.save.commandLog.length).toBeGreaterThan(0)
  expect(read.save.stateHash).toBe(hashState(session.state))
})

test('AC: SPEC-D/AC-2 - el restore reproduce el estado exacto y verifica el hash', () => {
  const session = playedSession()
  const save = saveFromSession(session)
  const restored = restoreSession(save, gameContent)
  expect(restored.ok).toBe(true)
  if (!restored.ok) return
  expect(restored.value.session.state).toEqual(session.state)
  expect(hashState(restored.value.session.state)).toBe(save.stateHash)
})

test('AC: SPEC-D/AC-2 - hash manipulado ⇒ el restore falla con error tipado', () => {
  const session = playedSession()
  const tampered = { ...saveFromSession(session), stateHash: 'deadbeef' }
  const restored = restoreSession(tampered, gameContent)
  expect(restored.ok).toBe(false)
  if (restored.ok) return
  expect(restored.error.code).toBe('hash')
})

test('AC: SPEC-D/AC-2 - versión desconocida del save ⇒ resultado tipado (mensaje claro)', () => {
  const storage = createMemoryStorage()
  storage.setItem(
    SAVE_KEY,
    JSON.stringify({ version: 99, seed: 1, starterDeck: 'isla', commandLog: [], stateHash: 'x' }),
  )
  expect(readSave(storage)).toEqual({ kind: 'unknown-version', found: 99 })
})

test('AC: SPEC-D/AC-2 - JSON corrupto ⇒ invalid (nunca explota)', () => {
  const storage = createMemoryStorage()
  storage.setItem(SAVE_KEY, '{no-es-json')
  expect(readSave(storage)).toEqual({ kind: 'invalid' })
  expect(readSave(createMemoryStorage())).toEqual({ kind: 'none' })
})

test('AC: SPEC-D/AC-2 - guardado automático por turno: TurnAdvanced dispara el corte', () => {
  const started = must(startSession({ seed: 42, starterDeck: 'isla' }, gameContent))
  const roll = must(applyToSession(started, { type: 'RollMove' }, gameContent))
  expect(turnEnded(roll.events)).toBe(false)
  const turn = driveTurn(started)
  expect(turnEnded(turn.events)).toBe(true)
})
