// AC: visibilidad-estados-combate/AC-1..AC-4, AC-7 — todo efecto que setea una
// condición se anuncia (ConditionApplied), el auto-golpe y el no-ataque por gate
// se explican (SelfHit, NoAttack.cause/value) y la expiración nextTurn se anuncia
// (ConditionCleared). Los eventos no cambian la resolución de combate (AC-7).
import { expect, test } from 'vitest'
import type { GameEvent, GameState } from '../packages/engine/src/index.ts'
import { applyCommand } from '../packages/engine/src/index.ts'
import { rngOf, run } from './t020-helpers.ts'
import { fx, fxBattle, fxCard } from './t021-helpers.ts'

interface RunOk {
  readonly events: readonly GameEvent[]
  readonly state: GameState
}

const ok = (result: { ok: boolean; value?: RunOk; error?: { message: string } }): RunOk => {
  if (!result.ok || result.value === undefined) throw new Error(result.error?.message ?? 'falló')
  return result.value
}

const attack = (game: { state: GameState; ctx: Parameters<typeof applyCommand>[2] }, id: string) =>
  ok(applyCommand(game.state, { type: 'Attack', attackId: id }, game.ctx))

// AC: visibilidad-estados-combate/AC-1 — cada slot que antes se seteaba en
// silencio ahora emite ConditionApplied con su condición descriptiva.
test('AC-1 ConditionApplied: selfBoost, weakened, shield, skip, confused, noAttackGate, drain y dodge', () => {
  // selfBoost (Enfoque): sobre el propio atacante.
  const boost = attack(
    fxBattle({ playerCard: fxCard('vc-enfoque', [fx('enfoque', [{ op: 'selfBoost', amount: 10, max: 1 }], { base: 0 })]), rng: rngOf(6) }),
    'enfoque',
  )
  expect(boost.events).toContainEqual({ type: 'ConditionApplied', pkmUid: 'p1-fx', condition: 'selfBoost' })

  // modifyRivalDamage nextTurn (Burbujas) y combat (Gruñido): 'weakened' sobre la víctima.
  const bubbled = attack(
    fxBattle({ playerCard: fxCard('vc-burbujas', [fx('burbujas', [{ op: 'modifyRivalDamage', amount: -10, duration: 'nextTurn' }], { base: 10 })]), rng: rngOf(6) }),
    'burbujas',
  )
  expect(bubbled.events).toContainEqual({ type: 'ConditionApplied', pkmUid: 'rival-1', condition: 'weakened' })
  const growled = attack(
    fxBattle({ playerCard: fxCard('vc-grunido', [fx('grunido', [{ op: 'modifyRivalDamage', amount: -10, duration: 'combat' }], { base: 0 })]), rng: rngOf(6) }),
    'grunido',
  )
  expect(growled.events).toContainEqual({ type: 'ConditionApplied', pkmUid: 'rival-1', condition: 'weakened' })

  // flatReduction (Refugio): 'shield' sobre quien lo usa.
  const shielded = attack(
    fxBattle({ playerCard: fxCard('vc-refugio', [fx('refugio', [{ op: 'flatReduction', amount: 10 }], { base: 0 })]), rng: rngOf(6) }),
    'refugio',
  )
  expect(shielded.events).toContainEqual({ type: 'ConditionApplied', pkmUid: 'p1-fx', condition: 'shield' })

  // rivalSkipsAttack con faces (Lianas): 'skip' solo si el dado acierta.
  const lianas = fxCard('vc-lianas', [fx('lianas', [{ op: 'rivalSkipsAttack', faces: [5, 6] }], { base: 10 })])
  const skipped = attack(fxBattle({ playerCard: lianas, rng: rngOf(5, 6) }), 'lianas') // efecto 5 ⇒ aplica; rival no ataca (skip)
  expect(skipped.events).toContainEqual({ type: 'ConditionApplied', pkmUid: 'rival-1', condition: 'skip' })

  // rollGate: 'confused' (selfHit) o 'noAttackGate' (noAttack), con sus caras.
  const confused = attack(
    fxBattle({ playerCard: fxCard('vc-hipnorayo', [fx('hipnorayo', [{ op: 'rollGate', failFaces: [1, 2, 3], outcome: 'selfHit', duration: 'nextTurn' }], { base: 0 })]), rng: rngOf(6) }),
    'hipnorayo',
  )
  expect(confused.events).toContainEqual({
    type: 'ConditionApplied', pkmUid: 'rival-1', condition: 'confused', faces: [1, 2, 3],
  })
  const gated = attack(
    fxBattle({ playerCard: fxCard('vc-trueno', [fx('impact', [{ op: 'rollGate', failFaces: [1, 2, 3], outcome: 'noAttack', duration: 'nextTurn' }], { base: 0 })]), rng: rngOf(6) }),
    'impact',
  )
  expect(gated.events).toContainEqual({
    type: 'ConditionApplied', pkmUid: 'rival-1', condition: 'noAttackGate', faces: [1, 2, 3],
  })

  // drainEachTurn (Drenadoras) y dodge (Minimizar): sobre víctima y atacante.
  const drained = attack(
    fxBattle({ playerCard: fxCard('vc-drenadoras', [fx('drenadoras', [{ op: 'drainEachTurn', amount: 10 }], { base: 0 })]), rng: rngOf(6) }),
    'drenadoras',
  )
  expect(drained.events).toContainEqual({ type: 'ConditionApplied', pkmUid: 'rival-1', condition: 'drain' })
  const dodged = attack(
    fxBattle({ playerCard: fxCard('vc-minimizar', [fx('minimizar', [{ op: 'dodge', faces: [4, 5, 6] }], { base: 0 })]), rng: rngOf(6) }),
    'minimizar',
  )
  expect(dodged.events).toContainEqual({ type: 'ConditionApplied', pkmUid: 'p1-fx', condition: 'dodge' })
})

// AC: visibilidad-estados-combate/AC-2 — el auto-golpe del gate se anuncia con
// SelfHit (portador de la cara tirada) ANTES del AttackUsed redirigido.
test('AC-2 SelfHit: se emite antes del AttackUsed y lleva la cara del dado de gate', () => {
  const game = fxBattle({
    playerCard: fxCard('vc-hipnorayo2', [fx('hipnorayo', [{ op: 'rollGate', failFaces: [1, 2, 3], outcome: 'selfHit', duration: 'nextTurn' }], { base: 0 })]),
    rng: rngOf(4, 2), // rival: attackSelect 4 (Burbujas) → gate 2 ⇒ se auto-ataca
  })
  const used = attack(game, 'hipnorayo')
  expect(used.events).toContainEqual({ type: 'SelfHit', attacker: 'rival-1', value: 2 })
  const selfHitAt = used.events.findIndex((event) => event.type === 'SelfHit')
  const attackAt = used.events.findIndex((event) => event.type === 'AttackUsed' && event.attacker === 'rival-1')
  expect(selfHitAt).toBeGreaterThanOrEqual(0)
  expect(attackAt).toBeGreaterThan(selfHitAt)
})

// AC: visibilidad-estados-combate/AC-3 — NoAttack por gate distingue el origen:
// estado propio del atacante (paralized) vs pasiva del defensor (defended).
test('AC-3 NoAttack.cause: rollGate propio ⇒ paralized; defendGate del rival ⇒ defended', () => {
  // Polvo de esporas: la condición rollGate del propio atacante bloquea.
  const spored = fxBattle({
    playerCard: fxCard('vc-punch', [fx('golpe', [], { base: 10 })]),
    wildCard: 'tangela_erika',
    rng: rngOf(1, 6), // gate 1 ⇒ bloqueado; rival 6 ⇒ no ataca
  })
  const seed: typeof spored.state = {
    ...spored.state,
    battle: {
      ...spored.state.battle!,
      conditions: { 'p1-fx': { rollGate: { failFaces: [1, 2, 3], outcome: 'noAttack', duration: 'combat' } } },
    },
  }
  const blocked = ok(run(seed, { type: 'Attack', attackId: 'golpe' }, spored.ctx))
  expect(blocked.events).toContainEqual({
    type: 'NoAttack', attacker: 'p1-fx', reason: 'gate', cause: 'paralized', value: 1,
  })

  // Doble equipo de Raichu: la especialidad del defensor bloquea.
  const raichu = fxCard('vc-raichu', [fx('chispa', [], { base: 10 })], [
    { op: 'defendGate', failFaces: [3, 4], outcome: 'noAttack' },
  ])
  const defended = fxBattle({
    playerCard: fxCard('vc-golpeador', [fx('golpe', [], { base: 10 })]),
    wildCard: 'vc-raichu',
    extraWildCards: [raichu],
    rng: rngOf(4, 6),
  })
  const stopped = attack(defended, 'golpe')
  expect(stopped.events).toContainEqual({
    type: 'NoAttack', attacker: 'p1-fx', reason: 'gate', cause: 'defended', value: 4,
  })
})

// AC: visibilidad-estados-combate/AC-4 — endSideTurn anuncia el consumo de las
// condiciones nextTurn: weakened (Burbujas), skip (Lianas) y rollGate.
test('AC-4 ConditionCleared: weakened, skip, noAttackGate y confused expiran anunciadas', () => {
  // Burbujas: el rival ataca con el mod y, al cerrar su turno, expira 'weakened'.
  const bubbled = attack(
    fxBattle({ playerCard: fxCard('vc-burbujas2', [fx('burbujas', [{ op: 'modifyRivalDamage', amount: -10, duration: 'nextTurn' }], { base: 10 })]), rng: rngOf(4) }),
    'burbujas',
  )
  expect(bubbled.events).toContainEqual({ type: 'ConditionCleared', pkmUid: 'rival-1', condition: 'weakened' })

  // Lianas: el rival no ataca (skip) y el skip expira al cerrar su turno.
  const skipped = attack(
    fxBattle({ playerCard: fxCard('vc-lianas2', [fx('lianas', [{ op: 'rivalSkipsAttack', faces: [5, 6] }], { base: 10 })]), rng: rngOf(5, 6) }),
    'lianas',
  )
  expect(skipped.events).toContainEqual({ type: 'ConditionCleared', pkmUid: 'rival-1', condition: 'skip' })

  // Impact-trueno: el rival falla su gate y la condición noAttackGate expira.
  const gated = attack(
    fxBattle({ playerCard: fxCard('vc-trueno2', [fx('impact', [{ op: 'rollGate', failFaces: [1, 2, 3], outcome: 'noAttack', duration: 'nextTurn' }], { base: 0 })]), rng: rngOf(4, 2) }),
    'impact',
  )
  expect(gated.events).toContainEqual({ type: 'ConditionCleared', pkmUid: 'rival-1', condition: 'noAttackGate' })

  // Hipno-rayo: el rival se auto-ataca y la confusión expira al cerrar su turno.
  const confused = attack(
    fxBattle({ playerCard: fxCard('vc-hipnorayo3', [fx('hipnorayo', [{ op: 'rollGate', failFaces: [1, 2, 3], outcome: 'selfHit', duration: 'nextTurn' }], { base: 0 })]), rng: rngOf(4, 2) }),
    'hipnorayo',
  )
  expect(confused.events).toContainEqual({ type: 'ConditionCleared', pkmUid: 'rival-1', condition: 'confused' })
})

// AC: visibilidad-estados-combate/AC-7 — los eventos nuevos no cambian la
// resolución: el auto-golpe sigue dañando al atacante y el turno vuelve al jugador.
test('AC-7 regresión: SelfHit no altera el daño ni el flujo de turnos', () => {
  const game = fxBattle({
    playerCard: fxCard('vc-hipnorayo4', [fx('hipnorayo', [{ op: 'rollGate', failFaces: [1, 2, 3], outcome: 'selfHit', duration: 'nextTurn' }], { base: 0 })]),
    rng: rngOf(4, 2),
  })
  const used = attack(game, 'hipnorayo')
  // La resolución es la misma que en T-021: Burbujas (10) se aplica al propio rival.
  expect(used.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 10, cause: 'attack' })
  expect(used.events).not.toContainEqual({ type: 'DamageTaken', pkmUid: 'p1-fx', amount: 10, cause: 'attack' })
  expect(used.state.battle?.rival[0]?.damage).toBe(10)
  expect(used.state.battle?.conditions['rival-1']?.rollGate).toBeUndefined() // nextTurn consumido
})
