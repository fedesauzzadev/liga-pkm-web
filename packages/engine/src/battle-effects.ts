// Primitivas de efectos (SPEC-C/T-021): pasos 2-7 del pipeline de EFFECTS §2 —
// gate (tirada única), dodge, dado de efecto, encadenados y resolución del
// ataque. La aplicación de condiciones vive en battle-conditions.ts; el daño
// puro y el acceso a estado, en battle-core.ts.
import type { Attack, Face, Faces, PokemonCard } from '@liga/content'
import { EngineError } from './errors.ts'
import type { Result } from './errors.ts'
import type { GameEvent, NoAttackCause } from './events.ts'
import type { Ctx } from './engine.ts'
import {
  afterFaints,
  applyDamage,
  battleOf,
  cardOf,
  computeDamage,
  findPkm,
  flatReductionFor,
  illegal,
  rollDie,
  setCondition,
  type Draft,
} from './battle-core.ts'
import { applyAttackEffects } from './battle-conditions.ts'

export type GateOutcome = 'pass' | 'noAttack' | 'selfHit'

// ── Paso 2: gate — UNA sola tirada con el slot del atacante + defendGate del defensor (D-03). ──

interface GateSource {
  readonly faces: Faces
  readonly outcome: 'noAttack' | 'selfHit'
  /** 'condition': estado del atacante (rollGate); 'specialty': pasiva del defensor. */
  readonly origin: 'condition' | 'specialty'
}

function gateSources(draft: Draft, side: 0 | 1, defenderCard: PokemonCard): readonly GateSource[] {
  const battle = draft.battle
  if (battle === null) return []
  const slot = battle.conditions[battle.active[side]!]?.rollGate
  const sources: GateSource[] = []
  if (slot !== undefined) {
    sources.push({ faces: slot.failFaces, outcome: slot.outcome, origin: 'condition' })
  }
  for (const specialty of defenderCard.specialties) {
    if (specialty.op === 'defendGate') {
      sources.push({ faces: specialty.failFaces, outcome: specialty.outcome, origin: 'specialty' })
    }
  }
  return sources
}

/** Resultado del gate para el evento NoAttack (AC-3): origen del bloqueo. */
const gateCause = (sources: readonly GateSource[], value: Face): NoAttackCause =>
  sources.some((source) => source.origin === 'condition' && source.faces.includes(value))
    ? 'paralized'
    : 'defended'

export interface GateCheck {
  readonly outcome: GateOutcome
  /** Cara tirada (presente salvo que no hubiera gate que tirar). */
  readonly value: Face | undefined
  /** Solo con outcome 'noAttack': quién bloqueó el ataque. */
  readonly cause: NoAttackCause | undefined
}

function awaitGate(
  draft: Draft,
  ctx: Ctx,
  side: 0 | 1,
  defenderCard: PokemonCard,
  events: GameEvent[],
): Result<GateCheck, EngineError> {
  const sources = gateSources(draft, side, defenderCard)
  if (sources.length === 0) {
    return { ok: true, value: { outcome: 'pass', value: undefined, cause: undefined } }
  }
  const value = rollDie(draft, ctx, 'gate', events)
  // D-03: si una cara cae en noAttack y selfHit, gana selfHit.
  if (sources.some((source) => source.outcome === 'selfHit' && source.faces.includes(value))) {
    return { ok: true, value: { outcome: 'selfHit', value, cause: undefined } }
  }
  if (sources.some((source) => source.faces.includes(value))) {
    return { ok: true, value: { outcome: 'noAttack', value, cause: gateCause(sources, value) } }
  }
  return { ok: true, value: { outcome: 'pass', value, cause: undefined } }
}

// ── Paso 3: dodge — condición (Minimizar, prevalece lo más reciente) o especialidad. ──

function dodgeCheck(
  draft: Draft,
  ctx: Ctx,
  side: 0 | 1,
  defenderCard: PokemonCard,
  events: GameEvent[],
): Result<boolean, EngineError> {
  const battle = draft.battle
  if (battle === null) return illegal('no hay batalla activa')
  const attackerUid = battle.active[side]!
  const defenderUid = battle.active[1 - side]!
  const condition = battle.conditions[defenderUid]?.dodge
  const specialty = defenderCard.specialties.find((effect) => effect.op === 'dodge')
  const faces: Faces | undefined = condition?.faces ?? specialty?.faces
  if (faces === undefined) return { ok: true, value: false }
  const value = rollDie(draft, ctx, 'dodge', events)
  if (!faces.includes(value)) return { ok: true, value: false }
  if (condition !== undefined) {
    // La condición se gasta al esquivar; la especialidad persiste (p.78-80).
    setCondition(draft, defenderUid, (conditions) => {
      delete conditions.dodge
    })
  }
  events.push({ type: 'AttackDodged', attacker: attackerUid, defender: defenderUid })
  return { ok: true, value: true }
}

// ── Paso 4: dado de efecto — uno por ataque, solo si algo lo consulta (EFFECTS §2.4). ──

function needsEffectDie(attack: Attack, attackerDamage: number): boolean {
  if (attack.damage.ifRoll !== undefined) return true
  return attack.effects.some((effect) => {
    switch (effect.op) {
      case 'bonusPerSelfDamage':
      case 'attackAgain':
        return true
      case 'quickAttack':
        return attackerDamage > 0 // sin requisito no hay cadena que consultar
      case 'rivalSkipsAttack':
      case 'rivalSleep':
        return effect.faces !== undefined
      case 'bonusPerRoll':
      case 'custom':
      case 'defendGate':
      case 'disableRandomAttack':
      case 'dodge':
      case 'drainEachTurn':
      case 'drainNow':
      case 'fixedRolls': // tira con purpose:'bonus' propio (EFFECTS §2.4)
      case 'flatReduction':
      case 'healSelf':
      case 'modifyRivalDamage':
      case 'nextAttackBonus': // sin dado
      case 'poison':
      case 'rest':
      case 'rollGate':
      case 'selfBoost':
      case 'selfDamage':
      case 'startsFirst':
      case 'transform':
        return false
    }
  })
}

// ── Paso 7: encadenados — repiten desde el daño sin selección ni gate nuevos (EFFECTS §2.7). ──

function chainAttack(
  draft: Draft,
  ctx: Ctx,
  side: 0 | 1,
  attack: Attack,
  effectValue: Face | undefined,
  events: GameEvent[],
): Result<null, EngineError> {
  const battle = draft.battle
  if (battle === null || battle.won || draft.pending !== null) return { ok: true, value: null }
  const attackerUid = battle.active[side]!
  const defenderUid = battle.active[1 - side]!
  const attacker = findPkm(draft, attackerUid)
  const defender = findPkm(draft, defenderUid)
  if (!attacker.ok || !defender.ok) return { ok: true, value: null }
  if (attacker.value.pkm.fainted || defender.value.pkm.fainted) return { ok: true, value: null }
  for (const effect of attack.effects) {
    if (effect.op === 'attackAgain' && effectValue !== undefined && effect.faces.includes(effectValue)) {
      return resolveAttack(draft, ctx, side, attack, events, true)
    }
  }
  for (const effect of attack.effects) {
    if (
      effect.op === 'quickAttack' &&
      attacker.value.pkm.damage > 0 &&
      effectValue !== undefined &&
      effect.faces.includes(effectValue)
    ) {
      const card = cardOf(ctx.content, attacker.value.cardId)
      if (!card.ok) return card
      const next = card.value.attacks.find((candidate) => candidate.id === effect.attackId)
      if (next !== undefined) return resolveAttack(draft, ctx, side, next, events, true)
    }
  }
  return { ok: true, value: null }
}

// ── Resolución de un ataque (EFFECTS §2): gate → dodge → tiradas → daño → efectos → cadenas. ──

/** Cómo se aplica el cuerpo del ataque (auto-ataque y cadenas cambian el camino). */
interface AttackPaths {
  /** uid que recibe el daño del ataque (selfHit ⇒ el propio atacante). */
  readonly victimUid: string
  /** Modificadores del atacante (selfHit no usa los que hablan del "rival"). */
  readonly useAttackerMods: boolean
  /** Especialidades del defensor (selfHit las ignora: "sin habilidades", p.71-72). */
  readonly useSpecialties: boolean
  /** El auto-ataque no encadena (p.71-72); las cadenas normales sí (EFFECTS §2.7). */
  readonly canChain: boolean
}

function rollEffectDie(
  draft: Draft,
  ctx: Ctx,
  attack: Attack,
  attackerDamage: number,
  events: GameEvent[],
): { readonly value: Face | undefined; readonly ifRollDamage: number | undefined } {
  if (!needsEffectDie(attack, attackerDamage)) return { value: undefined, ifRollDamage: undefined }
  const value = rollDie(draft, ctx, 'effect', events)
  const ifRoll = attack.damage.ifRoll
  const ifRollDamage = ifRoll !== undefined && ifRoll.faces.includes(value) ? ifRoll.damage : undefined
  return { value, ifRollDamage }
}

function rollBonus(
  draft: Draft,
  ctx: Ctx,
  side: 0 | 1,
  attack: Attack,
  effectValue: Face | undefined,
  events: GameEvent[],
): Result<number, EngineError> {
  const battle = battleOf(draft)
  if (!battle.ok) return battle
  const attackerRef = findPkm(draft, battle.value.active[side]!)
  if (!attackerRef.ok) return attackerRef
  let bonus = 0
  for (const effect of attack.effects) {
    if (effect.op === 'bonusPerSelfDamage' && effectValue !== undefined && effect.faces.includes(effectValue)) {
      bonus += effect.amount * Math.floor(attackerRef.value.pkm.damage / effect.per)
    }
  }
  for (const effect of attack.effects) {
    if (effect.op !== 'bonusPerRoll') continue
    for (;;) {
      const value = rollDie(draft, ctx, 'bonus', events)
      if (!effect.faces.includes(value)) break
      bonus += effect.amount
    }
  }
  return { ok: true, value: bonus }
}

export function resolveAttack(
  draft: Draft,
  ctx: Ctx,
  side: 0 | 1,
  attack: Attack,
  events: GameEvent[],
  chained = false,
): Result<null, EngineError> {
  const battle = draft.battle
  if (battle === null) return illegal('no hay batalla activa')
  const attackerUid = battle.active[side]!
  const defenderUid = battle.active[1 - side]!

  const defenderRef = findPkm(draft, defenderUid)
  if (!defenderRef.ok) return defenderRef
  const defenderCard = cardOf(ctx.content, defenderRef.value.cardId)
  if (!defenderCard.ok) return defenderCard

  if (!chained) {
    // Paso 2: gate (tirada única; D-03).
    const gate = awaitGate(draft, ctx, side, defenderCard.value, events)
    if (!gate.ok) return gate
    if (gate.value.outcome === 'noAttack') {
      events.push({
        type: 'NoAttack',
        attacker: attackerUid,
        reason: 'gate',
        ...(gate.value.cause !== undefined ? { cause: gate.value.cause } : {}),
        ...(gate.value.value !== undefined ? { value: gate.value.value } : {}),
      })
      return { ok: true, value: null }
    }
    if (gate.value.outcome === 'selfHit' && gate.value.value !== undefined) {
      // p.71-72: el ataque se aplica al propio atacante, con sus efectos, sin habilidades.
      events.push({ type: 'SelfHit', attacker: attackerUid, value: gate.value.value })
      return resolveBody(draft, ctx, side, attack, events, {
        victimUid: attackerUid,
        useAttackerMods: false, // selfBoost/rivalDamageMod hablan del rival: no aplican acá
        useSpecialties: false, // "sin habilidades": las pasivas del defensor no reducen
        canChain: false, // el ataque fue desviado: no encadena
      })
    }
    // Paso 3: dodge.
    const dodged = dodgeCheck(draft, ctx, side, defenderCard.value, events)
    if (!dodged.ok) return dodged
    if (dodged.value) return { ok: true, value: null }
  }

  return resolveBody(draft, ctx, side, attack, events, {
    victimUid: defenderUid,
    useAttackerMods: true,
    useSpecialties: true,
    canChain: true,
  })
}

/** Cuerpo común (pasos 4-8): tiradas, pipeline de daño, efectos, cadenas y derrotas. */
function resolveBody(
  draft: Draft,
  ctx: Ctx,
  side: 0 | 1,
  attack: Attack,
  events: GameEvent[],
  paths: AttackPaths,
): Result<null, EngineError> {
  const battle = draft.battle
  if (battle === null) return illegal('no hay batalla activa')
  const attackerUid = battle.active[side]!
  const attackerRef = findPkm(draft, attackerUid)
  if (!attackerRef.ok) return attackerRef
  events.push({ type: 'AttackUsed', attacker: attackerUid, attackId: attack.id, target: paths.victimUid })

  // Paso 4: dado de efecto (siempre el último de las tiradas del ataque).
  const die = rollEffectDie(draft, ctx, attack, attackerRef.value.pkm.damage, events)

  // Bonus: bonusPerSelfDamage (dado de efecto) y bonusPerRoll (dados propios, purpose 'bonus').
  const bonus = rollBonus(draft, ctx, side, attack, die.value, events)
  if (!bonus.ok) return bonus

  // Paso 5: pipeline exacto (AC-4 de T-020): modificadores del atacante y del defensor.
  const conditions = battle.conditions[attackerUid]
  const rivalMod = conditions === undefined ? 0 : (conditions.rivalDamageMod ?? 0) + (conditions.combatDamageMod ?? 0)
  const victimRef = findPkm(draft, paths.victimUid)
  if (!victimRef.ok) return victimRef
  const victimCard = cardOf(ctx.content, victimRef.value.cardId)
  if (!victimCard.ok) return victimCard
  const damage = computeDamage({
    base: attack.damage.base,
    bonus: bonus.value,
    flatReduction: flatReductionFor(
      victimCard.value,
      battle.conditions[paths.victimUid],
      attack.element,
      { includeSpecialties: paths.useSpecialties },
    ),
    ...(paths.useAttackerMods && conditions?.selfBoost !== undefined ? { selfBoost: conditions.selfBoost } : {}),
    ...(paths.useAttackerMods && rivalMod !== 0 ? { rivalDamageMod: rivalMod } : {}),
    ...(die.ifRollDamage !== undefined ? { ifRollDamage: die.ifRollDamage } : {}),
  })
  const hit = applyDamage(draft, ctx.content, paths.victimUid, damage, 'attack', events)
  if (!hit.ok) return hit

  // Paso 6: aplicar efectos (condiciones, curas y daños directos sin modificadores).
  const applied = applyAttackEffects(draft, ctx, side, attack, die.value, paths.victimUid, events)
  if (!applied.ok) return applied

  // Paso 7: encadenar (attackAgain / quickAttack) mientras la batalla siga abierta.
  if (paths.canChain) {
    const chained = chainAttack(draft, ctx, side, attack, die.value, events)
    if (!chained.ok) return chained
  }

  // Paso 8: FaintCheck y consecuencias.
  return afterFaints(draft, ctx.content, events)
}
