// Poses y máquina de modos de la cámara inmersiva (puro, sin R3F ni DOM).
// Extraído de rig.ts (N-0022); rig.ts re-exporta la API pública.
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'
import { cameraPresets, clampTarget, planOverview, type PanBounds } from './camera'
import type { ExploreKey } from './explore'

export type CameraMode =
  | 'overview'
  | 'transitionIn'
  | 'follow'
  | 'fork'
  | 'transitionOut'
  | 'free'
  | 'explore'

export type CameraEvent =
  | { readonly type: 'ROLL' }
  | { readonly type: 'CHOOSE_PATH' }
  | { readonly type: 'PATH_CHOSEN' }
  | { readonly type: 'TURN_END' }
  | { readonly type: 'USER_INPUT' }
  | { readonly type: 'CENTER_ON_ME'; readonly x: number; readonly z: number }
  | { readonly type: 'OVERVIEW' }
  | { readonly type: 'EXPLORE_KEY'; readonly key: ExploreKey }
  | { readonly type: 'EXPLORE_WHEEL'; readonly deltaY: number }
  | { readonly type: 'EXPLORE_DRAG'; readonly dxPx: number; readonly dyPx: number }
  | { readonly type: 'DONE' }

/** Ficha seguida y hacia dónde va (próximo nodo del camino). */
export interface RigFocus {
  readonly tokenX: number
  readonly tokenZ: number
  readonly nextX: number
  readonly nextZ: number
}

export interface CameraPose {
  position: THREE.Vector3
  target: THREE.Vector3
  fov: number
}

export const deg = Math.PI / 180

/**
 * T-076/AC-7 + T-077: transiciones válidas de la máquina. `null` = inválida.
 * - ROLL desde overview/free/follow/fork/explore/transitionOut (nunca transitionIn).
 * - CHOOSE_PATH solo en follow; PATH_CHOSEN solo en fork.
 * - TURN_END solo en follow/fork → transitionOut (destino `afterTurn`).
 * - USER_INPUT solo en overview (explore sincroniza sin cambiar de modo).
 * - OVERVIEW (T-077/AC-3) desde free/explore.
 * - CENTER_ON_ME (camara-libre-sin-ficha): explore re-centra el objetivo con
 *   damping; overview/free transicionan a explore sobre mi ficha. follow/fork/
 *   transitionIn quedan reservados a los cues de combate (AC-8).
 * - DONE cierra las transiciones (transitionOut → afterTurn por defecto).
 */
export function nextMode(mode: CameraMode, event: CameraEvent): CameraMode | null {
  switch (event.type) {
    case 'ROLL':
      return mode === 'transitionIn' ? null : 'transitionIn'
    case 'CHOOSE_PATH':
      return mode === 'follow' ? 'fork' : null
    case 'PATH_CHOSEN':
      return mode === 'fork' ? 'follow' : null
    case 'TURN_END':
      return mode === 'follow' || mode === 'fork' ? 'transitionOut' : null
    case 'USER_INPUT':
      return mode === 'overview' ? 'free' : null
    case 'OVERVIEW':
      return mode === 'free' || mode === 'explore' ? 'transitionOut' : null
    case 'CENTER_ON_ME':
      if (mode === 'explore') return 'explore'
      return mode === 'overview' || mode === 'free' ? 'transitionOut' : null
    case 'EXPLORE_KEY':
      return mode === 'explore' ? 'explore' : null
    case 'EXPLORE_WHEEL':
    case 'EXPLORE_DRAG':
      // camara-libre-3d: rueda/arrastre solo operan el estado del explore.
      return mode === 'explore' ? 'explore' : null
    case 'DONE':
      if (mode === 'transitionIn') return 'follow'
      if (mode === 'transitionOut') return cameraPresets.afterTurn
      return null
  }
}

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2

/**
 * T-075/AC-4: cue del popup de combate sobre la máquina de T-076. Al abrir se
 * acerca suavemente a la ficha (reusa la transición ROLL) SOLO si la cámara no
 * está ya cerca; al cerrar vuelve (TURN_END) solo si el popup acercó — si ya
 * estaba en follow (mitad de turno), el turno cierra su cámara como siempre.
 */
export function battleCameraCue(
  mode: CameraMode,
  open: boolean,
  zoomedByPopup: boolean,
): CameraEvent | null {
  if (open) {
    return mode === 'overview' || mode === 'free' || mode === 'explore' ? { type: 'ROLL' } : null
  }
  if (zoomedByPopup && (mode === 'follow' || mode === 'fork')) return { type: 'TURN_END' }
  return null
}

export const clonePose = (pose: CameraPose): CameraPose => ({
  position: pose.position.clone(),
  target: pose.target.clone(),
  fov: pose.fov,
})

export function overviewPose(halfWidth: number, halfDepth: number, aspect: number): CameraPose {
  const plan = planOverview(halfWidth, halfDepth, aspect)
  return {
    position: new THREE.Vector3(...plan.position),
    target: new THREE.Vector3(...plan.target),
    fov: plan.fovDeg,
  }
}

/**
 * T-076/AC-2/AC-3: pose de seguimiento. La posición se ancla a distancia
 * `distance` de la FICHA (elevación `elevationDeg` sobre ella, detrás según el
 * heading); el target mira `lookAhead` hacia el próximo nodo. En fork sube la
 * elevación y aleja la cámara para ver las opciones (AC-3).
 */
export function followPose(
  kind: 'follow' | 'fork',
  focus: RigFocus,
  heading: THREE.Vector2,
  panBounds: PanBounds,
): CameraPose {
  const presets = cameraPresets
  const elevation =
    (kind === 'fork' ? presets.fork.elevationDeg : presets.follow.elevationDeg) * deg
  const distance = kind === 'fork' ? presets.fork.distance : presets.follow.distance
  const tokenY = BOARD3D.token.lift
  const unit = heading.lengthSq() < 1e-9 ? new THREE.Vector2(0, -1) : heading.clone().normalize()

  const position = new THREE.Vector3(
    focus.tokenX - unit.x * distance * Math.cos(elevation),
    Math.max(tokenY + distance * Math.sin(elevation), presets.follow.minHeight),
    focus.tokenZ - unit.y * distance * Math.cos(elevation),
  )
  position.x = Math.min(panBounds.maxX, Math.max(panBounds.minX, position.x))
  position.z = Math.min(panBounds.maxZ, Math.max(panBounds.minZ, position.z))

  const target = clampTarget(
    new THREE.Vector3(
      focus.tokenX + unit.x * presets.follow.lookAhead,
      tokenY,
      focus.tokenZ + unit.y * presets.follow.lookAhead,
    ),
    panBounds,
  )
  return { position, target, fov: presets.follow.fov }
}

/** Interpolación de transición: easeInOutCubic entre dos poses (AC-2/AC-4). */
export function samplePose(from: CameraPose, to: CameraPose, t01: number): CameraPose {
  const k = easeInOutCubic(Math.min(1, Math.max(0, t01)))
  return {
    position: from.position.clone().lerp(to.position, k),
    target: from.target.clone().lerp(to.target, k),
    fov: from.fov + (to.fov - from.fov) * k,
  }
}

/** T-076/AC-3: amortiguación — la pose actual se acerca a la deseada un
 * `damping` por frame (0,12 de camera.json). Muta `current`. */
export function dampPose(current: CameraPose, desired: CameraPose, damping: number): void {
  current.position.lerp(desired.position, damping)
  current.target.lerp(desired.target, damping)
  current.fov += (desired.fov - current.fov) * damping
}

/** T-076/AC-9: paso de dpr (0,25) hacia `direction`, clamped a perf.dpr. */
export function dprStep(
  current: number,
  bounds: readonly [number, number],
  direction: 1 | -1,
): number {
  const next = current + direction * 0.25
  return Math.min(bounds[1], Math.max(bounds[0], Math.round(next * 100) / 100))
}
