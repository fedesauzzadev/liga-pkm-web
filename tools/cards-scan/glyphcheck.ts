// cards-scan/glyphcheck (SPEC-T/T-105/AC-4) — CLI `pnpm cards:glyphs:check`:
// mide la exactitud del reconocedor de glifos sobre la verdad terreno (pares
// de T-103: cartas verified + la carta de oro): HP ≥ 98 %, caras del dado
// ≥ 95 %, daño ≥ 97 %. Sin OCR (los glifos son locales y rápidos); requiere
// `content/cards/glyph-labels.json` (cards:glyphs:learn + etiquetado del
// dueño). Lista cada fallo con el valor esperado/leído y escribe
// `scan-reports/glyphs.json`. Núcleo inyectable ⇒ testeable.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadScanConfig } from './config.ts'
import { normalizeScan } from './image.ts'
import { segmentCard } from './segment.ts'
import { parseFilename, profileOf, loadSpecies, resolveGroup } from './filename.ts'
import { extractGlyphs, type CardGlyphs } from './glyphs.ts'
import { classifyGlyph, loadGlyphLabels, readDamageNumber, readFacesPrefix, readHpNumber, type GlyphLabels } from './gclassify.ts'
import { buildPairs, collectTruth, type TruthPair } from './eval.ts'
import type { PokemonCard } from '../../packages/content/src/cards.ts'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const USAGE = 'uso: pnpm cards:glyphs:check [--out <dir>]'

export interface GlyphFieldAcc {
  readonly hits: number
  readonly checks: number
}

export interface GlyphCheckSummary {
  readonly pairs: number
  readonly hp: GlyphFieldAcc
  readonly faces: GlyphFieldAcc
  readonly damage: GlyphFieldAcc
  readonly ok: boolean
  readonly lines: readonly string[]
}

export interface GlyphCheckOptions {
  /** Raíz del repo (verdad terreno, config, etiquetas); default: el real. */
  readonly root?: string | undefined
  readonly outDir?: string | undefined
  /** Etiquetas inyectables para tests; default: content/cards/glyph-labels.json. */
  readonly labels?: GlyphLabels | undefined
}

const pct = (a: GlyphFieldAcc): number => (a.checks === 0 ? 100 : (a.hits / a.checks) * 100)

interface FieldFail {
  readonly base: string
  readonly campo: string
  readonly esperado: string
  readonly leido: string
}

/** Lee los glifos de un par y compara contra la verdad terreno. */
async function checkPair(
  pair: TruthPair, labels: GlyphLabels, root: string,
): Promise<{ hp: GlyphFieldAcc; faces: GlyphFieldAcc; damage: GlyphFieldAcc; fails: FieldFail[]; error: string | null }> {
  const cfg = loadScanConfig(root)
  try {
    const norm = await normalizeScan(readFileSync(pair.scan), cfg)
    if (!norm.ok) return { hp: { hits: 0, checks: 0 }, faces: { hits: 0, checks: 0 }, damage: { hits: 0, checks: 0 }, fails: [], error: norm.error }
    const species = loadSpecies(root)
    const fi = parseFilename(basename(pair.scan), species)
    const group = fi.group ?? resolveGroup(pair.scan, 'auto')
    const seg = await segmentCard(norm.png, cfg, profileOf(group))
    if (!seg.ok) return { hp: { hits: 0, checks: 0 }, faces: { hits: 0, checks: 0 }, damage: { hits: 0, checks: 0 }, fails: [], error: seg.error }
    const glyphs: CardGlyphs = await extractGlyphs(norm.png, seg.segmentation, cfg)
    return compareWithTruth(glyphs, pair.truth, labels, cfg.glyphs.maxDistance, cfg.validation.hp, cfg.validation.damage, basename(pair.scan))
  } catch (e) {
    return { hp: { hits: 0, checks: 0 }, faces: { hits: 0, checks: 0 }, damage: { hits: 0, checks: 0 }, fails: [], error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

/** Núcleo puro: glifos ya extraídos vs verdad terreno. */
export function compareWithTruth(
  glyphs: CardGlyphs, truth: PokemonCard, labels: GlyphLabels, maxDistance: number,
  hpRange: { min: number; max: number; multipleOf: number }, dmgRange: { min: number; max: number; multipleOf: number }, base: string,
): { hp: GlyphFieldAcc; faces: GlyphFieldAcc; damage: GlyphFieldAcc; fails: FieldFail[]; error: null } {
  const fails: FieldFail[] = []
  const hpRead = readHpNumber(glyphs.hp.map((p) => classifyGlyph(p, labels, maxDistance)), hpRange)
  const hpAcc: GlyphFieldAcc = { hits: hpRead.value === truth.hp ? 1 : 0, checks: 1 }
  if (hpRead.value !== truth.hp) fails.push({ base, campo: 'hp', esperado: String(truth.hp), leido: hpRead.value === null ? 'null' : String(hpRead.value) })

  let facesHits = 0
  let facesChecks = 0
  let dmgHits = 0
  let dmgChecks = 0
  truth.attacks.forEach((atk, i) => {
    const g = glyphs.attacks[i]
    if (g === undefined) return
    const facesRead = readFacesPrefix(g.prefix.map((p) => classifyGlyph(p, labels, maxDistance)))
    const expectedFaces = [...atk.rollFaces]
    facesChecks += 1
    if (JSON.stringify(facesRead.value) === JSON.stringify(expectedFaces)) facesHits += 1
    else fails.push({ base, campo: `caras #${i + 1}`, esperado: expectedFaces.join('-') || 'null', leido: facesRead.value === null ? 'null' : facesRead.value.join('-') })
    // Habilidades: sin daño visible (base 0 del esquema = "no imprime daño").
    const expectedDmg = atk.kind === 'ability' ? null : atk.damage.base
    const dmgRead = readDamageNumber(g.damage.map((p) => classifyGlyph(p, labels, maxDistance)), dmgRange)
    dmgChecks += 1
    if (dmgRead.value === expectedDmg || (expectedDmg === 0 && dmgRead.value === null)) dmgHits += 1
    else fails.push({ base, campo: `daño #${i + 1}`, esperado: expectedDmg === null ? 'null' : String(expectedDmg), leido: dmgRead.value === null ? 'null' : String(dmgRead.value) })
  })
  return {
    hp: hpAcc,
    faces: { hits: facesHits, checks: facesChecks },
    damage: { hits: dmgHits, checks: dmgChecks },
    fails,
    error: null,
  }
}

/** Mide la exactitud de glifos sobre la verdad terreno (AC-4). */
export async function glyphCheck(opts: GlyphCheckOptions = {}): Promise<GlyphCheckSummary> {
  const root = opts.root ?? repoRoot
  const cfg = loadScanConfig(root)
  const outDir = opts.outDir ?? join(root, cfg.reportDir)
  const lines: string[] = []
  const labels = opts.labels ?? loadGlyphLabels(root)
  if (labels === null || labels.glyphs.length === 0) {
    const sin = ['falta content/cards/glyph-labels.json: corré pnpm cards:glyphs:learn <carpeta de escaneos>, etiquetá los grupos en glyphs.html y exportalo a content/cards/']
    return { pairs: 0, hp: { hits: 0, checks: 0 }, faces: { hits: 0, checks: 0 }, damage: { hits: 0, checks: 0 }, ok: false, lines: sin }
  }
  const truth = collectTruth(root)
  const { pairs } = buildPairs(root, truth)
  if (pairs.length === 0) {
    return {
      pairs: 0, hp: { hits: 0, checks: 0 }, faces: { hits: 0, checks: 0 }, damage: { hits: 0, checks: 0 }, ok: false,
      lines: ['sin pares: verdad terreno insuficiente (verificá cartas o agregá la carta de oro; ver cards:eval)'],
    }
  }
  const fails: FieldFail[] = []
  let hp: GlyphFieldAcc = { hits: 0, checks: 0 }
  let faces: GlyphFieldAcc = { hits: 0, checks: 0 }
  let damage: GlyphFieldAcc = { hits: 0, checks: 0 }
  let errores = 0
  for (const p of pairs) {
    const r = await checkPair(p, labels, root)
    if (r.error !== null) {
      errores += 1
      lines.push(`error   ${basename(p.scan)}: ${r.error}`)
      continue
    }
    hp = { hits: hp.hits + r.hp.hits, checks: hp.checks + r.hp.checks }
    faces = { hits: faces.hits + r.faces.hits, checks: faces.checks + r.faces.checks }
    damage = { hits: damage.hits + r.damage.hits, checks: damage.checks + r.damage.checks }
    fails.push(...r.fails)
  }
  const ok = hp.checks > 0 && pct(hp) >= 98 && pct(faces) >= 95 && pct(damage) >= 97
  lines.push(`glifos sobre ${pairs.length} par(es) de verdad terreno (${errores} con error):`)
  lines.push(`  HP      ${pct(hp).toFixed(1)} %  (${hp.hits}/${hp.checks}) — meta ≥ 98 %`)
  lines.push(`  caras   ${pct(faces).toFixed(1)} %  (${faces.hits}/${faces.checks}) — meta ≥ 95 %`)
  lines.push(`  daño    ${pct(damage).toFixed(1)} %  (${damage.hits}/${damage.checks}) — meta ≥ 97 %`)
  if (fails.length > 0) {
    lines.push(`fallos (${fails.length}):`)
    for (const f of fails) lines.push(`  ${f.base} · ${f.campo}: esperado ${f.esperado} ≠ leído ${f.leido}`)
  } else lines.push('sin fallos: HP, caras y daño al 100 % en los pares medidos')
  mkdirSync(outDir, { recursive: true })
  const reportPath = join(outDir, 'glyphs.json')
  writeFileSync(reportPath, `${JSON.stringify({ ok, pairs: pairs.length, hp, faces, damage, fails }, null, 1)}\n`, 'utf8')
  lines.push(`informe: ${relative(root, reportPath) || reportPath}`)
  return { pairs: pairs.length, hp, faces, damage, ok, lines }
}

async function cli(argv: readonly string[]): Promise<number> {
  let outDir: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg === '--out' && next !== undefined) {
      outDir = next
      i += 1
    } else {
      console.error(`cards:glyphs:check: argumento desconocido o incompleto: ${arg ?? ''}\n${USAGE}`)
      return 2
    }
  }
  const res = await glyphCheck({ ...(outDir !== undefined ? { outDir } : {}) })
  for (const l of res.lines) console.log(l)
  return 0
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  cli(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code
    },
    (e) => {
      console.error(`cards:glyphs:check: ${e instanceof Error ? e.message : 'error inesperado'}`)
      process.exitCode = 1
    },
  )
}
