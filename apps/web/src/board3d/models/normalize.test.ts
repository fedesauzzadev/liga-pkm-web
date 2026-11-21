// AC: SPEC-K/T-070d/AC-2 + T-070e/AC-2/AC-3 + T-086/AC-1/AC-2/AC-3/AC-5 —
// normalizeModel (centrado en piso + escala), toonización conservando map/color
// y sRGB, normales al cargar, textura caída ⇒ color neutro (nunca negro) y
// alphaTest solo si el material es realmente transparente.
import { expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { NEUTRAL_MODEL_FALLBACK, neutralModelColor } from '../../theme/models'
import {
  ensureVertexNormals, isTextureLoaded, mergeModelByMaterial, normalizeModel, normalizeParts,
  toonizeModel, type MergedModelPart,
} from './normalize'

const meshAt = (y: number, material: THREE.Material): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)
  mesh.position.y = y
  return mesh
}

/** Textura "cargada" (con imagen) para los tests de map. */
const loadedTexture = (rgba: [number, number, number, number] = [255, 0, 0, 255]): THREE.DataTexture =>
  new THREE.DataTexture(new Uint8Array(rgba), 1, 1)

test('AC: SPEC-K/T-070d/AC-2 normalizeModel centra en el piso y escala a targetHeight', () => {
  const root = new THREE.Group()
  root.add(meshAt(2, new THREE.MeshStandardMaterial())) // caja de 1 apoyada en y=1,5..2,5
  const wrap = normalizeModel(root, 2)
  wrap.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(wrap)
  expect(box.min.y).toBeCloseTo(0, 4)
  expect(box.max.y - box.min.y).toBeCloseTo(2, 4)
  const center = box.getCenter(new THREE.Vector3())
  expect(Math.abs(center.x)).toBeLessThan(1e-6)
  expect(Math.abs(center.z)).toBeLessThan(1e-6)
})

test('AC: SPEC-N/T-089/AC-5 normalizeModel limita la huella y toma la escala menor', () => {
  // Caja 2×1×2 (huella 2): altura pedida 2 ⇒ escala altura = 2; huella máx 0.9
  // ⇒ escala huella = 0.45. Gana la menor: el modelo mide 0.45 de alto.
  const root = new THREE.Group()
  root.add(meshAt(0, new THREE.MeshStandardMaterial()))
  ;(root.children[0] as THREE.Mesh).geometry = new THREE.BoxGeometry(2, 1, 2)
  const wrap = normalizeModel(root, 2, 0.9)
  wrap.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(wrap)
  expect(box.max.y - box.min.y).toBeCloseTo(0.45, 4)
  expect(Math.max(box.max.x - box.min.x, box.max.z - box.min.z)).toBeCloseTo(0.9, 4)
  expect(box.min.y).toBeCloseTo(0, 4)

  // Sin maxFootprint (o con la huella ya contenida) manda la altura.
  const byHeight = normalizeModel(new THREE.Group().add(meshAt(0, new THREE.MeshStandardMaterial())), 2, 5)
  byHeight.updateMatrixWorld(true)
  const heightBox = new THREE.Box3().setFromObject(byHeight)
  expect(heightBox.max.y - heightBox.min.y).toBeCloseTo(2, 4)
})

test('AC: SPEC-K/T-070d/AC-3 toonizeModel conserva map y color y convierte a toon', () => {
  const map = loadedTexture()
  const material = new THREE.MeshStandardMaterial({ color: '#3366cc', map })
  const mesh = meshAt(0, material)
  toonizeModel(new THREE.Group().add(mesh))
  const toon = mesh.material as THREE.MeshToonMaterial
  expect(toon).toBeInstanceOf(THREE.MeshToonMaterial)
  expect(toon.map).toBe(map)
  expect(toon.color.getHexString()).toBe('3366cc')
})

test('AC: T-086/AC-1 ensureVertexNormals agrega normales a geometrías sin atributo normal', () => {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
  geometry.setIndex([0, 1, 2])
  expect(geometry.getAttribute('normal')).toBeUndefined()
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial())
  const fixed = ensureVertexNormals(new THREE.Group().add(mesh))
  expect(fixed).toBe(1)
  expect(geometry.getAttribute('normal')).toBeDefined()
  // Idempotente: una segunda corrida no vuelve a computar (ya hay normal).
  expect(ensureVertexNormals(new THREE.Group().add(mesh))).toBe(0)
})

test('AC: T-086/AC-1 toonizeModel llama computeVertexNormals al cargar', () => {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
  geometry.setIndex([0, 1, 2])
  const compute = vi.spyOn(geometry, 'computeVertexNormals')
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial())
  toonizeModel(new THREE.Group().add(mesh))
  expect(compute).toHaveBeenCalled()
})

test('AC: T-086/AC-2 isTextureLoaded detecta texturas sin imagen (caídas)', () => {
  expect(isTextureLoaded(loadedTexture())).toBe(true)
  expect(isTextureLoaded(new THREE.Texture())).toBe(false)
  expect(isTextureLoaded(null)).toBe(false)
})

test('AC: T-086/AC-2/AC-5 textura caída ⇒ color neutro del kind, nunca negro, con warning', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  try {
    // map referenciado pero sin imagen cargada (textura 404): el material
    // conserva un color negro puro (caso típico de Kd 0 0 0 o color default).
    const material = new THREE.MeshStandardMaterial({ color: '#000000' })
    material.map = new THREE.Texture() // sin imagen
    const mesh = meshAt(0, material)
    toonizeModel(new THREE.Group().add(mesh), { neutralColor: neutralModelColor('house'), label: 'casa.obj' })
    const toon = mesh.material as THREE.MeshToonMaterial
    expect(toon.map).toBeNull()
    expect(toon.color.getHexString()).not.toBe('000000')
    expect(toon.color.getHexString()).toBe(neutralModelColor('house').replace('#', '').toLowerCase())
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('casa.obj'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('textura no cargada'))
  } finally {
    warn.mockRestore()
  }
})

test('AC: T-086/AC-5 material sin map y color negro puro ⇒ color neutro fallback (nunca negro)', () => {
  const material = new THREE.MeshStandardMaterial({ color: '#000000' })
  const mesh = meshAt(0, material)
  toonizeModel(new THREE.Group().add(mesh))
  const toon = mesh.material as THREE.MeshToonMaterial
  expect(toon.map).toBeNull()
  expect(toon.color.getHexString()).not.toBe('000000')
  expect(toon.color.getHexString()).toBe(NEUTRAL_MODEL_FALLBACK.replace('#', '').toLowerCase())
})

test('AC: T-086/AC-5 material sin map y color NO negro se conserva', () => {
  const material = new THREE.MeshStandardMaterial({ color: '#3366cc' })
  const mesh = meshAt(0, material)
  toonizeModel(new THREE.Group().add(mesh))
  const toon = mesh.material as THREE.MeshToonMaterial
  expect(toon.color.getHexString()).toBe('3366cc')
})

test('AC: T-086/AC-3 mapa conservado queda en colorSpace sRGB', () => {
  const map = loadedTexture()
  map.colorSpace = THREE.NoColorSpace
  const mesh = meshAt(0, new THREE.MeshStandardMaterial({ map }))
  toonizeModel(new THREE.Group().add(mesh))
  const toon = mesh.material as THREE.MeshToonMaterial
  expect(toon.map?.colorSpace).toBe(THREE.SRGBColorSpace)
})

test('AC: SPEC-K/T-070e/AC-2 pixelArt aplica NearestFilter; alphaTest solo si transparente', () => {
  // Material realmente transparente (p. ej. MTL con map_d): alphaTest + DoubleSide.
  const transparent = meshAt(0, new THREE.MeshStandardMaterial({ map: loadedTexture(), transparent: true }))
  toonizeModel(new THREE.Group().add(transparent), { pixelArt: true })
  const toonTransparent = transparent.material as THREE.MeshToonMaterial
  expect(toonTransparent.map?.magFilter).toBe(THREE.NearestFilter)
  expect(toonTransparent.map?.minFilter).toBe(THREE.NearestFilter)
  expect(toonTransparent.map?.colorSpace).toBe(THREE.SRGBColorSpace)
  expect(toonTransparent.alphaTest).toBeCloseTo(0.5)
  expect(toonTransparent.side).toBe(THREE.DoubleSide)

  // Material opaco (sin transparent/opacity<1/alphaTest de origen): SIN alphaTest.
  const opaque = meshAt(0, new THREE.MeshStandardMaterial({ map: loadedTexture() }))
  toonizeModel(new THREE.Group().add(opaque), { pixelArt: true })
  const toonOpaque = opaque.material as THREE.MeshToonMaterial
  expect(toonOpaque.alphaTest).toBe(0)
  expect(toonOpaque.side).toBe(THREE.FrontSide)
})

test('AC: T-086/AC-3 alphaTest de origen (GLB MASK) se conserva', () => {
  const material = new THREE.MeshStandardMaterial({ map: loadedTexture(), alphaTest: 0.4 })
  const mesh = meshAt(0, material)
  toonizeModel(new THREE.Group().add(mesh))
  const toon = mesh.material as THREE.MeshToonMaterial
  expect(toon.alphaTest).toBeCloseTo(0.4)
})

test('AC: SPEC-K/T-070e/AC-2 ignoreTextures descarta el mapa; keepOriginalMaterial conserva el standard', () => {
  const map = loadedTexture()
  const ignored = meshAt(0, new THREE.MeshStandardMaterial({ map }))
  toonizeModel(new THREE.Group().add(ignored), { ignoreTextures: true })
  expect((ignored.material as THREE.MeshToonMaterial).map).toBeNull()

  const kept = meshAt(0, new THREE.MeshStandardMaterial({ map }))
  toonizeModel(new THREE.Group().add(kept), { keepOriginalMaterial: true })
  expect(kept.material).toBeInstanceOf(THREE.MeshStandardMaterial)
})

test('AC: T-086/AC-3 keepOriginalMaterial por modelo descarta textura caída sin warning de color negro', () => {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff' })
  material.map = new THREE.Texture() // sin imagen
  const mesh = meshAt(0, material)
  toonizeModel(new THREE.Group().add(mesh), { keepOriginalMaterial: true })
  expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial)
  expect((mesh.material as THREE.MeshStandardMaterial).map).toBeNull()
})

test('AC: SPEC-K/T-070d/AC-4 mergeModelByMaterial fusiona por material y respeta grupos', () => {
  const materialA = new THREE.MeshStandardMaterial({ color: '#ff0000' })
  const materialB = new THREE.MeshStandardMaterial({ color: '#00ff00' })
  const root = new THREE.Group()
  root.add(meshAt(1, materialA), meshAt(3, materialA), meshAt(5, materialB))
  const parts = mergeModelByMaterial(root)
  expect(parts).toHaveLength(2)
  const trisA = parts.find((part) => part.material === materialA)
  expect(trisA).toBeDefined()
  // 2 cajas × 12 triángulos.
  const index = trisA!.geometry.getIndex()
  expect(Math.ceil((index?.count ?? 0) / 3)).toBe(24)

  // Mesh multi-material (grupos): una parte por material sin fusionar.
  const multi = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [materialA, materialB])
  multi.geometry.addGroup(0, 12, 0)
  multi.geometry.addGroup(12, 24, 1)
  const multiParts = mergeModelByMaterial(new THREE.Group().add(multi))
  expect(multiParts).toHaveLength(2)
})

test('normalizeParts apoya las partes en y=0 y escala a targetHeight', () => {
  const parts: MergedModelPart[] = [
    { geometry: new THREE.BoxGeometry(1, 2, 1).translate(3, 5, -2), material: new THREE.MeshStandardMaterial() },
  ]
  normalizeParts(parts, 1)
  parts[0]!.geometry.computeBoundingBox()
  const box = parts[0]!.geometry.boundingBox!
  expect(box.min.y).toBeCloseTo(0, 5)
  expect(box.max.y).toBeCloseTo(1, 5)
  expect(Math.abs((box.min.x + box.max.x) / 2)).toBeLessThan(1e-6)
})
