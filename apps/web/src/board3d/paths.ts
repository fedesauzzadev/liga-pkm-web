// Camino de tierra entre nodos (SPEC-H/T-067/AC-3): cinta de 0,16 #C9A877 con
// falda suave (ancho variado por seed) y guijarros instanciados a los lados,
// todo determinista (fnv1a por arista). Three puro para tests numéricos
// (NO-VISION); números en theme/board3d.ts §edge/§pebbles.
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'
import { fnv1a, rngSeq } from './rand'
import type { WorldPos } from './scene'

export interface EdgeSpec {
  readonly key: string
  readonly a: WorldPos
  readonly b: WorldPos
}

const standard = (color: string, extra?: Partial<THREE.MeshStandardMaterialParameters>) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, ...extra })

/** Caja plana orientada según la rotación que aplica scene.ts. */
const ribbon = (length: number, width: number, height: number, material: THREE.Material): THREE.Mesh =>
  new THREE.Mesh(new THREE.BoxGeometry(length, height, width), material)

/** AC-3: cinta principal + falda suave (más ancha y translúcida) de una arista. */
export function buildEdgeMeshes(edge: EdgeSpec): { readonly main: THREE.Mesh; readonly soft: THREE.Mesh } {
  const { height, width, color, soft, softColor, softOpacity, seed } = BOARD3D.edge
  const length = Math.hypot(edge.b.x - edge.a.x, edge.b.z - edge.a.z)
  const rng = rngSeq(fnv1a(`${seed}:${edge.key}`))

  const main = ribbon(length, width, height, standard(color))
  main.name = `edge:${edge.key}`
  main.position.set((edge.a.x + edge.b.x) / 2, height / 2, (edge.a.z + edge.b.z) / 2)
  main.rotation.y = Math.atan2(-(edge.b.z - edge.a.z), edge.b.x - edge.a.x)

  const extra = soft * (0.7 + 0.6 * rng())
  const softMesh = ribbon(length, width + 2 * extra, height, new THREE.MeshBasicMaterial({
    color: softColor,
    transparent: true,
    opacity: softOpacity,
    depthWrite: false,
  }))
  softMesh.name = `edgesoft:${edge.key}`
  softMesh.position.set((edge.a.x + edge.b.x) / 2, height * 0.35, (edge.a.z + edge.b.z) / 2)
  softMesh.rotation.y = main.rotation.y
  return { main, soft: softMesh }
}

interface PebbleSpot {
  readonly x: number
  readonly z: number
  readonly scale: number
  /** Arista a la que pertenece (para verificar su banda lateral). */
  readonly edge: string
}

const pebbleSpots = (edges: readonly EdgeSpec[]): readonly PebbleSpot[] => {
  const { spacing, sideMin, sideMax, seed } = BOARD3D.pebbles
  const spots: PebbleSpot[] = []
  for (const edge of edges) {
    const dx = edge.b.x - edge.a.x
    const dz = edge.b.z - edge.a.z
    const length = Math.hypot(dx, dz)
    if (length <= 0) continue
    const count = Math.max(1, Math.round(length / spacing))
    const ux = dx / length
    const uz = dz / length
    const rng = rngSeq(fnv1a(`${seed}:${edge.key}`))
    for (let index = 0; index < count; index += 1) {
      for (const side of [-1, 1] as const) {
        const t = Math.min(0.95, Math.max(0.05, (index + 0.5) / count + (rng() - 0.5) * (0.5 / count)))
        const lateral = side * (sideMin + rng() * (sideMax - sideMin))
        const scale = 0.7 + 0.6 * rng()
        spots.push({
          x: edge.a.x + dx * t - uz * lateral,
          z: edge.a.z + dz * t + ux * lateral,
          scale,
          edge: edge.key,
        })
      }
    }
  }
  return spots
}

/** AC-3: guijarros instanciados (1 draw call) a los lados de todas las aristas. */
export function buildPebbles(edges: readonly EdgeSpec[], rockColor: string): THREE.InstancedMesh {
  const { size } = BOARD3D.pebbles
  const spots = pebbleSpots(edges)
  const mesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(size, 0),
    standard(rockColor),
    spots.length,
  )
  mesh.name = 'pebbles'
  mesh.userData.edgeOf = spots.map((spot) => spot.edge)
  const matrix = new THREE.Matrix4()
  spots.forEach((spot, index) => {
    const squash = 0.75
    matrix.makeScale(spot.scale, spot.scale * squash, spot.scale)
    matrix.setPosition(spot.x, (size * spot.scale * squash) / 2, spot.z)
    mesh.setMatrixAt(index, matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}
