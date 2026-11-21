// AC: SPEC-F/T-049 — Ítems, mazo Sorpresa, Oportunidad y Ultra/Master Ball.
// Reglas: RULES D-12 (bolas), D-19 (sin XP), D-20 (Super Poción), D-21 (Oportunidad),
// D-22 (chances). Estados a mano (patrón t012/t020) para pilas controladas.
import { expect, test } from 'vitest'
import type { BoardGraph, BoardNode, DeckKey, PokemonCard } from '../packages/content/src/index.ts'
import { parseCardId, parseNodeId, parsePkmUid } from '../packages/content/src/ids.ts'
import {
  applyCommand,
  legalCommands,
  newGame,
  type BattleState,
  type CommandOk,
  type Ctx,
  type EngineError,
  type GameState,
  type GymBattle,
  type ItemBag,
  type PlayerState,
  type Result,
  type Rng,
} from '../packages/engine/src/index.ts'
import { content, rngOf, secondPkm, wildBoard } from './t020-helpers.ts'

type Command = Parameters<typeof applyCommand>[1]

const run = (state: GameState, command: Command, ctx: Ctx): Result<CommandOk, EngineError> =>
  applyCommand(state, command, ctx)

/** Mensaje del error cuando el comando debía fallar (narrowing tipado del Result). */
const errorOf = (result: Result<CommandOk, EngineError>): string => {
  if (result.ok) throw new Error('esperaba un rechazo y el comando resultó legal')
  return result.error.message
}

const ok = (result: Result<CommandOk, EngineError>): CommandOk => {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

/** Bolsa completa (las 6 keys en 0) con overrides. */
const fullBag = (overrides: Partial<ItemBag> = {}): ItemBag => ({
  pokeball: 0,
  potion: 0,
  oportunidad: 0,
  super_potion: 0,
  ultraball: 0,
  masterball: 0,
  ...overrides,
})

const MEDALS4: readonly string[] = ['roca', 'cascada', 'trueno', 'arcoiris']

/** Carta sintética del mazo Sorpresa: ataca con cualquier cara; `chances` opcional (D-22). */
const surCard = (n: number, chances?: number): PokemonCard => ({
  id: `sur-${n}`,
  dex: 200 + n,
  name: `Sorpresa ${n}`,
  stage: 'surprise',
  deck: 'sorpresa',
  hp: 50,
  element: 'psychic',
  attacks: [
    {
      id: 'punetazo',
      name: 'Puñetazo',
      kind: 'attack',
      rollFaces: [1, 2, 3, 4, 5, 6],
      cost: [],
      element: 'normal',
      damage: { base: 60 },
      effects: [],
      rawText: '',
    },
  ],
  specialties: [],
  evolvesTo: [],
  source: { verified: false },
  ...(chances === undefined ? {} : { chances }),
})

const mercadoBoard = (): BoardGraph => ({
  meta: { id: 't049-test', status: 'VERIFIED' },
  gyms: {},
  nodes: [{ id: 'mer', type: 'mercado', shape: 'round', x: 0, y: 0 }] satisfies readonly BoardNode[],
  edges: [],
})

type DecksSpec = Partial<Record<DeckKey, readonly string[]>>

const withDecks = (base: GameState, spec: DecksSpec): GameState['decks'] => {
  const decks = { ...base.decks }
  for (const [key, stack] of Object.entries(spec)) {
    decks[key as DeckKey] = (stack ?? []).map((id) => parseCardId(id))
  }
  return decks
}

/** Partida real en fase `organize` (tras el setup) con pilas y jugador controlados. */
const organizeWith = (options: {
  readonly gameContent?: Ctx['content']
  readonly rng?: Rng
  readonly decks?: DecksSpec
  readonly player?: (player: PlayerState) => PlayerState
  readonly extraCards?: readonly PokemonCard[]
}): { state: GameState; ctx: Ctx } => {
  const gameContent = options.gameContent ?? content
  const started = newGame({ seed: 7, starterDeck: 'montana', ruleset: gameContent.ruleset }, gameContent)
  if (!started.ok) throw new Error(started.error.message)
  const base = started.value.state
  const player = options.player?.(base.players[0]!) ?? base.players[0]!
  const state: GameState = { ...base, decks: withDecks(base, options.decks ?? {}), players: [{ ...player }] }
  const ctx: Ctx = {
    content: { ...gameContent, cards: [...gameContent.cards, ...(options.extraCards ?? [])] },
    rng: options.rng ?? rngOf(),
  }
  return { state, ctx }
}

/** Partida con el jugador en `mer` (mercado), fase tileResolution y pilas controladas. */
const atMercado = (options: {
  readonly gameContent?: Ctx['content']
  readonly decks?: DecksSpec
  readonly player?: (player: PlayerState) => PlayerState
}): { state: GameState; ctx: Ctx } => {
  const { state, ctx } = organizeWith(options)
  const player = state.players[0]!
  return {
    state: { ...state, phase: 'tileResolution', players: [{ ...player, position: parseNodeId('mer'), cameFrom: null }] },
    ctx: { ...ctx, content: { ...ctx.content, board: mercadoBoard() } },
  }
}

/** Batalla wild contra `wildCard` (encuentro robado de un mazo de terreno, default pantano). */
const battleWith = (options: {
  readonly wildCard?: string
  readonly deck?: DeckKey
  readonly rng?: Rng
  readonly player?: (player: PlayerState) => PlayerState
  readonly extraCards?: readonly PokemonCard[]
  readonly decks?: DecksSpec
  /** Daño ya acumulado sobre el rival (para el umbral de la Ultra Ball). */
  readonly rivalDamage?: number
}): { state: GameState; ctx: Ctx } => {
  const wildCard = options.wildCard ?? 'poliwag'
  const deck = options.deck ?? 'pantano'
  const { state, ctx } = organizeWith(options)
  const player = state.players[0]!
  const spec: DecksSpec = { item: [], sorpresa: [], ...(options.decks ?? {}) }
  spec[deck] = [wildCard]
  const stateAtTile: GameState = {
    ...state,
    phase: 'tileResolution',
    decks: withDecks(state, spec),
    players: [{ ...player, position: parseNodeId('m1'), cameFrom: null }],
  }
  const battleCtx: Ctx = { ...ctx, content: { ...ctx.content, board: wildBoard() } }
  const drawn = ok(run(stateAtTile, { type: 'Advance' }, battleCtx))
  const fight = ok(run(drawn.state, { type: 'FightEncounter', pkmUid: 'p1-starter' }, battleCtx))
  const battleState =
    options.rivalDamage === undefined || fight.state.battle === null
      ? fight.state
      : {
          ...fight.state,
          battle: {
            ...fight.state.battle,
            rival: [{ ...fight.state.battle.rival[0]!, damage: options.rivalDamage }],
          } satisfies BattleState,
        }
  return { state: battleState, ctx: battleCtx }
}

// AC: SPEC-F/T-049/AC-1 — Se cargan items.json y los mazos: Ítem 60 y Sorpresa 40 (12 no-PKM + 28 PKM).
test('AC: SPEC-F/T-049/AC-1 newGame carga el mazo Ítem de 60 y el Sorpresa de 40', () => {
  const sorpresaPkm = Array.from({ length: 28 }, (_, i) => surCard(i + 1))
  // Se parte del DeckList dev real (los mazos de terreno no importan acá).
  if (content.decks === null) throw new Error('falta content/decks.dev.json')
  const decks = {
    decks: {
      ...content.decks.decks,
      item: {
        entries: [
          { id: 'multicolor', count: 16 },
          { id: 'potion', count: 9 },
          { id: 'pokeball', count: 30 },
          { id: 'oportunidad', count: 5 },
        ],
      },
      sorpresa: {
        entries: [
          { id: 'super_potion', count: 8 },
          { id: 'ultraball', count: 3 },
          { id: 'masterball', count: 1 },
          ...sorpresaPkm.map((card) => ({ id: card.id, count: 1 })),
        ],
      },
    },
  }
  const full: Ctx['content'] = { ...content, decks, cards: [...content.cards, ...sorpresaPkm] }
  const started = newGame({ seed: 11, starterDeck: 'montana', ruleset: full.ruleset }, full)
  if (!started.ok) throw new Error(started.error.message)
  expect(started.value.state.decks.item).toHaveLength(60)
  expect(started.value.state.decks.sorpresa).toHaveLength(40)

  // Mercado: multicolor suma al contador del jugador; oportunidad entra a la bolsa.
  const multi = atMercado({ gameContent: full, decks: { item: ['multicolor'] } })
  const drawnMulti = ok(run(multi.state, { type: 'Advance' }, multi.ctx))
  expect(drawnMulti.state.players[0]!.multicolor).toBe(content.ruleset.start.multicolor + 1)
  const oport = atMercado({ gameContent: full, decks: { item: ['oportunidad'] } })
  const drawnOport = ok(run(oport.state, { type: 'Advance' }, oport.ctx))
  expect(drawnOport.state.players[0]!.items.oportunidad).toBe(1)
})

// AC: SPEC-F/T-049/AC-2 — Poción cura 30; Super Poción cura todo; usadas al fondo de SU mazo.
test('AC: SPEC-F/T-049/AC-2 Super Poción cura todo y vuelve al fondo del mazo Sorpresa', () => {
  const superGame = battleWith({
    player: (p) => ({
      ...p,
      items: fullBag({ super_potion: 1 }),
      team: p.team.map((pkm) => (pkm.uid === 'p1-starter' ? { ...pkm, damage: 40 } : pkm)),
    }),
  })
  const healed = ok(
    run(superGame.state, { type: 'UsePotion', pkmUid: 'p1-starter', target: 'p1-starter', item: 'super_potion' }, superGame.ctx),
  )
  expect(healed.state.players[0]!.team[0]!.damage).toBe(0) // cura TODO el daño (D-20)
  expect(healed.state.players[0]!.items.super_potion).toBe(0)
  expect(healed.state.decks.sorpresa.at(-1)).toBe(parseCardId('super_potion')) // fondo de SU mazo
  expect(healed.events).toContainEqual({ type: 'Healed', pkmUid: 'p1-starter', amount: 40, cause: 'potion' })

  const potionGame = battleWith({
    player: (p) => ({
      ...p,
      items: fullBag({ potion: 1 }),
      team: p.team.map((pkm) => (pkm.uid === 'p1-starter' ? { ...pkm, damage: 50 } : pkm)),
    }),
  })
  const healed30 = ok(
    run(potionGame.state, { type: 'UsePotion', pkmUid: 'p1-starter', target: 'p1-starter' }, potionGame.ctx),
  )
  expect(healed30.state.players[0]!.team[0]!.damage).toBe(20) // cura hasta 30
  expect(healed30.state.decks.item.at(-1)).toBe(parseCardId('potion')) // fondo del mazo Ítem
})

// AC: SPEC-F/T-049/AC-3 — Oportunidad: Organize, minMedals, 4-5-6 roba Sorpresa (PKM ⇒ encuentro, ítem ⇒ inventario).
test('AC: SPEC-F/T-049/AC-3 Oportunidad exige medallas y roba Sorpresa solo con 4-5-6', () => {
  // Sin medallas suficientes no se puede usar (la UI lo explica) ni se ofrece.
  const locked = organizeWith({
    player: (p) => ({ ...p, medals: MEDALS4.slice(0, 3), items: fullBag({ oportunidad: 1 }) }),
  })
  const denied = run(locked.state, { type: 'UseOportunidad' }, locked.ctx)
  expect(denied.ok).toBe(false)
  expect(errorOf(denied)).toMatch(/medalla/)
  expect(legalCommands(locked.state, locked.ctx)).not.toContainEqual({ type: 'UseOportunidad' })

  // Con 4 medallas y dado 3: no roba; la carta se consume al fondo del mazo Ítem.
  const fail = organizeWith({
    rng: rngOf(3),
    decks: { item: [], sorpresa: ['super_potion'] },
    player: (p) => ({ ...p, medals: MEDALS4, items: fullBag({ oportunidad: 1 }) }),
  })
  expect(legalCommands(fail.state, fail.ctx)).toContainEqual({ type: 'UseOportunidad' })
  const missed = ok(run(fail.state, { type: 'UseOportunidad' }, fail.ctx))
  expect(missed.events).toContainEqual({ type: 'DieRolled', purpose: 'oportunidad', value: 3 })
  expect(missed.events.some((event) => event.type === 'CardDrawn')).toBe(false)
  expect(missed.state.players[0]!.items.oportunidad).toBe(0)
  expect(missed.state.decks.item.at(-1)).toBe(parseCardId('oportunidad'))
  expect(missed.state.decks.sorpresa).toHaveLength(1)

  // Con 5: roba. Ítem ⇒ inventario.
  const itemGame = organizeWith({
    rng: rngOf(5),
    decks: { item: [], sorpresa: ['ultraball'] },
    player: (p) => ({ ...p, medals: MEDALS4, items: fullBag({ oportunidad: 1 }) }),
  })
  const itemDraw = ok(run(itemGame.state, { type: 'UseOportunidad' }, itemGame.ctx))
  expect(itemDraw.events).toContainEqual({ type: 'CardDrawn', player: 'p1', deck: 'sorpresa', card: 'ultraball' })
  expect(itemDraw.state.players[0]!.items.ultraball).toBe(1)
  expect(itemDraw.state.decks.sorpresa).toHaveLength(0)

  // Con 5: roba. PKM ⇒ encuentro (desde el mazo Sorpresa).
  const pkmGame = organizeWith({
    rng: rngOf(5),
    decks: { item: [], sorpresa: ['sur-9'] },
    player: (p) => ({ ...p, medals: MEDALS4, items: fullBag({ oportunidad: 1 }) }),
    extraCards: [surCard(9)],
  })
  const pkmDraw = ok(run(pkmGame.state, { type: 'UseOportunidad' }, pkmGame.ctx))
  expect(pkmDraw.state.pending).toEqual({ type: 'FightOrRelease', card: 'sur-9', deck: 'sorpresa' })
  expect(pkmDraw.state.phase).toBe('tileResolution')
})

// AC: SPEC-F/T-049/AC-4 — PKM Sorpresa con chances:n escapa al derrotar n PKM tuyos y vuelve al fondo del mazo.
test('AC: SPEC-F/T-049/AC-4 chances: el PKM Sorpresa escapa al caer 2 propios (aunque quede banca)', () => {
  const escapeCard = surCard(1, 2)
  const game = organizeWith({
    rng: rngOf(5, 6, 6),
    decks: { item: [], sorpresa: ['sur-1'] },
    player: (p) => ({
      ...p,
      medals: MEDALS4,
      items: fullBag({ oportunidad: 1 }),
      team: [...p.team, secondPkm()],
    }),
    extraCards: [escapeCard],
  })
  const used = ok(run(game.state, { type: 'UseOportunidad' }, game.ctx)) // dado 5 ⇒ encuentro sur-1
  const fight = ok(run(used.state, { type: 'FightEncounter', pkmUid: 'p1-starter' }, game.ctx))
  expect(fight.state.battle?.kind).toBe('wild')

  // Turno propio: pasa ⇒ rival ataca (6): Charmander cae. 1 < chances 2 ⇒ reemplazo, no escapa.
  const firstFaint = ok(run(fight.state, { type: 'Advance' }, game.ctx))
  expect(firstFaint.state.pending?.type).toBe('ChooseReplacement')
  expect(firstFaint.state.battle).not.toBeNull()

  const sent = ok(run(firstFaint.state, { type: 'SendOut', pkmUid: 'p1-second' }, game.ctx))

  // Segundo propio caído (2 = chances): escapa aunque no haya más banca que elegir.
  const escaped = ok(run(sent.state, { type: 'Advance' }, game.ctx))
  const after = escaped.state
  expect(after.battle).toBeNull()
  expect(after.pending).toBeNull()
  expect(after.phase).toBe('organize')
  expect(after.decks.sorpresa).toEqual([parseCardId('sur-1')]) // al FONDO del mazo Sorpresa
  expect(escaped.events).toContainEqual({ type: 'BattleEnded', player: 'p1', result: 'lost' })
  expect(escaped.events).toContainEqual({ type: 'CardToBottom', player: 'p1', deck: 'sorpresa', card: 'sur-1' })
  expect(escaped.events.some((event) => event.type === 'XpGained')).toBe(false)
})

// AC: SPEC-F/T-049/AC-5 — Ultra/Master Ball: duranteBattle vs salvaje; ≤40; sin XP; al fondo de Sorpresa.
test('AC: SPEC-F/T-049/AC-5 Master Ball captura en el turno 1; Ultra con ≤40; nada en gimnasio', () => {
  // Master Ball en el turno 1 (sin tirar dados ni atacar).
  const master = battleWith({ player: (p) => ({ ...p, items: fullBag({ masterball: 1 }) }) })
  expect(master.state.battle?.turnSide).toBe(0)
  expect(master.state.dieLog).toHaveLength(0)
  const thrown = ok(run(master.state, { type: 'ThrowBall', ball: 'masterball' }, master.ctx))
  const after = thrown.state
  expect(after.battle).toBeNull()
  expect(after.phase).toBe('organize')
  expect(after.players[0]!.team.some((pkm) => pkm.cardId === parseCardId('poliwag'))).toBe(true)
  expect(after.players[0]!.items.masterball).toBe(0)
  expect(after.decks.sorpresa).toEqual([parseCardId('masterball')]) // consumida, al fondo de Sorpresa
  expect(thrown.events).toContainEqual({ type: 'BattleEnded', player: 'p1', result: 'won' })
  expect(thrown.events).toContainEqual({
    type: 'PokemonCaptured',
    player: 'p1',
    card: 'poliwag',
    pkmUid: 'p1-catch-1',
    destination: 'team',
  })
  expect(thrown.events.some((event) => event.type === 'XpGained')).toBe(false) // D-19: sin XP

  // Ultra Ball: poliwag hp 50 − daño 9 = 41 restantes ⇒ ilegal.
  const ultra41 = battleWith({
    player: (p) => ({ ...p, items: fullBag({ ultraball: 1 }) }),
    rivalDamage: 9,
  })
  const denied = run(ultra41.state, { type: 'ThrowBall', ball: 'ultraball' }, ultra41.ctx)
  expect(denied.ok).toBe(false)
  expect(errorOf(denied)).toMatch(/41/)
  expect(ultra41.state.players[0]!.items.ultraball).toBe(1) // no se consume
  expect(legalCommands(ultra41.state, ultra41.ctx)).not.toContainEqual({ type: 'ThrowBall', ball: 'ultraball' })

  // hp 50 − daño 10 = 40 restantes ⇒ legal y captura al instante.
  const ultra40 = battleWith({
    player: (p) => ({ ...p, items: fullBag({ ultraball: 1 }) }),
    rivalDamage: 10,
  })
  expect(legalCommands(ultra40.state, ultra40.ctx)).toContainEqual({ type: 'ThrowBall', ball: 'ultraball' })
  const captured = ok(run(ultra40.state, { type: 'ThrowBall', ball: 'ultraball' }, ultra40.ctx))
  expect(captured.state.battle).toBeNull()
  expect(captured.state.players[0]!.team.some((pkm) => pkm.cardId === parseCardId('poliwag'))).toBe(true)
  expect(captured.state.decks.sorpresa).toEqual([parseCardId('ultraball')])
  expect(captured.events.some((event) => event.type === 'XpGained')).toBe(false)

  // Ninguna bola sirve contra gimnasio/Liga (D-12).
  const gymGame = battleWith({ player: (p) => ({ ...p, items: fullBag({ masterball: 1, ultraball: 1 }) }) })
  const gymBattle: GymBattle = {
    kind: 'gym',
    gym: 'brock',
    medal: 'Roca',
    prize: { from: 'item', count: 1 },
    lostCount: 0,
    rival: [{ uid: parsePkmUid('rival-1'), cardId: parseCardId('poliwag'), damage: 0, fainted: false }],
    active: [parsePkmUid('p1-starter'), parsePkmUid('rival-1')],
    turnSide: 0,
    conditions: {},
    trainerId: null,
    firstTurn: [],
    participants: [parsePkmUid('p1-starter')],
    won: false,
    noAttackThisTurn: false,
    actedThisTurn: false,
  }
  const gymState: GameState = { ...gymGame.state, battle: gymBattle }
  const inGym = run(gymState, { type: 'ThrowBall', ball: 'masterball' }, gymGame.ctx)
  expect(inGym.ok).toBe(false)
  expect(errorOf(inGym)).toMatch(/gimnasio/)
  expect(legalCommands(gymState, gymGame.ctx)).not.toContainEqual({ type: 'ThrowBall', ball: 'masterball' })

  // Solo en tu turno: con el rival actuando no se puede tirar.
  const rivalTurn: GameState =
    master.state.battle === null
      ? master.state
      : { ...master.state, battle: { ...master.state.battle, turnSide: 1 } }
  const notYourTurn = run(rivalTurn, { type: 'ThrowBall', ball: 'masterball' }, master.ctx)
  expect(notYourTurn.ok).toBe(false)
  expect(errorOf(notYourTurn)).toMatch(/turno/)
})

// AC: SPEC-F/T-049/AC-6 — Tests puntuales: Master turno 1 · Ultra 41 vs 40 · Oportunidad [3]/[5].
test('AC: SPEC-F/T-049/AC-6 escenarios exactos del manual de revisión', () => {
  // Master Ball en el turno 1 (recién arrancada la batalla, el dado sin usar).
  const turn1 = battleWith({
    rng: rngOf(6, 6),
    player: (p) => ({ ...p, items: fullBag({ masterball: 1 }) }),
  })
  const thrown = ok(run(turn1.state, { type: 'ThrowBall', ball: 'masterball' }, turn1.ctx))
  expect(thrown.state.players[0]!.team.some((pkm) => pkm.cardId === parseCardId('poliwag'))).toBe(true)

  // Ultra Ball: 41 restantes no, 40 sí.
  const at41 = battleWith({ player: (p) => ({ ...p, items: fullBag({ ultraball: 1 }) }), rivalDamage: 9 })
  expect(run(at41.state, { type: 'ThrowBall', ball: 'ultraball' }, at41.ctx).ok).toBe(false)
  const at40 = battleWith({ player: (p) => ({ ...p, items: fullBag({ ultraball: 1 }) }), rivalDamage: 10 })
  expect(run(at40.state, { type: 'ThrowBall', ball: 'ultraball' }, at40.ctx).ok).toBe(true)

  // Oportunidad con [3] no roba; con [5] roba una carta Sorpresa.
  const roll3 = organizeWith({
    rng: rngOf(3),
    decks: { item: [], sorpresa: ['masterball'] },
    player: (p) => ({ ...p, medals: MEDALS4, items: fullBag({ oportunidad: 1 }) }),
  })
  const nothing = ok(run(roll3.state, { type: 'UseOportunidad' }, roll3.ctx))
  expect(nothing.events.some((event) => event.type === 'CardDrawn')).toBe(false)
  expect(nothing.state.players[0]!.items.masterball).toBe(0)
  const roll5 = organizeWith({
    rng: rngOf(5),
    decks: { item: [], sorpresa: ['masterball'] },
    player: (p) => ({ ...p, medals: MEDALS4, items: fullBag({ oportunidad: 1 }) }),
  })
  const drawn = ok(run(roll5.state, { type: 'UseOportunidad' }, roll5.ctx))
  expect(drawn.state.players[0]!.items.masterball).toBe(1)
})

// AC: SPEC-F/T-049/AC-7 — Invariante de conservación de cartas con los mazos Ítem y Sorpresa.
test('AC: SPEC-F/T-049/AC-7 conservación: ninguna carta de Ítem/Sorpresa se crea ni se pierde', () => {
  const SUR_IDS = new Set<string>(['sur-1'])
  const itemTotal = (state: GameState): number => {
    const p = state.players[0]!
    return state.decks.item.length + p.multicolor + p.items.pokeball + p.items.potion + p.items.oportunidad
  }
  const sorpresaTotal = (state: GameState): number => {
    const p = state.players[0]!
    const bag = p.items.super_potion + p.items.ultraball + p.items.masterball
    const pending = state.pending?.type === 'FightOrRelease' && state.pending.deck === 'sorpresa' ? 1 : 0
    const inBattle = state.battle?.kind === 'wild' && state.battle.deck === 'sorpresa' ? 1 : 0
    const captured = [...p.team, ...p.oakPile].filter((pkm) => SUR_IDS.has(pkm.cardId)).length
    return state.decks.sorpresa.length + bag + pending + inBattle + captured
  }
  const assertConserved = (state: GameState): void => {
    expect(itemTotal(state)).toBe(5) // 1 en pila + 4 Oportunidad de la bolsa
    expect(sorpresaTotal(state)).toBe(4) // super_potion, ultraball, masterball, sur-1
  }

  const game = atMercado({
    decks: { item: ['multicolor'], sorpresa: ['super_potion', 'ultraball', 'masterball', 'sur-1'] },
    // multicolor/pokebola en 0: el setup regala cartas que no salen de estos mazos.
    player: (p) => ({ ...p, medals: MEDALS4, multicolor: 0, items: fullBag({ oportunidad: 4 }) }),
  })
  const ctx: Ctx = {
    ...game.ctx,
    rng: rngOf(5, 5, 5, 5),
    content: { ...game.ctx.content, cards: [...game.ctx.content.cards, surCard(1)] },
  }
  assertConserved(game.state)

  const steps: readonly Command[] = [
    { type: 'Advance' }, // mercado roba multicolor
    { type: 'UseOportunidad' }, // 5 ⇒ super_potion a la bolsa
    { type: 'UseOportunidad' }, // 5 ⇒ ultraball a la bolsa
    { type: 'UseOportunidad' }, // 5 ⇒ masterball a la bolsa
    { type: 'UseOportunidad' }, // 5 ⇒ sur-1 ⇒ encuentro
    { type: 'FightEncounter', pkmUid: 'p1-starter' }, // la carta sale del mazo y entra a la batalla
    { type: 'ThrowBall', ball: 'masterball' }, // captura: bola al fondo, PKM al equipo
  ]
  let state = game.state
  for (const command of steps) {
    const result = run(state, command, ctx)
    if (!result.ok) throw new Error(`${command.type}: ${result.error.message}`)
    state = result.value.state
    assertConserved(state)
  }
  expect(state.players[0]!.team.some((pkm) => pkm.cardId === parseCardId('sur-1'))).toBe(true)
  expect(state.decks.sorpresa).toEqual([parseCardId('masterball')])
})

// AC: registrar-captura/AC-2 — ThrowBall también registra: las copias
// restantes de battle.card salen de los mazos de terreno y sorpresa.
test('AC: registrar-captura/AC-2 ThrowBall deja los mazos sin copias del capturado', () => {
  const master = battleWith({ player: (p) => ({ ...p, items: fullBag({ masterball: 1 }) }) })
  const withCopies: GameState = {
    ...master.state,
    decks: { ...master.state.decks, pantano: [parseCardId('poliwag')], sorpresa: [parseCardId('poliwag')] },
  }
  const thrown = ok(run(withCopies, { type: 'ThrowBall', ball: 'masterball' }, master.ctx))
  expect(thrown.state.decks.pantano).toEqual([]) // copia restante fuera
  expect(thrown.state.decks.sorpresa).toEqual([parseCardId('masterball')]) // solo la bola, al fondo
  expect(thrown.state.players[0]!.team.some((pkm) => pkm.cardId === parseCardId('poliwag'))).toBe(true)
})
