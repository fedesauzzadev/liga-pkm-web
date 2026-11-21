// Modelo de presentación de la ventana de carta (SPEC-R/T-103): funciones puras
// que derivan qué mostrar de `legalCommands` y del estado (ADR-1: la UI nunca
// decide reglas; legality = motor). Geometría AC-3/4/5: medidas de
// content/ui/card-modal.json + obstáculos de layout.json, sin DOM.
import type {
  CardModal,
  Element,
  PxBox,
  UiLayout,
  UiPanel,
} from '@liga/content'
import { boxesOverlap, panelPx } from '@liga/content'
import type {
  Attack,
  BattleState,
  Command,
  ElementCard,
  GameState,
  PkmConditions,
  PkmInstance,
  PlayerState,
  PokemonCard,
} from '@liga/engine'
import { cardOf } from '../game/content'
import { leaderUid } from '../hud/model'
import { energyTypes } from '../energy/icons'

/** De dónde se abrió la ventana (AC-1): slot del equipo, pila de Oak o rival. */
export type CardModalSource = 'team' | 'oak' | 'rival'

export interface CardModalTarget {
  readonly source: CardModalSource
  /** uid del PKM (team/oak); el rival se toma del combate activo. */
  readonly uid?: string
}

/** Por qué está en solo lectura (AC-14); null ⇒ editable. */
export type CardModalNotice = 'spectator' | 'battle' | 'rival' | 'oak' | null

export interface CardModalSpec {
  readonly card: PokemonCard
  readonly pkm: PkmInstance
  readonly active: boolean
  readonly readOnly: boolean
  readonly notice: CardModalNotice
  readonly conditions: PkmConditions | undefined
  /** Cartas de elemento del inventario del dueño (vacías si no es el propio). */
  readonly elements: readonly ElementCard[]
}

const findIn = (pool: readonly PkmInstance[], uid: string): PkmInstance | undefined =>
  pool.find((pkm) => pkm.uid === uid)

/**
 * AC-1/AC-14: props de la ventana para el target pedido. `team` del jugador
 * visto; `oak` de su pila (solo lectura); `rival` del combate activo. null si
 * el uid no está o la carta no existe (el llamador cierra la ventana).
 */
export function cardModalSpec(
  state: GameState,
  viewed: PlayerState,
  target: CardModalTarget,
): CardModalSpec | null {
  const own = viewed.id === state.activePlayerId
  if (target.source === 'rival') {
    const battle: BattleState | null = state.battle
    const rival = battle?.rival.find((candidate) => !candidate.fainted) ?? battle?.rival[0]
    const card = rival === undefined ? undefined : cardOf(rival.cardId)
    if (battle === null || rival === undefined || card === undefined) return null
    return {
      card,
      pkm: {
        ...rival,
        xp: 0,
        equipped: [],
        multicolor: [],
      },
      active: true,
      readOnly: true,
      notice: 'rival',
      conditions: battle.conditions[rival.uid],
      elements: [],
    }
  }
  const uid = target.uid ?? ''
  const pkm = target.source === 'oak' ? findIn(viewed.oakPile, uid) : findIn(viewed.team, uid)
  if (pkm === undefined) return null
  const card = cardOf(pkm.cardId)
  if (card === undefined) return null
  const notice: CardModalNotice = !own
    ? 'spectator'
    : target.source === 'oak'
      ? 'oak'
      : state.battle !== null
        ? 'battle'
        : null
  return {
    card,
    pkm,
    active: target.source === 'team' && pkm.uid === leaderUid(viewed, state.battle),
    readOnly: notice !== null,
    notice,
    conditions: state.battle?.conditions[pkm.uid],
    elements: own && target.source === 'team' ? viewed.elements : [],
  }
}

/** Ítem de poción usable (AC-13): solo las que el motor dictaminó legales. */
export interface PotionAction {
  readonly item: 'potion' | 'super_potion'
}

/** Evolución ofrecida (AC-13): comando Evolve legal + datos de la carta destino. */
export interface EvolveAction {
  readonly id: string
  readonly name: string
  readonly xp: number
}

/** Acciones legales para ESTE PKM (AC-12/AC-13): espejo de legalCommands. */
export interface CardModalActions {
  readonly equipElementIds: ReadonlySet<string>
  readonly unequipElementIds: ReadonlySet<string>
  readonly multicolorOptions: readonly Element[]
  /** T-104 (D-30): hay un Multicolor asignado que se puede quitar en Organize. */
  readonly canUnassignMulticolor: boolean
  readonly potions: readonly PotionAction[]
  readonly evolutions: readonly EvolveAction[]
}

/** Selector Multicolor (AC-12): las 13 energías con carta (D-24). */
export const MULTICOLOR_OPTIONS: readonly Element[] = energyTypes
  .filter((type) => type.energyCard)
  .map((type) => type.id)

/** Evoluciones legales según el motor, con nombre/XP de la carta vista. */
function evolveActions(
  state: GameState,
  legal: readonly Command[],
  uid: string,
): readonly EvolveAction[] {
  const player = state.players.find((candidate) => candidate.id === state.activePlayerId)
  const pkm = player?.team.find((candidate) => candidate.uid === uid)
  const card = pkm === undefined ? undefined : cardOf(pkm.cardId)
  if (pkm === undefined || card === undefined) return []
  const actions: EvolveAction[] = []
  for (const command of legal) {
    if (command.type !== 'Evolve' || command.pkmUid !== uid) continue
    const entry = card.evolvesTo.find((candidate) => candidate.id === command.toId)
    const target = cardOf(command.toId)
    if (entry === undefined || target === undefined) continue
    actions.push({ id: command.toId, name: target.name, xp: entry.xp })
  }
  return actions
}

export function cardModalActions(
  state: GameState,
  legal: readonly Command[],
  uid: string,
): CardModalActions {
  const equipElementIds = new Set<string>()
  const unequipElementIds = new Set<string>()
  let multicolor = false
  let unassignMulticolor = false
  const potions: PotionAction[] = []
  for (const command of legal) {
    if (command.type === 'Equip' && command.pkmUid === uid) {
      equipElementIds.add(command.elementId)
    } else if (command.type === 'Unequip' && command.pkmUid === uid) {
      unequipElementIds.add(command.elementId)
    } else if (command.type === 'AssignMulticolor' && command.pkmUid === uid) {
      multicolor = true
    } else if (command.type === 'UnassignMulticolor' && command.pkmUid === uid) {
      unassignMulticolor = true
    } else if (command.type === 'UsePotion' && command.pkmUid === uid && command.target === uid) {
      potions.push({ item: command.item ?? 'potion' })
    }
  }
  return {
    equipElementIds,
    unequipElementIds,
    multicolorOptions: multicolor ? MULTICOLOR_OPTIONS : [],
    canUnassignMulticolor: unassignMulticolor,
    potions,
    evolutions: evolveActions(state, legal, uid),
  }
}

/** Energías disponibles agrupadas por elemento (AC-11): grilla con contador. */
export interface AvailableEnergy {
  readonly element: Element
  readonly count: number
  /** Id de una carta del grupo (las del mismo elemento son equivalentes). */
  readonly exampleId: string
}

export function availableEnergies(
  elements: readonly ElementCard[],
): readonly AvailableEnergy[] {
  const groups = new Map<Element, AvailableEnergy>()
  for (const card of elements) {
    const current = groups.get(card.element)
    if (current === undefined) {
      groups.set(card.element, { element: card.element, count: 1, exampleId: card.id })
    } else {
      groups.set(card.element, { ...current, count: current.count + 1 })
    }
  }
  return [...groups.values()]
}

export interface CostGap {
  readonly element: Element | 'any'
  readonly missing: number
}

/**
 * AC-9: qué le falta al costo (etiqueta "Falta 1 Fuego"). Es solo el mensaje:
 * la legalidad la decide el motor (`canUse`); acá se describe el dato. Espejo
 * del conteo de equipment.ts (mismo criterio, sin decidir nada).
 */
export function costGaps(pkm: PkmInstance, attack: Attack): readonly CostGap[] {
  const gaps: CostGap[] = []
  const elements = [...new Set(attack.cost.filter((slot): slot is Element => slot !== 'any'))]
  for (const element of elements) {
    const required = attack.cost.filter((candidate) => candidate === element).length
    const have =
      pkm.equipped.filter((card) => card.element === element).length +
      pkm.multicolor.filter((assigned) => assigned === element).length
    const deficit = Math.max(0, required - have)
    if (deficit > 0) gaps.push({ element, missing: deficit })
  }
  // Slots 'any': pagan con cualquier carta (total equipado + Multicolor).
  const total = pkm.equipped.length + pkm.multicolor.length
  const anyShort = attack.cost.length - total
  if (anyShort > 0) gaps.push({ element: 'any', missing: anyShort })
  return gaps
}

// ── Geometría (AC-3/AC-4/AC-5): pura, replicada por el CSS con inline vars ──

export interface CardModalGeometry {
  readonly window: PxBox
  readonly cardW: number
  readonly cardH: number
  readonly sideW: number
  readonly stacked: boolean
  /** AC-5: true si quedó encima de un panel pese al intento de correrla. */
  readonly coversPanel: boolean
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/** Chrome vertical fijo de la ventana que NO es carta (plan/layout-carta-modal/
 * AC-6): borde 3×2 + padding 10×2 de `.window` + 32 del header (alto del botón
 * Cerrar). Espejo de CardModal.module.css: si cambia allá, actualizar acá. */
const WINDOW_CHROME_PX = 58

/**
 * Caja de la ventana: alto = heightVh con clamps px (AC-3), carta a la
 * izquierda con aspecto `card.aspect` (AC-4) y panel lateral fijo; debajo de
 * `stackBelowPx` el panel pasa debajo (AC-4). AC-5: si tapa panel-dice o
 * panel-turn y hay lugar, se corre; si no, se queda (fondo atenuado).
 * layout-carta-modal/AC-6: la carta se deriva de la zona de CONTENIDO (alto
 * de la ventana menos su chrome) con un gap de aire abajo, para que el pie
 * nunca quede cortado ni la carta desborde la ventana.
 */
export function cardModalGeometry(
  vw: number,
  vh: number,
  config: CardModal,
  layout: UiLayout,
): CardModalGeometry {
  const gap = config.sidePanel.gapPx
  const h = clamp(vh * config.modal.heightVh, config.modal.minHeightPx, config.modal.maxHeightPx)
  const stacked = vw < config.responsive.stackBelowPx
  let cardH = h - WINDOW_CHROME_PX - gap
  let cardW = cardH * config.card.aspect
  let sideW = config.sidePanel.widthPx
  let w = stacked
    ? Math.max(cardW, sideW) + gap * 2
    : cardW + gap + sideW + gap * 2
  const maxWidth = vw - gap * 2
  if (w > maxWidth) {
    // Sin lugar: se achica la carta (mantiene el aspecto) y el panel hasta la mitad.
    const excess = w - maxWidth
    const sideShrink = Math.min(sideW * 0.5, excess)
    sideW -= sideShrink
    cardW = Math.max(config.card.aspect * 100, cardW - (excess - sideShrink))
    cardH = cardW / config.card.aspect
    w = stacked ? Math.max(cardW, sideW) + gap * 2 : cardW + gap + sideW + gap * 2
  }
  let x = (vw - w) / 2
  const y = (vh - h) / 2
  const box: PxBox = { x, y, w, h }
  const obstaclePanels: readonly UiPanel[] = [layout.panels.dice, layout.panels.turn].filter(
    (panel): panel is UiPanel => panel !== undefined,
  )
  const obstacles = obstaclePanels.map((panel) => panelPx(panel, vw, vh))
  let coversPanel = obstacles.some((obstacle) => boxesOverlap(box, obstacle))
  if (coversPanel) {
    // Probamos correrla a la derecha del último obstazo (y de vuelta a la
    // izquierda) si sigue dentro de la ventana; si no, queda centrada (AC-5).
    const rightEdge = Math.max(...obstacles.map((obstacle) => obstacle.x + obstacle.w))
    const leftEdge = Math.min(...obstacles.map((obstacle) => obstacle.x))
    const shiftRight = rightEdge + gap - x
    const shiftedRight: PxBox = { ...box, x: x + shiftRight }
    if (shiftedRight.x + w <= vw - gap && !obstacles.some((o) => boxesOverlap(shiftedRight, o))) {
      x = shiftedRight.x
      coversPanel = false
    } else {
      const shiftLeft = x + w + gap - leftEdge
      const shiftedLeft: PxBox = { ...box, x: x - shiftLeft }
      if (shiftedLeft.x >= gap && !obstacles.some((o) => boxesOverlap(shiftedLeft, o))) {
        x = shiftedLeft.x
        coversPanel = false
      }
    }
  }
  return {
    window: { x, y, w, h },
    cardW,
    cardH,
    sideW,
    stacked,
    coversPanel,
  }
}
