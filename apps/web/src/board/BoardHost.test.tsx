// AC: SPEC-G/T-062/AC-8 — BoardHost: selector 2D/3D y fallback automático al
// tablero SVG cuando no hay WebGL. El camino 3D vivo se verifica en navegador
// (T-066); acá la decisión es una función pura (decideBoard).
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { hasWebGl } from '../board3d/webgl'
import { decideBoard, BoardHost } from './BoardHost'
import { es } from '../i18n/es'

test('AC: SPEC-G/AC-8 - decideBoard: 2D manual, 3D si hay WebGL, fallback si no', () => {
  expect(decideBoard('2d', true)).toBe('2d')
  expect(decideBoard('2d', false)).toBe('2d')
  expect(decideBoard('3d', true)).toBe('3d')
  expect(decideBoard('3d', false)).toBe('fallback2d')
})

test('AC: SPEC-G/AC-8 - sin WebGL (node) el modo 3D cae al tablero 2D con aviso', () => {
  expect(hasWebGl()).toBe(false)
  const html = renderToString(<BoardHost boardMode="3d" position="paleta" pending={null} />)
  expect(html).toContain('data-testid="board-2d"')
  expect(html).toContain(es.board3dFallback)
})

test('AC: SPEC-G/AC-8 - el selector manual 2D renderiza el tablero SVG sin aviso', () => {
  const html = renderToString(<BoardHost boardMode="2d" position="paleta" pending={null} />)
  expect(html).toContain('data-testid="board-2d"')
  expect(html).not.toContain(es.board3dFallback)
})
