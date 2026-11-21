// AC: SPEC-S/T-102a — lector de escaneos, base: normalización (EXIF, bordes,
// autoDeskew, 700×1060), segmentación por líneas (encabezado/arte/separadores/
// línea del pie/pie + bloques de ataque y especialidad), PNG de debug, caché
// por hash, --resume, concurrencia y aislamiento de errores. Imágenes
// sintéticas dibujadas por código; la carta de oro (Dratini) solo si existe
// tools/cards-scan/fixtures/dratini.jpg (AC-5).
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import sharp from 'sharp'
import { syntheticCard } from '../tools/cards-scan/synth.ts'
import { normalizeScan } from '../tools/cards-scan/image.ts'
import { segmentCard } from '../tools/cards-scan/segment.ts'
import { scanBatch } from '../tools/cards-scan/run.ts'
import type { OcrEngine } from '../tools/cards-scan/ocr.ts'

// T-102b: el lote ahora hace OCR; estos tests de T-102a inyectan un motor
// falso para no depender de la caché/red de tesseract (deterministas offline).
const fakeEngine: OcrEngine = {
  recognize: async () => ({ text: 'x', confidence: 0.5 }),
  terminate: async () => undefined,
}

const FIXTURE = fileURLToPath(new URL('../tools/cards-scan/fixtures/dratini.jpg', import.meta.url))

// AC: SPEC-S/T-102a/AC-1 — lee JPG/PNG, aplica EXIF, detecta bordes, corrige
// la inclinación (autoDeskew) y normaliza a 700×1060; si la imagen no parece
// una carta (proporción fuera de ±4 %) la marca error sin lanzar.
test('AC: SPEC-S/T-102a/AC-1 normaliza 700×1060, deskew y rechaza no-cartas', async () => {
  const directa = await syntheticCard({ attacks: 2 })
  const norm = await normalizeScan(directa)
  expect(norm.ok).toBe(true)
  if (!norm.ok) return
  expect(norm.width).toBe(700)
  expect(norm.height).toBe(1060)
  expect(Math.abs(norm.angle)).toBeLessThan(0.4) // ya está derecha

  const rotada = await syntheticCard({ attacks: 2, pad: { deg: 1.5 } })
  const norm2 = await normalizeScan(rotada)
  expect(norm2.ok).toBe(true)
  if (!norm2.ok) return
  expect(norm2.width).toBe(700)
  expect(norm2.height).toBe(1060)
  expect(Math.abs(norm2.angle - 1.5)).toBeLessThan(0.5) // detectó la inclinación

  const noCarta = await sharp({ create: { width: 600, height: 300, channels: 3, background: '#404040' } })
    .png()
    .toBuffer()
  const mala = await normalizeScan(noCarta)
  expect(mala.ok).toBe(false)
  if (mala.ok) return
  expect(mala.error).toMatch(/carta/)
})

// AC: SPEC-S/T-102a/AC-2 — segmenta por líneas (no coordenadas fijas):
// encabezado, arte, separadores rojo-oscuro, línea negra gruesa del pie, pie,
// y los rectángulos de cada bloque de ataque (1 a 4) y de la especialidad
// previa si existe.
test('AC: SPEC-S/T-102a/AC-2 segmenta por líneas: bloques, especialidad y pie', async () => {
  const conEspecialidad = await normalizeScan(await syntheticCard({ attacks: 2, specialty: true }))
  expect(conEspecialidad.ok).toBe(true)
  if (!conEspecialidad.ok) return
  const seg = await segmentCard(conEspecialidad.png)
  expect(seg.ok).toBe(true)
  if (!seg.ok) return
  const s = seg.segmentation
  expect(s.header.y + s.header.h).toBeGreaterThan(60) // línea bajo el encabezado
  expect(s.header.y + s.header.h).toBeLessThan(95)
  expect(s.art.y).toBeGreaterThanOrEqual(s.header.y + s.header.h)
  expect(s.art.h).toBeGreaterThan(340)
  expect(s.art.h).toBeLessThan(420)
  expect(s.specialty).not.toBeNull()
  expect(s.attacks.length).toBe(2)
  expect(s.separators.length).toBeGreaterThanOrEqual(2) // specialty|atk1 y atk1|atk2
  expect(s.footerLine.y).toBeGreaterThan(925)
  expect(s.footerLine.y).toBeLessThan(955)
  expect(s.footer.y).toBeGreaterThanOrEqual(s.footerLine.y + s.footerLine.h)
  expect(s.footer.y + s.footer.h).toBeLessThanOrEqual(1060)
  // Los bloques quedan ordenados y sin solaparse.
  const bloques = s.specialty !== null ? [s.specialty, ...s.attacks] : [...s.attacks]
  for (let i = 1; i < bloques.length; i++) {
    const prev = bloques[i - 1]
    if (prev !== undefined) expect(bloques[i]!.y).toBeGreaterThan(prev.y + prev.h - 1)
  }

  // 4 ataques sin especialidad (límite superior 1-4).
  const cuatro = await normalizeScan(await syntheticCard({ attacks: 4 }))
  expect(cuatro.ok).toBe(true)
  if (!cuatro.ok) return
  const seg4 = await segmentCard(cuatro.png)
  expect(seg4.ok).toBe(true)
  if (!seg4.ok) return
  expect(seg4.segmentation.attacks.length).toBe(4)
  expect(seg4.segmentation.specialty).toBeNull()
})

// AC: SPEC-S/T-102a/AC-3 — escribe scan-reports/debug/<archivo>.png con la
// imagen normalizada y los rectángulos dibujados y numerados.
test('AC: SPEC-S/T-102a/AC-3 debug PNG con rectángulos numerados', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 't102a-dbg-'))
  try {
    writeFileSync(join(tmp, 'prueba.jpg'), await syntheticCard({ attacks: 3 }))
    const res = await scanBatch({ input: tmp, outDir: tmp, engine: fakeEngine })
    expect(res.ok).toBe(true)
    const debug = join(tmp, 'debug', 'prueba.png')
    expect(existsSync(debug)).toBe(true)
    const meta = await sharp(debug).metadata()
    expect(meta.width).toBe(700)
    expect(meta.height).toBe(1060)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-S/T-102a/AC-4 — caché por hash (.cache), --resume omite lo ya
// procesado, concurrencia configurable, un error en una imagen no detiene el
// lote y el código de salida es 0 si al menos una carta se procesó, con
// resumen procesadas / con revisión / con error.
test('AC: SPEC-S/T-102a/AC-4 caché, resume, concurrencia y aislamiento de errores', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 't102a-run-'))
  try {
    writeFileSync(join(tmp, 'buena.png'), await syntheticCard({ attacks: 1 }))
    const noCarta = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#303030' } })
      .jpeg()
      .toBuffer()
    writeFileSync(join(tmp, 'mala.jpg'), noCarta)

    const r1 = await scanBatch({ input: tmp, outDir: tmp, concurrency: 2, engine: fakeEngine })
    expect(r1.total).toBe(2)
    expect(r1.processed).toBe(1)
    expect(r1.errors).toBe(1)
    expect(r1.ok).toBe(true) // al menos una procesada
    expect(r1.lines.join('\n')).toMatch(/1 procesada/)
    expect(existsSync(join(tmp, 'debug', 'buena.png'))).toBe(true)
    expect(existsSync(join(tmp, 'debug', 'mala.png'))).toBe(false)
    const cache = readdirSync(join(tmp, '.cache')).filter((f) => f.endsWith('.json'))
    expect(cache.length).toBe(2) // ok y error se cachean

    const r2 = await scanBatch({ input: tmp, outDir: tmp, resume: true, engine: fakeEngine })
    expect(r2.cached).toBe(2)
    expect(r2.processed).toBe(0)
    expect(r2.ok).toBe(true)

    const r3 = await scanBatch({ input: tmp, outDir: tmp, resume: true, concurrency: 4, engine: fakeEngine })
    expect(r3.cached).toBe(2) // el hash no cambió ⇒ sigue en caché

    // Sin --resume reprocesa (idempotente: mismo resultado).
    const r4 = await scanBatch({ input: tmp, outDir: tmp, engine: fakeEngine })
    expect(r4.processed).toBe(1)
    expect(r4.errors).toBe(1)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-S/T-102a/AC-5 — la carta de oro (Dratini) segmenta 3 ataques sin
// especialidad, con las líneas donde las medimos (encabezado ~6.8 %, fin de
// arte ~44.9 %, separadores ~58.0 % y ~75.7 %, línea del pie ~89.3 % de la
// altura). Se omite si no existe el fixture (fotos reales, gitignored).
const tieneFixture = existsSync(FIXTURE)
test.skipIf(!tieneFixture)('AC: SPEC-S/T-102a/AC-5 carta de oro: Dratini 3 ataques', async () => {
  const { readFileSync } = await import('node:fs')
  const norm = await normalizeScan(readFileSync(FIXTURE))
  expect(norm.ok).toBe(true)
  if (!norm.ok) return
  const seg = await segmentCard(norm.png)
  expect(seg.ok).toBe(true)
  if (!seg.ok) return
  const s = seg.segmentation
  expect(s.attacks.length).toBe(3)
  expect(s.specialty).toBeNull()
  expect(s.separators.length).toBe(2)
  expect(s.header.y + s.header.h).toBeGreaterThan(54)
  expect(s.header.y + s.header.h).toBeLessThan(92)
  const artLine = s.art.y + s.art.h
  expect(artLine).toBeGreaterThan(456)
  expect(artLine).toBeLessThan(496)
  const sep1 = s.separators[0]
  const sep2 = s.separators[1]
  expect(sep1?.y).toBeGreaterThan(593)
  expect(sep1?.y).toBeLessThan(637)
  expect(sep2?.y).toBeGreaterThan(780)
  expect(sep2?.y).toBeLessThan(824)
  expect(s.footerLine.y).toBeGreaterThan(927)
  expect(s.footerLine.y).toBeLessThan(967)
})

// AC: SPEC-S/T-102a/AC-1 (Q-078) — el bbox mide el mayor bloque CONTIGUO
// denso (la carta): las franjas de ruido del escáner (tapa/sombra en los
// bordes de la imagen) quedan fuera aunque tengan píxeles "lit", porque
// están separadas de la carta por fondo (patrón Mew S / Monkey del lote).
test('AC: SPEC-S/T-102a/AC-1 bbox refinado ignora franjas de ruido (Q-078)', async () => {
  const conFranjas = await syntheticCard({
    attacks: 2,
    bg: { color: '#3a2446', marginX: 12, marginY: 32, strips: true },
  })
  const norm = await normalizeScan(conFranjas)
  expect(norm.ok).toBe(true)
  if (!norm.ok) {
    throw new Error(`debería normalizar: ${norm.error}`)
  }
  expect(norm.width).toBe(700)
  expect(norm.height).toBe(1060)
})

// AC: SPEC-S/T-102a/AC-1 (Q-078) — el deskew rota con el color de fondo REAL
// del escaneo (mediana del marco pre-rotación): las cuñas que inyecta la
// rotación quedan del color del fondo y no cuentan como contenido (patrón
// Metapod Evo A / Seadra del lote, cartas que llenan el encuadre).
test('AC: SPEC-S/T-102a/AC-1 deskew sobre fondo oscuro no infla el bbox (Q-078)', async () => {
  const rotada = await syntheticCard({
    attacks: 2,
    bg: { color: '#3a2446', marginX: 12, marginY: 32 },
    pad: { deg: 1.5 },
  })
  const norm = await normalizeScan(rotada)
  expect(norm.ok).toBe(true)
  if (!norm.ok) {
    throw new Error(`debería normalizar: ${norm.error}`)
  }
  expect(norm.width).toBe(700)
  expect(norm.height).toBe(1060)
  expect(Math.abs(norm.angle - 1.5)).toBeLessThan(0.5)
})

// Sanity extra del generador: la síntesis con especialidad + 2 ataques produce
// 3 bloques que el segmentador numera en orden (E antes que los ataques).
test('AC: SPEC-S/T-102a/AC-2 los bloques numerados respetan el orden de lectura', async () => {
  const norm = await normalizeScan(await syntheticCard({ attacks: 2, specialty: true }))
  if (!norm.ok) throw new Error('normalización falló')
  const seg = await segmentCard(norm.png)
  if (!seg.ok) throw new Error(seg.error)
  const kinds = seg.segmentation.blocks.map((b) => b.kind)
  expect(kinds).toEqual(['specialty', 'attack', 'attack'])
})
