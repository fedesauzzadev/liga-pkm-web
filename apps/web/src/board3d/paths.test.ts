// AC: SPEC-H/T-067/AC-3 — camino de tierra: cinta 0,16 #C9A877 con falda
// suave por arista y guijarros instanciados deterministas a los lados.
// Numérico (NO-VISION).
import { expect, test } from 'vitest'
import { BoardGraphSchema, type BoardGraph } from '@liga/content'
import * as THREE from 'three'
import kantoJson from '../../../../content/board/kanto.json'
import { BOARD3D } from '../theme/board3d'
import { boardDecor } from './decor'
import { buildBoardScene, nodeWorldPos } from './scene'
import { deckStacks } from './stacks'

const board: BoardGraph = BoardGraphSchema.parse(kantoJson)
const imageSize = board.meta.imageSize
const scene = buildBoardScene(board, deckStacks, boardDecor)

interface Segment {
  readonly ax: number
  readonly az: number
  readonly bx: number
  readonly bz: number
}

const segments: readonly Segment[] = board.edges.flatMap(([fromId, toId]) => {
  const from = board.nodes.find((node) => node.id === fromId)
  const to = board.nodes.find((node) => node.id === toId)
  if (from === undefined || to === undefined) return []
  const a = nodeWorldPos(from, imageSize)
  const b = nodeWorldPos(to, imageSize)
  return [{ ax: a.x, az: a.z, bx: b.x, bz: b.z }]
})

const distToSegment = (x: number, z: number, seg: Segment): number => {
  const abx = seg.bx - seg.ax
  const abz = seg.bz - seg.az
  const len2 = abx * abx + abz * abz
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - seg.ax) * abx + (z - seg.az) * abz) / len2))
  return Math.hypot(x - (seg.ax + abx * t), z - (seg.az + abz * t))
}

test('AC: SPEC-H/T-067/AC-3 - cinta de tierra 0,16 #C9A877 con falda suave por arista', () => {
  expect(BOARD3D.edge.color.toLowerCase()).toBe('#c9a877')
  for (const [fromId, toId] of board.edges) {
    const main = scene.root.getObjectByName(`edge:${fromId}-${toId}`) as THREE.Mesh | undefined
    const soft = scene.root.getObjectByName(`edgesoft:${fromId}-${toId}`) as THREE.Mesh | undefined
    if (main === undefined || soft === undefined) throw new Error(`falta camino ${fromId}-${toId}`)
    const mainParams = (main.geometry as THREE.BoxGeometry).parameters
    expect(mainParams.depth).toBeCloseTo(BOARD3D.edge.width, 5)
    expect(`#${(main.material as THREE.MeshStandardMaterial).color.getHexString()}`).toBe(
      BOARD3D.edge.color.toLowerCase(),
    )
    const softParams = (soft.geometry as THREE.BoxGeometry).parameters
    expect(softParams.depth, `falda más ancha que la cinta`).toBeGreaterThan(BOARD3D.edge.width)
    const softMaterial = soft.material as THREE.MeshBasicMaterial
    expect(softMaterial.transparent).toBe(true)
    expect(softMaterial.opacity).toBeCloseTo(BOARD3D.edge.softOpacity, 5)
    expect(soft.position.y).toBeLessThan(main.position.y)
  }
})

test('AC: SPEC-H/T-067/AC-3 - guijarros instanciados a los lados de su camino, sobre el terreno', () => {
  const pebbles = scene.pebbles
  expect(pebbles.count).toBeGreaterThan(0)
  expect(pebbles.name).toBe('pebbles')
  const segmentByKey = new Map(segments.map((seg, index) => [board.edges[index]?.join('-') ?? '', seg]))
  const edgeOf = pebbles.userData.edgeOf as readonly string[]
  expect(edgeOf.length).toBe(pebbles.count)
  const matrix = new THREE.Matrix4()
  const point = new THREE.Vector3()
  const quart = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  for (let index = 0; index < pebbles.count; index += 1) {
    pebbles.getMatrixAt(index, matrix)
    matrix.decompose(point, quart, scale)
    expect(point.y, `guijarro ${index} sobre el terreno`).toBeGreaterThanOrEqual(-1e-6)
    // Banda lateral respecto de SU arista (los caminos pueden cruzarse).
    const own = segmentByKey.get(edgeOf[index] ?? '')
    if (own === undefined) throw new Error(`guijarro ${index} sin arista propia`)
    const lateral = distToSegment(point.x, point.z, own)
    expect(lateral, `guijarro ${index} fuera de la cinta`).toBeGreaterThanOrEqual(BOARD3D.pebbles.sideMin - 1e-6)
    expect(lateral, `guijarro ${index} en la banda lateral`).toBeLessThanOrEqual(BOARD3D.pebbles.sideMax + 1e-6)
  }
})

test('AC: SPEC-H/T-067/AC-3 - determinismo: mismo board ⇒ mismas instancias de guijarros', () => {
  const again = buildBoardScene(board, deckStacks, boardDecor)
  expect(again.pebbles.count).toBe(scene.pebbles.count)
  const a = new THREE.Matrix4()
  const b = new THREE.Matrix4()
  for (let index = 0; index < scene.pebbles.count; index += 1) {
    scene.pebbles.getMatrixAt(index, a)
    again.pebbles.getMatrixAt(index, b)
    expect(a.equals(b), `guijarro ${index}`).toBe(true)
  }
})
