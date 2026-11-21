// AC: SPEC-I/T-072/AC-2 — "estado aplicado": el evento ConditionApplied se
// agrega al motor (antes no existía) con test, como pide el spec.
import { expect, test } from 'vitest'
import type { GameEvent } from '../packages/engine/src/index.ts'
import { applyCommand } from '../packages/engine/src/index.ts'
import { rngOf } from './t020-helpers.ts'
import { fx, fxBattle, fxCard } from './t021-helpers.ts'

interface RunOk {
  readonly events: readonly GameEvent[]
}

const ok = (result: { ok: boolean; value?: RunOk; error?: { message: string } }): RunOk => {
  if (!result.ok || result.value === undefined) throw new Error(result.error?.message ?? 'falló')
  return result.value
}

// AC: SPEC-I/T-072/AC-2 — poison sin faces: el estado queda aplicado y se anuncia.
test('AC-2 ConditionApplied: un ataque con poison lo emite tras el AttackUsed', () => {
  const battle = fxBattle({
    playerCard: fxCard('t072-veneno', [fx('tizona', [{ op: 'poison', amount: 10 }], { base: 0 })]),
    rng: rngOf(6), // attackSelect del rival (mismo comando): 6 ⇒ no ataca
  })
  const used = ok(
    applyCommand(battle.state, { type: 'Attack', attackId: 'tizona' }, battle.ctx),
  )
  expect(used.events).toContainEqual({ type: 'ConditionApplied', pkmUid: 'rival-1', condition: 'poison' })
  const attackAt = used.events.findIndex((event) => event.type === 'AttackUsed')
  const poisonAt = used.events.findIndex((event) => event.type === 'ConditionApplied')
  expect(attackAt).toBeGreaterThanOrEqual(0)
  expect(poisonAt).toBeGreaterThan(attackAt)
})

// AC: SPEC-I/T-072/AC-2 — rivalSleep con faces: solo se anuncia si el dado de efecto acierta.
test('AC-2 ConditionApplied: rivalSleep lo emite cuando cae en las caras (y no si falla)', () => {
  const card = fxCard('t072-hipnosis', [
    fx('hipnosis', [{ op: 'rivalSleep', faces: [4, 5, 6], wakeFaces: [5, 6] }], { base: 0 }),
  ])
  const hit = fxBattle({ playerCard: card, rng: rngOf(5, 3) }) // efecto 5 ⇒ duerme; despertar 3 ⇒ sigue dormido
  const slept = ok(applyCommand(hit.state, { type: 'Attack', attackId: 'hipnosis' }, hit.ctx))
  expect(slept.events).toContainEqual({ type: 'ConditionApplied', pkmUid: 'rival-1', condition: 'asleep' })
  expect(slept.events).toContainEqual({ type: 'DieRolled', purpose: 'effect', value: 5 })

  const miss = fxBattle({ playerCard: card, rng: rngOf(2, 6) })
  const awake = ok(applyCommand(miss.state, { type: 'Attack', attackId: 'hipnosis' }, miss.ctx))
  expect(awake.events).not.toContainEqual({ type: 'ConditionApplied', pkmUid: 'rival-1', condition: 'asleep' })
})
