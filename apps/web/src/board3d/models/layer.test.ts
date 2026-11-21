// AC: SPEC-K/T-070d/AC-2..AC-6 — capa de modelos: elección determinista,
// fallback procedural, ocultamiento del procedural reemplazado, presupuesto y
// precarga. Los loaders y el manifiesto se mockean (determinista en CI).
import { expect, test, vi } from 'vitest'
import * as THREE from 'three'

vi.mock('./manifest', () => {
  const candidate = {
    pack: 'kenney_nature-kit',
    file: 'kenney_nature-kit/Models/GLTF format/rock_smallA.glb',
    weight: 1,
    targetHeight: 0.3,
    rotY: 0,
    status: 'proposed' as const,
  }
  const hgssFile = {
    name: 'Viridian Gym',
    entry: 'hgss/Kanto Pokemon Gyms/Viridian Gym/viridian.obj',
    forNodes: ['verde'],
    targetHeight: 1.2,
    status: 'proposed' as const,
    options: { ignoreTextures: false, keepOriginalMaterial: false },
  }
  return {
    kenneyCandidatesFor: vi.fn((kind: string) => (kind === 'rock' || kind === 'house' ? [candidate] : [])),
    hgssFilesFor: vi.fn((kind: string, nodeId?: string) =>
      kind === 'gym' && nodeId === 'verde' ? [hgssFile] : [],
    ),
    kenneyModelUrl: (c: { file: string }): string => `/models/${c.file}`,
    hgssModelUrl: (f: { entry: string }): string => `/models/${f.entry}`,
    // T-091: por defecto sin edificio reubicado ⇒ cadena vieja (los tests
    // nuevos de T-091 lo mockean con vi.mocked cuando lo necesitan).
    newModelTargetFor: vi.fn(() => ({ type: 'absent' as const })),
    newModelUrl: (file: string): string => `/models/new/${file}`,
  }
})

import { ModelDecorLayer, type ModelDecorDeps, type LandmarkModelSpec, type ScatterModelSpec } from './layer'

const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i += 1) await new Promise(setImmediate)
}

const boxGroup = (): THREE.Group => {
  const group = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#888888' }))
  mesh.position.y = 0.5
  group.add(mesh)
  return group
}

const okLoaders = {
  loadGltf: async (): Promise<THREE.Object3D> => boxGroup(),
  loadObj: async (): Promise<THREE.Object3D> => boxGroup(),
  loadFbx: async (): Promise<THREE.Object3D> => boxGroup(),
}

const outlineStyle = { color: '#000000', thickness: 0.03, maxMeshes: 40, onlyKinds: ['house', 'gym'] }

const makeDeps = (): Pick<ModelDecorDeps, 'landmarks' | 'scatter' | 'outlines' | 'palette'> & object => {
  const landmarks = new THREE.Group()
  const proceduralHouse = new THREE.Group()
  proceduralHouse.name = 'landmark:verde:gym:0'
  landmarks.add(proceduralHouse)
  const scatter = new THREE.Group()
  const proceduralRock = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 2)
  proceduralRock.name = 'scatter:bosque:rock:0'
  proceduralRock.userData = { zone: 'bosque', kind: 'rock', baseCount: 2, variant: undefined, seed: 22 }
  scatter.add(proceduralRock)
  return { landmarks, scatter, outlines: new THREE.Group(), palette: { wood: '#7A5230' } }
}

const landmarkSpec: LandmarkModelSpec = {
  key: 'verde:gym:0', kind: 'gym', nodeId: 'verde', x: 1, y: 0, z: 2, rotY: 0.2, scale: 1,
}

const scatterSpec: ScatterModelSpec = {
  zone: 'bosque', kind: 'rock', seed: 22,
  spots: [
    { x: 0, y: 0, z: 0, scale: 1, rotY: 0 },
    { x: 0.5, y: 0, z: 0.5, scale: 1.4, rotY: 1 },
  ],
}

const makeLayer = (deps: ReturnType<typeof makeDeps>, loaders = okLoaders, budget?: ModelDecorDeps['budget']): ModelDecorLayer =>
  new ModelDecorLayer({
    ...deps,
    outlineStyle,
    specs: [landmarkSpec],
    scatterSpecs: [scatterSpec],
    loaders,
    budget: budget ?? { maxDrawCalls: 120, maxTriangles: 150_000 },
  })

test('AC: SPEC-K/T-070d/AC-2 misma semilla ⇒ mismas instancias (determinista)', async () => {
  const run = async (): Promise<string[]> => {
    const deps = makeDeps()
    const layer = makeLayer(deps)
    layer.update(0, 0)
    await flush()
    const meshes: string[] = []
    deps.scatter.children.forEach((child) => {
      if (child.name.startsWith('models:')) meshes.push(child.children.map((mesh) => mesh.name).join(','))
    })
    return meshes
  }
  expect(await run()).toEqual(await run())
})

test('AC: SPEC-K/T-070d/AC-6 update por cercanía y precarga del nodo inicial', async () => {
  const deps = makeDeps()
  const layer = makeLayer(deps)
  // Lejos (a 100 unidades): no carga nada.
  layer.update(100, 100)
  await flush()
  expect(deps.scatter.children.some((child) => child.name.startsWith('models:'))).toBe(false)
  expect(deps.landmarks.children.some((child) => child.name.startsWith('model:'))).toBe(false)
  // Cerca (< 14): carga.
  layer.update(0, 0)
  await flush()
  expect(deps.landmarks.children.some((child) => child.name === 'model:verde:gym:0')).toBe(true)
  expect(deps.scatter.children.some((child) => child.name.startsWith('models:'))).toBe(true)
})

test('AC: SPEC-K/T-070d/AC-4 presupuesto agotado ⇒ queda lo procedural', async () => {
  const deps = makeDeps()
  const layer = makeLayer(deps, okLoaders, { maxDrawCalls: 0, maxTriangles: 0 })
  layer.update(0, 0)
  await flush()
  expect(deps.scatter.children.some((child) => child.name.startsWith('models:'))).toBe(false)
  expect(deps.landmarks.children.some((child) => child.name.startsWith('model:'))).toBe(false)
  const procedural = deps.scatter.children.find((child) => child.name.startsWith('scatter:'))
  expect(procedural?.visible).toBe(true)
})

test('AC: SPEC-K/T-070d/AC-5 loader que falla ⇒ fallback sin error ni parpadeo', async () => {
  const deps = makeDeps()
  const failing = {
    loadGltf: async (): Promise<THREE.Object3D> => {
      throw new Error('404')
    },
    loadObj: async (): Promise<THREE.Object3D> => {
      throw new Error('404')
    },
    loadFbx: async (): Promise<THREE.Object3D> => {
      throw new Error('404')
    },
  }
  const layer = makeLayer(deps, failing)
  expect(() => {
    layer.update(0, 0)
  }).not.toThrow()
  await flush()
  expect(deps.landmarks.children.some((child) => child.name.startsWith('model:'))).toBe(false)
  const procedural = deps.landmarks.children.find((child) => child.name.startsWith('landmark:'))
  expect(procedural?.visible).toBe(true)
})

test('AC: SPEC-K/T-070d/AC-4 al reemplazar, el procedural queda oculto y el modelo en su lugar', async () => {
  const deps = makeDeps()
  const layer = makeLayer(deps)
  layer.preload(['verde'])
  await flush()
  const model = deps.landmarks.children.find((child) => child.name === 'model:verde:gym:0')
  expect(model).toBeDefined()
  expect(model?.position.x).toBeCloseTo(1)
  expect(model?.position.z).toBeCloseTo(2)
  const procedural = deps.landmarks.children.find((child) => child.name === 'landmark:verde:gym:0')
  expect(procedural?.visible).toBe(false)
  const proceduralRock = deps.scatter.children.find((child) => child.name.startsWith('scatter:'))
  layer.update(0, 0)
  await flush()
  expect(proceduralRock?.visible).toBe(false)
})

test('AC: SPEC-K/T-070d/AC-3 contorno solo para kinds de onlyKinds y con tope', async () => {
  const deps = makeDeps()
  const layer = makeLayer(deps)
  layer.preload(['verde'])
  await flush()
  expect(deps.outlines.children.some((child) => child.name === 'outline:model:verde:gym:0')).toBe(true)
})
