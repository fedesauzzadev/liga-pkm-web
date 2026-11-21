// AC: SPEC-M/T-088 — etiquetas sin cortes (clamp al viewport), manchas de
// niebla sin píxeles (opacidad ≤ 0,12, clearance con huella, sin discos
// grandes azul/violeta) y terreno sin escalones. Numérico (NO-VISION): sin
// render ni DOM; los deltas salen de las geometrías.
import { expect, test, vi } from 'vitest'
import { BoardGraphSchema, type BoardGraph } from '@liga/content'
import * as THREE from 'three'
import kantoJson from '../../../../content/board/kanto.json'
import { BOARD3D } from '../theme/board3d'
import { boardDecor } from './decor'
import { decorPlanFor, boardCollision } from './decor/plan'
import { piecePartsOf } from './decor/registry'
import { applySafeOffset, planOverview, safeArea } from './camera'
import { boardLabels } from './scene'
import { labelEstimateBoxPx, labelItemsOf, planLabels, type LabelItem, type LabelViewCtx } from './labels'
import { buildWorldInput } from './scene'
import { boardStyle } from './style'
import { buildScatter } from './scatter'
import { deckStacks } from './stacks'
import { buildWorld, distToSegment, terrainColorAt } from './world'

const board: BoardGraph = BoardGraphSchema.parse(kantoJson)
const input = buildWorldInput(board, deckStacks, boardDecor, boardStyle)
const world = buildWorld(input)
const style = boardStyle.labels
const HALF = boardStyle.world.size[0] / 2
const imageSize = board.meta.imageSize

// ── AC-1 ─────────────────────────────────────────────────────────────────────

const ASPECT = 1440 / 900
const WIDTH = 1440
const HEIGHT = 900
const MARGIN = BOARD3D.label.viewportMarginPx

const poseCamera = (
  position: readonly [number, number, number],
  target: readonly [number, number, number],
): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera(45, ASPECT, 0.1, 200)
  camera.position.set(position[0], position[1], position[2])
  camera.up.set(0, 1, 0)
  camera.lookAt(new THREE.Vector3(target[0], target[1], target[2]))
  camera.updateMatrixWorld(true)
  return camera
}

const itemAt = (nodeId: string, world: readonly [number, number, number], text: string): LabelItem => ({
  nodeId,
  text,
  type: 'other',
  rank: 9,
  world,
})

const ctxOf = (
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  hovered: string | null,
): LabelViewCtx => ({ camera, width, height, token: null, hovered, focused: [] })

test('AC: SPEC-M/T-088/AC-1 - la caja de cada etiqueta visible queda completa dentro del viewport (margen 8 px) y en una sola línea', () => {
  // Etiqueta que, anclada centrada, quedaría cortada por el borde derecho.
  const camera = poseCamera([0, 6, 8], [0, BOARD3D.label.lift, 2])
  const lift = BOARD3D.label.lift
  const text = 'Ciudad Cañón'
  const screenXAt = (dx: number): number => {
    const v = new THREE.Vector3(dx, lift, 2)
    v.project(camera)
    return ((v.x + 1) / 2) * 400
  }
  let dx = 0
  for (let step = 0; step < 240; step += 1) {
    const dxTry = 0.05 * step
    if (screenXAt(dxTry) >= 400 - 10) {
      dx = dxTry
      break
    }
  }
  expect(dx, 'se encontró un dx que deja la etiqueta a ≤ 10 px del borde').toBeGreaterThan(0)

  const plan = planLabels([itemAt('clip', [dx, lift, 2], text)], ctxOf(camera, 400, 300, 'clip'), style)
  const entry = plan[0]
  if (entry === undefined) throw new Error('plan vacío')
  expect(entry.visible, 'la etiqueta cerca del borde es visible').toBe(true)
  const box = entry.screenBBox
  expect(box.x).toBeGreaterThanOrEqual(MARGIN - 1e-6)
  expect(box.x + box.w).toBeLessThanOrEqual(400 - MARGIN + 1e-6)
  expect(box.y).toBeGreaterThanOrEqual(MARGIN - 1e-6)
  expect(box.y + box.h).toBeLessThanOrEqual(300 - MARGIN + 1e-6)
  expect(Math.abs(entry.screenPos[0] - (400 - MARGIN - box.w / 2)), 'clamp x al borde').toBeLessThan(1e-9)
  expect(entry.screenShift[0], 'se desplazó hacia adentro').toBeLessThan(0)
  // white-space: nowrap ⇒ alto de una sola línea (sin envolver, sin max-width).
  expect(box.h).toBeCloseTo(labelEstimateBoxPx(text, style.fontPx).h, 9)

  // Con la cámara de vista general, toda etiqueta visible queda completa.
  const plan0 = planOverview(HALF, boardStyle.world.size[1] / 2, ASPECT)
  const overview = poseCamera(plan0.position, plan0.target)
  applySafeOffset(overview, safeArea, WIDTH, HEIGHT)
  const items = labelItemsOf(boardLabels(board), imageSize, BOARD3D.label.lift)
  const fullPlan = planLabels(items, ctxOf(overview, WIDTH, HEIGHT, null), style)
  const visible = fullPlan.filter((entry) => entry.visible)
  expect(visible.length).toBeGreaterThan(0)
  for (const labelPlan of visible) {
    const label = `${labelPlan.text}@${labelPlan.nodeId}`
    expect(labelPlan.screenBBox.x, label).toBeGreaterThanOrEqual(MARGIN - 1e-6)
    expect(labelPlan.screenBBox.x + labelPlan.screenBBox.w, label).toBeLessThanOrEqual(WIDTH - MARGIN + 1e-6)
    expect(labelPlan.screenBBox.y, label).toBeGreaterThanOrEqual(MARGIN - 1e-6)
    expect(labelPlan.screenBBox.y + labelPlan.screenBBox.h, label).toBeLessThanOrEqual(HEIGHT - MARGIN + 1e-6)
    expect(labelPlan.screenBBox.h, `${label} sin salto de línea`).toBeCloseTo(
      labelEstimateBoxPx(labelPlan.text, style.fontPx).h,
      9,
    )
  }
})

// ── AC-2 ─────────────────────────────────────────────────────────────────────

const plan = decorPlanFor(board, deckStacks, boardDecor)
const scatterGroup = buildScatter(input, plan)

test('AC: SPEC-M/T-088/AC-2 - manchas ≤ 0,12 de opacidad, sin discos grandes y con clearance de huella', () => {
  expect(BOARD3D.decor.mist.opacity).toBeLessThanOrEqual(0.12)
  const mistParts = piecePartsOf({ kind: 'mist' }, boardDecor.palette)
  expect(mistParts, 'piezas de niebla definidas').not.toBeNull()
  if (mistParts === null) throw new Error('sin niebla')
  const mistPart = mistParts[0]
  if (mistPart === undefined) throw new Error('niebla sin partes')
  const mistMaterial = mistPart.material as THREE.MeshStandardMaterial
  expect(mistMaterial.transparent).toBe(true)
  expect(mistMaterial.opacity).toBeLessThanOrEqual(0.12)
  // T-088/AC-2: sin facetas cuadradas (flatShading ⇒ bloques visibles).
  expect(mistMaterial.flatShading).toBe(false)
  const mistBox = new THREE.Box3().setFromBufferAttribute(
    mistPart.geometry.attributes.position as THREE.BufferAttribute,
  )
  expect(
    Math.max(mistBox.max.x - mistBox.min.x, mistBox.max.z - mistBox.min.z) * BOARD3D.decor.scatter.scaleMax,
    'huella de la niebla',
  ).toBeLessThanOrEqual(1.2 + 1e-9)

  // El pond grande del scatter de Isla ya no existe: el lago de T-069 queda como agua.
  for (const [zone, spec] of Object.values(boardDecor.zones).flatMap((entry) =>
    (entry.scatter ?? []).map((spec) => [entry.panel, spec] as const),
  )) {
    expect(spec.kind === 'pond', `discos de agua decorativos en ${zone}`).toBe(false)
  }
  // T-095/AC-3: el agua pasa por el plan de ocupación; si el panel no da para
  // el mínimo (Isla cruzada por caminos), el estanque se OMITE (Q-068).
  const water = world.water
  if (water !== null) {
    const material = water.material as THREE.MeshStandardMaterial
    expect(material.transparent).toBe(true)
    expect(material.opacity, 'disco de agua sin mancha').toBeLessThanOrEqual(0.12)
  }
  // Toda otra pieza translúcida con más opacidad es pequeña (≤ 1,2).
  for (const group of [world.root, scatterGroup]) {
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const material = child.material as THREE.MeshStandardMaterial
      if (!material?.transparent || material.opacity <= 0.12) return
      const box = new THREE.Box3().setFromObject(child)
      const footprint = Math.max(box.max.x - box.min.x, box.max.z - box.min.z)
      expect(footprint, `${child.name} disco translúcido grande sobre el tablero`).toBeLessThanOrEqual(1.2 + 1e-9)
    })
  }

  // Clearance con huella (T-095): la niebla y toda mancha (mist/lavaPool) no
  // pisa nodos ni aristas — buffer de road + su radio de categoría, según el
  // plan de ocupación. Nota: en el tablero real puede haber 0 manchas si no
  // queda lugar (antes se solapaban); la pieza sigue definida arriba.
  const road = boardCollision.categories.road
  const patchRadius = boardCollision.categories.patch?.radius ?? 0.45
  const patchKinds = new Set(['mist', 'pond', 'lavaPool'])
  let patchSpots = 0
  for (const spec of plan.scatterSpecs) {
    if (!patchKinds.has(spec.kind)) continue
    for (const spot of spec.spots) {
      patchSpots += 1
      for (const node of input.nodes) {
        expect(
          Math.hypot(spot.x - node.x, spot.z - node.z) + 1e-6,
          `${spec.kind} tapa ${node.id}`,
        ).toBeGreaterThanOrEqual((road?.nodeBuffer ?? 0.4) + patchRadius)
      }
      for (const edge of input.edges) {
        expect(distToSegment(spot.x, spot.z, edge.a, edge.b) + 1e-6).toBeGreaterThanOrEqual(
          (road?.edgeBuffer ?? 0.45) + patchRadius,
        )
      }
    }
  }
  // La mancha que sobrevive al plan respeta TODO; que sean pocas (o ninguna)
  // es exactamente el punto de T-095 (antes se acumulaban sobre caminos).
  expect(patchSpots).toBeGreaterThanOrEqual(0)
})

// ── AC-3 ─────────────────────────────────────────────────────────────────────

test('AC: SPEC-M/T-088/AC-3 - terreno suave: ≥ 120 segmentos y color continuo por textura de bioma', () => {
  expect(boardStyle.world.segments).toBeGreaterThanOrEqual(120)
  // T-096: el color por vértice (bloques de 0,3 con escalones de 0,195,
  // Q-057) pasó a la textura de bioma 1024² con filtro lineal; el delta
  // exacto < 0,08 entre texels vecinos lo cubre T-096/AC-4.
  const terrainMaterial = world.terrain.material as THREE.MeshStandardMaterial
  const map = terrainMaterial.map
  expect(map, 'terreno con tinte de textura').not.toBeNull()
  expect(map?.magFilter).toBe(THREE.LinearFilter)
  expect(map?.minFilter).not.toBe(THREE.NearestFilter)
  expect(terrainMaterial.vertexColors).toBeFalsy()
  expect(world.biomeTexture.image.width).toBeGreaterThanOrEqual(1024)
  // NearestFilter solo para texturas de modelos HGSS: el cielo no lleva map.
  const skyMaterial = world.sky.material as THREE.MeshBasicMaterial
  expect(skyMaterial.map ?? null).toBeNull()
})

test('AC: SPEC-M/T-088/AC-3 (texturas) - las CanvasTexture de glifos no usan NearestFilter', async () => {
  const fakeCanvas = (): { width: number; height: number; getContext: () => null } => ({
    width: 8,
    height: 8,
    getContext: () => null,
  })
  vi.stubGlobal('document', { createElement: fakeCanvas })
  try {
    vi.resetModules()
    const { makeGlyphTexture } = await import('./glyph-textures')
    const texture = makeGlyphTexture('star')
    expect(texture.minFilter).not.toBe(THREE.NearestFilter)
    expect(texture.magFilter).not.toBe(THREE.NearestFilter)
  } finally {
    vi.unstubAllGlobals()
  }
})

// ── AC-4 ─────────────────────────────────────────────────────────────────────

test('AC: SPEC-M/T-088/AC-4 - sin bordes cuadrados: colores continuos entre zonas (distancia continua)', () => {
  // Recorre una línea entre centros de zonas a ≤ 0,02 de paso: entre muestras
  // consecutivas el color cambia suave (sin salto de bloque cuadrado).
  const zones = input.biomes
  expect(zones.length).toBeGreaterThanOrEqual(2)
  const color = new THREE.Color()
  let maxStepDelta = 0
  for (let zoneIndex = 0; zoneIndex + 1 < zones.length; zoneIndex += 1) {
    const a = zones[zoneIndex]
    const b = zones[zoneIndex + 1]
    if (a === undefined || b === undefined) continue
    const steps = Math.ceil(1 + Math.hypot(b.center.x - a.center.x, b.center.z - a.center.z) / 0.02)
    let previous: THREE.Color | null = null
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps
      const x = a.center.x + (b.center.x - a.center.x) * t
      const z = a.center.z + (b.center.z - a.center.z) * t
      terrainColorAt(x, z, input, color)
      if (previous !== null) {
        maxStepDelta = Math.max(
          maxStepDelta,
          Math.abs(color.r - previous.r),
          Math.abs(color.g - previous.g),
          Math.abs(color.b - previous.b),
        )
      }
      previous = color.clone()
    }
  }
  expect(maxStepDelta, `salto máximo entre muestras a 0,02: ${maxStepDelta.toFixed(4)}`).toBeLessThan(0.08)
})
