// cards-scan/gclassify (SPEC-T/T-105/AC-3) — clasificación de glifos por
// CENTROIDE MÁS CERCANO con confianza y ranking de alternativas, más los
// LECTORES con restricciones del dominio: HP 20-150 múltiplo de 10, daño
// 0-200 múltiplo de 10, caras ∈ 1-6 en orden ascendente separadas por `-` y
// prefijo terminado en `_`. Si la mejor hipótesis viola una restricción, se
// prueba la SEGUNDA mejor de cada glifo (enumeración por costo) antes de
// marcar needsReview. Puro: sin IO salvo cargar glyph-labels.json.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { glyphDistance, type GlyphPatch } from './glyphs.ts'

export const GLYPH_CLASSES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '_', '(', ')', '+'] as const
export type GlyphClass = (typeof GLYPH_CLASSES)[number]

export interface GlyphLabel {
  readonly id: string
  readonly label: string
  readonly vector: readonly number[]
}

/** `content/cards/glyph-labels.json` (exportado desde glyphs.html). */
export interface GlyphLabels {
  readonly version: 1
  readonly glyphs: readonly GlyphLabel[]
}

/** Parsea y valida glyph-labels.json; null si es inválido (no rompe el lote). */
export function parseGlyphLabels(text: string): GlyphLabels | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (r.version !== 1 || !Array.isArray(r.glyphs)) return null
  const glyphs: GlyphLabel[] = []
  for (const e of r.glyphs) {
    if (typeof e !== 'object' || e === null) return null
    const l = e as Record<string, unknown>
    if (typeof l.id !== 'string' || typeof l.label !== 'string' || !Array.isArray(l.vector)) return null
    if (!(GLYPH_CLASSES as readonly string[]).includes(l.label)) return null
    if (l.vector.length !== 146 || !l.vector.every((v) => typeof v === 'number' && Number.isFinite(v))) return null
    glyphs.push({ id: l.id, label: l.label, vector: l.vector.filter((v): v is number => typeof v === 'number') })
  }
  return { version: 1, glyphs }
}

export function loadGlyphLabels(root: string): GlyphLabels | null {
  const p = join(root, 'content', 'cards', 'glyph-labels.json')
  if (!existsSync(p)) return null
  try {
    return parseGlyphLabels(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

export interface GlyphRanked {
  readonly label: string
  readonly distance: number
}

export interface GlyphClassResult {
  /** Mejor etiqueta o 'unknown' si supera la distancia máxima. */
  readonly label: string
  readonly confidence: number
  /** Etiquetas ordenadas por distancia (para la 2ª hipótesis del lector). */
  readonly ranked: readonly GlyphRanked[]
}

/** Clasifica un glifo contra los centroides etiquetados (orden determinista:
 * distancia y desempate alfabético). */
export function classifyGlyph(patch: GlyphPatch, labels: GlyphLabels, maxDistance: number): GlyphClassResult {
  const ranked: GlyphRanked[] = labels.glyphs
    .map((l) => ({ label: l.label, distance: glyphDistance(patch.vector, l.vector) }))
    .sort((a, b) => a.distance - b.distance || a.label.localeCompare(b.label))
  const best = ranked[0]
  if (best === undefined) return { label: 'unknown', confidence: 0, ranked: [] }
  if (best.distance > maxDistance) return { label: 'unknown', confidence: 0, ranked }
  return { label: best.label, confidence: Math.max(0, 1 - best.distance / maxDistance), ranked }
}

/** Lectura con restricciones (AC-3). */
export interface GlyphRead<T> {
  readonly value: T | null
  readonly confidence: number
  readonly usedSecondBest: boolean
  readonly needsReview: boolean
  readonly note?: string
}

interface Combo {
  readonly labels: readonly string[]
  readonly dist: number
  readonly allFirst: boolean
}

/** Enumera las cadenas candidatas: las 2 mejores hipótesis de cada glifo (del
 * ranking que ya calculó classifyGlyph), ordenadas por costo total. Tope 4096. */
function combosOf(results: readonly GlyphClassResult[]): Combo[] {
  let out: Combo[] = [{ labels: [], dist: 0, allFirst: true }]
  for (const r of results) {
    const opts = r.ranked.slice(0, 2)
    if (opts.length === 0) return []
    const next: Combo[] = []
    for (const c of out) {
      opts.forEach((o, i) => {
        if (next.length >= 4096) return
        next.push({ labels: [...c.labels, o.label], dist: c.dist + o.distance, allFirst: c.allFirst && i === 0 })
      })
    }
    out = next
  }
  return out.sort((a, b) => a.dist - b.dist)
}

const confOf = (results: readonly GlyphClassResult[], combo: Combo): number => {
  if (results.length === 0) return 0
  const dists = combo.labels.map((label, i) => results[i]?.ranked.find((x) => x.label === label)?.distance ?? 0)
  const mean = dists.reduce((a, b) => a + b, 0) / dists.length
  return Math.max(0, Math.min(1, 1 - mean / 0.5)) * (combo.allFirst ? 1 : 0.9)
}

const rangeOk = (n: number, r: { min: number; max: number; multipleOf: number }): boolean => n >= r.min && n <= r.max && n % r.multipleOf === 0

/** HP: 2-3 dígitos, en rango y múltiplo de 10 (default 20-150). */
export function readHpNumber(results: readonly GlyphClassResult[], range: { min: number; max: number; multipleOf: number }): GlyphRead<number> {
  if (results.length === 0) return { value: null, confidence: 0, usedSecondBest: false, needsReview: true, note: 'sin glifos de HP' }
  for (const c of combosOf(results)) {
    const s = c.labels.join('')
    if (!/^\d{2,3}$/.test(s)) continue
    const n = Number.parseInt(s, 10)
    if (!rangeOk(n, range)) continue
    return { value: n, confidence: confOf(results, c), usedSecondBest: !c.allFirst, needsReview: false }
  }
  return { value: null, confidence: 0, usedSecondBest: false, needsReview: true, note: 'HP no cumple las restricciones' }
}

const DEFAULT_FACES = [1, 2, 3, 4, 5, 6]

/** Prefijo de caras: `4-5_` ⇒ [4,5]. Dígitos 1-6, ascendentes, separados por
 * `-` y terminados en `_`. Devuelve la cadena COMPLETA de glifos ya cortada
 * por el extractor; si trae algo después del `_` se ignora (ruido del nombre). */
export function readFacesPrefix(results: readonly GlyphClassResult[], allowedDigits: readonly number[] = DEFAULT_FACES): GlyphRead<readonly number[]> {
  if (results.length === 0) return { value: null, confidence: 0, usedSecondBest: false, needsReview: true, note: 'sin glifos de caras' }
  for (const c of combosOf(results)) {
    const labels = c.labels
    const end = labels.indexOf('_')
    if (end < 0) continue
    const s = labels.slice(0, end + 1).join('')
    const m = s.match(/^(\d)(-\d)*_$/)
    if (m === null) continue
    const digits = s.slice(0, -1).split('-').map((d) => Number.parseInt(d, 10))
    if (digits.some((d) => !allowedDigits.includes(d))) continue
    const sorted = [...digits]
    let ascending = true
    for (let i = 1; i < sorted.length; i++) {
      if ((sorted[i - 1] ?? 0) >= (sorted[i] ?? 0)) ascending = false
    }
    if (!ascending) continue
    return { value: digits, confidence: confOf(results, { ...c, labels: labels.slice(0, end + 1) }), usedSecondBest: !c.allFirst, needsReview: false }
  }
  return { value: null, confidence: 0, usedSecondBest: false, needsReview: true, note: 'caras no cumplen las restricciones (sin `_` final, fuera de 1-6 o desordenadas)' }
}

/** Daño: `(10)` / `(+10)` ⇒ número, en rango y múltiplo de 10 (0-200). Sin
 * glifos (habilidad) ⇒ null SIN needsReview. Tolerante a basura: en escaneos
 * reales la primera palabra del efecto puede entrar a la zona; se matchea el
 * SUBSTRING `(...)` (los glifos previos se ignoran). */
export function readDamageNumber(results: readonly GlyphClassResult[], range: { min: number; max: number; multipleOf: number }): GlyphRead<number> {
  if (results.length === 0) return { value: null, confidence: 1, usedSecondBest: false, needsReview: false, note: 'sin glifos de daño (¿habilidad?)' }
  for (const c of combosOf(results)) {
    const m = c.labels.join('').match(/\((\+)?(\d{1,3})\)/)
    if (m === null) continue
    const n = Number.parseInt(m[2] ?? '', 10)
    if (!rangeOk(n, range)) continue
    const end = (m.index ?? 0) + m[0].length
    return { value: n, confidence: confOf(results, { ...c, labels: c.labels.slice(0, end) }), usedSecondBest: !c.allFirst, needsReview: false }
  }
  return { value: null, confidence: 0, usedSecondBest: false, needsReview: true, note: 'daño no cumple las restricciones' }
}
