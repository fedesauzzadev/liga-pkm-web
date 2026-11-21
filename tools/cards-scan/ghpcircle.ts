// cards-scan/ghpcircle (SPEC-T/T-105/AC-1) — detector del círculo BLANCO del
// HP por color/forma, aunque cambie de posición dentro del encabezado.
import { componentsMask, componentsOf, lumaOf, maxDiff, medianBorder, px, type Raw, type Region, type Rgb } from './gpix.ts'
import type { Rect } from './segment.ts'
import type { ScanConfig } from './config.ts'

/** Valida un candidato a círculo de HP: interior (55 % central) claro y aro
 * (0.68r..1.08r) que contrasta con él (trazo oscuro o de color). */
function circleOk(raw: Raw, c: Rect): boolean {
  const aspect = c.w / c.h
  if (aspect < 0.7 || aspect > 1.45) return false
  const inner: Region = { x0: c.x + Math.round(c.w * 0.22), x1: c.x + Math.round(c.w * 0.78), y0: c.y + Math.round(c.h * 0.22), y1: c.y + Math.round(c.h * 0.78) }
  if (inner.x1 - inner.x0 < 4 || inner.y1 - inner.y0 < 4) return false
  let rs = 0
  let gs = 0
  let bs = 0
  let n = 0
  for (let y = inner.y0; y < inner.y1; y++) {
    for (let x = inner.x0; x < inner.x1; x++) {
      const p = px(raw, x, y)
      rs += p.r
      gs += p.g
      bs += p.b
      n += 1
    }
  }
  if (n === 0) return false
  const mean: Rgb = { r: rs / n, g: gs / n, b: bs / n }
  // Interior claro (los DÍGITOS oscuros bajan la media: umbral generoso).
  if (lumaOf(mean) < 0.6) return false
  const cx = c.x + c.w / 2
  const cy = c.y + c.h / 2
  const r = (c.w + c.h) / 4
  let anillo = 0
  let distintos = 0
  for (let y = c.y; y < c.y + c.h; y++) {
    for (let x = c.x; x < c.x + c.w; x++) {
      const d = Math.hypot(x - cx, y - cy)
      if (d < r * 0.68 || d > r * 1.08) continue
      anillo += 1
      if (maxDiff(px(raw, x, y), mean) >= 45) distintos += 1
    }
  }
  return anillo > 0 && distintos / anillo >= 0.3
}

/**
 * Círculo blanco del HP (AC-1): en el encabezado, a la derecha (desde el 62 %
 * del ancho: el nombre vive a la izquierda). Dos vías, la primera que acierta:
 * (A) BLOB BLANCO redondo —los píxeles claros forman un disco; los dígitos
 * son huecos que no lo cortan— (escaneos reales, con el disco más claro que
 * el diseño del encabezado); (B) ARO OSCURO por diferencia con el fondo de
 * la región (sintéticas y encabezados claros, donde el disco casi no
 * contrasta con el fondo pero el aro sí). El candidato más grande que valida
 * gana; íconos de color quedan afuera por no ser blancos/redondos.
 */
export function findHpCircle(raw: Raw, cfg: ScanConfig): Rect | null {
  const w = raw.width
  const h = raw.height
  const region: Region = { x0: Math.round(w * 0.62), x1: w - 2, y0: Math.max(2, Math.round(h * 0.004)), y1: Math.round(h * 0.13) }
  if (region.x1 - region.x0 < 20 || region.y1 - region.y0 < 20) return null
  const rw = region.x1 - region.x0
  const rh = region.y1 - region.y0
  // (A) blob blanco: disco claro continuo del tamaño del círculo.
  const bright = new Uint8Array(rw * rh)
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      if (lumaOf(px(raw, region.x0 + x, region.y0 + y)) >= 0.8) bright[y * rw + x] = 1
    }
  }
  const blobs = componentsMask(raw, region, bright, Math.round(cfg.glyphs.circleMin * cfg.glyphs.circleMin * 0.4), cfg.glyphs.circleMin, cfg.glyphs.circleMax).sort(
    (a, b) => b.w * b.h - a.w * a.h,
  )
  for (const c of blobs) {
    if (circleOk(raw, c)) return c
  }
  // (B) aro oscuro: componente redondo del tamaño del círculo contra el fondo
  // de la región; el interior blanco y el aro que contrasta lo validan.
  const bg = medianBorder(raw, region)
  const rings = componentsOf(raw, region, bg, 60, cfg.glyphs.circleMin, cfg.glyphs.circleMax).sort((a, b) => b.w * b.h - a.w * a.h)
  for (const c of rings) {
    if (circleOk(raw, c)) return c
  }
  return null
}
