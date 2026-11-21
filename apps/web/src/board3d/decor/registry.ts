// Registro de piezas (SPEC-H/T-068/AC-1): kind → builder procedural (T-070
// sumará modelos glTF sobre la misma interfaz). Un kind desconocido en runtime
// ⇒ fallback invisible (grupo vacío oculto): content:validate ya lo cerró en
// la frontera, esto es el cinturón de seguridad. Three puro (NO-VISION).
import * as THREE from 'three'
import { gymParts, houseParts, labParts, marketParts, pokecenterParts } from './buildings'
import { pieceMaterial, type PiecePart } from './geometry'
import {
  bushParts, deadTreeParts, flowerPatchParts, grassTuftParts, lavaPoolParts,
  mistParts, mountainParts, pondParts, reedsParts, rockParts, treeParts,
} from './nature'
import { fenceParts, flagParts, lampParts, signParts } from './props'
import type { PiecePalette, PieceSpec } from './types'

export type PieceBuilder = (spec: PieceSpec, palette: PiecePalette) => readonly PiecePart[]

/** Catálogo: todo kind de DECOR_KINDS (@liga/content) tiene builder. */
export const DECOR_REGISTRY: Readonly<Record<string, PieceBuilder>> = {
  house: houseParts,
  pokecenter: pokecenterParts,
  market: marketParts,
  lab: labParts,
  gym: gymParts,
  tree: treeParts,
  deadTree: deadTreeParts,
  bush: bushParts,
  rock: rockParts,
  mountain: mountainParts,
  pond: pondParts,
  reeds: reedsParts,
  grassTuft: grassTuftParts,
  flowerPatch: flowerPatchParts,
  lavaPool: lavaPoolParts,
  mist: mistParts,
  fence: fenceParts,
  sign: signParts,
  lamp: lampParts,
  flag: flagParts,
}

/** Partes de una pieza (null ⇒ kind desconocido: fallback invisible). */
export function piecePartsOf(spec: PieceSpec, palette: PiecePalette): readonly PiecePart[] | null {
  const builder = DECOR_REGISTRY[spec.kind]
  return builder === undefined ? null : builder(spec, palette)
}

/**
 * AC-1/AC-2: pieza como grupo three — una malla por parte (la sólida mergeada
 * ⇒ 1 draw call). Kind desconocido ⇒ grupo oculto sin hijos (invisible).
 */
export function buildDecorPiece(spec: PieceSpec, palette: PiecePalette): THREE.Group {
  const group = new THREE.Group()
  group.name = `decor:${spec.kind}`
  group.userData = { kind: spec.kind, ...(spec.text === undefined ? {} : { text: spec.text }) }
  const parts = piecePartsOf(spec, palette)
  if (parts === null) {
    group.visible = false
    group.userData.unknownKind = true
    return group
  }
  parts.forEach((piece, index) => {
    const mesh = new THREE.Mesh(piece.geometry, piece.material ?? pieceMaterial)
    mesh.name = `piece:${index}`
    group.add(mesh)
  })
  return group
}
