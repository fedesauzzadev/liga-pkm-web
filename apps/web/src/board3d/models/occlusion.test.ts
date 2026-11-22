// N-0002: edificios que tapan la ficha activa se vuelven translúcidos.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import { MODEL_OCCLUSION } from '../../theme/models'
import { activeTokenTarget, applyOcclusion, applyScatterOcclusion, segmentHitsBox } from './occlusion'

// AC: N-0030/AC-3 — scatter instanciado: la instancia que cruza cámara→ficha
// se oculta entera (tronco + copa) y vuelve al dejar de cruzar.
test('applyScatterOcclusion: oculta la instancia que tapa y la restaura', () => {
  const at = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z)
  const scatter = new THREE.Group()
  const part = (geometry: THREE.BufferGeometry, spots: readonly THREE.Vector3[]): THREE.InstancedMesh => {
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), spots.length)
    spots.forEach((spot, index) => mesh.setMatrixAt(index, new THREE.Matrix4().setPosition(spot)))
    scatter.add(mesh)
    return mesh
  }
  // Tronco bajo (el rayo lo sobrevuela) + copa alta (sí cruza): misma pieza.
  const trees = [at(0, 0, 5), at(4, 0, 5)]
  const trunk = part(new THREE.BoxGeometry(0.2, 0.6, 0.2).translate(0, 0.3, 0), trees)
  const crown = part(new THREE.BoxGeometry(1, 1.4, 1).translate(0, 1.3, 0), trees)
  // Pasto sobre la línea pero más bajo que la ficha: nunca se oculta.
  const grass = part(new THREE.BoxGeometry(0.4, 0.2, 0.4).translate(0, 0.1, 0), [at(0, 0, 1)])
  const scaleX = (mesh: THREE.InstancedMesh, index: number): number => mesh.instanceMatrix.array[index * 16]!
  const token = at(0, 0.4, 0)

  expect(applyScatterOcclusion(scatter, at(0, 2, 10), token)).toBe(2)
  expect([scaleX(trunk, 0), scaleX(crown, 0)]).toEqual([0, 0])
  expect([scaleX(trunk, 1), scaleX(crown, 1), scaleX(grass, 0)]).toEqual([1, 1, 1])
  // Misma cámara y ficha: no recalcula ni vuelve a subir la matriz a la GPU.
  const uploads = crown.instanceMatrix.version
  expect(applyScatterOcclusion(scatter, at(0, 2, 10), token)).toBe(2)
  expect(crown.instanceMatrix.version).toBe(uploads)

  // La cámara se corre: vuelve la matriz original. Sin ficha: todo visible.
  expect(applyScatterOcclusion(scatter, at(-8, 2, 10), token)).toBe(0)
  expect([scaleX(trunk, 0), scaleX(crown, 0), crown.instanceMatrix.array[14]]).toEqual([1, 1, 5])
  applyScatterOcclusion(scatter, at(0, 2, 10), token)
  expect(applyScatterOcclusion(scatter, at(0, 2, 10), null)).toBe(0)
  expect(scaleX(crown, 0)).toBe(1)
})

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z)

// AC: N-0002/AC-2
test('segmentHitsBox: rayo cámara→ficha contra bounding boxes', () => {
  const camera = v(0, 2, 10)
  const token = v(0, 0.4, 0)
  // Caja sobre la línea (el rayo pasa a y≈1,2 en z=5 ⇒ caja de 2 de alto).
  const wall = new THREE.Box3(v(-0.5, 0, 4.5), v(0.5, 2, 5.5))
  expect(segmentHitsBox(camera, token, wall)).toBe(true)
  // Al costado: no cruza; con margen ≥ distancia lateral, sí.
  const side = new THREE.Box3(v(1, 0, 4.5), v(2, 2, 5.5))
  expect(segmentHitsBox(camera, token, side)).toBe(false)
  expect(segmentHitsBox(camera, token, side, 1.1)).toBe(true)
  // Detrás de la ficha (más lejos que el segmento) y detrás de la cámara: no.
  expect(segmentHitsBox(camera, token, new THREE.Box3(v(-0.5, -2, -6), v(0.5, 2, -5)))).toBe(false)
  expect(segmentHitsBox(camera, token, new THREE.Box3(v(-0.5, 0, 14), v(0.5, 6, 15)))).toBe(false)
  // Caja baja que el rayo sobrevuela: no tapa.
  expect(segmentHitsBox(camera, token, new THREE.Box3(v(-0.5, 0, 4.5), v(0.5, 0.5, 5.5)))).toBe(false)
})

function scene(): { landmarks: THREE.Group; outlines: THREE.Group; shared: THREE.Material } {
  const landmarks = new THREE.Group()
  const outlines = new THREE.Group()
  const shared = new THREE.MeshStandardMaterial({ color: '#ffffff', alphaTest: 0.5 })
  for (const [name, x] of [['model:front', 0], ['model:side', 4]] as const) {
    const group = new THREE.Group()
    group.name = name
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), shared))
    group.position.set(x, 1, 5)
    landmarks.add(group)
    const outline = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial())
    outline.name = `outline:${name}`
    outlines.add(outline)
  }
  return { landmarks, outlines, shared }
}

const materialOf = (landmarks: THREE.Group, name: string): THREE.Material => {
  const mesh = landmarks.children.find((child) => child.name === name)?.children[0] as THREE.Mesh
  return mesh.material as THREE.Material
}

// AC: N-0002/AC-1
test('applyOcclusion: lo que cruza la línea baja a ≤ 0,35 y vuelve a 1 al dejar de cruzar', () => {
  const { landmarks, outlines, shared } = scene()
  const token = v(0, 0.4, 0)
  expect(applyOcclusion(landmarks, outlines, v(0, 2, 10), token)).toBe(1)
  const faded = materialOf(landmarks, 'model:front')
  expect(faded.transparent).toBe(true)
  expect(faded.opacity).toBeLessThanOrEqual(0.35)
  expect(faded.opacity).toBe(MODEL_OCCLUSION.opacity)
  // Con recorte (alphaTest de HGSS) el modelo translúcido no se descarta entero.
  expect(faded.alphaTest).toBeLessThan(faded.opacity)
  // El material compartido no se toca: el vecino sigue opaco.
  expect(materialOf(landmarks, 'model:side')).toBe(shared)
  expect(shared.opacity).toBe(1)
  expect(outlines.children[0]!.visible).toBe(false)
  expect(outlines.children[1]!.visible).toBe(true)

  // La cámara se corre: deja de cruzar ⇒ material original (opacidad 1).
  expect(applyOcclusion(landmarks, outlines, v(-8, 2, 10), token)).toBe(0)
  expect(materialOf(landmarks, 'model:front')).toBe(shared)
  expect(outlines.children[0]!.visible).toBe(true)

  // Sin ficha activa: todo opaco.
  applyOcclusion(landmarks, outlines, v(0, 2, 10), token)
  expect(applyOcclusion(landmarks, outlines, v(0, 2, 10), null)).toBe(0)
  expect(materialOf(landmarks, 'model:front')).toBe(shared)
})

// AC: N-0002/AC-1 — los procedurales ocultos (ya reemplazados) no cuentan.
test('applyOcclusion ignora piezas invisibles', () => {
  const { landmarks, outlines, shared } = scene()
  landmarks.children[0]!.visible = false
  expect(applyOcclusion(landmarks, outlines, v(0, 2, 10), v(0, 0.4, 0))).toBe(0)
  expect(materialOf(landmarks, 'model:front')).toBe(shared)
})

// AC: N-0002/AC-3 — el punto a despejar es la ficha con indicador de turno.
test('activeTokenTarget: centro de la ficha activa, null si no hay', () => {
  const tokens = new THREE.Group()
  for (const [id, active] of [['a', false], ['b', true]] as const) {
    const token = new THREE.Group()
    token.userData = { kind: 'token', tokenId: id }
    token.position.set(id === 'a' ? 1 : 3, 0.05, 2)
    const marker = new THREE.Group()
    marker.name = 'active'
    marker.visible = active
    token.add(marker)
    tokens.add(token)
  }
  const target = activeTokenTarget(tokens)
  expect(target?.x).toBe(3)
  expect(target?.y).toBeCloseTo(0.05 + MODEL_OCCLUSION.tokenLift)
  expect(target?.z).toBe(2)
  tokens.children[1]!.children[0]!.visible = false
  expect(activeTokenTarget(tokens)).toBeNull()
})
