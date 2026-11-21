// overlays (SPEC-K/T-070b/AC-5): piezas procedurales ENCIMA de una casa Kenney
// para los edificios de Pokémon — cartel con cruz roja (Centro), bandera del
// líder (gimnasio), toldo (Mercado) y cartel (laboratorio). No se recolorean
// modelos por nombre de malla: todo va como pieza aparte. Three puro.
import * as THREE from 'three'
import { mergeParts, part, pieceMaterial, type PiecePart } from '../decor/geometry'
import type { PiecePalette } from '../decor/types'
import { pal } from '../decor/types'
import { buildDecorPiece } from '../decor/registry'

const meshOf = (parts: readonly PiecePart[]): THREE.Group => {
  const group = new THREE.Group()
  group.name = 'overlay'
  parts.forEach((piece, index) => {
    group.add(new THREE.Mesh(piece.geometry, piece.material ?? pieceMaterial))
    group.children[index]!.name = `overlay:${index}`
  })
  return group
}

/**
 * Overlay para un edificio `kind` normalizado a `height`; `flagColor` solo
 * para gimnasios (color de la medalla del líder). null ⇒ sin overlay.
 */
export function buildBuildingOverlay(
  kind: 'house' | 'pokecenter' | 'market' | 'lab' | 'gym',
  palette: PiecePalette,
  height: number,
  flagColor?: string,
): THREE.Group | null {
  if (kind === 'house') return null
  if (kind === 'gym') {
    const flag = buildDecorPiece({ kind: 'flag', ...(flagColor === undefined ? {} : { flag: flagColor }) }, palette)
    flag.position.set(0.42, 0, 0.34)
    flag.scale.setScalar(Math.max(0.8, height * 1.1))
    return flag
  }
  if (kind === 'pokecenter') {
    // Cruz roja sobre un poste corto, apenas por encima del techo.
    const arm = 0.16
    const group = meshOf([mergeParts([
      part(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 6), '#F4F7FA', { pos: [0, height + 0.08, 0.3] }),
      part(new THREE.BoxGeometry(arm, 0.05, 0.012), '#E3350D', { pos: [0, height + 0.16, 0.3] }),
      part(new THREE.BoxGeometry(0.05, arm, 0.012), '#E3350D', { pos: [0, height + 0.16, 0.3] }),
    ])])
    return group
  }
  if (kind === 'market') {
    // Toldo de listones a la altura de la puerta.
    const wood = pal(palette, 'wood', '#7A5230')
    const stripe = pal(palette, 'roofRed', '#C84B3A')
    const awning = meshOf([mergeParts([
      part(new THREE.BoxGeometry(0.5, 0.025, 0.16), wood, { pos: [0, height * 0.62, -0.26] }),
      part(new THREE.BoxGeometry(0.1, 0.02, 0.18), stripe, { pos: [-0.15, height * 0.63, -0.26] }),
      part(new THREE.BoxGeometry(0.1, 0.02, 0.18), stripe, { pos: [0.05, height * 0.63, -0.26] }),
    ])])
    return awning
  }
  // lab: cartel de madera con la altura del edificio.
  const wood = pal(palette, 'wood', '#7A5230')
  return meshOf([mergeParts([
    part(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 6), wood, { pos: [0.38, height * 0.6, 0.3] }),
    part(new THREE.BoxGeometry(0.22, 0.12, 0.02), pal(palette, 'wall', '#EADBB8'), { pos: [0.38, height * 0.75, 0.3] }),
  ])])
}
