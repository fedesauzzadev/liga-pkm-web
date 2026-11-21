// SPEC-E/T-040 — estado de edición de /admin/cards: helpers puros sobre drafts
// (clones del JSON crudo). Nada de `as PokemonCard`: la frontera es Zod
// (validación en vivo, AC-2) y los chequeos cruzados viven en crossChecks.ts.
import { EffectSchema, FxArchetypeSchema, PokemonCardSchema, type Effect, type EffectOp, type PokemonCard } from '@liga/content'
import type { MoveFxAttack } from '../fx/playMoveFx'
import type { AdminSnapshot } from './api.ts'

export type Draft = Record<string, unknown>

export function cloneDraft(raw: unknown): Draft {
  return structuredClone(raw) as Draft
}

// ── Lecturas tolerantes (el draft puede estar roto: eso muestra el editor) ──
export function getObj(d: Draft, key: string): Draft | null {
  const v = d[key]
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Draft) : null
}

export function getArr(d: Draft, key: string): Draft[] {
  const v = d[key]
  if (!Array.isArray(v)) return []
  return v.filter((e): e is Draft => typeof e === 'object' && e !== null && !Array.isArray(e))
}

export function getStr(d: Draft, key: string): string {
  const v = d[key]
  return typeof v === 'string' ? v : ''
}

export function getNum(d: Draft, key: string): number | null {
  const v = d[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// ── Escrituras ──
export function setField(d: Draft, key: string, value: string): void {
  d[key] = value
}

/** Número opcional: cadena vacía ⇒ clave ausente (exactOptionalPropertyTypes-safe). */
export function setOptionalNumber(d: Draft, key: string, value: string): void {
  const n = Number(value)
  if (value !== '' && Number.isFinite(n)) d[key] = Math.trunc(n)
  else delete d[key]
}

export function setOptionalString(d: Draft, key: string, value: string): void {
  if (value !== '') d[key] = value
  else delete d[key]
}

// ── Faces: dado 1-6 como 6 casillas (rollFaces, cost no, ifRoll) ──
export function facesChecked(value: unknown): boolean[] {
  const checked = [false, false, false, false, false, false]
  if (Array.isArray(value)) {
    for (const f of value) {
      if (typeof f === 'number' && f >= 1 && f <= 6) checked[f - 1] = true
    }
  }
  return checked
}

export function toggleFaces(value: unknown, face: number, on: boolean): number[] {
  const set = new Set(Array.isArray(value) ? value.filter((f): f is number => typeof f === 'number') : [])
  if (on) set.add(face)
  else set.delete(face)
  return [...set].sort((a, b) => a - b)
}

// ── Validación en vivo (AC-2) ──
export function formatIssues(issues: readonly { path: (string | number | symbol)[]; message: string }[]): string[] {
  return issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`)
}

export function validateCardDraft(draft: Draft): { valid: boolean; errors: string[] } {
  const parsed = PokemonCardSchema.safeParse(draft)
  return parsed.success ? { valid: true, errors: [] } : { valid: false, errors: formatIssues(parsed.error.issues) }
}

export function validateEffectDraft(draft: Draft): { valid: boolean; errors: string[] } {
  const parsed = EffectSchema.safeParse(draft)
  return parsed.success ? { valid: true, errors: [] } : { valid: false, errors: formatIssues(parsed.error.issues) }
}

/** AC-3 — "Verificada" ⇒ source.verified=true (creando source si hace falta). */
export function markVerified(draft: Draft): Draft {
  const next = cloneDraft(draft)
  const source = getObj(next, 'source') ?? {}
  next.source = { ...source, verified: true }
  return next
}

export function isVerified(draft: Draft): boolean {
  const source = getObj(draft, 'source')
  return source !== null && source.verified === true
}

/** ¿Tiene efectos `custom` (ataques o especialidades)? Se computa del raw. */
export function hasCustomEffects(draft: Draft): boolean {
  const ops = (list: unknown): unknown[] =>
    Array.isArray(list)
      ? list.map((e) => (typeof e === 'object' && e !== null ? (e as Draft).op : undefined))
      : []
  const customIn = (list: unknown): boolean => ops(list).includes('custom')
  return (
    getArr(draft, 'attacks').some((a) => customIn(a.effects)) || customIn(draft.specialties)
  )
}

// ── Lista plana con flags (AC-1: filtros) ──
export type AdminFilter = 'all' | 'unverified' | 'custom' | 'errors'

export interface FlatCard {
  readonly file: string
  readonly staging: boolean
  readonly index: number
  readonly draft: Draft
  readonly key: string
  readonly valid: boolean
  readonly unverified: boolean
  readonly custom: boolean
}

export function flattenCards(snapshot: AdminSnapshot): FlatCard[] {
  const out: FlatCard[] = []
  for (const f of snapshot.files) {
    f.cards.forEach((entry, index) => {
      const draft = cloneDraft(entry.raw)
      out.push({
        file: f.file,
        staging: f.staging,
        index,
        draft,
        key: `${f.file}#${index}`,
        valid: validateCardDraft(draft).valid,
        unverified: !isVerified(draft),
        custom: hasCustomEffects(draft),
      })
    })
  }
  return out
}

export function applyFilter(cards: readonly FlatCard[], filter: AdminFilter): FlatCard[] {
  switch (filter) {
    case 'unverified':
      return cards.filter((c) => c.unverified)
    case 'custom':
      return cards.filter((c) => c.custom)
    case 'errors':
      return cards.filter((c) => !c.valid)
    case 'all':
      return [...cards]
  }
}

// ── AC-5 — navegación por teclado (pura para testear sin DOM) ──
export type AdminKeyAction = 'next' | 'prev' | 'verify' | 'save' | 'zoomIn' | 'zoomOut' | 'fx' | null
const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function adminKeyAction(key: string, targetTag: string): AdminKeyAction {
  if (TYPING_TAGS.has(targetTag)) return null
  switch (key) {
    case 'j':
    case 'ArrowDown':
      return 'next'
    case 'k':
    case 'ArrowUp':
      return 'prev'
    case 'v':
      return 'verify'
    case 's':
      return 'save'
    case '+':
      return 'zoomIn'
    case '-':
      return 'zoomOut'
    case 'f':
      return 'fx'
    default:
      return null
  }
}

/** Índice siguiente/anterior con wrap-around (revisar ≥ 30 cartas/hora, AC-5). */
export function stepIndex(current: number, total: number, delta: number): number {
  if (total <= 0) return -1
  return (current + delta + total) % total
}

/** Vista previa de FX (T-040): {officialMove, fx, element} de un ataque en edición. */
export function moveFxAttackOf(atk: Draft): MoveFxAttack {
  const officialMove = getStr(atk, 'officialMove')
  const fxStr = getStr(atk, 'fx')
  const fx = FxArchetypeSchema.safeParse(fxStr)
  const element = getStr(atk, 'element')
  return {
    ...(officialMove !== '' ? { officialMove } : {}),
    ...(fx.success ? { fx: fx.data } : {}),
    ...(element !== '' ? { element } : {}),
  }
}

/** T-046/AC-2 — confirma el mapeo oficial del ataque (status "verified");
 * sin officialMove no hay nada que confirmar ⇒ draft intacto. */
export function confirmMoveMapping(atk: Draft): Draft {
  if (getStr(atk, 'officialMove') === '') return atk
  return { ...atk, officialMoveStatus: 'verified' }
}

/** T-046/AC-2 — cambiar el mapeo invalida la confirmación previa: vuelve a
 * "proposed"; vaciarlo ⇒ "unmapped" (cae al arquetipo, FX-ADAPTER §Mapeo). */
export function setOfficialMove(atk: Draft, move: string): Draft {
  const next = cloneDraft(atk)
  setOptionalString(next, 'officialMove', move)
  next.officialMoveStatus = move === '' ? 'unmapped' : 'proposed'
  return next
}

// ── Carga manual (plan carga-manual-cartas): template mínimo y add/remove ──

/** AC-1 — carta nueva editable: id/nombre/ataque vacíos (no valida hasta llenar). */
export function newCardDraft(): Draft {
  return {
    id: '',
    dex: 1,
    name: '',
    stage: 'basic',
    deck: 'bosque',
    hp: 1,
    element: 'normal',
    attacks: [
      {
        id: 'atk_1',
        name: '',
        kind: 'attack',
        rollFaces: [],
        cost: [],
        element: 'normal',
        damage: { base: 0 },
        effects: [],
        rawText: '',
      },
    ],
    specialties: [],
    evolvesTo: [],
    source: { verified: false },
  }
}

/** AC-1 — agrega una carta al final del doc (conserva _comment/pending). */
export function addCard(doc: Draft, card: Draft): Draft {
  const cards = Array.isArray(doc.cards) ? doc.cards : []
  return { ...doc, cards: [...cards, card] }
}

/** AC-2 — quita la carta `index` del doc; índice fuera de rango ⇒ doc intacto. */
export function removeCard(doc: Draft, index: number): Draft {
  const cards = Array.isArray(doc.cards) ? doc.cards : []
  if (index < 0 || index >= cards.length) return doc
  return { ...doc, cards: cards.filter((_, i) => i !== index) }
}

/** AC-2 — key de la vecina tras borrar (los índices del mismo archivo corren). */
export function neighborKeyAfterRemove(
  cards: readonly { readonly key: string; readonly file: string; readonly index: number }[],
  key: string,
): string | null {
  const i = cards.findIndex((c) => c.key === key)
  const removed = i === -1 ? undefined : cards[i]
  if (removed === undefined) return null
  const neighbor = cards[i + 1] ?? cards[i - 1]
  if (neighbor === undefined) return null
  return neighbor.file === removed.file && neighbor.index > removed.index
    ? `${neighbor.file}#${neighbor.index - 1}`
    : neighbor.key
}

const TARGET_SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*\.json$/

/** AC-4 — espejo cliente de adminFilePath: destinos permitidos, sin traversal. */
export function validTargetFile(file: string): boolean {
  const prefixStaging = 'content/pokemon/_staging/'
  const prefixMain = 'content/pokemon/'
  let name: string | null = null
  if (file.startsWith(prefixStaging)) name = file.slice(prefixStaging.length)
  else if (file.startsWith(prefixMain)) name = file.slice(prefixMain.length)
  if (name === null || name.includes('/') || name.includes('\\')) return false
  return TARGET_SAFE_NAME.test(name) && name !== 'gyms.json'
}

export interface PhotoFolder {
  readonly folder: string
  readonly photos: readonly string[]
}

/** AC-3 — agrupa las fotos por carpeta para el dropdown del picker. */
export function photosByFolder(photos: readonly string[]): PhotoFolder[] {
  const map = new Map<string, string[]>()
  for (const p of photos) {
    const cut = p.lastIndexOf('/')
    const folder = cut === -1 ? p : (p.slice(0, cut) || p)
    const list = map.get(folder) ?? []
    list.push(p)
    map.set(folder, list)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([folder, list]) => ({ folder, photos: list }))
}

// ── Tipos re-exportados para los editores ──
export type { Effect, EffectOp, PokemonCard }
