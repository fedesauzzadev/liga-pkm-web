// Helpers de T-021: cartas sintéticas por primitiva (EFFECTS §4) sobre la
// infraestructura de T-020 (partida real + RNG guionado).
import type { Attack, Effect, Element, Face, PokemonCard } from '../packages/content/src/index.ts'
import { parseCardId, parsePkmUid } from '../packages/content/src/ids.ts'
import { rngOf, toBattle } from './t020-helpers.ts'
import type { Ctx, GameState, PkmInstance, Rng } from '../packages/engine/src/index.ts'

/** Ataque sintético: cost [] (salvaje/jugador de prueba), rollFaces 1-6 salvo indicación. */
export const fx = (
  id: string,
  effects: readonly Effect[],
  options: {
    readonly base?: number
    readonly element?: Element
    readonly kind?: 'attack' | 'ability'
    readonly rollFaces?: readonly Face[]
    readonly ifRoll?: { readonly faces: readonly Face[]; readonly damage: number }
  } = {},
): Attack => ({
  id,
  name: id,
  kind: options.kind ?? 'attack',
  rollFaces: [...(options.rollFaces ?? [1, 2, 3, 4, 5, 6])],
  cost: [],
  element: options.element ?? 'normal',
  damage: { base: options.base ?? 10, ...(options.ifRoll !== undefined ? { ifRoll: { faces: [...options.ifRoll.faces], damage: options.ifRoll.damage } } : {}) },
  effects: [...effects],
  rawText: '',
})

/** Carta sintética de primitiva: un ataque por efecto (para jugador de prueba). */
export const fxCard = (
  id: string,
  attacks: readonly Attack[],
  specialties: readonly Effect[] = [],
): PokemonCard => ({
  id,
  dex: 90 + (id.length % 8),
  name: id,
  stage: 'basic',
  deck: 'montana',
  hp: 80,
  element: 'normal',
  attacks: [...attacks],
  specialties: [...specialties],
  evolvesTo: [],
  source: { verified: false },
})

/** PKM propio de prueba con carta sintética (sin equipamiento: costos vacíos). */
export const fxPkm = (cardId: string, damage = 0): PkmInstance => ({
  uid: parsePkmUid('p1-fx'),
  cardId: parseCardId(cardId),
  damage,
  xp: 0,
  equipped: [],
  wildcards: [],
  fainted: false,
})

export interface FxBattleOptions {
  readonly playerCard: PokemonCard
  readonly playerDamage?: number
  readonly wildCard?: string
  readonly extraWildCards?: readonly PokemonCard[]
  readonly rng?: Rng
}

/** Batalla del jugador con una carta sintética vs poliwag (o la que se pida). */
export const fxBattle = (options: FxBattleOptions): { state: GameState; ctx: Ctx } =>
  toBattle({
    rng: options.rng ?? rngOf(),
    active: 'p1-fx',
    player: (p) => ({ ...p, team: [fxPkm(options.playerCard.id, options.playerDamage ?? 0)] }),
    wildCard: options.wildCard ?? 'poliwag',
    extraCards: [options.playerCard, ...(options.extraWildCards ?? [])],
  })

/** Saca la regla de primer ataque (para usar el 2.º ataque ya en el turno 1). */
export const noFirstTurn = (state: GameState): GameState => ({
  ...state,
  battle: state.battle === null ? null : { ...state.battle, firstTurn: [] },
})
