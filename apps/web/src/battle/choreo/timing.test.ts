// Q-099 (SPEC-D/T-032d/AC-2): `Timing` guarda los DOS ejes (velocidad y
// reducedMotion) y cada setter recomponga el factor con ambos. Antes solo
// guardaba el factor calculado: `BattleChoreographer.setReducedMotion` llamaba
// `setOptions('1x', reduced)` y pisaba la velocidad elegida ⇒ la coreografía
// del componente corría SIEMPRE a 1x (medido: BattleStarted con `skip` tardaba
// 1918 ms en vez de 0).
import { expect, test, vi } from 'vitest'
import { BattleChoreographer } from './BattleChoreographer'
import { testDeps } from './testkit'
import { Timing } from './timing'
import {
  DIE_EFFECT_DELAY_MS,
  DIE_FADE_MS,
  DIE_ROLL_SETTLE_MS,
  dieRollWaitMs,
  rollDurationMs,
} from '../dieTiming'

// AC: SPEC-D/T-032d/AC-2 - setReducedMotion(false) no pisa la velocidad: la
// coreografía del efecto corre setSpeed + setReducedMotion en ese orden.
test('AC: SPEC-D/T-032d/AC-2 - setReducedMotion no pisa la velocidad (skip sigue instantáneo)', () => {
  const timing = new Timing('1x', false)
  timing.setSpeed('skip')
  timing.setReducedMotion(false)
  expect(timing.ms(1000)).toBe(0)
})

// AC: SPEC-D/T-032d/AC-2 - en el otro orden: setSpeed no pisa reducedMotion.
test('AC: SPEC-D/T-032d/AC-2 - setSpeed no pisa reducedMotion', () => {
  const timing = new Timing('1x', false)
  timing.setReducedMotion(true)
  timing.setSpeed('2x')
  expect(timing.ms(1000)).toBe(0)
})

// AC: SPEC-D/T-032d/AC-2 - sin reducedMotion rige la velocidad elegida (2x ⇒ ½).
test('AC: SPEC-D/T-032d/AC-2 - reducedMotion=false + 2x ⇒ factor 0.5', () => {
  const timing = new Timing('1x', true)
  timing.setReducedMotion(false)
  timing.setSpeed('2x')
  expect(timing.ms(1000)).toBe(500)
  timing.setSpeed('1x')
  expect(timing.ms(1000)).toBe(1000)
})

// AC: SPEC-D/T-032d/AC-2 - con reducedMotion activo ninguna velocidad anima.
test('AC: SPEC-D/T-032d/AC-2 - reducedMotion=true ⇒ factor 0 con cualquier velocidad', () => {
  const timing = new Timing('2x', false)
  timing.setReducedMotion(true)
  expect(timing.ms(1000)).toBe(0)
  timing.setSpeed('2x')
  expect(timing.ms(1000)).toBe(0)
})

// AC: SPEC-D/T-032d/AC-2 - el coreógrafo (los setters que usa el componente)
// conserva ambos ejes sin importar el orden de las llamadas.
test('AC: SPEC-D/T-032d/AC-2 - BattleChoreographer: setSpeed y setReducedMotion no se pisan', () => {
  const choreo = new BattleChoreographer({ deps: testDeps, speed: '1x' })
  choreo.setSpeed('skip')
  choreo.setReducedMotion(false)
  expect(choreo.timing.ms(1000)).toBe(0)
  choreo.setSpeed('2x')
  choreo.setReducedMotion(false)
  expect(choreo.timing.ms(1000)).toBe(500)
  choreo.setReducedMotion(true)
  choreo.setSpeed('1x')
  expect(choreo.timing.ms(1000)).toBe(0)
})

// AC: arreglar-dados-combate/AC-4 - tirada y espera escalan JUNTAS: a 2x la
// espera del coreógrafo es la tirada real de 2x (mismo rollDurationMs + margen
// disparo→efecto + asentamiento), SIN el doble escalado del factor 0.5; skip
// no espera nada y reducedMotion solo pacinga el fundido (el dado corta ya).
test('AC: arreglar-dados-combate/AC-4 - dieRoll a 2x = tirada de 2x sin doble escalado; skip/reduced al instante', async () => {
  vi.useFakeTimers()
  try {
    const seed = 4
    const waitMs = dieRollWaitMs(seed, '2x', false)
    expect(waitMs).toBe(rollDurationMs(seed, '2x') + DIE_EFFECT_DELAY_MS + DIE_ROLL_SETTLE_MS)
    // La espera escala con la tirada (≈ mitad de 1x), no con el factor de Timing.
    expect(waitMs).toBeLessThan(rollDurationMs(seed, '1x'))
    let done = false
    void new Timing('2x', false).dieRoll(seed).then(() => {
      done = true
    })
    await vi.advanceTimersByTimeAsync(waitMs - 1)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toBe(true)
    // skip: sin espera.
    let skipped = false
    void new Timing('skip', false).dieRoll(seed).then(() => {
      skipped = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(skipped).toBe(true)
    // reducedMotion: solo el fundido de pacing.
    expect(dieRollWaitMs(seed, '1x', true)).toBe(DIE_FADE_MS)
  } finally {
    vi.useRealTimers()
  }
})
