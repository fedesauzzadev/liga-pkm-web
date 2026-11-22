// Piedras elevadas de los casilleros (SPEC-H/T-067/AC-1/AC-2): geometría
// biselada (ExtrudeGeometry), aro superior del color del tipo/mazo y glifo
// en la cara superior. Three puro para verificar numéricamente (NO-VISION);
// los números viven en theme/board3d.ts §node/§glyph/§ring.
import type { BoardNode } from '@liga/content'
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'
import type { WorldPos } from './scene'

export const deckColorOf = (deck: string): string =>
  BOARD3D.deckColors[deck as keyof typeof BOARD3D.deckColors] ?? BOARD3D.nodeColors.deck

export const nodeColor = (node: BoardNode): string =>
  node.type === 'deck' && node.deck !== undefined ? deckColorOf(node.deck) : BOARD3D.nodeColors[node.type]

const standard = (color: string): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true })

/** Forma 2D de la piedra ya sin el bisel (el bisel la agranda bevel por lado). */
const shapeOf = (kind: 'round' | 'square'): THREE.Shape => {
  const { bevel, radius, square } = BOARD3D.node
  if (kind === 'square') {
    const half = (square - 2 * bevel) / 2
    const shape = new THREE.Shape()
    shape.moveTo(-half, -half)
    shape.lineTo(half, -half)
    shape.lineTo(half, half)
    shape.lineTo(-half, half)
    shape.closePath()
    return shape
  }
  const shape = new THREE.Shape()
  shape.absarc(0, 0, radius - bevel, 0, Math.PI * 2, false)
  return shape
}

/** AC-1: piedra biselada apoyada en y=0 (bbox 0,4×0,12×0,4 del tema). */
export function stoneGeometry(kind: 'round' | 'square'): THREE.ExtrudeGeometry {
  const { bevel, height, segments } = BOARD3D.node
  const geometry = new THREE.ExtrudeGeometry(shapeOf(kind), {
    steps: 1,
    depth: height - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: segments,
  })
  // Extruye hacia +Z con bisel ±bevel: rota a Y y apoya el bisel en y=0.
  geometry.rotateX(-Math.PI / 2)
  geometry.computeBoundingBox()
  const lift = -(geometry.boundingBox?.min.y ?? 0)
  geometry.translate(0, lift, 0)
  return geometry
}

/**
 * AC-1/AC-2: pivote del nodo — piedra neutra + aro superior del color del
 * tipo/mazo + glifo (si hay material) + aro del pending (invisible).
 */
export function buildNodeStone(
  node: BoardNode,
  world: WorldPos,
  glyphMaterial?: THREE.Material,
): THREE.Group {
  const { height, radius, rimColor } = BOARD3D.node
  const pivot = new THREE.Group()
  pivot.name = `node:${node.id}`
  pivot.position.set(world.x, 0, world.z)
  pivot.userData = { kind: 'node', nodeId: node.id, clickable: false }

  const stone = new THREE.Mesh(stoneGeometry(node.shape === 'square' ? 'square' : 'round'), standard(nodeColor(node)))
  stone.name = 'stone'
  pivot.add(stone)

  const topring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.72, radius * 0.94, 32),
    new THREE.MeshBasicMaterial({ color: rimColor, side: THREE.DoubleSide }),
  )
  topring.name = 'topring'
  topring.rotation.x = -Math.PI / 2
  topring.position.y = height + 0.002
  pivot.add(topring)

  if (glyphMaterial !== undefined) {
    const glyph = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD3D.glyph.size, BOARD3D.glyph.size),
      glyphMaterial,
    )
    glyph.name = 'glyph'
    glyph.rotation.x = -Math.PI / 2
    glyph.position.y = height + BOARD3D.glyph.lift
    pivot.add(glyph)
  }

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(BOARD3D.ring.inner, BOARD3D.ring.outer, 32),
    new THREE.MeshBasicMaterial({
      color: BOARD3D.ring.color,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  ring.name = 'ring'
  ring.rotation.x = -Math.PI / 2
  ring.position.y = height + BOARD3D.ring.lift
  ring.visible = false
  pivot.add(ring)
  return pivot
}
