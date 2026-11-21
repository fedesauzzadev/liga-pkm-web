/// <reference types="vite/client" />
// Contenido canónico de la app (SPEC-D/T-034): JSON de content/ parseados con
// Zod en la frontera (estándar §2: la UI carga sus JSON por su cuenta, el
// loader con node:fs queda afuera). Los demos lazy (equipo/combate) reusan
// este módulo en vez de armar su propio Content.
import {
  DECK_IDS,
  DeckListSchema,
  DecksFileSchema,
  EnergyFileSchema,
  BoardGraphSchema,
  GymsFileSchema,
  RulesetSchema,
  resolveHouseEdits,
  gymsToList,
  type DeckEntry,
  type DeckId,
  type DeckList,
  type DecksFile,
} from '@liga/content'
import { STARTER_BY_DECK, type Content, type PokemonCard } from '@liga/engine'
import { hashJson } from './save'
import { mergePokemonFiles } from './pokemonFiles.ts'
import boardJson from '../../../../content/board/kanto.json'
import decksDevJson from '../../../../content/decks.dev.json'
import decksJson from '../../../../content/decks.json'
import energyJson from '../../../../content/energy.json'
import gymsJson from '../../../../content/gyms.json'
import rulesetJson from '../../../../content/ruleset.classic.json'

// verificar-promueve-carta/AC-4 — el juego carga TODOS los canónicos
// content/pokemon/*.json (incl. `_` como _samples.json; excl. gyms.json; el
// glob de un nivel no baja a _staging/). Así una carta promovida desde
// /admin/cards queda usable sin reiniciar nada.
const pokemonModules = import.meta.glob('../../../../content/pokemon/*.json', {
  eager: true,
}) as Record<string, { default: unknown }>
const mergedPokemon = mergePokemonFiles(
  Object.entries(pokemonModules)
    .map(([path, mod]) => ({ file: `content/pokemon/${path.split('/').pop() ?? path}`, doc: mod.default }))
    .filter((entry) => entry.file !== 'content/pokemon/gyms.json'),
)
if (mergedPokemon.errors.length > 0) {
  console.error(
    `archivos de cartas con errores (se saltean):\n${mergedPokemon.errors.join('\n')}`,
  )
}
export const deckComposition: DecksFile = DecksFileSchema.parse(decksJson)

/** ¿Todas las listas `pokemon` de los mazos de terreno están completas? (T-042c) */
const complete = DECK_IDS.every(
  (deck) => deckComposition.terrain[deck].pokemon.length >= deckComposition.terrain[deck].expectedPokemonInPhoto,
)

/** Expande decks.json real al formato de pilas del motor (element_X × cantidad). */
function buildRealDeckList(file: DecksFile): DeckList {
  const decks: Record<string, { entries: DeckEntry[] }> = {}
  for (const deck of DECK_IDS) {
    const spec = file.terrain[deck]
    const entries: DeckEntry[] = Object.entries(spec.energy).map(([element, count]) => ({
      id: `element_${element}`,
      count,
    }))
    for (const id of spec.pokemon) entries.push({ id, count: 1 })
    decks[deck] = { entries }
  }
  decks.item = {
    entries: [
      { id: 'multicolor', count: file.item.multicolor },
      { id: 'potion', count: file.item.potion },
      { id: 'pokeball', count: file.item.pokeball },
      { id: 'oportunidad', count: file.item.oportunidad },
    ].filter((entry) => entry.count > 0),
  }
  // T-049: mazo Sorpresa (12 no-PKM + PKM de la lista que complete T-042c).
  decks.sorpresa = {
    entries: [
      { id: 'super_potion', count: file.sorpresa.super_potion },
      { id: 'ultraball', count: file.sorpresa.ultraball },
      { id: 'masterball', count: file.sorpresa.masterball },
      ...file.sorpresa.pokemon.map((id) => ({ id, count: 1 })),
    ].filter((entry) => entry.count > 0),
  }
  return DeckListSchema.parse({ decks })
}

// SPEC-E/T-044 AC-2: decks.json completo cuando las listas pokemon cierran;
// mientras tanto, mazos de desarrollo.
const decks: DeckList = complete ? buildRealDeckList(deckComposition) : DeckListSchema.parse(decksDevJson)

// T-048: ediciones de la casa aplicadas con la MISMA función pura del loader
// (validate.ts); solo archivos `enabled` con ruleset.features.houseEdits. La
// aplicación es en memoria: content/pokemon/** nunca se toca.
// T-048b: los errores NO se lanzan a nivel de módulo (tiraban la app entera:
// el ErrorBoundary no cubre imports); se reportan y las ediciones inválidas
// se ignoran — la app sigue andando y /admin/cards queda usable para recuperar.
const houseEditModules = import.meta.glob('../../../../content/house-edits/*.json', {
  eager: true,
}) as Record<string, { default: unknown }>

const ruleset = RulesetSchema.parse(rulesetJson)
const appliedEdits = resolveHouseEdits(
  mergedPokemon.cards,
  Object.entries(houseEditModules).map(([path, mod]) => ({
    file: `content/house-edits/${path.split('/').pop() ?? path}`,
    doc: mod.default,
  })),
  ruleset.features.houseEdits,
)
if (appliedEdits.errors.length > 0) {
  console.error(
    `ediciones de la casa con errores (se ignoran las inválidas):\n${appliedEdits.errors.join('\n')}`,
  )
}

/** T-048b — errores de la carga de ediciones (vacío si todo aplicó). */
export const houseEditsIssues: readonly string[] = appliedEdits.errors

export const gameContent: Content = {
  ruleset,
  board: BoardGraphSchema.parse(boardJson),
  cards: appliedEdits.cards,
  pendingEvos: [...mergedPokemon.pendingEvos],
  items: [],
  decks,
  deckComposition,
  energy: EnergyFileSchema.parse(energyJson),
  gyms: gymsToList(GymsFileSchema.parse(gymsJson)),
}

/** T-048/AC-6: hash canónico del contenido CON ediciones (viaja en el save). */
export const contentHash: string = hashJson(gameContent)

export const cardOf = (cardId: string): PokemonCard | undefined =>
  gameContent.cards.find((card) => card.id === cardId)

/** ficha-inicial-fija: carta inicial BASE del mazo elegido al empezar (la ficha
 * del tablero lo representa toda la partida, aunque evolucione o cambie de
 * posición en el equipo); null si el contenido todavía no trae esa carta. */
export const starterTokenCard = (starterDeck: DeckId): PokemonCard | null =>
  gameContent.cards.find((card) => card.id === STARTER_BY_DECK[starterDeck]) ?? null

/** Opción de setup (AC-1): mazo + su inicial; sin carta en el contenido queda
 * deshabilitada con aviso (mientras T-042 carga el resto de las cartas). */
export interface StarterOption {
  readonly deck: DeckId
  readonly card: PokemonCard | null
}

export const starterOptions: readonly StarterOption[] = DECK_IDS.map((deck) => ({
  deck,
  card: starterTokenCard(deck),
}))
