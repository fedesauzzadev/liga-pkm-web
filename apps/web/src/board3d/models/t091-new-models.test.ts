// AC: SPEC-N/T-091/AC-2 — los 4 modelos nuevos (gym, pokecenter, market,
// league) reemplazan a la pieza del edificio reubicado y las specs traen los
// máximos de heights/footprints; lab/casas y nodos sin reubicar conservan la
// cadena hgss/kenney.
// AC: SPEC-N/T-091/AC-3 — un modelo "failed" del chequeo T-086 ⇒ target null
// (pieza procedural), /dev/models-check los lista y applyCheckToManifest
// escribe newModels.
// AC: SPEC-N/T-091/AC-4 — el gimnasio lleva la bandera procedural con el color
// del líder/Liga encima del modelo nuevo.
// AC: SPEC-N/T-091/AC-6 — los 4 kind resuelven a modelo o fallback; huella y
// altura ≤ máximos; ningún material negro.
import { expect, test, vi } from 'vitest'
import * as THREE from 'three'
import {
  BoardGraphSchema, PlacementsFileSchema,
  type DecorKind, type ModelsManifest,
} from '@liga/content'
import kantoJson from '../../../../../content/board/kanto.json'
import placementsJson from '../../../../../content/board/placements.json'
import { boardDecor } from '../decor'
import { buildBuildingOverlay } from './overlays'
import { ModelDecorLayer, landmarkTarget, type LandmarkModelSpec, type ModelDecorDeps } from './layer'
import { modelsManifest, newModelTargetFor, newModelUrl } from './manifest'
import { normalizeParts, type MergedModelPart } from './normalize'
import { landmarkTransforms, sceneRotYOf, solveBuildings } from '../placements'
import { deckStacks } from '../stacks'
import { buildWorldInput } from '../scene'
import { modelDecorSpecs } from '../ModelDecor'
import { checkItems } from '../../dev/ModelsCheck'
import { applyCheckToManifest } from '../../dev/models-check-lib'

const board = BoardGraphSchema.parse(kantoJson)
const placements = PlacementsFileSchema.parse(placementsJson)

const specOf = (buildingKind: LandmarkModelSpec['buildingKind'], kind: DecorKind, nodeId: string): LandmarkModelSpec => ({
  key: `${nodeId}:${kind}:0`,
  kind,
  nodeId,
  x: 0,
  y: 0,
  z: 0,
  rotY: 0,
  scale: 1,
  buildingKind,
  targetHeight: buildingKind === undefined ? undefined : placements.heights[buildingKind],
  maxFootprint: buildingKind === undefined ? undefined : placements.footprints[buildingKind],
})

// ── AC-2 ────────────────────────────────────────────────────────────────────
test('AC: SPEC-N/T-091/AC-2 - los 5 modelos nuevos resuelven por edificio (gym de ciudad, Liga, Centro, Mercado, laboratorio)', () => {
  const cases = [
    { buildingKind: 'gym', kind: 'gym', url: '/models/new/gim.glb' },
    { buildingKind: 'league', kind: 'gym', url: '/models/new/league.glb' },
    { buildingKind: 'pokecenter', kind: 'pokecenter', url: '/models/new/pokecenter.glb' },
    { buildingKind: 'market', kind: 'market', url: '/models/new/pokemart.glb' },
    { buildingKind: 'lab', kind: 'lab', url: '/models/new/oak.glb' },
  ] as const
  for (const entry of cases) {
    const target = landmarkTarget(specOf(entry.buildingKind, entry.kind, 'nodo-x'))
    expect(target?.type, `${entry.buildingKind} ⇒ modelo nuevo`).toBe('new')
    if (target?.type !== 'new') return
    expect(target.url).toBe(entry.url)
    expect(newModelTargetFor(entry.buildingKind)).toEqual({ type: 'new', kind: entry.buildingKind, file: modelsManifest.newModels[entry.buildingKind] })
    expect(newModelUrl(modelsManifest.newModels[entry.buildingKind]!.file)).toBe(entry.url)
  }
})

test('AC: SPEC-P/AC-A3 - el laboratorio SÍ usa el modelo nuevo; casas de Paleta y decoración no', () => {
  // SPEC-P/T-099/AC-A3: lab resuelve new (oak.glb) → hgss → kenney.
  expect(landmarkTarget(specOf('lab', 'lab', 'oak_b'))?.type).toBe('new')
  expect(landmarkTarget(specOf('house', 'house', 'paleta'))?.type).not.toBe('new')
  expect(landmarkTarget(specOf(undefined, 'tree', 'x'))?.type).not.toBe('new')
  expect(newModelTargetFor(undefined).type).toBe('absent')
})

test('AC: SPEC-N/T-091/AC-2 - las specs reales cubren los 21 edificios con sus máximos', () => {
  const input = buildWorldInput(board, deckStacks, boardDecor)
  const { landmarks } = modelDecorSpecs(board, boardDecor, input, deckStacks)
  const withBuilding = landmarks.filter((spec) => spec.buildingKind !== undefined)
  const counts = new Map<string, number>()
  for (const spec of withBuilding) counts.set(spec.buildingKind ?? '', (counts.get(spec.buildingKind ?? '') ?? 0) + 1)
  expect(counts.get('gym')).toBe(8)
  expect(counts.get('pokecenter')).toBe(4)
  expect(counts.get('market')).toBe(5)
  expect(counts.get('league')).toBe(1)
  expect(counts.get('lab')).toBe(2)
  expect(counts.get('house')).toBe(1)
  expect(withBuilding.length).toBe(21)
  for (const spec of withBuilding) {
    expect(spec.targetHeight).toBe(placements.heights[spec.buildingKind!])
    expect(spec.maxFootprint).toBe(placements.footprints[spec.buildingKind!])
    expect(spec.targetHeight).toBeGreaterThan(0)
    expect(spec.maxFootprint).toBeGreaterThan(0)
    // La pieza primaria usa la escala del solver (0,7..1), no la procedural.
    expect(spec.scale).toBeGreaterThanOrEqual(placements.search.scaleFloor - 1e-9)
    expect(spec.scale).toBeLessThanOrEqual(1 + 1e-9)
  }
  // La Liga: yaw de escena del solver, kind league y bandera explícita.
  const liga = landmarks.find((spec) => spec.nodeId === 'liga')
  const solved = solveBuildings(board, deckStacks).get('liga')
  expect(liga?.buildingKind).toBe('league')
  expect(liga?.flagColor).toBe('#00CFE8')
  expect(liga?.rotY).toBeCloseTo(sceneRotYOf(solved?.yawDeg ?? Number.NaN), 9)
  expect(liga?.x).toBeCloseTo(solved?.x ?? Number.NaN, 9)
  expect(liga?.z).toBeCloseTo(solved?.z ?? Number.NaN, 9)
})

// ── AC-3 ────────────────────────────────────────────────────────────────────
test('AC: SPEC-N/T-091/AC-3 - modelo failed/rejected del chequeo ⇒ target null (queda la pieza procedural)', () => {
  const failed: ModelsManifest = {
    ...modelsManifest,
    newModels: {
      ...modelsManifest.newModels,
      gym: { ...modelsManifest.newModels.gym!, status: 'failed', failedFrom: 'proposed' },
      pokecenter: { ...modelsManifest.newModels.pokecenter!, status: 'rejected' },
    },
  }
  expect(landmarkTarget(specOf('gym', 'gym', 'verde'), failed)).toBeNull()
  expect(landmarkTarget(specOf('pokecenter', 'pokecenter', 'centro_r'), failed)).toBeNull()
  expect(landmarkTarget(specOf('market', 'market', 'mercado_r'), failed)?.type).toBe('new')
  expect(newModelTargetFor('gym', failed).type).toBe('blocked')
})

test('AC: SPEC-N/T-091/AC-3 - /dev/models-check lista los 5 modelos nuevos y applyCheckToManifest escribe newModels', () => {
  const items = checkItems()
  const news = items.filter((item) => item.key.startsWith('new::'))
  expect(news.map((item) => item.key).sort()).toEqual([
    'new::gym',
    'new::lab',
    'new::league',
    'new::market',
    'new::pokecenter',
  ])
  const gim = news.find((item) => item.key === 'new::gym')
  expect(gim?.gameUrl).toBe('/models/new/gim.glb')
  expect(gim?.devFile).toBe('new/gim.glb')
  expect(gim?.format).toBe('glb')

  const failedResult = {
    key: 'new::gym',
    status: 'new' as const,
    file: 'gim.glb',
    loaded: true,
    metrics: { modelPixels: 10, meanBrightness: 0.05, darkShare: 0.9 },
    verdict: { ok: false, failures: ['brillo-medio-bajo'] },
    failures: ['brillo-medio-bajo'],
  }
  const okResult = { ...failedResult, verdict: { ok: true, failures: [] as string[] }, failures: [] as string[] }
  type CheckManifest = {
    kinds: Record<string, { candidates: { pack: string; file: string; status: string; failedFrom?: string }[] }>
    hgss: Record<string, { files: { entry: string; status: string; failedFrom?: string }[] }>
    newModels: Record<string, { file: string; status: string; failedFrom?: string }>
  }
  const manifest: CheckManifest = {
    kinds: { gym: { candidates: [] } },
    hgss: {},
    newModels: {
      gym: { file: 'gim.glb', status: 'proposed' },
      market: { file: 'pokemart.glb', status: 'proposed' },
    },
  }
  const marked = applyCheckToManifest(manifest, [failedResult])
  expect(marked.newModels.gym?.status).toBe('failed')
  expect(marked.newModels.gym?.failedFrom).toBe('proposed')
  expect(marked.newModels.market?.status).toBe('proposed')
  const restored = applyCheckToManifest(marked, [okResult])
  expect(restored.newModels.gym?.status).toBe('proposed')
  expect(restored.newModels.gym?.failedFrom).toBeUndefined()
})

// ── AC-4 ────────────────────────────────────────────────────────────────────
test('AC: SPEC-N/T-091/AC-4 - la bandera procedural del gimnasio hornea el color del líder', () => {
  const flag = buildBuildingOverlay('gym', boardDecor.palette, 0.9, '#00CFE8')
  expect(flag).not.toBeNull()
  const target = new THREE.Color('#00CFE8')
  let baked = false
  flag?.traverse((object) => {
    if (baked || !(object instanceof THREE.Mesh)) return
    const attribute = object.geometry.attributes.color
    if (attribute === undefined) return
    for (let index = 0; index < attribute.count; index += 1) {
      if (
        Math.abs(attribute.getX(index) - target.r) < 1e-4 &&
        Math.abs(attribute.getY(index) - target.g) < 1e-4 &&
        Math.abs(attribute.getZ(index) - target.b) < 1e-4
      ) baked = true
    }
  })
  expect(baked).toBe(true)
  // El resto de edificios no lleva overlay (solo el gimnasio, AC-4).
  expect(buildBuildingOverlay('market', boardDecor.palette, 0.6)?.name).toBe('overlay')
})

// ── AC-6 ────────────────────────────────────────────────────────────────────
const boxGroup = (): THREE.Object3D => {
  const group = new THREE.Group()
  group.add(new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), new THREE.MeshStandardMaterial({ color: '#9a9a9a' })))
  return group
}

test('AC: SPEC-N/T-091/AC-6 - la capa usa el modelo nuevo con alturas/huellas ≤ máximos y la bandera encima', async () => {
  const loadGltf = vi.fn(async (): Promise<THREE.Object3D> => boxGroup())
  const procedural = new THREE.Group()
  procedural.name = 'landmark:verde:gym:0'
  const landmarks = new THREE.Group()
  landmarks.add(procedural)
  const spec: LandmarkModelSpec = {
    key: 'verde:gym:0',
    kind: 'gym',
    nodeId: 'verde',
    x: 1.5,
    y: 0,
    z: -2,
    rotY: 0.4,
    scale: 0.85,
    buildingKind: 'gym',
    targetHeight: placements.heights.gym,
    maxFootprint: placements.footprints.gym,
    flagColor: '#C9A877',
  }
  const deps: ModelDecorDeps = {
    landmarks,
    scatter: new THREE.Group(),
    palette: boardDecor.palette,
    outlines: new THREE.Group(),
    outlineStyle: { color: '#000000', thickness: 0.03, maxMeshes: 40, onlyKinds: ['gym'] },
    specs: [spec],
    scatterSpecs: [],
    loaders: {
      loadGltf,
      loadObj: async () => boxGroup(),
      loadFbx: async () => boxGroup(),
    },
    budget: { maxDrawCalls: 120, maxTriangles: 150_000 },
  }
  const layer = new ModelDecorLayer(deps)
  layer.preload(['verde'])
  for (let index = 0; index < 8; index += 1) await new Promise((resolve) => setImmediate(resolve))

  expect(loadGltf).toHaveBeenCalledWith('/models/new/gim.glb')
  const model = landmarks.children.find((child) => child.name === 'model:verde:gym:0')
  expect(model).toBeDefined()
  expect(model?.position.x).toBeCloseTo(1.5)
  expect(model?.position.z).toBeCloseTo(-2)
  expect(model?.rotation.y).toBeCloseTo(0.4)
  expect(model?.scale.x).toBeCloseTo(0.85)
  expect(procedural.visible).toBe(false)
  // Bandera procedural del gimnasio (AC-4): el modelo (1 parte fusionada) más
  // el grupo de la bandera encima.
  expect(model?.children.length).toBe(2)
  expect(model?.children[1]).toBeInstanceOf(THREE.Group)

  // Altura y huella finales ≤ máximos (AC-6), medidas sobre la geometría.
  let height = 0
  let footprint = 0
  model?.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.computeBoundingBox()
    const box = object.geometry.boundingBox
    if (box === null) return
    const size = box.getSize(new THREE.Vector3())
    height = Math.max(height, size.y)
    footprint = Math.max(footprint, Math.max(size.x, size.z))
  })
  expect(height).toBeLessThanOrEqual(placements.heights.gym + 1e-6)
  expect(footprint).toBeLessThanOrEqual(placements.footprints.gym + 1e-6)
  // Ningún material negro puro (AC-6 + T-086).
  model?.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      const color = (material as THREE.MeshStandardMaterial).color
      if (color === undefined) continue
      const black = color.r < 1e-4 && color.g < 1e-4 && color.b < 1e-4
      expect(black, `material negro en ${material.name === '' ? 'modelo' : material.name}`).toBe(false)
    }
  })
})

test('AC: SPEC-N/T-091/AC-6 - normalizeParts escala a min(altura, huella)', () => {
  const geometry = new THREE.BoxGeometry(4, 1, 4)
  const parts: readonly MergedModelPart[] = [{ geometry, material: new THREE.MeshBasicMaterial() }]
  // Altura pedida 0,9 ⇒ scale 0,9; huella 0,8 sobre 4 de ancho ⇒ scale 0,2 manda.
  normalizeParts(parts, 0.9, 0.8)
  geometry.computeBoundingBox()
  const size = geometry.boundingBox!.getSize(new THREE.Vector3())
  expect(size.y).toBeCloseTo(0.2, 6)
  expect(Math.max(size.x, size.z)).toBeCloseTo(0.8, 6)
})

test('AC: SPEC-N/T-091/AC-2/AC-6 - los 21 nodos de placements generan transforms deterministas', () => {
  const once = landmarkTransforms(board, boardDecor, solveBuildings(board, deckStacks))
  const twice = landmarkTransforms(board, boardDecor, solveBuildings(board, deckStacks))
  expect(once.size).toBe(21)
  expect([...once.entries()].map(([key, value]) => `${key}:${String(value.x)}:${String(value.z)}`))
    .toEqual([...twice.entries()].map(([key, value]) => `${key}:${String(value.x)}:${String(value.z)}`))
  // El liga usa la pieza gym (BUILDING_PIECE_KIND) en el índice de su nodo.
  expect(once.get('liga:0')?.buildingKind).toBe('league')
  expect([...once.keys()].every((key) => /^\S+:\d+$/.test(key))).toBe(true)
})
