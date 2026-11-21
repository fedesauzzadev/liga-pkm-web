// Volcado de escena en texto (SPEC-G/T-062/AC-9 + NO-VISION §3): proyecta
// cada objeto relevante a píxeles para "ver" la escena sin mirarla. En
// desarrollo Board3D lo expone como window.__debug.sceneDump(). T-076/AC-8:
// incluye el estado de la cámara inmersiva.
import * as THREE from 'three'
import type { LabelPlan } from './labels'

export interface ScreenBBox {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export interface SceneDumpEntry {
  readonly name: string
  readonly type: string
  readonly visible: boolean
  readonly worldPos: readonly [number, number, number]
  readonly screenPos: readonly [number, number]
  readonly screenBBox: ScreenBBox | null
  readonly inViewport: boolean
  /** T-068/AC-6: nodo al que pertenece (landmarks). */
  readonly nodeId?: string
  /** SPEC-O/T-095/AC-5: categoría de ocupación y kind (ningún objeto sin
   * categoría; con esto se identifican los "cristales celestes"). */
  readonly category?: string
  readonly kind?: string
  /** SPEC-P/T-099/AC-B3: origen del edificio — new | hgss | kenney | procedural. */
  readonly source?: string
}

/** T-076/AC-8 + SPEC-M/T-085/AC-4: estado de la cámara en el dump
 * (mode/position/target/distance/fov/pitchDeg; picada = asin(−forward.y)). */
export interface CameraDumpState {
  readonly mode: string
  readonly position: readonly [number, number, number]
  readonly target: readonly [number, number, number]
  readonly distance: number
  readonly fov: number
  /** Picada en grados: 0° = horizontal, 90° = cenital. */
  readonly pitchDeg: number
}

/** T-069/AC-7: presupuestos (T-068/AC-4) — triángulos y draw calls (gl.info). */
export interface RenderInfo {
  readonly triangles: number
  readonly calls: number
}

export interface SceneDump {
  readonly objects: readonly SceneDumpEntry[]
  readonly camera: CameraDumpState | null
  readonly render: RenderInfo | null
  /** T-078/AC-4: plan de etiquetas inteligentes (visible/reason/cajas en px). */
  readonly labels: readonly LabelPlan[]
}

const _forward = new THREE.Vector3()

/** Picada real de la cámara (SPEC-M/T-085/AC-4): asin(−forward.y) en grados. */
export function pitchDegOf(camera: THREE.PerspectiveCamera, target: THREE.Vector3): number {
  _forward.subVectors(target, camera.position)
  const distance = _forward.length()
  if (distance <= 1e-6) return 0
  const y = Math.min(1, Math.max(-1, -_forward.y / distance))
  return Math.asin(y) * (180 / Math.PI)
}

export function cameraDumpOf(
  mode: string,
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
): CameraDumpState {
  return {
    mode,
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: [target.x, target.y, target.z],
    distance: camera.position.distanceTo(target),
    fov: camera.fov,
    pitchDeg: pitchDegOf(camera, target),
  }
}

export function buildSceneDump(
  objects: readonly SceneDumpEntry[],
  camera: CameraDumpState | null,
  render: RenderInfo | null = null,
  labels: readonly LabelPlan[] = [],
): SceneDump {
  return { objects, camera, render, labels }
}

const _world = new THREE.Vector3()

const toScreen = (ndc: THREE.Vector3, width: number, height: number): readonly [number, number] => [
  ((ndc.x + 1) / 2) * width,
  ((1 - ndc.y) / 2) * height,
]

export function computeSceneDump(
  objects: readonly THREE.Object3D[],
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): readonly SceneDumpEntry[] {
  camera.updateMatrixWorld(true)
  const entries: SceneDumpEntry[] = []
  for (const object of objects) {
    object.getWorldPosition(_world)
    const worldPos: readonly [number, number, number] = [_world.x, _world.y, _world.z]
    const center = _world.clone().project(camera)
    const screenPos = toScreen(center, width, height)

    const box = new THREE.Box3().setFromObject(object)
    let bbox: ScreenBBox | null = null
    let inViewport = center.z > 0 && center.z < 1 && screenPos[0] >= 0 && screenPos[0] <= width && screenPos[1] >= 0 && screenPos[1] <= height
    if (!box.isEmpty()) {
      let minX = Number.POSITIVE_INFINITY
      let minY = Number.POSITIVE_INFINITY
      let maxX = Number.NEGATIVE_INFINITY
      let maxY = Number.NEGATIVE_INFINITY
      let allInFront = true
      for (const corner of cornersOf(box)) {
        const projected = corner.clone().project(camera)
        if (projected.z < 0 || projected.z > 1) allInFront = false
        const [px, py] = toScreen(projected, width, height)
        minX = Math.min(minX, px)
        minY = Math.min(minY, py)
        maxX = Math.max(maxX, px)
        maxY = Math.max(maxY, py)
      }
      bbox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
      inViewport =
        allInFront &&
        object.visible &&
        minX >= 0 &&
        minY >= 0 &&
        maxX <= width &&
        maxY <= height
    }
    entries.push({
      name: object.name,
      type: object.type,
      visible: object.visible,
      worldPos,
      screenPos,
      screenBBox: bbox,
      inViewport,
      ...(typeof object.userData.nodeId === 'string' ? { nodeId: object.userData.nodeId } : {}),
      ...(typeof object.userData.category === 'string' ? { category: object.userData.category } : {}),
      ...(typeof object.userData.kind === 'string' ? { kind: object.userData.kind } : {}),
      ...(typeof object.userData.source === 'string' ? { source: object.userData.source } : {}),
    })
  }
  return entries
}

function* cornersOf(box: THREE.Box3): Generator<THREE.Vector3> {
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        yield new THREE.Vector3(x, y, z)
      }
    }
  }
}
