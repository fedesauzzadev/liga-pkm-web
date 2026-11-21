// cards-scan/filename (SPEC-T/T-104/AC-1) — el nombre y el mazo/grupo salen
// del NOMBRE del archivo (el dueño renombró todos los escaneos). Analizador
// tolerante: sin distinguir mayúsculas ni tildes, separadores `_`, `-`, `.` y
// espacio (los dobles espacios colapsan); detecta el Pokémon contra la lista
// de PokeAPI (distancia ≤ 2, prefijo de hasta 3 palabras), el mazo/grupo con
// alias (`montana|montaña`, `isla|lago`, `evolucion|evo`, `sorpresa|s`,
// `gimnasio|gym`, `liga|league|l`), un número final (o letra a/b/c) como
// copia/variante y el líder de gimnasio / entrenador de Liga. Lo que no puede
// interpretar queda ok:false (needsReview) y el llamador cae al OCR.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SpeciesOut } from '../pokeapi.ts'
import { canonicalName, levenshtein, type CardGroup } from './analyze.ts'
import type { SegProfile } from './segment.ts'

const GROUP_DIRS: readonly CardGroup[] = ['terrain', 'evolution', 'sorpresa', 'gym', 'league']

// Sufijo del nombre de archivo → deck (convención del dueño, Q-081).
const DECK_SUFFIXES: ReadonlyArray<readonly [string, string]> = [
  [' gym', 'gimnasio'],
  [' league', 'liga'],
  [' s', 'sorpresa'],
  [' bosque', 'bosque'],
  [' isla', 'isla'],
  [' llanura', 'llanura'],
  [' montana', 'montana'],
  [' pantano', 'pantano'],
]

/** Deck por sufijo del nombre ("X Bosque.jpg", "Abra S.jpg") o token "Evo". */
export function deckFromFilename(name: string): string | null {
  const base = name.toLowerCase().replace(/\.(jpe?g|png)$/i, '')
  for (const [suf, deck] of DECK_SUFFIXES) if (base.endsWith(suf)) return deck
  if (/(^|[ _-])evo([ _-]|$)/.test(base)) return 'evolucion'
  return null
}

const PATH_DECKS: ReadonlyArray<readonly [string, string]> = [
  ['bosque', 'bosque'],
  ['montana', 'montana'],
  ['isla', 'isla'],
  ['llanura', 'llanura'],
  ['pantano', 'pantano'],
  ['evolution', 'evolucion'],
  ['sorpresa', 'sorpresa'],
  ['gym', 'gimnasio'],
  ['league', 'liga'],
]

/** Deck por carpeta (scans/<grupo>/<mazo>/…); respaldo del nombre. */
export function deckFromPath(file: string): string | null {
  const segs = file.split(/[\\/]/).map((s) => s.toLowerCase())
  for (const [seg, deck] of PATH_DECKS) if (segs.includes(seg)) return deck
  return null
}

/** Grupo/concreto desde la ruta (scans/<grupo>/<mazo>/…); el CLI explícito gana. */
export function resolveGroup(file: string, cli: CardGroup | 'auto'): CardGroup {
  if (cli !== 'auto') return cli
  const segs = file.split(/[\\/]/).map((s) => s.toLowerCase())
  for (const g of GROUP_DIRS) if (segs.includes(g)) return g
  return 'terrain'
}

/** Lista de especies de PokeAPI (T-045) si existe; si no, null. */
export function loadSpecies(root: string): readonly SpeciesOut[] | null {
  const p = join(root, 'content', 'reference', 'pokeapi', 'species.json')
  if (!existsSync(p)) return null
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as { species?: unknown }
    if (!Array.isArray(raw.species)) return null
    const out: SpeciesOut[] = []
    for (const s of raw.species) {
      if (typeof s !== 'object' || s === null) continue
      const r = s as Record<string, unknown>
      if (typeof r.dex === 'number' && typeof r.nameEn === 'string' && typeof r.nameEs === 'string' && Array.isArray(r.types)) {
        out.push({ dex: r.dex, nameEn: r.nameEn, nameEs: r.nameEs, types: r.types.filter((t): t is string => typeof t === 'string') })
      }
    }
    return out.length > 0 ? out : null
  } catch {
    return null
  }
}

/** Prioridad cuando hay varios marcadores de grupo en el nombre. */
const GROUP_PRIORITY: readonly CardGroup[] = ['gym', 'league', 'sorpresa', 'evolution', 'terrain']

interface Marker {
  readonly group: CardGroup
  readonly deck: string | null
}

const WORD_MARKERS: Readonly<Record<string, Marker>> = {
  gimnasio: { group: 'gym', deck: 'gimnasio' },
  gym: { group: 'gym', deck: 'gimnasio' },
  liga: { group: 'league', deck: 'liga' },
  league: { group: 'league', deck: 'liga' },
  sorpresa: { group: 'sorpresa', deck: 'sorpresa' },
  evolucion: { group: 'evolution', deck: 'evolucion' },
  evo: { group: 'evolution', deck: 'evolucion' },
  bosque: { group: 'terrain', deck: 'bosque' },
  montana: { group: 'terrain', deck: 'montana' },
  isla: { group: 'terrain', deck: 'isla' },
  lago: { group: 'terrain', deck: 'isla' },
  llanura: { group: 'terrain', deck: 'llanura' },
  pantano: { group: 'terrain', deck: 'pantano' },
}

// Letras sueltas con significado propio en los nombres reales del dueño:
// `Eevee Gary L League` (L = Liga) y `Abra S` (S = Sorpresa).
const LETTER_MARKERS: Readonly<Record<string, Marker>> = {
  l: { group: 'league', deck: 'liga' },
  s: { group: 'sorpresa', deck: 'sorpresa' },
}

export interface FilenameParse {
  readonly group: CardGroup | null
  readonly deck: string | null
  /** Nombre canónico de PokeAPI (o crudo si no hay lista); null = cae al OCR. */
  readonly name: string | null
  readonly dex: number | null
  /** Copia/variante: número final o letra a/b/c. */
  readonly variant: string | null
  /** Líder (gym) o entrenador (Liga), si sobran tokens tras el nombre. */
  readonly leaderOrTrainer: string | null
  /** Interpretación completa (nombre + grupo); si no, el llamador cae al OCR. */
  readonly ok: boolean
  readonly notes: readonly string[]
}

const titleCase = (s: string): string => (s.length > 0 ? s[0]!.toUpperCase() + s.slice(1) : s)

interface SpeciesHit {
  readonly name: string
  readonly dex: number
  readonly distance: number
}

/** Mejor especie a distancia ≤ max por nombre canónico (empate: menor dex). */
function snapSpecies(cand: string, species: readonly SpeciesOut[], max: number): SpeciesHit | null {
  let best: SpeciesHit | null = null
  for (const sp of species) {
    for (const raw of [sp.nameEs, sp.nameEn]) {
      if (raw.length === 0) continue
      const d = levenshtein(cand, canonicalName(raw), max)
      if (d <= max && (best === null || d < best.distance || (d === best.distance && sp.dex < best.dex))) {
        best = { name: sp.nameEs.length > 0 ? sp.nameEs : sp.nameEn, dex: sp.dex, distance: d }
      }
    }
  }
  return best
}

/** Analiza el nombre de un archivo de escaneo (con o sin extensión). */
export function parseFilename(fileName: string, species: readonly SpeciesOut[] | null): FilenameParse {
  const notes: string[] = []
  const base = fileName.replace(/\.(jpe?g|png)$/i, '')
  const tokens = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0)

  const markers: Marker[] = []
  const variants: string[] = []
  const rest: string[] = []
  for (const t of tokens) {
    const m = WORD_MARKERS[t] ?? (t.length === 1 ? LETTER_MARKERS[t] : undefined)
    if (m !== undefined) {
      markers.push(m)
      continue
    }
    if (/^[0-9]{1,2}$/.test(t) || /^[abc]$/.test(t)) {
      variants.push(t)
      continue
    }
    rest.push(t)
  }

  let group: CardGroup | null = null
  let deck: string | null = null
  if (markers.length > 0) {
    let chosen: Marker | undefined
    for (const g of GROUP_PRIORITY) {
      chosen = markers.find((m) => m.group === g)
      if (chosen !== undefined) break
    }
    if (chosen !== undefined) {
      group = chosen.group
      deck = chosen.deck
      const distintos = [...new Set(markers.map((m) => m.group))]
      if (distintos.length > 1) notes.push(`varios grupos en el nombre (${distintos.join(', ')}): se usa ${group}`)
    }
  }
  const variant = variants.length > 0 ? (variants[variants.length - 1] ?? null) : null

  // Nombre: prefijo más largo (≤ 3 palabras) que coincide con PokeAPI.
  let name: string | null = null
  let dex: number | null = null
  let consumed = 0
  if (species !== null && rest.length > 0) {
    for (let k = Math.min(3, rest.length); k >= 1; k--) {
      const hit = snapSpecies(rest.slice(0, k).join(''), species, 2)
      if (hit !== null) {
        name = hit.name
        dex = hit.dex
        consumed = k
        break
      }
    }
    if (name === null) notes.push(`nombre no reconocido contra PokeAPI: "${rest.join(' ')}"`)
  } else if (rest.length > 0) {
    name = titleCase(rest[0] ?? '')
    consumed = 1
    notes.push('sin lista de especies: nombre crudo del archivo')
  }
  const leftover = rest.slice(consumed)

  let leaderOrTrainer: string | null = null
  if (leftover.length > 0) {
    if ((group === 'gym' || group === 'league') && name !== null) leaderOrTrainer = titleCase(leftover.join(' '))
    else notes.push(`tokens sin interpretar: "${leftover.join(' ')}"`)
  }

  return { group, deck, name, dex, variant, leaderOrTrainer, ok: name !== null && group !== null, notes }
}

/** Perfil de segmentación del grupo (mirrors scan-config.json › profiles.appliesTo). */
export const profileOf = (g: CardGroup): SegProfile => (g === 'gym' ? 'gym' : g === 'league' ? 'league' : 'terrain')
