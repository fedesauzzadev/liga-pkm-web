// AC: SPEC-C/T-024/AC-1..2 — golden replay de manual.pdf (p.41, p.45-49).
import { expect, test } from 'vitest'
import type { Effect } from '../packages/content/src/index.ts'
import { parseCardId, parsePkmUid } from '../packages/content/src/ids.ts'
import { rngOf, run, toBattle } from './t020-helpers.ts'
import { fx, fxBattle, fxCard } from './t021-helpers.ts'
import type { CommandOk, EngineError, GameEvent, GameState, Result } from '../packages/engine/src/index.ts'

const ok = (result: Result<CommandOk, EngineError>) => {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  return result
}

const manualCard = (id: string, name: string, attack: ReturnType<typeof fx>, sourcePage: number) => ({
  ...fxCard(id, [attack]),
  name,
  source: { manualPage: sourcePage, verified: false },
})

const manualDobleBofeton = (base: number) =>
  fx('doble_bofeton', [{ op: 'bonusPerRoll', faces: [4, 5, 6], amount: 10 }], { base, rollFaces: [1, 2] })

const manualPkm = (uid: string, cardId: string, damage = 0) => ({
  uid: parsePkmUid(uid),
  cardId: parseCardId(cardId),
  damage,
  xp: 0,
  equipped: [],
  wildcards: [],
  fainted: false,
})

test('GOLD-01 Poliwag: Doble bofetón p.41 reproduce 30 de daño', () => {
  const playerCard = manualCard('manual-poliwag', 'Poliwag', manualDobleBofeton(10), 41)
  const game = fxBattle({ playerCard, rng: rngOf(5, 4, 2) })

  const used = ok(run(game.state, { type: 'Attack', attackId: 'doble_bofeton' }, game.ctx))
  expect(used.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 30, cause: 'attack' })
  expect(used.value.state.battle?.rival[0]?.damage).toBe(30)
})

test('GOLD-02 Clefairy vs Tangela (p.45-49) se reproduce en la secuencia del manual', () => {
  const clefairy = manualCard('manual-clefairy', 'Clefairy', manualDobleBofeton(20), 45)
  const tangela = {
    ...fxCard('manual-tangela', [
      fx('polvo_esporas', [{ op: 'rollGate', failFaces: [1, 2, 3], outcome: 'noAttack', duration: 'combat' }], { base: 0, rollFaces: [4, 5] }),
      fx('absorber', [{ op: 'drainNow', amount: 20 }], { base: 0, rollFaces: [1, 2, 3] }),
    ]),
    name: 'Tangela',
    source: { manualPage: 45, verified: false },
  }
  const bulbasaur = manualCard('manual-bulbasaur', 'Bulbasaur', fx('placaje', [], { base: 10, rollFaces: [1, 2, 3, 4, 5, 6] }), 46)

  const game = toBattle({
    active: 'p1-clefairy',
    player: (p) => ({
      ...p,
      team: [
        manualPkm('p1-clefairy', 'manual-clefairy'),
        manualPkm('p1-bulbasaur', 'manual-bulbasaur'),
      ],
    }),
    wildCard: 'manual-tangela',
    extraCards: [clefairy, tangela, bulbasaur],
    rng: rngOf(5, 6, 2, 6, 6, 3, 2, 1, 4, 6),
  })

  const first = ok(run(game.state, { type: 'Attack', attackId: 'doble_bofeton' }, game.ctx))
  expect(first.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 40, cause: 'attack' })

  const rivalNoAttack = ok(run(first.value.state, { type: 'Advance' }, game.ctx))
  expect(rivalNoAttack.value.events).toContainEqual({ type: 'NoAttack', attacker: 'rival-1', reason: 'attackSelect' })

  const second = ok(run(rivalNoAttack.value.state, { type: 'Attack', attackId: 'doble_bofeton' }, game.ctx))
  expect(second.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 30, cause: 'attack' })

  const absorb = ok(run(second.value.state, { type: 'Advance' }, game.ctx))
  expect(absorb.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'p1-clefairy', amount: 20, cause: 'drainNow' })
  expect(absorb.value.events).toContainEqual({ type: 'Healed', pkmUid: 'rival-1', amount: 20, cause: 'drainNow' })

  const third = ok(run(absorb.value.state, { type: 'Attack', attackId: 'doble_bofeton' }, game.ctx))
  expect(third.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 20, cause: 'attack' })

  const spore = ok(run(third.value.state, { type: 'Advance' }, game.ctx))
  expect(spore.value.events).toContainEqual({
    type: 'AttackUsed',
    attacker: 'rival-1',
    attackId: 'polvo_esporas',
    target: 'p1-clefairy',
  })
  expect(spore.value.state.battle?.conditions['p1-clefairy']?.rollGate).toEqual({
    failFaces: [1, 2, 3],
    outcome: 'noAttack',
    duration: 'combat',
  })

  const retire = ok(run(spore.value.state, { type: 'Retire', to: 'p1-bulbasaur' }, game.ctx))
  expect(retire.value.events).toContainEqual({ type: 'PkmRetired', player: 'p1', from: 'p1-clefairy', to: 'p1-bulbasaur' })

  const finalNoAttack = ok(run(retire.value.state, { type: 'Advance' }, game.ctx))
  expect(finalNoAttack.value.events).toContainEqual({ type: 'NoAttack', attacker: 'rival-1', reason: 'attackSelect' })
})

test('GOLD-03 gate superpuesto en la tirada final del manual: un gate combinado bloquea la acción', () => {
  const raichuSpecialty = [{ op: 'defendGate', failFaces: [3, 4], outcome: 'noAttack' }] satisfies readonly Effect[]
  const raichu = {
    ...fxCard('manual-raichu', [fx('chispa', [], { base: 10 })]),
    name: 'Raichu',
    specialties: raichuSpecialty,
    source: { manualPage: 61, verified: false },
  }
  const playerCard = {
    ...fxCard('manual-gate-player', [fx('golpe', [{ op: 'rollGate', failFaces: [1, 2], outcome: 'noAttack', duration: 'combat' }], { base: 10 })]),
    name: 'Manual gate',
    source: { manualPage: 61, verified: false },
  }
  const game = fxBattle({
    playerCard,
    wildCard: 'manual-raichu',
    extraWildCards: [raichu],
    rng: rngOf(4),
  })
  const seeded: GameState = {
    ...game.state,
    battle: {
      ...game.state.battle!,
      conditions: { 'p1-fx': { rollGate: { failFaces: [1, 2], outcome: 'noAttack', duration: 'combat' } } },
    },
  }

  const blocked = ok(run(seeded, { type: 'Attack', attackId: 'golpe' }, game.ctx))
  expect(blocked.value.events).toContainEqual({ type: 'NoAttack', attacker: 'p1-fx', reason: 'gate' })
  const gateRolls = blocked.value.events.filter(
    (event: GameEvent) => event.type === 'DieRolled' && event.purpose === 'gate',
  )
  expect(gateRolls).toHaveLength(1)
})
