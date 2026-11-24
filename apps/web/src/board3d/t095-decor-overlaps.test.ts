// AC: SPEC-O/T-095 — decoración sin solapamientos en la escena REAL: el plan
// de ocupación único decide todo el scatter, el agua va por el plan, cada
// objeto tiene categoría (AC-5), nada pisa caminos/nodos/edificios/pedestales
// y los presupuestos (decor.budgets y profiles.high) se mantienen. Numérico.
import { expect, test } from 'vitest'
import { BoardGraphSchema, nearestPanel, type BoardGraph } from '@liga/content'
import kantoJson from '../../../../content/board/kanto.json'
import { boardDecor } from './decor'
import { boardCollision, decorPlanFor } from './decor/plan'
import { estimateDrawCalls, estimateTriangles } from './budget'
import { modelDecorSpecs } from './ModelDecor'
import { buildBoardScene, buildWorldInput } from './scene'
import { boardStyle } from './style'
import { deckStacks } from './stacks'
import { buildWorld } from './world'

const board: BoardGraph = BoardGraphSchema.parse(kantoJson)
const plan = decorPlanFor(board, deckStacks, boardDecor)
const input = buildWorldInput(board, deckStacks, boardDecor)
const scene = buildBoardScene(board, deckStacks, boardDecor)
const world = buildWorld(input)

test('AC: SPEC-O/T-095/AC-1 + AC-7 - cero solapamientos y todo con categoría', () => {
  expect(plan.map.overlappingPairs()).toEqual([])
  // Nada colocado por el plan pisa caminos/nodos (buffer + radio de categoría).
  // El agua tiene sus propias reglas (roadGap.node / underRoads) ⇒ se saltea.
  const road = boardCollision.categories.road
  for (const footprint of plan.map.all) {
    if (footprint.fixed || footprint.category === 'water') continue
    for (const node of input.nodes) {
      expect(Math.hypot(footprint.x - node.x, footprint.z - node.z), `${footprint.id} sobre nodo`)
        .toBeGreaterThanOrEqual((road?.nodeBuffer ?? 0.4) + footprint.radius - 1e-6)
    }
  }
  // AC-5: ningún objeto sin categoría — scatter y landmarks.
  for (const mesh of scene.scatter.children) {
    expect(mesh.userData.category, `${mesh.name} sin categoría`).toBeTruthy()
  }
  for (const landmark of scene.landmarks.children) {
    expect(landmark.userData.category, `${landmark.name} sin categoría`).toBeTruthy()
  }
})

test('AC: SPEC-O/T-095/AC-3 - el agua del plan manda en el terreno (omisión incluida)', () => {
  const lake = plan.water.find((water) => water.zone === 'isla')
  if (lake === undefined) {
    // Q-068: el panel Isla está cruzado por caminos; no entra ni el mínimo
    // (0,8) ⇒ el estanque se omite y el mundo queda SIN lago.
    expect(plan.omittedWater).toContain('isla')
    expect(world.water).toBeNull()
    return
  }
  expect(lake.radius).toBeGreaterThanOrEqual(boardCollision.waterRules.minRadius - 1e-6)
  expect(world.water).not.toBeNull()
  const keepFree = new Set(boardCollision.waterRules.keepFree)
  const margin = boardCollision.categories.water?.margin ?? 0.35
  for (const footprint of plan.map.all) {
    if (footprint.id === 'water:isla' || !keepFree.has(footprint.category)) continue
    expect(Math.hypot(footprint.x - lake.x, footprint.z - lake.z))
      .toBeGreaterThanOrEqual(lake.radius + margin + footprint.radius - 1e-6)
  }
})

test('AC: SPEC-O/T-095/AC-4 - cada spot dentro del panel de su zona con inset', () => {
  const inset = boardCollision.zones.inset - boardCollision.zones.grow
  const imageSize = board.meta.imageSize ?? [1176, 1600]
  const panels = deckStacks.panels.map((panel) => ({
    key: panel.key,
    rect: {
      minX: (panel.x - imageSize[0] / 2) * 0.01,
      maxX: (panel.x + panel.w - imageSize[0] / 2) * 0.01,
      minZ: (panel.y - imageSize[1] / 2) * 0.01,
      maxZ: (panel.y + panel.h - imageSize[1] / 2) * 0.01,
    },
    anchor: { x: 0, z: 0 },
  }))
  for (const spec of plan.scatterSpecs) {
    const panel = panels.find((candidate) => candidate.key === boardDecor.zones[spec.zone]?.panel)
    expect(panel, `panel de ${spec.zone}`).toBeDefined()
    if (panel === undefined) continue
    for (const spot of spec.spots) {
      expect(nearestPanel(panels, spot.x, spot.z)?.key, `${spec.kind} fuera de su zona`).toBe(panel.key)
      expect(spot.x).toBeGreaterThanOrEqual(panel.rect.minX + inset - 1e-6)
      expect(spot.x).toBeLessThanOrEqual(panel.rect.maxX - inset + 1e-6)
      expect(spot.z).toBeGreaterThanOrEqual(panel.rect.minZ + inset - 1e-6)
      expect(spot.z).toBeLessThanOrEqual(panel.rect.maxZ - inset + 1e-6)
    }
  }
})

test('AC: SPEC-O/T-095/AC-7 - presupuestos (decor.budgets y profiles.high) en verde', () => {
  const calls = estimateDrawCalls(scene.landmarks) + estimateDrawCalls(scene.scatter)
  const triangles = estimateTriangles(scene.landmarks) + estimateTriangles(scene.scatter)
  expect(calls).toBeLessThanOrEqual(boardDecor.budgets.maxDrawCalls)
  expect(triangles).toBeLessThanOrEqual(boardDecor.budgets.maxTriangles)
  expect(calls).toBeLessThanOrEqual(boardStyle.profiles.high.maxDrawCalls)
  expect(triangles).toBeLessThanOrEqual(boardStyle.profiles.high.maxTriangles)
})

test('AC: SPEC-O/T-095/AC-7 - mismo tablero ⇒ mismo plan (determinismo en la escena)', () => {
  const again = buildBoardScene(board, deckStacks, boardDecor)
  const a = scene.scatter.children.map((mesh) => mesh.name)
  const b = again.scatter.children.map((mesh) => mesh.name)
  expect(b).toEqual(a)
})

test('SPEC-O/T-095 - landmarks pisados ocultos también para la capa de modelos', () => {
  const specs = modelDecorSpecs(board, boardDecor, input, deckStacks)
  const hidden = new Set(plan.hiddenLandmarks)
  expect(hidden.size).toBeGreaterThan(0)
  for (const id of hidden) {
    expect(specs.landmarks.some((spec) => spec.key === id), `${id} no debe tener modelo`).toBe(false)
    expect(scene.landmarks.children.some((child) => child.name === `landmark:${id}`)).toBe(false)
  }
})
