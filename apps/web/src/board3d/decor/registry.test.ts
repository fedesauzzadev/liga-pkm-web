// AC: SPEC-H/T-068/AC-1 + AC-2 — registro de piezas: todo kind del catálogo
// construye, el desconocido cae en fallback invisible, y los landmarks del
// decor.json quedan alrededor de su nodo (Pueblo Paleta, Centro, Mercado, Oak
// y gimnasios con la bandera de la medalla del líder). Numérico (NO-VISION).
import { expect, test } from 'vitest'
import { BoardGraphSchema, DECOR_KINDS, type BoardGraph } from '@liga/content'
import * as THREE from 'three'
import kantoJson from '../../../../../content/board/kanto.json'
import { BOARD3D } from '../../theme/board3d'
import { boardDecor } from '../decor'
import { buildLandmarks } from '../landmarks'
import { leaderFlagColor } from '../leaders'
import { landmarkTransforms, solveBuildings } from '../placements'
import { buildWorldInput } from '../scene'
import { buildDecorPiece, DECOR_REGISTRY } from './registry'
import { deckStacks } from '../stacks'
import { terrainHeightAt } from '../world'

const board: BoardGraph = BoardGraphSchema.parse(kantoJson)
const input = buildWorldInput(board, deckStacks, boardDecor)
// T-091/AC-2: mismos transforms que la escena (edificios reubicados por el
// solver de placements); las piezas secundarias siguen relativas al nodo.
const transforms = landmarkTransforms(board, boardDecor, solveBuildings(board, deckStacks))
const landmarks = buildLandmarks(input, board, boardDecor, leaderFlagColor, transforms)

const palette = boardDecor.palette

test('AC: SPEC-H/T-068/AC-1 - todo kind del catálogo tiene builder y arma mallas sanas', () => {
  for (const kind of DECOR_KINDS) {
    expect(DECOR_REGISTRY[kind], `builder de ${kind}`).toBeDefined()
    const piece = buildDecorPiece({ kind, variant: kind === 'tree' ? 'pine' : undefined }, palette)
    expect(piece.children.length, `${kind} con mallas`).toBeGreaterThan(0)
    expect(piece.visible, `${kind} visible`).toBe(true)
    piece.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        expect(Number.isFinite(object.position.x), `${kind} pos finita`).toBe(true)
        expect(object.geometry.attributes.position.count, `${kind} con vértices`).toBeGreaterThan(0)
      }
    })
  }
})

test('AC: SPEC-H/T-068/AC-1 - kind desconocido ⇒ fallback invisible sin romper nada', () => {
  const piece = buildDecorPiece({ kind: 'nave-espacial' }, palette)
  expect(piece.visible).toBe(false)
  expect(piece.children.length).toBe(0)
  expect(piece.userData.unknownKind).toBe(true)
})

test('AC: SPEC-H/T-068/AC-5d - todos los kind usados en decor.json existen en el registro', () => {
  const used = new Set<string>()
  for (const list of Object.values(boardDecor.landmarks?.byNodeId ?? {})) {
    for (const landmark of list) used.add(landmark.kind)
  }
  for (const list of Object.values(boardDecor.landmarks?.byNodeType ?? {})) {
    for (const landmark of list) used.add(landmark.kind)
  }
  for (const zone of Object.values(boardDecor.zones)) {
    for (const scatter of zone.scatter ?? []) used.add(scatter.kind)
  }
  expect(used.size).toBeGreaterThan(0)
  for (const kind of used) {
    expect(DECOR_REGISTRY[kind], `decor.json usa ${kind} sin builder`).toBeDefined()
  }
})

/** ¿La pieza hornea ese color en algún vértice? (rojos de techo, bandera…) */
const bakesColor = (group: THREE.Object3D, hex: string): boolean => {
  const target = new THREE.Color(hex)
  let found = false
  group.traverse((object) => {
    if (found || !(object instanceof THREE.Mesh)) return
    const attr = object.geometry.attributes.color
    if (attr === undefined) return
    for (let index = 0; index < attr.count; index += 1) {
      if (
        Math.abs(attr.getX(index) - target.r) < 1e-4 &&
        Math.abs(attr.getY(index) - target.g) < 1e-4 &&
        Math.abs(attr.getZ(index) - target.b) < 1e-4
      ) {
        found = true
        return
      }
    }
  })
  return found
}

const landmarksOf = (nodeId: string): THREE.Object3D[] =>
  landmarks.children.filter((child) => child.userData.nodeId === nodeId)

test('AC: SPEC-H/T-068/AC-2 - Pueblo Paleta: 2 casas (techo rojo y azul), 2 árboles, cerca y cartel', () => {
  const pieces = landmarksOf('paleta')
  expect(pieces.length).toBe(6)
  const houses = pieces.filter((piece) => piece.name.includes(':house:'))
  expect(houses.length).toBe(2)
  const paleta = input.nodes.find((node) => node.id === 'paleta')
  if (paleta === undefined) throw new Error('paleta falta en el input')
  // T-091/AC-2: la PRIMERA casa (kind house de placements) está reubicada en
  // x/z del solver; la segunda sigue a ±0,95 del nodo como hasta ahora.
  const moved = transforms.get('paleta:0')
  expect(moved, 'paleta tiene casa en placements').toBeDefined()
  expect(houses[0]?.position.x).toBeCloseTo(moved?.x ?? Number.NaN, 6)
  expect(houses[0]?.position.z).toBeCloseTo(moved?.z ?? Number.NaN, 6)
  expect(Math.abs((houses[1]?.position.x ?? 0) - paleta.x)).toBeCloseTo(0.95, 5)
  for (const house of houses) {
    expect(bakesColor(house, '#C84B3A') || bakesColor(house, '#3B6FB6')).toBe(true)
  }
  expect(bakesColor(houses[0] as THREE.Object3D, '#C84B3A')).toBe(true)
  expect(bakesColor(houses[1] as THREE.Object3D, '#3B6FB6')).toBe(true)
  expect(pieces.some((piece) => piece.name.includes(':tree:'))).toBe(true)
  expect(pieces.some((piece) => piece.name.includes(':fence:'))).toBe(true)
  expect(pieces.some((piece) => piece.name.includes(':sign:'))).toBe(true)
})

test('AC: SPEC-H/T-068/AC-2 - cada Centro/Mercado/Oak/gimnasio lleva su pieza; bandera por medalla', () => {
  for (const node of board.nodes) {
    const expected =
      node.type === 'centro' ? 'pokecenter'
      : node.type === 'mercado' ? 'market'
      : node.type === 'oak' ? 'lab'
      : node.type === 'gym' || node.type === 'liga' ? 'gym'
      : null
    const pieces = landmarksOf(node.id)
    if (expected === null) {
      if (node.id !== 'paleta' && node.type !== 'sorpresa') {
        expect(pieces.length, `${node.id} sin landmark`).toBe(0)
      }
      continue
    }
    const match = pieces.find((piece) => piece.name.includes(`:${expected}:`))
    expect(match, `${node.id} debería tener ${expected}`).toBeDefined()
    // Apoyado en el terreno (terrainHeightAt + lift).
    const anchor = input.nodes.find((entry) => entry.id === node.id)
    if (anchor !== undefined && match !== undefined) {
      expect(match.position.y).toBeCloseTo(
        terrainHeightAt(match.position.x, match.position.z, input) + BOARD3D.decor.scatter.lift,
        6,
      )
    }
    if (node.type === 'gym') {
      expect(match && bakesColor(match, leaderFlagColor(node.id)), `${node.id} bandera del líder`).toBe(true)
    }
  }
  // verde ⇒ Giovanni (Tierra ⇒ #C9A877); la Liga usa el color explícito del JSON.
  const verde = landmarksOf('verde').find((piece) => piece.name.includes(':gym:'))
  expect(verde && bakesColor(verde, BOARD3D.decor.medalColors.Tierra)).toBe(true)
  const liga = landmarksOf('liga').find((piece) => piece.name.includes(':gym:'))
  expect(liga && bakesColor(liga, '#00CFE8')).toBe(true)
})
