// Tests T-066 (SPEC-G/T-066): parte pura de `pnpm shots` (tools/shots-lib.ts).
// El driver con navegador (e2e/t066-shots.mjs) se valida corriendo `pnpm shots`;
// acá se cubre el catálogo, las métricas y el README autogenerado.
import { expect, test } from 'vitest'
import { deflateSync } from 'node:zlib'
import {
  BASE_SCENES,
  decodePng,
  evaluateShot,
  expectationsFor,
  regionVariance,
  renderReadme,
  SHOT_SCENES,
  SHOT_SIZES,
  SHOT_THRESHOLDS,
  shotFile,
  sizeLabel,
  type ShotMetrics,
  type ShotRecord,
} from '../tools/shots-lib.ts'

// ── Encoder PNG mínimo (filtros "none") para fabricar entradas del decoder. ──

const crcTable: readonly number[] = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** PNG 8-bit de `channels` (4=RGBA, 3=RGB, 1=gris), scanlines sin filtro. */
function encodePng(width: number, height: number, channels: number, pixels: Uint8Array): Uint8Array {
  const row = width * channels
  const raw = new Uint8Array((row + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw.set([0], y * (row + 1))
    raw.set(pixels.subarray(y * row, (y + 1) * row), y * (row + 1) + 1)
  }
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr[8] = 8
  ihdr[9] = channels === 4 ? 6 : channels === 3 ? 2 : 0
  const signature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const parts = [
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', new Uint8Array(deflateSync(raw))),
    pngChunk('IEND', new Uint8Array(0)),
  ]
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

const rgba = (pixels: readonly (readonly [number, number, number])[]): Uint8Array =>
  Uint8Array.from(pixels.flatMap(([r, g, b]) => [r, g, b, 255]))

// AC: SPEC-G/T-066/AC-1 — catálogo: escenas exigidas × ambos tamaños, con
// nombres de archivo deterministas (shots/<w>x<h>/<escena>.png).
test('AC-1 - catálogo de capturas completo y con nombres deterministas', () => {
  expect(SHOT_SIZES).toEqual([
    { w: 1280, h: 800 },
    { w: 1440, h: 900 },
  ])
  for (const scene of BASE_SCENES) expect(SHOT_SCENES).toContain(scene)
  expect(SHOT_SCENES.filter((scene) => scene.startsWith('tile-')).length).toBeGreaterThanOrEqual(10)
  const files = new Set<string>()
  for (const scene of SHOT_SCENES) {
    for (const size of SHOT_SIZES) {
      const file = shotFile(scene, size)
      expect(file).toBe(`shots/${sizeLabel(size)}/${scene}.png`)
      files.add(file)
    }
  }
  expect(files.size).toBe(SHOT_SCENES.length * SHOT_SIZES.length)
})

// AC: SPEC-G/T-066/AC-2 — canvas no vacío: varianza de píxeles por región sobre
// PNGs decodificados en node (color plano ⇒ 0, contenido ⇒ por encima del
// umbral), incluyendo variantes RGB/gris del decoder.
test('AC-2 - varianza de píxeles distingue canvas vacío de canvas dibujado', () => {
  const flat = decodePng(encodePng(8, 8, 4, new Uint8Array(8 * 8 * 4).fill(90)))
  expect(flat.width).toBe(8)
  expect(flat.height).toBe(8)
  expect(regionVariance(flat, { x: 0, y: 0, w: 8, h: 8 })).toBe(0)

  const rows = Array.from({ length: 64 }, (_, i) =>
    Math.floor(i / 8) % 2 === 0 ? ([0, 0, 0] as const) : ([255, 255, 255] as const),
  )
  const striped = decodePng(encodePng(8, 8, 4, rgba(rows)))
  expect(regionVariance(striped, { x: 0, y: 0, w: 8, h: 8 })).toBeGreaterThan(
    SHOT_THRESHOLDS.minVariance,
  )
  // Región parcial sobre una sola franja ⇒ vuelve a ser plano.
  expect(regionVariance(striped, { x: 0, y: 0, w: 8, h: 1 })).toBe(0)

  const rgb = decodePng(encodePng(2, 1, 3, Uint8Array.from([255, 0, 0, 255, 0, 0])))
  expect(Array.from(rgb.data.subarray(0, 4))).toEqual([255, 0, 0, 255])
  const gray = decodePng(encodePng(2, 1, 1, Uint8Array.from([128, 128])))
  expect(Array.from(gray.data.subarray(0, 4))).toEqual([128, 128, 128, 255])
  expect(() => decodePng(new Uint8Array([1, 2, 3, 4]))).toThrow(/PNG/)
})

// AC: SPEC-G/T-066/AC-2 — veredicto por captura: umbral de varianza, ancho del
// tablero (con la excepción documentada del 2D desktop), hitos y consola.
test('AC-2 - evaluateShot aplica umbrales, hitos y errores de consola', () => {
  const good: ShotMetrics = {
    pixelVariance: 120,
    boardWidthPct: 80,
    milestones: [{ name: 'nodos', inViewport: true }],
    consoleErrors: 0,
  }
  const idle390 = expectationsFor('board-idle', { w: 390, h: 844 })
  expect(evaluateShot(good, idle390).ok).toBe(true)
  expect(evaluateShot({ ...good, pixelVariance: SHOT_THRESHOLDS.minVariance }, idle390).ok).toBe(true)
  expect(evaluateShot({ ...good, pixelVariance: 29.9 }, idle390).failures.join()).toMatch(/varianza/)
  expect(evaluateShot({ ...good, boardWidthPct: 59.9 }, idle390).failures.join()).toMatch(/ancho/)
  expect(
    evaluateShot({ ...good, milestones: [...good.milestones, { name: 'ficha', inViewport: false }] }, idle390)
      .failures.join(),
  ).toMatch(/ficha/)
  expect(evaluateShot({ ...good, milestones: [] }, idle390).failures.join()).toMatch(/hitos/)
  expect(evaluateShot({ ...good, consoleErrors: 2 }, idle390).failures.join()).toMatch(/consola/)
  expect(evaluateShot({ ...good, pixelVariance: null, boardWidthPct: null }, idle390).ok).toBe(false)

  // 2D desktop: capado a 540 px por diseño (Board.module.css) ⇒ umbral 35 %.
  const fallback1440 = expectationsFor('board-2d-fallback', { w: 1440, h: 900 })
  expect(fallback1440.minBoardPct).toBe(35)
  expect(evaluateShot({ ...good, boardWidthPct: 37 }, fallback1440).ok).toBe(true)
  expect(evaluateShot({ ...good, boardWidthPct: 37 }, expectationsFor('board-idle', { w: 1440, h: 900 })).ok).toBe(
    false,
  )
  expect(expectationsFor('board-2d-fallback', { w: 390, h: 844 }).minBoardPct).toBe(60)
})

const fakeRecords: readonly ShotRecord[] = SHOT_SCENES.flatMap((scene) =>
  SHOT_SIZES.map((size) => ({
    scene,
    size: sizeLabel(size),
    file: shotFile(scene, size),
    metrics: {
      pixelVariance: 500,
      boardWidthPct: 90,
      milestones: [{ name: 'nodos', inViewport: true }],
      consoleErrors: 0,
    },
    ok: true,
    failures: [],
  })),
)

// AC: SPEC-G/T-066/AC-3 — README autogenerado con "qué mirar": 3 preguntas
// concretas por captura y los archivos de ambos tamaños listados.
test('AC-3 - README con 3 preguntas concretas por captura y archivos listados', () => {
  const readme = renderReadme(fakeRecords)
  for (const scene of SHOT_SCENES) {
    const section = readme.match(new RegExp(`## ${scene} —[\\s\\S]*?(?=\n## |$)`))?.[0] ?? ''
    expect(section, `falta la sección de ${scene}`).not.toBe('')
    for (const size of SHOT_SIZES) expect(section).toContain(shotFile(scene, size))
    const questions = section
      .split('\n')
      .filter((line) => /^\d+\. ¿.+\?$/.test(line.trim()))
    expect(questions.length, `preguntas de ${scene}`).toBe(3)
  }
})

// AC: SPEC-G/T-066/AC-4 — el README le habla al dueño (mirar y responder con
// palabras) y manda los ajustes visuales a src/theme, no al código de la app.
test('AC-4 - README dirigido al dueño con ajustes en src/theme', () => {
  const readme = renderReadme(fakeRecords)
  expect(readme).toContain('respondé con palabras')
  expect(readme).toContain('src/theme/board3d.ts')
  expect(readme).toContain('pnpm shots')
})
