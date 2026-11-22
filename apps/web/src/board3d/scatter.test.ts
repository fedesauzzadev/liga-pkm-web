// AC: SPEC-H/T-068/AC-3 + AC-4 + AC-5 — relleno de zonas: posiciones decididas
// por el plan de ocupación único (SPEC-O/T-095), clearance de caminos/nodos/
// pedestales según decor.collision.json (buffer + radio de categoría), todo
// dentro del mundo, instancias para la masa y presupuestos de decor.json
// cumplidos en el build inicial. Numérico.
import { expect, test } from 'vitest'
import { BoardGraphSchema, type BoardGraph } from '@liga/content'
import * as THREE from 'three'
import kantoJson from '../../../../content/board/kanto.json'
import { boardDecor } from './decor'
import { boardCollision } from './decor/plan'
import { estimateDrawCalls, estimateTriangles } from './budget'
import { buildBoardScene, buildWorldInput } from './scene'
import { applyScatterOcclusion } from './models/occlusion'
import { applyFillScale } from './scatter'
import { fillScaleFor } from './perf-profile'
import { boardStyle } from './style'
import { deckStacks } from './stacks'
import { distToSegment } from './world'

const board: BoardGraph = BoardGraphSchema.parse(kantoJson)
const scene = buildBoardScene(board, deckStacks, boardDecor)
const input = buildWorldInput(board, deckStacks, boardDecor)

interface ScatterInstance {
  readonly mesh: THREE.InstancedMesh
  readonly x: number
  readonly z: number
}

const instancesOf = (root: THREE.Group): readonly ScatterInstance[] => {
  const instances: ScatterInstance[] = []
  const matrix = new THREE.Matrix4()
  const vector = new THREE.Vector3()
  for (const child of root.children) {
    if (!(child instanceof THREE.InstancedMesh)) continue
    for (let index = 0; index < child.count; index += 1) {
      child.getMatrixAt(index, matrix)
      vector.setFromMatrixPosition(matrix)
      instances.push({ mesh: child, x: vector.x, z: vector.z })
    }
  }
  return instances
}

test('AC: SPEC-H/T-068/AC-3 + AC-5a - ningún relleno viola clearance ni pisa el pedestal', () => {
  // T-095: el clearance ahora sale del mapa de ocupación — buffer de road del
  // decor.collision.json MÁS el radio de la categoría de cada pieza (antes era
  // una distancia fija centro-a-centro y las piezas grandes pisaban caminos).
  const road = boardCollision.categories.road
  const radiusOfCategory = (mesh: THREE.InstancedMesh): number =>
    boardCollision.categories[String(mesh.userData.category)]?.radius ?? 0.1
  const instances = instancesOf(scene.scatter)
  expect(instances.length).toBeGreaterThan(80)
  for (const instance of instances) {
    const radius = radiusOfCategory(instance.mesh)
    for (const node of input.nodes) {
      expect(Math.hypot(instance.x - node.x, instance.z - node.z), `${instance.mesh.name} cerca de ${node.id}`)
        .toBeGreaterThanOrEqual((road?.nodeBuffer ?? 0.4) + radius - 1e-6)
    }
    for (const edge of input.edges) {
      expect(distToSegment(instance.x, instance.z, edge.a, edge.b), `${instance.mesh.name} sobre una arista`)
        .toBeGreaterThanOrEqual((road?.edgeBuffer ?? 0.45) + radius - 1e-6)
    }
    for (const biome of input.biomes) {
      expect(
        Math.hypot(instance.x - biome.center.x, instance.z - biome.center.z),
        `${instance.mesh.name} sobre el pedestal de ${biome.key}`,
      ).toBeGreaterThanOrEqual((boardCollision.categories.pedestal?.radius ?? 0.9) + radius - 1e-6)
    }
  }
})

test('AC: SPEC-H/T-068/AC-5b - todo el relleno queda dentro del mundo', () => {
  const half = boardStyle.world.size[0] / 2
  for (const instance of instancesOf(scene.scatter)) {
    expect(Math.abs(instance.x)).toBeLessThanOrEqual(half)
    expect(Math.abs(instance.z)).toBeLessThanOrEqual(half)
    expect(Number.isFinite(instance.x)).toBe(true)
    expect(Number.isFinite(instance.z)).toBe(true)
  }
})

test('AC: SPEC-H/T-068/AC-5c - mismo seed ⇒ mismas posiciones (build determinista)', () => {
  const again = buildBoardScene(board, deckStacks, boardDecor)
  const a = instancesOf(scene.scatter)
  const b = instancesOf(again.scatter)
  expect(b.length).toBe(a.length)
  for (let index = 0; index < a.length; index += 1) {
    expect(b[index]?.x).toBeCloseTo(a[index]?.x ?? Number.NaN, 12)
    expect(b[index]?.z).toBeCloseTo(a[index]?.z ?? Number.NaN, 12)
  }
})

test('AC: SPEC-H/T-068/AC-4 - árboles/rocas/arbustos/pasto/flores van por instancias', () => {
  const meshes = scene.scatter.children.filter((child) => child instanceof THREE.InstancedMesh)
  expect(meshes.length).toBeGreaterThan(0)
  expect(meshes.length).toBeLessThanOrEqual(30)
  const kinds = new Set(meshes.map((mesh) => String(mesh.userData.kind)))
  for (const kind of ['tree', 'rock', 'bush', 'grassTuft', 'flowerPatch']) {
    expect(kinds.has(kind), `${kind} instanciado`).toBe(true)
  }
  for (const mesh of meshes) {
    expect(mesh instanceof THREE.InstancedMesh && mesh.count, `${mesh.name} con instancias`).toBeGreaterThan(0)
  }
})

test('AC: SPEC-H/T-068/AC-5e - presupuestos de decor.json cumplidos en el build inicial', () => {
  const { maxDrawCalls, maxTriangles } = boardDecor.budgets
  const calls = estimateDrawCalls(scene.landmarks) + estimateDrawCalls(scene.scatter)
  const triangles = estimateTriangles(scene.landmarks) + estimateTriangles(scene.scatter)
  expect(calls).toBeLessThanOrEqual(maxDrawCalls)
  expect(triangles).toBeLessThanOrEqual(maxTriangles)
})

test('AC: SPEC-H/T-069/AC-6 - perfil bajo reduce el relleno a la mitad (fillScaleFor)', () => {
  const before = scene.scatter.children
    .filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh)
    .map((mesh) => mesh.count)
  applyFillScale(scene.scatter, fillScaleFor(true))
  const after = scene.scatter.children
    .filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh)
    .map((mesh) => mesh.count)
  expect(after.length).toBe(before.length)
  before.forEach((count, index) => {
    expect(after[index]).toBe(Math.round(count * 0.5))
  })
  applyFillScale(scene.scatter, fillScaleFor(false))
})

// AC: N-0030/AC-3 - sobre el scatter real: un arbol entre la camara y la ficha
// se oculta y la matriz vuelve intacta al correr la camara.
test('AC: N-0030/AC-3 - el arbol del scatter que tapa la ficha se oculta y vuelve', () => {
  const fresh = scene.scatter
  const tree = fresh.children.find((child) => child.userData.kind === 'tree') as THREE.InstancedMesh
  const before = Float32Array.from(tree.instanceMatrix.array)
  const [x, y, z] = [before[12]!, before[13]!, before[14]!]
  const token = new THREE.Vector3(x, y + 0.4, z - 1.5)
  const camera = new THREE.Vector3(x, y + 3.4, z + 3)
  expect(applyScatterOcclusion(fresh, camera, token)).toBeGreaterThanOrEqual(1)
  expect(tree.instanceMatrix.array[0]).toBe(0)
  expect(applyScatterOcclusion(fresh, new THREE.Vector3(x + 30, y + 3, z), token.setX(x + 25))).toBe(0)
  expect(Array.from(tree.instanceMatrix.array)).toEqual(Array.from(before))
})
