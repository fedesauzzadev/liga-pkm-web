import * as THREE from 'three'
import { expect, test } from 'vitest'
import { gameContent } from '../game/content'
import { BOARD3D } from '../theme/board3d'
import { boardDecor } from './decor'
import { buildBoardScene } from './scene'
import { deckStacks } from './stacks'
import { faceWanderers, setWandererTexture, stepWanderers } from './wanderers'

const CFG = BOARD3D.world.wanderer
const scene = buildBoardScene(gameContent.board, deckStacks, boardDecor)
const group = scene.world.wanderers
const data = (mesh: THREE.Object3D): { path: number[]; dex: number } => mesh.userData as { path: number[]; dex: number }

test('AC: N-0034/AC-2 - hay pokémon salvajes en el mapa, invisibles hasta tener sprite y sin sombra', () => {
  expect(group.children.length).toBeGreaterThanOrEqual(8)
  for (const mesh of group.children) {
    expect(mesh.visible).toBe(false)
    expect((mesh as THREE.Mesh).material).toBeInstanceOf(THREE.MeshBasicMaterial)
    expect(Object.values(CFG.species).flat()).toContain(data(mesh).dex)
  }
})

test('AC: N-0034/AC-3 - el circuito es cerrado, fuera del agua y lejos de nodos', () => {
  const nodes = [...scene.nodes.values()].map((node) => node.position)
  const waterLevel = (x: number, z: number): number => {
    const mesh = scene.world.waters.find((water) => Math.hypot(water.position.x - x, water.position.z - z) < 2.5)
    return mesh === undefined ? Number.NEGATIVE_INFINITY : mesh.position.y
  }
  for (const mesh of group.children) {
    const { path } = data(mesh)
    expect(path.length % 3).toBe(0)
    expect(path[1]).toBeGreaterThan(waterLevel(path[0]!, path[2]!))
    for (let index = 0; index < path.length; index += 3) {
      for (const node of nodes) {
        // clearDistance ondula ±clearWobble/2: margen holgado.
        expect(Math.hypot(path[index]! - node.x, path[index + 2]! - node.z)).toBeGreaterThan(CFG.clearance / 2)
      }
    }
  }
})

test('AC: N-0034/AC-3 - caminan: la posición cambia con el tiempo y es determinista', () => {
  const mesh = group.children[0]!
  stepWanderers(group, 0)
  const start = mesh.position.clone()
  stepWanderers(group, 2)
  expect(mesh.position.distanceTo(start)).toBeGreaterThan(0.1)
  stepWanderers(group, 0)
  expect(mesh.position.distanceTo(start)).toBeCloseTo(0, 6)
})

test('AC: N-0034/AC-4 - billboard: copia la orientación de la cámara y se espeja según hacia dónde camina en pantalla', () => {
  const mesh = group.children[0]!
  setWandererTexture(mesh, new THREE.Texture(), 60, 50)
  expect(mesh.visible).toBe(true)
  expect(mesh.scale.y).toBeCloseTo(50 * CFG.unitsPerPx)
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(3, 8, 9)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  faceWanderers(group, camera)
  expect(mesh.quaternion.angleTo(camera.quaternion)).toBeCloseTo(0, 6)
  const facing = Math.sign(mesh.scale.x)
  // Cámara del lado opuesto ⇒ el mismo paso se ve hacia el otro lado.
  camera.position.set(-3, 8, -9)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  faceWanderers(group, camera)
  expect(Math.sign(mesh.scale.x)).toBe(-facing)
  expect(mesh.quaternion.angleTo(camera.quaternion)).toBeCloseTo(0, 6)
})
