// Robo de carta (SPEC-G/T-064): helpers three puros + línea de tiempo, sin R3F
// ni DOM, para verificar numéricamente en node (NO-VISION). DrawFx/DrawnCard
// (chunk 3D) los usan; todos los números viven en theme/board3d.ts §draw.
import { elementOfCardId } from '@liga/engine'
import type { PlaybackSpeed } from '../events/anim.config'
import { cardOf } from '../game/content'
import { BOARD3D } from '../theme/board3d'
import * as THREE from 'three'

/** Fases del robo (AC-5): idle → highlight → fly → reveal → (decision | stow). */
export type DrawPhase = 'idle' | 'highlight' | 'fly' | 'reveal' | 'stow' | 'done'
export type DrawKind = 'pkm' | 'energy' | 'item'
export type DrawEnd = 'decision' | 'stowed' | 'cancelled'

export interface DrawTimings {
  readonly highlightMs: number
  readonly flyMs: number
  readonly revealMs: number
  readonly stowMs: number
}

export interface ScreenPoint {
  readonly x: number
  readonly y: number
}

/** Origen proyectado de la pila + tamaño del canvas (para centrar la carta). */
export interface DrawOrigin extends ScreenPoint {
  readonly w: number
  readonly h: number
}

/** AC-2: qué cara mostrar — PKM conocido, elemento sintético o ítem. */
export function drawKindOf(card: string): DrawKind {
  if (cardOf(card) !== undefined) return 'pkm'
  if (elementOfCardId(card) !== null) return 'energy'
  return 'item'
}

/**
 * AC-3: la pila refleja la cantidad real de cartas del mazo — se ven
 * `max(1, min(count, 12))` cartas (altura proporcional, mínimo 1).
 */
export function setStackCount(group: THREE.Group, count: number): void {
  const visible = Math.max(1, Math.min(Math.floor(count), BOARD3D.card.count))
  for (const child of group.children) {
    if (!child.name.startsWith('card:')) continue
    const index = Number(child.name.slice('card:'.length))
    child.visible = Number.isInteger(index) && index < visible
  }
}

/** AC-1: resalta la pila elevándola 0,15 (y la devuelve a su base). */
export function liftStack(group: THREE.Group, lifted: boolean): void {
  const stored = group.userData.stackBaseY
  const baseY = typeof stored === 'number' ? stored : group.position.y
  group.userData.stackBaseY = baseY
  group.position.y = baseY + (lifted ? BOARD3D.draw.stackLift : 0)
}

/** AC-1: posición de pantalla (px) de la pila proyectada con la cámara actual. */
export function stackScreenPos(
  stack: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): ScreenPoint {
  stack.updateMatrixWorld(true)
  const world = new THREE.Vector3()
  stack.getWorldPosition(world)
  const ndc = world.project(camera)
  return { x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height }
}

/**
 * T-090/AC-2: el origen del robo es la pila del mazo; los mazos sin pedestal
 * (Ítem/Sorpresa) parten del nodo donde se robó (Mercado u otro). Puro.
 */
export function drawOriginTarget(
  stacks: ReadonlyMap<string, THREE.Object3D>,
  nodes: ReadonlyMap<string, THREE.Object3D>,
  deck: string,
  nodeId: string | null | undefined,
): THREE.Object3D | null {
  const stack = stacks.get(deck)
  if (stack !== undefined) return stack
  if (nodeId === null || nodeId === undefined) return null
  return nodes.get(nodeId) ?? null
}

/** AC-4: skip y reducedMotion saltan todo (0 ms); 2× a la mitad. */
export function drawTimings(speed: PlaybackSpeed, reducedMotion: boolean): DrawTimings {
  const draw = BOARD3D.draw
  if (reducedMotion || speed === 'skip') {
    return { highlightMs: 0, flyMs: 0, revealMs: 0, stowMs: 0 }
  }
  if (speed === '2x') {
    return {
      highlightMs: draw.highlightMs / 2,
      flyMs: draw.flyMs / 2,
      revealMs: draw.revealMs / 2,
      stowMs: draw.stowMs / 2,
    }
  }
  return {
    highlightMs: draw.highlightMs,
    flyMs: draw.flyMs,
    revealMs: draw.revealMs,
    stowMs: draw.stowMs,
  }
}

export interface DrawTimelineOptions {
  readonly kind: DrawKind
  readonly timings: DrawTimings
  /** Reloj inyectado: en tests avanza con temporizadores falsos. */
  readonly delay: (ms: number) => Promise<void>
  readonly onHighlight?: () => void
  readonly onFly?: () => void
  readonly onReveal?: () => void
  readonly onStow?: () => void
  readonly shouldStop?: () => boolean
}

/**
 * AC-1/AC-5: resaltar → volar → revelar → decisión (pkm) o stow al inventario
 * (energía/ítem). La promesa resuelve al terminar la última fase.
 */
export async function runDrawTimeline(options: DrawTimelineOptions): Promise<DrawEnd> {
  const { kind, timings, delay, onHighlight, onFly, onReveal, onStow, shouldStop } = options
  const stopped = (): boolean => shouldStop?.() === true
  onHighlight?.()
  await delay(timings.highlightMs)
  if (stopped()) return 'cancelled'
  onFly?.()
  await delay(timings.flyMs)
  if (stopped()) return 'cancelled'
  onReveal?.()
  await delay(timings.revealMs)
  if (stopped()) return 'cancelled'
  if (kind === 'pkm') return 'decision'
  onStow?.()
  await delay(timings.stowMs)
  return stopped() ? 'cancelled' : 'stowed'
}
