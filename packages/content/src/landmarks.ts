// Landmarks puros (SPEC-O/T-095): el listado de piezas por nodo y el transform
// del solver de placements, SIN three — antes vivían en apps/web (landmarks.ts
// y placements.ts); acá los consume el planificador de decoración y el reporte
// `pnpm decor:report` con la misma fuente de verdad que la escena.
import type { BoardGraph } from './board.ts'
import type { Decor, DecorKind, DecorLandmark } from './decor.ts'
import type { PlacedBuilding, PlacementsFile, PlacementsKind } from './placements.ts'

export interface LandmarkEntry {
  readonly nodeId: string
  readonly index: number
  readonly piece: DecorLandmark
}

/** Piezas que corresponden a cada nodo: byNodeId primero, luego byNodeType. */
export function landmarkEntriesFor(board: BoardGraph, decor: Decor): readonly LandmarkEntry[] {
  const placed: LandmarkEntry[] = []
  for (const node of board.nodes) {
    const pieces = [
      ...(decor.landmarks?.byNodeId[node.id] ?? []),
      ...(decor.landmarks?.byNodeType[node.type] ?? []),
    ]
    pieces.forEach((piece, index) => placed.push({ nodeId: node.id, index, piece }))
  }
  return placed
}

/**
 * Pieza procedural que representa a cada edificio de placements (T-091): la
 * Liga usa la pieza `gym`; `lab`/`house` coinciden 1:1.
 */
export const BUILDING_PIECE_KIND: Readonly<Record<PlacementsKind, DecorKind>> = {
  gym: 'gym',
  pokecenter: 'pokecenter',
  market: 'market',
  lab: 'lab',
  league: 'gym',
  house: 'house',
}

/** SPEC-P/T-099/AC-B1: piezas de edificio que la pieza procedural NUNCA debe
 *  dibujar cuando `placements.proceduralBuildings` es false (la Liga usa la
 *  pieza `gym`, ya cubierta). `house` no está: Pueblo Paleta conserva las suyas. */
export const SUPPRESSIBLE_PIECE_KINDS: readonly DecorKind[] = ['gym', 'pokecenter', 'market', 'lab']

/** Conjunto de piezas a NO dibujar según placements.json (puro; lo consume
 *  buildLandmarks de la escena). Vacío ⇒ sin supresión. */
export function suppressedBuildingPieces(placements: PlacementsFile): ReadonlySet<DecorKind> {
  return placements.proceduralBuildings === false ? new Set(SUPPRESSIBLE_PIECE_KINDS) : new Set<DecorKind>()
}

const DEG = Math.PI / 180

/** yaw del solver (grados de tablero) → rotation.y de escena (frente +Z). */
export const sceneRotYOf = (yawDeg: number): number => (90 - yawDeg) * DEG

export interface LandmarkTransform {
  readonly buildingKind: PlacementsKind
  readonly x: number
  readonly z: number
  readonly rotY: number
  readonly buildingScale: number
  readonly targetHeight: number
  readonly maxFootprint: number
}

/**
 * Transform por pieza de landmark: la primaria de cada edificio no descartado
 * recibe x/z/yaw/escala del solver (T-089); las demás piezas quedan relativas
 * al nodo (sin entrada ⇒ offset de decor.json).
 */
export function buildingTransformsFor(
  board: BoardGraph,
  decor: Decor,
  buildings: ReadonlyMap<string, PlacedBuilding>,
  placements: PlacementsFile,
): ReadonlyMap<string, LandmarkTransform> {
  const transforms = new Map<string, LandmarkTransform>()
  const claimed = new Set<string>()
  for (const placed of landmarkEntriesFor(board, decor)) {
    const building = buildings.get(placed.nodeId)
    if (building === undefined || building.discarded || claimed.has(placed.nodeId)) continue
    if (BUILDING_PIECE_KIND[building.kind] !== placed.piece.kind) continue
    claimed.add(placed.nodeId)
    transforms.set(`${placed.nodeId}:${placed.index}`, {
      buildingKind: building.kind,
      x: building.x,
      z: building.z,
      rotY: sceneRotYOf(building.yawDeg),
      buildingScale: building.scale,
      targetHeight: placements.heights[building.kind],
      maxFootprint: placements.footprints[building.kind],
    })
  }
  return transforms
}
