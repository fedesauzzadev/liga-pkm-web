// AC: SPEC-A/T-004 — RNG con semilla + log de dados + comandos/eventos base.
// Un test por AC del spec.
import { join } from 'node:path'
import { expect, expectTypeOf, test } from 'vitest'
import { loadContent } from '../packages/content/src/node.ts'
import {
  applyCommand,
  createInitialState,
  createRng,
  EngineError,
  legalCommands,
  replay,
  type Command,
  type Ctx,
  type Decision,
  type DieRolled,
  type GameEvent,
  type GameState,
} from '../packages/engine/src/index.ts'

const content = loadContent(join(process.cwd(), 'content'))
const ctx = (): Ctx => ({ content, rng: createRng(42) })

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

// AC: SPEC-A/T-004/AC-1 — createRng determinista (mulberry32); d6 en 1..6 y distribución razonable.
test('AC-1 createRng determinista; d6 en rango; distribución razonable; snapshot reanuda', () => {
  const a = createRng(0xc0ffee)
  const b = createRng(0xc0ffee)
  const sequence: number[] = []
  for (let i = 0; i < 200; i++) sequence.push(a.d6())
  expect(sequence).toEqual(Array.from({ length: 200 }, () => b.d6()))

  const counts = new Map<number, number>()
  const other = createRng(987_654_321)
  for (let i = 0; i < 6000; i++) {
    const value = other.d6()
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  expect([...counts.keys()].sort()).toEqual([1, 2, 3, 4, 5, 6])
  for (const face of [1, 2, 3, 4, 5, 6]) {
    // Laxo: ±15 % del esperado (1000 por cara en 6000 tiradas).
    expect(counts.get(face), `cara ${face}`).toBeGreaterThan(850)
    expect(counts.get(face), `cara ${face}`).toBeLessThan(1150)
  }

  // Semillas distintas ⇒ secuencias distintas.
  expect(Array.from({ length: 10 }, () => createRng(1).d6())).not.toEqual(
    Array.from({ length: 10 }, () => createRng(2).d6()),
  )

  // snapshot(): createRng(snapshot) reanuda la misma secuencia (soporte de guardados).
  const paused = createRng(77)
  for (let i = 0; i < 5; i++) paused.d6()
  const resumed = createRng(paused.snapshot())
  expect(Array.from({ length: 10 }, () => paused.d6())).toEqual(
    Array.from({ length: 10 }, () => resumed.d6()),
  )
})

// AC: SPEC-A/T-004/AC-2 — applyCommand devuelve {state,events} sin mutar el estado de entrada.
test('AC-2 applyCommand no muta el estado congelado de entrada', () => {
  const frozen = deepFreeze(createInitialState())
  const original = structuredClone(frozen)

  const roll = applyCommand(frozen, { type: 'Roll' }, ctx())
  expect(roll.ok).toBe(true)
  const advance = applyCommand(frozen, { type: 'Advance' }, ctx())
  expect(advance.ok).toBe(true)

  expect(frozen).toEqual(original)
  expect(frozen.dieLog).toHaveLength(0)
  expect(frozen.turn).toBe(0)
  if (roll.ok) expect(roll.value.state.dieLog).toHaveLength(1)
  if (advance.ok) expect(advance.value.state.turn).toBe(1)
})

// AC: SPEC-A/T-004/AC-3 — toda tirada emite DieRolled{purpose,value}; replay reproduce todo.
test('AC-3 toda tirada emite DieRolled y replay reproduce estado y eventos', () => {
  const commands: Command[] = [
    { type: 'Roll' },
    { type: 'Advance' },
    { type: 'Roll' },
    { type: 'Roll' },
    { type: 'Advance' },
  ]
  const seed = 195_936_478 // 0xBADC0DE
  const manual: Ctx = { content, rng: createRng(seed) }
  let state = createInitialState()
  const events: GameEvent[] = []
  for (const command of commands) {
    const result = applyCommand(state, command, manual)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('inalcanzable')
    state = result.value.state
    events.push(...result.value.events)
  }

  // Cada Roll ⇒ exactamente un DieRolled{purpose:'move', value 1..6} y queda en el log.
  const dice = events.filter((e): e is DieRolled => e.type === 'DieRolled')
  expect(dice).toHaveLength(3)
  for (const die of dice) {
    expect(die.purpose).toBe('move')
    expect(die.value).toBeGreaterThanOrEqual(1)
    expect(die.value).toBeLessThanOrEqual(6)
  }
  expect(state.dieLog).toEqual(dice)

  const rep = replay(seed, commands, content)
  expect(rep.ok).toBe(true)
  if (rep.ok) {
    expect(rep.value.state).toEqual(state)
    expect(rep.value.events).toEqual(events)
  }

  // Otra semilla ⇒ otra partida (eventos y log de dados distintos).
  const other = replay(seed + 1, commands, content)
  expect(other.ok).toBe(true)
  if (other.ok && rep.ok) expect(other.value.events).not.toEqual(rep.value.events)
})

// AC: SPEC-A/T-004/AC-4 — tipos Command/GameEvent/Decision exportados; legalCommands.
test('AC-4 tipos exportados; legalCommands según pending; errores tipados', () => {
  expectTypeOf<Command>().not.toBeNever()
  expectTypeOf<GameEvent>().not.toBeNever()
  expectTypeOf<Decision>().not.toBeNever()

  const initial = createInitialState()
  expect(legalCommands(initial, ctx())).toEqual([{ type: 'Advance' }, { type: 'Roll' }])

  const pending: GameState = { ...initial, pending: { type: 'StopOrContinue' } }
  expect(legalCommands(pending, ctx())).toEqual([])

  // Con decisión pendiente, un comando ⇒ EngineError tipado PENDING_DECISION.
  const rejected = applyCommand(pending, { type: 'Roll' }, ctx())
  expect(rejected.ok).toBe(false)
  if (!rejected.ok) {
    expect(rejected.error).toBeInstanceOf(EngineError)
    expect(rejected.error.code).toBe('PENDING_DECISION')
  }

  // Comando desconocido (p. ej. de un save corrupto) ⇒ ILLEGAL_COMMAND tipado.
  const bogus = applyCommand(initial, { type: 'NoExiste' } as unknown as Command, ctx())
  expect(bogus.ok).toBe(false)
  if (!bogus.ok) expect(bogus.error.code).toBe('ILLEGAL_COMMAND')
})
