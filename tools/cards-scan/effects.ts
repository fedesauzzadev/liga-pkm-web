// cards-scan/effects (SPEC-S/T-102d) — mapeador texto→efectos del lector de
// cartas: carga content/cards/effect-patterns.json, normaliza el texto OCR
// (minúsculas, sin tildes, espacios colapsados, guiones largos) y aplica los
// patrones por prioridad (menor número primero). Un texto puede producir
// varios efectos en orden de aparición (el fragmento consumido no se reusa);
// lo que no encaja sale {op:'custom', handler:'TODO', rawText} con el texto
// restante y needsReview — PROHIBIDO inventar primitivas (docs/effect-
// requests/); los textos sin patrón se agrupan para el reporte (T-102e).
// Todo efecto se valida con el esquema Zod de packages/content (AC-4): uno
// inválido se descarta con aviso y su fragmento NO se consume (va a custom).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EffectSchema, type Effect } from '../../packages/content/src/effects.ts'
import { fixDigits, parseFaces } from './analyze.ts'

export interface EffectPatternSpec {
  readonly id: string
  readonly priority: number
  readonly regex: string
  readonly emit: Readonly<Record<string, unknown>>
  readonly setsFlag?: Readonly<Record<string, boolean>> | undefined
  readonly alsoSets?: Readonly<Record<string, string | number>> | undefined
}

export interface CompiledEffectPattern {
  readonly id: string
  readonly priority: number
  readonly re: RegExp
  readonly emit: Readonly<Record<string, unknown>>
  readonly setsFlag: Readonly<Record<string, boolean>>
  readonly alsoSets: Readonly<Record<string, string | number>>
}

// Variables de regex del JSON (_vars): (F) = caras de dado, (NAME) = nombre.
const VARS: Readonly<Record<string, string>> = { F: '(\\d(?:-\\d)*)', NAME: '(.+?)' }

/** Compila un patrón: expande (F)/(NAME) y deja el resto tal cual. */
export function compileEffectPattern(spec: EffectPatternSpec): CompiledEffectPattern {
  const regex = spec.regex.replace(/\((F|NAME)\)/g, (_m: string, v: string) => VARS[v] ?? '(.+?)')
  return {
    id: spec.id,
    priority: spec.priority,
    re: new RegExp(regex),
    emit: spec.emit,
    setsFlag: spec.setsFlag ?? {},
    alsoSets: spec.alsoSets ?? {},
  }
}

/** Carga effect-patterns.json ordenado por prioridad. Falla con aviso claro
 * si el archivo está roto: define la corrección del mapeo, no se degrada en
 * silencio (a diferencia de scan-config, que es tolerante). */
export function loadEffectPatterns(repoRoot: string): readonly CompiledEffectPattern[] {
  const file = join(repoRoot, 'content', 'cards', 'effect-patterns.json')
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { patterns?: unknown }
  if (!Array.isArray(raw.patterns)) throw new Error(`effect-patterns.json sin array "patterns": ${file}`)
  const out: CompiledEffectPattern[] = []
  const seen = new Set<string>()
  for (const p of raw.patterns) {
    if (typeof p !== 'object' || p === null) throw new Error(`patrón que no es objeto en ${file}`)
    const r = p as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id : null
    const priority = typeof r.priority === 'number' ? r.priority : null
    const regex = typeof r.regex === 'string' ? r.regex : null
    const emit = typeof r.emit === 'object' && r.emit !== null ? (r.emit as Record<string, unknown>) : null
    if (id === null || id.length === 0 || priority === null || regex === null || emit === null) {
      throw new Error(`patrón inválido en ${file} (id/priority/regex/emit): ${JSON.stringify(id ?? r.regex)}`)
    }
    if (seen.has(id)) throw new Error(`patrón duplicado en ${file}: ${id}`)
    seen.add(id)
    try {
      out.push(compileEffectPattern({ id, priority, regex, emit, setsFlag: asFlags(r.setsFlag), alsoSets: asAlso(r.alsoSets) }))
    } catch (e) {
      throw new Error(`regex inválida en patrón ${id}: ${e instanceof Error ? e.message : 'error inesperado'}`)
    }
  }
  out.sort((a, b) => a.priority - b.priority)
  return out
}

function asFlags(v: unknown): Readonly<Record<string, boolean>> {
  if (v === undefined || v === null) return {}
  if (typeof v !== 'object' || Object.entries(v).some(([, x]) => typeof x !== 'boolean')) {
    throw new Error('setsFlag debe ser un objeto de booleanos')
  }
  return v as Record<string, boolean>
}

function asAlso(v: unknown): Readonly<Record<string, string | number>> {
  if (v === undefined || v === null) return {}
  if (typeof v !== 'object' || Object.entries(v).some(([, x]) => typeof x !== 'string' && typeof x !== 'number')) {
    throw new Error('alsoSets debe ser un objeto de string|number')
  }
  return v as Record<string, string | number>
}

/** Normaliza el texto OCR para aplicar patrones (AC-1). */
export function normalizeEffectText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[\u2010-\u2015\u2212]/g, '-') // guiones largos → corto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // tildes opcionales
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

type MarkerResult = { readonly ok: true; readonly value: unknown; readonly omit: boolean } | { readonly ok: false; readonly error: string }

/** Convierte un marcador ($faces/$int/$neg/$optFaces/$self) contra el match. */
function markerValue(spec: string, m: RegExpExecArray, attackId: string): MarkerResult {
  if (spec === '$self') return { ok: true, value: attackId, omit: false }
  const mk = spec.match(/^\$(faces|int|neg|optFaces):([1-9])$/)
  if (mk === null) return { ok: false, error: `marcador desconocido: ${spec}` }
  const gi = Number.parseInt(mk[2] ?? '', 10)
  const g = m[gi]
  const kind = mk[1] ?? ''
  if (kind === 'optFaces' && g === undefined) return { ok: true, value: undefined, omit: true }
  if (g === undefined) return { ok: false, error: `grupo ${gi} ausente para ${spec}` }
  if (kind === 'faces' || kind === 'optFaces') {
    const f = parseFaces(g, [1, 2, 3, 4, 5, 6]).faces
    return f === null ? { ok: false, error: `caras ilegibles: "${g}"` } : { ok: true, value: [...f], omit: false }
  }
  const n = Number.parseInt(fixDigits(g).text, 10)
  if (!Number.isInteger(n)) return { ok: false, error: `número ilegible: "${g}"` }
  return { ok: true, value: kind === 'neg' ? -n : n, omit: false }
}

type BuildResult = { readonly ok: true; readonly obj: Record<string, unknown> } | { readonly ok: false; readonly error: string }

function buildEmit(emit: Readonly<Record<string, unknown>>, m: RegExpExecArray, attackId: string): BuildResult {
  const obj: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(emit)) {
    if (typeof spec !== 'string' || !spec.startsWith('$')) {
      obj[key] = spec
      continue
    }
    const v = markerValue(spec, m, attackId)
    if (!v.ok) return v
    if (!v.omit) obj[key] = v.value
  }
  return { ok: true, obj }
}

export interface MapEffectsOptions {
  /** Patrones compilados (loadEffectPatterns o de tests). */
  readonly patterns: readonly CompiledEffectPattern[]
  /** Id del ataque ($self, p.ej. Ataque rápido). */
  readonly attackId: string
  /** Nombre del Pokémon de la carta ({self}): token ignorable al sobrar. */
  readonly selfName?: string | undefined
}

export interface MappedEffects {
  /** Efectos en orden de aparición en el texto (custom al final, si hay). */
  readonly effects: readonly Effect[]
  readonly canOpen: boolean
  /** damage.base fijado por alsoSets (Explosión/fixedRolls); null si no. */
  readonly damageBase: number | null
  readonly custom: boolean
  readonly customRawText: string | null
  readonly patternIds: readonly string[]
  readonly needsReview: boolean
  readonly notes: readonly string[]
}

const IGNORED_TOKEN = /^[.,;:·!?…]+$/

/** Texto restante significativo: sin puntuación suelta ni el nombre {self}. */
function leftoverText(working: string, selfName: string | undefined): string | null {
  const ign = selfName !== undefined && selfName.length > 0 ? normalizeEffectText(selfName) : null
  const rest = working.split(' ').filter((t) => t.length > 0 && !IGNORED_TOKEN.test(t) && t !== ign)
  return rest.length > 0 ? rest.join(' ') : null
}

interface Matched {
  readonly effect: Effect | null // null = patrón de solo flags (canOpen)
  readonly pos: number
  readonly id: string
}

/** Aplica los patrones por prioridad sobre el texto normalizado (AC-1..4). */
export function mapEffects(text: string, opts: MapEffectsOptions): MappedEffects {
  const norm = normalizeEffectText(text)
  let working = norm
  const origin: number[] = Array.from(norm, (_, i) => i)
  const matched: Matched[] = []
  const notes: string[] = []
  let canOpen = false
  let damageBase: number | null = null

  for (const p of opts.patterns) {
    if (working.length === 0) break
    const m = p.re.exec(working)
    if (m === null || m[0].length === 0) continue
    let effect: Effect | null = null
    if (Object.keys(p.emit).length > 0) {
      const built = buildEmit(p.emit, m, opts.attackId)
      if (!built.ok) {
        notes.push(`patrón ${p.id} encajó pero no se pudo convertir: ${built.error}`)
        continue // no consume ⇒ queda para custom
      }
      const parsed = EffectSchema.safeParse(built.obj)
      if (!parsed.success) {
        notes.push(`patrón ${p.id} encajó pero el efecto no validó (Zod): "${m[0]}"`)
        continue
      }
      effect = parsed.data
    }
    for (const [k, v] of Object.entries(p.setsFlag)) {
      if (k === 'canOpen' && v === true) canOpen = true
      else notes.push(`setsFlag ignorado en ${p.id}: ${k}`)
    }
    for (const [k, spec] of Object.entries(p.alsoSets)) {
      if (k !== 'damage.base') {
        notes.push(`alsoSets ignorado en ${p.id}: ${k}`)
        continue
      }
      const val =
        typeof spec === 'number' ? { ok: true as const, value: spec, omit: false } : markerValue(spec, m, opts.attackId)
      if (val.ok && !val.omit && typeof val.value === 'number') damageBase = val.value
      else notes.push(`alsoSets damage.base ilegible en ${p.id}`)
    }
    matched.push({ effect, pos: origin[m.index] ?? 0, id: p.id })
    working = working.slice(0, m.index) + working.slice(m.index + m[0].length)
    origin.splice(m.index, m[0].length)
  }

  matched.sort((a, b) => a.pos - b.pos)
  const effects: Effect[] = []
  for (const x of matched) if (x.effect !== null) effects.push(x.effect)
  const leftover = leftoverText(working, opts.selfName)
  let custom = false
  let customRawText: string | null = null
  if (leftover !== null) {
    custom = true
    customRawText = leftover
    effects.push({ op: 'custom', handler: 'TODO', rawText: leftover })
  }
  return {
    effects,
    canOpen,
    damageBase,
    custom,
    customRawText,
    patternIds: matched.map((x) => x.id),
    needsReview: custom,
    notes,
  }
}

export interface UnmatchedGroup {
  readonly text: string
  readonly count: number
}

/** Textos sin patrón agrupados y contados (listado del reporte, T-102e). */
export function countUnmatched(texts: readonly (string | null)[]): readonly UnmatchedGroup[] {
  const counts = new Map<string, number>()
  for (const t of texts) {
    if (t === null || t.length === 0) continue
    counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count || (a.text < b.text ? -1 : 1))
}
