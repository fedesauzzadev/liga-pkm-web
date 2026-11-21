// AC: SPEC-D/T-032d/AC-2 - turno típico de ataque ≤ 3,5 s a 1× y ≤ 1,5 s a 2×;
// `skip` ⇒ estado visual final idéntico. AC-4 - ninguna animación modifica estado
// del juego (deps congelados: ni las cartas ni el roster se mutan).
import { parseCardId, parsePlayerId, type PokemonCard } from '@liga/content'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { GameEvent } from '@liga/engine'
import { createHarness, playAll, testDeps, uids } from './testkit'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

const attackTurn = (): readonly GameEvent[] => [
  { type: 'AttackUsed', attacker: uids.squirtle, attackId: 'cabezazo', target: uids.poliwag },
  { type: 'DamageTaken', pkmUid: uids.poliwag, amount: 20, cause: 'attack' },
]

const start = (): GameEvent => ({
  type: 'BattleStarted', player: parsePlayerId('p1'), kind: 'wild',
  rival: parseCardId('poliwag'), active: uids.squirtle,
})

/** Corre una secuencia y devuelve el tiempo virtual (ms) hasta resolver todo. */
const runTimed = async (speed: '1x' | '2x' | 'skip', events: readonly GameEvent[]): Promise<number> => {
  const h = createHarness({ speed })
  const t0 = Date.now()
  let resolved = false
  const run = (async () => {
    for (const event of events) await h.choreo.play(event)
  })()
  void run.then(() => {
    resolved = true
  })
  let guard = 0
  while (!resolved && guard < 40_000) {
    await vi.advanceTimersByTimeAsync(25)
    guard += 25
  }
  await run
  return Date.now() - t0
}

test('AC: SPEC-D/T-032d/AC-2 - un turno de ataque completa dura ≤ 3,5 s a 1×', async () => {
  const elapsed = await runTimed('1x', attackTurn())
  expect(elapsed).toBeLessThanOrEqual(3500)
})

test('AC: SPEC-D/T-032d/AC-2 - un turno de ataque completa dura ≤ 1,5 s a 2×', async () => {
  const elapsed = await runTimed('2x', attackTurn())
  expect(elapsed).toBeLessThanOrEqual(1500)
})

test('AC: SPEC-D/T-032d/AC-2 - skip: sin esperas y el estado visual final es idéntico al de 1×', async () => {
  const fullBattle = (): readonly GameEvent[] => [
    start(),
    { type: 'DieRolled', purpose: 'attackSelect', value: 3 },
    { type: 'AttackUsed', attacker: uids.squirtle, attackId: 'cabezazo', target: uids.poliwag },
    { type: 'DamageTaken', pkmUid: uids.poliwag, amount: 20, cause: 'attack' },
    { type: 'AttackUsed', attacker: uids.poliwag, attackId: 'embestida', target: uids.squirtle },
    { type: 'DamageTaken', pkmUid: uids.squirtle, amount: 20, cause: 'attack' },
    { type: 'Healed', pkmUid: uids.squirtle, amount: 20, cause: 'potion' },
    { type: 'DamageTaken', pkmUid: uids.poliwag, amount: 30, cause: 'attack' },
    { type: 'PokemonFainted', pkmUid: uids.poliwag },
    { type: 'XpGained', pkmUid: uids.squirtle, amount: 1 },
    { type: 'BattleEnded', player: parsePlayerId('p1'), result: 'won' },
  ]
  const elapsed = await runTimed('skip', fullBattle())
  // Sin esperas: solo el primer paso de flush del loop de avance (≤ un quantum).
  expect(elapsed).toBeLessThanOrEqual(25)

  const normal = createHarness({ speed: '1x' })
  const skipped = createHarness({ speed: 'skip' })
  await playAll(normal.choreo, fullBattle())
  for (const event of fullBattle()) await skipped.choreo.play(event)
  expect(JSON.stringify(skipped.choreo.stage)).toBe(JSON.stringify(normal.choreo.stage))
  expect(skipped.fx).toEqual(normal.fx)
})

test('AC: SPEC-D/T-032d/AC-2 - reducedMotion: transiciones instantáneas', async () => {
  const h = createHarness({ reducedMotion: true })
  const t0 = Date.now()
  for (const event of attackTurn()) await h.choreo.play(event)
  expect(Date.now() - t0).toBe(0)
})

const deepFreeze = (value: unknown): void => {
  if (typeof value !== 'object' || value === null) return
  Object.freeze(value)
  for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key])
}

test('AC: SPEC-D/T-032d/AC-4 - ninguna animación modifica estado del juego (contenido y roster congelados)', async () => {
  const cardsBefore = JSON.stringify(testDeps.cardOf('squirtle'))
  deepFreeze(testDeps)
  const h = createHarness()
  // El coreógrafo no recibe GameState: solo deps de solo lectura. Si una
  // animación intentara mutar las cartas, Object.freeze lanzaría en modo estricto.
  for (const event of [
    start(),
    { type: 'AttackUsed', attacker: uids.squirtle, attackId: 'cabezazo', target: uids.poliwag },
    { type: 'DamageTaken', pkmUid: uids.poliwag, amount: 20, cause: 'attack' },
    { type: 'PokemonFainted', pkmUid: uids.poliwag },
  ] as const) {
    const run = h.choreo.play(event)
    await vi.advanceTimersByTimeAsync(120_000)
    await run
  }
  const card = testDeps.cardOf('squirtle') as PokemonCard | undefined
  expect(card).toBeDefined()
  expect(JSON.stringify(card)).toBe(cardsBefore)
})
