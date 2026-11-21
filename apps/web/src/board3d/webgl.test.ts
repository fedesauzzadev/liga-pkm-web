// AC: SPEC-G/T-062/AC-8 — detección de WebGL para el fallback automático 2D.
import { expect, test } from 'vitest'
import { hasWebGl } from './webgl'

const fakeCanvas = (kind: 'webgl2' | 'webgl' | 'none') => ({
  getContext: (type: string): WebGLRenderingContext | null => {
    if (type === kind) return {} as WebGLRenderingContext
    return null
  },
})

test('AC: SPEC-G/AC-8 - sin document (node/ssr) no hay WebGL: fallback', () => {
  expect(hasWebGl()).toBe(false)
})

test('AC: SPEC-G/AC-8 - detecta webgl2, webgl y ausencia total', () => {
  expect(hasWebGl(() => fakeCanvas('webgl2'))).toBe(true)
  expect(hasWebGl(() => fakeCanvas('webgl'))).toBe(true)
  expect(hasWebGl(() => fakeCanvas('none'))).toBe(false)
  expect(hasWebGl(() => null)).toBe(false)
})

// T-066: los probes inyectados no tocan la caché del probe por defecto (sin
// caché, cada render de BoardHost crea un contexto WebGL vivo y Chromium
// termina perdiendo el del tablero).
test('AC: SPEC-G/T-066 - el probe por defecto se cachea y los inyectados no lo pisan', () => {
  expect(hasWebGl(() => fakeCanvas('webgl2'))).toBe(true)
  expect(hasWebGl()).toBe(false)
  expect(hasWebGl()).toBe(false)
})
