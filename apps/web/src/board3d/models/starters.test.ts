// AC: fichas-modelo-3d-hgss — plantillas 3D HGSS de los iniciales para las
// fichas del tablero: toonizado + normalización (AC-4), fallback null (AC-5) y
// caché por especie con instancias que comparten geometría/material (AC-7).
// Todo numérico/estructural sobre three puro (NO-VISION), loaders inyectados.
import { expect, test, vi } from 'vitest'
import * as THREE from 'three'
import type { ModelLoaders } from './layer'
import { hgssStarterModel } from './manifest'
import { StarterModelCache, starterModelInstance } from './starters'

const boxGroup = (): THREE.Object3D =>
  new THREE.Group().add(
    new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshPhongMaterial({ color: 0x88cc44 })),
  )

const loadersOf = (loadObj: ModelLoaders['loadObj']): ModelLoaders => ({
  loadObj,
  loadGltf: async (): Promise<THREE.Object3D> => {
    throw new Error('los iniciales son OBJ, no GLB')
  },
  loadFbx: async (): Promise<THREE.Object3D> => {
    throw new Error('los iniciales son OBJ, no FBX')
  },
})

test('AC: fichas-modelo-3d-hgss/AC-4 - la plantilla queda toonizada y normalizada a targetHeight', async () => {
  const cache = new StarterModelCache(loadersOf(async () => boxGroup()))
  const file = hgssStarterModel('abra')
  expect(file).not.toBeNull()
  const template = await cache.templateFor('abra')
  expect(template).not.toBeNull()
  expect(template?.parts.length).toBeGreaterThan(0)
  for (const part of template?.parts ?? []) {
    expect(part.material).toBeInstanceOf(THREE.MeshToonMaterial)
    part.geometry.computeBoundingBox()
    const box = part.geometry.boundingBox
    if (box === null) throw new Error('sin bounding box')
    // Altura normalizada por targetHeight, apoyada en y=0 (sobre la base).
    expect(box.max.y - box.min.y).toBeCloseTo(file?.targetHeight ?? 0.7, 5)
    expect(box.min.y).toBeCloseTo(0, 5)
  }
})

test('AC: fichas-modelo-3d-hgss/AC-5 - especie sin entrada no dispara carga; carga fallida ⇒ null', async () => {
  const loadObj = vi.fn(async () => boxGroup())
  const cache = new StarterModelCache(loadersOf(loadObj))
  await expect(cache.templateFor('pikachu')).resolves.toBeNull()
  expect(loadObj).not.toHaveBeenCalled()
  const failing = new StarterModelCache(loadersOf(async () => {
    throw new Error('404')
  }))
  await expect(failing.templateFor('abra')).resolves.toBeNull()
})

test('AC: fichas-modelo-3d-hgss/AC-7 - caché por especie (1 carga compartida) e instancias que reutilizan geometría/material', async () => {
  let loads = 0
  const cache = new StarterModelCache(loadersOf(async () => {
    loads += 1
    return boxGroup()
  }))
  const first = cache.templateFor('charmander')
  expect(cache.templateFor('charmander')).toBe(first)
  const template = await first
  expect(loads).toBe(1)
  await cache.templateFor('charmander')
  expect(loads).toBe(1)
  expect(cache.size).toBe(1)

  const a = starterModelInstance(template ?? { species: 'x', parts: [], triangles: 0 })
  const b = starterModelInstance(template ?? { species: 'x', parts: [], triangles: 0 })
  expect(a).not.toBe(b)
  const meshA = a.children[0]
  const meshB = b.children[0]
  if (!(meshA instanceof THREE.Mesh) || !(meshB instanceof THREE.Mesh)) throw new Error('sin mallas')
  expect(meshB.geometry).toBe(meshA.geometry)
  expect(meshB.material).toBe(meshA.material)
})

test('AC: N-0008/AC-2 - la textura del inicial (Hitokage_*.png) se conserva; los mapas de sombra (kage/_lm) no', async () => {
  const textured = (name: string): THREE.Mesh => {
    const map = new THREE.DataTexture(new Uint8Array([255, 128, 0, 255]), 1, 1)
    map.name = name
    return new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshPhongMaterial({ color: 0xcccccc, map }))
  }
  const names = ['/models/hgss/Charmander/Hitokage_bodyCl_ctr.png', '/models/hgss/x/h_kage.png', '/models/hgss/x/h_mado_lm1.png']
  const cache = new StarterModelCache(loadersOf(async () => new THREE.Group().add(...names.map(textured))))
  const template = await cache.templateFor('charmander')
  const maps = (template?.parts ?? []).map((part) => (part.material as THREE.MeshToonMaterial).map)
  expect(maps.map((map) => map?.name ?? null)).toEqual([names[0], null, null])
  expect(maps[0]?.colorSpace).toBe(THREE.SRGBColorSpace)
  expect(maps[0]?.magFilter).toBe(THREE.NearestFilter)
})
