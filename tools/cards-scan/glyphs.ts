// cards-scan/glyphs (SPEC-T/T-105/AC-1) — glifos de números y caras por
// COMPONENTES CONECTADOS en tres zonas de la carta normalizada: el círculo
// blanco del HP (detector por color/forma en ghpcircle.ts), la columna de
// daño `(10)`/`(+10)` de cada ataque y el prefijo de caras `4-5_` (cortado en
// el `_` final por forma: barra ancha y baja en la línea de base). Cada glifo
// se describe con un vector 12×12 de "tinta" (magnitud contra el fondo de la
// ZONA, polaridad agnóstica, remuestreado bilinealmente) + aspecto + relleno.
// Puro: sharp solo decodifica.
import type { Rect, Segmentation } from './segment.ts'
import type { ScanConfig } from './config.ts'
import { componentsOf, lumaOf, medianBorder, px, rawOf, readingOrder, type Raw, type Region, type Rgb } from './gpix.ts'
import { findHpCircle } from './ghpcircle.ts'

export type GlyphRole = 'hp' | 'faces' | 'damage'

export interface GlyphPatch {
  readonly role: GlyphRole
  readonly attackIndex: number | null
  readonly rect: Rect
  readonly vector: readonly number[]
}

export interface AttackGlyphs {
  readonly prefix: readonly GlyphPatch[]
  readonly damage: readonly GlyphPatch[]
}

export interface CardGlyphs {
  readonly hpCircle: Rect | null
  readonly hp: readonly GlyphPatch[]
  readonly attacks: readonly AttackGlyphs[]
}

/** 12×12 de tinta + aspecto + relleno. */
export const GLYPH_VECTOR_LEN = 146

const GRID = 12

const mk = (role: GlyphRole, attackIndex: number | null, rect: Rect, vector: number[]): GlyphPatch => ({ role, attackIndex, rect, vector })

/** Vector del glifo: 12×12 del campo de tinta (magnitud |luma−fondo de la
 * ZONA| — el borde del bbox puede ser la propia tinta de un glifo fino como
 * `(`—, polaridad agnóstica) REMUESTREADO BILINEALMENTE (4 muestras por
 * celda) y suavizado 3×3 liviano: el bbox se estira a la grilla sin ruido de
 * cuantización subpíxel, por eso el mismo carácter da casi el mismo vector en
 * cualquier posición. */
function featureOf(raw: Raw, box: Rect, zoneBg: Rgb): number[] {
  const bgLuma = lumaOf(zoneBg)
  const w = Math.max(1, box.w)
  const h = Math.max(1, box.h)
  const ink = new Float32Array(w * h)
  let inkedPixels = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.min(1, Math.abs(lumaOf(px(raw, box.x + x, box.y + y)) - bgLuma) / 0.22)
      ink[y * w + x] = v
      if (v >= 0.4) inkedPixels += 1
    }
  }
  const sample = (fx: number, fy: number): number => {
    // fx,fy ∈ [0,1) dentro del bbox; bilinear sobre el campo de tinta.
    const pxr = Math.min(w - 1, Math.max(0, fx * w - 0.5))
    const pyr = Math.min(h - 1, Math.max(0, fy * h - 0.5))
    const x0 = Math.floor(pxr)
    const y0 = Math.floor(pyr)
    const x1 = Math.min(w - 1, x0 + 1)
    const y1 = Math.min(h - 1, y0 + 1)
    const tx = pxr - x0
    const ty = pyr - y0
    const a = ink[y0 * w + x0] ?? 0
    const b = ink[y0 * w + x1] ?? 0
    const c = ink[y1 * w + x0] ?? 0
    const d = ink[y1 * w + x1] ?? 0
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty
  }
  const grid: number[] = new Array<number>(GRID * GRID)
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const acc =
        sample((gx + 0.3) / GRID, (gy + 0.3) / GRID) +
        sample((gx + 0.7) / GRID, (gy + 0.3) / GRID) +
        sample((gx + 0.3) / GRID, (gy + 0.7) / GRID) +
        sample((gx + 0.7) / GRID, (gy + 0.7) / GRID)
      grid[gy * GRID + gx] = acc / 4
    }
  }
  // Suavizado 3×3 liviano (peso propio 4): integra los restos de fase
  // subpíxel entre posiciones sin fundir caracteres distintos.
  const at = (x: number, y: number): number => grid[y * GRID + x] ?? 0
  const out: number[] = new Array<number>(GRID * GRID)
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      let sum = 4 * at(x, y)
      let wsum = 4
      if (x > 0) { sum += at(x - 1, y); wsum += 1 }
      if (x < GRID - 1) { sum += at(x + 1, y); wsum += 1 }
      if (y > 0) { sum += at(x, y - 1); wsum += 1 }
      if (y < GRID - 1) { sum += at(x, y + 1); wsum += 1 }
      out[y * GRID + x] = sum / wsum
    }
  }
  return [...out, Math.min(3, box.w / Math.max(1, box.h)) / 3, inkedPixels / (w * h)]
}

/** Glifos dentro del círculo del HP: rect generoso y luego filtro por
 * ELIPSE blanca interior (los fragmentos del aro que entran por las
 * esquinas del rect quedan afuera; los dígitos de un HP de 3 cifras,
 * adentro). */
function hpGlyphs(raw: Raw, circle: Rect, cfg: ScanConfig): GlyphPatch[] {
  const m = Math.round(Math.min(circle.w, circle.h) * 0.1)
  const inner: Region = { x0: circle.x + m, y0: circle.y + m, x1: circle.x + circle.w - m, y1: circle.y + circle.h - m }
  if (inner.x1 - inner.x0 < 6 || inner.y1 - inner.y0 < 6) return []
  const bg = medianBorder(raw, inner)
  const cx = circle.x + circle.w / 2
  const cy = circle.y + circle.h / 2
  const rx = Math.max(4, circle.w / 2 - 5)
  const ry = Math.max(4, circle.h / 2 - 5)
  const inside = (r: Rect): boolean => {
    const dx = (r.x + r.w / 2 - cx) / rx
    const dy = (r.y + r.h / 2 - cy) / ry
    return dx * dx + dy * dy <= 0.75
  }
  const rects = readingOrder(componentsOf(raw, inner, bg, cfg.glyphs.minArea, cfg.glyphs.minSize, cfg.glyphs.maxSize)).filter(inside)
  return rects.map((r) => mk('hp', null, r, featureOf(raw, r, bg)))
}

/**
 * `_` final del prefijo (AC-1/AC-3): barra ANCHA y BAJA (w ≥ 1.6·h, h ≤ 45 %
 * del glifo más alto de la línea) cuyo centro está por debajo de la línea
 * media de los glifos altos (dígitos/paréntesis). El `-` es parecido pero
 * vive en la línea media; el `_` está en la base. Devuelve su Rect o null.
 */
function underscoreOf(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null
  const top = Math.min(...rects.map((r) => r.y))
  const bottom = Math.max(...rects.map((r) => r.y + r.h))
  const bandH = Math.max(1, bottom - top)
  // "Altos" = tamaño dígito (≥ 60 % del más alto): letras/rayas del nombre
  // quedan afuera para no corromper la mediana de la línea media.
  const maxH = Math.max(...rects.map((r) => r.h))
  const tall = rects.filter((r) => r.h >= maxH * 0.6)
  const maxTallH = tall.length > 0 ? Math.max(...tall.map((r) => r.h)) : maxH
  const cys = (tall.length > 0 ? tall : rects).map((r) => r.y + r.h / 2).sort((a, b) => a - b)
  const medCy = cys[Math.floor(cys.length / 2)] ?? top + bandH / 2
  let best: Rect | null = null
  for (const r of rects) {
    if (r.w >= 1.6 * r.h && r.h <= maxTallH * 0.45 && r.y + r.h / 2 > medCy + bandH * 0.1) {
      if (best === null || r.x < best.x) best = r
    }
  }
  return best
}

/** Prefijo de caras de un bloque: componentes de la PRIMERA línea (≈38 px
 * superiores) cortados en el `_` final: todo lo que queda a la derecha del
 * `_` es el nombre del ataque y se descarta. Se salta el borde izquierdo del
 * bloque (restos del marco en escaneos reales). Sin `_` quedan todos (el
 * lector marcará revisión por no terminar en `_`). */
function prefixGlyphs(raw: Raw, atk: Rect, cfg: ScanConfig, index: number): GlyphPatch[] {
  const w = raw.width
  const zone: Region = { x0: atk.x + 6, x1: Math.min(w, Math.round(atk.x + atk.w * 0.42)), y0: atk.y + 2, y1: Math.min(atk.y + 38, Math.round(atk.y + atk.h * 0.45)) }
  if (zone.x1 - zone.x0 < 8 || zone.y1 - zone.y0 < 6) return []
  const bg = medianBorder(raw, zone)
  const rects = readingOrder(componentsOf(raw, zone, bg, cfg.glyphs.minArea, cfg.glyphs.minSize, cfg.glyphs.maxSize))
  const u = underscoreOf(rects)
  const keep = u === null ? rects : rects.filter((r) => r.x <= u.x + u.w)
  return keep.map((r) => mk('faces', index, r, featureOf(raw, r, bg)))
}

/** Columna de daño `(10)`/`(+10)` de un bloque: 71,5-89 % del ancho (0,715
 * para no cortar el `(` dibujado en la sintética; 0,89 antes de los costos). */
function damageGlyphs(raw: Raw, atk: Rect, cfg: ScanConfig, index: number): GlyphPatch[] {
  const w = raw.width
  const zone: Region = { x0: Math.round(w * 0.715), x1: Math.round(w * 0.89), y0: atk.y + 2, y1: atk.y + atk.h - 2 }
  if (zone.x1 - zone.x0 < 8 || zone.y1 - zone.y0 < 6) return []
  const bg = medianBorder(raw, zone)
  const rects = readingOrder(componentsOf(raw, zone, bg, cfg.glyphs.minArea, cfg.glyphs.minSize, cfg.glyphs.maxSize))
  return rects.map((r) => mk('damage', index, r, featureOf(raw, r, bg)))
}

/** Distancia entre vectores de glifo: 0.8·Δtinta + 0.1·Δaspecto + 0.1·Δrelleno. */
export function glyphDistance(a: readonly number[], b: readonly number[]): number {
  const inkLen = GRID * GRID
  const n = Math.min(a.length, b.length, inkLen)
  if (n === 0) return 1
  let d = 0
  for (let i = 0; i < n; i++) d += Math.abs((a[i] ?? 0) - (b[i] ?? 0))
  d /= n
  const asp = Math.abs((a[inkLen] ?? 0) - (b[inkLen] ?? 0))
  const fill = Math.abs((a[inkLen + 1] ?? 0) - (b[inkLen + 1] ?? 0))
  return 0.8 * d + 0.1 * asp + 0.1 * fill
}

/** Extrae los glifos de la carta normalizada (círculo+HP, prefijo y daño por
 * ataque). El prefijo se corta en el `_` final; sin `_` quedan todos los de
 * la zona (el lector marcará revisión por no terminar en `_`). */
export async function extractGlyphs(png: Buffer, seg: Segmentation, cfg: ScanConfig): Promise<CardGlyphs> {
  const raw = await rawOf(png)
  const circle = findHpCircle(raw, cfg)
  const hp = circle === null ? [] : hpGlyphs(raw, circle, cfg)
  const attacks: AttackGlyphs[] = seg.attacks.map((atk, i) => ({
    prefix: prefixGlyphs(raw, atk, cfg, i),
    damage: damageGlyphs(raw, atk, cfg, i),
  }))
  return { hpCircle: circle, hp, attacks }
}
