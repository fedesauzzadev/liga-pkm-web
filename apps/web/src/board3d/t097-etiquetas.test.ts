// AC: SPEC-O/T-097 — etiquetas siempre encima y legibles: anclaje 0,5 sobre el
// nodo (AC-1), overlay depthTest:false + renderOrder alto (AC-1), reglas T-078
// intactas (AC-2) y ninguna etiqueta visible cubierta por la caja en pantalla
// de un edificio, comprobado sobre sceneDump (AC-3). Numérico (NO-VISION).
import { expect, test } from 'vitest'
import {
  BoardGraphSchema,
  boxesOverlap,
  suppressedBuildingPieces,
  type BoardGraph,
} from '@liga/content'
import * as THREE from 'three'
import kantoJson from '../../../../content/board/kanto.json'
import { BOARD3D } from '../theme/board3d'
import { applyCenteredOffset, applySafeOffset, planOverview, safeArea } from './camera'
import { boardDecor } from './decor'
import { decorPlanFor } from './decor/plan'
import { buildSceneDump, computeSceneDump } from './dump'
import {
  applyLabelOverlay,
  labelItemsOf,
  labelsCoveredByBuildings,
  planLabels,
  type LabelViewCtx,
} from './labels'
import { buildLandmarks } from './landmarks'
import { leaderFlagColor } from './leaders'
import { boardPlacements, landmarkTransforms, solveBuildings } from './placements'
import { ImmersiveCamera, type RigFocus } from './rig'
import { boardLabels, buildBoardScene, buildWorldInput, nodeWorldPos } from './scene'
import { deckStacks } from './stacks'
import { boardStyle } from './style'

const WIDTH = 1440
const HEIGHT = 900
const ASPECT = WIDTH / HEIGHT
const MARGIN = BOARD3D.label.viewportMarginPx

const board: BoardGraph = BoardGraphSchema.parse(kantoJson)
const scene = buildBoardScene(board, deckStacks, boardDecor)
scene.root.updateMatrixWorld(true)
const imageSize = board.meta.imageSize
const style = boardStyle.labels

const poseCamera = (
  position: readonly [number, number, number],
  target: readonly [number, number, number],
  fov: number,
): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera(fov, ASPECT, BOARD3D.camera.near, BOARD3D.camera.far)
  camera.position.set(position[0], position[1], position[2])
  camera.up.set(0, 1, 0)
  camera.lookAt(new THREE.Vector3(target[0], target[1], target[2]))
  camera.updateMatrixWorld(true)
  return camera
}

// SPEC-R/T-101: el foco de la vista cercana pasó de paleta a fucsia — con los
// edificios agrandados y más lejos de los nodos, la explore de paleta ya no
// produce choques etiqueta↔edificio (chequeo vacío); la de fucsia sí.
const focusNode = board.nodes.find((node) => node.id === 'fucsia')
if (focusNode === undefined) throw new Error('falta el nodo fucsia')
const paletaWorld = nodeWorldPos(focusNode, imageSize)
const FOCUS: RigFocus = {
  tokenX: paletaWorld.x,
  tokenZ: paletaWorld.z,
  nextX: paletaWorld.x,
  nextZ: paletaWorld.z,
}
const TOKEN: readonly [number, number, number] = [paletaWorld.x, BOARD3D.token.lift, paletaWorld.z]

const overviewCamera = (): THREE.PerspectiveCamera => {
  const plan = planOverview(BOARD3D.base.width / 2, BOARD3D.base.depth / 2, ASPECT)
  const camera = poseCamera(plan.position, plan.target, plan.fovDeg)
  applySafeOffset(camera, safeArea, WIDTH, HEIGHT)
  return camera
}

const exploreCamera = (): THREE.PerspectiveCamera => {
  const rig = new ImmersiveCamera({
    halfWidth: BOARD3D.base.width / 2,
    halfDepth: BOARD3D.base.depth / 2,
    initialTarget: { x: paletaWorld.x, z: paletaWorld.z },
  })
  let res = rig.tick(0, FOCUS, ASPECT, '1x', false)
  for (let step = 1; step <= 300; step += 1) res = rig.tick(step * 16, FOCUS, ASPECT, '1x', false)
  const camera = poseCamera(
    [res.pose.position.x, res.pose.position.y, res.pose.position.z],
    [res.pose.target.x, res.pose.target.y, res.pose.target.z],
    res.pose.fov,
  )
  applyCenteredOffset(camera, safeArea, WIDTH, HEIGHT, new THREE.Vector3(...TOKEN), 0)
  return camera
}

const ctxOf = (camera: THREE.PerspectiveCamera, overrides: Partial<LabelViewCtx> = {}): LabelViewCtx => ({
  camera,
  width: WIDTH,
  height: HEIGHT,
  token: TOKEN,
  hovered: null,
  focused: [],
  ...overrides,
})

const items = labelItemsOf(boardLabels(board), imageSize, BOARD3D.label.lift)

// ── AC-1 ─────────────────────────────────────────────────────────────────────

test('AC: SPEC-O/T-097/AC-1 - anclaje 0,5 sobre el nodo y overlay depthTest:false con renderOrder alto', () => {
  expect(BOARD3D.label.lift).toBe(0.5)
  expect(BOARD3D.label.depthTest).toBe(false)
  expect(BOARD3D.label.renderOrder).toBeGreaterThanOrEqual(1000)
  expect(items.length).toBeGreaterThan(0)
  for (const item of items) {
    expect(item.world[1], `ancla de ${item.nodeId}`).toBeCloseTo(0.5, 12)
  }

  // El overlay se aplica al material simple y al multi-material del contorno.
  const material = new THREE.MeshBasicMaterial()
  const single = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
  applyLabelOverlay(single)
  expect(single.renderOrder).toBe(BOARD3D.label.renderOrder)
  expect(material.depthTest).toBe(false)

  const outline = new THREE.MeshBasicMaterial()
  const fill = new THREE.MeshBasicMaterial()
  const multi = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), [outline, fill])
  applyLabelOverlay(multi)
  expect(multi.renderOrder).toBe(BOARD3D.label.renderOrder)
  expect(outline.depthTest).toBe(false)
  expect(fill.depthTest).toBe(false)
})

// ── AC-2 ─────────────────────────────────────────────────────────────────────

test('AC: SPEC-O/T-097/AC-2 - se mantienen las reglas T-078: sin solapes, cajas completas y gym siempre visible', () => {
  expect(style.collision).toBe(true)
  expect(style.alwaysShow).toContain('gym')
  for (const camera of [overviewCamera(), exploreCamera()]) {
    const plan = planLabels(items, ctxOf(camera), style)
    const visible = plan.filter((entry) => entry.visible)
    expect(visible.length).toBeGreaterThan(0)
    for (let i = 0; i < visible.length; i += 1) {
      const a = visible[i]
      if (a === undefined) continue
      for (let j = i + 1; j < visible.length; j += 1) {
        const b = visible[j]
        if (b === undefined) continue
        expect(boxesOverlap(a.screenBBox, b.screenBBox), `${a.nodeId} vs ${b.nodeId}`).toBe(false)
      }
    }
    for (const entry of visible) {
      expect(entry.screenBBox.x, entry.nodeId).toBeGreaterThanOrEqual(MARGIN - 1e-6)
      expect(entry.screenBBox.x + entry.screenBBox.w, entry.nodeId).toBeLessThanOrEqual(WIDTH - MARGIN + 1e-6)
      expect(entry.screenBBox.y, entry.nodeId).toBeGreaterThanOrEqual(MARGIN - 1e-6)
      expect(entry.screenBBox.y + entry.screenBBox.h, entry.nodeId).toBeLessThanOrEqual(HEIGHT - MARGIN + 1e-6)
    }
    for (const entry of plan) {
      if (entry.type === 'gym' && entry.reason !== 'offscreen') {
        expect(entry.visible, `gym ${entry.nodeId} siempre visible`).toBe(true)
      }
    }
  }
})

// ── AC-3 ─────────────────────────────────────────────────────────────────────

test('AC: SPEC-O/T-097/AC-3 - sceneDump: ninguna etiqueta visible queda cubierta por la caja de un edificio', () => {
  // SPEC-P/T-099: en producción las piezas procedurales de los edificios ya
  // no se dibujan (las reemplaza la capa de modelos). Para seguir ejercitando
  // la garantía overlay vs. cajas en pantalla se construye el grupo con la
  // suppressión apagada (mismas posiciones que ocupaban los edificios).
  const landmarksAbiertos = buildLandmarks(
    buildWorldInput(board, deckStacks, boardDecor),
    board,
    boardDecor,
    leaderFlagColor,
    landmarkTransforms(board, boardDecor, solveBuildings(board, deckStacks)),
    new Set(decorPlanFor(board, deckStacks, boardDecor).hiddenLandmarks),
    suppressedBuildingPieces({ ...boardPlacements, proceduralBuildings: true }),
  )
  for (const camera of [overviewCamera(), exploreCamera()]) {
    const plan = planLabels(items, ctxOf(camera), style)
    // El mismo volcado que usa window.__debug.sceneDump() en desarrollo.
    const dump = buildSceneDump(
      computeSceneDump([...landmarksAbiertos.children], camera, WIDTH, HEIGHT),
      null,
      null,
      plan,
    )
    expect(dump.labels.some((entry) => entry.visible), 'etiquetas visibles en el dump').toBe(true)
    for (const label of dump.labels) {
      if (label.visible) {
        expect(label.overlay, `${label.text} visible sin overlay`).toBe(true)
      }
    }
    const buildings = dump.objects.flatMap((entry) =>
      entry.category === 'building' && entry.visible && entry.screenBBox !== null
        ? [{ name: entry.name, box: entry.screenBBox }]
        : [],
    )
    expect(buildings.length, 'edificios con caja en pantalla').toBeGreaterThan(0)
    const covered = labelsCoveredByBuildings(dump.labels, buildings)
    // El chequeo no es vacío: en estas vistas sí hay etiquetas cuya caja choca
    // con la de un edificio — el overlay es lo que impide que queden tapadas.
    expect(covered.length, 'etiquetas solapadas con edificios en esta vista').toBeGreaterThan(0)
    for (const hit of covered) {
      expect(
        hit.label.overlay,
        `${hit.label.text} choca con ${hit.building} sin overlay (quedaría tapada)`,
      ).toBe(true)
    }
  }
})
