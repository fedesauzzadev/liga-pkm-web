// cards:status (.opencode/plan/estado-ingesta-cartas.md, T-106) — ¿en qué estado
// está la ingesta de cartas? En una sola corrida determinista: esperadas
// (manifiesto de fotos), escaneadas (photos/scans), staging ok / con error,
// curadas y verificadas (collect de content) y efectos custom pendientes.
// Estilo tools/digest.ts: sin timestamps, duraciones ni rutas absolutas;
// mismo estado del repo ⇒ mismas líneas (≤ 60). Solo lectura: no cura nada.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { collect } from '../packages/content/src/validate.ts'

const MAX_LINES = 60
const byName = (a: { name: string }, b: { name: string }): number => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

/** Canónicos de la spec (AC-2): terreno por mazo, después el resto. */
export const BUCKETS = [
  'bosque', 'isla', 'llanura', 'montana', 'pantano', 'evolucion', 'sorpresa', 'gimnasio', 'liga', 'iniciales',
] as const
export type Bucket = (typeof BUCKETS)[number] | 'otros'

const BUCKET_SET: ReadonlySet<string> = new Set(BUCKETS)

// Carpeta del escaneo → bucket (convención Q-081, misma tabla que
// tools/cards-scan/run.ts: scans/<grupo>[/<mazo>]/*.jpg).
const PATH_DECKS: ReadonlyArray<readonly [string, Bucket]> = [
  ['bosque', 'bosque'], ['montana', 'montana'], ['isla', 'isla'], ['llanura', 'llanura'], ['pantano', 'pantano'],
  ['evolution', 'evolucion'], ['sorpresa', 'sorpresa'], ['gym', 'gimnasio'], ['league', 'liga'], ['iniciales', 'iniciales'],
]

// Sufijo del nombre de archivo → bucket (convención del dueño, Q-081:
// "X Bosque.jpg", "Abra S.jpg", token "Evo").
const DECK_SUFFIXES: ReadonlyArray<readonly [string, Bucket]> = [
  [' gym', 'gimnasio'], [' league', 'liga'], [' s', 'sorpresa'],
  [' bosque', 'bosque'], [' isla', 'isla'], [' llanura', 'llanura'], [' montana', 'montana'], [' pantano', 'pantano'],
]

export function deckFromFilename(name: string): Bucket | null {
  const base = name.toLowerCase().replace(/\.(jpe?g|png)$/i, '')
  for (const [suf, deck] of DECK_SUFFIXES) if (base.endsWith(suf)) return deck
  if (/(^|[ _-])evo([ _-]|$)/.test(base)) return 'evolucion'
  return null
}

function bucketFromPath(rel: string): Bucket | null {
  const segs = rel.split(/[\\/]/).map((s) => s.toLowerCase())
  for (const [seg, deck] of PATH_DECKS) if (segs.includes(seg)) return deck
  return null
}

// ── Conteos: total + desglose por bucket en un Map (siempre ordenado al render).
export interface Totals {
  readonly total: number
  readonly per: ReadonlyMap<Bucket, number>
}

function inc(per: Map<Bucket, number>, bucket: Bucket | null): void {
  const key = bucket !== null ? bucket : 'otros'
  per.set(key, (per.get(key) ?? 0) + 1)
}

function incN(per: Map<Bucket, number>, bucket: Bucket | null, n: number): void {
  const key = bucket !== null ? bucket : 'otros'
  per.set(key, (per.get(key) ?? 0) + n)
}

const of = (t: Totals | null, b: Bucket): number => t?.per.get(b) ?? 0

// ── Manifiesto de fotos: esperadas por grupo/mazo (grupo 'terreno' desglosa por mazo).
function csvFields(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (const ch of line) {
    if (quoted) {
      if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function csvBucket(grupo: string, mazo: string): Bucket | null {
  const key = grupo === 'terreno' ? mazo : grupo
  return BUCKET_SET.has(key) ? (key as Bucket) : null
}

export function readManifest(csv: string): Totals & { photos: number } | null {
  if (!existsSync(csv)) return null
  const per = new Map<Bucket, number>()
  let total = 0
  let photos = 0
  const lines = readFileSync(csv, 'utf8').split(/\r?\n/)
  for (const [i, line] of lines.entries()) {
    if (i === 0 || line.trim() === '') continue // encabezado
    const f = csvFields(line)
    const n = Number.parseInt(f[3] ?? '', 10)
    const esperadas = Number.isFinite(n) ? n : 0
    incN(per, csvBucket(f[1] ?? '', f[2] ?? ''), esperadas)
    total += esperadas
    photos++
  }
  return { total, photos, per }
}

// ── Escaneos: *.jpg (recursivo) clasificados por ruta (Q-081).
function listJpgs(dir: string, rel: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true }).sort(byName)) {
    const r = rel === '' ? e.name : `${rel}/${e.name}`
    if (e.isDirectory()) listJpgs(join(dir, e.name), r, out)
    else if (e.name.toLowerCase().endsWith('.jpg')) out.push(r)
  }
}

export function countScans(scansDir: string): Totals | null {
  if (!existsSync(scansDir)) return null
  const files: string[] = []
  listJpgs(scansDir, '', files)
  const per = new Map<Bucket, number>()
  for (const f of files) inc(per, bucketFromPath(f))
  return { total: files.length, per }
}

// ── Staging: un *.json por carta; bucket desde el contenido (deck del draft /
// de la carta, respaldo foto → sufijo del nombre, Q-081).
const isRec = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null

function bucketOfStaging(raw: unknown): Bucket | null {
  if (!isRec(raw)) return null
  const photo = typeof raw.photo === 'string' ? raw.photo : null
  const first = Array.isArray(raw.cards) && isRec(raw.cards[0]) ? raw.cards[0] : null
  const deck = first !== null && typeof first.deck === 'string' ? first.deck : null
  if (deck !== null && BUCKET_SET.has(deck)) return deck as Bucket
  const src = first !== null && isRec(first.source) && typeof first.source.photo === 'string' ? first.source.photo : null
  if (photo !== null) return deckFromFilename(photo)
  return src !== null ? deckFromFilename(src) : null
}

function bucketOfError(raw: unknown): Bucket | null {
  if (!isRec(raw)) return null
  const draft = isRec(raw.draft) ? raw.draft : null
  const deck = draft !== null && typeof draft.deck === 'string' ? draft.deck : null
  if (deck !== null && BUCKET_SET.has(deck)) return deck as Bucket
  return typeof raw.photo === 'string' ? deckFromFilename(raw.photo) : null
}

/** Archivos *.json directos de un directorio, clasificados con `bucketOf`. */
export function countJsonDir(dir: string, bucketOf: (raw: unknown) => Bucket | null): Totals | null {
  if (!existsSync(dir)) return null
  const per = new Map<Bucket, number>()
  let total = 0
  for (const e of readdirSync(dir, { withFileTypes: true }).sort(byName)) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue
    total++
    let bucket: Bucket | null = null
    try {
      bucket = bucketOf(JSON.parse(readFileSync(join(dir, e.name), 'utf8')) as unknown)
    } catch {
      bucket = null // JSON roto: cuenta como archivo, sin clasificar
    }
    inc(per, bucket)
  }
  return { total, per }
}

// ── Curadas y verificadas: mismas stats que el digest (collect de content).
export interface Curadas {
  readonly cards: number
  readonly verified: number
  readonly unverified: number
  readonly customs: number
}

function curadasOf(root: string): Curadas {
  try {
    const { stats } = collect(join(root, 'content'))
    return {
      cards: stats.cards,
      verified: stats.verifiedCards,
      unverified: stats.unverifiedCards,
      customs: stats.customEffects,
    }
  } catch {
    return { cards: 0, verified: 0, unverified: 0, customs: 0 }
  }
}

// ── Ensamble: puro, determinista y acotado a MAX_LINES.
export function buildStatusLines(root: string): string[] {
  const manifest = readManifest(join(root, 'content', 'photo-manifest.csv'))
  const scans = countScans(join(root, 'content', 'photos', 'scans'))
  const stagingDir = join(root, 'content', 'pokemon', '_staging')
  const ok = countJsonDir(stagingDir, bucketOfStaging)
  const errs = countJsonDir(join(stagingDir, '_errors'), bucketOfError)
  const cur = curadasOf(root)
  const lines: string[] = [
    '# ingesta de cartas — cards:status',
    `esperadas: ${manifest === null ? '— (falta content/photo-manifest.csv)' : `${manifest.total} (${manifest.photos} fotos del CSV)`} · ` +
      `escaneadas: ${scans === null ? '— (sin content/photos/scans)' : scans.total} · ` +
      `staging ok: ${ok === null ? 0 : ok.total} · staging con error: ${errs === null ? 0 : errs.total}`,
    `curadas: ${cur.cards} (${cur.verified} verificadas · ${cur.unverified} sin verificar) · ` +
      `efectos custom pendientes: ${cur.customs}`,
  ]
  if (scans !== null && errs !== null && errs.total > scans.total) {
    lines.push(
      `aviso: staging con error (${errs.total}) > escaneadas (${scans.total}): ` +
        'acumuladas de corridas anteriores — ver scan-reports/report.html',
    )
  }
  const row = (label: string, ...counts: readonly number[]): string =>
    `  ${`${label}:`.padEnd(10)}${counts.map((n) => String(n).padStart(3)).join(' · ')}`
  lines.push('', 'por grupo/mazo (esperadas · escaneadas · staging ok · errores):')
  for (const b of BUCKETS) lines.push(row(b, of(manifest, b), of(scans, b), of(ok, b), of(errs, b)))
  if ([manifest, scans, ok, errs].some((t) => of(t, 'otros') > 0)) {
    lines.push(row('otros', of(manifest, 'otros'), of(scans, 'otros'), of(ok, 'otros'), of(errs, 'otros')))
  }
  lines.push(row('total', manifest?.total ?? 0, scans?.total ?? 0, ok?.total ?? 0, errs?.total ?? 0))
  if (lines.length > MAX_LINES) {
    return [...lines.slice(0, MAX_LINES - 1), `… (recortado de ${lines.length} líneas; límite T-106: ${MAX_LINES})`]
  }
  return lines
}

// ── CLI: pnpm cards:status [--root <dir>] — siempre exit 0 salvo uso inválido.
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  const args = process.argv.slice(2)
  let root = repoRoot
  if (args.length === 0) root = repoRoot
  else if (args[0] === '--root' && args[1] !== undefined && args.length === 2) root = resolve(args[1])
  if (args.length === 0 || (args[0] === '--root' && args[1] !== undefined && args.length === 2)) {
    console.log(buildStatusLines(root).join('\n'))
  } else {
    console.error('uso: pnpm cards:status [--root <dir>]')
    process.exitCode = 2
  }
}
