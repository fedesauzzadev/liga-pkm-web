// cards-scan/staging (SPEC-S/T-102e/AC-1) — arma la carta final del lector a
// partir del draft: aplica el mapeador de efectos (T-102d, con selfName del
// Pokémon), completa defaults seguros (habilidad sin daño ⇒ base 0; gym/liga
// sin costos) SIN inventar datos, valida con el Zod de packages/content y
// calcula contentHash de los ataques normalizados (repetidas, D-25). Las
// cartas que no alcanzan el esquema van a _staging/_errors con el motivo
// (convención T-041); las válidas a _staging/<base>.json con la marca
// fromScanner (pre-revisión: sus customs se reportan en report.html).
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEffectPatterns, mapEffects, normalizeEffectText, type CompiledEffectPattern } from './effects.ts'
import type { DraftCard, DraftAttack } from './draft.ts'
import { PokemonCardSchema, type Attack, type PokemonCard } from '../../packages/content/src/cards.ts'
import type { Effect } from '../../packages/content/src/effects.ts'

/** id snake_case del repo (convención 'doble_bofeton', golden 'attack_trueno'). */
export function idify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Nombre de archivo de staging: base idificada (SAFE_NAME del admin). */
export function stagingFileName(scanFile: string): string {
  return `${idify(scanFile.replace(/\.(jpe?g|png)$/i, ''))}.json`
}

/** Hash de los ataques normalizados: mismas cartas ⇒ mismo hash (D-25). */
export function contentHashOf(card: PokemonCard): string {
  const ataques = card.attacks.map((a) => ({
    id: a.id,
    name: normalizeEffectText(a.name),
    kind: a.kind,
    rollFaces: [...a.rollFaces],
    cost: [...a.cost],
    damage: a.damage,
    effects: a.effects,
    rawText: normalizeEffectText(a.rawText),
    ...(a.canOpen === true ? { canOpen: true } : {}),
  }))
  return createHash('sha1').update(JSON.stringify(ataques)).digest('hex').slice(0, 16)
}

export interface StagingMeta {
  readonly needsReview: boolean
  readonly confidence: number
  readonly confidenceByField: Readonly<Record<string, number>>
  readonly contentHash: string | null
  readonly customCount: number
  readonly unmatched: readonly string[]
  readonly notes: readonly string[]
}

export type StagingBuild =
  | { readonly kind: 'ok'; readonly card: PokemonCard; readonly meta: StagingMeta }
  | { readonly kind: 'invalid'; readonly issues: readonly string[]; readonly meta: StagingMeta; readonly summary: Record<string, unknown> }

interface AttackBuild {
  readonly attack: Attack | null
  readonly issue: string | null
  readonly custom: boolean
  readonly unmatched: readonly string[]
  readonly notes: readonly string[]
}

/** Un ataque del draft → Attack (con efectos mapeados); null ⇒ motivo. */
function buildAttack(a: DraftAttack, selfName: string, patterns: readonly CompiledEffectPattern[], gymLike: boolean): AttackBuild {
  const issues: string[] = []
  const notes: string[] = [...a.notes]
  const unmatched: string[] = []
  let custom = false
  if (a.rollFaces === null) issues.push('caras ilegibles')
  const cost = a.cost === null ? (gymLike ? [] : null) : a.cost.filter((c) => c !== 'unknown')
  if (a.cost !== null && a.cost.includes('unknown')) issues.push('costo con ícono desconocido')
  if (cost === null) issues.push('costo sin clasificar')
  if (a.name.length === 0) issues.push('ataque sin nombre')
  // Habilidad sin número de daño ⇒ base 0 (la carta no trae daño); el daño
  // de una habilidad vive en sus efectos. Ataque sin daño ⇒ dato faltante.
  const base = a.damageBase ?? (a.kind === 'ability' ? 0 : null)
  if (base === null) issues.push('daño ilegible')
  if (a.element === null) issues.push('elemento del ataque sin clasificar')

  const attackId = idify(a.name.length > 0 ? a.name : 'ataque')
  const mapped = mapEffects(a.effectText, { patterns, attackId, selfName })
  if (mapped.custom && mapped.customRawText !== null) {
    custom = true
    unmatched.push(mapped.customRawText)
  }
  notes.push(...mapped.notes)
  const effects = [...mapped.effects]
  if (issues.length > 0) return { attack: null, issue: issues.join(', '), custom, unmatched, notes }
  const attack: Attack = {
    id: attackId,
    name: a.name,
    kind: a.kind,
    rollFaces: [...(a.rollFaces ?? [])],
    cost: [...(cost ?? [])] as Attack['cost'],
    element: (a.element ?? 'normal') as Attack['element'],
    damage: { base: base ?? 0, ...(a.ifRoll !== null ? { ifRoll: { faces: [...a.ifRoll.faces], damage: a.ifRoll.damage } } : {}) },
    effects,
    rawText: a.effectText,
    ...(mapped.canOpen ? { canOpen: true } : {}),
  }
  return { attack, issue: null, custom, unmatched, notes }
}

export function buildStagingCard(draft: DraftCard, patterns: readonly CompiledEffectPattern[], photo: string): StagingBuild {
  const issues: string[] = []
  const notes: string[] = []
  const unmatched: string[] = [...draft.warnings]
  const gymLike = draft.group === 'gym' || draft.group === 'league'
  const name = draft.name.value.trim()
  if (name.length === 0) issues.push('nombre ilegible')
  if (draft.hp.value === null) issues.push('HP ilegible')
  if (draft.dex.value === null) issues.push('dex sin confirmar (nombre no coincide con PokeAPI)')
  if (draft.element.value === null) issues.push('elemento sin clasificar')
  if (draft.deck.value === null) issues.push('mazo sin determinar')
  if (draft.stage.value === null) issues.push('etapa no reconocida')
  if (draft.attacks.length === 0) issues.push('sin ataques')

  const attacks: Attack[] = []
  let customCount = 0
  draft.attacks.forEach((a, i) => {
    const built = buildAttack(a, name, patterns, gymLike)
    if (built.attack === null) issues.push(`ataque ${i + 1}: ${built.issue}`)
    else attacks.push(built.attack)
    if (built.custom) customCount += 1
    unmatched.push(...built.unmatched)
    notes.push(...built.notes)
  })

  // Especialidades (pasivas): se mapea el texto DESPUÉS de la clave en
  // MAYÚSCULAS; el custom guarda el texto completo original.
  const specialties: Effect[] = []
  for (const s of draft.specialties) {
    const cuerpo = s.rawText.replace(/^[^:]+:\s*/, '')
    const mapped = mapEffects(cuerpo, { patterns, attackId: idify(s.key), selfName: name })
    specialties.push(...mapped.effects)
    if (mapped.custom && mapped.customRawText !== null) {
      customCount += 1
      unmatched.push(s.rawText)
    }
    notes.push(...mapped.notes)
  }

  const confidenceByField: Record<string, number> = {
    name: draft.name.confidence,
    hp: draft.hp.confidence,
    dex: draft.dex.confidence,
    element: draft.element.confidence,
    deck: draft.deck.confidence,
    stage: draft.stage.confidence,
    attacks: draft.attacks.length > 0 ? Math.min(...draft.attacks.map((a) => a.confidence)) : 0,
    specialties: draft.specialties.length > 0 ? Math.min(...draft.specialties.map((s) => s.confidence)) : 1,
  }
  const confidence = Math.min(draft.confidence, ...Object.values(confidenceByField))
  const needsReview = draft.needsReview || customCount > 0

  const summary = {
    name: draft.name.value,
    hp: draft.hp.value,
    element: draft.element.value,
    deck: draft.deck.value,
    stage: draft.stage.value,
    group: draft.group,
    attacks: draft.attacks.map((a) => ({ faces: a.rollFaces, name: a.name, kind: a.kind, damage: a.damageBase, cost: a.cost, rawText: a.rawText })),
    specialties: draft.specialties.map((s) => s.rawText),
    warnings: draft.warnings,
  }

  if (issues.length > 0) {
    return {
      kind: 'invalid',
      issues,
      summary,
      meta: { needsReview: true, confidence, confidenceByField, contentHash: null, customCount, unmatched, notes },
    }
  }

  const candidate: PokemonCard = {
    id: idify(name),
    dex: draft.dex.value ?? 0,
    name,
    stage: draft.stage.value ?? 'basic',
    // Los null ya generaron issue (arriba): los ?? son solo para que el
    // candidato tipee; si llegaran acá, Zod los descarta.
    deck: (draft.deck.value ?? 'bosque') as PokemonCard['deck'],
    hp: draft.hp.value ?? 10,
    element: (draft.element.value ?? 'normal') as PokemonCard['element'],
    attacks,
    specialties,
    evolvesTo: draft.evolvesTo.map((e) => ({ id: idify(e.name), xp: e.xp })),
    ...(draft.chances !== null ? { chances: draft.chances } : {}),
    ...(draft.gym !== null ? { gym: { leader: draft.gym.leaderOrTrainer, slot: draft.gym.slot === 2 ? 2 : 1 } } : {}),
    source: { photo, verified: false },
  }
  const parsed = PokemonCardSchema.safeParse(candidate)
  if (!parsed.success) {
    return {
      kind: 'invalid',
      issues: [...issues, ...parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)],
      summary,
      meta: { needsReview: true, confidence, confidenceByField, contentHash: null, customCount, unmatched, notes },
    }
  }
  return {
    kind: 'ok',
    card: parsed.data,
    meta: { needsReview, confidence, confidenceByField, contentHash: contentHashOf(parsed.data), customCount, unmatched, notes },
  }
}

/** Ítem por escaneo para escribir staging (draft del caché o de esta corrida). */
export interface StagingItem {
  readonly file: string
  readonly status: 'ok' | 'error'
  readonly draft?: DraftCard | undefined
  readonly error?: string | undefined
  readonly ms?: number | undefined
}

export interface ReportRow {
  readonly file: string
  readonly base: string
  readonly status: 'ok' | 'invalid' | 'error'
  readonly needsReview: boolean
  readonly customCount: number
  readonly unmatched: readonly string[]
  readonly card?: PokemonCard | undefined
  readonly issues?: readonly string[] | undefined
  readonly error?: string | undefined
  readonly confidence: number
  readonly contentHash?: string | undefined
  readonly thumb?: string | undefined
  readonly ms?: number | undefined
}

export interface WriteStagingResult {
  readonly valid: number
  readonly invalid: number
  readonly errors: number
  readonly rows: readonly ReportRow[]
}

const ERRORS_DIR = '_errors'

/** Escribe un JSON por imagen: válidas en _staging, el resto en _staging/_errors.
 * Al final PODA los archivos fromScanner que ya no corresponden a ningún
 * escaneo de esta corrida (nombres viejos, renombres del dueño). */
export function writeStagingFiles(stagingDir: string, items: readonly StagingItem[]): WriteStagingResult {
  mkdirSync(stagingDir, { recursive: true })
  mkdirSync(join(stagingDir, ERRORS_DIR), { recursive: true })
  const rows: ReportRow[] = []
  let valid = 0
  let invalid = 0
  let errors = 0
  const actuales = new Set(items.map((it) => stagingFileName(it.file)))
  for (const it of items) {
    const base = stagingFileName(it.file)
    if (it.status === 'error' || it.draft === undefined) {
      errors += 1
      const msg = it.error ?? 'sin draft'
      writeFileSync(
        join(stagingDir, ERRORS_DIR, base),
        `${JSON.stringify({ _comment: 'Escaneo con error (SPEC-S/T-102e); ver report.html', fromScanner: true, photo: it.file, error: msg }, null, 1)}\n`,
        'utf8',
      )
      rows.push({ file: it.file, base, status: 'error', needsReview: true, customCount: 0, unmatched: [], error: msg, confidence: 0 })
      continue
    }
    const built = buildStagingCard(it.draft, loadPatternsOnce(), it.file)
    if (built.kind === 'ok') {
      valid += 1
      writeFileSync(
        join(stagingDir, base),
        `${JSON.stringify(
          {
            _comment: 'Salida del lector de escaneos (SPEC-S/T-102e). Revisá report.html; al curar esta carta desde /admin/cards la marca fromScanner se pierde y vuelve al flujo normal.',
            fromScanner: true,
            photo: it.file,
            needsReview: built.meta.needsReview,
            confidence: built.meta.confidenceByField,
            contentHash: built.meta.contentHash,
            cards: [built.card],
          },
          null,
          1,
        )}\n`,
        'utf8',
      )
      rows.push({
        file: it.file, base, status: 'ok', needsReview: built.meta.needsReview, customCount: built.meta.customCount,
        unmatched: built.meta.unmatched, card: built.card, confidence: built.meta.confidence,
        contentHash: built.meta.contentHash ?? undefined, ...(it.ms !== undefined ? { ms: it.ms } : {}),
      })
    } else {
      invalid += 1
      writeFileSync(
        join(stagingDir, ERRORS_DIR, base),
        `${JSON.stringify({ _comment: 'No alcanzó para el esquema PokemonCard (SPEC-S/T-102e); ver report.html', fromScanner: true, photo: it.file, issues: built.issues, draft: built.summary }, null, 1)}\n`,
        'utf8',
      )
      rows.push({
        file: it.file, base, status: 'invalid', needsReview: true, customCount: built.meta.customCount,
        unmatched: built.meta.unmatched, issues: built.issues, confidence: built.meta.confidence,
        ...(it.ms !== undefined ? { ms: it.ms } : {}),
      })
    }
  }
  // Poda: solo archivos del lector (fromScanner) que ya no tienen escaneo.
  const podar = (dir: string): void => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      if (!f.isFile() || !f.name.endsWith('.json')) continue
      if (actuales.has(f.name)) continue
      try {
        const doc = JSON.parse(readFileSync(join(dir, f.name), 'utf8')) as { fromScanner?: unknown }
        if (doc.fromScanner === true) unlinkSync(join(dir, f.name))
      } catch {
        // ilegible: no es nuestro, no se toca
      }
    }
  }
  podar(stagingDir)
  podar(join(stagingDir, ERRORS_DIR))
  return { valid, invalid, errors, rows }
}

// Patrones del repo cargados una sola vez (los tests inyectan los suyos vía
// buildStagingCard; writeStagingFiles usa siempre los de content/cards).
let cachedPatterns: readonly CompiledEffectPattern[] | null = null
function loadPatternsOnce(): readonly CompiledEffectPattern[] {
  cachedPatterns ??= loadEffectPatterns(fileURLToPath(new URL('../..', import.meta.url)))
  return cachedPatterns
}
