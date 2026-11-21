// Explore puro (SPEC-J/T-077): estado de órbita del usuario, clamps, pose y
// teclas del modo explore. Presets desde content/ui/camera.json (fuente de
// verdad); three sin R3F ni DOM para verificar numéricamente (NO-VISION).
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'
import { cameraPresets, type PanBounds } from './camera'
import type { CameraPose } from './rig'

/** T-077/AC-2: órbita del usuario alrededor del objetivo (modo explore). */
export interface ExploreState {
  readonly azimuthDeg: number
  readonly elevationDeg: number
  readonly distance: number
  readonly offsetX: number
  readonly offsetZ: number
}

export type ExploreKey =
  | 'rotateLeft'
  | 'rotateRight'
  | 'zoomIn'
  | 'zoomOut'
  | 'panForward'
  | 'panBack'
  | 'panLeft'
  | 'panRight'

const deg = Math.PI / 180

/** Pasos por pulsación de tecla (SPEC-J/T-077/AC-2; × explore.rotate/panSpeed). */
const ROTATE_STEP_DEG = 20
const ZOOM_STEP = 1
const PAN_STEP_S = 1 / 12

/** Azimut envuelto al rango (360° ⇒ módulo) o clampeado si el rango es menor. */
const wrapAzimuth = (azimuthDeg: number, min: number, max: number): number => {
  if (max - min >= 360 - 1e-6) {
    return ((((azimuthDeg - min) % 360) + 360) % 360) + min
  }
  return Math.min(max, Math.max(min, azimuthDeg))
}

/** T-077/AC-2 + SPEC-M/T-085/AC-1: clamps del explore — giro wrap 360°,
 * picada 20°–60° (tope duro pitchClampDeg), zoom 3–16. */
export function clampExploreState(state: ExploreState): ExploreState {
  const [minDistance, maxDistance] = cameraPresets.explore.distanceRange
  const [minPitch, maxPitch] = cameraPresets.explore.pitchDegRange
  const [minAzimuth, maxAzimuth] = cameraPresets.explore.azimuthDegRange
  const hardMaxPitch = Math.min(maxPitch, cameraPresets.pitchClampDeg)
  return {
    azimuthDeg: wrapAzimuth(state.azimuthDeg, minAzimuth, maxAzimuth),
    elevationDeg: Math.min(hardMaxPitch, Math.max(minPitch, state.elevationDeg)),
    distance: Math.min(maxDistance, Math.max(minDistance, state.distance)),
    offsetX: state.offsetX,
    offsetZ: state.offsetZ,
  }
}

/** T-077/AC-1: estado inicial del explore (distancia/elevación de presets). */
export function initialExploreState(): ExploreState {
  return clampExploreState({
    azimuthDeg: 0,
    elevationDeg: cameraPresets.explore.elevationDeg,
    distance: cameraPresets.explore.distance,
    offsetX: 0,
    offsetZ: 0,
  })
}

/**
 * dado-fijo-tablero/AC-6: clamp de la posición del explore que PRESERVA la
 * dirección del offset al objetivo — escala el offset 3D completo por el k
 * más grande (k ≤ 1) que mantenga la parte horizontal dentro de panBounds.
 * A diferencia de clampear x/z por separado, la vista no "sube" contra la
 * pared: la cámara solo se acerca por su mismo eje de mirada (azimut y
 * elevación intactos, sin salto aparente).
 */
function clampExplorePosition(
  position: THREE.Vector3,
  targetX: number,
  targetY: number,
  targetZ: number,
  panBounds: PanBounds,
): void {
  const dx = position.x - targetX
  const dz = position.z - targetZ
  let k = 1
  if (dx > 0) k = Math.min(k, Math.max(0, panBounds.maxX - targetX) / dx)
  else if (dx < 0) k = Math.min(k, Math.max(0, targetX - panBounds.minX) / -dx)
  if (dz > 0) k = Math.min(k, Math.max(0, panBounds.maxZ - targetZ) / dz)
  else if (dz < 0) k = Math.min(k, Math.max(0, targetZ - panBounds.minZ) / -dz)
  if (k >= 1) return
  position.set(
    targetX + k * dx,
    Math.max(targetY + k * (position.y - targetY), cameraPresets.follow.minHeight),
    targetZ + k * dz,
  )
}

/**
 * T-077/AC-5: pose del explore — esférica alrededor del objetivo (ancla +
 * paneo; con targetFollowsToken false es un punto libre del tablero), altura
 * mínima `follow.minHeight` (0,4) y posición dentro del mundo (panBounds) en
 * todos los ángulos.
 */
export function explorePose(
  state: ExploreState,
  targetX: number,
  targetZ: number,
  panBounds: PanBounds,
): CameraPose {
  const clamped = clampExploreState(state)
  const elevation = clamped.elevationDeg * deg
  const azimuth = clamped.azimuthDeg * deg
  const tokenY = BOARD3D.token.lift
  const position = new THREE.Vector3(
    targetX + clamped.distance * Math.cos(elevation) * Math.sin(azimuth),
    Math.max(tokenY + clamped.distance * Math.sin(elevation), cameraPresets.follow.minHeight),
    targetZ + clamped.distance * Math.cos(elevation) * Math.cos(azimuth),
  )
  clampExplorePosition(position, targetX, tokenY, targetZ, panBounds)
  return {
    position,
    target: new THREE.Vector3(targetX, tokenY, targetZ),
    fov: cameraPresets.explore.fov,
  }
}

/**
 * T-077/AC-2: una pulsación de tecla — Q/E giran, +/- zoomea, WASD panea
 * (relativo al azimut de la cámara); el objetivo queda dentro del mundo.
 * camara-libre-sin-ficha/AC-1: anchorX/Z es el ancla única del rig (ficha si
 * targetFollowsToken; si no, el origen del tablero ⇒ paneo absoluto).
 */
export function exploreKeyStep(
  state: ExploreState,
  key: ExploreKey,
  anchorX: number,
  anchorZ: number,
  panBounds: PanBounds,
): ExploreState {
  const clamped = clampExploreState(state)
  const presets = cameraPresets.explore
  if (key === 'rotateLeft' || key === 'rotateRight') {
    const direction = key === 'rotateRight' ? 1 : -1
    return clampExploreState({
      ...clamped,
      azimuthDeg: clamped.azimuthDeg + direction * ROTATE_STEP_DEG * presets.rotateSpeed,
    })
  }
  if (key === 'zoomIn' || key === 'zoomOut') {
    const direction = key === 'zoomOut' ? 1 : -1
    return clampExploreState({ ...clamped, distance: clamped.distance + direction * ZOOM_STEP })
  }
  const azimuth = clamped.azimuthDeg * deg
  const forwardX = -Math.sin(azimuth)
  const forwardZ = -Math.cos(azimuth)
  const panStep = presets.panSpeed * PAN_STEP_S
  let dx = 0
  let dz = 0
  if (key === 'panForward') {
    dx = forwardX * panStep
    dz = forwardZ * panStep
  } else if (key === 'panBack') {
    dx = -forwardX * panStep
    dz = -forwardZ * panStep
  } else {
    const direction = key === 'panRight' ? 1 : -1
    dx = -forwardZ * panStep * direction
    dz = forwardX * panStep * direction
  }
  return {
    ...clamped,
    offsetX: Math.min(panBounds.maxX, Math.max(panBounds.minX, anchorX + clamped.offsetX + dx)) - anchorX,
    offsetZ: Math.min(panBounds.maxZ, Math.max(panBounds.minZ, anchorZ + clamped.offsetZ + dz)) - anchorZ,
  }
}

/** camara-libre-3d/AC-1: amortiguación del objetivo explore (0,1) sobre el plano. */
export function dampExploreTarget(
  current: THREE.Vector3,
  desired: THREE.Vector3,
  damping: number,
): void {
  current.x += (desired.x - current.x) * damping
  current.z += (desired.z - current.z) * damping
}

/**
 * camara-libre-3d/AC-2: un notch de rueda — zoom continuo (±wheelZoomStep
 * sobre la distancia; deltaY > 0 = alejar), clamped a distanceRange.
 */
export function exploreWheelStep(state: ExploreState, deltaY: number): ExploreState {
  const clamped = clampExploreState(state)
  if (deltaY === 0) return clamped
  const direction = deltaY > 0 ? 1 : -1
  return clampExploreState({
    ...clamped,
    distance: clamped.distance + direction * cameraPresets.explore.wheelZoomStep,
  })
}

/**
 * camara-libre-3d/AC-3: arrastre con click — azimut libre (wrap 360°, sin
 * tope en ±180°) y picada clampeada por pitchDegRange (SPEC-M/T-085); la
 * sensibilidad (grados por pixel) vive en explore.dragRotateDegPerPx.
 */
export function exploreDragStep(state: ExploreState, dxPx: number, dyPx: number): ExploreState {
  const clamped = clampExploreState(state)
  const sensitivity = cameraPresets.explore.dragRotateDegPerPx
  return clampExploreState({
    ...clamped,
    azimuthDeg: clamped.azimuthDeg - dxPx * sensitivity,
    elevationDeg: clamped.elevationDeg + dyPx * sensitivity,
  })
}
