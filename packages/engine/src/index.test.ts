// AC: SPEC-A/AC-5 — el motor usa los tipos canónicos de @liga/content; no define los propios.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, expectTypeOf, test } from 'vitest'
import type {
  Attack,
  BoardGraph,
  CommandOk,
  Content,
  Ctx,
  DeckList,
  Effect,
  Element,
  EngineError,
  GameState,
  Item,
  PkmInstance,
  PokemonCard,
  Result,
  Rng,
  Ruleset,
} from './index'
import { ENGINE_NAME, applyCommand, assertInvariants, createRng, legalCommands, newGame } from './index'
import type { BoardNode } from '@liga/content'
import { parseCardId, parseNodeId, parsePkmUid } from '@liga/content'
import { loadContent } from '@liga/content/node'

test('content exporta su identificador (wiring T-001)', () => {
  expect(ENGINE_NAME).toBe('liga-pkm-engine')
})

test('AC-5 engine reexporta los tipos de contenido (identidad con @liga/content)', () => {
  expectTypeOf<PokemonCard>().toEqualTypeOf<import('@liga/content').PokemonCard>()
  expectTypeOf<Attack>().toEqualTypeOf<import('@liga/content').Attack>()
  expectTypeOf<Effect>().toEqualTypeOf<import('@liga/content').Effect>()
  expectTypeOf<Ruleset>().toEqualTypeOf<import('@liga/content').Ruleset>()
  expectTypeOf<BoardGraph>().toEqualTypeOf<import('@liga/content').BoardGraph>()
  expectTypeOf<DeckList>().toEqualTypeOf<import('@liga/content').DeckList>()
  expectTypeOf<Item>().toEqualTypeOf<import('@liga/content').Item>()
  expectTypeOf<Element>().toEqualTypeOf<import('@liga/content').Element>()
  expectTypeOf<Content>().toEqualTypeOf<import('@liga/content').Content>()

  const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  expect(src).toMatch(/export type \{[^}]*PokemonCard[^}]*\} from '@liga\/content'/)
  expect(src).not.toMatch(/\binterface (PokemonCard|Attack|Effect|Ruleset|BoardGraph|DeckList|Item)\b/)

  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  expect(pkg.dependencies?.['@liga/content']).toBe('workspace:*')
})

// AC: unificar-popup-encuentro/AC-7 — regresión del motor: ReleaseWild con
// FightOrRelease pendiente termina el turno (turn += 1, phase organize), deja
// la carta al FONDO de su mazo (D-09) y limpia pending. El motor ya lo cumple
// (tiles.ts › releaseWild); este test lo cubre para que no regrese.
test('AC: unificar-popup-encuentro/AC-7 - ReleaseWild: turno +1, organize, carta al fondo, pending null', () => {
  const content = loadContent(fileURLToPath(new URL('../../../content', import.meta.url)))
  const started = newGame({ seed: 1, starterDeck: 'montana', ruleset: content.ruleset }, content)
  if (!started.ok) throw new Error(started.error.message)
  const ctx = { content, rng: createRng(0) }
  const encounter = applyCommand(
    started.value.state,
    { type: 'DebugEncounter', deck: 'pantano', card: parseCardId('abra') },
    ctx,
  )
  if (!encounter.ok) throw new Error(encounter.error.message)
  const before = encounter.value.state
  expect(before.pending?.type).toBe('FightOrRelease')

  const released = applyCommand(before, { type: 'ReleaseWild' }, ctx)
  if (!released.ok) throw new Error(released.error.message)
  const after = released.value.state
  expect(after.turn).toBe(before.turn + 1)
  expect(after.phase).toBe('organize')
  expect(after.pending).toBeNull()
  const pantano = after.decks.pantano
  expect(pantano[pantano.length - 1]).toBe(parseCardId('abra'))
})

// ── no-cambiar-a-muerto: ningún comando de intercambio (Retire/SendOut/SwapWithOak)
// mete un PKM debilitado a reemplazar a uno vivo. Estados a mano (patrón tests/t012/t020). ──

let contentCache: Content | null = null
const contentOf = (): Content => {
  contentCache ??= loadContent(fileURLToPath(new URL('../../../content', import.meta.url)))
  return contentCache
}

/** RNG guionado (patrón tests/t020-helpers): consume `faces` en orden y falla si se agota. */
const scriptedRng = (...faces: readonly number[]): Rng => {
  let i = 0
  return {
    d6: () => {
      const value = faces[i]
      i += 1
      if (value === undefined || value < 1 || value > 6) {
        throw new Error(`rng guionado agotado o inválido en la tirada ${String(i)}`)
      }
      return value as ReturnType<Rng['d6']>
    },
    int: () => 0,
    snapshot: () => 0,
  }
}

/** Tablero sintético de un solo casillero (patrón tests/t012): no se mueve, solo se resuelve. */
const singleTileBoard = (node: BoardNode): BoardGraph => ({
  meta: { id: 'no-cambiar-a-muerto', status: 'VERIFIED' },
  gyms: {},
  nodes: [node],
  edges: [],
})

const pkm = (uid: string, cardId: string, overrides: Partial<PkmInstance> = {}): PkmInstance => ({
  uid: parsePkmUid(uid),
  cardId: parseCardId(cardId),
  damage: 0,
  xp: 0,
  equipped: [],
  multicolor: [],
  fainted: false,
  ...overrides,
})

function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Partida real llevada a batalla wild contra poliwag (sin AGILIDAD: no consume rng). */
const toWildBattle = (
  faces: readonly number[],
  team: readonly PkmInstance[],
): { state: GameState; ctx: Ctx } => {
  const content = contentOf()
  const started = newGame({ seed: 7, starterDeck: 'montana', ruleset: content.ruleset }, content)
  if (!started.ok) throw new Error(started.error.message)
  const base = started.value.state
  const ctx: Ctx = {
    content: {
      ...content,
      board: singleTileBoard({ id: 'm1', type: 'deck', shape: 'round', x: 0, y: 0, deck: 'pantano' }),
    },
    rng: scriptedRng(...faces),
  }
  const state: GameState = {
    ...base,
    phase: 'tileResolution',
    stepsLeft: 0,
    decks: { ...base.decks, pantano: [parseCardId('poliwag')], item: [] },
    players: [{ ...base.players[0]!, team, position: parseNodeId('m1'), cameFrom: null }],
  }
  const drawn = applyCommand(state, { type: 'Advance' }, ctx)
  if (!drawn.ok) throw new Error(drawn.error.message)
  const fight = applyCommand(drawn.value.state, { type: 'FightEncounter', pkmUid: 'p1-starter' }, ctx)
  if (!fight.ok) throw new Error(fight.error.message)
  return { state: fight.value.state, ctx }
}

const expectIllegal = (result: Result<CommandOk, EngineError>): void => {
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error.code).toBe('ILLEGAL_COMMAND')
}

// AC: no-cambiar-a-muerto/AC-1 — Retire con "to" debilitado es rechazado con
// ILLEGAL_COMMAND y el estado queda sin cambios (regresión de battle-commands.ts).
test('AC-1 Retire hacia un PKM debilitado: ILLEGAL_COMMAND y estado sin cambios', () => {
  const game = toWildBattle([], [
    pkm('p1-starter', 'charmander'),
    pkm('p1-second', 'squirtle', { fainted: true, damage: 30 }),
  ])
  expect(game.state.battle?.turnSide).toBe(0)
  const before = snapshot(game.state)
  expectIllegal(applyCommand(game.state, { type: 'Retire', to: 'p1-second' }, game.ctx))
  expect(game.state).toEqual(before) // sin cambios: ni evento ni mutación
})

// AC: no-cambiar-a-muerto/AC-2 — SendOut con pkmUid debilitado, dentro o fuera
// de pending.options, es rechazado y el estado queda sin cambios.
test('AC-2 SendOut de un debilitado (dentro y fuera de options): ILLEGAL_COMMAND sin cambios', () => {
  const game = toWildBattle(
    [3], // attackSelect 3 ⇒ Embestida (20) KO del starter con 40 de daño
    [
      pkm('p1-starter', 'charmander', { damage: 40 }),
      pkm('p1-second', 'squirtle'),
      pkm('p1-third', 'squirtle', { fainted: true, damage: 30 }),
    ],
  )
  const ko = applyCommand(game.state, { type: 'Advance' }, game.ctx)
  if (!ko.ok) throw new Error(ko.error.message)
  const fainted = ko.value.state
  expect(fainted.pending).toEqual({ type: 'ChooseReplacement', options: ['p1-second'] })

  // Fuera de options: el debilitado ni siquiera está ofertado.
  const outsideBefore = snapshot(fainted)
  expectIllegal(applyCommand(fainted, { type: 'SendOut', pkmUid: 'p1-third' }, game.ctx))
  expect(fainted).toEqual(outsideBefore)

  // Dentro de options (estado corrupto a mano): el validador de sane igual lo rechaza.
  const corrupted: GameState = {
    ...fainted,
    pending: { type: 'ChooseReplacement', options: ['p1-second', 'p1-third'] },
  }
  const insideBefore = snapshot(corrupted)
  expectIllegal(applyCommand(corrupted, { type: 'SendOut', pkmUid: 'p1-third' }, game.ctx))
  expect(corrupted).toEqual(insideBefore)
})

// AC: no-cambiar-a-muerto/AC-3 — SwapWithOak rechaza un PKM de la pila
// debilitado o dañado (defensa en profundidad sobre casillero/pila-de-oak-sana).
test('AC-3 SwapWithOak con PKM de la pila debilitado o dañado: ILLEGAL_COMMAND, equipo y pila intactos', () => {
  const content = contentOf()
  const started = newGame({ seed: 7, starterDeck: 'montana', ruleset: content.ruleset }, content)
  if (!started.ok) throw new Error(started.error.message)
  const base = started.value.state
  const ctx: Ctx = {
    content: { ...content, board: singleTileBoard({ id: 'oak1', type: 'oak', shape: 'square', x: 0, y: 0 }) },
    rng: scriptedRng(),
  }
  const state: GameState = {
    ...base,
    phase: 'tileResolution',
    stepsLeft: 0,
    players: [
      {
        ...base.players[0]!,
        position: parseNodeId('oak1'),
        cameFrom: null,
        team: [pkm('p1-starter', 'charmander', { damage: 30 })],
        oakPile: [pkm('p1-oak-1', 'poliwag')],
      },
    ],
  }
  const atOak = applyCommand(state, { type: 'Advance' }, ctx)
  if (!atOak.ok) throw new Error(atOak.error.message)
  expect(atOak.value.state.pending).toEqual({ type: 'OakSwap' })

  const withPile = (overrides: Partial<PkmInstance>): GameState => ({
    ...atOak.value.state,
    players: [
      { ...atOak.value.state.players[0]!, oakPile: [pkm('p1-oak-1', 'poliwag', overrides)] },
    ],
  })

  const faintedPile = withPile({ fainted: true, damage: 30 })
  expectIllegal(
    applyCommand(faintedPile, { type: 'SwapWithOak', teamUid: 'p1-starter', pileUid: 'p1-oak-1' }, ctx),
  )
  expect(faintedPile).toEqual(snapshot(faintedPile)) // equipo y pila quedan idénticos
  expect(faintedPile.players[0]!.team.map((p) => p.uid)).toEqual(['p1-starter'])
  expect(faintedPile.players[0]!.oakPile[0]!.fainted).toBe(true)

  const damagedPile = withPile({ damage: 10 })
  expectIllegal(
    applyCommand(damagedPile, { type: 'SwapWithOak', teamUid: 'p1-starter', pileUid: 'p1-oak-1' }, ctx),
  )
  expect(damagedPile).toEqual(snapshot(damagedPile))

  // Regresión del camino feliz: pila sana ⇒ el intercambio sigue funcionando.
  const swapped = applyCommand(
    atOak.value.state,
    { type: 'SwapWithOak', teamUid: 'p1-starter', pileUid: 'p1-oak-1' },
    ctx,
  )
  if (!swapped.ok) throw new Error(swapped.error.message)
  expect(swapped.value.events).toContainEqual({
    type: 'OakSwapped',
    player: 'p1',
    teamUid: 'p1-starter',
    pileUid: 'p1-oak-1',
  })
})

// AC: no-cambiar-a-muerto/AC-4 — un comando rechazado no registra eventos y los
// estados usados por las regresiones mantienen las invariantes existentes.
test('AC-4 rechazos sin eventos, invariantes verdes y legalCommands nunca ofrece al debilitado', () => {
  const game = toWildBattle([], [
    pkm('p1-starter', 'charmander'),
    pkm('p1-second', 'squirtle'),
    pkm('p1-third', 'squirtle', { fainted: true, damage: 30 }),
  ])
  expect(() => assertInvariants(game.state)).not.toThrow()
  const rejected = applyCommand(game.state, { type: 'Retire', to: 'p1-third' }, game.ctx)
  expectIllegal(rejected)
  expect(rejected).not.toHaveProperty('value') // sin value/events: no se registra nada
  expect(() => assertInvariants(game.state)).not.toThrow() // el estado sigue sano
  const offered = legalCommands(game.state, game.ctx).filter((c) => c.type === 'Retire')
  expect(offered).toEqual([{ type: 'Retire', to: 'p1-second' }]) // solo el sano
})

// AC: no-cambiar-a-muerto/AC-5 — cada AC del plan tiene su test con su comentario.
test('AC-5 cada AC de no-cambiar-a-muerto tiene su test tageado', () => {
  const src = readFileSync(new URL('./index.test.ts', import.meta.url), 'utf8')
  for (const ac of ['AC-1', 'AC-2', 'AC-3', 'AC-4']) {
    expect(src).toContain(`// AC: no-cambiar-a-muerto/${ac}`)
  }
})

// ── reemplazo-tras-desmayo: reemplazo obligatorio tras el desmayo del activo ──

// AC: reemplazo-tras-desmayo/AC-4 — sin banca sana el motor emite
// BattleEnded{lost} y NUNCA arma pending ChooseReplacement (la UI no fuerza
// pestaña ni ofrece reemplazo).
test('AC-4 sin banca sana: BattleEnded{lost} y sin ChooseReplacement', () => {
  const game = toWildBattle(
    [3], // attackSelect 3 ⇒ Embestida (20) KO del starter con 40 de daño
    [pkm('p1-starter', 'charmander', { damage: 40 })],
  )
  const ko = applyCommand(game.state, { type: 'Advance' }, game.ctx)
  if (!ko.ok) throw new Error(ko.error.message)
  expect(ko.value.events).toContainEqual({ type: 'BattleEnded', player: 'p1', result: 'lost' })
  expect(ko.value.state.pending).toBeNull()
  expect(ko.value.state.battle).toBeNull()
  expect(ko.value.state.phase).toBe('organize')
  expect(legalCommands(ko.value.state, game.ctx).filter((c) => c.type === 'SendOut')).toEqual([])
})

// AC: reemplazo-tras-desmayo/AC-5 — tras aceptar el SendOut se limpia pending,
// el nuevo activo entra en battle.active[0] y el combate sigue con MI turno
// (turnSide 0, actedThisTurn false).
test('AC-5 SendOut tras el desmayo: pending limpio, activo nuevo y turno propio', () => {
  const game = toWildBattle(
    [3], // KO del starter; el reemplazo no consume dados
    [
      pkm('p1-starter', 'charmander', { damage: 40 }),
      pkm('p1-second', 'squirtle'),
    ],
  )
  const ko = applyCommand(game.state, { type: 'Advance' }, game.ctx)
  if (!ko.ok) throw new Error(ko.error.message)
  const fainted = ko.value.state
  expect(fainted.pending).toEqual({ type: 'ChooseReplacement', options: ['p1-second'] })

  const sent = applyCommand(fainted, { type: 'SendOut', pkmUid: 'p1-second' }, game.ctx)
  if (!sent.ok) throw new Error(sent.error.message)
  const after = sent.value.state
  expect(sent.value.events).toContainEqual({ type: 'PkmSentOut', player: 'p1', pkmUid: 'p1-second' })
  expect(after.pending).toBeNull()
  expect(after.battle?.active[0]).toBe('p1-second')
  expect(after.battle?.turnSide).toBe(0)
  expect(after.battle?.actedThisTurn).toBe(false)
  expect(legalCommands(after, game.ctx)).toContainEqual({ type: 'Advance' })
})

// AC: reemplazo-tras-desmayo/AC-6 — el cambio voluntario no se tocó: Retire
// hacia un muerto sigue rechazado ("el reemplazo debe estar sano (D-07)") y
// fuera del reemplazo pendiente no se ofrecen comandos SendOut.
test('AC-6 Retire hacia un muerto: rechazado con D-07 y sin SendOut fuera del pending', () => {
  const game = toWildBattle([], [
    pkm('p1-starter', 'charmander'),
    pkm('p1-second', 'squirtle', { fainted: true, damage: 30 }),
  ])
  const before = snapshot(game.state)
  const rejected = applyCommand(game.state, { type: 'Retire', to: 'p1-second' }, game.ctx)
  expectIllegal(rejected)
  if (!rejected.ok) expect(rejected.error.message).toContain('el reemplazo debe estar sano (D-07)')
  expect(game.state).toEqual(before)
  expect(legalCommands(game.state, game.ctx).filter((c) => c.type === 'SendOut')).toEqual([])
  // El resto del menú de combate sigue disponible (atacar/pasar/poción).
  expect(legalCommands(game.state, game.ctx)).toContainEqual({ type: 'Advance' })
})

// ── medalla-gimnasio: aviso al aterrizar en un gimnasio ya ganado ──

// AC: medalla-gimnasio/AC-2 — aterrizar en un gimnasio cuya medalla el jugador
// ya tiene emite GymAlreadyWon (antes: TileResolved none silencioso) y no
// ofrece el desafío (pending ChallengeGym solo con medalla pendiente).
test('AC-2 gimnasio ya ganado: GymAlreadyWon sin ChallengeGym', () => {
  const content = contentOf()
  const started = newGame({ seed: 7, starterDeck: 'montana', ruleset: content.ruleset }, content)
  if (!started.ok) throw new Error(started.error.message)
  const base = started.value.state
  const ctx: Ctx = {
    content: {
      ...content,
      board: singleTileBoard({ id: 'gym1', type: 'gym', shape: 'square', x: 0, y: 0, gym: 'brock' }),
    },
    rng: scriptedRng(),
  }
  const state: GameState = {
    ...base,
    phase: 'tileResolution',
    stepsLeft: 0,
    players: [
      {
        ...base.players[0]!,
        position: parseNodeId('gym1'),
        cameFrom: null,
        medals: ['brock'],
        team: [pkm('p1-starter', 'charmander')],
      },
    ],
  }
  const resolved = applyCommand(state, { type: 'Advance' }, ctx)
  if (!resolved.ok) throw new Error(resolved.error.message)
  expect(resolved.value.events).toContainEqual({ type: 'GymAlreadyWon', player: 'p1', gym: 'brock' })
  expect(resolved.value.events).not.toContainEqual({ type: 'TileResolved', player: 'p1', info: 'none' })
  expect(resolved.value.state.pending).toBeNull()
  expect(resolved.value.state.phase).toBe('organize')
  expect(() => assertInvariants(resolved.value.state)).not.toThrow()
})
