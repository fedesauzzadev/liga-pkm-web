// Modelo puro de pestañas y acciones de combate (rediseno-combate-max/AC-6):
// mapea los comandos legales del motor (ADR-1: la UI nunca decide reglas) a
// las opciones de las pestañas Atacar/Cambiar/Mochila/Dejar ir, con el motivo
// cuando algo no se puede usar ("Faltan 2 Normal", "Debilitado", …).
import type { PkmUid } from '@liga/content'
import type { Command } from '@liga/engine'
import type { Attack } from '@liga/content'
import { es } from '../i18n/es'
import { missingCostLabel, type AttackRowState } from './model'
import type { PkmInstance } from '@liga/engine'

export type BattleTab = 'attack' | 'switch' | 'bag' | 'release'

export const BATTLE_TABS: readonly {
  readonly id: BattleTab
  readonly label: string
  readonly testid: string
}[] = [
  { id: 'attack', label: es.battleTabAttack, testid: 'tab-attack' },
  { id: 'switch', label: es.battleTabSwitch, testid: 'tab-switch' },
  { id: 'bag', label: es.battleTabBag, testid: 'tab-bag' },
  { id: 'release', label: es.battleTabRelease, testid: 'tab-release' },
]

/** Botón de ataque de la pestaña Atacar (siempre 4 slots; vacío = disabled). */
export interface AttackOption {
  /** 1..4, mismo orden que la carta. */
  readonly slot: number
  readonly testid: string
  readonly attack: Attack | null
  readonly legal: boolean
  readonly reason: string | null
}

/** 4 slots fijos: mismo orden que la carta; lugares sin ataque vacíos. */
export function attackOptions(rows: readonly AttackRowState[], pkm: PkmInstance): readonly AttackOption[] {
  const options: AttackOption[] = []
  for (let slot = 1; slot <= 4; slot += 1) {
    const row = rows[slot - 1]
    if (row === undefined) {
      options.push({ slot, testid: `btn-attack-${String(slot)}`, attack: null, legal: false, reason: null })
      continue
    }
    const legal = row.legal
    const reason = legal
      ? null
      : row.reason === 'firstTurn'
        ? es.battleReasonFirstTurn
        : missingCostLabel(pkm, row.attack, {
            missing: es.modalMissingCost,
            missingPlural: es.modalMissingCostPlural,
            missingAny: es.modalMissingCostAny,
            missingAnyPlural: es.modalMissingCostAnyPlural,
            elementNames: es.elementNames,
          }) ?? es.battleReasonCost
    options.push({ slot, testid: `btn-attack-${String(slot)}`, attack: row.attack, legal, reason })
  }
  return options
}

/** PKM del equipo para la pestaña Cambiar. */
export interface SwitchOption {
  readonly uid: PkmUid
  readonly testid: string
  readonly name: string
  readonly hp: string
  readonly fainted: boolean
  readonly legal: boolean
  readonly reason: string | null
}

export interface TeamPkmView {
  readonly uid: PkmUid
  readonly name: string
  readonly hpMax: number
  readonly damage: number
  readonly fainted: boolean
}

/** Banca que no está en juego; debilitados deshabilitados con "Debilitado".
 * reemplazo-tras-desmayo/AC-2: el motor ofrece `SendOut` (no `Retire`) mientras
 * dure el `ChooseReplacement` pendiente; ambos destinos cuentan como legales. */
export function switchOptions(
  team: readonly TeamPkmView[],
  activeUid: string | null,
  legal: readonly Command[],
): readonly SwitchOption[] {
  const retireTargets = new Set(legal.filter((command) => command.type === 'Retire').map((command) => command.to))
  const sendOutTargets = new Set(
    legal.filter((command) => command.type === 'SendOut').map((command) => command.pkmUid),
  )
  return team
    .filter((pkm) => pkm.uid !== activeUid)
    .map((pkm) => ({
      uid: pkm.uid,
      testid: `btn-switch-${pkm.uid}`,
      name: pkm.name,
      hp: `${String(Math.max(0, pkm.hpMax - pkm.damage))}/${String(pkm.hpMax)}`,
      fainted: pkm.fainted,
      legal: !pkm.fainted && (retireTargets.has(pkm.uid) || sendOutTargets.has(pkm.uid)),
      reason: pkm.fainted ? es.battleSwitchFainted : null,
    }))
}

/** Ítem de la pestaña Mochila: lo usable ahora + motivos si no. */
export interface BagOption {
  readonly id: 'potion' | 'super_potion' | 'ultraball' | 'masterball'
  readonly testid: string
  readonly label: string
  readonly count: number
  readonly description: string
  readonly legal: boolean
  readonly reason: string | null
  readonly command: Command | null
}

export interface BagContext {
  readonly items: {
    readonly potion: number
    readonly super_potion: number
    readonly ultraball: number
    readonly masterball: number
  }
  readonly legal: readonly Command[]
  readonly battleKind: 'wild' | 'gym' | null
  readonly rivalRemainingHp: number | null
  readonly activeDamaged: boolean
  readonly capture: Readonly<
    Record<
      'ultraball' | 'masterball',
      { readonly maxRemainingHp?: number | undefined; readonly timing: string }
    >
  >
}

const commandForItem = (
  legal: readonly Command[],
  match: (command: Command) => boolean,
): Command | null => legal.find(match) ?? null

/** Poción, Super Poción y bolas legales; no usables deshabilitados con motivo. */
export function bagOptions(ctx: BagContext): readonly BagOption[] {
  const options: BagOption[] = []
  const potions: readonly {
    readonly id: 'potion' | 'super_potion'
    readonly label: string
    readonly description: string
  }[] = [
    { id: 'potion', label: es.battlePotion, description: es.backpackDetailPotion },
    { id: 'super_potion', label: es.tileItemNames.super_potion, description: es.backpackDetailPotion },
  ]
  for (const potion of potions) {
    const count = ctx.items[potion.id]
    if (count <= 0) continue
    const command = commandForItem(
      ctx.legal,
      (candidate) => candidate.type === 'UsePotion' && (candidate.item ?? 'potion') === potion.id,
    )
    options.push({
      id: potion.id,
      testid: `btn-item-${potion.id}`,
      label: potion.label,
      count,
      description: potion.description,
      legal: command !== null,
      reason: command === null && !ctx.activeDamaged ? es.backpackReasons['no-damage'] : null,
      command,
    })
  }
  for (const ball of ['ultraball', 'masterball'] as const) {
    const count = ctx.items[ball]
    if (count <= 0) continue
    const command = commandForItem(
      ctx.legal,
      (candidate) => candidate.type === 'ThrowBall' && candidate.ball === ball,
    )
    const rule = ctx.capture[ball]
    const hpTooHigh =
      rule.maxRemainingHp !== undefined &&
      ctx.rivalRemainingHp !== null &&
      ctx.rivalRemainingHp > rule.maxRemainingHp
    options.push({
      id: ball,
      testid: `btn-item-${ball}`,
      label: es.tileItemNames[ball],
      count,
      description: es.backpackDetailBall,
      legal: command !== null,
      reason:
        command === null
          ? ctx.battleKind === 'gym'
            ? es.backpackReasons['ball-gym']
            : hpTooHigh
              ? es.backpackReasons['ball-hp']
              : es.backpackReasons['ball-timing']
          : null,
      command,
    })
  }
  return options
}

/** Texto del recuadro de efecto según la selección (AC-5/AC-6). */
export function effectTextOf(selection: Selection | null, texts: {
  readonly attackEffect: (attackId: string) => string | null
  readonly itemDescription: (id: BagOption['id']) => string | null
}): string | null {
  if (selection === null) return null
  if (selection.kind === 'attack') return texts.attackEffect(selection.attackId)
  if (selection.kind === 'item') return texts.itemDescription(selection.id)
  return null
}

/** Selección actual del panel de acciones (qué espera "Aceptar"). */
export type Selection =
  | { readonly kind: 'attack'; readonly attackId: string }
  | { readonly kind: 'switch'; readonly uid: PkmUid }
  | { readonly kind: 'item'; readonly id: BagOption['id'] }
  | { readonly kind: 'release' }

/** Comando que "Aceptar" debe despachar para la selección (null = nada). */
export function commandOfSelection(
  selection: Selection | null,
  legal: readonly Command[],
): Command | null {
  if (selection === null) return null
  if (selection.kind === 'attack') {
    return legal.find((command) => command.type === 'Attack' && command.attackId === selection.attackId) ?? null
  }
  if (selection.kind === 'switch') {
    // reemplazo-tras-desmayo/AC-2: con reemplazo pendiente no hay Retire
    // correspondiente ⇒ se despacha el SendOut del elegido.
    return (
      legal.find((command) => command.type === 'Retire' && command.to === selection.uid) ??
      legal.find((command) => command.type === 'SendOut' && command.pkmUid === selection.uid) ??
      null
    )
  }
  if (selection.kind === 'item') {
    return (
      legal.find(
        (command) =>
          (command.type === 'UsePotion' && (command.item ?? 'potion') === selection.id) ||
          (command.type === 'ThrowBall' && command.ball === selection.id),
      ) ?? null
    )
  }
  return legal.find((command) => command.type === 'Release') ?? null
}
