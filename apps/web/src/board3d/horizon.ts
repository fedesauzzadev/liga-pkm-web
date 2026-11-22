// Horizonte (SPEC-J/T-079): dos anillos de montañas lejanas con cima nevada y
// alturas escalonadas (AC-4) + anillo de arbolado denso instanciado entre el
// borde del tablero y las colinas (AC-5). Three puro (NO-VISION); los números
// vienen de content/board/style.json (distantMountains, treeRing).
import type { BoardStyle } from '@liga/content'
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'
import { pieceMaterial, type PiecePart } from './decor/geometry'
import { piecePartsOf } from './decor/registry'
import { fnv1a, rngSeq } from './rand'
import { smoothstep } from './smooth'

/** Paleta de piezas (decor.palette): leafGreen/leafDark/wood/snow. */
export interface HorizonInput {
  readonly style: BoardStyle
  readonly palette: Readonly<Record<string, string>>
  /** Alto del terreno en (x, z) — inyectado para evitar ciclos con world.ts. */
  readonly terrainHeightAt: (x: number, z: number) => number
}

const hash2 = (ix: number, iz: number, seed: number): number => {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 2246822519)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

/** Cono de montaña con color por vértice: cuerpo + cima nevada (AC-4). */
function mountainCone(
  h: number,
  body: THREE.Color,
  snowColor: THREE.Color,
  snow: boolean,
  haze: THREE.Color,
  hazeRing: number,
): THREE.Mesh {
  const geometry = new THREE.ConeGeometry(h * 0.85, h, 7)
  const position = geometry.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(position.count * 3)
  const color = new THREE.Color()
  for (let index = 0; index < position.count; index += 1) {
    const t = Math.min(1, Math.max(0, (position.getY(index) + h / 2) / h))
    const snowMix = snow ? smoothstep(0.48, 0.6, t) : 0
    color.copy(body).lerp(snowColor, snowMix)
    // N-0015: perspectiva aérea — más velo cuanto más lejos el anillo y más abajo el vértice.
    const veil = hazeRing + (BOARD3D.world.haze.base * (1 - t) * (1 - hazeRing))
    color.lerp(haze, Math.min(1, veil))
    colors[index * 3] = color.r
    colors[index * 3 + 1] = color.g
    colors[index * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true }),
  )
  return mesh
}

/**
 * AC-4: montañas por ring de distantMountains.rings — azules-grisáceas con
 * cima nevada, alturas escalonadas (índice par ⇒ banda baja, impar ⇒ alta).
 */
export function buildDistantMountains(style: BoardStyle, palette: Readonly<Record<string, string>>): THREE.Group {
  const root = new THREE.Group()
  root.name = 'mountains'
  const snowColor = new THREE.Color(palette.snow ?? '#F4F7FA')
  const { rings, seed } = style.distantMountains
  const haze = new THREE.Color(style.fog.color)
  rings.forEach((ring, ringIndex) => {
    const group = new THREE.Group()
    group.name = `mountainRing:${String(ringIndex)}`
    for (let index = 0; index < ring.count; index += 1) {
      const rAngle = hash2(index, 1 + ringIndex * 10, seed)
      const rDist = hash2(index, 2 + ringIndex * 10, seed)
      const rHeight = hash2(index, 3 + ringIndex * 10, seed)
      const rShade = hash2(index, 4 + ringIndex * 10, seed)
      const angle = (2 * Math.PI * index) / ring.count + (rAngle - 0.5) * (Math.PI / ring.count)
      // Escalón de altura: par ⇒ mitad baja del rango, impar ⇒ mitad alta.
      const band = index % 2 === 0 ? 0.15 + 0.25 * rHeight : 0.6 + 0.25 * rHeight
      const h = ring.height[0] + (ring.height[1] - ring.height[0]) * band
      const body = new THREE.Color(ring.color).multiplyScalar(0.86 + 0.22 * rShade)
      const cone = mountainCone(h, body, snowColor, ring.snow, haze, BOARD3D.world.haze.ring[Math.min(ringIndex, 1)] ?? 0.5)
      cone.name = `mountain:${ringIndex}:${String(index)}`
      const dist = ring.radius * (0.94 + 0.12 * rDist)
      cone.position.set(Math.cos(angle) * dist, h / 2 - 0.3, Math.sin(angle) * dist)
      cone.rotation.y = rAngle * Math.PI
      group.add(cone)
    }
    root.add(group)
  })
  return root
}

interface TreeSpot {
  readonly x: number
  readonly z: number
  readonly y: number
  readonly scale: number
  readonly rotY: number
}

const instanceMatrices = (spots: readonly TreeSpot[]): THREE.Matrix4[] => {
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

/** AC-5: anillo denso de árboles instanciados (pine + round), determinista. */
export function buildTreeRing(input: HorizonInput): THREE.Group {
  const root = new THREE.Group()
  root.name = 'treeRing'
  const { treeRing, world } = input.style
  const rng = rngSeq(fnv1a(`treeRing:${String(treeRing.seed)}`))
  const { scaleMin, scaleMax, lift } = BOARD3D.decor.scatter
  const spots: { variant: 'pine' | 'round'; spot: TreeSpot }[] = []
  for (let index = 0; index < treeRing.count; index += 1) {
    // Radio con raíz ⇒ densidad uniforme en el anillo.
    const inner = treeRing.innerRadius ** 2
    const outer = treeRing.outerRadius ** 2
    const r = Math.sqrt(inner + rng() * (outer - inner))
    const angle = rng() * Math.PI * 2
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r
    spots.push({
      variant: rng() < 0.5 ? 'pine' : 'round',
      spot: {
        x,
        z,
        y: input.terrainHeightAt(x, z) + lift,
        scale: scaleMin + rng() * (scaleMax - scaleMin),
        rotY: rng() * Math.PI * 2,
      },
    })
  }
  for (const variant of ['pine', 'round'] as const) {
    const ofVariant = spots.filter((entry) => entry.variant === variant).map((entry) => entry.spot)
    if (ofVariant.length === 0) continue
    const parts: readonly PiecePart[] = piecePartsOf({ kind: 'tree', variant }, input.palette) ?? []
    parts.forEach((part: PiecePart, partIndex: number) => {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material ?? pieceMaterial, ofVariant.length)
      mesh.name = `treeRing:${variant}:${String(partIndex)}`
      mesh.userData = { zone: 'treeRing', kind: 'tree', baseCount: ofVariant.length, world: world.size[0] }
      instanceMatrices(ofVariant).forEach((matrix, index) => mesh.setMatrixAt(index, matrix))
      mesh.instanceMatrix.needsUpdate = true
      root.add(mesh)
    })
  }
  return root
}
