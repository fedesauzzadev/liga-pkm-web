// AC: SPEC-H/T-067/AC-2 y AC-5 — glifos: pintura estructural dentro del canvas
// 128×128, mapeo nodo→glifo (símbolo del mazo desde deck-stacks.json),
// legibilidad en la cámara de seguimiento y cacheo de texturas (una sola
// creación). Todo numérico/estructural (NO-VISION).
import { expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { cameraPresets } from './camera'
import { GLYPH_IDS, glyphIdFor, paintGlyph, projectedPx, type GlyphId, type GlyphPainter } from './glyph'
import { deckStacks } from './stacks'
import { BOARD3D } from '../theme/board3d'

class RecordingPainter implements GlyphPainter {
  readonly nums: number[] = []
  readonly texts: string[] = []
  fillStyle: string | CanvasGradient | CanvasPattern | null = null
  font = ''
  textAlign = ''
  textBaseline = ''

  fillText(text: string, x: number, y: number): void {
    this.texts.push(text)
    this.nums.push(x, y)
  }

  beginPath(): void {}
  closePath(): void {}
  fill(): void {}
  arc(x: number, y: number, radius: number): void {
    this.nums.push(x, y, radius)
  }

  moveTo(x: number, y: number): void {
    this.nums.push(x, y)
  }

  lineTo(x: number, y: number): void {
    this.nums.push(x, y)
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.nums.push(x, y, w, h)
  }
}

test('AC: SPEC-H/T-067/AC-2 - cada glifo pinta con coordenadas finitas dentro del canvas', () => {
  const px = BOARD3D.glyph.px
  for (const id of GLYPH_IDS) {
    const painter = new RecordingPainter()
    paintGlyph(painter, id, px, BOARD3D.glyph.ink, BOARD3D.node.stoneColor)
    expect(painter.nums.length, `${id} pinta algo`).toBeGreaterThan(0)
    for (const value of painter.nums) {
      expect(Number.isFinite(value), `${id} sin NaN`).toBe(true)
      expect(value, `${id} dentro del canvas`).toBeGreaterThanOrEqual(-1)
      expect(value, `${id} dentro del canvas`).toBeLessThanOrEqual(px + 1)
    }
  }
  const question = new RecordingPainter()
  paintGlyph(question, 'question', px, BOARD3D.glyph.ink, BOARD3D.node.stoneColor)
  expect(question.texts).toEqual(['?'])
  expect(question.textAlign).toBe('center')
})

test('AC: SPEC-H/T-067/AC-2 - glyphIdFor: tipos con glifo propio y deck con el símbolo del mazo', () => {
  expect(glyphIdFor({ type: 'centro' })).toBe('cross')
  expect(glyphIdFor({ type: 'mercado' })).toBe('bag')
  expect(glyphIdFor({ type: 'oak' })).toBe('mortarboard')
  expect(glyphIdFor({ type: 'gym' })).toBe('shield')
  expect(glyphIdFor({ type: 'empty' })).toBe('pokeball')
  expect(glyphIdFor({ type: 'sorpresa' })).toBe('question')
  expect(glyphIdFor({ type: 'liga' })).toBe('star')
  expect(glyphIdFor({ type: 'start' })).toBe('house')
  expect(glyphIdFor({ type: 'duelo' })).toBe('duel')
  for (const panel of deckStacks.panels) {
    expect(glyphIdFor({ type: 'deck', deck: panel.deck }), `deck ${panel.deck}`).toBe(panel.symbol as GlyphId)
  }
  expect(glyphIdFor({ type: 'inventado' })).toBeNull()
})

test('AC: SPEC-H/T-067/AC-5 - glifo ≥ 80 px a 1080p con la cámara de seguimiento (fov 55, distancia 2,6)', () => {
  const { fov, distance } = cameraPresets.follow
  expect(projectedPx(BOARD3D.glyph.size, distance, fov, 1080)).toBeGreaterThanOrEqual(80)
  // Fórmula: tamaño_mundo × alto_px / (2·tan(fov/2)·distancia).
  expect(projectedPx(1, 2.6, 55, 1080)).toBeCloseTo(1080 / (2 * Math.tan((55 * Math.PI) / 360) * 2.6), 9)
})

test('AC: SPEC-H/T-067/AC-6 - textura de glifo creada una sola vez (cache de módulo)', async () => {
  const created: unknown[] = []
  const fakeCanvas = (): { width: number; height: number; getContext: () => RecordingPainter } => ({
    width: 0,
    height: 0,
    getContext: () => new RecordingPainter(),
  })
  vi.stubGlobal('document', {
    createElement: () => {
      const canvas = fakeCanvas()
      created.push(canvas)
      return canvas
    },
  })
  try {
    vi.resetModules()
    const { makeGlyphTexture } = await import('./glyph-textures')
    const first = makeGlyphTexture('star')
    const second = makeGlyphTexture('star')
    expect(second).toBe(first)
    expect(created.length).toBe(1)
    expect(first).toBeInstanceOf(THREE.Texture)
  } finally {
    vi.unstubAllGlobals()
  }
})
