// tools/gen-dev-decks.ts — genera mazos de desarrollo a partir del contenido disponible.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DECK_IDS = ['bosque', 'montana', 'isla', 'llanura', 'pantano'] as const
const DECK_ELEMENTS: Record<(typeof DECK_IDS)[number], string[]> = {
  bosque: ['grass'],
  montana: ['fire'],
  isla: ['water'],
  llanura: ['fighting'],
  pantano: ['psychic', 'water'],
}

const DECK_ELEMENT_COUNTS: Record<(typeof DECK_IDS)[number], number> = {
  bosque: 6,
  montana: 5,
  isla: 5,
  llanura: 6,
  pantano: 3,
}

export interface DevDeckEntry {
  id: string
  count: number
}

export interface DevDeckSpec {
  entries: DevDeckEntry[]
  devOnly: true
}

export interface DevDeckFile {
  _comment: string
  decks: Record<string, DevDeckSpec>
}

const COMMENT =
  'Mazos de desarrollo generados automáticamente desde content/pokemon/** + elementos sintéticos por mazo + ítems. Son solo para pruebas y no sustituyen un mazo real validado.'

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`No se pudo leer el JSON "${path}"`, { cause: error })
  }
}

function isDeckId(value: string): value is (typeof DECK_IDS)[number] {
  return DECK_IDS.some((deck) => deck === value)
}

function uniqueEntries(entries: Map<string, number>): DevDeckEntry[] {
  return [...entries.entries()]
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, count]) => ({ id, count }))
}

function upsert(map: Map<string, number>, key: string, count: number): void {
  map.set(key, (map.get(key) ?? 0) + count)
}

export function buildDevDeckList(root: string): DevDeckFile {
  const pokemonDir = join(root, 'content', 'pokemon')
  const actualCards = new Map<string, Map<string, number>>()

  if (existsSync(pokemonDir)) {
    for (const entry of readdirSync(pokemonDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      if (entry.name === 'gyms.json') continue
      const raw = readJson(join(pokemonDir, entry.name))
      if (typeof raw !== 'object' || raw === null) continue
      const cards = 'cards' in raw && Array.isArray(raw.cards) ? raw.cards : []
      for (const card of cards) {
        if (typeof card !== 'object' || card === null) continue
        if (!('deck' in card) || typeof card.deck !== 'string' || !isDeckId(card.deck)) continue
        const deck = card.deck
        const cardId = 'id' in card ? card.id : undefined
        if (typeof cardId !== 'string') continue
        const byDeck = actualCards.get(deck) ?? new Map<string, number>()
        upsert(byDeck, cardId, 1)
        actualCards.set(deck, byDeck)
      }
    }
  }

  const decks: Record<string, DevDeckSpec> = {}

  // PKM de Sorpresa cargados en content/pokemon (deck 'sorpresa', T-042c).
  const sorpresaCards = new Map<string, number>()
  if (existsSync(pokemonDir)) {
    for (const entry of readdirSync(pokemonDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      if (entry.name === 'gyms.json') continue
      const raw = readJson(join(pokemonDir, entry.name))
      if (typeof raw !== 'object' || raw === null) continue
      const cards = 'cards' in raw && Array.isArray(raw.cards) ? raw.cards : []
      for (const card of cards) {
        if (typeof card !== 'object' || card === null) continue
        if (!('deck' in card) || card.deck !== 'sorpresa') continue
        const cardId = 'id' in card && typeof card.id === 'string' ? card.id : null
        if (cardId === null) continue
        upsert(sorpresaCards, cardId, 1)
      }
    }
  }

  for (const deck of [...DECK_IDS]) {
    const entries = new Map<string, number>()
    const actual = actualCards.get(deck) ?? new Map<string, number>()
    for (const [cardId, count] of actual.entries()) {
      upsert(entries, cardId, count)
    }

    const syntheticElements = DECK_ELEMENTS[deck]
    const baseCount = DECK_ELEMENT_COUNTS[deck]
    for (const element of syntheticElements) {
      const elementId = `element_${element}`
      const current = entries.get(elementId) ?? 0
      entries.set(elementId, Math.max(current, baseCount))
    }

    if (entries.size === 0) {
      const fallback = DECK_ELEMENTS[deck][0]
      entries.set(`element_${fallback}`, baseCount)
    }

    decks[deck] = { entries: uniqueEntries(entries), devOnly: true }
  }

  // T-049: mazo Ítem con la composición confirmada (items.json/decks.json, D-14)
  // y mazo Sorpresa con sus 12 no-PKM + los PKM Sorpresa cargados (T-042c).
  decks.item = {
    entries: [
      { id: 'multicolor', count: 16 },
      { id: 'potion', count: 9 },
      { id: 'pokeball', count: 30 },
      { id: 'oportunidad', count: 5 },
    ],
    devOnly: true,
  }
  decks.sorpresa = {
    entries: [
      { id: 'super_potion', count: 8 },
      { id: 'ultraball', count: 3 },
      { id: 'masterball', count: 1 },
      ...[...sorpresaCards.entries()].map(([id, count]) => ({ id, count })),
    ],
    devOnly: true,
  }

  return { _comment: COMMENT, decks }
}

export function writeDevDeckList(root: string, outFile = join(root, 'content', 'decks.dev.json')): string {
  const dir = join(outFile, '..')
  mkdirSync(dir, { recursive: true })
  const list = buildDevDeckList(root)
  writeFileSync(outFile, `${JSON.stringify(list, null, 2)}\n`, 'utf8')
  return outFile
}

if (process.argv[1] !== undefined) {
  const thisFile = fileURLToPath(import.meta.url)
  const target = pathToFileURL(process.argv[1]).href
  if (target === pathToFileURL(thisFile).href) {
    const repoRoot = fileURLToPath(new URL('..', import.meta.url))
    const out = writeDevDeckList(repoRoot)
    console.log(`decks dev escritos en ${out}`)
  }
}
