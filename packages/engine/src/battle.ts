// Máquina de turnos de batalla (SPEC-C/T-020/§T-021): inicio/fin de turno,
// consumo de duraciones y acción del salvaje. El pipeline de un ataque vive en
// battle-effects.ts; el acceso a estado y daño puro, en battle-core.ts.
import type { Ctx } from './engine.ts'
import { EngineError } from './errors.ts'
import type { Result } from './errors.ts'
import type { GameEvent } from './events.ts'
import {
  afterFaints,
  applyDamage,
  battleOf,
  cardOf,
  findPkm,
  healPkm,
  rollDie,
  type Draft,
} from './battle-core.ts'
import { resolveAttack } from './battle-effects.ts'

// Re-exports: battle-commands.ts e index.ts siguen importando desde acá.
export {
  activePlayer,
  battleOf,
  cardOf,
  cleanConditions,
  computeDamage,
  finalizeVictory,
  flatReductionFor,
  GYM_DEFEATS_TO_LOSE,
  teamPkmOf,
  type DamageInput,
} from './battle-core.ts'
export { resolveAttack } from './battle-effects.ts'
export {
  registerCustomEffectHandler,
  type CustomEffectHandler,
  type CustomEffectInput,
} from './battle-conditions.ts'

// ── Máquina de turno (RULES §4 p.53-57): veneno/drenaje → despertar → acción. ──

export function startSideTurn(
  draft: Draft,
  ctx: Ctx,
  side: 0 | 1,
  events: GameEvent[],
): Result<null, EngineError> {
  const b = battleOf(draft)
  if (!b.ok) return b
  const battle = b.value
  battle.noAttackThisTurn = false
  const uid = battle.active[side]!
  const conditions = battle.conditions[uid]
  // Veneno y Drenadoras, antes de todo (RULES §4, p.73).
  if (conditions?.poison !== undefined) {
    const hit = applyDamage(draft, ctx.content, uid, conditions.poison, 'poison', events)
    if (!hit.ok) return hit
  }
  if (conditions?.drain !== undefined) {
    const hit = applyDamage(draft, ctx.content, uid, conditions.drain, 'drain', events)
    if (!hit.ok) return hit
    const healed = healPkm(draft, ctx.content, battle.active[1 - side]!, conditions.drain, 'drain', events)
    if (!healed.ok) return healed
  }
  const ref = findPkm(draft, uid)
  if (!ref.ok) return ref
  if (ref.value.pkm.fainted) return afterFaints(draft, events)
  // Dormido: tirar para despertar (wakeFaces de la condición, 5-6 en la práctica).
  if (conditions?.asleep !== undefined) {
    const value = rollDie(draft, ctx, 'wake', events)
    if (conditions.asleep.wakeFaces.includes(value)) {
      delete conditions.asleep
      events.push({ type: 'WokeUp', pkmUid: uid })
    } else {
      battle.noAttackThisTurn = true
    }
  }
  return { ok: true, value: null }
}

/** Fin del turno de `side`: consume lo que dura "un turno" y el flag de primer turno. */
export function endSideTurn(draft: Draft, side: 0 | 1): void {
  const battle = draft.battle
  if (battle === null) return
  const uid = battle.active[side]!
  const conditions = battle.conditions[uid]
  if (conditions !== undefined) {
    delete conditions.rivalDamageMod // nextTurn: solo el próximo ataque (Burbujas)
    delete conditions.skipNextAttack // Lianas: cubre este turno
    if (conditions.rollGate !== undefined && conditions.rollGate.duration === 'nextTurn') {
      delete conditions.rollGate // Impact-trueno: cubre este turno (EFFECTS §3)
    }
  }
  // El dodge del defensor cubría exactamente este turno del atacante (Minimizar).
  const defenderConditions = battle.conditions[battle.active[1 - side]!]
  if (defenderConditions !== undefined) delete defenderConditions.dodge
  battle.firstTurn = battle.firstTurn.filter((u) => u !== uid)
  battle.noAttackThisTurn = false
}

/** Acción del lado salvaje/gimnasio (AC-3): dado attackSelect sobre rollFaces. */
export function rivalAction(draft: Draft, ctx: Ctx, events: GameEvent[]): Result<null, EngineError> {
  const battleResult = battleOf(draft)
  if (!battleResult.ok) return battleResult
  const battle = battleResult.value
  const uid = battle.active[1]!
  if (battle.noAttackThisTurn) {
    events.push({ type: 'NoAttack', attacker: uid, reason: 'asleep' })
    return { ok: true, value: null }
  }
  if (battle.conditions[uid]?.skipNextAttack === true) {
    events.push({ type: 'NoAttack', attacker: uid, reason: 'skip' })
    return { ok: true, value: null }
  }
  const ref = findPkm(draft, uid)
  if (!ref.ok) return ref
  const card = cardOf(ctx.content, ref.value.cardId)
  if (!card.ok) return card
  const value = rollDie(draft, ctx, 'attackSelect', events)
  const attack = card.value.attacks.find((a) => a.rollFaces.includes(value))
  if (attack === undefined) {
    events.push({ type: 'NoAttack', attacker: uid, reason: 'attackSelect' })
    return { ok: true, value: null }
  }
  return resolveAttack(draft, ctx, 1, attack, events)
}
