// AC: turno-automatico-rival — el turno del rival corre DENTRO del comando que
// cede el turno (Attack/Retire/arranque por AGILIDAD, dado attackSelect incluido)
// y el jugador nunca actúa dos veces seguidas sin que el rival haya tirado.
import { expect, test } from 'vitest'
import type { Attack, BoardGraph, Face, GymLeader, PokemonCard } from '../packages/content/src/index.ts'
import { parseCardId, parseNodeId, parsePkmUid } from '../packages/content/src/ids.ts'
import { agilCard, boomCard, content, rngOf, run, secondPkm, toBattle } from './t020-helpers.ts'
import {
  assertInvariants,
  InvariantError,
  legalCommands,
  newGame,
  type CommandOk,
  type Ctx,
  type EngineError,
  type GameEvent,
  type GameState,
  type PkmInstance,
  type Result,
} from '../packages/engine/src/index.ts'

const ok = (result: Result<CommandOk, EngineError>) => {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  return result
}

const at = (events: readonly GameEvent[], predicate: (event: GameEvent) => boolean): number =>
  events.findIndex(predicate)

// ── Fixture de gimnasio (patrón t023): líder sintético 2v2. ──

const gymAttack = (id: string, rollFaces: readonly Face[]): Attack => ({
  id,
  name: id,
  kind: 'attack',
  rollFaces: [...rollFaces],
  cost: [],
  element: 'normal',
  damage: { base: 10 },
  effects: [],
  rawText: '',
})

const gymCard = (id: string, slot: 1 | 2, overrides: Partial<PokemonCard> = {}): PokemonCard => ({
  id,
  dex: 90 + slot,
  name: id,
  stage: 'gym',
  deck: 'gimnasio',
  hp: 40,
  element: 'rock',
  gym: { leader: 'lider-test', slot },
  attacks: [gymAttack('placaje', [1, 2, 3, 4, 5, 6])],
  specialties: [],
  evolvesTo: [],
  source: { verified: false },
  ...overrides,
})

const agilGymPkm = gymCard('agil-gym', 1, { specialties: [{ op: 'startsFirst' }] })
const plainGymPkm = gymCard('plano-gym', 1)
const benchGymPkm = gymCard('banco-gym', 2, { attacks: [gymAttack('embestida', [1])] })

const gymLeader: GymLeader = {
  id: 'lider-test',
  name: 'Líder Test',
  city: 'plateada',
  cityLabel: 'Ciudad Plateada',
  medal: 'Test',
  prize: { from: 'item', count: 1 },
  pokemonCount: 2,
}

const gymBoard = (): BoardGraph => ({
  meta: { id: 'tar-test', status: 'VERIFIED' },
  gyms: { 'lider-test': { city: 'plateada', medal: 'Test', verified: true } },
  nodes: [{ id: 'g1', type: 'gym', shape: 'square', x: 0, y: 0, gym: 'lider-test' }],
  edges: [],
})

const synthPkm = (cardId: string, uid: string, damage = 0): PkmInstance => ({
  uid: parsePkmUid(uid),
  cardId: parseCardId(cardId),
  damage,
  xp: 0,
  // charmander: Rasguños cuesta [any] ⇒ 1 elemento equipado (patrón t020).
  equipped: cardId === 'charmander' ? [{ id: parseCardId('element_fire#1'), element: 'fire' }] : [],
  multicolor: [],
  fainted: false,
})

/** Jugador en el casillero de gimnasio con ChallengeGym pendiente (T-061). */
const atGymChallenge = (
  rngFaces: readonly number[],
  team: readonly PkmInstance[],
  firstHasAgility = false,
): { state: GameState; ctx: Ctx } => {
  const started = newGame({ seed: 7, starterDeck: 'montana', ruleset: content.ruleset }, content)
  if (!started.ok) throw new Error(started.error.message)
  const base = started.value.state
  const ctx: Ctx = {
    content: {
      ...content,
      board: gymBoard(),
      cards: [...content.cards, firstHasAgility ? agilGymPkm : plainGymPkm, benchGymPkm],
      gyms: [gymLeader],
    },
    rng: rngOf(...rngFaces),
  }
  const state: GameState = {
    ...base,
    phase: 'tileResolution',
    stepsLeft: 0,
    players: [{ ...base.players[0]!, team: [...team], position: parseNodeId('g1'), cameFrom: null }],
    pending: { type: 'ChallengeGym', gym: 'lider-test' },
  }
  return { state, ctx }
}

// AC: turno-automatico-rival/AC-1 — Attack devuelve, en el mismo comando, el
// ataque propio + turno completo del rival (dado attackSelect incluido) y deja
// turnSide === 0.
test('AC-1 Attack corre el turno del rival en el mismo comando y devuelve el turno al jugador', () => {
  const game = toBattle({ rng: rngOf(6, 4) }) // 6: rasguños ⇒ 20 · 4: attackSelect ⇒ Burbujas
  expect(game.state.battle?.turnSide).toBe(0)
  const attack = ok(run(game.state, { type: 'Attack', attackId: 'rasgunos' }, game.ctx))
  const events = attack.value.events
  const mine = at(events, (e) => e.type === 'AttackUsed' && e.attacker === 'p1-starter')
  const select = at(events, (e) => e.type === 'DieRolled' && e.purpose === 'attackSelect')
  const rival = at(events, (e) => e.type === 'AttackUsed' && e.attacker === 'rival-1')
  expect(mine).toBeGreaterThanOrEqual(0)
  expect(select).toBeGreaterThan(mine)
  expect(rival).toBeGreaterThan(select)
  expect(events).toContainEqual({ type: 'DieRolled', purpose: 'attackSelect', value: 4 })
  expect(events).toContainEqual({ type: 'AttackUsed', attacker: 'rival-1', attackId: 'burbujas', target: 'p1-starter' })
  expect(events).toContainEqual({ type: 'DamageTaken', pkmUid: 'p1-starter', amount: 10, cause: 'attack' })
  expect(attack.value.state.battle?.turnSide).toBe(0)
  expect(legalCommands(attack.value.state, game.ctx)).toContainEqual({ type: 'Attack', attackId: 'rasgunos' })
})

// AC: turno-automatico-rival/AC-2 — Retire dispara el turno del rival (dado
// incluido) en el mismo comando.
test('AC-2 Retire corre el turno del rival en el mismo comando', () => {
  const game = toBattle({
    rng: rngOf(4), // attackSelect 4 ⇒ Burbujas (10) sobre el reemplazo
    player: (p) => ({ ...p, team: [{ ...p.team[0]!, damage: 10 }, secondPkm()] }),
  })
  const retired = ok(run(game.state, { type: 'Retire', to: 'p1-second' }, game.ctx))
  expect(retired.value.events).toContainEqual({ type: 'PkmRetired', player: 'p1', from: 'p1-starter', to: 'p1-second' })
  expect(retired.value.events).toContainEqual({ type: 'DieRolled', purpose: 'attackSelect', value: 4 })
  expect(retired.value.events).toContainEqual({ type: 'AttackUsed', attacker: 'rival-1', attackId: 'burbujas', target: 'p1-second' })
  expect(retired.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'p1-second', amount: 10, cause: 'attack' })
  expect(retired.value.state.battle?.turnSide).toBe(0)
  // Sin Advance intermedio: el reemplazo puede atacar ya.
  expect(legalCommands(retired.value.state, game.ctx)).toContainEqual({ type: 'Attack', attackId: 'cabezazo' })
})

// AC: turno-automatico-rival/AC-3 — con AGILIDAD (D-02), FightEncounter y
// AcceptGymChallenge ejecutan el primer turno del rival (dado incluido) en el
// mismo comando que crea la batalla.
test('AC-3 AGILIDAD: FightEncounter y AcceptGymChallenge corren el primer turno del rival', () => {
  // (a) Salvaje con startsFirst: la única tirada del comando es su attackSelect.
  const wild = toBattle({ wildCard: 'agil', extraCards: [agilCard], rng: rngOf(1) }) // 1 ⇒ Chispa
  expect(wild.state.battle?.turnSide).toBe(0)
  expect(wild.state.dieLog).toEqual([{ type: 'DieRolled', purpose: 'attackSelect', value: 1 }])
  expect(wild.state.players[0]!.team[0]!.damage).toBe(10) // Chispa del rival, sin Advance

  // (b) Gimnasio con startsFirst en el 1.º del líder: mismo comando.
  const gym = atGymChallenge([1], [synthPkm('charmander', 'p1-starter'), secondPkm()], true)
  const accepted = ok(run(gym.state, { type: 'AcceptGymChallenge', pkmUid: 'p1-starter' }, gym.ctx))
  expect(accepted.value.events).toContainEqual({ type: 'BattleStarted', player: 'p1', kind: 'gym', rival: 'lider-test', active: 'p1-starter' })
  expect(accepted.value.events).toContainEqual({ type: 'DieRolled', purpose: 'attackSelect', value: 1 })
  expect(accepted.value.events).toContainEqual({ type: 'AttackUsed', attacker: 'rival-1', attackId: 'placaje', target: 'p1-starter' })
  expect(accepted.value.state.battle?.turnSide).toBe(0)
})

// AC: turno-automatico-rival/AC-4 — invariante: batalla abierta sin pending ⇒
// turnSide === 0; Attack con turnSide === 1 sigue siendo ILLEGAL_COMMAND.
test('AC-4 invariante batalla/turno-del-jugador-entre-comandos y Attack ilegal con turnSide 1', () => {
  const game = toBattle({ rng: rngOf() })
  expect(() => assertInvariants(game.state)).not.toThrow()
  const corrupted: GameState = {
    ...game.state,
    battle: { ...game.state.battle!, turnSide: 1 },
  }
  try {
    assertInvariants(corrupted)
    throw new Error('la invariante debía fallar')
  } catch (cause) {
    expect(cause).toBeInstanceOf(InvariantError)
    if (cause instanceof InvariantError) {
      expect(cause.invariant).toBe('batalla/turno-del-jugador-entre-comandos')
    }
  }
  const sneaked = run(corrupted, { type: 'Attack', attackId: 'rasgunos' }, game.ctx)
  expect(sneaked.ok).toBe(false)
  if (!sneaked.ok) expect(sneaked.error.code).toBe('ILLEGAL_COMMAND')
})

// AC: turno-automatico-rival/AC-5 — si el ataque deja pending o termina la
// batalla, el rival NO actúa en ese comando.
test('AC-5 con pending o fin de batalla el rival no actúa en ese comando', () => {
  // (a) KO del salvaje: BattleEnded + CaptureOrRelease, sin dado del rival.
  const won = toBattle({ rng: rngOf(6) }) // rasguños 6 ⇒ 20 sobre 40 sembrados ⇒ KO
  const seeded: GameState = {
    ...won.state,
    battle: { ...won.state.battle!, rival: won.state.battle!.rival.map((pkm) => ({ ...pkm, damage: 40 })) },
  }
  const attack = ok(run(seeded, { type: 'Attack', attackId: 'rasgunos' }, won.ctx))
  expect(attack.value.events).toContainEqual({ type: 'BattleEnded', player: 'p1', result: 'won' })
  expect(attack.value.state.pending).toEqual({ type: 'CaptureOrRelease', card: 'poliwag', deck: 'pantano', participants: ['p1-starter'] })
  expect(attack.value.events.some((event) => event.type === 'DieRolled' && event.purpose === 'attackSelect')).toBe(false)

  // (b) Explosión: ambos caen ⇒ won + ChooseReplacement; el rival no actúa (p.68).
  const boom = toBattle({
    rng: rngOf(),
    wildCard: 'poliwag',
    active: 'p1-boom',
    extraCards: [boomCard],
    player: (p) => ({ ...p, team: [synthPkm('boom', 'p1-boom', 40), secondPkm()] }),
  })
  const exploded = ok(run(boom.state, { type: 'Attack', attackId: 'explosion' }, boom.ctx))
  expect(exploded.value.state.battle?.won).toBe(true)
  expect(exploded.value.state.pending).toEqual({ type: 'ChooseReplacement', options: ['p1-second'] })
  expect(exploded.value.events.some((event) => event.type === 'DieRolled')).toBe(false)
})

// AC: turno-automatico-rival/AC-6 — gym 2v2: tu ataque KO al activo del líder,
// éste repone y el turno del reemplazo corre en el mismo comando.
test('AC-6 gym 2v2: el turno del reemplazo del líder corre en el mismo comando del KO', () => {
  const game = atGymChallenge([6, 6], [synthPkm('charmander', 'p1-starter'), secondPkm()])
  const accepted = ok(run(game.state, { type: 'AcceptGymChallenge', pkmUid: 'p1-starter' }, game.ctx))
  expect(accepted.value.state.battle?.turnSide).toBe(0) // sin AGILIDAD: retador primero
  const ko: GameState = {
    ...accepted.value.state,
    battle: { ...accepted.value.state.battle!, rival: accepted.value.state.battle!.rival.map((pkm) => ({ ...pkm, damage: 30 })) },
  }
  const attack = ok(run(ko, { type: 'Attack', attackId: 'rasgunos' }, game.ctx)) // 6 ⇒ 20 ⇒ KO rival-1
  expect(attack.value.events).toContainEqual({ type: 'RivalSentOut', pkmUid: 'rival-2' })
  // El reemplazo (rollFaces [1]) con attackSelect 6 ⇒ NoAttack, mismo comando.
  expect(attack.value.events).toContainEqual({ type: 'DieRolled', purpose: 'attackSelect', value: 6 })
  expect(attack.value.events).toContainEqual({ type: 'NoAttack', attacker: 'rival-2', reason: 'attackSelect' })
  expect(attack.value.state.battle?.active[1]).toBe('rival-2')
  expect(attack.value.state.battle?.turnSide).toBe(0)
})

// AC: turno-automatico-rival/AC-8 — Advance en tu turno (pasar) sigue corriendo
// el turno del rival y devolviendo el tuyo, todo en el mismo comando.
test('AC-8 Advance (pasar) corre el turno del rival y devuelve el turno, sin regresiones', () => {
  const game = toBattle({ rng: rngOf(4) }) // attackSelect 4 ⇒ Burbujas
  const pass = ok(run(game.state, { type: 'Advance' }, game.ctx))
  expect(pass.value.events).toContainEqual({ type: 'DieRolled', purpose: 'attackSelect', value: 4 })
  expect(pass.value.events).toContainEqual({ type: 'AttackUsed', attacker: 'rival-1', attackId: 'burbujas', target: 'p1-starter' })
  expect(pass.value.state.battle?.turnSide).toBe(0)
  expect(legalCommands(pass.value.state, game.ctx)).toContainEqual({ type: 'Attack', attackId: 'rasgunos' })
})
