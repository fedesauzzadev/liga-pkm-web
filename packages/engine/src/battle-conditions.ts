// Aplicación de efectos sobre las condiciones de combate (SPEC-C/T-021, EFFECTS
// §2.6): condición nueva reemplaza a la vieja del mismo slot, max:1 no se apila
// (usedMax) y los custom sin handler registrado emiten UnsupportedEffect (AC-6).
import type { Attack, Effect, Face } from '@liga/content'
import { EngineError } from './errors.ts'
import type { Result } from './errors.ts'
import type { Ctx } from './engine.ts'
import type { GameEvent } from './events.ts'
import {
  applyDamage,
  findPkm,
  healPkm,
  illegal,
  markMax,
  setCondition,
  type Battle,
  type Draft,
} from './battle-core.ts'

// ── Efectos custom: registro de handlers aprobados por ER (AC-6). ──

export interface CustomEffectInput {
  readonly battle: Battle
  readonly attackerUid: string
  readonly victimUid: string
  readonly effect: Effect & { readonly op: 'custom' }
}

export type CustomEffectHandler = (input: CustomEffectInput) => GameEvent[]

const customHandlers = new Map<string, CustomEffectHandler>()

export function registerCustomEffectHandler(handler: string, fn: CustomEffectHandler): void {
  customHandlers.set(handler, fn)
}

// ── Paso 6: aplicar efectos. ──

export function applyAttackEffects(
  draft: Draft,
  ctx: Ctx,
  side: 0 | 1,
  attack: Attack,
  effectValue: Face | undefined,
  victimUid: string,
  events: GameEvent[],
): Result<null, EngineError> {
  const battle = draft.battle
  if (battle === null) return illegal('no hay batalla activa')
  const attackerUid = battle.active[side]!
  const victimAlive = (): boolean => {
    const victim = findPkm(draft, victimUid)
    return victim.ok && !victim.value.pkm.fainted
  }
  for (const effect of attack.effects) {
    switch (effect.op) {
      // Resueltos en el pipeline de daño o en las cadenas; nada que aplicar acá.
      case 'bonusPerRoll':
      case 'bonusPerSelfDamage':
      case 'attackAgain':
      case 'quickAttack':
      case 'startsFirst':
      case 'defendGate':
        break
      case 'selfBoost':
        if (effect.max !== 1 || markMax(draft, attackerUid, 'selfBoost')) {
          setCondition(draft, attackerUid, (c) => {
            c.selfBoost = effect.amount
          })
          events.push({ type: 'ConditionApplied', pkmUid: attackerUid, condition: 'selfBoost' })
        }
        break
      case 'modifyRivalDamage':
        if (victimAlive() && (effect.max !== 1 || markMax(draft, victimUid, 'modifyRivalDamage'))) {
          setCondition(draft, victimUid, (c) => {
            if (effect.duration === 'nextTurn') c.rivalDamageMod = effect.amount
            else c.combatDamageMod = effect.amount
          })
          events.push({ type: 'ConditionApplied', pkmUid: victimUid, condition: 'weakened' })
        }
        break
      case 'flatReduction': {
        // Dureza/Refugio/Barrera protegen a quien los usa (target self por defecto, D-15).
        const holder = effect.target === 'rival' ? victimUid : attackerUid
        if (effect.max !== 1 || markMax(draft, holder, 'flatReduction')) {
          setCondition(draft, holder, (c) => {
            c.damageModCombat = effect.amount
          })
          events.push({ type: 'ConditionApplied', pkmUid: holder, condition: 'shield' })
        }
        break
      }
      case 'rivalSkipsAttack':
        if (
          victimAlive() &&
          (effect.faces === undefined || (effectValue !== undefined && effect.faces.includes(effectValue)))
        ) {
          setCondition(draft, victimUid, (c) => {
            c.skipNextAttack = true
          })
          events.push({ type: 'ConditionApplied', pkmUid: victimUid, condition: 'skip' })
        }
        break
      case 'rivalSleep':
        if (
          victimAlive() &&
          (effect.faces === undefined || (effectValue !== undefined && effect.faces.includes(effectValue)))
        ) {
          setCondition(draft, victimUid, (c) => {
            c.asleep = { wakeFaces: [...effect.wakeFaces] }
          })
          events.push({ type: 'ConditionApplied', pkmUid: victimUid, condition: 'asleep' })
        }
        break
      case 'rollGate':
        if (victimAlive()) {
          setCondition(draft, victimUid, (c) => {
            c.rollGate = { failFaces: [...effect.failFaces], outcome: effect.outcome, duration: effect.duration }
          })
          events.push({
            type: 'ConditionApplied',
            pkmUid: victimUid,
            condition: effect.outcome === 'selfHit' ? 'confused' : 'noAttackGate',
            faces: [...effect.failFaces],
          })
        }
        break
      case 'poison': // no acumulable: el valor nuevo reemplaza (RULES §4)
        if (victimAlive()) {
          setCondition(draft, victimUid, (c) => {
            c.poison = effect.amount
          })
          events.push({ type: 'ConditionApplied', pkmUid: victimUid, condition: 'poison' })
        }
        break
      case 'drainEachTurn':
        if (victimAlive()) {
          setCondition(draft, victimUid, (c) => {
            c.drain = effect.amount
          })
          events.push({ type: 'ConditionApplied', pkmUid: victimUid, condition: 'drain' })
        }
        break
      case 'drainNow': // directo, sin modificadores (RULES §4; D-33: selfHit ⇒ daño sin curación)
        {
          const hit = applyDamage(draft, ctx.content, victimUid, effect.amount, 'drainNow', events)
          if (!hit.ok) return hit
          if (victimUid !== attackerUid) {
            const healed = healPkm(draft, ctx.content, attackerUid, effect.amount, 'drainNow', events)
            if (!healed.ok) return healed
          }
        }
        break
      case 'selfDamage': {
        const self = applyDamage(draft, ctx.content, attackerUid, effect.amount, 'selfDamage', events)
        if (!self.ok) return self
        break
      }
      case 'healSelf': {
        const healed = healPkm(draft, ctx.content, attackerUid, effect.amount, 'healSelf', events)
        if (!healed.ok) return healed
        break
      }
      case 'dodge':
        setCondition(draft, attackerUid, (c) => {
          c.dodge = { faces: [...effect.faces] }
        })
        events.push({ type: 'ConditionApplied', pkmUid: attackerUid, condition: 'dodge' })
        break
      case 'custom': {
        const handler = customHandlers.get(effect.handler)
        if (handler === undefined) {
          events.push({ type: 'UnsupportedEffect', handler: effect.handler, attackId: attack.id })
        } else {
          events.push(...handler({ battle, attackerUid, victimUid, effect }))
        }
        break
      }
      // Set 2 (post-MVP) + set de T-002b (fixedRolls/nextAttackBonus esperan su
      // wiring en el pipeline, Q-025): el motor nunca se rompe por una carta que las use.
      case 'rest':
      case 'transform':
      case 'disableRandomAttack':
      case 'fixedRolls':
      case 'nextAttackBonus':
        events.push({ type: 'UnsupportedEffect', handler: effect.op, attackId: attack.id })
        break
    }
  }
  return { ok: true, value: null }
}
