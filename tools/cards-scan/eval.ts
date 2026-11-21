// cards-scan/eval (SPEC-T/T-103) — CLI `pnpm cards:eval`: medición y
// diagnóstico por etapa del lector sobre la verdad terreno (cartas
// source.verified:true + la carta de oro). Para cada campo calcula exactitud
// y en qué etapa falla (evaldiag), guarda recortes de errores con
// esperado/leído (failures/) y la tabla de confusiones, compara motores de
// OCR sobre las mismas regiones (A tesseract, B tesseract+preproceso de
// T-106, C rapidocr local; D paddle solo si C no alcanza) y persiste el
// motor elegido en scan-config.json › ocr.engine (--set-engine).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { loadScanConfig, OCR_ENGINE_IDS, setOcrEngine, type OcrEngineId, type ScanConfig } from './config.ts'
import { normalizeScan } from './image.ts'
import { segmentCard, type Rect } from './segment.ts'
import { createTesseractEngine, readCardRegions, type CardRegions, type OcrEngine } from './ocr.ts'
import { analyzeCard, type DraftCard } from './draft.ts'
import { extractIcons, type CardIcons } from './icons.ts'
import { classifyCardIcons, loadIconLabels, type IconLabels } from './iclassify.ts'
import { buildStagingCard, idify } from './staging.ts'
import { loadEffectPatterns, type CompiledEffectPattern } from './effects.ts'
import { deckFromFilename, deckFromPath, loadSpecies, resolveGroup } from './filename.ts'
import { diagnoseCard, summarize, DIAG_FIELDS, truthWarning, type CardDiagnosis, type DiagError, type EvalSummary, type RawEvidence } from './evaldiag.ts'
import { createRapidocrEngine, ENGINE_SPECS, withPreprocess, type EngineRunResult } from './evalengines.ts'
import type { PokemonCard } from '../../packages/content/src/cards.ts'
import type { SpeciesOut } from '../pokeapi.ts'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const USAGE = 'uso: pnpm cards:eval [--set-engine tesseract|tesseract-prep|rapidocr|paddleocr]'

// --- verdad terreno (AC-1) ------------------------------------------------
export interface VerifiedCard {
  readonly card: PokemonCard
  readonly file: string
}
export interface GoldenCard {
  readonly card: PokemonCard
  readonly fixture: string
}
export interface TruthPair {
  readonly base: string
  readonly truth: PokemonCard
  readonly scan: string
  readonly source: 'golden' | 'verified'
  /** Solo para la carta de oro: el fixture no trae mazo en el nombre. */
  readonly deckHint?: string | undefined
}

interface CardDoc {
  readonly cards?: unknown
  readonly fromScanner?: unknown
  readonly needsReview?: unknown
  readonly photo?: unknown
}

const cardsOf = (doc: unknown): PokemonCard[] => {
  const c = (doc as CardDoc)?.cards
  if (!Array.isArray(c)) return []
  return c.filter((x): x is PokemonCard => typeof x === 'object' && x !== null && (x as PokemonCard).source !== undefined)
}

function walkJson(dir: string, skip: readonly string[], out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (skip.includes(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) walkJson(full, skip, out)
    else if (e.isFile() && e.name.endsWith('.json')) out.push(full)
  }
  return out
}

/** Cartas con source.verified:true en content/pokemon (+_staging). */
export function collectTruth(root: string): { verified: readonly VerifiedCard[]; golden: readonly GoldenCard[] } {
  const verified: VerifiedCard[] = []
  for (const f of walkJson(join(root, 'content', 'pokemon'), ['_errors', '_golden'])) {
    try {
      for (const card of cardsOf(JSON.parse(readFileSync(f, 'utf8')))) {
        if (card.source.verified === true) verified.push({ card, file: f })
      }
    } catch {
      // ilegible: no es verdad terreno
    }
  }
  const golden: GoldenCard[] = []
  for (const f of walkJson(join(root, 'content', 'pokemon', '_golden'), [])) {
    const base = basename(f).replace(/\.expected\.json$/, '')
    for (const ext of ['.jpg', '.jpeg', '.png']) {
      const fixture = join(root, 'tools', 'cards-scan', 'fixtures', `${base}${ext}`)
      if (existsSync(fixture)) {
        try {
          golden.push({ card: JSON.parse(readFileSync(f, 'utf8')) as PokemonCard, fixture })
        } catch {
          // ilegible: se saltea
        }
        break
      }
    }
  }
  return { verified, golden }
}

function scanIndex(root: string): Map<string, string> {
  const idx = new Map<string, string>()
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, e.name)
      if (e.isDirectory() && e.name !== 'debug' && e.name !== '.cache') walk(full)
      else if (/\.(jpe?g|png)$/i.test(e.name) && !idx.has(e.name)) idx.set(e.name, full)
    }
  }
  walk(join(root, 'content', 'photos', 'scans'))
  return idx
}

/** Empareja verdad terreno con escaneos (foto del staging fromScanner). */
export function buildPairs(
  root: string,
  t: { verified: readonly VerifiedCard[]; golden: readonly GoldenCard[] },
): { pairs: readonly TruthPair[]; unpaired: readonly string[]; inRevision: readonly string[] } {
  const staging = new Map<string, { photo: string | null; needsReview: boolean; base: string }>()
  for (const f of walkJson(join(root, 'content', 'pokemon', '_staging'), ['_errors'])) {
    try {
      const doc = JSON.parse(readFileSync(f, 'utf8')) as CardDoc
      if (doc.fromScanner !== true) continue
      const id = cardsOf(doc)[0]?.id
      if (id === undefined) continue
      staging.set(id, { photo: typeof doc.photo === 'string' ? doc.photo : null, needsReview: doc.needsReview === true, base: f.replace(/\.json$/, '').split(/[\\/]/).pop() ?? id })
    } catch {
      // ilegible: no aporta pares
    }
  }
  const scans = scanIndex(root)
  const pairs: TruthPair[] = []
  const unpaired: string[] = []
  const truthIds = new Set([...t.verified.map((v) => v.card.id), ...t.golden.map((g) => g.card.id)])
  for (const v of t.verified) {
    const st = staging.get(v.card.id)
    const scan = st?.photo !== null && st?.photo !== undefined ? scans.get(st.photo) : undefined
    if (scan === undefined) {
      unpaired.push(v.card.id)
      continue
    }
    pairs.push({ base: idify(v.card.name), truth: v.card, scan, source: 'verified' })
  }
  for (const g of t.golden) pairs.push({ base: basename(g.fixture).replace(/\.(jpe?g|png)$/i, ''), truth: g.card, scan: g.fixture, source: 'golden', deckHint: g.card.deck })
  const inRevision = [...staging.entries()].filter(([id, s]) => !truthIds.has(id) && s.needsReview).map(([, s]) => s.base)
  return { pairs, unpaired, inRevision }
}

/** Aviso de verdad terreno (AC-1): re-exportado del núcleo puro. */
export { truthWarning } from './evaldiag.ts'

// --- recortes de errores (AC-3) -------------------------------------------
const FIELD_DIR: Readonly<Record<string, string>> = {
  hp: 'hp', etapa: 'etapa', 'evolución': 'evolucion', elemento: 'elemento',
  'nombre de ataque': 'nombre-ataque', caras: 'caras', 'daño': 'dano', costos: 'costos', efectos: 'efectos',
}
const slug = (s: string): string => s.replace(/[^A-Za-z0-9+-]+/g, '_').replace(/^_+|_+$/g, '') || 'vacio'

function rectOf(e: DiagError, regions: CardRegions, icons: CardIcons | null): Rect | null {
  if (e.attack === null) {
    if (e.field === 'hp') return regions.hpRect
    if (e.field === 'etapa') return regions.footerStageRect
    if (e.field === 'evolución') return regions.footerRightRect
    if (e.field === 'elemento') return icons?.element?.rect ?? null
    return null
  }
  const blocks = regions.blocks.filter((b) => b.kind === 'attack')
  const b = blocks[e.attack - 1]
  if (b === undefined) return null
  if (e.field === 'daño') return b.damageRect
  return b.rect
}

/** Escribe un recorte por error en failures/<campo>/ con esperado/leído. */
export async function writeFailureCrops(
  failDir: string, base: string, errors: readonly DiagError[], regions: CardRegions, icons: CardIcons | null, png: Buffer,
): Promise<number> {
  const meta = await sharp(png).metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0
  let n = 0
  for (const e of errors) {
    const r = rectOf(e, regions, icons)
    if (r === null) continue
    const left = Math.max(0, r.x - 4)
    const top = Math.max(0, r.y - 4)
    const width = Math.min(w - left, r.w + 8)
    const height = Math.min(h - top, r.h + 8)
    if (width <= 0 || height <= 0) continue
    const dir = join(failDir, FIELD_DIR[e.field] ?? 'otros')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${base}__esperado_${slug(e.expected)}__leido_${slug(e.read)}.png`)
    await sharp(png).extract({ left, top, width, height }).png().toFile(file)
    n += 1
  }
  return n
}

// --- tabla comparativa de motores (AC-4) -----------------------------------
export function buildEngineTable(runs: readonly EngineRunResult[]): string[] {
  const rows = runs.map((r) => {
    const acc = r.fieldChecks > 0 ? `${((r.fieldHits / r.fieldChecks) * 100).toFixed(1)}%` : '—'
    const ms = r.msPerCard !== null ? `${(r.msPerCard / 1000).toFixed(1)} s` : '—'
    const nota = [r.available ? '' : 'no disponible', r.note ?? ''].filter((x) => x.length > 0).join(' — ')
    return `${r.id.padEnd(16)} ${acc.padStart(7)}  ${ms.padStart(8)}  ${r.cards} carta(s)  ${r.label}${nota.length > 0 ? `  · ${nota}` : ''}`
  })
  return ['motores (mismas regiones):', 'motor             exactitud   s/carta (OCR)', ...rows]
}

// --- corrida del lector sobre un par (para diagnóstico y comparación) -----
interface Ctx {
  readonly cfg: ScanConfig
  readonly patterns: readonly CompiledEffectPattern[]
  readonly labels: IconLabels | null
  readonly species: readonly SpeciesOut[] | null
}

/** Carta "como si fuera final" desde el draft (para diagnosticar aunque el
 * staging no alcance el esquema: los null se vuelven -1, nunca iguales). */
function pseudoCard(draft: DraftCard, card: PokemonCard | null): PokemonCard {
  if (card !== null) return card
  return {
    id: idify(draft.name.value || 'x'), dex: 0, name: draft.name.value, stage: draft.stage.value ?? 'basic',
    deck: 'bosque', hp: draft.hp.value ?? -1, element: (draft.element.value ?? 'normal') as PokemonCard['element'],
    attacks: draft.attacks.map((a) => ({
      id: idify(a.name || 'ataque'), name: a.name, kind: a.kind,
      rollFaces: [...(a.rollFaces ?? [])] as never, cost: [...(a.cost ?? [])] as never,
      element: (a.element ?? 'normal') as never,
      damage: { base: a.damageBase ?? -1, ...(a.ifRoll !== null ? { ifRoll: { faces: [...a.ifRoll.faces], damage: a.ifRoll.damage } } : {}) },
      effects: [] as never, rawText: a.effectText,
    })),
    specialties: [], evolvesTo: draft.evolvesTo.map((e) => ({ id: idify(e.name), xp: e.xp })),
    source: { verified: false },
  }
}

export interface RunRead {
  readonly regions: CardRegions | null
  readonly icons: CardIcons | null
  readonly png: Buffer | null
  readonly staged: PokemonCard | null
  readonly error: string | null
  readonly ms: number | null
}

async function runRead(file: string, engine: OcrEngine, ctx: Ctx, deckHintOverride?: string): Promise<RunRead> {
  try {
    const bytes = readFileSync(file)
    const norm = await normalizeScan(bytes, ctx.cfg)
    if (!norm.ok) return { regions: null, icons: null, png: null, staged: null, error: norm.error, ms: null }
    const seg = await segmentCard(norm.png, ctx.cfg)
    if (!seg.ok) return { regions: null, icons: null, png: norm.png, staged: null, error: seg.error, ms: null }
    const t0 = Date.now()
    const regions = await readCardRegions(norm.png, seg.segmentation, engine, ctx.cfg)
    const ms = Date.now() - t0
    const icons = await extractIcons(norm.png, seg.segmentation, ctx.cfg)
    const classes = ctx.labels !== null ? classifyCardIcons(icons, ctx.labels, ctx.cfg.icons.maxDistance) : undefined
    const deckHint = deckHintOverride ?? deckFromFilename(basename(file)) ?? deckFromPath(file) ?? undefined
    const draft = analyzeCard(
      { ...regions, group: resolveGroup(file, 'auto'), ...(ctx.species !== null ? { species: ctx.species } : {}), ...(deckHint !== undefined ? { deckHint } : {}), ...(classes !== undefined ? { icons: classes } : {}) },
      ctx.cfg.validation, ctx.cfg.confidence,
    )
    const built = buildStagingCard(draft, ctx.patterns, basename(file))
    return { regions, icons, png: norm.png, staged: pseudoCard(draft, built.kind === 'ok' ? built.card : null), error: null, ms }
  } catch (e) {
    return { regions: null, icons: null, png: null, staged: null, error: e instanceof Error ? e.message : 'error inesperado', ms: null }
  }
}

const evidenceOf = (r: CardRegions): RawEvidence => ({
  hp: r.hp.text, footerStage: r.footerStage.text, footerRight: r.footerRight.text,
  blocks: r.blocks.map((b) => ({ kind: b.kind, text: b.text.text, damage: b.damage === null ? null : b.damage.text })),
})

async function evalEngine(id: OcrEngineId, label: string, engine: OcrEngine | null, note: string | undefined, pairs: readonly TruthPair[], ctx: Ctx): Promise<{ run: EngineRunResult; diags: readonly CardDiagnosis[]; reads: readonly RunRead[] }> {
  if (engine === null) return { run: { id, label, available: false, note, msPerCard: null, cards: 0, fieldHits: 0, fieldChecks: 0 }, diags: [], reads: [] }
  const diags: CardDiagnosis[] = []
  const reads: RunRead[] = []
  const times: number[] = []
  for (const p of pairs) {
    const read = await runRead(p.scan, engine, ctx, p.deckHint)
    reads.push(read)
    if (read.ms !== null) times.push(read.ms)
    if (read.staged === null || read.regions === null) {
      diags.push({ base: p.base, errors: [], checks: 0, hits: 0, byField: Object.fromEntries(DIAG_FIELDS.map((f) => [f, { checks: 0, hits: 0 }])) as CardDiagnosis['byField'] })
      continue
    }
    diags.push(diagnoseCard(p.base, read.staged, p.truth, evidenceOf(read.regions)))
  }
  const fieldChecks = diags.reduce((a, d) => a + d.checks, 0)
  const fieldHits = diags.reduce((a, d) => a + d.hits, 0)
  const msPerCard = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null
  return { run: { id, label, available: true, note, msPerCard, cards: pairs.length, fieldHits, fieldChecks }, diags, reads }
}

// --- CLI --------------------------------------------------------------------
function parseArgs(argv: readonly string[]): { setEngine?: OcrEngineId | undefined; error?: string | undefined } {
  let setEngine: OcrEngineId | undefined
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const v = argv[i + 1]
    if (a === '--set-engine' && v !== undefined) {
      if (!(OCR_ENGINE_IDS as readonly string[]).includes(v)) return { error: `motor inválido: ${v} (válidos: ${OCR_ENGINE_IDS.join('|')})\n${USAGE}` }
      setEngine = v as OcrEngineId
      i += 1
    } else return { error: `argumento desconocido o incompleto: ${a ?? ''}\n${USAGE}` }
  }
  return { setEngine }
}

async function cli(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv)
  if (args.error !== undefined) {
    console.error(`cards:eval: ${args.error}`)
    return 2
  }
  const cfg = loadScanConfig(repoRoot)
  const ctx: Ctx = { cfg, patterns: loadEffectPatterns(repoRoot), labels: loadIconLabels(repoRoot), species: loadSpecies(repoRoot) }
  const truth = collectTruth(repoRoot)
  const { pairs, unpaired, inRevision } = buildPairs(repoRoot, truth)
  const lines: string[] = [...truthWarning(pairs.length, inRevision)]
  if (unpaired.length > 0) lines.push(`verified sin escaneo comparable: ${unpaired.join(', ')}`)
  if (pairs.length === 0) {
    lines.push('sin pares: nada para medir (verificá cartas o agregá la carta de oro)')
    for (const l of lines) console.log(l)
    return 0
  }

  let tess: OcrEngine | null = null
  try {
    tess = await createTesseractEngine(cfg.ocr)
  } catch {
    tess = null
  }
  const rapid = await createRapidocrEngine()
  const runs: EngineRunResult[] = []
  let summary: EvalSummary | null = null
  let firstDiags: readonly CardDiagnosis[] = []
  let firstReads: readonly RunRead[] = []
  const specs = [...ENGINE_SPECS]
  for (const spec of specs) {
    if (spec.id === 'tesseract') {
      const r = await evalEngine(spec.id, spec.label, tess, undefined, pairs, ctx)
      runs.push(r.run)
      summary ??= summarize(r.diags)
      firstDiags = r.diags
      firstReads = r.reads
    } else if (spec.id === 'tesseract-prep') {
      const r = await evalEngine(spec.id, spec.label, tess === null ? null : withPreprocess(tess), undefined, pairs, ctx)
      runs.push(r.run)
    } else if (spec.id === 'rapidocr') {
      const r = await evalEngine(spec.id, spec.label, rapid, rapid === null ? 'python/rapidocr no disponible (ver tools/requirements-ocr.txt)' : undefined, pairs, ctx)
      runs.push(r.run)
    } else {
      runs.push({ id: spec.id, label: spec.label, available: false, note: spec.note, msPerCard: null, cards: 0, fieldHits: 0, fieldChecks: 0 })
    }
  }
  await tess?.terminate()
  await rapid?.terminate()

  lines.push(...buildEngineTable(runs))
  if (summary !== null) {
    lines.push('exactitud por campo (motor A, tesseract vigente):')
    for (const f of summary.fields) {
      if (f.checks === 0) continue
      lines.push(`  ${f.field.padEnd(18)} ${(((f.hits / f.checks) * 100).toFixed(1)).padStart(6)}%  (${f.hits}/${f.checks})`)
    }
    lines.push('causas ordenadas por cartas afectadas:')
    for (const c of summary.causes) lines.push(`  ${c.stage.padEnd(18)} ${String(c.cards).padStart(2)} carta(s) · ${c.errors} error(es)`)
    if (summary.confusions.length > 0) {
      lines.push('confusiones frecuentes:')
      for (const c of summary.confusions.slice(0, 10)) lines.push(`  ${String(c.count).padStart(3)} × ${c.pair}`)
    }
  }
  // Recortes de errores (AC-3) con el motor A (el vigente): se regeneran.
  const failDir = join(repoRoot, cfg.reportDir, 'failures')
  rmSync(failDir, { recursive: true, force: true })
  let crops = 0
  for (let i = 0; i < pairs.length; i++) {
    const read = firstReads[i]
    const diag = firstDiags[i]
    if (read === undefined || diag === undefined || read.regions === null || read.png === null) continue
    crops += await writeFailureCrops(failDir, pairs[i]!.base, diag.errors, read.regions, read.icons, read.png)
  }
  lines.push(`recortes de errores: ${crops} en ${relative(repoRoot, failDir) || failDir}`)
  mkdirSync(join(repoRoot, cfg.reportDir), { recursive: true })
  writeFileSync(
    join(repoRoot, cfg.reportDir, 'eval.json'),
    `${JSON.stringify({ pairs: pairs.map((p) => p.base), engines: runs, summary, cards: firstDiags.map((d) => ({ base: d.base, errors: d.errors })) }, null, 1)}\n`,
    'utf8',
  )

  const elegibles = runs.filter((r) => r.available && r.fieldChecks > 0)
  const mejor = elegibles.sort((a, b) => b.fieldHits / b.fieldChecks - a.fieldHits / a.fieldChecks || (a.msPerCard ?? 1e9) - (b.msPerCard ?? 1e9))[0]
  const chosen = args.setEngine ?? (mejor !== undefined ? mejor.id : undefined)
  if (chosen !== undefined) {
    const path = setOcrEngine(repoRoot, chosen)
    lines.push(`motor elegido: ${chosen} → ${relative(repoRoot, path) || path} (ocr.engine)`)
  } else if (mejor !== undefined) {
    lines.push(`recomendado: ${mejor.id} (corré con --set-engine ${mejor.id} para persistirlo)`)
  }
  for (const l of lines) console.log(l)
  return 0
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  cli(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code
    },
    (e) => {
      console.error(`cards:eval: ${e instanceof Error ? e.message : 'error inesperado'}`)
      process.exitCode = 1
    },
  )
}
