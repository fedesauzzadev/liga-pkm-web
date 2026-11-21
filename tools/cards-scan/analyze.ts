// cards-scan/analyze (SPEC-S/T-102b/AC-2..6) — análisis PURO del texto OCR:
// bloques de ataque (prefijo de caras, nombre, habilidad por comillas/ausencia
// de daño, daño base e ifRoll), especialidades en MAYÚSCULAS, pie (etapa,
// evolución, oportunidad), encabezado de gimnasio/liga y ajuste del nombre a
// la lista de PokeAPI (snapNameToPokeapi). Sin IO ⇒ testeable directo.
import type { SpeciesOut } from '../pokeapi.ts'

export interface RegionOcr {
  readonly text: string
  readonly confidence: number // 0-1
}

export type CardGroup = 'terrain' | 'evolution' | 'sorpresa' | 'gym' | 'league'
export type StageKind = 'basic' | 'evolution' | 'gym' | 'league' | 'surprise'

/** Colapsa espacios/saltos y normaliza unicode (no toca tildes ni MAYÚSCULAS). */
export function normalizeText(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim()
}

/** slug ascii: minúsculas, sin tildes, separadores '-' (id de carta/ataque). */
export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const norm = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Comparación de nombres (T-104): minúsculas, sin tildes ni signos
 * (`Nidoran♀`→`nidoran`, `Mr. Mime`→`mrmime`, `Farfetch'd`→`farfetchd`). */
export const canonicalName = (s: string): string => norm(s).replace(/[^a-z0-9]/g, '')

/** Levenshtein con tope (corta temprano si se pasa de max). */
export function levenshtein(a: string, b: string, max = Number.POSITIVE_INFINITY): number {
  if (a === b) return 0
  const BIG = Number.MAX_SAFE_INTEGER
  if (Math.abs(a.length - b.length) > max) return max + 1
  const prev = new Array<number>(b.length + 1)
  const cur = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    let rowMin = cur[0]
    for (let j = 1; j <= b.length; j++) {
      const cost = (a[i - 1] ?? '') === (b[j - 1] ?? '') ? 0 : 1
      const v = Math.min((prev[j - 1] ?? BIG) + cost, (prev[j] ?? BIG) + 1, (cur[j - 1] ?? BIG) + 1)
      cur[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j] ?? BIG
  }
  return prev[b.length] ?? max + 1
}

const DIGIT_FIX: Record<string, string> = { O: '0', o: '0', D: '0', I: '1', l: '1', '|': '1', '!': '1', Z: '2', z: '2', S: '5', s: '5', B: '8', G: '6', b: '6', g: '9', q: '9' }

/** Corrige confusiones obvias de dígitos SOLO en campos numéricos (AC-5). */
export function fixDigits(raw: string): { text: string; changed: boolean } {
  let changed = false
  let out = ''
  for (const ch of raw) {
    const rep = DIGIT_FIX[ch]
    if (rep !== undefined) {
      out += rep
      changed = true
    } else out += ch
  }
  return { text: out, changed }
}

export interface FacesResult {
  readonly faces: readonly number[] | null
  readonly corrected: boolean
  readonly note?: string | undefined
}

/** `4-5` (con confusiones tipo `4-S`) → [4,5]; valida 1-6, dedupe y ordena. */
export function parseFaces(raw: string, allowedDigits: readonly number[]): FacesResult {
  const { text, changed } = fixDigits(raw.replace(/\s+/g, ''))
  const parts = text.split('-').filter((p) => p.length > 0)
  const nums = parts.map((p) => Number.parseInt(p, 10))
  if (nums.length === 0 || nums.some((n) => !Number.isInteger(n) || !allowedDigits.includes(n))) {
    return { faces: null, corrected: false, note: `caras ilegibles: "${raw}"` }
  }
  const sorted = [...new Set(nums)].sort((a, b) => a - b)
  const reordered = sorted.join('') !== nums.join('')
  return { faces: sorted, corrected: changed || reordered, note: reordered ? 'caras reordenadas/dedup' : changed ? 'caras corregidas (O/S/l…)' : undefined }
}

export interface DamageScan {
  readonly base: number | null
  readonly baseCandidates: readonly number[]
  readonly ifRoll: { faces: readonly number[]; damage: number } | null
  readonly zeroZero: boolean
}

/** Daño `(10)` a la derecha y `N-N-N (X)` dentro del texto (AC-2). */
export function scanDamage(text: string, damageStrip: string | null): DamageScan {
  const stripDigits = damageStrip?.match(/\d{1,3}/) ?? null
  const bareParens: number[] = []
  const ifRolls: { faces: readonly number[]; damage: number }[] = []
  for (const m of text.matchAll(/(\d(?:\s*-\s*\d)+)?\s*\((\d{1,3})\)/g)) {
    const dmg = Number.parseInt(fixDigits(m[2] ?? '').text, 10)
    if (!Number.isInteger(dmg)) continue
    if (m[1] !== undefined) {
      const fx = fixDigits(m[1]).text.replace(/\s+/g, '')
      const faces = fx.split('-').map((p) => Number.parseInt(p, 10))
      if (faces.every((f) => Number.isInteger(f))) ifRolls.push({ faces, damage: dmg })
    } else bareParens.push(dmg)
  }
  const ifRoll = ifRolls.length > 0 ? (ifRolls[ifRolls.length - 1] ?? null) : null
  const zeroZero = /\(00\)/.test(damageStrip ?? '') || /\(00\)/.test(text)
  const stripVal = stripDigits !== null ? Number.parseInt(stripDigits[0], 10) : null
  const candidates = [...(stripVal !== null ? [stripVal] : []), ...bareParens]
  const base = candidates.length === 1 ? (candidates[0] ?? null) : candidates.length > 1 ? (candidates[candidates.length - 1] ?? null) : null
  return { base, baseCandidates: candidates, zeroZero, ifRoll }
}

export interface AttackParse {
  readonly rollFaces: readonly number[] | null
  readonly name: string
  readonly kind: 'attack' | 'ability'
  readonly damageBase: number | null
  readonly ifRoll: { faces: readonly number[]; damage: number } | null
  readonly rawText: string
  readonly effectText: string
  readonly confidence: number
  readonly notes: readonly string[]
  readonly needsReview: boolean
}

const QUOTES = /^[“"«'»”]+|[“"«'»”]+$/g

/** Un bloque de ataque: `4-5_ Envolver: texto…` + franja de daño `(10)`. */
export function analyzeAttack(text: RegionOcr, damageStrip: RegionOcr | null, allowedDigits: readonly number[]): AttackParse {
  const raw = normalizeText(text.text)
  const notes: string[] = []
  let conf = Math.max(0, Math.min(1, text.confidence))
  // Franja de daño: si no trajo dígitos (típico en habilidades) no penaliza;
  // la ausencia de daño es una señal válida, no una lectura pobre.
  const dmgConf = damageStrip !== null && /\d/.test(damageStrip.text) ? Math.max(0, Math.min(1, damageStrip.confidence)) : 1
  conf = Math.min(conf, dmgConf)

  // Prefijo de caras: `4-5_`; el OCR a veces lee el `_` como espacio
  // (`1-2 Attack-trueno`), así que el separador admite espacios/guiones bajos.
  const prefix = raw.match(/^(\d(?:[\s-]?\d)*)[\s_]+(?![\d_])/)
  let rest = raw
  let faces: readonly number[] | null = null
  if (prefix !== null) {
    rest = raw.slice(prefix[0].length)
    const fr = parseFaces((prefix[1] ?? '').replace(/\s+/g, ''), allowedDigits)
    faces = fr.faces
    if (fr.faces === null) notes.push(fr.note ?? 'caras ilegibles')
    else if (fr.corrected) {
      conf *= 0.85
      notes.push(fr.note ?? 'caras corregidas')
    }
  } else {
    notes.push('sin prefijo de caras')
  }

  const colonAt = rest.indexOf(':')
  let name: string
  let effectText: string
  if (colonAt > 0) {
    name = rest.slice(0, colonAt).trim()
    effectText = rest.slice(colonAt + 1).trim()
  } else {
    const firstWord = rest.split(/\s{2,}|\n/)[0] ?? rest
    name = firstWord.trim()
    effectText = rest.slice(firstWord.length).trim()
    notes.push('nombre sin ":"')
    conf *= 0.9
  }
  const wasQuoted = QUOTES.test(name)
  name = name.replace(QUOTES, '').trim()

  const dmg = scanDamage(raw, damageStrip?.text ?? null)
  const damageBase = dmg.base
  if (dmg.zeroZero && damageBase === 0) notes.push('(00): daño 0 a revisar')
  if (damageBase !== null && (damageBase < 0 || damageBase > 200 || damageBase % 10 !== 0)) {
    notes.push(`daño ${damageBase} no válido`)
    conf *= 0.7
  }
  if (dmg.baseCandidates.length > 1) notes.push('varios daños candidatos')

  let kind: 'attack' | 'ability' = 'attack'
  if (wasQuoted) kind = 'ability'
  else if (damageBase === null && !dmg.zeroZero) {
    kind = 'ability'
    notes.push('habilidad inferida: sin comillas ni daño')
  }
  const hardProblem =
    faces === null ||
    (kind === 'attack' && damageBase === null) ||
    (dmg.zeroZero && damageBase === 0) ||
    notes.some((n) => /no válido|ilegibles|sin prefijo|sin ":"/.test(n))
  return { rollFaces: faces, name, kind, damageBase, ifRoll: dmg.ifRoll, rawText: raw, effectText, confidence: conf, notes, needsReview: hardProblem }
}

const SPECIALTY_RE = /^[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ ]{3,}:/

/** Línea previa a los ataques en MAYÚSCULAS con dos puntos (AC-3). */
export function analyzeSpecialty(text: RegionOcr): { key: string; rawText: string } | null {
  const raw = normalizeText(text.text)
  const m = raw.match(SPECIALTY_RE)
  if (m === null) return null
  return { key: (m[0] ?? '').replace(/:$/, ''), rawText: raw }
}

export interface FooterParse {
  readonly stage: StageKind | null
  readonly evolvesTo: readonly { id: string; name: string; xp: number }[]
  readonly chances: number | null
  readonly notes: readonly string[]
}

/** Pie: etapa, `E: Nombre (n)`, `Oportunidad: n`; gimnasio/liga van aparte. */
export function analyzeFooter(stageText: RegionOcr, rightText: RegionOcr): FooterParse {
  const stageRaw = normalizeText(stageText.text)
  const right = normalizeText(rightText.text)
  const notes: string[] = []
  let stage: StageKind | null = null
  if (/b[áa]sico/i.test(stageRaw)) stage = 'basic'
  else if (/evoluci[óo]n/i.test(stageRaw)) stage = 'evolution'
  else notes.push(`etapa no reconocida: "${stageRaw}"`)

  const evolvesTo: { id: string; name: string; xp: number }[] = []
  const evo = right.match(/E\s*:\s*([^()]+?)\s*\((\d{1,2})\)/)
  if (evo !== null) {
    const name = evo[1]?.trim() ?? ''
    const xp = Number.parseInt(fixDigits(evo[2] ?? '').text, 10)
    if (name.length > 0 && Number.isInteger(xp) && xp > 0) evolvesTo.push({ id: slugify(name), name, xp })
    else notes.push('evolución ilegible')
  }
  const chancesM = normalizeText(right).match(/oportunidad\s*:?\s*(\d{1,2})/i)
  const chances = chancesM !== null ? Number.parseInt(fixDigits(chancesM[1] ?? '').text, 10) : null
  if (chancesM !== null && !Number.isInteger(chances as number)) notes.push('oportunidad ilegible')
  return { stage, evolvesTo, chances, notes }
}

export interface GymHeaderParse {
  readonly slot: number
  readonly name: string
  readonly leaderOrTrainer: string
}

/** Gimnasio/Liga: `#2 Onix de Brock` (AC-4). */
export function analyzeGymHeader(text: RegionOcr): GymHeaderParse | null {
  const raw = normalizeText(text.text)
  const m = raw.match(/^#?\s*(\d)\s+(.+?)\s+de\s+(.+)$/)
  if (m === null) return null
  const slot = Number.parseInt(fixDigits(m[1] ?? '').text, 10)
  const name = (m[2] ?? '').trim()
  const leaderOrTrainer = (m[3] ?? '').trim()
  if (!Number.isInteger(slot) || name.length === 0 || leaderOrTrainer.length === 0) return null
  return { slot, name, leaderOrTrainer }
}

export interface SnapResult {
  readonly name: string
  readonly dex: number
  readonly distance: number
}

/** Ajusta el nombre a la lista de PokeAPI si distancia ≤ max (AC-6). */
export function snapNameToPokeapi(name: string, species: readonly SpeciesOut[], max: number): SnapResult | null {
  const target = norm(name)
  if (target.length === 0) return null
  let best: SnapResult | null = null
  for (const sp of species) {
    for (const cand of [sp.nameEs, sp.nameEn]) {
      const d = levenshtein(target, norm(cand), max)
      if (d <= max && (best === null || d < best.distance)) best = { name: sp.nameEs.length > 0 ? sp.nameEs : sp.nameEn, dex: sp.dex, distance: d }
    }
  }
  return best
}
