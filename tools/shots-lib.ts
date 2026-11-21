// shots-lib (SPEC-G/T-066): parte pura de `pnpm shots` — decodificación PNG +
// varianza de píxeles, catálogo de capturas, umbrales por escena y generación
// del README "qué mirar" para el dueño (NO-VISION §4-5). Sin DOM ni navegador,
// testeable en node (tests/t066-shots.test.ts); el driver vive en e2e/t066-shots.mjs.
import { inflateSync } from 'node:zlib'

// ── Catálogo de capturas (AC-1) ─────────────────────────────────────────────

export interface ShotSize {
  readonly w: number
  readonly h: number
}

export const SHOT_SIZES: readonly ShotSize[] = [
  // ADR-9 deprecó móvil-vertical: capturas desktop (T-069 ajustó 390×844).
  { w: 1280, h: 800 },
  { w: 1440, h: 900 },
]

/** Panels por tipo de casillero (mismos targets del e2e T-061). */
export const PANEL_SCENES = [
  'start',
  'oak',
  'gym-cerrojo',
  'gym-desafiable',
  'centro',
  'mercado',
  'empty',
  'deck-bosque',
  'deck-montana',
  'deck-isla',
  'deck-llanura',
  'deck-pantano',
  'duelo',
  'sorpresa',
  'liga',
] as const

export const BASE_SCENES = [
  'board-idle',
  'token-mid-move',
  'draw-highlight',
  'draw-fly',
  'draw-reveal',
  'die-air',
  'board-2d-fallback',
] as const

/**
 * Capturas del cierre visual del MVP (SPEC-N/T-093/AC-1): orientación cenital
 * (solo para revisar, vía window.__debug.aimCamera) + las cuatro zonas que
 * quiere ver el dueño (edificios reubicados por T-089/T-091).
 */
export const CLOSE_SCENES = [
  'board-orientation',
  'zone-oeste',
  'zone-sur',
  'zone-este',
  'zone-centro',
] as const

/** Capturas de la galería de modelos (SPEC-K/T-070c/AC-3): una por pack. */
export type ModelsGalleryScene = `models-${string}`

export type ShotScene =
  | (typeof BASE_SCENES)[number]
  | (typeof CLOSE_SCENES)[number]
  | `tile-${(typeof PANEL_SCENES)[number]}`
  | ModelsGalleryScene

export const SHOT_SCENES: readonly ShotScene[] = [
  ...BASE_SCENES,
  ...CLOSE_SCENES,
  ...PANEL_SCENES.map((panel): ShotScene => `tile-${panel}`),
]

export const sizeLabel = (size: ShotSize): string => `${String(size.w)}x${String(size.h)}`

/** Ruta determinista del PNG relativa a la raíz del repo (dentro de shots/). */
export function shotFile(scene: ShotScene, size: ShotSize): string {
  return `shots/${sizeLabel(size)}/${scene}.png`
}

// ── Umbrales y veredicto por captura (AC-2) ─────────────────────────────────

export const SHOT_THRESHOLDS = {
  /** Varianza de luminancia del área del tablero: plano/negro ⇒ no dibuja. */
  minVariance: 30,
  /** El tablero ocupa al menos 60 % del ancho útil (viewport sin scrollbar). */
  minBoardPct: 60,
  /**
   * Excepción documentada: el tablero 2D se auto-capaea en 540 px
   * (Board.module.css `.boardWrap { width: min(92vw, 540px) }`, revisado en
   * T-031), así que en desktop no puede llegar al 60 % del viewport.
   */
  minBoardPct2dDesktop: 35,
} as const

export interface ShotExpectations {
  readonly minVariance: number
  readonly minBoardPct: number
  readonly requireMilestones: boolean
}

export function expectationsFor(scene: ShotScene, size: ShotSize): ShotExpectations {
  // "Desktop" = viewport ≥ 1024 px de ancho (los tamaños de captura son 1280 y 1440).
  const desktop2d = scene === 'board-2d-fallback' && size.w >= 1024
  return {
    minVariance: SHOT_THRESHOLDS.minVariance,
    minBoardPct: desktop2d ? SHOT_THRESHOLDS.minBoardPct2dDesktop : SHOT_THRESHOLDS.minBoardPct,
    requireMilestones: true,
  }
}

export interface ShotMilestone {
  readonly name: string
  readonly inViewport: boolean
}

export interface ShotMetrics {
  readonly pixelVariance: number | null
  readonly boardWidthPct: number | null
  readonly milestones: readonly ShotMilestone[]
  readonly consoleErrors: number
}

export interface ShotVerdict {
  readonly ok: boolean
  readonly failures: readonly string[]
}

export function evaluateShot(metrics: ShotMetrics, expectations: ShotExpectations): ShotVerdict {
  const failures: string[] = []
  if (metrics.pixelVariance === null) failures.push('sin área de tablero para medir varianza')
  else if (metrics.pixelVariance < expectations.minVariance) {
    failures.push(`varianza ${metrics.pixelVariance.toFixed(1)} < ${String(expectations.minVariance)} (¿canvas vacío?)`)
  }
  if (metrics.boardWidthPct === null) failures.push('sin rect del tablero para medir ancho')
  else if (metrics.boardWidthPct < expectations.minBoardPct) {
    failures.push(`ancho del tablero ${metrics.boardWidthPct.toFixed(1)} % < ${String(expectations.minBoardPct)} %`)
  }
  if (expectations.requireMilestones) {
    if (metrics.milestones.length === 0) failures.push('sin hitos medidos (¿falta sceneDump?)')
    for (const milestone of metrics.milestones) {
      if (!milestone.inViewport) failures.push(`hito fuera del viewport: ${milestone.name}`)
    }
  }
  if (metrics.consoleErrors > 0) failures.push(`${String(metrics.consoleErrors)} error(es) de consola`)
  return { ok: failures.length === 0, failures }
}

// ── Decodificador PNG (solo lo que produce Playwright + variantes 8-bit) ────

export interface DecodedPng {
  readonly width: number
  readonly height: number
  /** RGBA8, 4 bytes por píxel, filas de arriba abajo. */
  readonly data: Uint8Array
}

export interface PixelRect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const

const CHANNELS_BY_COLOR: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

/** Decodifica PNG 8-bit sin interlace (gray/RGB/gray+alpha/RGBA/paleta+PLTE). */
export function decodePng(bytes: Uint8Array): DecodedPng {
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error('no es un PNG (firma inválida)')
  }
  let offset = PNG_SIGNATURE.length
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idat: Uint8Array[] = []
  let palette: readonly number[] = []
  while (offset + 8 <= bytes.length) {
    const length = (bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!
    const type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!)
    const data = bytes.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = be32(data, 0)
      height = be32(data, 4)
      bitDepth = data[8]!
      colorType = data[9]!
      if (data[12] !== 0) throw new Error('PNG entrelazado no soportado')
    } else if (type === 'PLTE') {
      palette = Array.from(data)
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }
  if (width <= 0 || height <= 0) throw new Error('IHDR ausente o inválido')
  if (bitDepth !== 8) throw new Error(`bit depth ${String(bitDepth)} no soportado (se esperaba 8)`)
  const channels = CHANNELS_BY_COLOR[colorType]
  if (channels === undefined) throw new Error(`color type ${String(colorType)} no soportado`)
  const raw = inflateSync(concat(idat))
  const rowBytes = width * channels
  if (raw.length < (rowBytes + 1) * height) throw new Error('IDAT incompleto')
  const pixels = unfilter(raw, rowBytes, height, channels)
  const rgba = new Uint8Array(width * height * 4)
  for (let p = 0; p < width * height; p += 1) {
    const s = p * channels
    const d = p * 4
    if (colorType === 0) {
      const gray = pixels[s]!
      rgba[d] = gray
      rgba[d + 1] = gray
      rgba[d + 2] = gray
      rgba[d + 3] = 255
    } else if (colorType === 2) {
      rgba[d] = pixels[s]!
      rgba[d + 1] = pixels[s + 1]!
      rgba[d + 2] = pixels[s + 2]!
      rgba[d + 3] = 255
    } else if (colorType === 3) {
      const entry = pixels[s]! * 3
      rgba[d] = palette[entry] ?? 0
      rgba[d + 1] = palette[entry + 1] ?? 0
      rgba[d + 2] = palette[entry + 2] ?? 0
      rgba[d + 3] = 255
    } else if (colorType === 4) {
      const gray = pixels[s]!
      rgba[d] = gray
      rgba[d + 1] = gray
      rgba[d + 2] = gray
      rgba[d + 3] = pixels[s + 1]!
    } else {
      rgba[d] = pixels[s]!
      rgba[d + 1] = pixels[s + 1]!
      rgba[d + 2] = pixels[s + 2]!
      rgba[d + 3] = pixels[s + 3]!
    }
  }
  return { width, height, data: rgba }
}

const be32 = (b: Uint8Array, at: number): number =>
  (b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** Des-filtrado de scanlines PNG (filtros 0-4 de la spec). */
function unfilter(raw: Uint8Array, rowBytes: number, height: number, bpp: number): Uint8Array {
  const out = new Uint8Array(rowBytes * height)
  let previous = 0
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (rowBytes + 1)
    const filter = raw[rowStart]!
    const src = rowStart + 1
    const dst = y * rowBytes
    for (let x = 0; x < rowBytes; x += 1) {
      const byte = raw[src + x]!
      const left = x >= bpp ? out[dst + x - bpp]! : 0
      const up = previous !== 0 ? out[dst - rowBytes + x]! : 0
      const upLeft = previous !== 0 && x >= bpp ? out[dst - rowBytes + x - bpp]! : 0
      let value: number
      switch (filter) {
        case 0:
          value = byte
          break
        case 1:
          value = byte + left
          break
        case 2:
          value = byte + up
          break
        case 3:
          value = byte + ((left + up) >> 1)
          break
        case 4:
          value = byte + paeth(left, up, upLeft)
          break
        default:
          throw new Error(`filtro PNG ${String(filter)} inválido`)
      }
      out[dst + x] = value & 0xff
    }
    previous = 1
  }
  return out
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/**
 * Varianza de la luminancia (BT.709) en una región del PNG, muestreada para
 * no recorrer millones de píxeles. Canvas en blanco/color plano ⇒ ~0.
 */
export function regionVariance(image: DecodedPng, rect: PixelRect): number {
  const x0 = Math.max(0, Math.min(image.width - 1, Math.round(rect.x)))
  const y0 = Math.max(0, Math.min(image.height - 1, Math.round(rect.y)))
  const x1 = Math.max(x0 + 1, Math.min(image.width, Math.round(rect.x + rect.w)))
  const y1 = Math.max(y0 + 1, Math.min(image.height, Math.round(rect.y + rect.h)))
  const area = (x1 - x0) * (y1 - y0)
  const step = Math.max(1, Math.floor(Math.sqrt(area / 20_000)))
  const luminance: number[] = []
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const at = (y * image.width + x) * 4
      const r = image.data[at]!
      const g = image.data[at + 1]!
      const b = image.data[at + 2]!
      luminance.push(0.2126 * r + 0.7152 * g + 0.0722 * b)
    }
  }
  const mean = luminance.reduce((sum, l) => sum + l, 0) / luminance.length
  return luminance.reduce((sum, l) => sum + (l - mean) ** 2, 0) / luminance.length
}

// ── README "qué mirar" para el dueño (AC-3/AC-4) ────────────────────────────

export interface ShotRecord {
  readonly scene: ShotScene
  readonly size: string
  readonly file: string
  readonly metrics: ShotMetrics
  readonly ok: boolean
  readonly failures: readonly string[]
}

interface SceneGuide {
  readonly title: string
  readonly questions: readonly [string, string, string]
}

const PANEL_TITLES: Readonly<Record<(typeof PANEL_SCENES)[number], string>> = {
  start: 'casillero inicial',
  oak: 'Prof. Oak',
  'gym-cerrojo': 'gimnasio cerrado (Giovanni)',
  'gym-desafiable': 'gimnasio desafiable (Erika)',
  centro: 'Centro PKM',
  mercado: 'Mercado (mazo Ítem)',
  empty: 'casillero vacío',
  'deck-bosque': 'mazo Bosque',
  'deck-montana': 'mazo Montaña',
  'deck-isla': 'mazo Isla',
  'deck-llanura': 'mazo Llanura',
  'deck-pantano': 'mazo Pantano',
  duelo: 'duelo (deshabilitado por reglas)',
  sorpresa: 'sorpresa (deshabilitada por reglas)',
  liga: 'liga (deshabilitada por reglas)',
}

const baseGuides: Readonly<Record<(typeof BASE_SCENES)[number], SceneGuide>> = {  'board-idle': {
    title: 'Tablero inicial',
    questions: [
      '¿El tablero entra completo y se ve centrado (sin bordes cortados)?',
      '¿Los cinco mazos se distinguen por color y las pilas parecen cartas?',
      '¿Los rótulos de ciudades/Centro/Mercado/Oak se leen sobre el fondo?',
    ],
  },
  'token-mid-move': {
    title: 'Ficha a mitad del movimiento',
    questions: [
      '¿La ficha se ve a mitad de camino, en pleno saltito?',
      '¿La cámara la sigue sin perder de vista el tablero?',
      '¿La ficha (sprite o peón) se distingue del casillero que pisa?',
    ],
  },
  'draw-highlight': {
    title: 'Robo fase 1 — pila resaltada',
    questions: [
      '¿La pila del mazo quedó levantada respecto de las otras?',
      '¿Aparece la carta por robar cerca de esa pila?',
      '¿El resaltado llama la atención sin tapar los botones?',
    ],
  },
  'draw-fly': {
    title: 'Robo fase 2 — carta volando',
    questions: [
      '¿La carta está a mitad de camino entre la pila y el centro?',
      '¿Se ve el giro de reverso a cara (no un rectángulo plano)?',
      '¿El tamaño de la carta es cómodo para el ancho de pantalla?',
    ],
  },
  'draw-reveal': {
    title: 'Robo fase 3 — carta revelada (PKM)',
    questions: [
      '¿La carta quedó centrada y boca arriba, con el nombre legible?',
      '¿Se ven los botones Pelear / Dejar ir sin pelearse con la carta?',
      '¿La pila del mazo volvió a bajar a su lugar?',
    ],
  },
  'die-air': {
    title: 'Dado en el aire',
    questions: [
      '¿El dado se ve en el aire, cerca de la cámara y sin tapar el tablero?',
      '¿Se distinguen los puntos de la cara que mira arriba?',
      '¿El tamaño del dado parece arriesgado para la vista de la mesa?',
    ],
  },
  'board-2d-fallback': {
    title: 'Tablero 2D (fallback sin WebGL)',
    questions: [
      '¿Aparece el aviso de que se cayó al tablero 2D?',
      '¿El tablero 2D se ve completo, con la ficha en Pueblo Paleta?',
      '¿Algo del HUD/panel queda oculto o incómodo en este tamaño?',
    ],
  },
}

/** Guía de las capturas del cierre (SPEC-N/T-093/AC-2): 3 preguntas por zona. */
const closeGuides: Readonly<Record<(typeof CLOSE_SCENES)[number], SceneGuide>> = {
  'board-orientation': {
    title: 'Orientación del tablero (cenital, solo revisión)',
    questions: [
      '¿El norte queda arriba y el este a la derecha, como en tu foto original?',
      '¿Los edificios (rectángulos del placements.svg) quedan a los costados de los caminos?',
      '¿La Liga quedó al este de su nodo, donde dibujaste la L?',
    ],
  },
  'zone-oeste': {
    title: 'Zona oeste — Isla Canela y Plateada',
    questions: [
      '¿Los gimnasios de Canela y Plateada quedan afuera del borde oeste, sin tocar el camino?',
      '¿Se distinguen del terreno (modelo con color, no negro) y a escala parecida?',
      '¿Las etiquetas de ambas ciudades se leen completas, sin cortarse?',
    ],
  },
  'zone-sur': {
    title: 'Zona sur — Centro, Verde y Oak',
    questions: [
      '¿El Centro PKM, el gimnasio Verde y el laboratorio de Oak quedan hacia afuera del camino?',
      '¿Los tres edificios se ven enteros, sin taparse entre sí ni tapar nodos?',
      '¿Queda algún pedestal de Ítem o Sorpresa en la zona (no debería)?',
    ],
  },
  'zone-este': {
    title: 'Zona este — Azulona y Liga',
    questions: [
      '¿El gimnasio de Azulona queda afuera del borde este?',
      '¿El edificio de la Liga quedó al costado este de su nodo, fuera del camino?',
      '¿El modelo de la Liga se ve proporción grande pero sin tapar nodos ni caminos?',
    ],
  },
  'zone-centro': {
    title: 'Zona centro — Fucsia y Centro R',
    questions: [
      '¿El gimnasio de Fucsia y el Centro R quedan al costado del camino, sin tocar nodos?',
      '¿En la zona más apretada del tablero los edificios no se pisan entre sí?',
      '¿El dado sigue fijo en su panel del HUD y nada del mundo lo tapa?',
    ],
  },
}

/** Guía "qué mirar" de cada captura base/panel: 3 preguntas concretas (AC-3). */
export const SCENE_GUIDE: Readonly<Record<Exclude<ShotScene, ModelsGalleryScene>, SceneGuide>> = {
  ...baseGuides,
  ...closeGuides,
  ...Object.fromEntries(
    PANEL_SCENES.map((panel) => {
      const title = PANEL_TITLES[panel]
      return [
        `tile-${panel}`,
        {
          title: `Panel — ${title}`,
          questions: [
            `¿Se lee el título y el mensaje del panel de ${title}?`,
            '¿Los botones tienen sentido para lo que pasó (sin botones de más)?',
            '¿El tablero sigue visible y usable detrás del panel?',
          ] as [string, string, string],
        },
      ] as const
    }),
  ),
} as Readonly<Record<Exclude<ShotScene, ModelsGalleryScene>, SceneGuide>>

/** Guía de las capturas models-<pack> (SPEC-K/T-070c/AC-3: qué mirar). */
export function sceneGuideFor(scene: ShotScene): SceneGuide {
  const known = SCENE_GUIDE[scene as Exclude<ShotScene, ModelsGalleryScene>]
  if (known !== undefined) return known
  const pack = scene.slice('models-'.length) || 'pack'
  return {
    title: `Galería de modelos — ${pack}`,
    questions: [
      '¿Cada modelo se reconoce por su tipo (¿se reconoce un árbol?, ¿la casa se ve entera?)',
      '¿El tamaño relativo es razonable (normalizados a la misma altura)?',
      '¿Hay modelos rotos, sin texturas o flotando? Rechazalos con el botón.',
    ],
  }
}

/** README autogenerado de shots/ para el dueño (AC-3/AC-4). */
export function renderReadme(records: readonly ShotRecord[]): string {
  const failed = records.filter((record) => !record.ok)
  const lines: string[] = [
    '# Capturas de verificación visual (T-066)',
    '',
    'Para el dueño: abrí cada PNG y respondé con palabras (sí/no + detalle).',
    'Los ajustes visuales NO se hacen acá: se cambian los números en `src/theme/board3d.ts`',
    '(y demás `src/theme/*.ts`) y se regenera con `pnpm shots`.',
    `Estado automático: ${String(records.length - failed.length)}/${String(records.length)} capturas OK (métricas en report.json).`,
    '',
  ]
  const byScene = new Map<ShotScene, ShotRecord[]>()
  for (const record of records) {
    const list = byScene.get(record.scene) ?? []
    list.push(record)
    byScene.set(record.scene, list)
  }
  const ordered: ShotScene[] = [
    ...SHOT_SCENES,
    ...[...byScene.keys()].filter((scene) => !SHOT_SCENES.includes(scene as ShotScene)),
  ]
  for (const scene of ordered) {
    const sceneRecords = byScene.get(scene)
    if (sceneRecords === undefined || sceneRecords.length === 0) continue
    const guide = sceneGuideFor(scene)
    lines.push(`## ${scene} — ${guide.title}`)
    for (const record of sceneRecords) lines.push(`- ${record.file}`)
    if (sceneRecords.some((record) => !record.ok)) {
      const first = sceneRecords.find((record) => !record.ok)
      lines.push(`- [métricas fallidas] ${first?.failures.join('; ') ?? ''} (ver report.json)`)
    }
    lines.push('')
    lines.push('Qué mirar:')
    guide.questions.forEach((question, index) => lines.push(`${String(index + 1)}. ${question}`))
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}
