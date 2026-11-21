// Cámara del tablero 3D: presets desde content/ui/camera.json (SPEC-I/T-076,
// fuente de verdad) y encuadre overview dentro del safeArea del layout,
// todo calculado (NO-VISION). El seguimiento/forks/transiciones viven en rig.ts.
import type { PanelBox, UiCamera } from '@liga/content'
import { UiCameraSchema } from '@liga/content'
import * as THREE from 'three'
import { uiLayout } from '../shell/layout'
import { BOARD3D } from '../theme/board3d'
import cameraJson from '../../../../content/ui/camera.json'

export const cameraPresets: UiCamera = UiCameraSchema.parse(cameraJson)

/** Zona del mundo que el HUD no tapa (layout.json); la cámara centra acá. */
export const safeArea: PanelBox = uiLayout.safeArea

export interface CameraControlsPlan {
  readonly minDistance: number
  readonly maxDistance: number
  readonly minPolar: number
  readonly maxPolar: number
  readonly minAzimuth: number
  readonly maxAzimuth: number
}

export interface PanBounds {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
}

export interface CameraPlan {
  readonly fovDeg: number
  readonly near: number
  readonly far: number
  readonly position: readonly [number, number, number]
  readonly target: readonly [number, number, number]
  readonly distance: number
  readonly controls: CameraControlsPlan
  readonly panBounds: PanBounds
}

const deg = Math.PI / 180

/**
 * SPEC-M/T-085/AC-1: polar de three = 90° − picada, y ningún modo supera el
 * clamp duro `pitchClampDeg` (también al arrastre o con la rueda).
 */
export function planPolarRange(
  pitchDegRange: readonly [number, number],
  hardPitchDeg: number,
): { readonly minPolar: number; readonly maxPolar: number } {
  const [minPitch, maxPitch] = pitchDegRange
  return {
    minPolar: (90 - Math.min(maxPitch, hardPitchDeg)) * deg,
    maxPolar: (90 - minPitch) * deg,
  }
}

/**
 * T-076/AC-1: overview encuadra TODO el tablero dentro del safeArea con
 * `margin` de holgura. N-0004: ajuste exacto del rectángulo (antes esfera
 * envolvente ⇒ tablero al 35 % del ancho). El objetivo se corre al sur
 * (`targetZ`) para que el borde cercano y el lejano toquen abajo y arriba a la
 * vez; la distancia es la mayor entre la que pide el alto y la del ancho.
 */
export function planOverview(halfWidth: number, halfDepth: number, aspect: number): CameraPlan {
  const presets = cameraPresets.overview
  const fovDeg = presets.fov
  const halfVfov = (fovDeg / 2) * deg
  const halfHfov = Math.atan(Math.tan(halfVfov) * aspect)
  const vTan = Math.tan(halfVfov) * Math.min(1, safeArea.h)
  const hTan = Math.tan(halfHfov) * Math.min(1, safeArea.w)
  const elevation = presets.elevationDeg * deg
  const cos = Math.cos(elevation)
  // Punto a z del objetivo: profundidad d − z·cos, altura en cámara −z·sen.
  const k = Math.sin(elevation) / vTan
  const near = (halfDepth * (k - cos)) / k
  const targetZ = halfDepth - near
  const distance = Math.max(near * (k + cos), near * cos + halfWidth / hTan) * (1 + presets.margin)
  const position: readonly [number, number, number] = [
    0,
    distance * Math.sin(elevation),
    targetZ + distance * cos,
  ]
  const [zoomMin, zoomMax] = presets.zoomRange
  const [azMin, azMax] = presets.azimuthDegRange
  const polar = planPolarRange(presets.pitchDegRange, cameraPresets.pitchClampDeg)

  return {
    fovDeg,
    near: BOARD3D.camera.near,
    far: BOARD3D.camera.far,
    position,
    target: [0, 0, targetZ],
    distance,
    controls: {
      minDistance: distance * zoomMin,
      maxDistance: distance * zoomMax,
      minPolar: polar.minPolar,
      maxPolar: polar.maxPolar,
      minAzimuth: azMin * deg,
      maxAzimuth: azMax * deg,
    },
    panBounds: {
      minX: -halfWidth * (1 + presets.panLimit),
      maxX: halfWidth * (1 + presets.panLimit),
      minZ: -halfDepth * (1 + presets.panLimit),
      maxZ: halfDepth * (1 + presets.panLimit),
    },
  }
}

/**
 * T-077/AC-2 + SPEC-M/T-085/AC-2: límites de OrbitControls en modo explore —
 * zoom 3–16, picada (`pitchDegRange`) 20°–60° ⇒ polar de three 30°–70°
 * (polar = 90 − picada, clamp duro incluido) y azimut 360° (±180°). Puro,
 * desde content/ui/camera.json.
 */
export function planExploreControls(): CameraControlsPlan {
  const presets = cameraPresets.explore
  const [azMin, azMax] = presets.azimuthDegRange
  const polar = planPolarRange(presets.pitchDegRange, cameraPresets.pitchClampDeg)
  return {
    minDistance: presets.distanceRange[0],
    maxDistance: presets.distanceRange[1],
    minPolar: polar.minPolar,
    maxPolar: polar.maxPolar,
    minAzimuth: azMin * deg,
    maxAzimuth: azMax * deg,
  }
}

/**
 * SPEC-N/T-093/AC-1: objetivo de la cámara de captura (`window.__debug.aimCamera`,
 * DEV). Esférica alrededor de (x, z) con la MISMA convención que explorePose
 * (azimut 0 = cámara al sur mirando al norte), pero SIN clamps: la captura de
 * orientación del tablero necesita picada cenital que los presets del juego
 * prohíben por diseño (pitchClampDeg). Solo para revisión, nunca en juego.
 */
export interface DebugAim {
  readonly x: number
  readonly z: number
  readonly azimuthDeg: number
  readonly elevationDeg: number
  readonly distance: number
}

export interface AimPose {
  readonly position: THREE.Vector3
  readonly target: THREE.Vector3
  readonly fov: number
}

/** Pose (pura) de la cámara de captura; sin clamps salvo la altura mínima. */
export function aimCameraPose(aim: DebugAim): AimPose {
  const elevation = (aim.elevationDeg * Math.PI) / 180
  const azimuth = (aim.azimuthDeg * Math.PI) / 180
  return {
    position: new THREE.Vector3(
      aim.x + aim.distance * Math.cos(elevation) * Math.sin(azimuth),
      Math.max(aim.distance * Math.sin(elevation), cameraPresets.follow.minHeight),
      aim.z + aim.distance * Math.cos(elevation) * Math.cos(azimuth),
    ),
    target: new THREE.Vector3(aim.x, 0, aim.z),
    fov: cameraPresets.explore.fov,
  }
}

/** Paneo acotado al tablero ±panLimit: muta y devuelve el mismo vector. */
export function clampTarget(target: THREE.Vector3, bounds: PanBounds): THREE.Vector3 {
  target.x = Math.min(bounds.maxX, Math.max(bounds.minX, target.x))
  target.z = Math.min(bounds.maxZ, Math.max(bounds.minZ, target.z))
  return target
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k

/** fix-camara-resolucion/AC-2: última aplicación por cámara (idempotencia). */
interface AppliedOffset {
  readonly width: number
  readonly height: number
  readonly ox: number
  readonly oy: number
}

const lastOffset = new WeakMap<THREE.PerspectiveCamera, AppliedOffset>()
const OFFSET_EPS_PX = 1e-9

/**
 * NDC de `p` en el frustum COMPLETO (sin view offset) SIN mutar la cámara:
 * nuestro offset siempre es una sub-ventana del MISMO tamaño
 * (view.width === fullWidth) que solo TRASLADA el NDC (three: `left +=
 * offsetX·width/fullWidth`, `top -= offsetY·height/fullHeight`); se deshace
 * esa traslación en vez de clearViewOffset + updateProjectionMatrix.
 */
function projectFullFrustum(camera: THREE.PerspectiveCamera, p: THREE.Vector3): THREE.Vector3 {
  const ndc = p.clone().project(camera)
  const view = camera.view
  if (view === null || !view.enabled) return ndc
  ndc.x += (2 * view.offsetX) / view.fullWidth
  ndc.y -= (2 * view.offsetY) / view.fullHeight
  return ndc
}

/**
 * Centra el frustum: con `tokenWorld` el punto proyectado cae en el centro del
 * safeArea (AC-5); sin él (mix=1) el centro del frustum es el centro del
 * safeArea (AC-1). `mix` interpola ambos (transición de salida, AC-4).
 * fix-camara-resolucion/AC-2: idempotente — solo `setViewOffset` +
 * `updateProjectionMatrix` cuando cambian (width, height, ox, oy) respecto de
 * la última aplicación (re-configurar por frame con tamaños mezclados hacía
 * pulsar el mundo tras un resize).
 */
export function applyCenteredOffset(
  camera: THREE.PerspectiveCamera,
  safe: PanelBox,
  width: number,
  height: number,
  tokenWorld: THREE.Vector3 | null,
  mix: number,
): void {
  if (width <= 0 || height <= 0) return
  const cx = safe.x + safe.w / 2
  const cy = safe.y + safe.h / 2
  const safeOx = (0.5 - cx) * width
  const safeOy = (0.5 - cy) * height
  let ox = safeOx
  let oy = safeOy
  if (tokenWorld !== null && mix < 1) {
    const ndc = projectFullFrustum(camera, tokenWorld)
    const tokenOx = ((ndc.x + 1) / 2 - cx) * width
    const tokenOy = ((1 - ndc.y) / 2 - cy) * height
    ox = lerp(tokenOx, safeOx, mix)
    oy = lerp(tokenOy, safeOy, mix)
  }
  const last = lastOffset.get(camera)
  if (
    last !== undefined &&
    last.width === width &&
    last.height === height &&
    Math.abs(last.ox - ox) <= OFFSET_EPS_PX &&
    Math.abs(last.oy - oy) <= OFFSET_EPS_PX
  ) {
    return
  }
  // three: setViewOffset ya llama updateProjectionMatrix (r152+).
  camera.setViewOffset(width, height, ox, oy, width, height)
  lastOffset.set(camera, { width, height, ox, oy })
}

/** Overview: el centro del frustum es el centro del safeArea (AC-1). */
export function applySafeOffset(
  camera: THREE.PerspectiveCamera,
  safe: PanelBox,
  width: number,
  height: number,
): void {
  applyCenteredOffset(camera, safe, width, height, null, 1)
}
