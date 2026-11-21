// cards-scan/evaldiag (SPEC-T/T-103/AC-2, AC-3, AC-6) — diagnóstico por
// etapa del lector: compara la carta leída con la verdad terreno campo por
// campo y atribuye la falla a segmentación (bloques perdidos/de más),
// OCR (el texto crudo no contiene el valor esperado), análisis (estaba pero
// se parseó mal), íconos (costos/elemento) o mapeo de efectos (texto bien
// leído, efecto distinto). Además: confusiones carácter↔carácter (5→S,
// -→~, _→.) con alineación por edición y resumen con causas ordenadas.
// Puro: sin IO ni OCR (la evidencia cruda entra por RawEvidence).
import type { PokemonCard } from '../../packages/content/src/cards.ts'

export type FailStage = 'segmentación' | 'ocr' | 'análisis' | 'íconos' | 'mapeo de efectos'
export const FAIL_STAGES: readonly FailStage[] = ['segmentación', 'ocr', 'análisis', 'íconos', 'mapeo de efectos']
export type DiagField = 'hp' | 'etapa' | 'evolución' | 'elemento' | 'nombre de ataque' | 'caras' | 'daño' | 'costos' | 'efectos'
export const DIAG_FIELDS: readonly DiagField[] = ['hp', 'etapa', 'evolución', 'elemento', 'nombre de ataque', 'caras', 'daño', 'costos', 'efectos']

export interface DiagError {
  readonly field: DiagField
  /** 1-based del ataque; null = campo de carta. */
  readonly attack: number | null
  readonly stage: FailStage
  readonly expected: string
  readonly read: string
}

export interface RawEvidence {
  readonly hp: string
  readonly footerStage: string
  readonly footerRight: string
  readonly blocks: readonly { kind: 'specialty' | 'attack'; text: string; damage: string | null }[]
}

export interface CardDiagnosis {
  readonly base: string
  readonly errors: readonly DiagError[]
  readonly checks: number
  readonly hits: number
  readonly byField: Readonly<Record<DiagField, { checks: number; hits: number }>>
}

export interface FieldStat {
  readonly field: DiagField
  readonly checks: number
  readonly hits: number
}

export interface CauseStat {
  readonly stage: FailStage
  readonly cards: number
  readonly errors: number
}

export interface ConfusionStat {
  readonly pair: string
  readonly count: number
}

export interface EvalSummary {
  readonly cards: number
  readonly fields: readonly FieldStat[]
  readonly causes: readonly CauseStat[]
  readonly confusions: readonly ConfusionStat[]
}

const norm = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
/** Comparación floja de textos de efecto: sin diacríticos ni puntuación. */
const normLoose = (s: string): string => norm(s).replace(/[^a-z0-9]/g, '')
/** Dígitos + parecidos del OCR (mismo juego que draftHp). */
const digitsIsh = (s: string): string => s.replace(/[^\dOolISsZzBbGg|!q]/g, '')
const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
/** Prefijo de caras del bloque: run inicial tipo `4-5_`. */
const facesPrefixOf = (text: string): string => {
  const m = text.trim().match(/^[0-9OolISsZzBb\-_,.\s]+/)
  return m === null ? '' : m[0].replace(/[\s_,.]+$/, '')
}

const STAGE_KEYWORD: Readonly<Record<PokemonCard['stage'], string>> = {
  basic: 'basic',
  evolution: 'evolu',
  gym: 'gimnas',
  league: 'liga',
  surprise: 'sorpresa',
}

/** Diagnóstico de UNA carta: campos correctos + etapa de cada falla. */
export function diagnoseCard(base: string, staged: PokemonCard, truth: PokemonCard, raw: RawEvidence): CardDiagnosis {
  const errors: DiagError[] = []
  const byField = Object.fromEntries(DIAG_FIELDS.map((f) => [f, { checks: 0, hits: 0 }])) as Record<DiagField, { checks: number; hits: number }>
  const check = (field: DiagField, attack: number | null, ok: boolean, expected: string, read: string, stage?: FailStage): void => {
    byField[field].checks += 1
    if (ok) {
      byField[field].hits += 1
      return
    }
    if (stage !== undefined) errors.push({ field, attack, stage, expected, read })
  }

  // HP: si el crudo ya tenía el número ⇒ el análisis lo perdió; si no ⇒ OCR.
  check('hp', null, staged.hp === truth.hp, String(truth.hp), digitsIsh(raw.hp), raw.hp.replace(/[^\d]/g, '').includes(String(truth.hp)) ? 'análisis' : 'ocr')

  // Etapa y evolución (pie). Elemento ⇒ siempre íconos.
  check('etapa', null, staged.stage === truth.stage, truth.stage, raw.footerStage, norm(raw.footerStage).includes(STAGE_KEYWORD[truth.stage]) ? 'análisis' : 'ocr')
  const evoOk = eq([...staged.evolvesTo].map((e) => `${e.id}:${e.xp}`).sort(), [...truth.evolvesTo].map((e) => `${e.id}:${e.xp}`).sort())
  const evoExpected = truth.evolvesTo.map((e) => `${e.id}(${e.xp})`).join(', ')
  const evoInRaw = truth.evolvesTo.every((e) => norm(raw.footerRight).includes(norm(e.id)))
  check('evolución', null, evoOk, evoExpected, raw.footerRight, truth.evolvesTo.length === 0 || evoInRaw ? 'análisis' : 'ocr')
  check('elemento', null, staged.element === truth.element, truth.element, staged.element, 'íconos')

  // Ataques (índice a índice; el bloque crudo correspondiente).
  const rawAttacks = raw.blocks.filter((b) => b.kind === 'attack')
  const n = Math.max(staged.attacks.length, truth.attacks.length)
  for (let i = 0; i < n; i++) {
    const s = staged.attacks[i]
    const t = truth.attacks[i]
    const no = i + 1
    if (s === undefined && t !== undefined) {
      // Bloque perdido por la segmentación: caen sus 5 campos.
      for (const f of ['nombre de ataque', 'caras', 'daño', 'costos', 'efectos'] as const) {
        check(f, no, false, f === 'nombre de ataque' ? t.name : f === 'caras' ? t.rollFaces.join('-') : f === 'daño' ? String(t.damage.base) : f === 'costos' ? t.cost.join(' ') : t.rawText, '—', 'segmentación')
      }
      continue
    }
    if (t === undefined && s !== undefined) {
      // Bloque de más (separador partido): un error de segmentación.
      check('nombre de ataque', no, false, '—', s.name, 'segmentación')
      continue
    }
    if (s === undefined || t === undefined) continue
    const braw = rawAttacks[i]?.text ?? ''
    check('nombre de ataque', no, norm(s.name) === norm(t.name), t.name, s.name, norm(braw).includes(norm(t.name)) ? 'análisis' : 'ocr')
    const dmgRaw = digitsIsh(rawAttacks[i]?.damage ?? '')
    check('caras', no, eq(s.rollFaces, t.rollFaces), t.rollFaces.join('-'), facesPrefixOf(braw) || '—', facesPrefixOf(braw).includes(t.rollFaces.join('-')) ? 'análisis' : 'ocr')
    check('daño', no, eq(s.damage, t.damage), String(t.damage.base) + (t.damage.ifRoll !== undefined ? `/${t.damage.ifRoll.faces.join('-')}→${t.damage.ifRoll.damage}` : ''), dmgRaw || '—', dmgRaw.includes(String(t.damage.base)) ? 'análisis' : 'ocr')
    check('costos', no, eq(s.cost, t.cost), t.cost.join(' '), s.cost.join(' '), 'íconos')
    check('efectos', no, eq(s.effects, t.effects), t.rawText, s.rawText, normLoose(s.rawText) === normLoose(t.rawText) ? 'mapeo de efectos' : 'ocr')
  }

  // Especialidades: bloque presente sin mapear ⇒ mapeo; bloque ausente ⇒ segmentación.
  if (!eq(staged.specialties, truth.specialties)) {
    const hayBloque = raw.blocks.some((b) => b.kind === 'specialty')
    byField.efectos.checks += 1
    errors.push({
      field: 'efectos', attack: null, stage: hayBloque ? 'mapeo de efectos' : 'segmentación',
      expected: truth.specialties.map((e) => e.op).join(','), read: staged.specialties.map((e) => e.op).join(','),
    })
  }

  const checks = DIAG_FIELDS.reduce((a, f) => a + byField[f].checks, 0)
  const hits = DIAG_FIELDS.reduce((a, f) => a + byField[f].hits, 0)
  return { base, errors, checks, hits, byField }
}

/** Confusiones carácter↔carácter entre lo esperado y lo leído (alineación
 * por distancia de edición; sustituciones '5→S', borrados '0→∅'). */
export function charConfusions(expected: string, read: string): readonly string[] {
  const e = [...expected]
  const r = [...read]
  const n = e.length
  const m = r.length
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = 0; i <= n; i++) d[i]![0] = i
  for (let j = 0; j <= m; j++) d[0]![j] = j
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = e[i - 1] === r[j - 1] ? 0 : 1
      d[i]![j] = Math.min(d[i - 1]![j - 1]! + cost, d[i - 1]![j]! + 1, d[i]![j - 1]! + 1)
    }
  }
  const out: string[] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && e[i - 1] === r[j - 1]) {
      i -= 1
      j -= 1
    } else if (i > 0 && j > 0 && d[i]![j] === d[i - 1]![j - 1]! + 1) {
      out.push(`${e[i - 1]}→${r[j - 1]}`)
      i -= 1
      j -= 1
    } else if (i > 0 && d[i]![j] === d[i - 1]![j]! + 1) {
      out.push(`${e[i - 1]}→∅`)
      i -= 1
    } else if (j > 0) {
      out.push(`∅→${r[j - 1]}`)
      j -= 1
    } else break
  }
  return out.reverse()
}

/** Resumen del lote: exactitud por campo, causas ordenadas por cartas
 * afectadas (desempata por errores) y confusiones frecuentes (campos
 * numéricos con falla de OCR). */
export function summarize(diags: readonly CardDiagnosis[]): EvalSummary {
  const fields: FieldStat[] = DIAG_FIELDS.map((field) => {
    const checks = diags.reduce((a, d) => a + d.byField[field].checks, 0)
    const hits = diags.reduce((a, d) => a + d.byField[field].hits, 0)
    return { field, checks, hits }
  })
  const byStage = new Map<FailStage, { cards: Set<string>; errors: number }>()
  for (const d of diags) {
    for (const e of d.errors) {
      const acc = byStage.get(e.stage) ?? { cards: new Set<string>(), errors: 0 }
      acc.cards.add(d.base)
      acc.errors += 1
      byStage.set(e.stage, acc)
    }
  }
  const causes: CauseStat[] = [...byStage.entries()]
    .map(([stage, a]) => ({ stage, cards: a.cards.size, errors: a.errors }))
    .sort((a, b) => b.cards - a.cards || b.errors - a.errors || FAIL_STAGES.indexOf(a.stage) - FAIL_STAGES.indexOf(b.stage))
  const counts = new Map<string, number>()
  for (const d of diags) {
    for (const e of d.errors) {
      if (e.stage !== 'ocr' || (e.field !== 'hp' && e.field !== 'daño' && e.field !== 'caras')) continue
      for (const pair of charConfusions(e.expected, e.read)) counts.set(pair, (counts.get(pair) ?? 0) + 1)
    }
  }
  const confusions: ConfusionStat[] = [...counts.entries()]
    .map(([pair, count]) => ({ pair, count }))
    .sort((a, b) => b.count - a.count || a.pair.localeCompare(b.pair))
  return { cards: diags.length, fields, causes, confusions }
}

/** Aviso de verdad terreno insuficiente (SPEC-T/T-103/AC-1): < 20 pares ⇒
 * pedirle al dueño confirmar las cartas en revisión (aceptar/corregir). */
export function truthWarning(pairs: number, inRevision: readonly string[]): string[] {
  if (pairs >= 20) return [`verdad terreno: ${pairs} pares (≥ 20)`]
  const lines = [`verdad terreno: ${pairs} par(es) — MENOS DE 20: el dueño tiene que confirmar las cartas en revisión:`]
  if (inRevision.length === 0) lines.push('  (no hay cartas del lector en revisión para confirmar)')
  for (const b of inRevision.slice(0, 20)) lines.push(`  - ${b}`)
  if (inRevision.length > 20) lines.push(`  … y ${inRevision.length - 20} más`)
  lines.push('aceptar/corregir en /admin/cards o report.html › filtro "Con revisión"; después volver a correr pnpm cards:eval')
  return lines
}
