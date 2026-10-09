// Helpers de T-020: partida real llevada hasta una batalla contra un salvaje,
// con tablero/mazos controlados y RNG guionado (patrón t011/t012: estado a mano).
import { join } from 'node:path'
import type { BoardGraph, BoardNode, Face, PokemonCard } from '../packages/content/src/index.ts'
import { parseCardId, parseNodeId, parsePkmUid } from '../packages/content/src/ids.ts'
import type { DeckKey } from '../packages/content/src/index.ts'
import { loadContent } from '../packages/content/src/node.ts'
import {
  applyCommand,
  newGame,
  type CommandOk,
  type Ctx,
  type EngineError,
  type GameState,
  type PkmInstance,
  type PlayerState,
  type Result,
  type Rng,
} from '../packages/engine/src/index.ts'

export const content = loadContent(join(process.cwd(), 'content'))

/** Tablero sintético: un solo casillero de mazo Pantano (no se mueve, solo pelea). */
export const wildBoard = (): BoardGraph => ({
  meta: { id: 't020-test', status: 'VERIFIED' },
  gyms: {},
  nodes: [
    { id: 'm1', type: 'deck', shape: 'round', x: 0, y: 0, deck: 'pantano' },
  ] satisfies readonly BoardNode[],
  edges: [],
})

/** RNG guionado: consume `faces` en orden y falla si se agota (tests deterministas). */
export const rngOf = (...faces: readonly number[]): Rng => {
  let i = 0
  return {
    d6: (): Face => {
      const value = faces[i]
      i += 1
      if (value === undefined || value < 1 || value > 6) {
        throw new Error(`rng guionado agotado o inválido en la tirada ${String(i)}`)
      }
      return value as Face
    },
    int: () => 0,
    snapshot: () => 0,
  }
}

/** Carta sintética de explosión (p.68): 50 al rival + 20 a sí mismo, sin modificadores. */
export const boomCard: PokemonCard = {
  id: 'boom',
  dex: 99,
  name: 'Boom',
  stage: 'basic',
  deck: 'montana',
  hp: 60,
  element: 'fire',
  attacks: [
    {
      id: 'explosion',
      name: 'Explosión',
      kind: 'attack',
      rollFaces: [1],
      cost: [],
      element: 'normal',
      damage: { base: 50 },
      effects: [{ op: 'selfDamage', amount: 20 }],
      rawText: 'Explosión (p.68)',
    },
  ],
  specialties: [],
  evolvesTo: [],
  source: { verified: false },
}

/** Carta sintética con AGILIDAD (startsFirst): el rival empieza atacando (D-02). */
export const agilCard: PokemonCard = {
  id: 'agil',
  dex: 98,
  name: 'Agil',
  stage: 'basic',
  deck: 'pantano',
  hp: 50,
  element: 'electric',
  attacks: [
    {
      id: 'chispa',
      name: 'Chispa',
      kind: 'attack',
      rollFaces: [1, 2, 3, 4, 5, 6],
      cost: [],
      element: 'electric',
      damage: { base: 10 },
      effects: [],
      rawText: '',
    },
  ],
  specialties: [{ op: 'startsFirst' }],
  evolvesTo: [],
  source: { verified: false },
}

/** Segundo PKM del equipo (sano, con 1 agua equipada para costos [any]). */
export const secondPkm = (): PkmInstance => ({
  uid: parsePkmUid('p1-second'),
  cardId: parseCardId('squirtle'),
  damage: 0,
  xp: 0,
  equipped: [{ id: parseCardId('element_water#9'), element: 'water' }],
  wildcards: [],
  fainted: false,
})

export interface ToBattleOptions {
  /** Carta del encuentro salvaje (default 'poliwag'); puede ser sintética. */
  readonly wildCard?: string
  readonly deck?: DeckKey
  readonly rng?: Rng
  /** uid del PKM propio que pelea (default 'p1-starter'). */
  readonly active?: string
  readonly player?: (player: PlayerState) => PlayerState
  readonly extraCards?: readonly PokemonCard[]
}

/** Partida real con encuentro resuelto: batalla activa del jugador vs `wildCard`. */
export const toBattle = (options: ToBattleOptions = {}): { state: GameState; ctx: Ctx } => {
  const wildCard = options.wildCard ?? 'poliwag'
  const deck = options.deck ?? 'pantano'
  const active = options.active ?? 'p1-starter'
  const started = newGame({ seed: 7, starterDeck: 'montana', ruleset: content.ruleset }, content)
  if (!started.ok) throw new Error(started.error.message)
  const base = started.value.state
  const basePlayer = base.players[0]!
  const player = options.player === undefined ? basePlayer : options.player(basePlayer)
  const state: GameState = {
    ...base,
    phase: 'tileResolution',
    stepsLeft: 0,
    decks: { ...base.decks, [deck]: [parseCardId(wildCard)], item: [] },
    players: [{ ...player, position: parseNodeId('m1'), cameFrom: null }],
  }
  const ctx: Ctx = {
    content: {
      ...content,
      board: wildBoard(),
      cards: [...content.cards, ...(options.extraCards ?? [])],
    },
    rng: options.rng ?? rngOf(),
  }
  const drawn = applyCommand(state, { type: 'Advance' }, ctx)
  if (!drawn.ok) throw new Error(drawn.error.message)
  const fight = applyCommand(drawn.value.state, { type: 'FightEncounter', pkmUid: active }, ctx)
  if (!fight.ok) throw new Error(fight.error.message)
  return { state: fight.value.state, ctx }
}

export const run = (state: GameState, command: Parameters<typeof applyCommand>[1], ctx: Ctx): Result<CommandOk, EngineError> =>
  applyCommand(state, command, ctx)

/** Tipos de evento en orden (para verificar la secuencia del turno, AC-1). */
export const kinds = (events: readonly { readonly type: string }[]): readonly string[] =>
  events.map((event) => event.type)
