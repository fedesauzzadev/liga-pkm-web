// Adaptador del plan de decoración (SPEC-O/T-095): arma el DecorPlan con el
// mismo contenido que la escena (kanto.json, deck-stacks, decor.json,
// placements.json) y lo cachea por tablero. La escena procedural, la capa de
// modelos y el lago del terreno consumen ESTE plan — una sola fuente de verdad.
// Puro (sin three): puede testearse en node.
import type { BoardGraph, Decor } from '@liga/content'
import {
  DecorCollisionSchema, landmarkPiecesOf, panelRectOf, planDecor,
  placementsPxToWorld, type DecorCollision, type DecorPlan, type PlanPanel,
} from '@liga/content'
import collisionJson from '../../../../../content/board/decor.collision.json'
import { boardPlacements, solveBuildings } from '../placements'
import { boardStyle } from '../style'
import type { DeckStacksFile } from '../stacks'

export const boardCollision: DecorCollision = DecorCollisionSchema.parse(collisionJson)

const planCache = new WeakMap<BoardGraph, WeakMap<DeckStacksFile, WeakMap<Decor, DecorPlan>>>()

/** Plan de decoración cacheado por (board, stacks, decor). */
export function decorPlanFor(board: BoardGraph, stacks: DeckStacksFile, decor: Decor): DecorPlan {
  const byStacks = planCache.get(board) ?? new WeakMap<DeckStacksFile, WeakMap<Decor, DecorPlan>>()
  planCache.set(board, byStacks)
  const byDecor = byStacks.get(stacks) ?? new WeakMap<Decor, DecorPlan>()
  byStacks.set(stacks, byDecor)
  const cached = byDecor.get(decor)
  if (cached !== undefined) return cached

  const imageSize = board.meta.imageSize ?? [1176, 1600]
  const nodeById = new Map(board.nodes.map((node) => [node.id, node]))
  const nodePos = new Map(
    board.nodes.map((node) => {
      const world = placementsPxToWorld(node.x, node.y, imageSize)
      return [node.id, world]
    }),
  )
  const panels: readonly PlanPanel[] = stacks.panels.map((panel) => ({
    key: panel.key,
    rect: panelRectOf(panel, imageSize),
    anchor: placementsPxToWorld(panel.x, panel.y, imageSize),
  }))
  const buildings = solveBuildings(board, stacks)
  const plan = planDecor({
    collision: boardCollision,
    decor,
    nodes: [...nodePos.values()],
    edges: board.edges.flatMap(([fromId, toId]) => {
      const from = nodeById.get(fromId)
      const to = nodeById.get(toId)
      if (from === undefined || to === undefined) return []
      return [{
        a: placementsPxToWorld(from.x, from.y, imageSize),
        b: placementsPxToWorld(to.x, to.y, imageSize),
      }]
    }),
    panels,
    buildings: [...buildings.values()],
    landmarkPieces: landmarkPiecesOf(board, decor, buildings, boardPlacements, nodePos),
    worldHalf: boardStyle.world.size[0] / 2 - 0.5,
    maxScatterMeshes: decor.budgets.maxDrawCalls,
  })
  byDecor.set(decor, plan)
  return plan
}
