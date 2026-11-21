// Setup de la partida (SPEC-B/T-010): crea el estado inicial jugable.
// No es un comando de la UI: es la fábrica que siembra el primer estado
// (SDD §5: Setup → Organize). El azar entra por el RNG con la semilla elegida.
import type { CardId, Content, DeckId, DeckKey } from '@liga/content'
import { DECK_KEYS, parseCardId, parseNodeId, parsePkmUid, parsePlayerId } from '@liga/content'
import type { DeckSpec } from '@liga/content'
import { createRng } from './rng.ts'
import type { Rng } from './rng.ts'
import { EngineError } from './errors.ts'
import type { Result } from './errors.ts'
import type { CommandOk } from './engine.ts'
import type { GameStarted } from './events.ts'
import { assertInvariants, invariantChecksEnabled } from './invariants.ts'
import { createInitialState } from './state.ts'
import type { DeckStacks, ElementCard, GameState, PkmInstance, PlayerState } from './state.ts'

/** Inicial por mazo (RULES §1 p.6-7); el elemento sale de la propia carta. */
export const STARTER_BY_DECK: Readonly<Record<DeckId, string>> = {
  bosque: 'bulbasaur',
  montana: 'charmander',
  isla: 'squirtle',
  llanura: 'machop',
  pantano: 'abra',
}

export interface NewGameOptions {
  readonly seed: number
  readonly starterDeck: DeckId
  readonly ruleset: Content['ruleset']
}

/** Expande las entradas {id,count} del mazo a la pila de cartas (orden del JSON). */
function expand(spec: DeckSpec | undefined): CardId[] {
  if (spec === undefined) return []
  const out: CardId[] = []
  for (const entry of spec.entries) {
    for (let i = 0; i < entry.count; i++) out.push(parseCardId(entry.id))
  }
  return out
}

/** Fisher-Yates con el RNG inyectado: única fuente de azar del motor (AC-3). */
function shuffle(cards: readonly CardId[], rng: Rng): CardId[] {
  const out = [...cards]
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const a = out[i]!
    out[i] = out[j]!
    out[j] = a
  }
  return out
}

function invalid(message: string): Result<CommandOk, EngineError> {
  return { ok: false, error: new EngineError('INVALID_SETUP', message) }
}

export function newGame(options: NewGameOptions, content: Content): Result<CommandOk, EngineError> {
  const { seed, starterDeck, ruleset } = options
  const starterId = STARTER_BY_DECK[starterDeck]
  const starterCard = content.cards.find((c) => c.id === starterId)
  if (starterCard === undefined) {
    return invalid(
      `la carta del inicial "${starterId}" (mazo ${starterDeck}) no existe en el contenido`,
    )
  }
  if (content.decks === null) {
    return invalid('faltan los mazos (content/decks.json)')
  }
  const startNode = content.board.nodes.find((n) => n.type === 'start')
  if (startNode === undefined) {
    return invalid('el tablero no tiene nodo de inicio (type "start")')
  }

  const rng = createRng(seed)
  const starterCardId = parseCardId(starterCard.id)
  const shuffled = {} as Record<DeckKey, CardId[]>
  for (const key of DECK_KEYS) shuffled[key] = shuffle(expand(content.decks.decks[key]), rng)
  // El inicial se saca de su mazo (AC-3): sale de la pila ya barajada.
  const starterStack = [...shuffled[starterDeck]]
  const at = starterStack.indexOf(starterCardId)
  if (at >= 0) starterStack.splice(at, 1)
  shuffled[starterDeck] = starterStack
  const decks: DeckStacks = shuffled
  // El stream del dado continúa donde quedó el barajado (rngState ⇒ save/replay).
  const rngState = rng.snapshot()

  const equipped: ElementCard[] = Array.from({ length: ruleset.start.starterEnergyCards }, (_, i) => ({
    id: parseCardId(`element_${starterCard.element}#${i + 1}`),
    element: starterCard.element,
  }))
  const starter: PkmInstance = {
    uid: parsePkmUid('p1-starter'),
    cardId: starterCardId,
    damage: 0,
    xp: 0,
    equipped,
    multicolor: [], // las cartas Multicolor arrancan sin asignar (T-013)
    fainted: false,
  }
  const player: PlayerState = {
    id: parsePlayerId('p1'),
    position: parseNodeId(startNode.id),
    cameFrom: null,
    team: [starter],
    oakPile: [],
    elements: [],
    multicolor: ruleset.start.multicolor,
    items: {
      pokeball: ruleset.start.pokeballs,
      potion: 0,
      oportunidad: 0,
      super_potion: 0,
      ultraball: 0,
      masterball: 0,
    },
    medals: [],
  }
  const state: GameState = {
    ...createInitialState(),
    turn: 1,
    phase: 'organize',
    rngState,
    ruleset,
    players: [player],
    activePlayerId: player.id,
    decks,
  }
  const events: readonly GameStarted[] = [
    {
      type: 'GameStarted',
      player: player.id,
      starterDeck,
      starter: starterCard.id,
      position: startNode.id,
    },
  ]

  if (invariantChecksEnabled()) assertInvariants(state)
  return { ok: true, value: { state, events } }
}
