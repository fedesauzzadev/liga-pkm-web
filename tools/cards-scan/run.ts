// cards-scan/run (SPEC-S/T-102a/AC-4 + T-102b) — CLI `pnpm cards:scan`:
// recorre una carpeta o archivo, normaliza + segmenta + OCR (T-102b) y
// analiza cada carta (draft con validaciones y confidence), escribe el PNG
// de debug y cachea por hash SHA-256 del archivo (.cache). `--resume` omite
// lo ya procesado, la concurrencia es configurable, un error en una imagen no
// detiene el lote y sale 0 si al menos una carta se procesó. Núcleo puro
// (patrón tools/map-moves.ts) ⇒ testeable; CLI gated por invokedDirectly.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadScanConfig, type ScanConfig } from './config.ts'
import { normalizeScan } from './image.ts'
import { segmentCard, type Segmentation } from './segment.ts'
import { deckFromPath, parseFilename, profileOf, resolveGroup, loadSpecies } from './filename.ts'
import { debugPng, legendOf } from './debug.ts'
import { createTesseractEngine, readCardRegions, type OcrEngine } from './ocr.ts'
import { analyzeCard, type DraftCard } from './draft.ts'
import { extractIcons, type CardIcons } from './icons.ts'
import { classifyCardIcons, loadIconLabels, type IconLabels } from './iclassify.ts'
import { emitOutputs } from './report.ts'
import type { SpeciesOut } from '../pokeapi.ts'

// v9 (T-104): nombre/mazo/líder desde el nombre del archivo (el OCR del
// encabezado pasa a ser solo verificación) y segmentación por perfil
// (terrain/gym/league) con detección de separadores independiente del color
// (proyección de bordes) ⇒ invalida v8.
const CACHE_VERSION = 9

export type ScanGroup = 'auto' | 'terrain' | 'evolution' | 'sorpresa' | 'gym' | 'league'
const GROUPS: readonly ScanGroup[] = ['auto', 'terrain', 'evolution', 'sorpresa', 'gym', 'league']
const DECKS: readonly string[] = ['bosque', 'montana', 'isla', 'llanura', 'pantano']

export interface ScanOptions {
  readonly input: string
  readonly outDir?: string | undefined
  readonly group?: ScanGroup | undefined
  readonly deck?: string | undefined
  readonly concurrency?: number | undefined
  readonly resume?: boolean | undefined
  readonly vision?: boolean | undefined
  /** Inyección para tests (T-102b): motor OCR falso; el CLI crea el real. */
  readonly engine?: OcrEngine | undefined
  /** Inyección para tests (T-102c): etiquetas de íconos (icon-labels.json). */
  readonly iconLabels?: IconLabels | undefined
}

export interface ScanSummary {
  readonly total: number
  readonly processed: number
  readonly review: number
  readonly errors: number
  readonly cached: number
  readonly ok: boolean
  readonly msPerCard: number | null
  readonly lines: readonly string[]
}

export interface CacheEntry {
  readonly v: number
  readonly file: string
  readonly hash: string
  readonly status: 'ok' | 'error'
  readonly error?: string | undefined
  readonly group?: string | undefined
  readonly deck?: string | undefined
  readonly angle?: number | undefined
  readonly segmentation?: Segmentation | undefined
  readonly legend?: readonly string[] | undefined
  readonly draft?: DraftCard | undefined
  readonly icons?: CardIcons | undefined
  /** Huella de icon-labels.json: si cambia, el caché no se reutiliza. */
  readonly labelsKey?: string | undefined
}

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const USAGE =
  'uso: pnpm cards:scan <carpeta|archivo> [--group auto|terrain|evolution|sorpresa|gym|league] [--deck mazo] [--out <dir>] [--concurrency 1-8] [--resume] [--vision]'

export function parseArgs(argv: readonly string[]): { ok: true; opts: ScanOptions } | { ok: false; error: string } {
  let input: string | undefined
  let group: ScanGroup = 'auto'
  let deck: string | undefined
  let outDir: string | undefined
  let concurrency = 3
  let resume = false
  let vision = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg === '--resume') resume = true
    else if (arg === '--vision') vision = true
    else if (arg === '--group' && next !== undefined) {
      if (!GROUPS.includes(next as ScanGroup)) return { ok: false, error: `--group inválido: ${next}` }
      group = next as ScanGroup
      i += 1
    } else if (arg === '--deck' && next !== undefined) {
      if (!DECKS.includes(next)) return { ok: false, error: `--deck inválido: ${next}` }
      deck = next
      i += 1
    } else if (arg === '--out' && next !== undefined) {
      outDir = next
      i += 1
    } else if (arg === '--concurrency' && next !== undefined) {
      const n = Number(next)
      if (!Number.isInteger(n) || n < 1 || n > 8) return { ok: false, error: `--concurrency inválido: ${next}` }
      concurrency = n
      i += 1
    } else if (arg !== undefined && !arg.startsWith('--')) input = arg
    else return { ok: false, error: `argumento desconocido o incompleto: ${arg ?? ''}\n${USAGE}` }
  }
  if (input === undefined) return { ok: false, error: `falta la carpeta o archivo de entrada\n${USAGE}` }
  return { ok: true, opts: { input, group, deck, outDir, concurrency, resume, vision } }
}

/** Imágenes a procesar (determinista: orden alfabético), jpg/jpeg/png. */
export function listImages(input: string): string[] {
  const stat = statSync(input, { throwIfNoEntry: false })
  if (stat === undefined) return []
  if (stat.isFile()) return [input]
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, e.name)
      if (e.isDirectory() && e.name !== '.cache' && e.name !== 'debug') walk(full)
      else if (/\.(jpe?g|png)$/i.test(e.name)) out.push(full)
    }
  }
  walk(input)
  return out
}

interface Ctx {
  readonly cfg: ScanConfig
  readonly cacheDir: string
  readonly debugDir: string
  readonly group: ScanGroup
  readonly deck: string | undefined
  readonly resume: boolean
  readonly species: readonly SpeciesOut[] | null
  readonly labels: IconLabels | null
  readonly labelsKey: string
  readonly engine: () => Promise<OcrEngine>
}

/** Resultado de una imagen: línea + datos para el staging (T-102e). */
interface OneResult {
  readonly kind: 'ok' | 'error' | 'cached'
  readonly review: boolean
  readonly line: string
  readonly draft?: DraftCard | undefined
  readonly error?: string | undefined
  readonly ms?: number | undefined
}

async function processOne(file: string, ctx: Ctx): Promise<OneResult> {
  const bytes = readFileSync(file)
  const hash = createHash('sha256').update(bytes).digest('hex')
  const cacheFile = join(ctx.cacheDir, `${hash}.json`)
  if (ctx.resume && existsSync(cacheFile)) {
    const entry = JSON.parse(readFileSync(cacheFile, 'utf8')) as CacheEntry
    // El caché solo vale para la MISMA versión y las mismas etiquetas de
    // íconos: si el dueño re-etiqueta, el draft clasificado queda viejo.
    if (entry.v === CACHE_VERSION && entry.labelsKey === ctx.labelsKey) {
      return { kind: 'cached', review: entry.draft?.needsReview === true, line: `caché   ${basename(file)}`, draft: entry.draft }
    }
  }
  const name = basename(file).replace(/\.(jpe?g|png)$/i, '')
  const base = { v: CACHE_VERSION, file: basename(file), hash, group: ctx.group, deck: ctx.deck, labelsKey: ctx.labelsKey }
  const write = (entry: CacheEntry): void => {
    writeFileSync(cacheFile, `${JSON.stringify(entry, null, 1)}\n`, 'utf8')
  }
  try {
    const t0 = Date.now()
    // T-104/AC-1: grupo/mazo/nombre/líder desde el nombre del archivo; el
    // grupo del CLI gana, luego el archivo, luego la carpeta (Q-081).
    const fi = parseFilename(basename(file), ctx.species)
    const group = ctx.group !== 'auto' ? ctx.group : (fi.group ?? resolveGroup(file, 'auto'))
    const profile = profileOf(group)
    const norm = await normalizeScan(bytes, ctx.cfg)
    if (!norm.ok) {
      write({ ...base, status: 'error', error: norm.error })
      return { kind: 'error', review: false, line: `error   ${basename(file)}: ${norm.error}`, error: norm.error }
    }
    const seg = await segmentCard(norm.png, ctx.cfg, profile)
    if (!seg.ok) {
      write({ ...base, status: 'error', error: seg.error, angle: norm.angle })
      return { kind: 'error', review: false, line: `error   ${basename(file)}: ${seg.error}`, error: seg.error }
    }
    // T-102b: OCR región por región + análisis del texto (draft).
    let engine: OcrEngine
    try {
      engine = await ctx.engine()
    } catch (e) {
      const msg = `ocr no disponible: ${e instanceof Error ? e.message : 'error inesperado'}`
      write({ ...base, status: 'error', error: msg, angle: norm.angle })
      return { kind: 'error', review: false, line: `error   ${basename(file)}: ${msg}`, error: msg }
    }
    const regions = await readCardRegions(norm.png, seg.segmentation, engine, ctx.cfg)
    // T-102c: íconos (elemento/costos/mazo) + clasificación si hay etiquetas.
    const icons = await extractIcons(norm.png, seg.segmentation, ctx.cfg)
    const iconClasses = ctx.labels !== null ? classifyCardIcons(icons, ctx.labels, ctx.cfg.icons.maxDistance) : undefined
    // Deck por nombre/ruta (Q-081 + T-104: primero el nombre del archivo) con
    // el ícono del pie como chequeo cruzado.
    const deckHint = fi.deck ?? deckFromPath(file) ?? ctx.deck ?? undefined
    const draft = analyzeCard(
      {
        ...regions,
        group,
        species: ctx.species ?? undefined,
        ...(deckHint !== undefined ? { deckHint } : {}),
        ...(fi.name !== null ? { file: { name: fi.name, dex: fi.dex, deck: fi.deck, leaderOrTrainer: fi.leaderOrTrainer, variant: fi.variant } } : {}),
        ...(iconClasses !== undefined ? { icons: iconClasses } : {}),
      },
      ctx.cfg.validation,
      ctx.cfg.confidence,
    )
    write({
      ...base,
      status: 'ok',
      angle: norm.angle,
      segmentation: seg.segmentation,
      legend: legendOf(seg.segmentation),
      draft,
      icons,
    })
    writeFileSync(join(ctx.debugDir, `${name}.png`), await debugPng(norm.png, seg.segmentation))
    const iconResumen = draft.element.value !== null || draft.deck.value !== null ? ` · ${draft.element.value ?? '?'}/${draft.deck.value ?? '?'}` : ''
    const resumen = `${draft.name.value} · HP ${draft.hp.value ?? '?'} · ${draft.attacks.length} ataque(s)${iconResumen}${draft.needsReview ? ' · REVISAR' : ''}`
    return { kind: 'ok', review: draft.needsReview, line: `ok      ${basename(file)} (${resumen})`, draft, ms: Date.now() - t0 }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error inesperado'
    write({ ...base, status: 'error', error: msg })
    return { kind: 'error', review: false, line: `error   ${basename(file)}: ${msg}`, error: msg }
  }
}

/** Núcleo del lote (testeable): procesa todas las imágenes y resume. */
export async function scanBatch(opts: ScanOptions): Promise<ScanSummary> {
  const cfg = loadScanConfig(repoRoot)
  const outDir = opts.outDir ?? join(repoRoot, cfg.reportDir)
  const cacheDir = join(outDir, '.cache')
  const debugDir = join(outDir, 'debug')
  mkdirSync(cacheDir, { recursive: true })
  mkdirSync(debugDir, { recursive: true })
  const files = existsSync(opts.input) ? listImages(opts.input) : []
  if (files.length === 0) {
    return { total: 0, processed: 0, review: 0, errors: 0, cached: 0, ok: false, msPerCard: null, lines: [`no se encontraron imágenes en ${opts.input}`] }
  }
  const injected = opts.engine
  const labels = opts.iconLabels ?? loadIconLabels(repoRoot)
  const labelsKey = labels === null ? 'none' : createHash('sha256').update(JSON.stringify(labels)).digest('hex').slice(0, 12)
  const ctx: Ctx = {
    cfg,
    cacheDir,
    debugDir,
    group: opts.group ?? 'auto',
    deck: opts.deck,
    resume: opts.resume === true,
    species: loadSpecies(repoRoot),
    labels,
    labelsKey,
    engine: (() => {
      if (injected !== undefined) return () => Promise.resolve(injected)
      // Un solo motor real por lote (creación perezosa y memoizada).
      let cached: Promise<OcrEngine> | null = null
      return () => {
        cached ??= createTesseractEngine(cfg.ocr)
        return cached
      }
    })(),
  }
  const lines: string[] = []
  let processed = 0
  let errors = 0
  let cached = 0
  let review = 0
  const items: { file: string; status: 'ok' | 'error'; draft?: DraftCard; error?: string; ms?: number }[] = []
  const msProcesadas: number[] = []
  const conc = Math.max(1, Math.min(8, opts.concurrency ?? 3))
  let idx = 0
  const worker = async (): Promise<void> => {
    while (idx < files.length) {
      const i = idx
      idx += 1
      const file = files[i]
      if (file === undefined) continue
      const r = await processOne(file, ctx)
      if (r.kind === 'ok') processed += 1
      else if (r.kind === 'error') errors += 1
      else cached += 1
      if (r.review) review += 1
      if (r.ms !== undefined) msProcesadas.push(r.ms)
      items.push({
        file: basename(file),
        status: r.kind === 'error' ? 'error' : 'ok',
        ...(r.draft !== undefined ? { draft: r.draft } : {}),
        ...(r.error !== undefined ? { error: r.error } : {}),
        ...(r.ms !== undefined ? { ms: r.ms } : {}),
      })
      lines.push(r.line)
    }
  }
  await Promise.all(Array.from({ length: Math.min(conc, files.length) }, worker))
  if (injected === undefined) await ctx.engine().then((e) => e.terminate(), () => undefined)
  const total = files.length
  // T-102e: staging (JSON por carta) + report.html desde lo corrida/(cacheado).
  const stagingDir = opts.outDir !== undefined ? join(outDir, '.staging') : join(repoRoot, cfg.stagingDir)
  const emit = await emitOutputs({ outDir, stagingDir, items })
  const msPerCard = msProcesadas.length > 0 ? Math.round(msProcesadas.reduce((a, b) => a + b, 0) / msProcesadas.length) : null
  lines.push(
    `resumen: ${total} imagen(es) · ${processed} procesada(s) · ${review} con revisión · ${errors} con error · ${cached} en caché`,
  )
  lines.push(
    `salida: ${emit.valid} carta(s) válida(s) en ${relative(repoRoot, stagingDir) || stagingDir} · ${emit.invalid} incompleta(s) en _errors · ${emit.errors} con error · reporte ${relative(repoRoot, emit.reportPath) || emit.reportPath}` +
      (msPerCard !== null ? ` · ${(msPerCard / 1000).toFixed(1)} s/carta (procesadas en esta corrida)` : ''),
  )
  if (opts.vision === true) lines.push('nota: --vision todavía no está implementado (T-102f)')
  return { total, processed, review, errors, cached, ok: processed + cached >= 1, msPerCard, lines }
}

async function cli(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv)
  if (!parsed.ok) {
    console.error(`cards:scan: ${parsed.error}`)
    return 2
  }
  const res = await scanBatch(parsed.opts)
  for (const line of res.lines) console.log(line)
  if (!res.ok) {
    console.error(`cards:scan: no se procesó ninguna carta (${relative(repoRoot, parsed.opts.input)})`)
    return 1
  }
  return 0
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  cli(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code
    },
    (e) => {
      console.error(`cards:scan: ${e instanceof Error ? e.message : 'error inesperado'}`)
      process.exitCode = 1
    },
  )
}
