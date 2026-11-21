// cards-scan/segcheck (SPEC-T/T-104/AC-4..5) — CLI `pnpm cards:segcheck`:
// re-segmenta todos los escaneos con el perfil que corresponde (por nombre de
// archivo y carpeta), mide el criterio de éxito (≥ 1 bloque de ataque y pie
// encontrado en todos; cantidad de bloques igual a la verdad terreno cuando
// exista; ≥ 95 % en gimnasio+Liga y 100 % en las demás), REGENERA las
// superposiciones debug/*.png para el dueño y lista las imágenes que siguen
// fallando con el motivo concreto (solo entonces se pide volver a escanear).
// Núcleo puro inyectable ⇒ testeable; CLI gated por invokedDirectly.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadScanConfig } from './config.ts'
import { normalizeScan } from './image.ts'
import { segmentCard, type SegProfile } from './segment.ts'
import { parseFilename, profileOf, loadSpecies, resolveGroup } from './filename.ts'
import { debugPng } from './debug.ts'
import { listImages } from './run.ts'
import { buildPairs, collectTruth } from './eval.ts'
import type { CardGroup } from './analyze.ts'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const USAGE = 'uso: pnpm cards:segcheck [carpeta] [--out <dir>]'

export interface SegRow {
  readonly file: string
  readonly group: CardGroup
  readonly profile: SegProfile
  readonly ok: boolean
  /** true = la FOTO no pasa la normalización (recorte/proporción): se pide
   * re-escanear; no cuenta para la meta de segmentación (no se pudo medir). */
  readonly photoRejected: boolean
  readonly attacks: number
  readonly blocks: number
  readonly expectedBlocks: number | null
  readonly reasons: readonly string[]
}

export interface SegBucket {
  readonly ok: number
  readonly total: number
}

export interface SegSummary {
  readonly total: number
  readonly rows: readonly SegRow[]
  readonly gymLeague: SegBucket
  readonly others: SegBucket
  readonly ok: boolean
  readonly lines: readonly string[]
}

const pct = (ok: number, total: number): number => (total === 0 ? 100 : (ok / total) * 100)

export interface SegCheckOptions {
  /** Carpeta de escaneos (default: content/photos/scans del root). */
  readonly input?: string | undefined
  /** Raíz del repo (verdad terreno, config, especies); default: el real. */
  readonly root?: string | undefined
  readonly outDir?: string | undefined
}

export async function segCheck(opts: SegCheckOptions = {}): Promise<SegSummary> {
  const root = opts.root ?? repoRoot
  const cfg = loadScanConfig(root)
  const input = opts.input ?? join(root, 'content', 'photos', 'scans')
  const outDir = opts.outDir ?? join(root, cfg.reportDir)
  const debugDir = join(outDir, 'debug')
  mkdirSync(debugDir, { recursive: true })
  const species = loadSpecies(root)

  // Verdad terreno: pares del T-103 ⇒ conteo de bloques esperado por escaneo.
  const truth = collectTruth(root)
  const expectedByScan = new Map<string, number>()
  for (const p of buildPairs(root, truth).pairs) {
    expectedByScan.set(basename(p.scan), p.truth.attacks.length + p.truth.specialties.length)
  }

  const rows: SegRow[] = []
  for (const file of listImages(input)) {
    const fi = parseFilename(basename(file), species)
    const group = fi.group ?? resolveGroup(file, 'auto')
    const profile = profileOf(group)
    const reasons: string[] = []
    let attacks = 0
    let blocks = 0
    try {
      const norm = await normalizeScan(readFileSync(file), cfg)
      if (!norm.ok) reasons.push(norm.error)
      else {
        const seg = await segmentCard(norm.png, cfg, profile)
        if (!seg.ok) reasons.push(seg.error)
        else {
          attacks = seg.segmentation.attacks.length
          blocks = seg.segmentation.blocks.length
          if (attacks < 1) reasons.push('sin bloques de ataque')
          if (seg.segmentation.footerLine.h <= 0) reasons.push('sin línea del pie')
          const expected = expectedByScan.get(basename(file)) ?? null
          if (expected !== null && blocks !== expected) reasons.push(`cantidad de bloques ${blocks} ≠ verdad terreno ${expected}`)
          // Superposición de debug regenerada para el dueño (AC-4).
          writeFileSync(join(debugDir, `${basename(file).replace(/\.(jpe?g|png)$/i, '')}.png`), await debugPng(norm.png, seg.segmentation))
        }
      }
    } catch (e) {
      reasons.push(e instanceof Error ? e.message : 'error inesperado')
    }
    rows.push({
      file: basename(file),
      group,
      profile,
      ok: reasons.length === 0,
      photoRejected: reasons.some((r) => r.includes('no parece una carta')),
      attacks,
      blocks,
      expectedBlocks: expectedByScan.get(basename(file)) ?? null,
      reasons,
    })
  }

  const isGL = (r: SegRow): boolean => !r.photoRejected && (r.group === 'gym' || r.group === 'league')
  const ot = rows.filter((r) => !r.photoRejected && !isGL(r))
  const gl = rows.filter(isGL)
  const photos = rows.filter((r) => r.photoRejected)
  const gymLeague: SegBucket = { ok: gl.filter((r) => r.ok).length, total: gl.length }
  const others: SegBucket = { ok: ot.filter((r) => r.ok).length, total: ot.length }
  const glPct = pct(gymLeague.ok, gymLeague.total)
  const otPct = pct(others.ok, others.total)
  const ok = glPct >= 95 && otPct >= 100

  const lines: string[] = [`segmentación por perfil sobre ${rows.length} escaneo(s):`]
  lines.push(`gimnasio+Liga: ${gymLeague.ok}/${gymLeague.total} (${glPct.toFixed(1)} %) — meta ≥ 95 %`)
  lines.push(`demás grupos: ${others.ok}/${others.total} (${otPct.toFixed(1)} %) — meta 100 %`)
  if (photos.length > 0) {
    lines.push(`fotos que no pasan la normalización (re-escanear la FOTO, no es la segmentación): ${photos.length}`)
    for (const r of photos) lines.push(`  FOTO ${r.file}: ${r.reasons.join(' · ')}`)
  }
  const fallan = rows.filter((r) => !r.ok && !r.photoRejected)
  if (fallan.length === 0) lines.push('todas las imágenes medibles segmentan bien: no hace falta re-escanear nada')
  else {
    lines.push(`siguen fallando ${fallan.length} (motivo concreto):`)
    for (const r of fallan) lines.push(`  FALLA ${r.file} [${r.group}/${r.profile}]: ${r.reasons.join(' · ')}`)
    lines.push('solo esas: volver a escanear y reemplazar el archivo con el mismo nombre')
  }

  writeFileSync(
    join(outDir, 'segmentation.json'),
    `${JSON.stringify({ ok, gymLeague, others, rows }, null, 1)}\n`,
    'utf8',
  )
  lines.push(`informe: ${relative(root, join(outDir, 'segmentation.json')) || 'segmentation.json'} · superposiciones en ${relative(root, debugDir) || 'debug/'}`)
  return { total: rows.length, rows, gymLeague, others, ok, lines }
}

async function cli(argv: readonly string[]): Promise<number> {
  let input: string | undefined
  let outDir: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg === '--out' && next !== undefined) {
      outDir = next
      i += 1
    } else if (arg !== undefined && !arg.startsWith('--')) input = arg
    else {
      console.error(`cards:segcheck: argumento desconocido o incompleto: ${arg ?? ''}\n${USAGE}`)
      return 2
    }
  }
  const target = input ?? join(repoRoot, 'content', 'photos', 'scans')
  if (!existsSync(target)) {
    console.error(`cards:segcheck: no se encontró ${target}`)
    return 1
  }
  const res = await segCheck({ ...(input !== undefined ? { input } : {}), ...(outDir !== undefined ? { outDir } : {}) })
  for (const l of res.lines) console.log(l)
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
      console.error(`cards:segcheck: ${e instanceof Error ? e.message : 'error inesperado'}`)
      process.exitCode = 1
    },
  )
}
