// cards-scan/image (SPEC-S/T-102a/AC-1) — normalización de un escaneo:
// orientación EXIF, corrección de inclinación (autoDeskew por perfil de
// proyección de las líneas oscuras), detección de bordes contra el fondo y
// normalización a width×height (700×1060) con tolerancia de proporción ±4 %.
// Si la imagen no parece una carta ⇒ ok:false con motivo (el lote sigue).
import sharp, { type Sharp } from 'sharp'
import { DEFAULT_SCAN_CONFIG, type ScanConfig } from './config.ts'

export type NormalizeResult =
  | { readonly ok: true; readonly png: Buffer; readonly width: number; readonly height: number; readonly angle: number }
  | { readonly ok: false; readonly error: string }

const PROBE_W = 340
const MAX_SKEW_DEG = 4
const SKEW_STEP_DEG = 0.25
const MIN_ANGLE_DEG = 0.3 // por debajo de esto se considera derecha

interface Raw {
  readonly data: Uint8Array
  readonly width: number
  readonly height: number
}

async function rawOf(img: Sharp, width: number): Promise<Raw> {
  const { data, info } = await img
    .resize(width, null, { fit: 'inside', withoutEnlargement: false })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

/** Ángulo (grados, horario) que endereza las líneas horizontales oscuras. */
function estimateSkew(raw: Raw): number {
  const { data, width: w, height: h } = raw
  const black = new Uint8Array(w * h)
  let totalBlack = 0
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 3] ?? 0
    const g = data[i * 3 + 1] ?? 0
    const b = data[i * 3 + 2] ?? 0
    if (Math.max(r, g, b) < 95) {
      black[i] = 1
      totalBlack += 1
    }
  }
  if (totalBlack < w * 2) return 0
  const cx = (w - 1) / 2
  const score0 = projectionScore(black, w, h, 0, cx)
  let bestAngle = 0
  let bestScore = score0
  for (let deg = -MAX_SKEW_DEG; deg <= MAX_SKEW_DEG + 1e-9; deg += SKEW_STEP_DEG) {
    if (Math.abs(deg) < MIN_ANGLE_DEG) continue
    const score = projectionScore(black, w, h, Math.tan((deg * Math.PI) / 180), cx)
    if (score > bestScore) {
      bestScore = score
      bestAngle = deg
    }
  }
  // Mejora marginal ⇒ ya está derecha (evita rotar por ruido).
  if (bestAngle !== 0 && bestScore < score0 * 1.05) return 0
  return bestAngle
}

function projectionScore(black: Uint8Array, w: number, h: number, tan: number, cx: number): number {
  const counts = new Float64Array(h)
  for (let y = 0; y < h; y++) {
    let c = 0
    for (let x = 0; x < w; x++) {
      const ys = Math.round(y + (x - cx) * tan)
      if (ys >= 0 && ys < h && black[ys * w + x] === 1) c += 1
    }
    counts[y] = c
  }
  let sum = 0
  let sumSq = 0
  for (let y = 0; y < h; y++) {
    const c = counts[y] ?? 0
    sum += c
    sumSq += c * c
  }
  return sumSq - (sum * sum) / h
}

/** Mediana de color del marco exterior (2 px de cada borde) = fondo. */
function borderMedian(raw: Raw): { readonly r: number; readonly g: number; readonly b: number } {
  const { data, width: w, height: h } = raw
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  for (let x = 0; x < w; x++) {
    for (const y of [0, 1, h - 2, h - 1]) {
      const i = (y * w + x) * 3
      rs.push(data[i] ?? 0)
      gs.push(data[i + 1] ?? 0)
      bs.push(data[i + 2] ?? 0)
    }
  }
  for (let y = 2; y < h - 2; y++) {
    for (const x of [0, 1, w - 2, w - 1]) {
      const i = (y * w + x) * 3
      rs.push(data[i] ?? 0)
      gs.push(data[i + 1] ?? 0)
      bs.push(data[i + 2] ?? 0)
    }
  }
  const med = (a: number[]): number => a.slice().sort((p, q) => p - q)[Math.floor(a.length / 2)] ?? 0
  return { r: med(rs), g: med(gs), b: med(bs) }
}

// Densidad mínima para que una fila/columna cuente como parte del bloque de
// la carta (fracción de la dimensión cruzada con contenido), y hueco interno
// máximo que se tolera antes de cortar el bloque (bandas claras del diseño).
const DENSE_FRAC = 0.15
const MERGE_GAP_FRAC = 0.006

interface Run {
  start: number
  end: number
}

/** Runs contiguos de filas/cols densas, fusionando huecos chicos (Q-078). */
function denseRuns(density: readonly number[], dense: number, maxGap: number): Run[] {
  const runs: Run[] = []
  let start = -1
  for (let i = 0; i <= density.length; i++) {
    const on = i < density.length && (density[i] ?? 0) >= dense
    if (on && start < 0) start = i
    else if (!on && start >= 0) {
      runs.push({ start, end: i - 1 })
      start = -1
    }
  }
  const merged: Run[] = []
  for (const r of runs) {
    const prev = merged[merged.length - 1]
    if (prev !== undefined && r.start - prev.end - 1 <= maxGap) prev.end = r.end
    else merged.push({ start: r.start, end: r.end })
  }
  return merged
}

function largestRun(runs: readonly Run[]): Run | null {
  let best: Run | null = null
  let bestLen = 0
  for (const r of runs) {
    const len = r.end - r.start + 1
    if (len > bestLen) {
      best = r
      bestLen = len
    }
  }
  return best
}

/**
 * Bounding box del contenido que difiere del fondo (marco exterior). Base:
 * primer/última fila/columna con contenido (≥1,2 %). Refine (Q-078): la
 * carta es el mayor bloque CONTIGUO denso (≥15 % por fila/columna, huecos
 * internos ≤0,6 % fusionados); se usa solo si conserva ≥60 % de la base Y
 * acerca la proporción al target (descarta franjas de ruido del escáner
 * separadas de la carta por fondo; nunca empeora un escaneo que ya medía
 * bien, p. ej. contenido disperso o carta clara sobre fondo claro).
 */
function detectBBox(raw: Raw, targetAspect: number): { left: number; top: number; width: number; height: number } {
  const { data, width: w, height: h } = raw
  const med = borderMedian(raw)
  const br = med.r
  const bg = med.g
  const bb = med.b
  const mask = new Uint8Array(w * h)
  let lit = 0
  for (let i = 0; i < w * h; i++) {
    const dr = Math.abs((data[i * 3] ?? 0) - br)
    const dg = Math.abs((data[i * 3 + 1] ?? 0) - bg)
    const db = Math.abs((data[i * 3 + 2] ?? 0) - bb)
    if (Math.max(dr, dg, db) >= 30) {
      mask[i] = 1
      lit += 1
    }
  }
  const full = { left: 0, top: 0, width: w, height: h }
  if (lit >= w * h * 0.997) return full
  const rowD: number[] = []
  for (let y = 0; y < h; y++) {
    let c = 0
    for (let x = 0; x < w; x++) if (mask[y * w + x] === 1) c += 1
    rowD.push(c / w)
  }
  const colD: number[] = []
  for (let x = 0; x < w; x++) {
    let c = 0
    for (let y = 0; y < h; y++) if (mask[y * w + x] === 1) c += 1
    colD.push(c / h)
  }
  // Base: primer/último contenido.
  let top = -1
  let bottom = -1
  for (let y = 0; y < h; y++) {
    if (rowD[y]! * w >= Math.max(3, Math.round(w * 0.012))) {
      if (top < 0) top = y
      bottom = y
    }
  }
  let left = -1
  let right = -1
  for (let x = 0; x < w; x++) {
    if (colD[x]! * h >= Math.max(3, Math.round(h * 0.012))) {
      if (left < 0) left = x
      right = x
    }
  }
  if (top < 0 || left < 0) return full
  const base = { left, top, width: right - left + 1, height: bottom - top + 1 }
  // Refine: mayor bloque contiguo denso (solo si no recorta la base de más
  // y acerca la proporción al target).
  const rowRun = largestRun(denseRuns(rowD, DENSE_FRAC, Math.max(2, Math.round(h * MERGE_GAP_FRAC))))
  const colRun = largestRun(denseRuns(colD, DENSE_FRAC, Math.max(2, Math.round(w * MERGE_GAP_FRAC))))
  if (rowRun === null || colRun === null) return base
  const rows = rowRun.end - rowRun.start + 1
  const cols = colRun.end - colRun.start + 1
  if (rows < base.height * 0.6 || cols < base.width * 0.6) return base
  const baseDiff = Math.abs(base.width / base.height - targetAspect)
  const refDiff = Math.abs(cols / rows - targetAspect)
  if (refDiff + 1e-9 >= baseDiff) return base
  return { left: colRun.start, top: rowRun.start, width: cols, height: rows }
}

/** Normaliza un escaneo (JPG/PNG) a width×height con correcciones previas. */
export async function normalizeScan(buf: Buffer, cfg: ScanConfig = DEFAULT_SCAN_CONFIG): Promise<NormalizeResult> {
  try {
    let pipe = sharp(buf, { failOn: 'none' }).rotate()
    let meta = await pipe.metadata()
    if ((meta.width ?? 0) < 300 || (meta.height ?? 0) < 300) {
      return { ok: false, error: 'la imagen no parece una carta (muy chica)' }
    }
    let angle = 0
    if (cfg.autoDeskew) {
      const probe = await rawOf(pipe.clone(), PROBE_W)
      angle = estimateSkew(probe)
      if (Math.abs(angle) >= MIN_ANGLE_DEG) {
        // El relleno de la rotación usa el color REAL del fondo del escaneo:
        // las cuñas inyectadas quedan "fondo" y no inflan el bbox (Q-078).
        pipe = sharp(await pipe.rotate(-angle, { background: borderMedian(probe) }).png().toBuffer())
        meta = await pipe.metadata()
      }
    }
    const probe2 = await rawOf(pipe.clone(), PROBE_W)
    const box = detectBBox(probe2, cfg.width / cfg.height)
    const sx = (meta.width ?? 1) / probe2.width
    const sy = (meta.height ?? 1) / probe2.height
    const left = Math.max(0, Math.min((meta.width ?? 1) - 1, Math.floor(box.left * sx)))
    const top = Math.max(0, Math.min((meta.height ?? 1) - 1, Math.floor(box.top * sy)))
    const bw = Math.max(1, Math.round(box.width * sx))
    const bh = Math.max(1, Math.round(box.height * sy))
    const target = cfg.width / cfg.height
    const aspect = bw / bh
    if (Math.abs(aspect - target) / target > cfg.tolerateAspectDiff) {
      return {
        ok: false,
        error: `la imagen no parece una carta (proporción ${aspect.toFixed(3)} ≠ ${target.toFixed(3)} ±${Math.round(cfg.tolerateAspectDiff * 100)} %)`,
      }
    }
    const png = await pipe
      .extract({ left, top, width: Math.min(bw, (meta.width ?? 1) - left), height: Math.min(bh, (meta.height ?? 1) - top) })
      .resize(cfg.width, cfg.height, { fit: 'fill' })
      .removeAlpha()
      .png()
      .toBuffer()
    return { ok: true, png, width: cfg.width, height: cfg.height, angle }
  } catch (e) {
    return { ok: false, error: `la imagen no parece una carta (${e instanceof Error ? e.message : 'no se pudo leer'})` }
  }
}
