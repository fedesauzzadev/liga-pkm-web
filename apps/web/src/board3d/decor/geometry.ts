// Utilidades de geometría para las piezas de decoración (SPEC-H/T-068):
// cada pieza se arma como partes con el color horneado en vértices y mergeado
// en una sola geometría ⇒ un draw call por pieza (AC-4). T-080/AC-1: el
// material sólido es toon (3 escalones de style.json). Three puro.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { toonMaterial } from '../toon'

/** Material compartido de las piezas sólidas (toon + vertex colors, AC-1). */
export const pieceMaterial: THREE.MeshToonMaterial = toonMaterial({ vertexColors: true })

export interface PieceTransform {
  readonly pos?: readonly [number, number, number]
  readonly rotX?: number
  readonly rotY?: number
  readonly rotZ?: number
  readonly scale?: readonly [number, number, number]
}

export interface PiecePart {
  /** Geometría con vertex colors horneados, origen apoyado en y=0. */
  readonly geometry: THREE.BufferGeometry
  /** Material propio (transparente/emisivo); sin definir ⇒ pieceMaterial. */
  readonly material?: THREE.Material
}

const bakeColor = (geometry: THREE.BufferGeometry, color: string): void => {
  const tint = new THREE.Color(color)
  const position = geometry.attributes.position
  if (position === undefined) throw new Error('bakeColor: geometría sin posición')
  const colors = new Float32Array(position.count * 3)
  for (let index = 0; index < position.count; index += 1) {
    colors[index * 3] = tint.r
    colors[index * 3 + 1] = tint.g
    colors[index * 3 + 2] = tint.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

/** Una pieza de geometría con color y transform local, lista para merge. */
export function part(geometry: THREE.BufferGeometry, color: string, transform: PieceTransform = {}): PiecePart {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...(transform.pos ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(transform.rotX ?? 0, transform.rotY ?? 0, transform.rotZ ?? 0),
    ),
    new THREE.Vector3(...(transform.scale ?? [1, 1, 1])),
  )
  geometry.applyMatrix4(matrix)
  bakeColor(geometry, color)
  return { geometry }
}

/** Material translúcido/emisivo propio (no se mergea con las piezas sólidas). */
export const specialMaterial = (params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, flatShading: true, ...params })

/** Une partes en una sola geometría (un draw call por pieza, AC-4). */
export function mergeParts(parts: readonly PiecePart[]): PiecePart {
  const merged = mergeGeometries(parts.map((piece) => piece.geometry), false)
  if (merged === null) throw new Error('mergeParts: geometrías incompatibles')
  return { geometry: merged }
}
