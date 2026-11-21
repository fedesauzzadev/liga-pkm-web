// cards-scan/icons (SPEC-S/T-102c/AC-1) — extracción de íconos por
// COMPONENTES CONECTADOS en tres lugares de la carta normalizada: junto al
// círculo de HP (elemento), columna derecha de cada bloque de ataque (costos,
// en fila o apilados en 2 filas, en orden de lectura) y pie (mazo). Cada
// ícono se describe con un vector 16×16 de luma + color promedio (259) y la
// detección del círculo gris vacío (= any, siempre). Puro: sharp solo para
// decodificar el PNG normalizado.
import sharp from 'sharp'
import type { Rect, Segmentation } from './segment.ts'
import type { ScanConfig } from './config.ts'

export type IconRole = 'element' | 'cost' | 'deck'

export interface IconPatch {
  readonly role: IconRole
  readonly attackIndex: number | null
  readonly rect: Rect
  readonly vector: readonly number[]
  readonly grayCircle: boolean
}

export interface CardIcons {
  readonly element: IconPatch | null
  readonly deck: IconPatch | null
  readonly costs: readonly (readonly IconPatch[])[]
}

export const VECTOR_LEN = 259 // 16×16 luma + rgb promedio

interface Raw {
  readonly data: Uint8Array
  readonly width: number
  readonly height: number
}

async function rawOf(png: Buffer): Promise<Raw> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

// Calibrado con el escaneo real (Dratini) y la carta sintética, siguiendo los
// regionHints de scan-config.json: el daño vive hasta ~0.87 y los costos
// 0.87-0.995; el ícono de elemento acompaña al círculo de HP; el de mazo está
// entre la etapa y la evolución del pie.
const ELEMENT_X: readonly [number, number] = [0.855, 0.995]
const ELEMENT_Y: readonly [number, number] = [0.012, 0.115]
const COST_X: readonly [number, number] = [0.87, 0.995]
const DECK_X: readonly [number, number] = [0.38, 0.53]

interface Region {
  x0: number
  y0: number
  x1: number
  y1: number
}

interface Rgb {
  r: number
  g: number
  b: number
}

/**
 * Fondo de la región: MEDIANA del anillo exterior (2 px). La moda falla
 * cuando el ícono domina la región (empata con el fondo y el "componente"
 * se vuelve todo el fondo); el borde es casi siempre fondo.
 */
function bgOfRegion(raw: Raw, r: Region): Rgb {
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  const push = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= raw.width || y >= raw.height) return
    const i = (y * raw.width + x) * 3
    rs.push(raw.data[i] ?? 0)
    gs.push(raw.data[i + 1] ?? 0)
    bs.push(raw.data[i + 2] ?? 0)
  }
  for (let x = r.x0; x < r.x1; x++) {
    for (const y of [r.y0, r.y0 + 1, r.y1 - 2, r.y1 - 1]) push(x, y)
  }
  for (let y = r.y0 + 2; y < r.y1 - 2; y++) {
    for (const x of [r.x0, r.x0 + 1, r.x1 - 2, r.x1 - 1]) push(x, y)
  }
  const med = (a: number[]): number => {
    const s = a.slice().sort((p, q) => p - q)
    return s[Math.floor(s.length / 2)] ?? 0
  }
  return { r: med(rs), g: med(gs), b: med(bs) }
}

/** Bounding boxes de los componentes conectados (4-conectividad, área ≥ minArea). */
function components(raw: Raw, r: Region, bg: Rgb, minArea: number): Rect[] {
  const rw = r.x1 - r.x0
  const rh = r.y1 - r.y0
  const mask = new Uint8Array(rw * rh)
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const i = ((r.y0 + y) * raw.width + (r.x0 + x)) * 3
      const d = Math.max(
        Math.abs((raw.data[i] ?? 0) - bg.r),
        Math.abs((raw.data[i + 1] ?? 0) - bg.g),
        Math.abs((raw.data[i + 2] ?? 0) - bg.b),
      )
      if (d >= 30) mask[y * rw + x] = 1
    }
  }
  const seen = new Uint8Array(rw * rh)
  const out: Rect[] = []
  const stack: number[] = []
  for (let s = 0; s < mask.length; s++) {
    if (mask[s] === 0 || seen[s] === 1) continue
    stack.length = 0
    stack.push(s)
    seen[s] = 1
    let minX = rw
    let maxX = -1
    let minY = rh
    let maxY = -1
    let area = 0
    while (stack.length > 0) {
      const p = stack.pop() ?? 0
      const px = p % rw
      const py = (p - px) / rw
      area += 1
      if (px < minX) minX = px
      if (px > maxX) maxX = px
      if (py < minY) minY = py
      if (py > maxY) maxY = py
      const push = (q: number): void => {
        if (q >= 0 && q < mask.length && mask[q] === 1 && seen[q] === 0) {
          seen[q] = 1
          stack.push(q)
        }
      }
      if (px > 0) push(p - 1)
      if (px < rw - 1) push(p + 1)
      if (py > 0) push(p - rw)
      if (py < rh - 1) push(p + rw)
    }
    if (area >= minArea) out.push({ x: r.x0 + minX, y: r.y0 + minY, w: maxX - minX + 1, h: maxY - minY + 1 })
  }
  return out
}

const GRID = 16
const lumaOf = (r: number, g: number, b: number): number => (0.299 * r + 0.587 * g + 0.114 * b) / 255

export interface IconFeature {
  readonly vector: number[]
  readonly grayCircle: boolean
}

/**
 * Vector del ícono: celdas 16×16 (luma promedio de cada celda) + color promedio
 * rgb. grayCircle detecta el círculo gris vacío ("cualquier elemento"): todo
 * gris (saturación baja), centro claro (hueco) y algo de trazo oscuro.
 */
export function featureOf(raw: Raw, box: Rect): IconFeature {
  const lum: number[] = new Array<number>(GRID * GRID)
  const cells: Array<[number, number, number]> = []
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const sx0 = box.x + Math.floor((gx * box.w) / GRID)
      const sx1 = Math.max(sx0 + 1, box.x + Math.ceil(((gx + 1) * box.w) / GRID))
      const sy0 = box.y + Math.floor((gy * box.h) / GRID)
      const sy1 = Math.max(sy0 + 1, box.y + Math.ceil(((gy + 1) * box.h) / GRID))
      let rs = 0
      let gs = 0
      let bs = 0
      let n = 0
      for (let y = sy0; y < sy1 && y < raw.height; y++) {
        for (let x = sx0; x < sx1 && x < raw.width; x++) {
          const i = (y * raw.width + x) * 3
          rs += raw.data[i] ?? 0
          gs += raw.data[i + 1] ?? 0
          bs += raw.data[i + 2] ?? 0
          n += 1
        }
      }
      const r = n > 0 ? rs / n : 0
      const g = n > 0 ? gs / n : 0
      const b = n > 0 ? bs / n : 0
      lum[gy * GRID + gx] = lumaOf(r, g, b)
      cells.push([r / 255, g / 255, b / 255])
    }
  }
  const mrAll = cells.reduce((s, c) => s + c[0], 0) / cells.length
  const mgAll = cells.reduce((s, c) => s + c[1], 0) / cells.length
  const mbAll = cells.reduce((s, c) => s + c[2], 0) / cells.length
  const sat = (c: readonly [number, number, number]): number => {
    const mx = Math.max(c[0], c[1], c[2])
    const mn = Math.min(c[0], c[1], c[2])
    return mx <= 0 ? 0 : (mx - mn) / mx
  }
  // Color de la TINTA (celdas con saturación o oscuras), no del bbox completo:
  // la dilución con el fondo hacía que púrpuras distintos (poison/psychic)
  // quedaran casi igual tras el promedio.
  const ink = cells.filter((c) => sat(c) >= 0.15 || lumaOf(c[0] * 255, c[1] * 255, c[2] * 255) <= 0.8)
  let mr = mrAll
  let mg = mgAll
  let mb = mbAll
  if (ink.length >= cells.length * 0.2 && ink.length > 0) {
    mr = ink.reduce((s, c) => s + c[0], 0) / ink.length
    mg = ink.reduce((s, c) => s + c[1], 0) / ink.length
    mb = ink.reduce((s, c) => s + c[2], 0) / ink.length
  }
  // Círculo gris vacío ("cualquier elemento"): poca saturación (soporta el
  // gris cálido de los escaneos reales), centro hueco y claro (sin glifo
  // adentro) y algo de trazo oscuro. Calibrado con Dratini + sintética.
  const mx = Math.max(mr, mg, mb)
  const meanSat = mx <= 0 ? 0 : (mx - Math.min(mr, mg, mb)) / mx
  const inner: number[] = []
  for (let gy = 4; gy < 12; gy++) {
    for (let gx = 4; gx < 12; gx++) inner.push(lum[gy * GRID + gx] ?? 0)
  }
  const innerMin = Math.min(...inner)
  const dark = lum.filter((l) => l < 0.62).length / lum.length
  const grayCircle = meanSat < 0.32 && innerMin > 0.6 && dark >= 0.1
  return { vector: [...lum, mr, mg, mb], grayCircle }
}

/** Distancia entre vectores de ícono: 0.5·Δluma medio + 0.5·Δcolor de tinta. */
export function iconDistance(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length)
  if (n === 0) return 1
  let dl = 0
  const lumaLen = Math.min(GRID * GRID, n)
  for (let i = 0; i < lumaLen; i++) dl += Math.abs((a[i] ?? 0) - (b[i] ?? 0))
  dl /= lumaLen
  let dc = 0
  for (let i = lumaLen; i < n; i++) dc += Math.abs((a[i] ?? 0) - (b[i] ?? 0))
  dc /= Math.max(1, n - lumaLen)
  return 0.5 * dl + 0.5 * dc
}

const cyOf = (r: Rect): number => r.y + r.h / 2

/** Orden de lectura: bandas horizontales (arriba→abajo), dentro de cada banda izq→der. */
function readingOrder(cands: readonly Rect[]): Rect[] {
  const byY = [...cands].sort((p, q) => cyOf(p) - cyOf(q))
  const bands: Rect[][] = []
  for (const c of byY) {
    const band = bands[bands.length - 1]
    const prev = band?.[band.length - 1]
    if (band !== undefined && prev !== undefined && Math.abs(cyOf(c) - cyOf(prev)) <= Math.max(c.h, prev.h) * 0.6) band.push(c)
    else bands.push([c])
  }
  return bands.flatMap((band) => band.sort((p, q) => p.x - q.x))
}

function regionOf(w: number, h: number, xs: readonly [number, number], y0: number, y1: number): Region {
  return {
    x0: Math.max(0, Math.round(w * xs[0])),
    x1: Math.min(w, Math.round(w * xs[1])),
    y0: Math.max(0, Math.round(y0)),
    y1: Math.min(h, Math.round(y1)),
  }
}

function largestIcon(raw: Raw, region: Region, cfg: ScanConfig, role: IconRole, attackIndex: number | null): IconPatch | null {
  // Fondo: mediana del borde. Si con ese fondo no aparece ningún ícono
  // (encabezados con marco de color donde el borde cae en un color
  // minoritario y todo resulta "tinta" ⇒ blobs gigantes filtrados), se
  // reintenta con la mediana de TODA la región.
  let best = bestRect(raw, region, bgOfRegion(raw, region), cfg)
  if (best === null) best = bestRect(raw, region, medianOfRegion(raw, region), cfg)
  if (best === null) return null
  const f = featureOf(raw, best)
  return { role, attackIndex, rect: best, vector: f.vector, grayCircle: f.grayCircle }
}

function bestRect(raw: Raw, region: Region, bg: Rgb, cfg: ScanConfig): Rect | null {
  const cands = components(raw, region, bg, cfg.icons.minArea).filter((c) => {
    const aspect = c.w / Math.max(1, c.h)
    return c.w >= cfg.icons.minSize && c.w <= cfg.icons.maxSize && c.h >= cfg.icons.minSize && c.h <= cfg.icons.maxSize && aspect >= 0.3 && aspect <= 3
  })
  let best: Rect | null = null
  for (const c of cands) {
    if (best === null || c.w * c.h > best.w * best.h) best = c
  }
  return best
}

/** Mediana por canal de TODA la región (respaldo cuando el borde miente). */
function medianOfRegion(raw: Raw, r: Region): Rgb {
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      const i = (y * raw.width + x) * 3
      rs.push(raw.data[i] ?? 0)
      gs.push(raw.data[i + 1] ?? 0)
      bs.push(raw.data[i + 2] ?? 0)
    }
  }
  const med = (a: number[]): number => {
    const s = a.slice().sort((p, q) => p - q)
    return s[Math.floor(s.length / 2)] ?? 0
  }
  return { r: med(rs), g: med(gs), b: med(bs) }
}

/** Extrae los íconos de la carta normalizada (elemento, costos por ataque, mazo). */
export async function extractIcons(png: Buffer, seg: Segmentation, cfg: ScanConfig): Promise<CardIcons> {
  const raw = await rawOf(png)
  const w = raw.width
  const h = raw.height
  // Región del elemento: junto al círculo de HP (diseño fijo). Si la línea del
  // encabezado se detectó sospechosamente alta (encabezados oscuros, p.ej.
  // bosque), se ignoran headerBottom y se usan coordenadas fijas.
  const headerBottom = seg.header.y + seg.header.h
  const headerSospechoso = headerBottom < h * 0.05
  const headerY0 = Math.max(seg.header.y + 2, Math.round(h * ELEMENT_Y[0]))
  const headerY1 = headerSospechoso
    ? Math.round(h * 0.108)
    : Math.min(headerBottom, Math.round(h * ELEMENT_Y[1]))
  const element =
    headerY1 - headerY0 >= cfg.icons.minSize
      ? largestIcon(raw, regionOf(w, h, ELEMENT_X, headerY0, headerY1), cfg, 'element', null)
      : null
  const footerY0 = seg.footer.y + 2
  const footerY1 = seg.footer.y + seg.footer.h
  const deck =
    footerY1 - footerY0 >= cfg.icons.minSize ? largestIcon(raw, regionOf(w, h, DECK_X, footerY0, footerY1), cfg, 'deck', null) : null

  const costs: IconPatch[][] = []
  seg.attacks.forEach((rect, i) => {
    const region = regionOf(w, h, COST_X, rect.y + 2, rect.y + rect.h - 1)
    const bg = bgOfRegion(raw, region)
    const cands = components(raw, region, bg, cfg.icons.minArea).filter((c) => {
      const aspect = c.w / Math.max(1, c.h)
      return c.w >= cfg.icons.minSize && c.w <= cfg.icons.maxSize && c.h >= cfg.icons.minSize && c.h <= cfg.icons.maxSize && aspect >= 0.45 && aspect <= 2.2
    })
    costs.push(
      readingOrder(cands).map((box) => {
        const f = featureOf(raw, box)
        return { role: 'cost' as const, attackIndex: i, rect: box, vector: f.vector, grayCircle: f.grayCircle }
      }),
    )
  })
  return { element, deck, costs }
}
