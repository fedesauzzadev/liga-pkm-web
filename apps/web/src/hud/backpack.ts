// Mochila (SPEC-I/T-073): modelo puro de las 5 filas fijas y la resolución de
// drops ítem→destino. La legalidad FINAL la decide el motor (los comandos se
// validan al aplicar); `resolveDrop` es el espejo UI para resaltar destinos y
// anticipar el motivo de un rechazo (ADR-1: la UI nunca decide reglas).
import type { Element } from '@liga/content'
import { ELEMENTS } from '@liga/content'
import type { Command, GameState, PlayerState, PkmInstance, PokemonCard } from '@liga/engine'
import { es } from '../i18n/es'
import { energyTypes } from '../energy/icons'
import type { EnergyIconType } from '../energy/icons'

export type CardOf = (cardId: string) => PokemonCard | undefined

/** Los 13 tipos con carta de energía (normal/dragon no tienen, D-24): destinos del Multicolor. */
export const MULTICOLOR_ELEMENTS: readonly Element[] = energyTypes
  .filter((type) => type.energyCard)
  .map((type) => type.id)

/** Lo que se arrastra/selecciona desde la mochila o un slot (AC-1/AC-4/AC-5). */
export type DragPayload =
  | { readonly kind: 'element'; readonly elementId: string; readonly element: Element }
  | { readonly kind: 'multicolor' }
  | { readonly kind: 'potion'; readonly item: 'potion' | 'super_potion' }
  | { readonly kind: 'ball'; readonly ball: 'pokeball' | 'ultraball' | 'masterball' }
  | { readonly kind: 'oportunidad' }
  | { readonly kind: 'unequip'; readonly pkmUid: string; readonly elementId: string; readonly element: Element }

/** Destinos de drop marcados con `data-drop-target` en el DOM (AC-2). */
export type DropTarget =
  | { readonly kind: 'pkm'; readonly uid: string }
  | { readonly kind: 'rival' }
  | { readonly kind: 'backpack' }
  | { readonly kind: 'none' }

export type BackpackReason =
  | 'organize'
  | 'active-only'
  | 'turn'
  | 'invalid-target'
  | 'button-only'
  | 'ball-wild-only'
  | 'ball-gym'
  | 'ball-timing'
  | 'ball-hp'
  | 'capture-only'
  | 'no-stock'
  | 'no-damage'
  | 'no-target'

export type DropResolution =
  | { readonly ok: true; readonly command: Command }
  | { readonly ok: true; readonly chooseElementFor: string }
  | { readonly ok: false; readonly reason: BackpackReason }

export function backpackReasonText(reason: BackpackReason): string {
  return es.backpackReasons[reason]
}

/** ¿Mismo ítem? (compara la identidad del payload, no la referencia). */
export function samePayload(a: DragPayload, b: DragPayload): boolean {
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'element':
      return a.elementId === (b as { readonly elementId: string }).elementId
    case 'unequip':
      return (
        a.elementId === (b as { readonly elementId: string }).elementId &&
        a.pkmUid === (b as { readonly pkmUid: string }).pkmUid
      )
    case 'potion':
      return a.item === (b as { readonly item: string }).item
    case 'ball':
      return a.ball === (b as { readonly ball: string }).ball
    case 'multicolor':
    case 'oportunidad':
      return true
    default:
      return false
  }
}

export type BackpackRowKey = 'energies' | 'multicolor' | 'potions' | 'balls' | 'special'

export interface BackpackTokenVm {
  readonly key: string
  readonly label: string
  readonly count: number
  readonly icon: EnergyIconType | null
  readonly glyph: string | null
  readonly payload: DragPayload
  readonly hint: string
}

export interface BackpackRowVm {
  readonly key: BackpackRowKey
  readonly label: string
  readonly tokens: readonly BackpackTokenVm[]
}

const ROW_LABELS: Readonly<Record<BackpackRowKey, string>> = {
  energies: es.backpackRowEnergies,
  multicolor: es.backpackRowMulticolor,
  potions: es.backpackRowPotions,
  balls: es.backpackRowBalls,
  special: es.backpackRowSpecial,
}

const token = (
  key: string,
  label: string,
  count: number,
  payload: DragPayload,
  hint: string,
  icon: EnergyIconType | null = null,
  glyph: string | null = null,
): BackpackTokenVm => ({ key, label, count, payload, hint, icon, glyph })

const freeMulticolorOf = (player: PlayerState): number =>
  player.multicolor - player.team.reduce((count, pkm) => count + pkm.multicolor.length, 0)

/** Las 5 filas fijas de la mochila (AC del encabezado del spec §T-073). */
export function backpackRows(player: PlayerState): readonly BackpackRowVm[] {
  const energies: BackpackTokenVm[] = []
  for (const element of ELEMENTS) {
    const cards = player.elements.filter((card) => card.element === element)
    const first = cards[0]
    if (first === undefined) continue
    energies.push(
      token(
        `element_${element}`,
        es.elementNames[element],
        cards.length,
        { kind: 'element', elementId: first.id, element },
        es.backpackDetailElement,
        element,
      ),
    )
  }
  const item = (id: 'potion' | 'super_potion' | 'pokeball' | 'ultraball' | 'masterball' | 'oportunidad'): number =>
    player.items[id]
  return [
    { key: 'energies', label: ROW_LABELS.energies, tokens: energies },
    {
      key: 'multicolor',
      label: ROW_LABELS.multicolor,
      tokens: [
        token('multicolor', es.tileItemNames.multicolor, freeMulticolorOf(player), { kind: 'multicolor' }, es.backpackDetailMulticolor, 'multicolor'),
      ],
    },
    {
      key: 'potions',
      label: ROW_LABELS.potions,
      tokens: [
        token('potion', es.tileItemNames.potion, item('potion'), { kind: 'potion', item: 'potion' }, es.backpackDetailPotion, null, 'Po'),
        token('super_potion', es.tileItemNames.super_potion, item('super_potion'), { kind: 'potion', item: 'super_potion' }, es.backpackDetailPotion, null, 'SP'),
      ],
    },
    {
      key: 'balls',
      label: ROW_LABELS.balls,
      tokens: [
        token('pokeball', es.tileItemNames.pokeball, item('pokeball'), { kind: 'ball', ball: 'pokeball' }, es.backpackDetailBall, null, 'Pk'),
        token('ultraball', es.tileItemNames.ultraball, item('ultraball'), { kind: 'ball', ball: 'ultraball' }, es.backpackDetailBall, null, 'UB'),
        token('masterball', es.tileItemNames.masterball, item('masterball'), { kind: 'ball', ball: 'masterball' }, es.backpackDetailBall, null, 'MB'),
      ],
    },
    {
      key: 'special',
      label: ROW_LABELS.special,
      tokens: [
        token('oportunidad', es.tileItemNames.oportunidad, item('oportunidad'), { kind: 'oportunidad' }, es.backpackDetailOportunidad, null, 'Op'),
      ],
    },
  ]
}

const activeTeam = (state: GameState): readonly PkmInstance[] =>
  state.players.find((player) => player.id === state.activePlayerId)?.team ?? []

const pkmByUid = (state: GameState, uid: string): PkmInstance | undefined =>
  activeTeam(state).find((pkm) => pkm.uid === uid)

const no = (reason: BackpackReason): DropResolution => ({ ok: false, reason })

/**
 * Resuelve un drop (AC-2): qué comando ejecutar o por qué no se puede (AC-3).
 * Multicolor sobre un PKM pide el elemento (selector de 13) antes de comandar.
 */
export function resolveDrop(
  payload: DragPayload,
  target: DropTarget,
  state: GameState,
  cardOf: CardOf,
): DropResolution {
  if (payload.kind === 'oportunidad') return no('button-only')
  if (target.kind === 'none') return no('no-target')

  if (payload.kind === 'unequip') {
    if (target.kind !== 'backpack') return no('invalid-target')
    if (state.phase !== 'organize') return no('organize')
    return { ok: true, command: { type: 'Unequip', pkmUid: payload.pkmUid, elementId: payload.elementId } }
  }

  if (target.kind === 'pkm') {
    const pkm = pkmByUid(state, target.uid)
    if (pkm === undefined) return no('invalid-target')
    switch (payload.kind) {
      case 'element': {
        if (state.phase !== 'organize') return no('organize')
        return { ok: true, command: { type: 'Equip', pkmUid: target.uid, elementId: payload.elementId } }
      }
      case 'multicolor': {
        if (state.phase !== 'organize') return no('organize')
        return { ok: true, chooseElementFor: target.uid }
      }
      case 'potion': {
        if (state.battle !== null) {
          if (state.battle.active[0] !== target.uid) return no('active-only')
          if (state.battle.turnSide !== 0) return no('turn')
        } else {
          if (state.phase !== 'organize') return no('organize')
          if (state.players.find((p) => p.id === state.activePlayerId)?.items[payload.item] === 0) {
            return no('no-stock')
          }
          if (pkm.damage <= 0) return no('no-damage')
        }
        const command: Command =
          payload.item === 'potion'
            ? { type: 'UsePotion', pkmUid: target.uid, target: target.uid }
            : { type: 'UsePotion', pkmUid: target.uid, target: target.uid, item: 'super_potion' }
        return { ok: true, command }
      }
      case 'ball':
        return no('invalid-target')
      default:
        return no('invalid-target')
    }
  }

  if (target.kind === 'rival') {
    if (payload.kind !== 'ball') return no('invalid-target')
    if (payload.ball === 'pokeball') {
      return state.pending?.type === 'CaptureOrRelease'
        ? { ok: true, command: { type: 'Capture' } }
        : no('capture-only')
    }
    const battle = state.battle
    if (battle === null) return no('ball-wild-only')
    if (battle.kind !== 'wild') return no('ball-gym')
    if (battle.turnSide !== 0) return no('ball-timing')
    const owner = state.players.find((p) => p.id === state.activePlayerId)
    if (owner === undefined || owner.items[payload.ball] <= 0) return no('no-stock')
    const ruleset = state.ruleset
    if (ruleset === null) return no('ball-wild-only')
    const rule = ruleset.capture[payload.ball]
    if (rule.timing !== 'duringBattle') return no('ball-timing')
    if (rule.maxRemainingHp !== undefined) {
      const rival = battle.rival[0]
      const card = rival === undefined ? undefined : cardOf(battle.card)
      if (rival !== undefined && card !== undefined && card.hp - rival.damage > rule.maxRemainingHp) {
        return no('ball-hp')
      }
    }
    return { ok: true, command: { type: 'ThrowBall', ball: payload.ball } }
  }

  return no('invalid-target')
}
