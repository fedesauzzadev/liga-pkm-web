// AC: SPEC-I/T-073/AC-2 — UsePotion fuera de combate (RULES D-11: "cualquier
// PKM del equipo en Organize; en combate solo el activo"): el drop de Poción en
// un slot de PKM tiene que ser legal en Organize. En combate no cambia nada.
import { expect, test } from 'vitest'
import {
  applyCommand,
  legalCommands,
  newGame,
  type CommandOk,
  type Ctx,
  type EngineError,
  type GameState,
  type PkmInstance,
  type PlayerState,
  type Result,
} from '../packages/engine/src/index.ts'
import { content, toBattle } from './t020-helpers.ts'

type Command = Parameters<typeof applyCommand>[1]

const started = newGame({ seed: 7, starterDeck: 'montana', ruleset: content.ruleset }, content)
if (!started.ok) throw new Error(started.error.message)

const run = (state: GameState, command: Command, ctx: Ctx): Result<CommandOk, EngineError> =>
  applyCommand(state, command, ctx)

const errorOf = (result: Result<CommandOk, EngineError>): string => {
  if (result.ok) throw new Error('esperaba un rechazo y el comando resultó legal')
  return result.error.message
}

/** Segundo PKM del equipo (sano) para probar "cualquier PKM del equipo". */
const benchPkm = (): PkmInstance => ({
  uid: 'p1-bench' as PkmInstance['uid'],
  cardId: 'squirtle' as PkmInstance['cardId'],
  damage: 0,
  xp: 0,
  equipped: [],
  multicolor: [],
  fainted: false,
})

/** Jugador con daño en el starter, un suplente sano y pociones en la bolsa. */
const hurtPlayer = (base: PlayerState): PlayerState => ({
  ...base,
  team: [{ ...base.team[0]!, damage: 50 }, benchPkm()],
  items: { ...base.items, potion: 2, super_potion: 1 },
})

const organizeWithDamage = (): { state: GameState; ctx: Ctx } => {
  const base = started.value.state
  const player = hurtPlayer(base.players[0]!)
  return {
    state: { ...base, players: [{ ...player }] },
    ctx: { content, rng: { d6: () => 6, int: () => 0, snapshot: () => 0 } },
  }
}

const bagOf = (state: GameState): PlayerState['items'] => state.players[0]!.items

test('AC: SPEC-I/T-073/AC-2 - Poción en Organize cura a cualquier PKM del equipo (D-11)', () => {
  const { state, ctx } = organizeWithDamage()
  const uid = state.players[0]!.team[0]!.uid
  const healed = run(state, { type: 'UsePotion', pkmUid: uid, target: uid }, ctx)
  expect(healed.ok).toBe(true)
  if (!healed.ok) return
  const potionHeal = content.ruleset.potionHeal
  expect(healed.value.state.players[0]!.team[0]!.damage).toBe(50 - potionHeal)
  expect(bagOf(healed.value.state).potion).toBe(1)
  expect(healed.value.state.decks.item[healed.value.state.decks.item.length - 1]).toBe('potion')
  expect(healed.value.events).toEqual([
    { type: 'Healed', pkmUid: uid, amount: potionHeal, cause: 'potion' },
    { type: 'CardToBottom', player: 'p1', deck: 'item', card: 'potion' },
  ])
})

test('AC: SPEC-I/T-073/AC-2 - Super Poción en Organize cura todo el daño (D-20)', () => {
  const { state, ctx } = organizeWithDamage()
  const uid = state.players[0]!.team[0]!.uid
  const healed = run(state, { type: 'UsePotion', pkmUid: uid, target: uid, item: 'super_potion' }, ctx)
  expect(healed.ok).toBe(true)
  if (!healed.ok) return
  expect(healed.value.state.players[0]!.team[0]!.damage).toBe(0)
  expect(bagOf(healed.value.state).super_potion).toBe(0)
  expect(healed.value.state.decks.sorpresa[healed.value.state.decks.sorpresa.length - 1]).toBe('super_potion')
})

test('AC: SPEC-I/T-073/AC-2 - fuera de Organize o sin daño/stock es ilegal (motor decide)', () => {
  const { state, ctx } = organizeWithDamage()
  const uid = state.players[0]!.team[0]!.uid
  // Sin batalla y fuera de organize (resolviendo casillero): ilegal.
  const resolving: GameState = { ...state, phase: 'tileResolution', pending: null, stepsLeft: 0 }
  const whileResolving = run(resolving, { type: 'UsePotion', pkmUid: uid, target: uid }, ctx)
  expect(whileResolving.ok).toBe(false)
  expect(errorOf(whileResolving)).toContain('Organize')
  // Sin daño: ilegal.
  const healthy: GameState = {
    ...state,
    players: [{ ...state.players[0]!, team: state.players[0]!.team.map((pkm) => ({ ...pkm, damage: 0 })) }],
  }
  const noDamage = run(healthy, { type: 'UsePotion', pkmUid: uid, target: uid }, ctx)
  expect(noDamage.ok).toBe(false)
  // Sin stock: ilegal.
  const noStock: GameState = {
    ...state,
    players: [{ ...state.players[0]!, items: { ...state.players[0]!.items, potion: 0 } }],
  }
  expect(run(noStock, { type: 'UsePotion', pkmUid: uid, target: uid }, ctx).ok).toBe(false)
  // uid ajeno al equipo: ilegal.
  const alien = run(state, { type: 'UsePotion', pkmUid: 'p1-nadie', target: 'p1-nadie' }, ctx)
  expect(alien.ok).toBe(false)
})

test('AC: SPEC-I/T-073/AC-2 - en combate sigue siendo solo el PKM activo (regresión)', () => {
  const battle = toBattle({ player: hurtPlayer })
  const active = battle.state.battle!.active[0]
  const bench = battle.state.players[0]!.team.find((pkm) => pkm.uid !== active)
  expect(bench).toBeDefined()
  const onActive = run(battle.state, { type: 'UsePotion', pkmUid: active, target: active }, battle.ctx)
  expect(onActive.ok).toBe(true)
  const onBench = run(
    battle.state,
    { type: 'UsePotion', pkmUid: bench!.uid, target: bench!.uid },
    battle.ctx,
  )
  expect(onBench.ok).toBe(false)
  expect(errorOf(onBench)).toContain('activo')
})

test('AC: SPEC-I/T-073/AC-6 - legalCommands ofrece UsePotion en organize por PKM con daño', () => {
  const { state, ctx } = organizeWithDamage()
  const uid = state.players[0]!.team[0]!.uid
  const commands = legalCommands(state, ctx)
  expect(commands).toContainEqual({ type: 'UsePotion', pkmUid: uid, target: uid })
  expect(commands).toContainEqual({ type: 'UsePotion', pkmUid: uid, target: uid, item: 'super_potion' })
  const healthy: GameState = {
    ...state,
    players: [{ ...state.players[0]!, team: state.players[0]!.team.map((pkm) => ({ ...pkm, damage: 0 })) }],
  }
  expect(legalCommands(healthy, ctx).some((command) => command.type === 'UsePotion')).toBe(false)
})
