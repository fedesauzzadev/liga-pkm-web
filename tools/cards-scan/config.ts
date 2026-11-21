// cards-scan/config (SPEC-S/T-102a) — carga content/cards/scan-config.json
// con defaults si falta; la segmentación usa LÍNEAS, las regiones del JSON son
// solo sugerencias/fallback (lo dice el propio archivo). T-102b agrega las
// secciones ocr/validation/confidence (AC-1/AC-5/AC-7).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Motores válidos para ocr.engine (SPEC-T/T-103/AC-4..5). */
export const OCR_ENGINE_IDS = ['tesseract', 'tesseract-prep', 'rapidocr', 'paddleocr'] as const
export type OcrEngineId = (typeof OCR_ENGINE_IDS)[number]

export interface OcrConfig {
  /** Motor elegido por cards:eval (AC-5); 'tesseract.js' legacy ⇒ 'tesseract'. */
  readonly engine: OcrEngineId
  readonly lang: string
  readonly cacheDir: string
  readonly digitsWhitelist: string
  readonly psmLine: number
  readonly psmBlock: number
}

export interface ValidationConfig {
  readonly hp: { readonly min: number; readonly max: number; readonly multipleOf: number }
  readonly damage: { readonly min: number; readonly max: number; readonly multipleOf: number }
  readonly facesDigits: readonly number[]
  readonly facesAscending: boolean
  readonly attacksPerCard: { readonly min: number; readonly max: number }
  readonly snapEnabled: boolean
  readonly snapMaxEditDistance: number
}

export interface ConfidenceConfig {
  readonly needsReviewBelow: number
}

export interface IconsConfig {
  readonly minArea: number
  readonly minSize: number
  readonly maxSize: number
  readonly groupThreshold: number
  readonly maxDistance: number
}

/** Glifos de números y caras (SPEC-T/T-105): tamaños de componente, umbral de
 * agrupado y distancia máxima de clasificación + rango del círculo de HP. */
export interface GlyphsConfig {
  readonly minArea: number
  readonly minSize: number
  readonly maxSize: number
  readonly groupThreshold: number
  readonly maxDistance: number
  readonly circleMin: number
  readonly circleMax: number
}

export interface IconClassesConfig {
  readonly element: readonly string[]
  readonly costSlot: readonly string[]
  readonly deck: readonly string[]
}

export interface ScanConfig {
  readonly width: number
  readonly height: number
  readonly tolerateAspectDiff: number
  readonly autoDeskew: boolean
  readonly reportDir: string
  /** Dónde se escriben los JSON del lector (T-102e/AC-1). */
  readonly stagingDir: string
  readonly ocr: OcrConfig
  readonly validation: ValidationConfig
  readonly confidence: ConfidenceConfig
  readonly icons: IconsConfig
  readonly glyphs: GlyphsConfig
  readonly iconClasses: IconClassesConfig
}

export const DEFAULT_SCAN_CONFIG: ScanConfig = {
  width: 700,
  height: 1060,
  tolerateAspectDiff: 0.04,
  autoDeskew: true,
  reportDir: 'content/photos/scan-reports',
  stagingDir: 'content/pokemon/_staging',
  ocr: { engine: 'tesseract', lang: 'spa', cacheDir: 'tools/cards-scan/.cache', digitsWhitelist: '0123456789', psmLine: 7, psmBlock: 6 },
  validation: {
    hp: { min: 20, max: 150, multipleOf: 10 },
    damage: { min: 0, max: 200, multipleOf: 10 },
    facesDigits: [1, 2, 3, 4, 5, 6],
    facesAscending: true,
    attacksPerCard: { min: 1, max: 4 },
    snapEnabled: true,
    snapMaxEditDistance: 2,
  },
  confidence: { needsReviewBelow: 0.8 },
  icons: { minArea: 50, minSize: 12, maxSize: 95, groupThreshold: 0.05, maxDistance: 0.07 },
  glyphs: { minArea: 20, minSize: 5, maxSize: 70, groupThreshold: 0.12, maxDistance: 0.15, circleMin: 42, circleMax: 130 },
  iconClasses: {
    element: ['normal', 'fire', 'water', 'grass', 'electric', 'psychic', 'fighting', 'poison', 'ground', 'flying', 'bug', 'ghost', 'ice', 'rock', 'dragon'],
    costSlot: ['any', 'fire', 'water', 'grass', 'electric', 'psychic', 'fighting', 'poison', 'ground', 'flying', 'bug', 'ghost', 'ice', 'rock'],
    deck: ['bosque', 'montana', 'isla', 'llanura', 'pantano', 'evolucion', 'sorpresa'],
  },
}

interface RawConfig {
  normalize?: { width?: unknown; height?: unknown; tolerateAspectDiff?: unknown; autoDeskew?: unknown }
  output?: { reportDir?: unknown; stagingDir?: unknown }
  ocr?: { engine?: unknown; lang?: unknown; cacheDir?: unknown; digitsWhitelist?: unknown; psm?: { line?: unknown; block?: unknown } }
  validation?: {
    hp?: { min?: unknown; max?: unknown; multipleOf?: unknown }
    damage?: { min?: unknown; max?: unknown; multipleOf?: unknown }
    faces?: { digits?: unknown; ascending?: unknown }
    attacksPerCard?: { min?: unknown; max?: unknown }
    snapNameToPokeapi?: { enabled?: unknown; maxEditDistance?: unknown }
  }
  confidence?: { needsReviewBelow?: unknown }
  icons?: { minArea?: unknown; minSize?: unknown; maxSize?: unknown; groupThreshold?: unknown; maxDistance?: unknown }
  glyphs?: { minArea?: unknown; minSize?: unknown; maxSize?: unknown; groupThreshold?: unknown; maxDistance?: unknown; circleMin?: unknown; circleMax?: unknown }
  iconClasses?: { element?: unknown; costSlot?: unknown; deck?: unknown }
}

/** Normaliza el valor de ocr.engine ('tesseract.js' legacy ⇒ 'tesseract'). */
const engineOf = (v: unknown): OcrEngineId => {
  const s = typeof v === 'string' ? v.trim().toLowerCase().replace(/\.js$/, '') : ''
  return (OCR_ENGINE_IDS as readonly string[]).includes(s) ? (s as OcrEngineId) : 'tesseract'
}

/** Lee scan-config.json tolerando campos ausentes; nunca lanza (usa defaults). */
const strArray = (v: unknown, def: readonly string[]): readonly string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string' && x.length > 0) ? (v as string[]) : def

export function loadScanConfig(repoRoot: string): ScanConfig {
  const d = DEFAULT_SCAN_CONFIG
  try {
    const raw = JSON.parse(readFileSync(join(repoRoot, 'content', 'cards', 'scan-config.json'), 'utf8')) as RawConfig
    const n = raw.normalize ?? {}
    const num = (v: unknown, def: number): number => (typeof v === 'number' && v > 0 ? v : def)
    const int = (v: unknown, def: number): number => (typeof v === 'number' && Number.isInteger(v) ? v : def)
    const bool = (v: unknown, def: boolean): boolean => (typeof v === 'boolean' ? v : def)
    const str = (v: unknown, def: string): string => (typeof v === 'string' && v.length > 0 ? v : def)
    const o = raw.ocr ?? {}
    const v = raw.validation ?? {}
    const facesRaw = v.faces?.digits
    return {
      width: Math.round(num(n.width, d.width)),
      height: Math.round(num(n.height, d.height)),
      tolerateAspectDiff: num(n.tolerateAspectDiff, d.tolerateAspectDiff),
      autoDeskew: n.autoDeskew !== false,
      reportDir: str(raw.output?.reportDir, d.reportDir),
      stagingDir: str(raw.output?.stagingDir, d.stagingDir),
      ocr: {
        engine: engineOf(o.engine),
        lang: str(o.lang, d.ocr.lang),
        cacheDir: str(o.cacheDir, d.ocr.cacheDir),
        digitsWhitelist: str(o.digitsWhitelist, d.ocr.digitsWhitelist),
        psmLine: int(o.psm?.line, d.ocr.psmLine),
        psmBlock: int(o.psm?.block, d.ocr.psmBlock),
      },
      validation: {
        hp: { min: int(v.hp?.min, d.validation.hp.min), max: int(v.hp?.max, d.validation.hp.max), multipleOf: int(v.hp?.multipleOf, d.validation.hp.multipleOf) },
        damage: {
          min: int(v.damage?.min, d.validation.damage.min),
          max: int(v.damage?.max, d.validation.damage.max),
          multipleOf: int(v.damage?.multipleOf, d.validation.damage.multipleOf),
        },
        facesDigits: Array.isArray(facesRaw) && facesRaw.every((x) => typeof x === 'number') ? (facesRaw as number[]) : d.validation.facesDigits,
        facesAscending: bool(v.faces?.ascending, d.validation.facesAscending),
        attacksPerCard: { min: int(v.attacksPerCard?.min, d.validation.attacksPerCard.min), max: int(v.attacksPerCard?.max, d.validation.attacksPerCard.max) },
        snapEnabled: bool(v.snapNameToPokeapi?.enabled, d.validation.snapEnabled),
        snapMaxEditDistance: int(v.snapNameToPokeapi?.maxEditDistance, d.validation.snapMaxEditDistance),
      },
      confidence: {
        needsReviewBelow:
          typeof raw.confidence?.needsReviewBelow === 'number' && raw.confidence.needsReviewBelow > 0 && raw.confidence.needsReviewBelow <= 1
            ? raw.confidence.needsReviewBelow
            : d.confidence.needsReviewBelow,
      },
      icons: {
        minArea: num(raw.icons?.minArea, d.icons.minArea),
        minSize: num(raw.icons?.minSize, d.icons.minSize),
        maxSize: num(raw.icons?.maxSize, d.icons.maxSize),
        groupThreshold: num(raw.icons?.groupThreshold, d.icons.groupThreshold),
        maxDistance: num(raw.icons?.maxDistance, d.icons.maxDistance),
      },
      glyphs: {
        minArea: num(raw.glyphs?.minArea, d.glyphs.minArea),
        minSize: num(raw.glyphs?.minSize, d.glyphs.minSize),
        maxSize: num(raw.glyphs?.maxSize, d.glyphs.maxSize),
        groupThreshold: num(raw.glyphs?.groupThreshold, d.glyphs.groupThreshold),
        maxDistance: num(raw.glyphs?.maxDistance, d.glyphs.maxDistance),
        circleMin: num(raw.glyphs?.circleMin, d.glyphs.circleMin),
        circleMax: num(raw.glyphs?.circleMax, d.glyphs.circleMax),
      },
      iconClasses: {
        element: strArray(raw.iconClasses?.element, d.iconClasses.element),
        costSlot: strArray(raw.iconClasses?.costSlot, d.iconClasses.costSlot),
        deck: strArray(raw.iconClasses?.deck, d.iconClasses.deck),
      },
    }
  } catch {
    return DEFAULT_SCAN_CONFIG
  }
}

/** Persiste el motor elegido (SPEC-T/T-103/AC-5) en scan-config.json ›
 * ocr.engine, preservando el resto del archivo; devuelve la ruta escrita. */
export function setOcrEngine(repoRoot: string, engine: OcrEngineId): string {
  const dir = join(repoRoot, 'content', 'cards')
  const file = join(dir, 'scan-config.json')
  let doc: Record<string, unknown> = {}
  try {
    doc = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    // sin archivo o ilegible: se crea uno mínimo
  }
  if (typeof doc.ocr !== 'object' || doc.ocr === null) doc.ocr = {}
  ;(doc.ocr as Record<string, unknown>).engine = engine
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, `${JSON.stringify(doc, null, 1)}\n`, 'utf8')
  return file
}
