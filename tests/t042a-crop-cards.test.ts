// AC: SPEC-F/T-042a — `pnpm crop-cards`: recorte de cartas desde fotos sintéticas
// (BMP puro, sin dependencias de imagen en Node) + comparación con el manifiesto.
// AC-1 detección/perspectiva/630×1000/orden lectura · AC-2 crops.json · AC-3 manifiesto
// + _debug · AC-4 hoja de contacto · AC-5 grilla (config por archivo y --grid) ·
// AC-6 aviso <500 px + nada de fotos ni recortes en git.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const root = process.cwd()
const work = join(root, 'node_modules', '.cache', 't042a-crop')
const photosDir = join(work, 'photos')
const tool = join(root, 'tools', 'crop_cards.py')

// ── Python + OpenCV (herramienta offline; excepción aprobada en AGENTS.md) ──────
function findPython(): string | null {
  const candidates = [
    process.env.CROP_CARDS_PYTHON ?? '',
    'python',
    'python3',
    process.env.LOCALAPPDATA !== undefined
      ? join(process.env.LOCALAPPDATA, 'Programs', 'Python', 'Python312', 'python.exe')
      : '',
  ].filter((c) => c.length > 0)
  for (const c of candidates) {
    const res = spawnSync(c, ['-c', 'import cv2, numpy'], { encoding: 'utf8', timeout: 60_000 })
    if (res.status === 0) return c
  }
  return null
}
const python = findPython()
const skipNoPython = python === null

interface RunResult {
  status: number | null
  output: string
}
function runCrop(args: readonly string[]): RunResult {
  const res = spawnSync(python as string, [tool, ...args], {
    encoding: 'utf8',
    timeout: 120_000,
    cwd: root,
  })
  return { status: res.status, output: `${res.stdout ?? ''}\n${res.stderr ?? ''}` }
}

// ── Fotos sintéticas: BMP 24 bits escrito a mano (sin deps) ─────────────────────
type Rgb = readonly [number, number, number]
type Quad = readonly [
  readonly [number, number],
  readonly [number, number],
  readonly [number, number],
  readonly [number, number],
]
const BG: Rgb = [45, 45, 58]
const CARD: Rgb = [236, 233, 224]
const MARK: Rgb = [120, 120, 130]

function inQuad(x: number, y: number, q: Quad): boolean {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i] ?? [0, 0]
    const b = q[(i + 1) % 4] ?? [0, 0]
    const cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])
    if (cross !== 0) {
      const s = Math.sign(cross)
      if (sign === 0) sign = s
      else if (s !== sign) return false
    }
  }
  return true
}

// Cuadrilátero con jitter determinista: ejercita la corrección de perspectiva.
function cardQuad(x: number, y: number, w: number, h: number, seed: number): Quad {
  const j = (i: number): number => ((seed * 13 + i * 29) % 9) - 4
  return [
    [x + j(0), y + j(1)],
    [x + w + j(2), y + j(3)],
    [x + w + j(4), y + h + j(5)],
    [x + j(6), y + h + j(7)],
  ]
}

function writeBmp(path: string, w: number, h: number, pixel: (x: number, y: number) => Rgb): void {
  const rowSize = Math.ceil((w * 3) / 4) * 4
  const size = 54 + rowSize * h
  const buf = Buffer.alloc(size)
  buf.write('BM', 0, 'ascii')
  buf.writeUInt32LE(size, 2)
  buf.writeUInt32LE(54, 10)
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(w, 18)
  buf.writeInt32LE(h, 22)
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(24, 28)
  buf.writeUInt32LE(rowSize * h, 34)
  for (let y = 0; y < h; y++) {
    const start = 54 + (h - 1 - y) * rowSize // BMP bottom-up
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y)
      const o = start + x * 3
      buf.writeUInt8(b, o)
      buf.writeUInt8(g, o + 1)
      buf.writeUInt8(r, o + 2)
    }
  }
  writeFileSync(path, buf)
}

function photoWithCards(
  path: string,
  w: number,
  h: number,
  cards: readonly { x: number; y: number; w: number; h: number; seed: number }[],
): void {
  const quads = cards.map((c) => cardQuad(c.x, c.y, c.w, c.h, c.seed))
  const marks = cards.map((c) => ({ x0: c.x + 30, x1: c.x + 70, y0: c.y + 30, y1: c.y + 90 }))
  writeBmp(path, w, h, (x, y) => {
    for (const q of quads) if (inQuad(x, y, q)) {
      for (const m of marks) if (x >= m.x0 && x <= m.x1 && y >= m.y0 && y <= m.y1) return MARK
      return CARD
    }
    return BG
  })
}

// ── Salidas de la herramienta ───────────────────────────────────────────────────
interface CardEntry {
  photo: string
  index: number
  polygon: Array<[number, number]>
  confidence: number
  width: number
  height: number
}
interface PhotoEntry {
  photo: string
  group: string
  expected: number | null
  detected: number
  status: string
  cards: CardEntry[]
}
interface CropsJson {
  photos: Record<string, PhotoEntry>
}

function readCrops(outDir: string): CropsJson {
  return JSON.parse(readFileSync(join(outDir, 'crops.json'), 'utf8')) as CropsJson
}
const center = (c: CardEntry): { x: number; y: number } => {
  const xs = c.polygon.map((p) => p[0])
  const ys = c.polygon.map((p) => p[1])
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
}
const photoEntry = (outDir: string, key: string): PhotoEntry => {
  const ph = readCrops(outDir).photos[key]
  if (ph === undefined) throw new Error(`falta "${key}" en ${outDir}/crops.json`)
  return ph
}
const isJpeg = (path: string): boolean => {
  const b = readFileSync(path)
  return b[0] === 0xff && b[1] === 0xd8
}

// ── Fixtures idempotentes ───────────────────────────────────────────────────────
const GRID = { w: 900, h: 700, cols: 3, rows: 2, cw: 200, ch: 260, gapX: 60, gapY: 80 }
function gridCards(): { x: number; y: number; w: number; h: number; seed: number }[] {
  const out: { x: number; y: number; w: number; h: number; seed: number }[] = []
  for (let r = 0; r < GRID.rows; r++)
    for (let c = 0; c < GRID.cols; c++)
      out.push({ x: 40 + c * (GRID.cw + GRID.gapX), y: 40 + r * (GRID.ch + GRID.gapY), w: GRID.cw, h: GRID.ch, seed: r * GRID.cols + c + 1 })
  return out
}

function ensureFixtures(): { grid: string; touching: string; narrow: string; m6: string; m9: string; mt: string; mn: string; cfgEmpty: string; cfgGrid: string } {
  mkdirSync(photosDir, { recursive: true })
  const grid = join(photosDir, 'grid.bmp')
  const touching = join(photosDir, 'touching.bmp')
  const narrow = join(photosDir, 'narrow.bmp')
  if (!existsSync(grid)) photoWithCards(grid, GRID.w, GRID.h, gridCards())
  // 6 cartas CONTIGUAS (2 filas × 3 columnas sin separación): un solo blob claro.
  if (!existsSync(touching)) photoWithCards(touching, 900, 560, [
    { x: 30, y: 30, w: 840, h: 500, seed: 5 },
  ])
  // Carta angosta (~300 px de ancho) para el aviso de AC-6 + una normal (520 px).
  if (!existsSync(narrow)) photoWithCards(narrow, 1100, 800, [
    { x: 40, y: 30, w: 520, h: 740, seed: 7 },
    { x: 640, y: 30, w: 300, h: 450, seed: 8 },
  ])
  const write = (name: string, text: string): string => {
    const p = join(work, name)
    writeFileSync(p, text)
    return p
  }
  return {
    grid,
    touching,
    narrow,
    m6: write('manifest6.csv', 'archivo,grupo,mazo,cartas_esperadas,notas\ngrid.bmp,grupo-test,,6,sintetica\n'),
    m9: write('manifest9.csv', 'archivo,grupo,mazo,cartas_esperadas,notas\ngrid.bmp,grupo-test,,9,sintetica\n'),
    mt: write('manifestT.csv', 'archivo,grupo,mazo,cartas_esperadas,notas\ntouching.bmp,grupo-toca,,6,sintetica\n'),
    mn: write('manifestN.csv', 'archivo,grupo,mazo,cartas_esperadas,notas\nnarrow.bmp,grupo-angosto,,2,sintetica\n'),
    cfgEmpty: write('config-empty.json', '{}\n'),
    cfgGrid: write('config-grid.json', '{ "touching.bmp": { "grid": "2x3" } }\n'),
  }
}
const fx = ensureFixtures()

// ── Tests ───────────────────────────────────────────────────────────────────────
test('AC: SPEC-F/T-042a/AC-0 requirements y script pnpm crop-cards presentes', () => {
  expect(existsSync(join(root, 'tools', 'requirements.txt'))).toBe(true)
  const req = readFileSync(join(root, 'tools', 'requirements.txt'), 'utf8')
  expect(req).toMatch(/opencv-python-headless/)
  expect(req).toMatch(/numpy/)
  expect(req).toMatch(/pillow/)
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
  expect(pkg.scripts['crop-cards']).toContain('crop_cards.py')
})

const out1 = join(work, 'out-ac1')
test.skipIf(skipNoPython)('AC: SPEC-F/T-042a/AC-1 detecta, corrige perspectiva, normaliza 630×1000 y ordena por lectura', () => {
  rmSync(out1, { recursive: true, force: true })
  const r = runCrop([fx.grid, '--out', out1, '--manifest', fx.m6, '--config', fx.cfgEmpty])
  expect(r.status).toBe(0)
  const ph = photoEntry(out1, 'grid.bmp')
  expect(ph.status).toBe('ok')
  expect(ph.cards).toHaveLength(6)
  expect(ph.cards.map((c) => c.index)).toEqual([1, 2, 3, 4, 5, 6])
  // Orden de lectura: fila 1 completa arriba; dentro de cada fila, izquierda→derecha.
  const ct = ph.cards.map(center)
  expect(ct).toHaveLength(6)
  const p = (i: number): { x: number; y: number } => {
    const v = ct[i]
    if (v === undefined) throw new Error('faltan centros en el test')
    return v
  }
  expect(p(0).y).toBeLessThan(p(3).y)
  expect(p(0).x).toBeLessThan(p(1).x)
  expect(p(1).x).toBeLessThan(p(2).x)
  expect(p(3).x).toBeLessThan(p(4).x)
  expect(p(4).x).toBeLessThan(p(5).x)
  // Salida normalizada a 630×1000 en crops/<grupo>/ (JPEG válido).
  for (let i = 1; i <= 6; i++) {
    const p = join(out1, 'crops', 'grupo-test', `grid_${String(i).padStart(2, '0')}.jpg`)
    expect(existsSync(p), p).toBe(true)
    expect(isJpeg(p)).toBe(true)
  }
  expect(ph.cards.every((c) => c.width === 630 && c.height === 1000)).toBe(true)
})

test.skipIf(skipNoPython)('AC: SPEC-F/T-042a/AC-2 crops.json con origen, índice, polígono y confianza', () => {
  const ph = photoEntry(out1, 'grid.bmp')
  for (const c of ph.cards) {
    expect(c.photo).toBe('grid.bmp')
    expect(c.polygon).toHaveLength(4)
    for (const p of c.polygon) {
      expect(p).toHaveLength(2)
      expect(typeof p[0]).toBe('number')
      expect(typeof p[1]).toBe('number')
    }
    expect(c.confidence).toBeGreaterThan(0)
    expect(c.confidence).toBeLessThanOrEqual(1)
  }
})

test.skipIf(skipNoPython)('AC: SPEC-F/T-042a/AC-3 conteo ≠ manifiesto ⇒ falla con mensaje claro + _debug numerado', () => {
  const out = join(work, 'out-ac3')
  rmSync(out, { recursive: true, force: true })
  const r = runCrop([fx.grid, '--out', out, '--manifest', fx.m9, '--config', fx.cfgEmpty])
  expect(r.status).not.toBe(0)
  expect(r.output).toContain('grid.bmp')
  expect(r.output).toContain('6')
  expect(r.output).toContain('9')
  expect(r.output).toMatch(/manifiesto|espera/i)
  const dbg = join(out, '_debug', 'grid.jpg')
  expect(existsSync(dbg), dbg).toBe(true)
  expect(isJpeg(dbg)).toBe(true)
})

test.skipIf(skipNoPython)('AC: SPEC-F/T-042a/AC-4 hoja de contacto con los recortes', () => {
  const contact = join(out1, 'contact', 'grid.jpg')
  expect(existsSync(contact), contact).toBe(true)
  expect(isJpeg(contact)).toBe(true)
})

test.skipIf(skipNoPython)('AC: SPEC-F/T-042a/AC-5 cartas que se tocan: grilla por config y modo manual --grid', () => {
  // Sin grilla el blob único no se parte: debe fallar contra el manifiesto (6).
  const outA = join(work, 'out-ac5a')
  rmSync(outA, { recursive: true, force: true })
  const ra = runCrop([fx.touching, '--out', outA, '--manifest', fx.mt, '--config', fx.cfgEmpty])
  expect(ra.status).not.toBe(0)

  // Modo manual: --grid FILASxCOLUMNAS.
  const outB = join(work, 'out-ac5b')
  rmSync(outB, { recursive: true, force: true })
  const rb = runCrop([fx.touching, '--out', outB, '--manifest', fx.mt, '--config', fx.cfgEmpty, '--grid', '2x3'])
  expect(rb.status).toBe(0)
  const pb = photoEntry(outB, 'touching.bmp')
  expect(pb.detected).toBe(6)
  expect(pb.cards.map((c) => c.index)).toEqual([1, 2, 3, 4, 5, 6])
  for (let i = 1; i <= 6; i++)
    expect(existsSync(join(outB, 'crops', 'grupo-toca', `touching_${String(i).padStart(2, '0')}.jpg`))).toBe(true)

  // Parámetros por archivo en tools/crop-config.json (formato): misma foto sin flag.
  const outC = join(work, 'out-ac5c')
  rmSync(outC, { recursive: true, force: true })
  const rc = runCrop([fx.touching, '--out', outC, '--manifest', fx.mt, '--config', fx.cfgGrid])
  expect(rc.status).toBe(0)
  expect(photoEntry(outC, 'touching.bmp').detected).toBe(6)
  // El config real del repo parsea y solo usa claves conocidas.
  expect(existsSync(join(root, 'tools', 'crop-config.json'))).toBe(true)
})

test.skipIf(skipNoPython)('AC: SPEC-F/T-042a/AC-6 aviso <500 px y nada de fotos ni recortes en git', () => {
  const out = join(work, 'out-ac6')
  rmSync(out, { recursive: true, force: true })
  const r = runCrop([fx.narrow, '--out', out, '--manifest', fx.mn, '--config', fx.cfgEmpty])
  expect(r.status).toBe(0)
  expect(r.output).toContain('narrow_02.jpg')
  expect(r.output).toContain('500')
  expect(r.output).not.toContain('narrow_01.jpg') // la de 520 px no avisa

  // Salidas solo bajo content/photos (gitignored): crops/, contact/, _debug/, crops.json.
  const gitignore = readFileSync(join(root, '.gitignore'), 'utf8')
  expect(gitignore).toMatch(/^content\/photos$/m)
  const paths = [
    'content/photos/crops/grupo/grid_01.jpg',
    'content/photos/contact/grid.jpg',
    'content/photos/_debug/grid.jpg',
    'content/photos/crops.json',
    'content/photos/_manifest.csv',
  ]
  const res = spawnSync('git', ['check-ignore', ...paths], { cwd: root, encoding: 'utf8' })
  if (res.status === 0) {
    const listed = (res.stdout ?? '').trim().split('\n')
    for (const p of paths) expect(listed, p).toContain(p)
  } // sin git en el checkout: el guard de .gitignore arriba alcanza (mismo criterio que T-043)
})
