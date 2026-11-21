// cards-scan/gpix (SPEC-T/T-105/AC-1) — helpers de píxeles compartidos por el
// detector del círculo del HP y el extractor de glifos: acceso a píxeles RGB,
// luma, fondo por mediana del borde, componentes conectados (4-conectividad)
// sobre una máscara o por diferencia con el fondo, y orden de lectura.
import sharp from 'sharp'
import type { Rect } from './segment.ts'

export interface Raw {
  readonly data: Uint8Array
  readonly width: number
  readonly height: number
}

export async function rawOf(png: Buffer): Promise<Raw> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

export interface Region {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Rgb {
  r: number
  g: number
  b: number
}

export const px = (raw: Raw, x: number, y: number): Rgb => {
  const i = (y * raw.width + x) * 3
  return { r: raw.data[i] ?? 0, g: raw.data[i + 1] ?? 0, b: raw.data[i + 2] ?? 0 }
}

export const lumaOf = (c: Rgb): number => (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255

export const maxDiff = (a: Rgb, b: Rgb): number => Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b))

/** Fondo de una región: mediana del anillo exterior de 2 px. */
export function medianBorder(raw: Raw, r: Region): Rgb {
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  const push = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= raw.width || y >= raw.height) return
    const c = px(raw, x, y)
    rs.push(c.r)
    gs.push(c.g)
    bs.push(c.b)
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

/** Bounding boxes de los componentes conectados (4-conectividad) de una
 * máscara ya construida; tamaño filtrado por [min,max] y área. */
export function componentsMask(raw: Raw, r: Region, mask: Uint8Array, minArea: number, minSize: number, maxSize: number): Rect[] {
  const rw = Math.max(1, r.x1 - r.x0)
  const rh = Math.max(1, r.y1 - r.y0)
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
      const qx = p % rw
      const qy = (p - qx) / rw
      area += 1
      if (qx < minX) minX = qx
      if (qx > maxX) maxX = qx
      if (qy < minY) minY = qy
      if (qy > maxY) maxY = qy
      const push = (q: number): void => {
        if (q >= 0 && q < mask.length && mask[q] === 1 && seen[q] === 0) {
          seen[q] = 1
          stack.push(q)
        }
      }
      if (qx > 0) push(p - 1)
      if (qx < rw - 1) push(p + 1)
      if (qy > 0) push(p - rw)
      if (qy < rh - 1) push(p + rw)
    }
    const w = maxX - minX + 1
    const h = maxY - minY + 1
    if (area >= minArea && w >= minSize && w <= maxSize && h >= minSize && h <= maxSize) {
      out.push({ x: r.x0 + minX, y: r.y0 + minY, w, h })
    }
  }
  return out
}

/** Bounding boxes de componentes conectados que difieren del fondo ≥ 30 por
 * canal; tamaño filtrado por [min,max] y área. */
export function componentsOf(raw: Raw, r: Region, bg: Rgb, minArea: number, minSize: number, maxSize: number): Rect[] {
  const rw = Math.max(1, r.x1 - r.x0)
  const rh = Math.max(1, r.y1 - r.y0)
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
  return componentsMask(raw, r, mask, minArea, minSize, maxSize)
}

/** Orden de lectura: bandas horizontales (arriba→abajo), dentro de cada banda izq→der. */
export function readingOrder(cands: readonly Rect[]): Rect[] {
  const cyOf = (r: Rect): number => r.y + r.h / 2
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
