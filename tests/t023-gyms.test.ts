// AC: SPEC-C/T-023 — Gimnasios: desafío opcional, 2v2, medallas, premios, victoria.
// Fixtures de líderes y cartas de gimnasio (AC-5: gyms.json aún no existe).
import { expect, test } from 'vitest'
import {
  GymsFileSchema,
  type Attack,
  type BoardGraph,
  type BoardNode,
  type GymLeader,
  type GymPrize,
  type PokemonCard,
} from '../packages/content/src/index.ts'
import { crossCheckGyms } from '../packages/content/src/node.ts'
import { parseCardId, parseNodeId, parsePkmUid } from '../packages/content/src/ids.ts'
import { content, rngOf, run, secondPkm } from './t020-helpers.ts'
import {
  legalCommands,
  newGame,
  type Ctx,
  type GameState,
  type PkmInstance,
  type PlayerState,
} from '../packages/engine/src/index.ts'

/** Carta de gimnasio sintética (patrón tangela_erika): stage 'gym', deck 'gimnasio'. */
const gymPkm = (id: string, slot: 1 | 2, leader: string, overrides: Partial<PokemonCard> = {}): PokemonCard => {
  const attack: Attack = {
    id: 'placaje',
    name: 'Placaje',
    kind: 'attack',
    rollFaces: [1, 2, 3, 4, 5, 6],
    cost: [],
    element: 'normal',
    damage: { base: 10 },
    effects: [],
    rawText: '',
  }
  return {
    id,
    dex: 90 + slot,
    name: id,
    stage: 'gym',
    deck: 'gimnasio',
    hp: 40,
    element: 'rock',
    gym: { leader, slot },
    attacks: [attack],
    specialties: [],
    evolvesTo: [],
    source: { verified: false },
    ...overrides,
  }
}

/** Equipo de Brock: slot 2 con rollFaces [1] ⇒ con 6 el líder no ataca (AC-2). */
const geodude = gymPkm('geodude', 1, 'brock')
const onix = gymPkm('onix', 2, 'brock', { attacks: [{ ...geodude.attacks[0]!, id: 'embestida', name: 'Embestida', rollFaces: [1] }] })
const gioPkm = (slot: 1 | 2): PokemonCard =>
  gymPkm(`gio-${String(slot)}`, slot, 'giovanni', { attacks: [{ ...geodude.attacks[0]!, rollFaces: [1] }] })

const brockLeader = (prize: GymPrize): GymLeader => ({
  id: 'brock', name: 'Brock', city: 'plateada', cityLabel: 'Ciudad Plateada', medal: 'Roca',
  prize, pokemonCount: 2,
})
const giovanniLeader: GymLeader = {
  id: 'giovanni', name: 'Giovanni', city: 'verde', cityLabel: 'Ciudad Verde', medal: 'Tierra',
  prize: { from: 'item', count: 1 }, pokemonCount: 2, requiresMedals: 7,
}

const gymBoard = (): BoardGraph => ({
  meta: { id: 't023-test', status: 'VERIFIED' },
  gyms: {
    brock: { city: 'plateada', medal: 'Roca', verified: true },
    giovanni: { city: 'verde', medal: 'Tierra', verified: true, requiresMedals: 7 },
  },
  nodes: [
    { id: 'gym_brock', type: 'gym', shape: 'square', x: 0, y: 0, gym: 'brock' },
    { id: 'gym_giovanni', type: 'gym', shape: 'square', x: 1, y: 0, gym: 'giovanni' },
  ] satisfies readonly BoardNode[],
  edges: [],
})

interface GymGameOptions {
  readonly at?: 'gym_brock' | 'gym_giovanni'
  readonly prize?: GymPrize
  readonly gyms?: readonly GymLeader[]
  readonly rngFaces?: readonly number[]
  readonly player?: (player: PlayerState) => PlayerState
}

/** Partida con el jugador en un gimnasio, fase tileResolution y fixtures de líderes. */
const atGym = (options: GymGameOptions = {}): { state: GameState; ctx: Ctx } => {
  const base = newGameSeeded()
  const basePlayer = base.players[0]!
  const player = options.player === undefined ? basePlayer : options.player(basePlayer)
  const gyms = options.gyms ?? [
    brockLeader(options.prize ?? { from: 'bosque', count: 1 }),
    giovanniLeader,
  ]
  const ctx: Ctx = {
    content: {
      ...content,
      board: gymBoard(),
      cards: [...content.cards, geodude, onix, gioPkm(1), gioPkm(2)],
      gyms,
    },
    rng: rngOf(...(options.rngFaces ?? [])),
  }
  const position = options.at ?? 'gym_brock'
  const state: GameState = {
    ...base,
    phase: 'tileResolution',
    stepsLeft: 0,
    decks: { ...base.decks, bosque: [parseCardId('element_grass')], item: [parseCardId('potion')] },
    players: [{ ...player, position: parseNodeId(position), cameFrom: null }],
  }
  return { state, ctx }
}
const newGameSeeded = (): GameState => {
  const started = newGame({ seed: 7, starterDeck: 'montana', ruleset: content.ruleset }, content)
  if (!started.ok) throw new Error(started.error.message)
  return started.value.state
}

const synthPkm = (uid: string): PkmInstance => ({
  uid: parsePkmUid(uid),
  cardId: parseCardId('squirtle'),
  damage: 0,
  xp: 0,
  equipped: [],
  multicolor: [],
  fainted: false,
})

/** Siembra daño en un rival de la batalla activa (le falta 10 para caer). */
const seedRival = (state: GameState, uid: string, damage: number): GameState => ({
  ...state,
  battle:
    state.battle === null
      ? null
      : { ...state.battle, rival: state.battle.rival.map((pkm) => (pkm.uid === uid ? { ...pkm, damage } : pkm)) },
})

// AC: SPEC-C/T-023/AC-1 — desafiar es opcional; Giovanni exige 7 medallas (GymLocked).
test('AC-1 Giovanni cerrojo con GymLocked y sin desafío; con 7 medallas se ofrece y declinar cierra el turno', () => {
  // (a) Sin medallas: GymLocked al resolver el casillero y el menú no lo ofrece.
  const locked = atGym({ at: 'gym_giovanni' })
  const refused = run(locked.state, { type: 'AcceptGymChallenge', pkmUid: 'p1-starter' }, locked.ctx)
  expect(refused.ok).toBe(false)
  const advanced = run(locked.state, { type: 'Advance' }, locked.ctx)
  expect(advanced.ok).toBe(true)
  if (!advanced.ok) throw new Error(advanced.error.message)
  expect(advanced.value.events).toContainEqual({ type: 'GymLocked', player: 'p1', gym: 'giovanni', requiresMedals: 7 })
  expect(advanced.value.state.phase).toBe('organize') // el turno cierra igual
  expect(legalCommands(locked.state, locked.ctx)).toEqual([{ type: 'Advance' }])

  // (b) Con 7 medallas: resolver el casillero deja pending=ChallengeGym (T-061,
  // opcional D-17); el menú lo ofrece y Advance lo declina cerrando el turno.
  const seven = ['brock', 'misty', 'surge', 'erika', 'koga', 'sabrina', 'blaine']
  const unlocked = atGym({ at: 'gym_giovanni', player: (p) => ({ ...p, medals: seven }) })
  const offered = run(unlocked.state, { type: 'Advance' }, unlocked.ctx)
  expect(offered.ok).toBe(true)
  if (!offered.ok) throw new Error(offered.error.message)
  expect(offered.value.state.pending).toEqual({ type: 'ChallengeGym', gym: 'giovanni' })
  expect(legalCommands(offered.value.state, unlocked.ctx)).toEqual([
    { type: 'Advance' },
    { type: 'AcceptGymChallenge', pkmUid: 'p1-starter' },
  ])
  const declined = run(offered.value.state, { type: 'Advance' }, unlocked.ctx)
  expect(declined.ok).toBe(true)
  if (!declined.ok) throw new Error(declined.error.message)
  expect(declined.value.events.some((event) => event.type === 'GymLocked')).toBe(false)
  expect(declined.value.state.battle).toBeNull()
  expect(declined.value.state.phase).toBe('organize')
})

// AC: SPEC-C/T-023/AC-2 — líder 2v2: repones al rival, +1 XP por PKM del líder, medalla y premio.
test('AC-2 derrota al líder 2v2: RivalSentOut + XP, Medalla + premio de mazo; queda en tileResolution', () => {
  const game = atGym({ rngFaces: [6, 6, 6] }) // efecto (20) · attackSelect del líder (6 = no ataca) · efecto (20)
  const offered = run(game.state, { type: 'Advance' }, game.ctx) // T-061: deja pending=ChallengeGym
  expect(offered.ok).toBe(true)
  if (!offered.ok) throw new Error(offered.error.message)
  const accepted = run(offered.value.state, { type: 'AcceptGymChallenge', pkmUid: 'p1-starter' }, game.ctx)
  expect(accepted.ok).toBe(true)
  if (!accepted.ok) throw new Error(accepted.error.message)
  expect(accepted.value.events).toContainEqual({ type: 'BattleStarted', player: 'p1', kind: 'gym', rival: 'brock', active: 'p1-starter' })
  const battle = accepted.value.state.battle
  expect(battle?.kind).toBe('gym')
  expect(battle?.turnSide).toBe(0) // el retador arranca (sin AGILIDAD, D-02)
  expect(battle?.rival.map((pkm) => `${String(pkm.uid)}:${String(pkm.cardId)}`)).toEqual(['rival-1:geodude', 'rival-2:onix'])

  // KO del 1.º: +1 XP a los participantes y el líder repone al 2.º (D-02); el
  // turno del reemplazo corre en el MISMO comando (turno-automatico-rival).
  const firstKo = run(seedRival(accepted.value.state, 'rival-1', 30), { type: 'Attack', attackId: 'rasgunos' }, game.ctx)
  expect(firstKo.ok).toBe(true)
  if (!firstKo.ok) throw new Error(firstKo.error.message)
  expect(firstKo.value.state.battle?.active[1]).toBe('rival-2')
  expect(firstKo.value.state.battle?.won).toBe(false)
  expect(firstKo.value.events).toContainEqual({ type: 'XpGained', pkmUid: 'p1-starter', amount: 1 })
  expect(firstKo.value.events).toContainEqual({ type: 'RivalSentOut', pkmUid: 'rival-2' })
  expect(firstKo.value.events).toContainEqual({ type: 'NoAttack', attacker: 'rival-2', reason: 'attackSelect' })
  expect(firstKo.value.state.battle?.turnSide).toBe(0)

  // El 2.º KO cierra: medalla + premio.
  const secondKo = run(seedRival(firstKo.value.state, 'rival-2', 30), { type: 'Attack', attackId: 'rasgunos' }, game.ctx)
  expect(secondKo.ok).toBe(true)
  if (!secondKo.ok) throw new Error(secondKo.error.message)
  expect(secondKo.value.events).toContainEqual({ type: 'BattleEnded', player: 'p1', result: 'won' })
  expect(secondKo.value.events).toContainEqual({ type: 'XpGained', pkmUid: 'p1-starter', amount: 1 })
  expect(secondKo.value.events).toContainEqual({ type: 'MedalWon', player: 'p1', gym: 'brock', medal: 'Roca' })
  expect(secondKo.value.events.some((event) => event.type === 'PokemonCaptured')).toBe(false)
  expect(secondKo.value.events).toContainEqual({ type: 'CardDrawn', player: 'p1', deck: 'bosque', card: 'element_grass' })
  const won = secondKo.value.state
  expect(won.battle).toBeNull()
  expect(won.pending).toBeNull()
  expect(won.players[0]!.medals).toEqual(['brock'])
  expect(won.players[0]!.elements).toContainEqual({ id: 'element_grass#1', element: 'grass' })
  expect(won.players[0]!.team[0]!.xp).toBe(2) // 1 XP por cada PKM del líder derrotado
  expect(won.phase).toBe('tileResolution') // ventana de evolución (D-06); cierra con Advance
})

// AC: SPEC-C/T-023/AC-2 — si el líder derrota 2 de los tuyos, gana aunque queden sanos.
test('AC-2 el líder gana al derrotar 2 PKM propios aunque quede banca sana (sin retorno a mazo)', () => {
  const strong = (id: string, slot: 1 | 2): PokemonCard =>
    gymPkm(id, slot, 'brock', { attacks: [{ ...geodude.attacks[0]!, damage: { base: 100 } }] })
  const game = atGym({
    rngFaces: [1, 1], // attackSelect del líder en cada turno (placaje 100 ⇒ KO)
    gyms: [brockLeader({ from: 'item', count: 1 }), giovanniLeader],
    player: (p) => ({ ...p, team: [...p.team, secondPkm(), synthPkm('p1-third')] }),
  })
  const ctx: Ctx = {
    ...game.ctx,
    content: {
      ...game.ctx.content,
      cards: [...game.ctx.content.cards.filter((card) => card.id !== 'geodude' && card.id !== 'onix'), strong('geodude', 1), strong('onix', 2)],
    },
  }
  const offered = run(game.state, { type: 'Advance' }, ctx) // T-061: deja pending=ChallengeGym
  if (!offered.ok) throw new Error(offered.error.message)
  const accepted = run(offered.value.state, { type: 'AcceptGymChallenge', pkmUid: 'p1-starter' }, ctx)
  if (!accepted.ok) throw new Error(accepted.error.message)
  const firstLoss = run(accepted.value.state, { type: 'Advance' }, ctx) // pasa y el líder mata al starter
  if (!firstLoss.ok) throw new Error(firstLoss.error.message)
  expect(firstLoss.value.state.pending).toEqual({ type: 'ChooseReplacement', options: ['p1-second', 'p1-third'] })
  const sentOut = run(firstLoss.value.state, { type: 'SendOut', pkmUid: 'p1-second' }, ctx)
  if (!sentOut.ok) throw new Error(sentOut.error.message)
  const secondLoss = run(sentOut.value.state, { type: 'Advance' }, ctx) // 2.º KO propio
  if (!secondLoss.ok) throw new Error(secondLoss.error.message)
  expect(secondLoss.value.events).toContainEqual({ type: 'BattleEnded', player: 'p1', result: 'lost' })
  expect(secondLoss.value.state.battle).toBeNull()
  expect(secondLoss.value.state.pending).toBeNull() // gana el líder aunque p1-third esté sano
  expect(secondLoss.value.state.players[0]!.team[2]!.fainted).toBe(false)
  expect(secondLoss.value.events.some((event) => event.type === 'CardToBottom')).toBe(false)
  expect(secondLoss.value.state.phase).toBe('organize') // el turno cierra tras la derrota
})

// AC: SPEC-C/T-023/AC-3 — premio PKM se conserva sin gastar Pokebola (p.50).
test('AC-3 premio PKM entra al equipo sano y sin gastar Pokebola', () => {
  const game = atGym({ rngFaces: [6, 6, 6], prize: { kind: 'pkm', card: 'onix' } })
  const offered = run(game.state, { type: 'Advance' }, game.ctx) // T-061: deja pending=ChallengeGym
  if (!offered.ok) throw new Error(offered.error.message)
  const accepted = run(offered.value.state, { type: 'AcceptGymChallenge', pkmUid: 'p1-starter' }, game.ctx)
  if (!accepted.ok) throw new Error(accepted.error.message)
  const firstKo = run(seedRival(accepted.value.state, 'rival-1', 30), { type: 'Attack', attackId: 'rasgunos' }, game.ctx)
  if (!firstKo.ok) throw new Error(firstKo.error.message)
  // El turno del reemplazo ya corrió dentro del primer KO; directo al 2.º KO.
  const secondKo = run(seedRival(firstKo.value.state, 'rival-2', 30), { type: 'Attack', attackId: 'rasgunos' }, game.ctx)
  if (!secondKo.ok) throw new Error(secondKo.error.message)
  expect(secondKo.value.events).toContainEqual({
    type: 'PrizePkmWon',
    player: 'p1',
    card: 'onix',
    pkmUid: 'p1-gift-1',
    destination: 'team',
  })
  const player = secondKo.value.state.players[0]!
  expect(player.items.pokeball).toBe(5) // sin gastar Pokebola (p.50)
  expect(player.team.at(-1)).toMatchObject({ uid: 'p1-gift-1', cardId: 'onix', damage: 0, xp: 0, fainted: false })
})

// AC: SPEC-C/T-023/AC-4 — 8 medallas (Medalla Tierra) ⇒ GameWon y fin de la partida.
test('AC-4 la Medalla Tierra completa las 8: GameWon, fase finished y menú vacío', () => {
  const seven = ['brock', 'misty', 'surge', 'erika', 'koga', 'sabrina', 'blaine']
  const game = atGym({ at: 'gym_giovanni', rngFaces: [6, 6, 6], player: (p) => ({ ...p, medals: seven }) })
  const offered = run(game.state, { type: 'Advance' }, game.ctx) // T-061: deja pending=ChallengeGym
  expect(offered.ok).toBe(true)
  if (!offered.ok) throw new Error(offered.error.message)
  expect(legalCommands(offered.value.state, game.ctx)).toContainEqual({ type: 'AcceptGymChallenge', pkmUid: 'p1-starter' })
  const accepted = run(offered.value.state, { type: 'AcceptGymChallenge', pkmUid: 'p1-starter' }, game.ctx)
  if (!accepted.ok) throw new Error(accepted.error.message)
  const firstKo = run(seedRival(accepted.value.state, 'rival-1', 30), { type: 'Attack', attackId: 'rasgunos' }, game.ctx)
  if (!firstKo.ok) throw new Error(firstKo.error.message)
  // El turno del reemplazo ya corrió dentro del primer KO; directo al 2.º KO.
  const secondKo = run(seedRival(firstKo.value.state, 'rival-2', 30), { type: 'Attack', attackId: 'rasgunos' }, game.ctx)
  if (!secondKo.ok) throw new Error(secondKo.error.message)
  expect(secondKo.value.events).toContainEqual({ type: 'MedalWon', player: 'p1', gym: 'giovanni', medal: 'Tierra' })
  expect(secondKo.value.events).toContainEqual({ type: 'GameWon', player: 'p1' })
  const won = secondKo.value.state
  expect(won.players[0]!.medals).toHaveLength(8)
  expect(won.players[0]!.items.potion).toBe(1) // premio ítem: 1 poción del mazo Ítem
  expect(won.phase).toBe('finished')
  expect(legalCommands(won, game.ctx)).toEqual([])
})

// AC: SPEC-C/T-023/AC-5 — datos de líderes: schema gyms.json + chequeos; sin datos, rechazo explícito.
test('AC-5 GymsFileSchema/crossCheckGyms validan líderes ↔ tablero ↔ cartas; sin gyms no hay desafío', () => {
  const board = gymBoard()
  const cards = [geodude, onix, gioPkm(1), gioPkm(2)]
  const gyms: readonly GymLeader[] = [brockLeader({ kind: 'pkm', card: 'onix' }), giovanniLeader]
  const toFile = (leaders: readonly GymLeader[]): object => ({
    leaders: Object.fromEntries(leaders.map(({ id, ...body }) => [id, body])),
  })

  // (a) El archivo de líderes valida (record por id) y los chequeos cruzados pasan.
  expect(GymsFileSchema.safeParse(toFile(gyms)).success).toBe(true)
  expect(crossCheckGyms(gyms, board, cards, [])).toEqual([])

  // (b) Errores: premio inválido, líder fuera del tablero, gimnasio sin líder, slots repetidos.
  expect(GymsFileSchema.safeParse(toFile([{ ...giovanniLeader, prize: { kind: 'deck' } as never }])).success).toBe(false)
  const lonely: readonly GymLeader[] = [{ ...giovanniLeader, id: 'misty' }]
  const lonelyErrors = crossCheckGyms(lonely, board, cards, [])
  expect(lonelyErrors.some((error) => error.includes('no tiene nodo de gimnasio'))).toBe(true)
  expect(lonelyErrors.some((error) => error.includes('"giovanni" del tablero sin líder'))).toBe(true)
  const badSlot = gymPkm('geodude2', 1, 'brock') // slot repetido con geodude
  expect(crossCheckGyms(gyms, board, [...cards, badSlot], []).some((error) => error.includes('slots de gimnasio repetidos'))).toBe(true)
  const unknownPrize = crossCheckGyms([brockLeader({ kind: 'pkm', card: 'desconocido' }), giovanniLeader], board, cards, [])
  expect(unknownPrize.some((error) => error.includes('premio PKM "desconocido"'))).toBe(true)

  // (c) Sin datos de líderes (gyms.json ausente): el desafío no se ofrece ni se acepta.
  // T-061: sin líder no hay pending=ChallengeGym; el comando se rechaza sin decisión.
  const bare = atGym({ gyms: [] })
  const resolved = run(bare.state, { type: 'Advance' }, bare.ctx)
  expect(resolved.ok).toBe(true)
  if (!resolved.ok) throw new Error(resolved.error.message)
  expect(resolved.value.state.pending).toBeNull()
  expect(legalCommands(bare.state, bare.ctx)).toEqual([{ type: 'Advance' }])
  const refused = run(bare.state, { type: 'AcceptGymChallenge', pkmUid: 'p1-starter' }, bare.ctx)
  expect(refused.ok).toBe(false)
  if (!refused.ok) expect(refused.error.code).toBe('ILLEGAL_COMMAND')
})
