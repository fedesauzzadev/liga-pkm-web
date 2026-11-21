// AC: SPEC-H/T-069/AC-6 — perfil bajo automático: baja (y no vuelve) si el FPS
// queda bajo el umbral durante lowFpsSeconds; el relleno baja a la mitad y el
// estado queda registrado para el reporte de bug (debug/session).
import { expect, test } from 'vitest'
import { recordPerf, readDebugSession } from '../debug/session'
import { fillScaleFor, initialPerfProfile, perfSample } from './perf-profile'

test('AC: SPEC-H/T-069/AC-6 - baja tras 3 s bajo el umbral y no se recupera solo', () => {
  let state = initialPerfProfile
  state = perfSample(state, 30, 0, 40, 3)
  expect(state.low).toBe(false)
  state = perfSample(state, 30, 2999, 40, 3)
  expect(state.low).toBe(false)
  state = perfSample(state, 30, 3000, 40, 3)
  expect(state.low).toBe(true)
  state = perfSample(state, 60, 5000, 40, 3)
  expect(state.low).toBe(true)
  expect(state.belowSince).toBeNull()
})

test('AC: SPEC-H/T-069/AC-6 - sobre el umbral solo reinicia el acumulador', () => {
  let state = perfSample(initialPerfProfile, 30, 0, 40, 3)
  state = perfSample(state, 60, 1000, 40, 3)
  expect(state).toEqual({ belowSince: null, low: false })
})

test('AC: SPEC-H/T-069/AC-6 - relleno de zonas (T-068) a la mitad en perfil bajo', () => {
  expect(fillScaleFor(false)).toBe(1)
  expect(fillScaleFor(true)).toBeCloseTo(0.5, 12)
})

test('AC: SPEC-H/T-069/AC-6 - queda registrado en la sesión que alimenta exportBugReport', () => {
  recordPerf({ lowProfile: true, fps: 33 })
  expect(readDebugSession().perf).toEqual({ lowProfile: true, fps: 33 })
  recordPerf({ lowProfile: false, fps: null })
})
