// Modelo de presentación de combate (SPEC-D/T-032a): funciones puras que traducen
// estado del motor a filas/etiquetas/íconos. Reusa la legalidad del motor (ADR-1:
// la UI nunca decide reglas; `legalAttacks`/`canUse` son la única fuente).
import type { Element, Face, Faces } from '@liga/content'
import { canUse, legalAttacks, type Attack, type PokemonCard, type PkmConditions, type PkmInstance } from '@liga/engine'

/** Por qué un ataque está apagado en la carta propia (AC-4). */
export type AttackIllegality = 'cost' | 'firstTurn'

export interface AttackRowState {
  readonly attack: Attack
  readonly legal: boolean
  readonly reason: AttackIllegality | null
}

/**
 * Filas de ataque de la carta propia: cada una con su estado. La legalidad la
 * decide el motor (`legalAttacks`: costos + regla de primer ataque, RULES §3/§4);
 * acá solo derivamos el motivo para mostrarlo apagado.
 */
export function attackRows(
  card: PokemonCard,
  pkm: PkmInstance,
  firstTurn: boolean,
): readonly AttackRowState[] {
  const legalIds = new Set(legalAttacks(card, pkm, firstTurn).map((attack) => attack.id))
  return card.attacks.map((attack) => {
    const legal = legalIds.has(attack.id)
    if (legal) return { attack, legal, reason: null }
    // Pagadero pero bloqueado por la regla de primer turno; si no, falta equipo.
    const reason: AttackIllegality = canUse(pkm, attack) ? 'firstTurn' : 'cost'
    return { attack, legal: false, reason }
  })
}

/** El dado `attackSelect` del rival elige el ataque por `rollFaces` (AC-5); null ⇒ no ataca. */
export function attackForDie(card: PokemonCard, value: Face): Attack | null {
  return card.attacks.find((attack) => attack.rollFaces.includes(value)) ?? null
}

/** "4-5" / "1-2-3" (prefijo de dado de la fila, RULES §3). */
export function facesLabel(faces: Faces): string {
  return faces.join('-')
}

/** "(10) 4-5-6 (20)" según `ifRoll` (AC-3). rediseno-combate-max/AC-3: con
 * daño base 0 y sin ifRoll NO se muestra "(0)"; con base 0 e ifRoll solo va
 * la parte del dado ("4-5-6 (20)"). */
export function damageLabel(attack: Attack): string {
  const bonus =
    attack.damage.ifRoll === undefined
      ? ''
      : `${facesLabel(attack.damage.ifRoll.faces)} (${attack.damage.ifRoll.damage})`
  if (attack.damage.base === 0) return bonus
  return bonus.length === 0 ? `(${attack.damage.base})` : `(${attack.damage.base}) ${bonus}`
}

/** rediseno-combate-max/AC-6: por qué falta el costo de un ataque ilegal,
 * estilo "Faltan 2 Normal" (null si el costo alcanza; espeja canUse). */
export function missingCostLabel(
  pkm: PkmInstance,
  attack: Attack,
  texts: {
    readonly missing: string
    readonly missingPlural: string
    readonly missingAny: string
    readonly missingAnyPlural: string
    readonly elementNames: Readonly<Record<string, string>>
  },
): string | null {
  const have = (element: Element): number =>
    pkm.equipped.filter((card) => card.element === element).length +
    pkm.multicolor.filter((assigned) => assigned === element).length
  for (const slot of new Set(attack.cost.filter((cost) => cost !== 'any'))) {
    const required = attack.cost.filter((cost) => cost === slot).length
    const short = required - have(slot)
    if (short > 0) {
      const element = texts.elementNames[slot] ?? slot
      return (short === 1 ? texts.missing : texts.missingPlural)
        .replace('{n}', String(short))
        .replace('{element}', element)
    }
  }
  const total = pkm.equipped.length + pkm.multicolor.length
  const shortTotal = attack.cost.length - total
  if (shortTotal > 0) {
    return (shortTotal === 1 ? texts.missingAny : texts.missingAnyPlural).replace(
      '{n}',
      String(shortTotal),
    )
  }
  return null
}

/** Íconos de estado de la placa (AC-6; visibilidad completa: confundido, drenado, buff). */
export type StatusKind = 'sleep' | 'poison' | 'confused' | 'noAttack' | 'drain' | 'shield' | 'boost'

export interface StatusView {
  readonly kind: StatusKind
  readonly text?: string
}

export function statusViews(conditions: PkmConditions | undefined): readonly StatusView[] {
  if (conditions === undefined) return []
  const views: StatusView[] = []
  if (conditions.asleep !== undefined) views.push({ kind: 'sleep' })
  if (conditions.poison !== undefined) views.push({ kind: 'poison' })
  if (conditions.rollGate?.outcome === 'selfHit') views.push({ kind: 'confused' })
  if (conditions.rollGate?.outcome === 'noAttack' || conditions.skipNextAttack === true) {
    views.push({ kind: 'noAttack' })
  }
  if (conditions.drain !== undefined) views.push({ kind: 'drain' })
  if (conditions.damageModCombat !== undefined) {
    views.push({ kind: 'shield', text: `(-${conditions.damageModCombat})` })
  }
  if (conditions.selfBoost !== undefined) {
    views.push({ kind: 'boost', text: `(+${conditions.selfBoost})` })
  }
  return views
}
