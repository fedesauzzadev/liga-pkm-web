// cards-scan/iclassify (SPEC-S/T-102c/AC-3..4) — clasificación de íconos por
// CENTROIDE MÁS CERCANO con confidence: el círculo gris vacío es siempre
// `any`; lo que supera la distancia máxima queda `unknown` (⇒ needsReview).
// El ícono del pie determina el deck y el del encabezado el element del
// Pokémon; el element de un ataque es el primer color del costo (o normal).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { iconDistance, type CardIcons, type IconPatch } from './icons.ts'

export const ELEMENT_CLASSES: ReadonlySet<string> = new Set([
  'normal',
  'fire',
  'water',
  'grass',
  'electric',
  'psychic',
  'fighting',
  'poison',
  'ground',
  'flying',
  'bug',
  'ghost',
  'ice',
  'rock',
  'dragon',
])
/** Decks válidos para una carta (dominio de `deck` en el SDD §4). */
export const DECK_CLASSES: ReadonlySet<string> = new Set([
  'bosque',
  'montana',
  'isla',
  'llanura',
  'pantano',
  'gimnasio',
  'liga',
  'sorpresa',
  'evolucion',
])

export interface IconLabel {
  readonly id: string
  readonly label: string
  readonly vector: readonly number[]
}

/** `content/cards/icon-labels.json` (exportado desde icons.html).
 */
export interface IconLabels {
  readonly version: 1
  readonly icons: readonly IconLabel[]
}

/** Parsea y valida icon-labels.json; null si es inválido (no rompe el lote). */
export function parseIconLabels(text: string): IconLabels | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (r.version !== 1 || !Array.isArray(r.icons)) return null
  const icons: IconLabel[] = []
  for (const e of r.icons) {
    if (typeof e !== 'object' || e === null) return null
    const l = e as Record<string, unknown>
    if (typeof l.id !== 'string' || typeof l.label !== 'string' || !Array.isArray(l.vector)) return null
    if (l.vector.length !== 259 || !l.vector.every((v) => typeof v === 'number' && Number.isFinite(v))) return null
    icons.push({ id: l.id, label: l.label, vector: l.vector.filter((v): v is number => typeof v === 'number') })
  }
  return { version: 1, icons }
}

export function loadIconLabels(root: string): IconLabels | null {
  const p = join(root, 'content', 'cards', 'icon-labels.json')
  if (!existsSync(p)) return null
  try {
    return parseIconLabels(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

export interface IconClassResult {
  readonly label: string
  readonly confidence: number
  readonly distance: number
}

/** Clasifica un ícono: el círculo gris vacío es `any` SOLO en costos (en
 * encabezado/pie no existe "any"; un fragmento pálido ahí cae a centroide y
 * si no encaja queda unknown + revisar). */
export function classifyPatch(patch: IconPatch, labels: IconLabels, maxDistance: number): IconClassResult {
  if (patch.grayCircle && patch.role === 'cost') return { label: 'any', confidence: 0.95, distance: 0 }
  let best: IconLabel | null = null
  let bestD = Number.POSITIVE_INFINITY
  for (const l of labels.icons) {
    const d = iconDistance(patch.vector, l.vector)
    if (d < bestD) {
      bestD = d
      best = l
    }
  }
  if (best === null) return { label: 'unknown', confidence: 0, distance: 1 }
  if (bestD > maxDistance) return { label: 'unknown', confidence: 0, distance: bestD }
  return { label: best.label, confidence: Math.max(0, 1 - bestD / maxDistance), distance: bestD }
}

export interface CardIconClasses {
  readonly element: IconClassResult | null
  readonly deck: IconClassResult | null
  readonly costs: readonly (readonly IconClassResult[])[]
}

/** Clasifica los íconos de una carta (element, deck, costos por ataque). */
export function classifyCardIcons(card: CardIcons, labels: IconLabels, maxDistance: number): CardIconClasses {
  return {
    element: card.element === null ? null : classifyPatch(card.element, labels, maxDistance),
    deck: card.deck === null ? null : classifyPatch(card.deck, labels, maxDistance),
    costs: card.costs.map((cs) => cs.map((p) => classifyPatch(p, labels, maxDistance))),
  }
}

/** Element de un ataque: primer tipo de color del costo; todo any ⇒ normal. */
export function attackElementOf(cost: readonly string[]): string {
  for (const c of cost) if (ELEMENT_CLASSES.has(c) && c !== 'normal') return c
  return 'normal'
}
