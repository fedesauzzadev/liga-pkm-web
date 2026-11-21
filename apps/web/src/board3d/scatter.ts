// Relleno de zonas (SPEC-H/T-068 → SPEC-O/T-095): las posiciones ya no se
// muestrean acá — las decide el plan de ocupación único (packages/content
// decor-plan.ts: poisson-disk por zona/prioridad, agua limpia, una zona por
// objeto). Acá solo queda la construcción three: una InstancedMesh por
// (zona, spec, parte) con userData para que la capa de modelos (T-070/T-094)
// oculte el procedural correcto al reemplazarlo; ahora con `category`
// (SPEC-O/T-095/AC-5: ningún objeto sin categoría).
import type { DecorPlan } from '@liga/content'
import { categoryOfKind } from '@liga/content'
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'
import { pieceMaterial, type PiecePart } from './decor/geometry'
import { piecePartsOf } from './decor/registry'
import { terrainHeightAt, type WorldInput } from './world'

/** Posición sembrada de una pieza de relleno (determinista). */
export interface ScatterSpot {
  readonly x: number
  readonly z: number
  readonly y: number
  readonly scale: number
  readonly rotY: number
}

/** Radio por defecto de las manchas translúcidas (T-088/AC-2): mist, pond y
 * lavaPool se apoyan en el suelo ⇒ su huella no puede pisar nodos ni caminos.
 * Exportado para verificación numérica (t088). */
export function patchDefaultRadius(kind: string): number {
  if (kind === 'mist') return BOARD3D.decor.mist.radius
  if (kind === 'pond') return BOARD3D.decor.pond.radius
  if (kind === 'lavaPool') return BOARD3D.decor.lavaPool.radius
  return 0
}

const instanceMatrices = (spots: readonly ScatterSpot[]): THREE.Matrix4[] => {
  const matrices: THREE.Matrix4[] = []
  const quaternion = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const scale = new THREE.Vector3()
  const position = new THREE.Vector3()
  for (const spot of spots) {
    euler.set(0, spot.rotY, 0)
    quaternion.setFromEuler(euler)
    scale.setScalar(spot.scale)
    position.set(spot.x, spot.y, spot.z)
    matrices.push(new THREE.Matrix4().compose(position, quaternion, scale))
  }
  return matrices
}

/** AC-4: una InstancedMesh por parte (pieza sólida ⇒ 1 mesh × spec). */
const buildInstanced = (
  zone: string,
  spec: { readonly kind: string; readonly variant?: 'pine' | 'round'; readonly seed: number },
  part: PiecePart,
  partIndex: number,
  spots: readonly ScatterSpot[],
): THREE.InstancedMesh => {
  const mesh = new THREE.InstancedMesh(part.geometry, part.material ?? pieceMaterial, spots.length)
  mesh.name = `scatter:${zone}:${spec.kind}:${String(partIndex)}`
  // T-070/T-094: variant/seed identifican el spec para que la capa de modelos
  // oculte el procedural correcto al reemplazarlo. T-095: +category.
  mesh.userData = {
    zone,
    kind: spec.kind,
    baseCount: spots.length,
    variant: spec.variant,
    seed: spec.seed,
    category: categoryOfKind(spec.kind),
  }
  instanceMatrices(spots).forEach((matrix, index) => mesh.setMatrixAt(index, matrix))
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}

/** El relleno de todas las zonas según el plan (la altura se resuelve acá:
 * el plan es 2D puro). */
export function buildScatter(input: WorldInput, plan: DecorPlan): THREE.Group {
  const root = new THREE.Group()
  root.name = 'scatter'
  const { lift } = BOARD3D.decor.scatter
  for (const spec of plan.scatterSpecs) {
    if (spec.spots.length === 0) continue // sin lugar en el plan ⇒ sin malla
    const parts = piecePartsOf({ kind: spec.kind, variant: spec.variant }, input.decor.palette)
    if (parts === null) continue
    const spots: ScatterSpot[] = spec.spots.map((spot) => ({
      x: spot.x,
      z: spot.z,
      y: terrainHeightAt(spot.x, spot.z, input) + lift,
      scale: spot.scale,
      rotY: spot.rotY,
    }))
    const specId = { kind: spec.kind, seed: spec.seed, ...(spec.variant !== undefined ? { variant: spec.variant } : {}) }
    parts.forEach((piece, index) => root.add(buildInstanced(spec.zone, specId, piece, index, spots)))
  }
  return root
}

/** T-069/AC-6: escala el relleno (0,5 en perfil bajo) sin reconstruir nada. */
export function applyFillScale(scatter: THREE.Group, scale: number): void {
  scatter.traverse((object) => {
    const base = object.userData.baseCount
    if (object instanceof THREE.InstancedMesh && typeof base === 'number') {
      object.count = Math.max(0, Math.round(base * scale))
      object.instanceMatrix.needsUpdate = true
    }
  })
}
