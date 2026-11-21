// pokeapi (SPEC-E/T-045) — baja datos de referencia de PokeAPI a
// content/reference/pokeapi/{species,moves,evolutions}.json (gitignored, nunca commiteado):
// especies 1-151 (nombres EN/ES + tipos), movimientos de Gen 1 (id + nombre EN/ES + tipo) y
// evoluciones filtradas a dex ≤ 151 (alcance del juego). Red inyectada (JsonFetcher) ⇒
// testeable sin red; si los 3 archivos ya existen no toca la red (AC-3) salvo --force.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const API = 'https://pokeapi.co/api/v2'

// ── Tipos ───────────────────────────────────────────────────────────────────────
export type JsonFetchResult = { ok: true; json: unknown } | { ok: false; status: number; error?: string }
export type JsonFetcher = (url: string) => Promise<JsonFetchResult>
export type Sleeper = (ms: number) => Promise<void>

export interface SpeciesOut {
  dex: number
  nameEn: string
  nameEs: string
  types: string[]
}
export interface MoveOut {
  id: string
  nameEn: string
  nameEs: string
  type: string
}
export interface EvolutionTargetOut {
  dex: number
  nameEn: string
  nameEs: string
}
export interface SpeciesEvolutionsOut {
  dex: number
  nameEn: string
  evolvesTo: EvolutionTargetOut[]
}
export interface ReferenceOut {
  species: SpeciesOut[]
  moves: MoveOut[]
  evolutions: SpeciesEvolutionsOut[]
}

export const defaultJsonFetcher: JsonFetcher = async (url) => {
  try {
    const res = await fetch(url)
    if (!res.ok) return { ok: false, status: res.status }
    return { ok: true, json: (await res.json()) as unknown }
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) }
  }
}
export const defaultSleeper: Sleeper = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ── Parsers puros (payloads crudos de PokeAPI → datos del juego) ────────────────
const isRec = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null
const str = (x: unknown): string | null => (typeof x === 'string' && x.length > 0 ? x : null)
const langName = (payload: unknown, lang: string): string | null => {
  if (!isRec(payload) || !Array.isArray(payload.names)) return null
  for (const n of payload.names) {
    if (isRec(n) && isRec(n.language) && n.language.name === lang) return str(n.name)
  }
  return null
}
const dexFromUrl = (url: unknown): number | null => {
  const m = typeof url === 'string' ? /\/pokemon-species\/(\d+)\/?$/.exec(url) : null
  return m !== null ? Number(m[1]) : null
}

export function parsePokemonPayload(payload: unknown): { dex: number; types: string[] } | null {
  if (!isRec(payload) || typeof payload.id !== 'number' || !Array.isArray(payload.types)) return null
  const types: string[] = []
  for (const t of payload.types) {
    if (isRec(t) && isRec(t.type)) {
      const name = str(t.type.name)
      if (name !== null) types.push(name)
    }
  }
  return types.length > 0 ? { dex: payload.id, types } : null
}

export function parseSpeciesPayload(payload: unknown): { dex: number; nameEn: string; nameEs: string; chainUrl: string } | null {
  if (!isRec(payload) || typeof payload.id !== 'number') return null
  const nameEn = langName(payload, 'en')
  const chainUrl = isRec(payload.evolution_chain) ? str(payload.evolution_chain.url) : null
  if (nameEn === null || chainUrl === null) return null
  return { dex: payload.id, nameEn, nameEs: langName(payload, 'es') ?? nameEn, chainUrl }
}

export function parseMovePayload(payload: unknown): { id: string; nameEn: string; nameEs: string; type: string } | null {
  if (!isRec(payload)) return null
  const id = str(payload.name)
  const nameEn = langName(payload, 'en')
  const type = isRec(payload.type) ? str(payload.type.name) : null
  if (id === null || nameEn === null || type === null) return null
  return { id, nameEn, nameEs: langName(payload, 'es') ?? nameEn, type }
}

export function parseGenerationMoves(payload: unknown): string[] {
  if (!isRec(payload) || !Array.isArray(payload.moves)) return []
  const out: string[] = []
  for (const m of payload.moves) {
    if (isRec(m)) {
      const n = str(m.name)
      if (n !== null) out.push(n)
    }
  }
  return out
}

/** Cadena de evolución: árbol anidado → {dex → targets ≤ 151} para cada nodo ≤ 151. */
export function parseChainPayload(payload: unknown): Map<number, number[]> {
  const out = new Map<number, number[]>()
  if (!isRec(payload) || !isRec(payload.chain)) return out
  const walk = (node: Record<string, unknown>): void => {
    const dex = dexFromUrl(isRec(node.species) ? node.species.url : undefined)
    const targets: number[] = []
    if (Array.isArray(node.evolves_to)) {
      for (const child of node.evolves_to) {
        if (!isRec(child)) continue
        const childDex = dexFromUrl(isRec(child.species) ? child.species.url : undefined)
        if (childDex !== null && childDex <= 151) targets.push(childDex)
        walk(child)
      }
    }
    if (dex !== null && dex <= 151) out.set(dex, targets.sort((a, b) => a - b))
  }
  walk(payload.chain)
  return out
}

// ── Fetch con reintentos (5xx/red reintenta con backoff; 4xx definitivo) ────────
interface RunDeps {
  fetcher: JsonFetcher
  sleeper: Sleeper
  retries: number
}

async function fetchJson(url: string, deps: RunDeps): Promise<JsonFetchResult> {
  let last: JsonFetchResult = { ok: false, status: 0, error: 'sin intentos' }
  for (let attempt = 1; attempt <= deps.retries + 1; attempt++) {
    if (attempt > 1) await deps.sleeper(500 * (attempt - 1))
    try {
      last = await deps.fetcher(url)
    } catch (err) {
      last = { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) }
    }
    if (last.ok || (last.status >= 400 && last.status < 500)) break
  }
  return last
}

async function pool<T>(items: readonly T[], size: number, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next
      if (i >= items.length) return
      next += 1
      const item = items[i]
      if (item !== undefined) await run(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()))
}

const CONCURRENCY = 6

// ── Descarga (AC-1): 151 especies + cadenas dedupeadas + movimientos de Gen 1 ───
export interface FetchOpts {
  fetcher?: JsonFetcher | undefined
  sleeper?: Sleeper | undefined
  retries?: number | undefined
  /** Seam de tests: subconjunto de dex (default: 1..151). */
  dexes?: readonly number[] | undefined
}

export async function fetchReference(deps: FetchOpts = {}): Promise<{ data: ReferenceOut | null; missing: string[] }> {
  const d: RunDeps = {
    fetcher: deps.fetcher ?? defaultJsonFetcher,
    sleeper: deps.sleeper ?? defaultSleeper,
    retries: deps.retries ?? 2,
  }
  const dexes = deps.dexes ?? Array.from({ length: 151 }, (_, i) => i + 1)
  const missing: string[] = []
  const species: SpeciesOut[] = []
  const chainUrls = new Map<number, string>()

  await pool(
    dexes,
    CONCURRENCY,
    async (dex) => {
      const [p, s] = await Promise.all([
        fetchJson(`${API}/pokemon/${dex}`, d),
        fetchJson(`${API}/pokemon-species/${dex}`, d),
      ])
      const parsed = p.ok ? parsePokemonPayload(p.json) : null
      const sp = s.ok ? parseSpeciesPayload(s.json) : null
      if (parsed === null || sp === null) {
        const why = parsed === null ? `pokemon/${dex}: ${p.ok ? 'payload inválido' : `HTTP ${p.status}`}` : ''
        const why2 = sp === null ? `pokemon-species/${dex}: ${s.ok ? 'payload inválido' : `HTTP ${s.status}`}` : ''
        missing.push(`especie dex ${dex}: ${[why, why2].filter((w) => w.length > 0).join(' · ')}`)
        return
      }
      species.push({ dex, nameEn: sp.nameEn, nameEs: sp.nameEs, types: parsed.types })
      chainUrls.set(dex, sp.chainUrl)
    },
  )
  species.sort((a, b) => a.dex - b.dex)

  const evoMap = new Map<number, number[]>()
  await pool([...new Set(chainUrls.values())], CONCURRENCY, async (url) => {
    const res = await fetchJson(url, d)
    if (!res.ok) {
      missing.push(`cadena ${url}: ${res.ok ? '' : `HTTP ${res.status}`}`)
      return
    }
    for (const [dex, targets] of parseChainPayload(res.json)) evoMap.set(dex, targets)
  })

  const byDex = new Map(species.map((s) => [s.dex, s]))
  const evolutions: SpeciesEvolutionsOut[] = species.map((s) => ({
    dex: s.dex,
    nameEn: s.nameEn,
    evolvesTo: (evoMap.get(s.dex) ?? []).map((t) => {
      const sp = byDex.get(t)
      return { dex: t, nameEn: sp?.nameEn ?? `dex-${t}`, nameEs: sp?.nameEs ?? `dex-${t}` }
    }),
  }))

  let moves: MoveOut[] = []
  const genRes = await fetchJson(`${API}/generation/1`, d)
  if (!genRes.ok) missing.push(`generation/1: HTTP ${genRes.status}`)
  else {
    const slugs = parseGenerationMoves(genRes.json)
    await pool(slugs, CONCURRENCY, async (slug) => {
      const res = await fetchJson(`${API}/move/${slug}`, d)
      const mv = res.ok ? parseMovePayload(res.json) : null
      if (mv === null) missing.push(`movimiento ${slug}: ${res.ok ? 'payload inválido' : `HTTP ${res.status}`}`)
      else moves.push(mv)
    })
    moves = moves.sort((a, b) => a.id.localeCompare(b.id))
  }

  return { data: species.length > 0 ? { species, moves, evolutions } : null, missing }
}

// ── Escritura + guard sin-red (AC-3) ────────────────────────────────────────────
export interface PokeApiRun {
  skipped: boolean
  data: ReferenceOut | null
  missing: string[]
  summary: string[]
}

const LICENSE_NOTE =
  'Datos de PokeAPI (https://pokeapi.co, fair use — uso privado). Bajados con pnpm pokeapi; no se commitea (.gitignore).'

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

export async function syncReference(
  outDir: string,
  opts: Partial<RunDeps & { force: boolean }> & { dexes?: readonly number[] | undefined } = {},
): Promise<PokeApiRun> {
  const speciesPath = join(outDir, 'species.json')
  const movesPath = join(outDir, 'moves.json')
  const evoPath = join(outDir, 'evolutions.json')
  if (opts.force !== true && existsSync(speciesPath) && existsSync(movesPath) && existsSync(evoPath)) {
    return {
      skipped: true,
      data: null,
      missing: [],
      summary: [`pokeapi: ${outDir} ya tiene los 3 archivos; sin red (usá --force para regenerar)`],
    }
  }
  const { data, missing } = await fetchReference({
    fetcher: opts.fetcher,
    sleeper: opts.sleeper,
    retries: opts.retries,
    dexes: opts.dexes,
  })
  if (data !== null) {
    writeJson(speciesPath, { _comment: LICENSE_NOTE, species: data.species })
    writeJson(movesPath, { _comment: LICENSE_NOTE, moves: data.moves })
    writeJson(evoPath, { _comment: LICENSE_NOTE, evolutions: data.evolutions })
  }
  const summary = data === null ? [] : [
    `pokeapi: ${data.species.length} especies · ${data.moves.length} movimientos Gen 1 · ${data.evolutions.length} especies con evolución`,
  ]
  if (missing.length > 0) {
    summary.push(`faltantes (${missing.length}):`)
    for (const m of missing.slice(0, 20)) summary.push(`  ${m}`)
    if (missing.length > 20) summary.push(`  … +${missing.length - 20} más`)
  }
  return { skipped: false, data, missing, summary }
}

// ── CLI: pnpm pokeapi [--out content/reference/pokeapi] [--force] ───────────────
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const USAGE = 'uso: pnpm pokeapi [--out content/reference/pokeapi] [--force]'

async function cli(argv: readonly string[]): Promise<number> {
  let outDir = join(repoRoot, 'content', 'reference', 'pokeapi')
  let force = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = argv[i + 1]
    if (arg === '--force') force = true
    else if (arg === '--out' && value !== undefined) {
      outDir = value
      i += 1
    } else {
      console.error(`pokeapi: argumento desconocido "${arg ?? ''}"\n${USAGE}`)
      return 2
    }
  }
  const run = await syncReference(outDir, { force })
  for (const line of run.summary) console.log(line)
  if (!run.skipped && (run.data === null || run.missing.length > 0)) {
    console.error('pokeapi: descarga incompleta; revisá los faltantes y re-ejecutá')
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
