// AC: SPEC-H/T-067/AC-1 y AC-6 — piedras biseladas con aro superior del color
// del tipo/mazo; cada tipo de nodo de kanto.json tiene glifo y material, y ni
// la textura ni el material se crean más de una vez por glifo. Numérico
// (NO-VISION) con una fábrica de texturas que cuenta llamadas.
import { expect, test } from 'vitest'
import { BoardGraphSchema, type BoardGraph } from '@liga/content'
import * as THREE from 'three'
import kantoJson from '../../../../content/board/kanto.json'
import { BOARD3D } from '../theme/board3d'
import { boardDecor } from './decor'
import { buildBoardScene } from './scene'
import { deckStacks } from './stacks'
import { stoneGeometry } from './stones'
import type { GlyphId } from './glyph'

const board: BoardGraph = BoardGraphSchema.parse(kantoJson)

const textureCalls = new Map<string, number>()
const textures = new Map<string, THREE.Texture>()
const glyphTextures = (id: GlyphId): THREE.Texture => {
  textureCalls.set(id, (textureCalls.get(id) ?? 0) + 1)
  const hit = textures.get(id)
  if (hit !== undefined) return hit
  const texture = new THREE.Texture()
  textures.set(id, texture)
  return texture
}

const scene = buildBoardScene(board, deckStacks, boardDecor, { glyphTextures })

test('AC: SPEC-H/T-067/AC-1 - piedra redonda y cuadrada: bbox del tema, apoyada en el terreno', () => {
  for (const kind of ['round', 'square'] as const) {
    const geometry = stoneGeometry(kind)
    geometry.computeBoundingBox()
    const box = geometry.boundingBox
    if (box === null) throw new Error(`sin bbox para ${kind}`)
    const span = kind === 'square' ? BOARD3D.node.square : BOARD3D.node.radius * 2
    expect(box.max.x - box.min.x, `${kind} ancho`).toBeCloseTo(span, 2)
    expect(box.max.z - box.min.z, `${kind} profundo`).toBeCloseTo(span, 2)
    expect(box.max.y - box.min.y, `${kind} alto`).toBeCloseTo(BOARD3D.node.height, 5)
    expect(box.min.y).toBeCloseTo(0, 6)
  }
})

test('AC: SPEC-H/T-067/AC-6 - todo tipo de kanto.json tiene glifo y material; uno por glifo, compartido', () => {
  const materialByGlyph = new Map<string, THREE.Material>()
  for (const node of board.nodes) {
    const pivot = scene.nodes.get(node.id)
    if (pivot === undefined) throw new Error(`falta nodo ${node.id}`)
    const glyph = pivot.children.find((child) => child.name === 'glyph') as THREE.Mesh | undefined
    if (glyph === undefined) throw new Error(`falta glifo en ${node.id} (${node.type})`)
    const material = glyph.material as THREE.MeshBasicMaterial
    expect(material.map, `${node.id} con textura`).toBeDefined()
    expect(material.transparent).toBe(true)
    const params = (glyph.geometry as THREE.PlaneGeometry).parameters
    expect(params.width).toBeCloseTo(BOARD3D.glyph.size, 6)
    expect(params.height).toBeCloseTo(BOARD3D.glyph.size, 6)
    expect(glyph.rotation.x).toBeCloseTo(-Math.PI / 2, 6)
    expect(glyph.position.y).toBeCloseTo(BOARD3D.node.height + BOARD3D.glyph.lift, 6)

    const key = `${node.type}:${node.deck ?? ''}`
    const first = materialByGlyph.get(key)
    if (first === undefined) materialByGlyph.set(key, material)
    else expect(material, `${node.id} comparte material`).toBe(first)
  }
  // Ninguna textura se pide más de una vez por build.
  for (const [id, calls] of textureCalls) expect(calls, `textura ${id}`).toBe(1)
  // Todos los tipos de kanto quedaron cubiertos (glifo por tipo y por mazo).
  expect(materialByGlyph.size).toBe(
    new Set(board.nodes.map((node) => `${node.type}:${node.deck ?? ''}`)).size,
  )
})
