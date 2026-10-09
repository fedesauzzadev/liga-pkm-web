// AC: SPEC-C/T-022 — XP, evolución, captura, equipo y pila de Oak.
import { expect, test } from 'vitest'
import { parseCardId, parsePkmUid } from '../packages/content/src/ids.ts'
import type { PokemonCard } from '../packages/content/src/index.ts'
import { run, rngOf, secondPkm, toBattle } from './t020-helpers.ts'
import {
  legalCommands,
  type Ctx,
  type GameState,
  type PkmInstance,
  type PlayerState,
} from '../packages/engine/src/index.ts'

/** Línea sintética caterpie → metapod (xp 1): evolución en contenido controlado. */
const caterpie: PokemonCard = {
  id: 'caterpie',
  dex: 10,
  name: 'Caterpie',
  stage: 'basic',
  deck: 'bosque',
  hp: 40,
  element: 'grass',
  attacks: [
    {
      id: 'placaje',
      name: 'Placaje',
      kind: 'attack',
      rollFaces: [1, 2, 3, 4, 5, 6],
      cost: [],
      element: 'normal',
      damage: { base: 10 },
      effects: [],
      rawText: '',
    },
  ],
  specialties: [],
  evolvesTo: [{ id: 'metapod', xp: 1 }],
  source: { verified: false },
}

const metapod: PokemonCard = { ...caterpie, id: 'metapod', dex: 11, name: 'Metapod', hp: 80, evolvesTo: [] }

/** Eevee (p.25-26): 3 opciones de evolución tras su 2ª victoria (xp 2 cada una). */
const eevee: PokemonCard = {
  ...caterpie,
  id: 'eevee',
  dex: 133,
  name: 'Eevee',
  evolvesTo: [
    { id: 'vaporeon', xp: 2 },
    { id: 'jolteon', xp: 2 },
    { id: 'flareon', xp: 2 },
  ],
}
const eeveelution = (id: string, dex: number): PokemonCard => ({
  ...caterpie,
  id,
  dex,
  name: id,
  evolvesTo: [],
})

const synthPkm = (cardId: string, uid: string, overrides: Partial<PkmInstance> = {}): PkmInstance => ({
  uid: parsePkmUid(uid),
  cardId: parseCardId(cardId),
  damage: 0,
  xp: 0,
  equipped: [],
  wildcards: [],
  fainted: false,
  ...overrides,
})

/** Batalla del jugador contra poliwag sembrado con 30 de daño (le falta 20 para caer). */
const seededBattle = (
  options: { readonly rngFaces?: readonly number[]; readonly player?: (player: PlayerState) => PlayerState } = {},
): { state: GameState; ctx: Ctx } => {
  const game = toBattle({
    rng: rngOf(...(options.rngFaces ?? [6])),
    ...(options.player === undefined ? {} : { player: options.player }),
  })
  return {
    state: {
      ...game.state,
      battle: {
        ...game.state.battle!,
        rival: game.state.battle!.rival.map((pkm) => ({ ...pkm, damage: 30 })),
      },
    },
    ctx: game.ctx,
  }
}

/** Batalla ganada: el activo derrota al poliwag (rasguños 4-5-6 ⇒ 20 + 30 ≥ 50). */
const wonBattle = (
  options: { readonly rngFaces?: readonly number[]; readonly player?: (player: PlayerState) => PlayerState } = {},
): { state: GameState; ctx: Ctx } => {
  const seeded = seededBattle(options)
  const attack = run(seeded.state, { type: 'Attack', attackId: 'rasgunos' }, seeded.ctx)
  if (!attack.ok) throw new Error(attack.error.message)
  return { state: attack.value.state, ctx: seeded.ctx }
}

/** Estado fuera de combate en `organize` con cartas sintéticas disponibles. */
const inOrganize = (team: readonly PkmInstance[]): { state: GameState; ctx: Ctx } => {
  const game = toBattle({
    rng: rngOf(),
    player: (p) => ({ ...p, team: [p.team[0]!, ...team] }),
  })
  return {
    state: { ...game.state, battle: null, pending: null, phase: 'organize' },
    ctx: {
      ...game.ctx,
      content: { ...game.ctx.content, cards: [...game.ctx.content.cards, caterpie, metapod, eevee, ...['vaporeon', 'jolteon', 'flareon'].map((id, i) => eeveelution(id, 134 + i))] },
    },
  }
}

// AC: SPEC-C/T-022/AC-1 — ganan 1 XP solo los PKM propios que estuvieron en juego.
test('AC-1 la victoria da 1 XP a los participantes (incluido un retirado) y a nadie más', () => {
  // El starter retira (participó), el segundo mata al rival; un tercero nunca entró.
  const third = synthPkm('squirtle', 'p1-third')
  const seeded = seededBattle({
    rngFaces: [6], // attackSelect del salvaje ⇒ 6 no ataca
    player: (p) => ({ ...p, team: [p.team[0]!, secondPkm(), third] }),
  })
  const retired = run(seeded.state, { type: 'Retire', to: 'p1-second' }, seeded.ctx)
  if (!retired.ok) throw new Error(retired.error.message)
  const advanced = run(retired.value.state, { type: 'Advance' }, seeded.ctx) // turno del rival
  if (!advanced.ok) throw new Error(advanced.error.message)
  const killed = run(advanced.value.state, { type: 'Attack', attackId: 'cabezazo' }, seeded.ctx)
  if (!killed.ok) throw new Error(killed.error.message)
  expect(killed.value.events).toContainEqual({ type: 'BattleEnded', player: 'p1', result: 'won' })
  expect(killed.value.events).toContainEqual({ type: 'XpGained', pkmUid: 'p1-starter', amount: 1 })
  expect(killed.value.events).toContainEqual({ type: 'XpGained', pkmUid: 'p1-second', amount: 1 })
  const xpOf = (uid: string): number | undefined =>
    killed.value.state.players[0]!.team.find((pkm) => pkm.uid === uid)?.xp
  expect(xpOf('p1-starter')).toBe(1) // retirado que estuvo en juego (RULES §4 p.47)
  expect(xpOf('p1-second')).toBe(1)
  expect(xpOf('p1-third')).toBe(0) // no participó ⇒ no gana
})

// AC: SPEC-C/T-022/AC-2 — Evolve exige el XP requerido, reemplaza carta, XP=0 y conserva daño.
test('AC-2 Evolve: xp insuficiente rechaza; xp suficiente reemplaza carta, resetea XP y conserva daño', () => {
  // (a) Sin XP suficiente: ilegal y el menú no lo ofrece.
  const young = inOrganize([synthPkm('caterpie', 'p1-cat', { xp: 0 })])
  const early = run(young.state, { type: 'Evolve', pkmUid: 'p1-cat', toId: 'metapod' }, young.ctx)
  expect(early.ok).toBe(false)
  if (!early.ok) expect(early.error.code).toBe('ILLEGAL_COMMAND')
  expect(legalCommands(young.state, young.ctx)).not.toContainEqual({ type: 'Evolve', pkmUid: 'p1-cat', toId: 'metapod' })

  // (b) XP suficiente: reemplaza la carta, XP=0 (D-04) y conserva el daño (D-05).
  const ready = inOrganize([synthPkm('caterpie', 'p1-cat', { xp: 1, damage: 20 })])
  expect(legalCommands(ready.state, ready.ctx)).toContainEqual({ type: 'Evolve', pkmUid: 'p1-cat', toId: 'metapod' })
  const evolved = run(ready.state, { type: 'Evolve', pkmUid: 'p1-cat', toId: 'metapod' }, ready.ctx)
  expect(evolved.ok).toBe(true)
  if (!evolved.ok) throw new Error(evolved.error.message)
  expect(evolved.value.events).toContainEqual({
    type: 'PkmEvolved',
    player: 'p1',
    pkmUid: 'p1-cat',
    from: 'caterpie',
    to: 'metapod',
  })
  expect(evolved.value.state.players[0]!.team.find((pkm) => pkm.uid === 'p1-cat')).toMatchObject({
    cardId: 'metapod',
    xp: 0,
    damage: 20,
  })

  // (c) Eevee con 2 XP (2 victorias): el menú ofrece las 3 evoluciones y elige el jugador.
  const eeveeGame = inOrganize([synthPkm('eevee', 'p1-eevee', { xp: 2 })])
  const menu = legalCommands(eeveeGame.state, eeveeGame.ctx).filter((c) => c.type === 'Evolve')
  expect(menu).toEqual([
    { type: 'Evolve', pkmUid: 'p1-eevee', toId: 'vaporeon' },
    { type: 'Evolve', pkmUid: 'p1-eevee', toId: 'jolteon' },
    { type: 'Evolve', pkmUid: 'p1-eevee', toId: 'flareon' },
  ])
  const chosen = run(eeveeGame.state, { type: 'Evolve', pkmUid: 'p1-eevee', toId: 'jolteon' }, eeveeGame.ctx)
  expect(chosen.ok).toBe(true)
  if (!chosen.ok) throw new Error(chosen.error.message)
  expect(chosen.value.state.players[0]!.team.find((pkm) => pkm.uid === 'p1-eevee')).toMatchObject({
    cardId: 'jolteon',
    xp: 0,
  })
})

// AC: SPEC-C/T-022/AC-3 — capturar gasta 1 Pokebola (sin bola solo liberar) y la devuelve al fondo.
test('AC-3 Capture gasta la pokebola y la devuelve al fondo del mazo Ítem; sin bola solo Release', () => {
  const won = wonBattle()
  expect(won.state.pending?.type).toBe('CaptureOrRelease')
  expect(legalCommands(won.state, won.ctx)).toEqual([{ type: 'Capture' }, { type: 'Release' }])
  const captured = run(won.state, { type: 'Capture' }, won.ctx)
  expect(captured.ok).toBe(true)
  if (!captured.ok) throw new Error(captured.error.message)
  expect(captured.value.events).toContainEqual({
    type: 'PokemonCaptured',
    player: 'p1',
    card: 'poliwag',
    pkmUid: 'p1-catch-1',
    destination: 'team',
  })
  expect(captured.value.events).toContainEqual({ type: 'CardToBottom', player: 'p1', deck: 'item', card: 'pokeball' })
  const player = captured.value.state.players[0]!
  expect(player.items.pokeball).toBe(4) // 5 − 1 gastada
  expect(captured.value.state.decks.item).toEqual(['pokeball']) // al fondo del mazo Ítem
  expect(player.team.at(-1)).toMatchObject({ uid: 'p1-catch-1', cardId: 'poliwag', damage: 0, xp: 0 })
  expect(captured.value.state.pending).toBeNull()
  expect(captured.value.state.phase).toBe('organize')
  expect(captured.value.state.turn).toBe(won.state.turn + 1)
  expect(captured.value.events.at(-1)).toEqual({ type: 'TurnAdvanced', turn: captured.value.state.turn })

  // Sin pokebola: Capture es ilegal y el menú solo ofrece Release.
  const dry = wonBattle({ player: (p) => ({ ...p, items: { pokeball: 0, potion: 0 } }) })
  expect(legalCommands(dry.state, dry.ctx)).toEqual([{ type: 'Release' }])
  const refused = run(dry.state, { type: 'Capture' }, dry.ctx)
  expect(refused.ok).toBe(false)
  if (!refused.ok) expect(refused.error.code).toBe('ILLEGAL_COMMAND')
})

// AC: SPEC-C/T-022/AC-4 — equipo lleno (6) ⇒ el capturado va a la pila de Oak (sano).
test('AC-4 con equipo completo el PKM capturado va a oakPile y el equipo queda en 6', () => {
  const bench = [secondPkm(), synthPkm('squirtle', 'p1-t3'), synthPkm('squirtle', 'p1-t4'), synthPkm('squirtle', 'p1-t5'), synthPkm('squirtle', 'p1-t6')]
  const won = wonBattle({ player: (p) => ({ ...p, team: [p.team[0]!, ...bench] }) })
  expect(won.state.players[0]!.team).toHaveLength(6)
  const captured = run(won.state, { type: 'Capture' }, won.ctx)
  expect(captured.ok).toBe(true)
  if (!captured.ok) throw new Error(captured.error.message)
  expect(captured.value.events).toContainEqual({
    type: 'PokemonCaptured',
    player: 'p1',
    card: 'poliwag',
    pkmUid: 'p1-catch-1',
    destination: 'oakPile',
  })
  const player = captured.value.state.players[0]!
  expect(player.team).toHaveLength(6) // equipo lleno: no entra
  expect(player.oakPile).toEqual([{ uid: 'p1-catch-1', cardId: 'poliwag', damage: 0, xp: 0, equipped: [], wildcards: [], fainted: false }])
})

// AC: SPEC-C/T-022/AC-5 — la carta capturada sale del mazo; la liberada vuelve al fondo.
test('AC-5 la carta capturada no vuelve al mazo y la liberada vuelve al FONDO', () => {
  // (a) Capturada: sale del mazo (queda en el equipo, el mazo pantano queda vacío).
  const won = wonBattle()
  const captured = run(won.state, { type: 'Capture' }, won.ctx)
  if (!captured.ok) throw new Error(captured.error.message)
  expect(captured.value.state.decks.pantano).toEqual([])
  expect(captured.value.state.players[0]!.team.some((pkm) => pkm.cardId === 'poliwag')).toBe(true)

  // (b) Liberada: vuelve al FONDO de su mazo y el turno cierra.
  const wonAgain = wonBattle()
  const released = run(wonAgain.state, { type: 'Release' }, wonAgain.ctx)
  expect(released.ok).toBe(true)
  if (!released.ok) throw new Error(released.error.message)
  expect(released.value.events).toContainEqual({ type: 'CardToBottom', player: 'p1', deck: 'pantano', card: 'poliwag' })
  expect(released.value.state.decks.pantano).toEqual(['poliwag'])
  expect(released.value.state.players[0]!.team.some((pkm) => pkm.cardId === 'poliwag')).toBe(false)
  expect(released.value.state.pending).toBeNull()
  expect(released.value.state.phase).toBe('organize')
  expect(released.value.events.at(-1)).toEqual({ type: 'TurnAdvanced', turn: released.value.state.turn })
})
