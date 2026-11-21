// AC: SPEC-C/T-020 — Derrota y fin de batalla (AC-7), explosión con doble caída (AC-8)
// y guardas de pociones/encuentro sin sanos (D-08).
import { expect, test } from 'vitest'
import { parseCardId, parsePkmUid } from '../packages/content/src/ids.ts'
import { boomCard, run, secondPkm, toBattle, rngOf } from './t020-helpers.ts'
import {
  applyCommand,
  legalCommands,
  type GameState,
  type PkmInstance,
} from '../packages/engine/src/index.ts'

/** PKM de carta sintética para el equipo del jugador. */
const synthPkm = (cardId: string, uid: string, damage = 0): PkmInstance => ({
  uid: parsePkmUid(uid),
  cardId: parseCardId(cardId),
  damage,
  xp: 0,
  equipped: [],
  multicolor: [],
  fainted: false,
})

/** Batalla con el rival sembrado a `rivalDamage` de vida. */
const withWildDamage = (state: GameState, damage: number): GameState => ({
  ...state,
  battle: {
    ...state.battle!,
    rival: state.battle!.rival.map((pkm) => ({ ...pkm, damage })),
  },
})

// AC: SPEC-C/T-020/AC-7 — daño ≥ hp ⇒ PokemonFainted; sin sanos ⇒ fin (el salvaje escapa).
test('AC-7 derrota del rival deja CaptureOrRelease; derrota total del jugador hace escapar al salvaje', () => {
  // (a) El jugador derrota al salvaje: 40 + 20 (rasguños 4-5-6) ≥ 50.
  const game = toBattle({ rng: rngOf(6) })
  const seeded = withWildDamage(game.state, 40)
  const attack = run(seeded, { type: 'Attack', attackId: 'rasgunos' }, game.ctx)
  expect(attack.ok).toBe(true)
  if (!attack.ok) throw new Error(attack.error.message)
  expect(attack.value.events).toContainEqual({ type: 'PokemonFainted', pkmUid: 'rival-1' })
  expect(attack.value.events).toContainEqual({ type: 'BattleEnded', player: 'p1', result: 'won' })
  // La captura llegó con T-022: la decisión queda pendiente y el menú ofrece
  // Capture (con pokebolas disponibles) y Release.
  expect(attack.value.state.battle).toBeNull()
  expect(attack.value.state.phase).toBe('tileResolution')
  expect(attack.value.state.pending).toEqual({
    type: 'CaptureOrRelease',
    card: 'poliwag',
    deck: 'pantano',
    participants: ['p1-starter'],
  })
  expect(legalCommands(attack.value.state, game.ctx)).toEqual([{ type: 'Capture' }, { type: 'Release' }])

  // (b) El salvaje derrota al único PKM sano: escapa (FONDO del mazo) y el turno avanza.
  const lost = toBattle({
    rng: rngOf(3), // attackSelect 3 ⇒ Embestida (20) sobre charmander con 40 de daño
    player: (p) => ({ ...p, team: [{ ...p.team[0]!, damage: 40 }] }),
  })
  const beaten = run(lost.state, { type: 'Advance' }, lost.ctx)
  expect(beaten.ok).toBe(true)
  if (!beaten.ok) throw new Error(beaten.error.message)
  expect(beaten.value.events).toContainEqual({ type: 'PokemonFainted', pkmUid: 'p1-starter' })
  expect(beaten.value.events).toContainEqual({ type: 'BattleEnded', player: 'p1', result: 'lost' })
  expect(beaten.value.events).toContainEqual({ type: 'CardToBottom', player: 'p1', deck: 'pantano', card: 'poliwag' })
  expect(beaten.value.state.decks.pantano).toHaveLength(1) // el salvaje, al fondo
  expect(beaten.value.state.pending).toBeNull()
  expect(beaten.value.state.phase).toBe('organize')
  expect(beaten.value.state.turn).toBe(lost.state.turn + 1)
  expect(beaten.value.events.at(-1)).toEqual({ type: 'TurnAdvanced', turn: beaten.value.state.turn })
})

// AC: SPEC-C/T-020/AC-8 — explosión: si caen ambos, el turno del atacante termina (p.68).
test('AC-8 explosión derriba a ambos: fin del turno del atacante y victoria con reemplazo', () => {
  const game = toBattle({
    rng: rngOf(), // sin dados: la explosión no tira ifRoll ni bonus
    wildCard: 'poliwag',
    active: 'p1-boom',
    extraCards: [boomCard],
    player: (p) => ({
      ...p,
      team: [synthPkm('boom', 'p1-boom', 40), secondPkm()], // 60 hp − 20 ⇒ cae
    }),
  })
  expect(game.state.battle!.active[0]).toBe('p1-boom')
  const attack = run(game.state, { type: 'Attack', attackId: 'explosion' }, game.ctx)
  expect(attack.ok).toBe(true)
  if (!attack.ok) throw new Error(attack.error.message)
  // 50 al rival (cae) y 20 sin modificadores al propio (también cae).
  expect(attack.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 50, cause: 'attack' })
  expect(attack.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'p1-boom', amount: 20, cause: 'selfDamage' })
  expect(attack.value.events).toContainEqual({ type: 'PokemonFainted', pkmUid: 'rival-1' })
  expect(attack.value.events).toContainEqual({ type: 'PokemonFainted', pkmUid: 'p1-boom' })
  expect(attack.value.events).toContainEqual({ type: 'BattleEnded', player: 'p1', result: 'won' })
  // El turno del atacante terminó: primero repone, después queda la captura (T-022).
  expect(attack.value.state.battle?.won).toBe(true)
  expect(attack.value.state.pending).toEqual({ type: 'ChooseReplacement', options: ['p1-second'] })
  const sent = run(attack.value.state, { type: 'SendOut', pkmUid: 'p1-second' }, game.ctx)
  expect(sent.ok).toBe(true)
  if (!sent.ok) throw new Error(sent.error.message)
  expect(sent.value.state.battle).toBeNull()
  expect(sent.value.state.pending).toEqual({
    type: 'CaptureOrRelease',
    card: 'poliwag',
    deck: 'pantano',
    participants: ['p1-boom', 'p1-second'],
  })
})

// Extra (sin AC): pociones en combate (D-11) y encuentro sin PKM sanos (D-08).
test('pociones: curan hasta ruleset.potionHeal, vuelven al fondo del mazo ítem y agotan la bolsa', () => {
  const game = toBattle({
    rng: rngOf(),
    player: (p) => ({
      ...p,
      team: [{ ...p.team[0]!, damage: 50 }],
      items: { pokeball: 5, potion: 2, oportunidad: 0, super_potion: 0, ultraball: 0, masterball: 0 },
    }),
  })
  const first = run(game.state, { type: 'UsePotion', pkmUid: 'p1-starter', target: 'p1-starter' }, game.ctx)
  expect(first.ok).toBe(true)
  if (!first.ok) throw new Error(first.error.message)
  expect(first.value.events).toContainEqual({ type: 'Healed', pkmUid: 'p1-starter', amount: 30, cause: 'potion' })
  expect(first.value.events).toContainEqual({ type: 'CardToBottom', player: 'p1', deck: 'item', card: 'potion' })
  expect(first.value.state.players[0]!.team[0]!.damage).toBe(20)
  expect(first.value.state.players[0]!.items.potion).toBe(1)
  expect(first.value.state.decks.item).toHaveLength(1)

  const second = run(first.value.state, { type: 'UsePotion', pkmUid: 'p1-starter', target: 'p1-starter' }, game.ctx)
  expect(second.ok).toBe(true)
  if (!second.ok) throw new Error(second.error.message)
  expect(second.value.events).toContainEqual({ type: 'Healed', pkmUid: 'p1-starter', amount: 20, cause: 'potion' }) // solo lo que falta
  // Sin daño que curar ⇒ ilegal (y sin pociones).
  const full = run(second.value.state, { type: 'UsePotion', pkmUid: 'p1-starter', target: 'p1-starter' }, game.ctx)
  expect(full.ok).toBe(false)
  if (!full.ok) expect(full.error.code).toBe('ILLEGAL_COMMAND')

  const noPotions = toBattle({ rng: rngOf(), player: (p) => ({ ...p, team: [{ ...p.team[0]!, damage: 10 }] }) })
  const dry = run(noPotions.state, { type: 'UsePotion', pkmUid: 'p1-starter', target: 'p1-starter' }, noPotions.ctx)
  expect(dry.ok).toBe(false)
  if (!dry.ok) expect(dry.error.code).toBe('ILLEGAL_COMMAND')
})

// Extra (sin AC): D-08 — sin PKM sanos solo se puede dejar ir al salvaje.
test('encuentro sin PKM sanos: solo ReleaseWild es legal y FightEncounter falla', () => {
  const game = toBattle({ rng: rngOf() })
  const drawn = applyCommand(
    {
      ...game.state,
      phase: 'tileResolution',
      battle: null,
      pending: { type: 'FightOrRelease', card: 'poliwag', deck: 'pantano' },
    },
    { type: 'Advance' },
    game.ctx,
  )
  expect(drawn.ok).toBe(false) // Advance no resuelve la decisión pendiente

  const allFainted: GameState = {
    ...game.state,
    phase: 'tileResolution',
    battle: null,
    pending: { type: 'FightOrRelease', card: 'poliwag', deck: 'pantano' },
    players: game.state.players.map((p) => ({ ...p, team: p.team.map((pkm) => ({ ...pkm, fainted: true })) })),
  }
  expect(legalCommands(allFainted, game.ctx)).toEqual([{ type: 'ReleaseWild' }])
  const fight = run(allFainted, { type: 'FightEncounter', pkmUid: 'p1-starter' }, game.ctx)
  expect(fight.ok).toBe(false)
  if (!fight.ok) expect(fight.error.code).toBe('ILLEGAL_COMMAND')
})
