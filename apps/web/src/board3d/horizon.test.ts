// AC: SPEC-J/T-079 — horizonte: dos anillos de montañas lejanas con cima
// nevada y alturas escalonadas (AC-4) y anillo de arbolado denso instanciado
// entre el borde del tablero y las colinas (AC-5). Numérico (NO-VISION).
import { expect, test } from 'vitest'
import { BoardGraphSchema, type BoardGraph } from '@liga/content'
import * as THREE from 'three'
import kantoJson from '../../../../content/board/kanto.json'
import { BOARD3D } from '../theme/board3d'
import { boardDecor } from './decor'
import { buildDistantMountains, buildTreeRing } from './horizon'
import { buildWorldInput } from './scene'
import { boardStyle } from './style'
import { deckStacks } from './stacks'

const board: BoardGraph = BoardGraphSchema.parse(kantoJson)
const input = buildWorldInput(board, deckStacks, boardDecor, boardStyle)
const heightStub = (x: number, z: number): number => input.nodes.length + x + z
const mountains = buildDistantMountains(boardStyle, boardDecor.palette)
const treeRing = buildTreeRing({ style: boardStyle, palette: boardDecor.palette, terrainHeightAt: heightStub })

test('AC: SPEC-J/T-079/AC-4 - dos anillos de montañas con conteo, radio y alturas del estilo', () => {
  const rings = boardStyle.distantMountains.rings
  expect(mountains.name).toBe('mountains')
  const groups = mountains.children
  expect(groups.length).toBe(rings.length)
  expect(rings.length).toBe(2)
  const halfDiag = Math.hypot(BOARD3D.base.width, BOARD3D.base.depth) / 2
  groups.forEach((group, ringIndex) => {
    const ring = rings[ringIndex]!
    expect(group.name).toBe(`mountainRing:${String(ringIndex)}`)
    expect(group.children.length).toBe(ring.count)
    for (const child of group.children) {
      const cone = child as THREE.Mesh
      const dist = Math.hypot(cone.position.x, cone.position.z)
      expect(dist, `${cone.name} radio`).toBeGreaterThan(halfDiag)
      expect(dist).toBeGreaterThanOrEqual(ring.radius * 0.9)
      expect(dist).toBeLessThanOrEqual(ring.radius * 1.1)
      // Altura reconstruible desde la posición (base hundida 0,3; y = h/2 - 0,3).
      const h = (cone.position.y + 0.3) * 2
      expect(h).toBeGreaterThanOrEqual(ring.height[0] - 1e-6)
      expect(h).toBeLessThanOrEqual(ring.height[1] + 1e-6)
    }
  })
})

test('AC: SPEC-J/T-079/AC-4 - cimas nevadas y alturas escalonadas (par bajo, impar alto)', () => {
  const snow = new THREE.Color(boardDecor.palette.snow ?? '#F4F7FA')
  const ringBody = new THREE.Color()
  boardStyle.distantMountains.rings.forEach((ring, ringIndex) => {
    let lows = 0
    let highs = 0
    for (const child of mountains.children[ringIndex]!.children) {
      const cone = child as THREE.Mesh
      const geometry = cone.geometry as THREE.ConeGeometry
      const attr = geometry.attributes.color as THREE.BufferAttribute
      const position = geometry.attributes.position as THREE.BufferAttribute
      const h = geometry.parameters.height
      const [hMin, hMax] = ring.height
      if ((h - hMin) / (hMax - hMin) < 0.5) lows += 1
      else highs += 1
      if (!ring.snow) continue
      // Cima (vértice más alto): nieve; base (más bajo): color del anillo oscurecido.
      let apex = 0
      let baseIdx = 0
      for (let i = 1; i < position.count; i += 1) {
        if (position.getY(i) > position.getY(apex)) apex = i
        if (position.getY(i) < position.getY(baseIdx)) baseIdx = i
      }
      const apexColor = new THREE.Color(attr.getX(apex), attr.getY(apex), attr.getZ(apex))
      expect(
        Math.abs(apexColor.r - snow.r) + Math.abs(apexColor.g - snow.g) + Math.abs(apexColor.b - snow.b),
        `${cone.name} cima nevada`,
      ).toBeLessThan(0.1)
      const baseColor = new THREE.Color(attr.getX(baseIdx), attr.getY(baseIdx), attr.getZ(baseIdx))
      ringBody.set(ring.color)
      expect(
        Math.abs(baseColor.r - ringBody.r) + Math.abs(baseColor.g - ringBody.g),
        `${cone.name} cuerpo del anillo`,
      ).toBeLessThan(0.35)
    }
    // Escalonado: hay montañas en las dos mitades del rango (no todas iguales).
    expect(lows, `ring ${String(ringIndex)} banda baja`).toBeGreaterThan(0)
    expect(highs, `ring ${String(ringIndex)} banda alta`).toBeGreaterThan(0)
  })
})

test('AC: SPEC-J/T-079/AC-5 - anillo de arbolado instanciado dentro del anillo, apoyado y determinista', () => {
  const { innerRadius, outerRadius, count } = boardStyle.treeRing
  const meshes = treeRing.children.filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh)
  expect(meshes.length).toBeGreaterThan(0)

  const matrix = new THREE.Matrix4()
  const translation = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const farthestNode = Math.max(...input.nodes.map((node) => Math.hypot(node.x, node.z)))
  let placed = 0
  const positions: [number, number][] = []
  for (const mesh of meshes) {
    expect(typeof mesh.userData.baseCount).toBe('number')
    for (let index = 0; index < mesh.count; index += 1) {
      mesh.getMatrixAt(index, matrix)
      matrix.decompose(translation, quaternion, scale)
      const r = Math.hypot(translation.x, translation.z)
      expect(r, `${mesh.name}#${String(index)} dentro del anillo`).toBeGreaterThanOrEqual(innerRadius - 1e-6)
      expect(r).toBeLessThanOrEqual(outerRadius + 1e-6)
      // Fuera del tablero (más lejos que el nodo más lejano) y apoyado en el terreno.
      expect(r).toBeGreaterThan(farthestNode)
      expect(translation.y).toBeCloseTo(heightStub(translation.x, translation.z) + BOARD3D.decor.scatter.lift, 4)
      positions.push([translation.x, translation.z])
      placed += 1
    }
  }
  expect(placed).toBe(count)
  // Denso y bien repartido: los 8 octantes cubiertos.
  const perOctant = new Array<number>(8).fill(0)
  for (const [x, z] of positions) {
    const octant = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI / 4)) % 8)
    perOctant[octant] = (perOctant[octant] ?? 0) + 1
  }
  for (let octant = 0; octant < 8; octant += 1) {
    expect(perOctant[octant] ?? 0, `octante ${String(octant)} denso`).toBeGreaterThan(count / 16)
  }

  const again = buildTreeRing({ style: boardStyle, palette: boardDecor.palette, terrainHeightAt: heightStub })
  const first = meshes[0]!
  const second = again.children.find((child) => child.name === first.name) as THREE.InstancedMesh
  const a = new THREE.Matrix4()
  const b = new THREE.Matrix4()
  for (let index = 0; index < first.count; index += 7) {
    first.getMatrixAt(index, a)
    second.getMatrixAt(index, b)
    expect(b.equals(a), `#${String(index)} determinista`).toBe(true)
  }
})
