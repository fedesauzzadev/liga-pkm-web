// AC: SPEC-O/T-094/AC-2 — orden de resolución por edificio: modelo nuevo →
// HGSS → Kenney → procedural, con reserva de presupuesto para los edificios
// nuevos (el scatter no puede comerse su draw call) y sin matiz de color.
// AC: SPEC-O/T-094/AC-3 — fallback ruidoso: registro por kind con motivo,
// console.warn único, window.__debug.modelsReport e insignia ?debug=1.
// AC: SPEC-O/T-094/AC-4 — si existe assets-src/new/, los 4 kind resuelven a
// modelo (no a fallback); si no existe, el test se omite (título con mensaje).
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToString } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import * as THREE from 'three'
import type { ModelsManifest } from '@liga/content'
import { boardDecor } from '../decor'
import { toonizeModel } from './normalize'
import { ModelDecorLayer, landmarkTarget, newModelQuotaOf, type ModelDecorDeps } from './layer'
import { modelsManifest, newModelTargetFor } from './manifest'
import { ModelsBadge } from '../../debug/ModelsBadge'
import {
  modelsReportEntries, registerModelFallback, registerModelResolved, resetModelsReport, reportLineOf,
} from './report'
import { boardPlacements } from '../placements'
import type { LandmarkModelSpec } from './target'

const specOf = (
  buildingKind: LandmarkModelSpec['buildingKind'],
  kind: LandmarkModelSpec['kind'],
  nodeId: string,
): LandmarkModelSpec => ({
  key: `${nodeId}:${kind}:0`,
  kind,
  nodeId,
  x: 0,
  y: 0,
  z: 0,
  rotY: 0,
  scale: 1,
  buildingKind,
  targetHeight: buildingKind === undefined ? undefined : boardPlacements.heights[buildingKind],
  maxFootprint: buildingKind === undefined ? undefined : boardPlacements.footprints[buildingKind],
})

// ── AC-2: orden nuevo → HGSS → Kenney → procedural ──────────────────────────

test('AC: SPEC-O/T-094/AC-2 - el orden de resolución es nuevo → HGSS → Kenney → procedural', () => {
  // Con el manifiesto real: los 5 kind usan el modelo nuevo (SPEC-P: + lab).
  for (const kind of ['gym', 'pokecenter', 'market', 'league', 'lab'] as const) {
    expect(newModelTargetFor(kind).type, kind).toBe('new')
  }
  expect(landmarkTarget(specOf('gym', 'gym', 'verde'))?.type).toBe('new')

  // Sin modelos nuevos (absent): el gimnasio cae a HGSS (existe hgss.gym).
  const absent: ModelsManifest = { ...modelsManifest, newModels: {} }
  expect(landmarkTarget(specOf('gym', 'gym', 'verde'), absent)?.type).toBe('hgss')

  // Sin nuevos (absent) y sin HGSS de pokecenter: casa Kenney + overlay del
  // kind (3.er eslabón); un kind sin nada de la cadena → null ⇒ procedural.
  const pokecenter = landmarkTarget(specOf('pokecenter', 'pokecenter', 'centro_r'), absent)
  expect(pokecenter?.type).toBe('kenney')
  if (pokecenter?.type === 'kenney') expect(pokecenter.overlayKind).toBe('pokecenter')
  expect(landmarkTarget(specOf(undefined, 'mountain', 'x'))).toBeNull()

  // Rechazado/failed (blocked): directo a procedural, sin pasar por HGSS.
  const rejected: ModelsManifest = {
    ...modelsManifest,
    newModels: { ...modelsManifest.newModels, gym: { ...modelsManifest.newModels.gym!, status: 'rejected' } },
  }
  expect(landmarkTarget(specOf('gym', 'gym', 'verde'), rejected)).toBeNull()
})

test('AC: SPEC-O/T-094/AC-2 - los edificios nuevos no reciben matiz de color (color original conservado)', () => {
  // Un edificio rojo sin textura conserva su color al toonizarse: la paleta
  // neutra es SOLO fallback de textura caída, nunca un tinte del kind.
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: '#B03A2E' }),
  )
  toonizeModel(mesh, { neutralColor: '#E8DCC8', label: 'gim.glb' })
  const material = mesh.material as THREE.MeshStandardMaterial
  expect(material.color.getHexString()).toBe('b03a2e')
})

test('AC: SPEC-O/T-094/AC-2 - el scatter no puede comerse la reserva de draw calls de los edificios nuevos', async () => {
  const boxGroup = (parts: number): THREE.Object3D => {
    const group = new THREE.Group()
    for (let index = 0; index < parts; index += 1) {
      group.add(
        new THREE.Mesh(
          new THREE.BoxGeometry(2, 3, 2),
          new THREE.MeshStandardMaterial({ color: index === 0 ? '#9a9a9a' : '#7a8a6a' }),
        ),
      )
    }
    return group
  }
  // El modelo nuevo tarda MÁS que el scatter (carrera async del bug real).
  let resolveGym: ((object: THREE.Object3D) => void) | undefined
  const loadGltf = vi.fn(async (url: string): Promise<THREE.Object3D> => {
    if (url.includes('/new/')) return await new Promise((resolve) => { resolveGym = resolve })
    return boxGroup(1)
  })
  const landmarks = new THREE.Group()
  const scatter = new THREE.Group()
  const gym: LandmarkModelSpec = {
    ...specOf('gym', 'gym', 'verde'),
    x: 1,
    z: 1,
    flagColor: '#C9A877',
  }
  const scatterSpec = (seed: number): {
    zone: string
    kind: 'tree'
    variant: 'round'
    seed: number
    spots: { x: number; y: number; z: number; scale: number; rotY: number }[]
  } => ({
    zone: 'llanura',
    kind: 'tree',
    variant: 'round', // N-0014: los pinos Kenney (turquesa) quedaron rechazados
    seed,
    spots: [{ x: 0, y: 0, z: 0, scale: 1, rotY: 0 }],
  })
  const deps: ModelDecorDeps = {
    landmarks,
    scatter,
    palette: boardDecor.palette,
    outlines: new THREE.Group(),
    outlineStyle: { color: '#000000', thickness: 0.03, maxMeshes: 40, onlyKinds: [] },
    specs: [gym],
    scatterSpecs: [scatterSpec(1), scatterSpec(2)],
    loaders: { loadGltf, loadObj: async () => boxGroup(1), loadFbx: async () => boxGroup(1) },
    // 3 calls en total: el gimnasio (1 parte fusionada + bandera = su cuota de
    // 2) entra aunque su carga llegue ÚLTIMA; el scatter solo puede usar 1.
    budget: { maxDrawCalls: 3, maxTriangles: 150_000 },
  }
  expect(newModelQuotaOf(gym)).toBe(2)

  const layer = new ModelDecorLayer(deps)
  layer.update(0, 0)
  for (let index = 0; index < 8; index += 1) await new Promise((resolve) => setImmediate(resolve))
  // El primer scatter entra (0+1+2 reserva ≤ 3); el segundo NO (1+1+2 > 3):
  // la reserva del gimnasio pendiente bloquea el resto del scatter (AC-2).
  expect(scatter.children.length).toBe(1)
  resolveGym?.(boxGroup(1))
  for (let index = 0; index < 8; index += 1) await new Promise((resolve) => setImmediate(resolve))

  const model = landmarks.children.find((child) => child.name === 'model:verde:gym:0')
  expect(model).toBeDefined()
  expect(layer.stats.drawCalls).toBe(3)
  expect(modelsReportEntries().find((entry) => entry.kind === 'gym')?.ok).toBe(true)
})

// ── AC-3: fallback ruidoso + insignia ───────────────────────────────────────

afterEach(() => {
  resetModelsReport()
  vi.restoreAllMocks()
})

test('AC: SPEC-O/T-094/AC-3 - un fallback registra motivo, advierte UNA vez y alimenta la insignia', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  resetModelsReport()

  registerModelFallback('pokecenter', 'error de carga', '/models/new/pokecenter.glb: 404')
  registerModelFallback('pokecenter', 'error de carga', '/models/new/pokecenter.glb: 404')
  registerModelResolved('gym', 'gim.glb')

  const gym = modelsReportEntries().find((entry) => entry.kind === 'gym')!
  const pokecenter = modelsReportEntries().find((entry) => entry.kind === 'pokecenter')!
  expect(gym.ok).toBe(true)
  expect(reportLineOf(gym)).toBe('gym ✔ gim.glb')
  expect(pokecenter.ok).toBe(false)
  expect(reportLineOf(pokecenter)).toBe('pokecenter ✖ procedural: error de carga')
  // Un solo warn por kind (AC-3), con el motivo.
  const calls = warn.mock.calls.map((call) => String(call[0]))
  expect(calls.filter((line) => line.includes('pokecenter ✖'))).toHaveLength(1)
  expect(calls[0]).toContain('error de carga')
  // Un ✔ posterior no pisa el fallo registrado.
  registerModelResolved('pokecenter', 'pokecenter.glb')
  expect(modelsReportEntries().find((entry) => entry.kind === 'pokecenter')?.ok).toBe(false)

  const html = renderToString(<ModelsBadge />)
  expect(html).toContain('data-testid="debug-models"')
  expect(html).toContain('gym ✔ gim.glb')
  expect(html).toContain('pokecenter ✖ procedural: error de carga')
})

test('AC: SPEC-O/T-094/AC-3 - la capa registra el motivo cuando la carga del modelo nuevo falla', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  resetModelsReport()
  const loadGltf = vi.fn(async (): Promise<THREE.Object3D> => {
    throw new Error('GLB corrupto')
  })
  const deps: ModelDecorDeps = {
    landmarks: new THREE.Group(),
    scatter: new THREE.Group(),
    palette: {},
    outlines: new THREE.Group(),
    outlineStyle: { color: '#000000', thickness: 0.03, maxMeshes: 40, onlyKinds: [] },
    specs: [specOf('market', 'market', 'mercado_r')],
    scatterSpecs: [],
    loaders: {
      loadGltf,
      loadObj: async () => new THREE.Group(),
      loadFbx: async () => new THREE.Group(),
    },
    budget: { maxDrawCalls: 120, maxTriangles: 150_000 },
  }
  const layer = new ModelDecorLayer(deps)
  layer.preload(['mercado_r'])
  for (let index = 0; index < 8; index += 1) await new Promise((resolve) => setImmediate(resolve))
  const market = modelsReportEntries().find((entry) => entry.kind === 'market')!
  expect(market.ok).toBe(false)
  expect(market.reason).toBe('error de carga')
  expect(market.detail).toContain('GLB corrupto')
  expect(layer.stats.failed).toBe(1)
})

// ── AC-4: los 5 kind resuelven a modelo si existe assets-src/new/ ───────────

const rootOf = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url))
const hasAssetsSrcNew = existsSync(rootOf('../../../../../assets-src/new'))

test.skipIf(!hasAssetsSrcNew)(
  'AC: SPEC-O/T-094/AC-4 - los 5 kind resuelven a modelo nuevo (omitido si no existe assets-src/new/)',
  () => {
    const cases = [
      { buildingKind: 'gym', kind: 'gym' },
      { buildingKind: 'pokecenter', kind: 'pokecenter' },
      { buildingKind: 'market', kind: 'market' },
      { buildingKind: 'league', kind: 'gym' },
      { buildingKind: 'lab', kind: 'lab' },
    ] as const
    for (const entry of cases) {
      const target = landmarkTarget(specOf(entry.buildingKind, entry.kind, 'nodo'))
      expect(target?.type, `${entry.buildingKind} ⇒ modelo nuevo, no fallback`).toBe('new')
      if (target?.type !== 'new') continue
      const file = rootOf(`../../../../../apps/web/public/models/new/${target.url.split('/').pop()!}`)
      expect(existsSync(file), `copiado a public/models/new: ${target.url}`).toBe(true)
    }
  },
)
