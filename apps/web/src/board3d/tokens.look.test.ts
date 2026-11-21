// AC: N-0003 — ficha distinguible: color/aro por jugador e indicador de turno.
import { expect, test } from 'vitest'
import { BoardGraphSchema, type BoardGraph } from '@liga/content'
import * as THREE from 'three'
import kantoJson from '../../../../content/board/kanto.json'
import { BOARD3D } from '../theme/board3d'
import {
  buildToken,
  createTokensGroup,
  pulseActiveMarkers,
  setActiveToken,
  setTokenModel,
  syncTokens,
} from './tokens'

const board: BoardGraph = BoardGraphSchema.parse(kantoJson)
const imageSize = board.meta.imageSize

const child = (token: THREE.Object3D, name: string): THREE.Mesh => {
  let found: THREE.Object3D | undefined
  token.traverse((node) => {
    if (node.name === name) found = node
  })
  if (found === undefined) throw new Error(`falta ${name}`)
  return found as THREE.Mesh
}
const colorOf = (mesh: THREE.Mesh): string =>
  `#${(mesh.material as THREE.MeshBasicMaterial).color.getHexString()}`

test('AC: N-0003/AC-1 - base y aro del color del jugador (no blanco), material propio; modelo sin textura teñido en un clon', () => {
  const p1 = buildToken('p1', 0)
  const p2 = buildToken('p2', 1)
  expect(colorOf(child(p1, 'base'))).toBe(BOARD3D.token.pawnColors[0])
  expect(colorOf(child(p1, 'ring'))).toBe(BOARD3D.token.pawnColors[0])
  expect(colorOf(child(p2, 'ring'))).toBe(BOARD3D.token.pawnColors[1])
  expect(child(p1, 'ring').material).not.toBe(child(p2, 'ring').material)

  const shared = new THREE.MeshToonMaterial({ color: 0xcccccc })
  const part = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), shared)
  const model = new THREE.Group()
  model.add(part)
  setTokenModel(p1, model)
  expect(part.material).not.toBe(shared)
  expect(colorOf(part)).toBe(BOARD3D.token.pawnColors[0])
  expect(shared.color.getHexString()).toBe('cccccc')
})

test('AC: N-0003/AC-2 - el indicador es estado (solo la ficha activa) y el pulso no mueve la ficha', () => {
  const group = createTokensGroup()
  const tokens = syncTokens(
    group,
    [
      { id: 'p1', nodeId: 'paleta', spriteUrl: null },
      { id: 'p2', nodeId: 'paleta', spriteUrl: null },
    ],
    board,
    imageSize,
  )
  const p1 = tokens.get('p1') as THREE.Group
  const p2 = tokens.get('p2') as THREE.Group
  expect(child(p1, 'active').visible).toBe(false)
  setActiveToken(group, 'p2')
  expect(child(p1, 'active').visible).toBe(false)
  expect(child(p2, 'active').visible).toBe(true)

  const camera = new THREE.PerspectiveCamera()
  camera.position.set(p2.position.x, 5, p2.position.z + 5)
  const before = p2.position.clone()
  pulseActiveMarkers(group, camera, 0)
  const restY = child(p2, 'active-arrow').position.y
  pulseActiveMarkers(group, camera, 0.2)
  expect(child(p2, 'active-arrow').position.y).not.toBe(restY)
  expect(p2.position.equals(before)).toBe(true)
  // Lejos (vista general) el indicador crece para seguir viéndose.
  camera.position.set(p2.position.x, 40, p2.position.z)
  pulseActiveMarkers(group, camera, 0)
  expect(child(p2, 'active-ring').scale.x).toBeGreaterThan(2)
})
