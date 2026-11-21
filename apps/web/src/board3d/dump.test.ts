// AC: SPEC-G/T-062/AC-9 + SPEC-I/T-076/AC-8 + SPEC-H/T-069/AC-7 — volcado de
// escena en texto: nodos de kanto.json en viewport con la vista inicial, el
// estado de la cámara inmersiva y triángulos/draw calls del render.
import { expect, test } from 'vitest'
import { BoardGraphSchema, type BoardGraph } from '@liga/content'
import * as THREE from 'three'
import kantoJson from '../../../../content/board/kanto.json'
import { BOARD3D } from '../theme/board3d'
import { planOverview } from './camera'
import { boardDecor } from './decor'
import { decorPlanFor } from './decor/plan'
import { buildSceneDump, cameraDumpOf, computeSceneDump } from './dump'
import { buildBoardScene } from './scene'
import { deckStacks } from './stacks'

const board: BoardGraph = BoardGraphSchema.parse(kantoJson)
const scene = buildBoardScene(board, deckStacks, boardDecor)

const dumpWithInitialView = (width = 900, height = 900) => {
  const plan = planOverview(BOARD3D.base.width / 2, BOARD3D.base.depth / 2, width / height)
  const camera = new THREE.PerspectiveCamera(plan.fovDeg, width / height, plan.near, plan.far)
  camera.position.set(...plan.position)
  camera.lookAt(...plan.target)
  scene.root.updateMatrixWorld(true)
  const objects = [...scene.nodes.values(), ...scene.stacks.values()]
  return { plan, dump: computeSceneDump(objects, camera, width, height) }
}

test('AC: SPEC-G/AC-9 - sceneDump lista todos los nodos y mazos con campos completos y en viewport', () => {
  const { dump } = dumpWithInitialView()
  const names = new Set(dump.map((entry) => entry.name))

  for (const node of board.nodes) {
    expect(names.has(`node:${node.id}`), `falta node:${node.id}`).toBe(true)
  }
  for (const key of deckStacks.panels.map((p) => p.key)) {
    expect(names.has(`stack:${key}`), `falta stack:${key}`).toBe(true)
  }
  // T-090/AC-1: el sceneDump ya no lista pedestales Ítem/Sorpresa.
  expect(names.has('stack:item')).toBe(false)
  expect(names.has('stack:sorpresa')).toBe(false)

  for (const entry of dump) {
    expect(entry.visible).toBe(true)
    expect(entry.inViewport, `${entry.name} debería verse entero`).toBe(true)
    expect(entry.worldPos.length).toBe(3)
    expect(Number.isFinite(entry.worldPos[0])).toBe(true)
    expect(entry.screenPos[0]).toBeGreaterThanOrEqual(0)
    expect(entry.screenPos[0]).toBeLessThanOrEqual(900)
    expect(entry.screenPos[1]).toBeGreaterThanOrEqual(0)
    expect(entry.screenPos[1]).toBeLessThanOrEqual(900)
    expect(entry.screenBBox?.w ?? 0).toBeGreaterThan(0)
    expect(entry.screenBBox?.h ?? 0).toBeGreaterThan(0)
    expect(entry.type.length).toBeGreaterThan(0)
  }
})

test('AC: SPEC-G/AC-9 - un objeto fuera de cámara queda inViewport=false y respeta visible', () => {
  const plan = planOverview(BOARD3D.base.width / 2, BOARD3D.base.depth / 2, 1)
  const camera = new THREE.PerspectiveCamera(plan.fovDeg, 1, plan.near, plan.far)
  camera.position.set(...plan.position)
  camera.lookAt(...plan.target)

  const stray = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.2, 0.4),
    new THREE.MeshStandardMaterial(),
  )
  stray.name = 'node:lejos'
  stray.position.set(900, 0, 0)
  const hidden = stray.clone()
  hidden.name = 'node:oculto'
  hidden.visible = false

  const root = new THREE.Group()
  root.add(stray, hidden)
  root.updateMatrixWorld(true)

  const dump = computeSceneDump([stray, hidden], camera, 900, 900)
  const lejos = dump.find((entry) => entry.name === 'node:lejos')
  const oculto = dump.find((entry) => entry.name === 'node:oculto')
  expect(lejos?.inViewport).toBe(false)
  expect(oculto?.visible).toBe(false)
})

test('AC: SPEC-I/T-076/AC-8 - cameraDumpOf expone mode/position/target/distance/fov', () => {
  const camera = new THREE.PerspectiveCamera(55, 1440 / 900, 0.1, 200)
  camera.position.set(1, 2, 3)
  const target = new THREE.Vector3(0.5, 0, 0.5)
  const dump = cameraDumpOf('follow', camera, target)
  expect(dump.mode).toBe('follow')
  expect(dump.position).toEqual([1, 2, 3])
  expect(dump.target).toEqual([0.5, 0, 0.5])
  expect(dump.distance).toBeCloseTo(camera.position.distanceTo(target), 6)
  expect(dump.fov).toBe(55)
})

test('AC: SPEC-I/T-076/AC-8 - buildSceneDump arma { objects, camera, render }', () => {
  const { dump, plan } = dumpWithInitialView(1440, 900)
  const camera = new THREE.PerspectiveCamera(plan.fovDeg, 1440 / 900, plan.near, plan.far)
  camera.position.set(...plan.position)
  const target = new THREE.Vector3(...plan.target)
  const full = buildSceneDump(dump, cameraDumpOf('overview', camera, target))
  expect(full.objects.length).toBe(dump.length)
  expect(full.camera?.mode).toBe('overview')
  expect(full.camera?.fov).toBe(plan.fovDeg)
  expect(full.render).toBeNull()
})

test('AC: SPEC-H/T-069/AC-7 - el dump informa triángulos y draw calls (gl.info)', () => {
  const full = buildSceneDump([], null, { triangles: 1234, calls: 12 })
  expect(full.render).toEqual({ triangles: 1234, calls: 12 })
})

test('AC: SPEC-H/T-068/AC-6 - el dump incluye cada landmark con name, bbox y nodeId', () => {
  const { plan } = dumpWithInitialView()
  const camera = new THREE.PerspectiveCamera(plan.fovDeg, 1, plan.near, plan.far)
  camera.position.set(...plan.position)
  camera.lookAt(...plan.target)
  const dump = computeSceneDump(scene.landmarks.children, camera, 900, 900)
  expect(dump.length).toBeGreaterThan(0)
  for (const entry of dump) {
    expect(entry.name.startsWith('landmark:'), entry.name).toBe(true)
    expect(entry.nodeId, `${entry.name} con nodeId`).toBeTruthy()
    expect(entry.screenBBox, `${entry.name} con bbox`).not.toBeNull()
  }
  const paleta = dump.filter((entry) => entry.nodeId === 'paleta')
  // T-095: las piezas pisadas por edificios del solver se ocultan (paleta:1
  // casa y paleta:2 árbol) — el dump refleja el mapa de ocupación.
  const hiddenPaleta = decorPlanFor(board, deckStacks, boardDecor).hiddenLandmarks
    .filter((id) => id.startsWith('paleta:'))
  expect(paleta.length).toBe(6 - hiddenPaleta.length)
  // SPEC-P/T-099/AC-B1: las piezas procedurales de los edificios (centros,
  // gimnasios…) ya NO se dibujan — el dump solo lista lo construido; los
  // edificios reales entran por la capa de modelos con su propio nombre
  // (`model:…`), cubierto en t099-edificios.test.tsx.
  const centros = dump.filter((entry) => entry.name.includes(':pokecenter:'))
  expect(centros.length).toBe(0)
})
