// assets (SPEC-E/T-043) — descarga sprites frente/espalda de los 151 PKM de Kanto y las
// imágenes fx del adaptador a apps/web/public/{sprites,fx}; genera sprites.json ({dex:{front,back}})
// y fx.json ({key:ruta}). Red inyectada (Fetcher) ⇒ núcleo testeable sin red. Nada de esto se
// commitea (.gitignore); los faltantes se reportan y quedan null/ausentes (fallback visual en UI).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const SPRITES_DIR = 'sprites'
export const FX_DIR = 'fx'

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type FetchResult = { ok: true; bytes: Uint8Array } | { ok: false; status: number; error?: string }
export type Fetcher = (url: string) => Promise<FetchResult>
export type Sleeper = (ms: number) => Promise<void>

export interface SpeciesEntry {
  dex: number
  name: string
  sdId?: string
}
export interface FxEntry {
  key: string
  file: string
}
export interface AssetSources {
  aniFront: string
  aniBack: string
  staticFront: string
  staticBack: string
  fx: string
}
export interface AssetsConfig {
  sources: AssetSources
  retries: number
  species: SpeciesEntry[]
  fx: FxEntry[]
}

export class ConfigError extends Error {}

// ── Config (fuente configurable, AC-1): validación manual con errores claros ──
const isRec = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null

function reqStr(obj: Record<string, unknown>, key: string, what: string): string {
  const v = obj[key]
  if (typeof v !== 'string' || v.length === 0) throw new ConfigError(`${what}: falta "${key}" (string)`)
  return v
}

function parseSpecies(raw: unknown): SpeciesEntry[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new ConfigError('species: lista vacía')
  const seenDex = new Set<number>()
  const seenId = new Set<string>()
  const out: SpeciesEntry[] = []
  for (const item of raw) {
    if (!isRec(item)) throw new ConfigError('species: cada entrada debe ser objeto {dex,name,sdId?}')
    const dex = item.dex
    const name = reqStr(item, 'name', 'species')
    if (typeof dex !== 'number' || !Number.isInteger(dex) || dex < 1 || dex > 151) {
      throw new ConfigError(`species: dex inválido en "${name}"`)
    }
    if (seenDex.has(dex)) throw new ConfigError(`species: dex ${dex} duplicado`)
    seenDex.add(dex)
    const sdRaw = item.sdId
    if (sdRaw !== undefined && (typeof sdRaw !== 'string' || !/^[a-z0-9]+$/.test(sdRaw))) throw new ConfigError(`species: sdId inválido para dex ${dex}`)
    const entry: SpeciesEntry = sdRaw === undefined ? { dex, name } : { dex, name, sdId: sdRaw }
    const id = sdRaw ?? toShowdownId(name)
    if (id.length === 0) throw new ConfigError(`species: id Showdown vacío para dex ${dex} ("${name}")`)
    if (seenId.has(id)) throw new ConfigError(`species: id Showdown duplicado "${id}"`)
    seenId.add(id)
    out.push(entry)
  }
  return out
}

function parseFx(raw: unknown): FxEntry[] {
  if (!Array.isArray(raw)) throw new ConfigError('fx: debe ser lista')
  const seen = new Set<string>()
  const out: FxEntry[] = []
  for (const item of raw) {
    if (!isRec(item)) throw new ConfigError('fx: cada entrada debe ser objeto {key,file}')
    const key = reqStr(item, 'key', 'fx')
    const file = reqStr(item, 'file', 'fx')
    if (!/^[a-z0-9-]+$/.test(key)) throw new ConfigError(`fx key inválido: "${key}"`)
    if (file.includes('/') || file.includes('\\') || file.includes('..')) throw new ConfigError(`fx file inválido: "${file}"`)
    if (seen.has(key)) throw new ConfigError(`fx key duplicado: "${key}"`)
    seen.add(key)
    out.push({ key, file })
  }
  return out
}

function parseSources(raw: unknown): AssetSources {
  if (!isRec(raw)) throw new ConfigError('sources: falta objeto con las 5 fuentes')
  const s: AssetSources = {
    aniFront: reqStr(raw, 'aniFront', 'sources'),
    aniBack: reqStr(raw, 'aniBack', 'sources'),
    staticFront: reqStr(raw, 'staticFront', 'sources'),
    staticBack: reqStr(raw, 'staticBack', 'sources'),
    fx: reqStr(raw, 'fx', 'sources'),
  }
  for (const [key, ph] of Object.entries({
    aniFront: '{id}',
    aniBack: '{id}',
    staticFront: '{dex}',
    staticBack: '{dex}',
    fx: '{file}',
  }) as Array<[keyof AssetSources, string]>) {
    if (!s[key].includes(ph)) throw new ConfigError(`sources.${key} debe contener ${ph}`)
    if (!s[key].startsWith('https://')) throw new ConfigError(`sources.${key} debe ser https://`)
  }
  return s
}

export function parseConfig(raw: unknown): AssetsConfig {
  if (!isRec(raw)) throw new ConfigError('la config debe ser un objeto JSON')
  const retries = raw.retries === undefined ? 2 : raw.retries
  if (typeof retries !== 'number' || !Number.isInteger(retries) || retries < 0 || retries > 5) {
    throw new ConfigError('retries: entero 0..5')
  }
  return {
    sources: parseSources(raw.sources),
    retries,
    species: parseSpecies(raw.species),
    fx: parseFx(raw.fx),
  }
}

// ── Plan de descarga ──────────────────────────────────────────────────────────
export type Side = 'front' | 'back'
export interface Candidate {
  url: string
  destRel: string
}
export interface SpriteTask {
  kind: 'sprite'
  id: string
  dex: number
  name: string
  side: Side
  candidates: Candidate[]
}
export interface FxTask {
  kind: 'fx'
  id: string
  key: string
  candidates: Candidate[]
}
export type PlanTask = SpriteTask | FxTask

/** Id de sprite de Showdown: minúsculas, solo [a-z0-9] ("Mr. Mime"→"mrmime"). */
export function toShowdownId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function buildPlan(config: AssetsConfig): PlanTask[] {
  const s = config.sources
  const tasks: PlanTask[] = []
  for (const sp of [...config.species].sort((a, b) => a.dex - b.dex)) {
    const id = sp.sdId ?? toShowdownId(sp.name)
    for (const side of ['front', 'back'] as const) {
      const suffix = side === 'back' ? '-back' : ''
      tasks.push({
        kind: 'sprite',
        id: `s:${sp.dex}:${side}`,
        dex: sp.dex,
        name: sp.name,
        side,
        candidates: [
          {
            url: (side === 'front' ? s.aniFront : s.aniBack).replace('{id}', id),
            destRel: `${SPRITES_DIR}/${sp.dex}${suffix}.gif`,
          },
          {
            url: (side === 'front' ? s.staticFront : s.staticBack).replace('{dex}', String(sp.dex)),
            destRel: `${SPRITES_DIR}/${sp.dex}${suffix}.png`,
          },
        ],
      })
    }
  }
  for (const f of config.fx) {
    tasks.push({
      kind: 'fx',
      id: `f:${f.key}`,
      key: f.key,
      candidates: [{ url: s.fx.replace('{file}', f.file), destRel: `${FX_DIR}/${f.file}` }],
    })
  }
  return tasks
}

// ── Ejecución: reintentos (5xx/red), 4xx definitivo, fallback entre candidatos ─
export interface TaskReport {
  id: string
  label: string
  status: 'ok' | 'missing'
  url: string | null
  destRel: string | null
  reason: string | null
  attempts: number
}
type TaskOutcome = { report: TaskReport; bytes: Uint8Array | null }

interface RunDeps {
  fetcher: Fetcher
  sleeper: Sleeper
  retries: number
}

async function fetchCandidate(c: Candidate, deps: RunDeps): Promise<{ res: FetchResult; tries: number }> {
  let last: FetchResult = { ok: false, status: 0, error: 'sin intentos' }
  let tries = 0
  for (let attempt = 1; attempt <= deps.retries + 1; attempt++) {
    if (attempt > 1) await deps.sleeper(500 * (attempt - 1))
    tries = attempt
    try {
      last = await deps.fetcher(c.url)
    } catch (err) {
      last = { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) }
    }
    if (last.ok || (last.status >= 400 && last.status < 500)) break
  }
  return { res: last, tries }
}

async function runTask(task: PlanTask, deps: RunDeps): Promise<TaskOutcome> {
  const label = task.kind === 'sprite' ? `${task.dex} ${task.name} ${task.side}` : `fx ${task.key}`
  let attempts = 0
  for (const c of task.candidates) {
    const { res, tries } = await fetchCandidate(c, deps)
    attempts += tries
    if (res.ok) {
      return { report: { id: task.id, label, status: 'ok', url: c.url, destRel: c.destRel, reason: null, attempts }, bytes: res.bytes }
    }
  }
  return { report: { id: task.id, label, status: 'missing', url: null, destRel: null, reason: 'sin fuente disponible', attempts }, bytes: null }
}

export const defaultFetcher: Fetcher = async (url) => {
  try {
    const res = await fetch(url)
    if (!res.ok) return { ok: false, status: res.status }
    return { ok: true, bytes: new Uint8Array(await res.arrayBuffer()) }
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) }
  }
}
export const defaultSleeper: Sleeper = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ── Manifests (puros) ─────────────────────────────────────────────────────────
export type SpriteManifest = Record<string, { front: string | null; back: string | null }>
export type FxManifest = Record<string, string>

const served = (destRel: string): string => `/${destRel}`

export function buildSpritesManifest(config: AssetsConfig, report: readonly TaskReport[]): SpriteManifest {
  const byId = new Map(report.map((r) => [r.id, r]))
  const manifest: SpriteManifest = {}
  for (const sp of [...config.species].sort((a, b) => a.dex - b.dex)) {
    const front = byId.get(`s:${sp.dex}:front`)
    const back = byId.get(`s:${sp.dex}:back`)
    manifest[String(sp.dex)] = {
      front: front?.status === 'ok' && front.destRel !== null ? served(front.destRel) : null,
      back: back?.status === 'ok' && back.destRel !== null ? served(back.destRel) : null,
    }
  }
  return manifest
}

export function buildFxManifest(config: AssetsConfig, report: readonly TaskReport[]): FxManifest {
  const byId = new Map(report.map((r) => [r.id, r]))
  const manifest: FxManifest = {}
  for (const f of config.fx) {
    const r = byId.get(`f:${f.key}`)
    if (r?.status === 'ok' && r.destRel !== null) manifest[f.key] = served(r.destRel)
  }
  return manifest
}

export function buildSummary(report: readonly TaskReport[]): string[] {
  const missing = report.filter((r) => r.status === 'missing')
  const lines = [`assets: ${report.length - missing.length}/${report.length} descargados · ${missing.length} faltantes`]
  if (missing.length > 0) {
    lines.push('faltantes:')
    for (const m of missing.slice(0, 30)) lines.push(`  ${m.label} — ${m.reason ?? '?'}`)
    if (missing.length > 30) lines.push(`  … +${missing.length - 30} más`)
  }
  return lines
}

// ── Orquestación: pool chico de descargas + escritura de archivos y manifests ─
export interface AssetsRun {
  report: TaskReport[]
  sprites: SpriteManifest
  fx: FxManifest
  summary: string[]
}

const CONCURRENCY = 6

export async function syncAssets(
  config: AssetsConfig,
  outRoot: string,
  deps: Partial<RunDeps> = {},
): Promise<AssetsRun> {
  const d: RunDeps = {
    fetcher: deps.fetcher ?? defaultFetcher,
    sleeper: deps.sleeper ?? defaultSleeper,
    retries: deps.retries ?? config.retries,
  }
  const plan = buildPlan(config)
  const outcomes: TaskOutcome[] = new Array<TaskOutcome>(plan.length)
  let next = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next
      if (i >= plan.length) return
      next += 1
      const task = plan[i]
      if (task === undefined) continue
      const outcome = await runTask(task, d)
      outcomes[i] = outcome
      if (outcome.report.destRel !== null && outcome.bytes !== null) {
        const dest = join(outRoot, outcome.report.destRel)
        mkdirSync(dirname(dest), { recursive: true })
        writeFileSync(dest, outcome.bytes)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, plan.length) }, () => worker()))
  const report = outcomes.map((o) => o.report)

  const sprites = buildSpritesManifest(config, report)
  const fx = buildFxManifest(config, report)
  const spritesPath = join(outRoot, SPRITES_DIR, 'sprites.json')
  const fxPath = join(outRoot, FX_DIR, 'fx.json')
  mkdirSync(dirname(spritesPath), { recursive: true })
  mkdirSync(dirname(fxPath), { recursive: true })
  writeFileSync(spritesPath, `${JSON.stringify(sprites, null, 2)}\n`)
  writeFileSync(fxPath, `${JSON.stringify(fx, null, 2)}\n`)

  return { report, sprites, fx, summary: buildSummary(report) }
}

// ── CLI: pnpm assets [--config ruta] [--out dir] ─────────────────────────────
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const USAGE = 'uso: pnpm assets [--config tools/assets.config.json] [--out apps/web/public]'

async function cli(argv: readonly string[]): Promise<number> {
  let configPath = join(repoRoot, 'tools', 'assets.config.json')
  let outRoot = join(repoRoot, 'apps', 'web', 'public')
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = argv[i + 1]
    if (arg === '--config' && value !== undefined) {
      configPath = value
      i += 1
    } else if (arg === '--out' && value !== undefined) {
      outRoot = value
      i += 1
    } else {
      console.error(`assets: argumento desconocido "${arg ?? ''}"\n${USAGE}`)
      return 2
    }
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'))
  } catch (err) {
    console.error(`assets: no se pudo leer ${configPath} (${err instanceof Error ? err.message : String(err)})`)
    return 1
  }
  let config: AssetsConfig
  try {
    config = parseConfig(raw)
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err
    console.error(`assets: config inválida: ${err.message}`)
    return 1
  }
  const run = await syncAssets(config, outRoot)
  for (const line of run.summary) console.log(line)
  if (!run.report.some((r) => r.status === 'ok')) {
    console.error('assets: fallaron todas las descargas (¿red caída?); no se bajó nada')
    return 1
  }
  return 0
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  void cli(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
