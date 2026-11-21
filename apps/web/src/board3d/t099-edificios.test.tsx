// Parte B de SPEC-P/T-099 — escena real del tablero: un solo edificio por
// nodo con landmark, NUNCA la pieza procedural para gym/pokecenter/market/
// league/lab (placements.proceduralBuildings), `source` en sceneDump y
// brillo medio ≥ 0,18 (mismo umbral que T-086). Numérico (NO-VISION): los
// loaders son stubs con un box gris; los GLB reales los chequea
// pnpm models:check + tests/t099-models.test.ts.
import { renderToString } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { BoardGraphSchema, suppressedBuildingPieces, type ModelsManifest } from '@liga/content'
import kantoJson from '../../../../content/board/kanto.json'
import { ModelsBadge } from '../debug/ModelsBadge'
import { boardDecor } from './decor'
import { decorPlanFor } from './decor/plan'
import { buildLandmarks } from './landmarks'
import { leaderFlagColor } from './leaders'
import { ModelDecorLayer } from './models/layer'
import {
  modelsManifest, newModelTargetFor,
} from './models/manifest'
import {
  modelsReportEntries, registerModelResolved, resetModelsReport, reportLineOf,
} from './models/report'
import { landmarkTarget, newModelFallbackReason, type LandmarkModelSpec } from './models/target'
import { modelDecorSpecs } from './ModelDecor'
import { boardPlacements, landmarkTransforms, solveBuildings } from './placements'
import { buildWorldInput } from './scene'
import { computeSceneDump } from './dump'
import { deckStacks } from './stacks'

/** Piezas que representan un edificio (mismos kinds que target.BUILDING_KINDS). */
const BUILDING_KINDS = new Set(['house', 'pokecenter', 'market', 'lab', 'gym'])

const board = BoardGraphSchema.parse(kantoJson)
const input = buildWorldInput(board, deckStacks, boardDecor)
const plan = decorPlanFor(board, deckStacks, boardDecor)
const transforms = landmarkTransforms(board, boardDecor, solveBuildings(board, deckStacks))
const suppressed = suppressedBuildingPieces(boardPlacements)
const hidden = new Set(plan.hiddenLandmarks)

const kindOf = (name: string): string => name.split(':')[2] ?? ''
const buildingPiecesOf = (landmarks: THREE.Group): THREE.Group[] =>
  landmarks.children.filter((child): child is THREE.Group =>
    child instanceof THREE.Group && child.name.startsWith('landmark:') && BUILDING_KINDS.has(kindOf(child.name)))

test('AC: SPEC-P/AC-B1/AC-B2 - proceduralBuildings false: ninguna pieza procedural de los 5 kinds (house de Paleta sí)', () => {
  const landmarks = buildLandmarks(input, board, boardDecor, leaderFlagColor, transforms, hidden, suppressed)
  const pieces = buildingPiecesOf(landmarks)
  for (const piece of pieces) {
    expect(['gym', 'pokecenter', 'market', 'lab'], `${piece.name} no debería dibujarse`).not.toContain(kindOf(piece.name))
  }
  // La única casa visible de Paleta (la segunda está oculta por el plan, Q-069).
  expect(pieces.map((piece) => piece.name)).toEqual(['landmark:paleta:house:0'])
})

test('AC: SPEC-P/AC-B2 - la regla es por dato: con proceduralBuildings true se dibujan las 21 piezas', () => {
  const abierto = buildLandmarks(
    input, board, boardDecor, leaderFlagColor, transforms, hidden,
    suppressedBuildingPieces({ ...boardPlacements, proceduralBuildings: true }),
  )
  const pieces = buildingPiecesOf(abierto)
  expect(pieces).toHaveLength(Object.keys(boardPlacements.nodes).length)
  expect(pieces.filter((piece) => kindOf(piece.name) === 'gym')).toHaveLength(9) // 8 gimnasios + Liga
})

/** Luma BT.709 de un color lineal (THREE convierte sRGB→lineal al hornear). */
const linearLumaToSrgb = (luma: number): number =>
  luma <= 0.0031308 ? luma * 12.92 : 1.055 * luma ** (1 / 2.4) - 0.055

test('AC: SPEC-P/AC-B2 - las casas de Paleta conservan la paleta (muro/techo claros, nunca negro)', () => {
  const landmarks = buildLandmarks(input, board, boardDecor, leaderFlagColor, transforms, hidden, suppressed)
  const house = buildingPiecesOf(landmarks)[0]!
  const seen = new Set<string>()
  house.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const attr = object.geometry.attributes.color
    if (attr === undefined) return
    for (let index = 0; index < attr.count; index += 1) {
      seen.add(`${attr.getX(index).toFixed(3)},${attr.getY(index).toFixed(3)},${attr.getZ(index).toFixed(3)}`)
    }
  })
  expect(seen.size).toBeGreaterThan(0)
  for (const key of seen) {
    const [r, g, b] = key.split(',').map(Number) as [number, number, number]
    // El umbral 0,18 es de píxeles renderizados (sRGB): el techo #C84B3A
    // horneado en lineal da ~0,176 ⇒ convertimos a sRGB antes de comparar.
    const srgb = linearLumaToSrgb(0.2126 * r + 0.7152 * g + 0.0722 * b)
    expect(srgb, `casa Paleta con vértice oscuro (${key})`).toBeGreaterThanOrEqual(0.18)
  }
  // El techo rojo del JSON (AC-B2) sigue horneado en la pieza.
  const target = new THREE.Color('#C84B3A')
  let bakesRoof = false
  house.traverse((object) => {
    if (bakesRoof || !(object instanceof THREE.Mesh)) return
    const attr = object.geometry.attributes.color
    if (attr === undefined) return
    for (let index = 0; index < attr.count; index += 1) {
      if (
        Math.abs(attr.getX(index) - target.r) < 1e-4 &&
        Math.abs(attr.getY(index) - target.g) < 1e-4 &&
        Math.abs(attr.getZ(index) - target.b) < 1e-4
      ) {
        bakesRoof = true
        return
      }
    }
  })
  expect(bakesRoof).toBe(true)
})

const settle = async (): Promise<void> => {
  for (let index = 0; index < 12; index += 1) await new Promise((resolve) => setImmediate(resolve))
}

const greyBox = (): THREE.Object3D => {
  const group = new THREE.Group()
  group.add(new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: '#9A9A9A' }),
  ))
  return group
}

/** Escena completa con la capa de modelos (stubs) ya resuelta. */
async function buildLoadedScene(): Promise<{ landmarks: THREE.Group }> {
  const landmarks = buildLandmarks(input, board, boardDecor, leaderFlagColor, transforms, hidden, suppressed)
  const specs = modelDecorSpecs(board, boardDecor, input, deckStacks).landmarks
  const layer = new ModelDecorLayer({
    landmarks,
    scatter: new THREE.Group(),
    palette: boardDecor.palette,
    outlines: new THREE.Group(),
    outlineStyle: { color: '#000000', thickness: 0.03, maxMeshes: 40, onlyKinds: [] },
    specs,
    scatterSpecs: [],
    loaders: { loadGltf: async () => greyBox(), loadObj: async () => greyBox(), loadFbx: async () => greyBox() },
    budget: { maxDrawCalls: 120, maxTriangles: 150_000 },
    loadDistance: 1e9,
  })
  layer.update(0, 0)
  await settle()
  return { landmarks }
}

const modelGroupsOf = (landmarks: THREE.Group): THREE.Group[] =>
  landmarks.children.filter((child): child is THREE.Group =>
    child instanceof THREE.Group && child.name.startsWith('model:') && BUILDING_KINDS.has(kindOf(child.name)))

test('AC: SPEC-P/AC-B4 - un edificio visible por nodo, source != procedural y total = 21 − descartados', async () => {
  const { landmarks } = await buildLoadedScene()
  const discarded = [...solveBuildings(board, deckStacks).values()].filter((building) => building.discarded).length
  const models = modelGroupsOf(landmarks)
  const visible = models.filter((group) => group.visible !== false)

  // (a) exactamente un grupo de edificio por nodo con landmark de placements.
  for (const nodeId of Object.keys(boardPlacements.nodes)) {
    expect(visible.filter((group) => group.userData.nodeId === nodeId), `edificio de ${nodeId}`).toHaveLength(1)
  }
  // (b) ningún edificio con source "procedural" (los modelos traen el tipo real).
  for (const group of visible) {
    expect(['new', 'hgss', 'kenney'], `${group.name} source`).toContain(group.userData.source)
  }
  // (d) la cantidad total coincide con nodos − descartados.
  expect(visible).toHaveLength(Object.keys(boardPlacements.nodes).length - discarded)
  // (c) brillo medio de los materiales ≥ 0,18 (stub gris pasa; los GLB reales
  // los cubre models:check + el test de materiales en tests/t099-models.test.ts).
  // toonizeModel deja MeshToonMaterial: medimos cualquier material con color.
  let sum = 0
  let count = 0
  for (const group of visible) {
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        const color = (material as { color?: THREE.Color }).color
        if (color === undefined) continue
        sum += 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b
        count += 1
      }
    })
  }
  expect(count).toBeGreaterThan(0)
  expect(sum / count).toBeGreaterThanOrEqual(0.18)
})

test('AC: SPEC-P/AC-B3 - sceneDump identifica el origen de cada edificio (source ∈ new/hgss/kenney)', async () => {
  const { landmarks } = await buildLoadedScene()
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
  camera.position.set(0, 40, 40)
  camera.lookAt(0, 0, 0)
  const entries = computeSceneDump([...landmarks.children], camera, 800, 600)
  const buildings = entries.filter((entry) =>
    (entry.name.startsWith('model:') || entry.name.startsWith('landmark:')) && BUILDING_KINDS.has(entry.kind ?? ''))
  expect(buildings.length).toBeGreaterThan(0)
  for (const entry of buildings) {
    expect(['new', 'hgss', 'kenney', 'procedural'], `${entry.name} source`).toContain(entry.source)
  }
  // Ningún edificio de los 5 kinds dibujado por código (los de Paleta son kenney).
  expect(buildings.filter((entry) => entry.source === 'procedural' && entry.visible)).toHaveLength(0)
  expect(buildings.some((entry) => entry.source === 'new')).toBe(true)
})

// ── Parte A (runtime) ───────────────────────────────────────────────────────

const specLab: LandmarkModelSpec = {
  key: 'oak_t:lab:0',
  kind: 'lab',
  nodeId: 'oak_t',
  x: 0,
  y: 0,
  z: 0,
  rotY: 0,
  scale: 1,
  buildingKind: 'lab',
  targetHeight: boardPlacements.heights.lab,
  maxFootprint: boardPlacements.footprints.lab,
}

test('AC: SPEC-P/AC-A3 - lab resuelve nuevo oak → HGSS → Kenney → (nada)', () => {
  expect(newModelTargetFor('lab').type).toBe('new')
  expect(newModelFallbackReason('lab')).toBeNull()
  expect(landmarkTarget(specLab)?.type).toBe('new')

  const absent: ModelsManifest = { ...modelsManifest, newModels: {} }
  expect(newModelFallbackReason('lab', absent)).toBe('no encontrado')
  expect(landmarkTarget(specLab, absent)?.type).toBe('hgss')
})

afterEach(() => {
  resetModelsReport()
  vi.restoreAllMocks()
})

test('AC: SPEC-P/AC-A4 - la insignia de debug lista los cinco kinds (lab incluido)', () => {
  resetModelsReport()
  expect(modelsReportEntries().map((entry) => entry.kind).sort())
    .toEqual(['gym', 'lab', 'league', 'market', 'pokecenter'])

  for (const kind of ['gym', 'pokecenter', 'market', 'league'] as const) registerModelResolved(kind, `${kind}.glb`)
  registerModelResolved('lab', 'oak.glb')

  const html = renderToString(<ModelsBadge />)
  expect(html).toContain('data-testid="debug-models"')
  expect(html).toContain('gym ✔ gym.glb')
  expect(html).toContain('lab ✔ oak.glb')
  expect(modelsReportEntries().filter((entry) => entry.ok)).toHaveLength(5)
  expect(reportLineOf(modelsReportEntries().find((entry) => entry.kind === 'lab')!)).toBe('lab ✔ oak.glb')
})
