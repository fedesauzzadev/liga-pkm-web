// AC: SPEC-C/T-021/AC-2..AC-6 — dados bonus, superposición de gates, no-apilado,
// reemplazo de gates y auto-ataque, y efectos custom sin handler.
import { expect, test } from 'vitest'
import { rngOf, run } from './t020-helpers.ts'
import { fxBattle, fx, fxCard, noFirstTurn } from './t021-helpers.ts'
import {
  registerCustomEffectHandler,
  type CommandOk,
  type DieRolled,
  type EngineError,
  type GameEvent,
  type GameState,
  type Result,
} from '../packages/engine/src/index.ts'

const ok = (result: Result<CommandOk, EngineError>) => {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  return result
}

/** Escenario de superposición: atacante con rollGate [1,2] noAttack sembrado + defensor con defendGate [3,4] noAttack. */
const overlap = (gateFace: number) => {
  const raichu = fxCard('fx-raichu2', [fx('chispa', [], { base: 10 })], [
    { op: 'defendGate', failFaces: [3, 4], outcome: 'noAttack' },
  ])
  const game = fxBattle({
    playerCard: fxCard('fx-golpeador2', [fx('golpe', [], { base: 10 })]),
    wildCard: 'fx-raichu2',
    extraWildCards: [raichu],
    rng: rngOf(gateFace),
  })
  const seeded: GameState = {
    ...game.state,
    battle: {
      ...game.state.battle!,
      conditions: { 'p1-fx': { rollGate: { failFaces: [1, 2], outcome: 'noAttack', duration: 'combat' } } },
    },
  }
  return { state: seeded, ctx: game.ctx }
}

const gateRolls = (events: readonly GameEvent[]): readonly DieRolled[] =>
  events.filter((event: GameEvent): event is DieRolled => event.type === 'DieRolled' && event.purpose === 'gate')

// AC: SPEC-C/T-021/AC-2 — bonusPerRoll: [5,4,2] con faces [4,5,6] y bonus 10 ⇒ +20 y 3 tiradas bonus.
test('AC-2 bonusPerRoll tira mientras acierte: exactamente 3 tiradas y +20', () => {
  const game = fxBattle({
    playerCard: fxCard('fx-bofeton', [fx('doble_bofeton', [{ op: 'bonusPerRoll', faces: [4, 5, 6], amount: 10 }], { base: 10 })]),
    rng: rngOf(5, 4, 2),
  })
  const used = ok(run(noFirstTurn(game.state), { type: 'Attack', attackId: 'doble_bofeton' }, game.ctx))
  const rolls = used.value.events.filter((event: GameEvent): event is DieRolled => event.type === 'DieRolled' && event.purpose === 'bonus')
  expect(rolls.map((roll) => roll.value)).toEqual([5, 4, 2])
  expect(used.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 30, cause: 'attack' })
  expect(used.value.state.battle?.rival[0]?.damage).toBe(30)
})

// AC: SPEC-C/T-021/AC-3 — superposición p.61: rollGate [1,2] + defendGate [3,4] ⇒ UNA tirada gate; ataca con 5-6.
test('AC-3 superposición: una sola tirada gate y solo ataca con 5-6', () => {
  // Gate 1 (slot propio [1,2]) ⇒ NoAttack, una única tirada.
  const fail = overlap(1)
  const gated = ok(run(fail.state, { type: 'Attack', attackId: 'golpe' }, fail.ctx))
  expect(gated.value.events).toContainEqual({ type: 'NoAttack', attacker: 'p1-fx', reason: 'gate' })
  expect(gateRolls(gated.value.events).length).toBe(1)

  // Gate 4 (defendGate del defensor [3,4]) ⇒ NoAttack, misma tirada única.
  const defend = overlap(4)
  const blocked = ok(run(defend.state, { type: 'Attack', attackId: 'golpe' }, defend.ctx))
  expect(blocked.value.events).toContainEqual({ type: 'NoAttack', attacker: 'p1-fx', reason: 'gate' })
  expect(gateRolls(blocked.value.events).length).toBe(1)

  // Gate 5 ⇒ ataca normal (también UNA sola tirada).
  const pass = overlap(5)
  const hit = ok(run(pass.state, { type: 'Attack', attackId: 'golpe' }, pass.ctx))
  expect(hit.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 10, cause: 'attack' })
  expect(gateRolls(hit.value.events).length).toBe(1)
})

// AC: SPEC-C/T-021/AC-3 (D-03) — una cara en noAttack y selfHit ⇒ gana selfHit.
test('AC-3 prioridad selfHit: cara compartida por ambos outcomes ⇒ auto-ataque', () => {
  const kadabra = fxCard('fx-kadabra2', [fx('psico', [], { base: 10 })], [
    { op: 'defendGate', failFaces: [1, 2], outcome: 'noAttack' },
  ])
  const game = fxBattle({
    playerCard: fxCard('fx-golpeador3', [fx('golpe', [], { base: 10 })]),
    wildCard: 'fx-kadabra2',
    extraWildCards: [kadabra],
    rng: rngOf(1),
  })
  const seeded: GameState = {
    ...game.state,
    battle: {
      ...game.state.battle!,
      conditions: { 'p1-fx': { rollGate: { failFaces: [1, 2], outcome: 'selfHit', duration: 'combat' } } },
    },
  }
  const self = ok(run(seeded, { type: 'Attack', attackId: 'golpe' }, game.ctx))
  expect(self.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'p1-fx', amount: 10, cause: 'attack' })
  expect(self.value.events).not.toContainEqual({ type: 'NoAttack', attacker: 'p1-fx', reason: 'gate' })
})

// AC: SPEC-C/T-021/AC-4 — poison no se acumula; modifyRivalDamage max:1 no se apila.
test('AC-4 no-apilado: veneno y modifyRivalDamage max 1 aplican una sola vez', () => {
  const poison = fxBattle({
    playerCard: fxCard('fx-veneno2', [fx('tizona', [{ op: 'poison', amount: 10 }], { base: 0 })]),
    rng: rngOf(6, 6),
  })
  const firstP = ok(run(poison.state, { type: 'Attack', attackId: 'tizona' }, poison.ctx))
  const secondP = ok(run(firstP.value.state, { type: 'Advance' }, poison.ctx)) // tick 10 + rival no ataca
  const again = ok(run(secondP.value.state, { type: 'Attack', attackId: 'tizona' }, poison.ctx))
  const ticked = ok(run(again.value.state, { type: 'Advance' }, poison.ctx))
  const ticks = ticked.value.events.filter((event: GameEvent) => event.type === 'DamageTaken' && event.cause === 'poison')
  expect(ticks).toEqual([{ type: 'DamageTaken', pkmUid: 'rival-1', amount: 10, cause: 'poison' }])

  // Gruñido (-10, combat, max 1) dos veces: el rival solo pierde 10 de su ataque (20 − 10, no 20 − 20).
  const grunido = fxCard('fx-grunido2', [fx('grunido', [{ op: 'modifyRivalDamage', amount: -10, duration: 'combat', max: 1 }], { base: 0 })])
  const growl = fxBattle({ playerCard: grunido, rng: rngOf(6, 3) })
  const g1 = ok(run(growl.state, { type: 'Attack', attackId: 'grunido' }, growl.ctx))
  const r1 = ok(run(g1.value.state, { type: 'Advance' }, growl.ctx)) // rival 6 ⇒ no ataca
  const g2 = ok(run(r1.value.state, { type: 'Attack', attackId: 'grunido' }, growl.ctx))
  const r2 = ok(run(g2.value.state, { type: 'Advance' }, growl.ctx)) // rival 3 ⇒ Embestida (20)
  expect(r2.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'p1-fx', amount: 10, cause: 'attack' })
})

// AC: SPEC-C/T-021/AC-4 — drainNow y poison ignoran modificadores de daño.
test('AC-4 drainNow y poison ignoran modificadores (reducciones y boosts)', () => {
  const card = fxCard('fx-absorber2', [fx('absorber', [{ op: 'drainNow', amount: 20 }], { base: 0 })])
  const game = fxBattle({ playerCard: card, rng: rngOf(6) })
  // El rival "se protegió" con Refugio MAX 1 (-10) y el atacante carga un boost +10:
  // nada de eso toca el drenaje directo.
  const seeded: GameState = {
    ...game.state,
    battle: {
      ...game.state.battle!,
      conditions: { 'rival-1': { damageModCombat: 10 }, 'p1-fx': { selfBoost: 10 } },
    },
  }
  const used = ok(run(seeded, { type: 'Attack', attackId: 'absorber' }, game.ctx))
  expect(used.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 20, cause: 'drainNow' })

  const rePoison = fxBattle({
    playerCard: fxCard('fx-veneno3', [fx('tizona', [{ op: 'poison', amount: 10 }], { base: 0 })]),
    rng: rngOf(6),
  })
  const seededPoison: GameState = {
    ...rePoison.state,
    battle: { ...rePoison.state.battle!, conditions: { 'rival-1': { poison: 10, damageModCombat: 10 } } },
  }
  const poisoned = ok(run(seededPoison, { type: 'Advance' }, rePoison.ctx))
  expect(poisoned.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 10, cause: 'poison' })
})

// AC: SPEC-C/T-021/AC-5 — rollGate nuevo reemplaza al anterior (D-03).
test('AC-5 rollGate nuevo reemplaza al anterior: la cara del viejo ya no bloquea', () => {
  const game = fxBattle({
    playerCard: fxCard('fx-golpeador4', [fx('golpe', [], { base: 10 })]),
    rng: rngOf(1, 6, 1, 6, 3),
  })
  const withOld: GameState = {
    ...game.state,
    battle: {
      ...game.state.battle!,
      conditions: { 'p1-fx': { rollGate: { failFaces: [1, 2], outcome: 'noAttack', duration: 'combat' } } },
    },
  }
  const gated = ok(run(withOld, { type: 'Attack', attackId: 'golpe' }, game.ctx)) // gate 1 ⇒ bloqueado
  expect(gated.value.events).toContainEqual({ type: 'NoAttack', attacker: 'p1-fx', reason: 'gate' })
  const rival1 = ok(run(gated.value.state, { type: 'Advance' }, game.ctx)) // rival 6 ⇒ no ataca
  const replaced: GameState = {
    ...rival1.value.state,
    battle: {
      ...rival1.value.state.battle!,
      conditions: {
        'p1-fx': { rollGate: { failFaces: [3, 4], outcome: 'selfHit', duration: 'combat' } }, // nuevo (D-03)
      },
    },
  }
  // La cara 1 del viejo ya no bloquea: pasa el gate y golpea al rival.
  const pass = ok(run(replaced, { type: 'Attack', attackId: 'golpe' }, game.ctx))
  expect(pass.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 10, cause: 'attack' })
  const rival2 = ok(run(pass.value.state, { type: 'Advance' }, game.ctx)) // rival 6
  // La cara 3 del nuevo ⇒ selfHit.
  const self = ok(run(rival2.value.state, { type: 'Attack', attackId: 'golpe' }, game.ctx))
  expect(self.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'p1-fx', amount: 10, cause: 'attack' })
})

// AC: SPEC-C/T-021/AC-5 — selfHit aplica el ataque al propio atacante, con sus efectos, sin habilidades.
test('AC-5 selfHit: daño completo a sí mismo, con efectos, sin pasivas del defensor', () => {
  // El atacante tiene BARRERA (-10 pasivo): el auto-ataque NO la usa ("sin habilidades").
  const card = fxCard(
    'fx-confundido',
    [fx('golpe_veneno', [{ op: 'poison', amount: 10 }], { base: 20 })],
    [{ op: 'flatReduction', amount: 10 }],
  )
  const game = fxBattle({ playerCard: card, rng: rngOf(2) })
  const seeded: GameState = {
    ...game.state,
    battle: {
      ...game.state.battle!,
      conditions: { 'p1-fx': { rollGate: { failFaces: [1, 2, 3], outcome: 'selfHit', duration: 'combat' } } },
    },
  }
  const self = ok(run(seeded, { type: 'Attack', attackId: 'golpe_veneno' }, game.ctx))
  expect(self.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'p1-fx', amount: 20, cause: 'attack' }) // sin BARRERA
  expect(self.value.state.battle?.conditions['p1-fx']?.poison).toBe(10) // con sus efectos
})

// AC: SPEC-C/T-021/AC-6 — custom sin handler registrado ⇒ UnsupportedEffect y el ataque resuelve.
test('AC-6 custom sin handler: UnsupportedEffect y el ataque se resuelve sin ese efecto', () => {
  const game = fxBattle({
    playerCard: fxCard('fx-misterio', [
      fx('misterio', [{ op: 'custom', handler: 'TODO_niebla', rawText: 'niebla rara (ER pendiente)' }], { base: 10 }),
    ]),
  })
  const used = ok(run(game.state, { type: 'Attack', attackId: 'misterio' }, game.ctx))
  expect(used.value.events).toContainEqual({ type: 'UnsupportedEffect', handler: 'TODO_niebla', attackId: 'misterio' })
  expect(used.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 10, cause: 'attack' })
  expect(used.value.state.battle?.rival[0]?.damage).toBe(10)
})

// AC: SPEC-C/T-021/AC-6 — un handler registrado sí corre (mecánica de ER aprobados).
test('AC-6 custom con handler registrado: se aplica y no emite UnsupportedEffect', () => {
  registerCustomEffectHandler('t021-furia', ({ battle, attackerUid }) => {
    battle.conditions[attackerUid] = { ...battle.conditions[attackerUid], selfBoost: 7 }
    return []
  })
  const game = fxBattle({
    playerCard: fxCard('fx-furia', [fx('furia', [{ op: 'custom', handler: 't021-furia' }], { base: 10 })]),
  })
  const used = ok(run(game.state, { type: 'Attack', attackId: 'furia' }, game.ctx))
  expect(used.value.events).not.toContainEqual({ type: 'UnsupportedEffect', handler: 't021-furia', attackId: 'furia' })
  expect(used.value.state.battle?.conditions['p1-fx']?.selfBoost).toBe(7)
})

// Guarda (sin AC): primitivas del set 2 tampoco rompen el motor.
test('guarda: rest/transform/disableRandomAttack emiten UnsupportedEffect y el ataque resuelve', () => {
  const card = fxCard('fx-set2', [
    fx('siesta', [
      { op: 'rest', wakeFaces: [5, 6] },
      { op: 'transform' },
      { op: 'disableRandomAttack', max: 1 },
    ], { base: 10 }),
  ])
  const game = fxBattle({ playerCard: card })
  const used = ok(run(game.state, { type: 'Attack', attackId: 'siesta' }, game.ctx))
  const unsupported = used.value.events.filter(
    (event: GameEvent): event is Extract<GameEvent, { type: 'UnsupportedEffect' }> => event.type === 'UnsupportedEffect',
  )
  expect(unsupported.map((event) => event.handler).sort()).toEqual(['disableRandomAttack', 'rest', 'transform'])
  expect(used.value.state.battle?.rival[0]?.damage).toBe(10)
})
