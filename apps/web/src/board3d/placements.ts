// Reubicación de edificios en runtime (SPEC-N/T-091): consume el solver de
// T-089 (solvePlacements de @liga/content) con placements.json + paneles de
// mazo. Los transforms por pieza (QUÉ pieza es el edificio primario de cada
// nodo) son puros y viven en @liga/content (buildingTransformsFor); acá el
// parseo en la frontera Zod + el cacheo por tablero. Puro (sin three) — lo
// consumen scene.ts y ModelDecor.tsx.
import type { BoardGraph, Decor, PlacedBuilding, PlacementsFile } from '@liga/content'
import {
  buildingTransformsFor, PEDESTAL_RADIUS_UNITS, PlacementsFileSchema, solvePlacements,
} from '@liga/content'
import placementsJson from '../../../../content/board/placements.json'
import type { LandmarkTransform } from './landmarks'
import type { DeckStacksFile } from './stacks'

/** placements.json parseado y validado (una vez, en la frontera Zod). */
export const boardPlacements: PlacementsFile = PlacementsFileSchema.parse(placementsJson)

/** Pieza procedural que representa a cada edificio (puro, @liga/content). */
export { BUILDING_PIECE_KIND } from '@liga/content'

export type { LandmarkTransform }

/**
 * Resuelve la reubicación una vez por escena: mismos inputs que
 * `pnpm placements:report` (paneles de mazo como pedestales, imagen del
 * tablero). Avisa por consola si el solver emite warnings. Cacheado por tablero
 * (la escena procedural y la capa de modelos comparten el mismo resultado).
 */
export function solveBuildings(
  board: BoardGraph,
  stacks: DeckStacksFile,
): ReadonlyMap<string, PlacedBuilding> {
  const cached = solveCache.get(board)?.get(stacks)
  if (cached !== undefined) return cached
  const imageSize = board.meta.imageSize ?? [1176, 1600]
  const pedestals = stacks.panels.map((panel) => ({
    key: panel.key,
    x: panel.x,
    y: panel.y,
    radius: PEDESTAL_RADIUS_UNITS,
  }))
  const solution = solvePlacements({ placements: boardPlacements, board, pedestals, imageSize })
  // El breadcrumb de warnings es para el tablero real (56 nodos ≥ 21 edificios
  // a placear). Los fixtures de tests (1–2 nodos) no lo disparan: el chequeo de
  // correspondencia real es crossCheckPlacements en `pnpm content:validate`.
  if (board.nodes.length >= Object.keys(boardPlacements.nodes).length) {
    for (const warning of solution.warnings) console.warn(`[placements] ${warning}`)
  }
  const result = new Map(solution.buildings.map((building) => [building.nodeId, building]))
  const perBoard = solveCache.get(board) ?? new Map<DeckStacksFile, ReadonlyMap<string, PlacedBuilding>>()
  perBoard.set(stacks, result)
  solveCache.set(board, perBoard)
  return result
}

const solveCache = new WeakMap<BoardGraph, Map<DeckStacksFile, ReadonlyMap<string, PlacedBuilding>>>()

/** yaw del solver (grados de tablero: dirección de la puerta hacia el camino)
 *  → rotation.y de la escena (re-export del puro de @liga/content). */
export { sceneRotYOf } from '@liga/content'

/**
 * Transform por pieza de landmark (puro, @liga/content buildingTransformsFor):
 * la primaria de cada edificio no descartado recibe x/z/yaw/escala del solver;
 * las demás piezas quedan relativas al nodo (sin entrada ⇒ buildLandmarks usa
 * el offset de decor.json de siempre).
 */
export function landmarkTransforms(
  board: BoardGraph,
  decor: Decor,
  buildings: ReadonlyMap<string, PlacedBuilding>,
): ReadonlyMap<string, LandmarkTransform> {
  return buildingTransformsFor(board, decor, buildings, boardPlacements)
}
