// cards-scan/segment (SPEC-S/T-102a/AC-2 + SPEC-T/T-104/AC-3) — segmentación
// por LÍNEAS de la carta normalizada con PERFIL (terrain/gym/league): línea
// negra bajo el encabezado (~7 %), línea negra al fin del arte (~45 %),
// separadores entre bloques de ataque, línea negra gruesa del pie (~89 %) y
// borde inferior. T-104: los separadores se detectan por proyección horizontal
// INDEPENDIENTE DEL COLOR: líneas oscuras de cualquier tono (máx < 75 o
// croma ≥ 45 con máx ≤ 185) MÁS densidad de bordes verticales por fila (un
// separador de cualquier color contra el fondo produce un pico de borde en
// todo el ancho; el texto de los bloques, que no llega al ancho completo, no
// lo alcanza) ⇒ ya no depende del rojo oscuro del diseño terrain.
import sharp from 'sharp'
import { DEFAULT_SCAN_CONFIG, type ScanConfig } from './config.ts'

export type SegProfile = 'terrain' | 'gym' | 'league'

export interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export interface Block {
  readonly rect: Rect
  readonly kind: 'specialty' | 'attack'
  readonly number: number
}

export interface Segmentation {
  readonly profile: SegProfile
  readonly header: Rect
  readonly art: Rect
  readonly specialty: Rect | null
  readonly attacks: readonly Rect[]
  readonly separators: readonly Rect[]
  readonly footerLine: Rect
  readonly footer: Rect
  readonly blocks: readonly Block[]
}

export type SegmentResult = { readonly ok: true; readonly segmentation: Segmentation } | { readonly ok: false; readonly error: string }

interface Band {
  top: number
  bottom: number // exclusivo
  peak: number
}

interface RowProfile {
  readonly fracBlack: Float32Array
  readonly fracLine: Float32Array
  readonly fracEdge: Float32Array
  readonly raw: Raw
}

interface Raw {
  readonly data: Uint8Array
  readonly width: number
  readonly height: number
}

async function rawFull(png: Buffer): Promise<Raw> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

// Salto vertical (máx por canal) que cuenta como borde; calibrado para que un
// separador claro (#a8c8e8 sobre #f2ecf2 ⇒ delta 74) cuente y el degradado
// del fondo (deltas ≤ 20) no.
const EDGE_DELTA = 40
// Cierre morfológico de 5 filas sobre el perfil de bordes: un separador
// delgado produce picos solo en sus bordes superior/inferior; el cierre los
// fusiona en una banda a la altura de la línea real.
const EDGE_CLOSE = 5

function profilesOf(raw: Raw): RowProfile {
  const { data, width: w, height: h } = raw
  const x0 = Math.floor(w * 0.04)
  const x1 = Math.ceil(w * 0.96)
  const n = x1 - x0
  const fracBlack = new Float32Array(h)
  const fracLine = new Float32Array(h)
  const fracEdgeRaw = new Float32Array(h)
  const fracEdge = new Float32Array(h)
  for (let y = 0; y < h; y++) {
    let black = 0
    let line = 0
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 3
      const r = data[i] ?? 0
      const g = data[i + 1] ?? 0
      const b = data[i + 2] ?? 0
      const mx = Math.max(r, g, b)
      const mn = Math.min(r, g, b)
      const isBlack = mx < 75
      const isDarkChroma = mx - mn >= 45 && mx <= 185
      if (isBlack) black += 1
      if (isBlack || isDarkChroma) line += 1
    }
    fracBlack[y] = black / n
    fracLine[y] = line / n
    if (y === 0) continue
    let edges = 0
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 3
      const j = i - w * 3
      const d = Math.max(
        Math.abs((data[i] ?? 0) - (data[j] ?? 0)),
        Math.abs((data[i + 1] ?? 0) - (data[j + 1] ?? 0)),
        Math.abs((data[i + 2] ?? 0) - (data[j + 2] ?? 0)),
      )
      if (d >= EDGE_DELTA) edges += 1
    }
    fracEdgeRaw[y] = edges / n
  }
  for (let y = 0; y < h; y++) {
    let m = 0
    for (let k = 0; k < EDGE_CLOSE; k++) {
      const v = fracEdgeRaw[Math.min(h - 1, y + k)] ?? 0
      if (v > m) m = v
    }
    fracEdge[y] = m
  }
  return { fracBlack, fracLine, fracEdge, raw }
}

/** Bandas de filas consecutivas ≥ minFrac (fusiona huecos ≤ 3 filas). */
function bandsOf(frac: Float32Array, minFrac: number, from: number, to: number): Band[] {
  const out: Band[] = []
  let cur: Band | null = null
  for (let y = from; y < to; y++) {
    const f = frac[y] ?? 0
    if (f >= minFrac) {
      if (cur === null) cur = { top: y, bottom: y + 1, peak: f }
      else {
        cur.bottom = y + 1
        cur.peak = Math.max(cur.peak, f)
      }
    } else if (cur !== null && y - cur.bottom > 3) {
      out.push(cur)
      cur = null
    }
  }
  if (cur !== null) out.push(cur)
  return out
}

const center = (b: Band): number => (b.top + b.bottom) / 2

/** Color de fondo de la zona de ataques: moda cuantizada (>>3 por canal). */
function bgMode(p: RowProfile, y0: number, y1: number): { r: number; g: number; b: number } {
  const { data, width: w } = p.raw
  const x0 = Math.floor(w * 0.1)
  const x1 = Math.floor(w * 0.65)
  const counts = new Map<number, number>()
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 3
      const key = (((data[i] ?? 0) >> 3) << 10) | (((data[i + 1] ?? 0) >> 3) << 5) | ((data[i + 2] ?? 0) >> 3)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  let bestKey = -1
  let bestCount = -1
  for (const [k, c] of counts) {
    if (c > bestCount) {
      bestCount = c
      bestKey = k
    }
  }
  return { r: ((bestKey >> 10) & 31) << 3, g: ((bestKey >> 5) & 31) << 3, b: (bestKey & 31) << 3 }
}

/** Fracción de píxeles "tinta" (distintos del fondo) en la columna derecha. */
function rightInk(p: RowProfile, bg: { r: number; g: number; b: number }, y0: number, y1: number): number {
  const { data, width: w, height: h } = p.raw
  const x0 = Math.floor(w * 0.72)
  const x1 = Math.floor(w * 0.98)
  const top = Math.max(0, Math.min(h - 1, y0))
  const bot = Math.max(top + 1, Math.min(h, y1))
  let ink = 0
  for (let y = top; y < bot; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 3
      const d = Math.max(
        Math.abs((data[i] ?? 0) - bg.r),
        Math.abs((data[i + 1] ?? 0) - bg.g),
        Math.abs((data[i + 2] ?? 0) - bg.b),
      )
      if (d >= 35) ink += 1
    }
  }
  return ink / ((x1 - x0) * (bot - top))
}

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h })

/** Segmenta la carta normalizada (width×height del cfg) con el perfil dado. */
export async function segmentCard(png: Buffer, cfg: ScanConfig = DEFAULT_SCAN_CONFIG, profile: SegProfile = 'terrain'): Promise<SegmentResult> {
  const raw = await rawFull(png)
  const { width: w, height: h } = raw
  if (w < Math.round(cfg.width * 0.15) || h < Math.round(cfg.height * 0.15)) {
    return { ok: false, error: 'imagen demasiado chica para segmentar' }
  }
  const p = profilesOf(raw)
  // Señal combinada oscura-cualquier-tono + bordes (T-104/AC-3):
  // independiente del color, base de gym/league y de los separadores.
  const lineSignal = new Float32Array(h)
  for (let y = 0; y < h; y++) lineSignal[y] = Math.max(p.fracLine[y] ?? 0, p.fracEdge[y] ?? 0)

  // Líneas estructurales (encabezado/arte/pie). terrain: líneas NEGRAS
  // calibradas con los escaneos reales y la carta de oro. gym/league: el
  // diseño usa líneas COLOREADAS (medido sobre 6 cartas reales: arte con
  // pico 0.9-1.0 al 41-44 % de la altura, pie 0.9-1.0 al 88-89 %, texto del
  // pie ≤ 0.6) ⇒ se buscan en fracLine (oscuro de cualquier tono, sin la
  // componente de bordes para que las bandas no se inflen) con umbral menor.
  let headerBand: Band | undefined
  let artBand: Band | undefined
  let footerBand: Band | undefined
  if (profile === 'terrain') {
    const blackBands = bandsOf(p.fracBlack, 0.7, 0, h)
    // El borde negro del escaneo (fila 0-1) no es la línea del encabezado:
    // exigimos que la línea empiece después del 1 % de la altura.
    headerBand = blackBands.find(
      (b) =>
        b.top >= h * 0.01 &&
        b.bottom - b.top <= Math.round(h * 0.015) &&
        center(b) <= h * 0.3 &&
        b.peak >= 0.7,
    )
    artBand = blackBands.find(
      (b) => b.bottom - b.top <= Math.round(h * 0.015) && center(b) >= h * 0.25 && center(b) <= h * 0.7 && b.peak >= 0.85,
    )
    footerBand = [...blackBands]
      .reverse()
      .find(
        (b) =>
          b.bottom - b.top <= Math.round(h * 0.012) &&
          center(b) >= h * 0.7 &&
          center(b) <= h * 0.96 &&
          b.peak >= 0.85,
      )
  } else {
    const bands = bandsOf(p.fracLine, 0.5, 0, h)
    headerBand = bands.find(
      (b) => b.top >= h * 0.01 && b.bottom - b.top <= Math.round(h * 0.014) && center(b) <= h * 0.3 && b.peak >= 0.55,
    )
    // Arte: la banda MÁS intensa al 25-50 % (hay bandas débiles previas en
    // algunos escaneos, p. ej. Gloom 433-436 al 0.63 vs la real 463-475 al 1.0).
    artBand = bands
      .filter((b) => b.bottom - b.top <= Math.round(h * 0.025) && center(b) >= h * 0.25 && center(b) <= h * 0.5 && b.peak >= 0.55)
      .reduce<Band | undefined>((best, b) => (best === undefined || b.peak > best.peak ? b : best), undefined)
    // Pie: la PRIMERA banda al 85-93 % (la línea real está al 88-89 %; el
    // texto del pie, más abajo y ≤ 0.6 de pico, queda afuera por ventana).
    footerBand = bands.find(
      (b) => b.bottom - b.top <= Math.round(h * 0.012) && center(b) >= h * 0.85 && center(b) <= h * 0.93 && b.peak >= 0.55,
    )
  }
  if (artBand === undefined || footerBand === undefined) {
    return { ok: false, error: 'no se encontraron las líneas del arte o del pie' }
  }

  // Separadores entre arte y pie: señal combinada. La zona se encola
  // EDGE_CLOSE filas a cada lado: el cierre de bordes "sangra" en los picos
  // de transición de las líneas del arte/pie y crearía separadores fantasmas
  // pegados a ellas (medido en la carta de oro).
  const zoneTop = artBand.bottom + 3 + EDGE_CLOSE
  const zoneBottom = footerBand.top - 3 - EDGE_CLOSE
  const seps = bandsOf(lineSignal, 0.55, zoneTop, zoneBottom).filter(
    (b) => b.peak >= 0.6 && b.bottom - b.top <= Math.round(h * 0.025),
  )
  const gaps: Array<{ top: number; bottom: number }> = []
  let cursor = zoneTop
  for (const s of seps) {
    gaps.push({ top: cursor, bottom: s.top })
    cursor = s.bottom
  }
  gaps.push({ top: cursor, bottom: zoneBottom })
  const minBlock = Math.round(h * 0.012)
  const zones = gaps.filter((g) => g.bottom - g.top >= minBlock)
  if (zones.length < 1 || zones.length > 5) {
    return { ok: false, error: `cantidad de bloques inesperada (${zones.length})` }
  }

  // Especialidad: primer bloque SIN tinta a la derecha (los ataques tienen
  // daño/costos ahí); solo si hay más bloques detrás (siguen los ataques).
  const bg = bgMode(p, zones[0]?.top ?? 0, zones[zones.length - 1]?.bottom ?? h)
  const blockX = Math.round(w * 0.04)
  const blockW = Math.round(w * 0.92)
  const blocks: Block[] = []
  let attackNo = 0
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i]
    if (z === undefined) continue
    const isSpecialty = i === 0 && zones.length >= 2 && rightInk(p, bg, z.top, z.bottom) < 0.02
    if (isSpecialty) {
      blocks.push({ rect: rect(blockX, z.top, blockW, z.bottom - z.top), kind: 'specialty', number: 1 })
      continue
    }
    attackNo += 1
    blocks.push({ rect: rect(blockX, z.top, blockW, z.bottom - z.top), kind: 'attack', number: attackNo })
  }
  if (attackNo < 1 || attackNo > 4) {
    return { ok: false, error: `cantidad de ataques inesperada (${attackNo})` }
  }

  // Encabezado: hasta su línea; si no apareció, fallback a la sugerencia 7 %.
  const headerBottom = headerBand !== undefined ? headerBand.top : Math.round(h * 0.07)
  const header = rect(0, 0, w, headerBottom)
  const art = rect(0, headerBand !== undefined ? headerBand.bottom : headerBottom, w, artBand.top - (headerBand !== undefined ? headerBand.bottom : headerBottom))
  // Pie: desde la línea gruesa hasta el borde inferior oscuro (si existe).
  const borderCut = bandsOf(p.fracLine, 0.8, Math.floor(h * 0.955), h).find(
    (b) => b.bottom - b.top >= 3,
  )
  const footerBottom = borderCut !== undefined ? borderCut.top : h
  const footer = rect(0, footerBand.bottom, w, footerBottom - footerBand.bottom)

  return {
    ok: true,
    segmentation: {
      profile,
      header,
      art,
      specialty: blocks.find((b) => b.kind === 'specialty')?.rect ?? null,
      attacks: blocks.filter((b) => b.kind === 'attack').map((b) => b.rect),
      separators: seps.map((s) => rect(Math.round(w * 0.04), s.top, Math.round(w * 0.92), s.bottom - s.top)),
      footerLine: rect(0, footerBand.top, w, footerBand.bottom - footerBand.top),
      footer,
      blocks,
    },
  }
}
