// Fixture demo de combate: props estáticas para los tests de la escena (T-032a) y
// roster+deps+script de eventos para la coreografía (T-032d). Las cartas se validan
// con Zod en la frontera del JSON (ENGINEERING-STANDARDS §2).
import { parseCardId, parsePlayerId, parsePkmUid, PokemonCardSchema, type PokemonCard } from '@liga/content'
import type { GameEvent, PkmInstance } from '@liga/engine'
import type { BattleChoreoDeps, ChoreoActorInput } from './choreo/stage'
import samples from '../../../../content/pokemon/_samples.json'
import type { BattleSceneProps } from './BattleScene'

const parseCard = (id: string): PokemonCard => {
  const raw = (samples as { cards: unknown[] }).cards.find(
    (card) => (card as { id?: unknown }).id === id,
  )
  return PokemonCardSchema.parse(raw)
}

export const demoCards: {
  readonly squirtle: PokemonCard
  readonly poliwag: PokemonCard
  readonly charmander: PokemonCard
} = {
  squirtle: parseCard('squirtle'),
  poliwag: parseCard('poliwag'),
  charmander: parseCard('charmander'),
}

export const demoPlayerUid = parsePkmUid('p-demo-squirtle')
const demoRivalUid = parsePkmUid('r-demo-poliwag')
const demoPlayerId = parsePlayerId('p-demo')

const demoPlayerPkm: PkmInstance = {
  uid: demoPlayerUid,
  cardId: parseCardId('squirtle'),
  damage: 10,
  xp: 0,
  equipped: [
    { id: parseCardId('element_water#1'), element: 'water' },
    { id: parseCardId('element_water#2'), element: 'water' },
  ],
  multicolor: [],
  fainted: false,
}

export const demoBattleSceneProps: BattleSceneProps = {
  player: {
    card: demoCards.squirtle,
    pkm: demoPlayerPkm,
    firstTurn: true,
  },
  rival: {
    card: demoCards.poliwag,
    damage: 20,
    conditions: { poison: 10 },
  },
  attackSelectValue: 4,
  message: '¡Un Poliwag salvaje apareció!',
  myTurn: true,
  onCommand: () => undefined,
}

// ── Coreografía (T-032d): roster + deps + script de eventos de muestra. ──

const roster: readonly ChoreoActorInput[] = [
  { uid: demoPlayerUid, cardId: parseCardId('squirtle'), damage: 0, pkm: { ...demoPlayerPkm, damage: 0 } },
  { uid: demoRivalUid, cardId: parseCardId('poliwag'), damage: 0 },
]

export const demoChoreoDeps: BattleChoreoDeps = {
  cardOf: (cardId) => (cardId === 'squirtle' || cardId === 'poliwag' || cardId === 'charmander'
    ? demoCards[cardId]
    : undefined),
  actorOf: (uid) => roster.find((input) => input.uid === uid),
  rivalEntry: () => roster[1],
}

export const demoBattleScript: readonly GameEvent[] = [
  { type: 'BattleStarted', player: demoPlayerId, kind: 'wild', rival: parseCardId('poliwag'), active: demoPlayerUid },
  { type: 'AttackUsed', attacker: demoPlayerUid, attackId: 'cabezazo', target: demoRivalUid },
  { type: 'DamageTaken', pkmUid: demoRivalUid, amount: 20, cause: 'attack' },
  { type: 'DieRolled', purpose: 'attackSelect', value: 3 },
  { type: 'AttackUsed', attacker: demoRivalUid, attackId: 'embestida', target: demoPlayerUid },
  { type: 'DamageTaken', pkmUid: demoPlayerUid, amount: 20, cause: 'attack' },
  { type: 'Healed', pkmUid: demoPlayerUid, amount: 20, cause: 'potion' },
  { type: 'AttackUsed', attacker: demoPlayerUid, attackId: 'cabezazo', target: demoRivalUid },
  { type: 'DamageTaken', pkmUid: demoRivalUid, amount: 30, cause: 'attack' },
  { type: 'PokemonFainted', pkmUid: demoRivalUid },
  { type: 'XpGained', pkmUid: demoPlayerUid, amount: 1 },
  { type: 'BattleEnded', player: demoPlayerId, result: 'won' },
]
