// decor:report (SPEC-O/T-095/AC-6): planifica TODA la decoración con el mapa
// de ocupación único y escribe shots/decor-overlaps.svg (vista cenital en la
// orientación de la foto: caminos gris, edificios rojo, agua azul, árboles y
// arbustos verde, rocas marrón, flora en puntos, solapamientos en rojo
// intenso) + shots/decor-overlaps.report.json. Corre con type-stripping
// nativo de Node (≥22.18). Las funciones puras las testean
// tests/decor-report.test.ts; el main corre solo como entrypoint.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BoardGraphSchema } from '../packages/content/src/board.ts'
import { DecorCollisionSchema, crossCheckDecorCollision } from '../packages/content/src/decor-collision.ts'
import { DecorSchema } from '../packages/content/src/decor.ts'
import {
  landmarkPiecesOf, planDecor, type DecorPlanInput, type PlanPanel,
} from '../packages/content/src/decor-plan.ts'
import {
  buildDecorOverlapsSvg, buildDecorReportJson, type DecorReportInput,
} from '../packages/content/src/decor-report.ts'
import {
  PEDESTAL_RADIUS_UNITS, PlacementsFileSchema, PlacementsStacksSchema,
  placementsPxToWorld, solvePlacements, type PlacementsPedestal, type Vec2,
} from '../packages/content/src/placements.ts'
import { BoardStyleSchema } from '../packages/content/src/style.ts'

export interface DecorReportFiles {
  readonly svg: string
  readonly json: string
  readonly summary: string
}

/** Arma el plan con el contenido REAL y genera SVG + JSON + resumen (puro). */
export function buildDecorReportFiles(): DecorReportFiles {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))
  const readJson = (rel: string): unknown =>
    JSON.parse(readFileSync(join(repoRoot, rel), 'utf8')) as unknown

  const board = BoardGraphSchema.parse(readJson('content/board/kanto.json'))
  const decor = DecorSchema.parse(readJson('content/board/decor.json'))
  const collision = DecorCollisionSchema.parse(readJson('content/board/decor.collision.json'))
  const placements = PlacementsFileSchema.parse(readJson('content/board/placements.json'))
  const stacks = PlacementsStacksSchema.parse(readJson('content/board/deck-stacks.json'))
  const style = BoardStyleSchema.parse(readJson('content/board/style.json'))
  // PlacementsStacksSchema solo trae centros (x/y); el plan necesita el RECT
  // del panel (w/h) — se lee crudo con la misma forma que apps/web/stacks.ts.
  const panelsRaw = readJson('content/board/deck-stacks.json') as {
    stacks: Record<string, { x: number; y: number; w: number; h: number }>
  }
  const imageSize = board.meta.imageSize ?? [1176, 1600]

  const crossErrors = crossCheckDecorCollision(collision, decor)
  if (crossErrors.length > 0) throw new Error(`decor.collision.json: ${crossErrors.join(' · ')}`)

  const nodes: readonly Vec2[] = board.nodes.map((node) => placementsPxToWorld(node.x, node.y, imageSize))
  const nodeById = new Map(board.nodes.map((node) => [node.id, node]))
  const edges = board.edges.flatMap(([fromId, toId]) => {
    const from = nodeById.get(fromId)
    const to = nodeById.get(toId)
    if (from === undefined || to === undefined) return []
    return [{
      a: placementsPxToWorld(from.x, from.y, imageSize),
      b: placementsPxToWorld(to.x, to.y, imageSize),
    }]
  })
  const panels: readonly PlanPanel[] = Object.entries(panelsRaw.stacks).map(([key, rect]) => ({
    key,
    rect: {
      minX: (rect.x - imageSize[0] / 2) * 0.01,
      maxX: (rect.x + rect.w - imageSize[0] / 2) * 0.01,
      minZ: (rect.y - imageSize[1] / 2) * 0.01,
      maxZ: (rect.y + rect.h - imageSize[1] / 2) * 0.01,
    },
    anchor: placementsPxToWorld(rect.x, rect.y, imageSize),
  }))
  const solverPedestals: PlacementsPedestal[] = Object.entries(stacks.stacks).map(([key, rect]) => ({
    key, x: rect.x, y: rect.y, radius: PEDESTAL_RADIUS_UNITS,
  }))
  const solution = solvePlacements({ placements, board, pedestals: solverPedestals, imageSize })
  const buildings = new Map(solution.buildings.map((building) => [building.nodeId, building]))
  const nodePos = new Map(board.nodes.map((node) => [node.id, placementsPxToWorld(node.x, node.y, imageSize)]))
  const landmarkPieces = landmarkPiecesOf(board, decor, buildings, placements, nodePos)

  const planInput: DecorPlanInput = {
    collision,
    decor,
    nodes,
    edges,
    panels,
    buildings: solution.buildings,
    landmarkPieces,
    worldHalf: style.world.size[0] / 2 - 0.5,
    maxScatterMeshes: decor.budgets.maxDrawCalls,
  }
  const plan = planDecor(planInput)
  const reportInput: DecorReportInput = { collision, imageSize, nodes, edges, panels }
  const json = buildDecorReportJson(reportInput, plan)
  const summary = [
    `agua: ${plan.water.map((w) => `${w.zone} r${w.radius.toFixed(2)} @(${w.x.toFixed(1)},${w.z.toFixed(1)})`).join(', ') || '—'}` +
      (plan.omittedWater.length === 0 ? '' : ` · OMITIDA: ${plan.omittedWater.join(',')}`),
    `scatter: ${String(json.totals.scatterSpots)} puntos en ${String(plan.scatterSpecs.length)} specs` +
      (plan.trimmed.length === 0 ? '' : ` · recortadas: ${plan.trimmed.join(', ')}`),
    `landmarks ocultos (pisados): ${plan.hiddenLandmarks.length === 0 ? '—' : plan.hiddenLandmarks.join(', ')}`,
    `solapamientos: ${String(json.overlaps.length)}`,
    Object.entries(json.countsByCategory).map(([k, v]) => `${k} ${String(v)}`).join(' · '),
  ].join('\n')
  return {
    svg: buildDecorOverlapsSvg(reportInput, plan),
    json: `${JSON.stringify(json, null, 2)}\n`,
    summary,
  }
}

const isMain = process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  const files = buildDecorReportFiles()
  const root = fileURLToPath(new URL('..', import.meta.url))
  const shotsDir = join(root, 'shots')
  mkdirSync(shotsDir, { recursive: true })
  writeFileSync(join(shotsDir, 'decor-overlaps.svg'), files.svg, 'utf8')
  writeFileSync(join(shotsDir, 'decor-overlaps.report.json'), files.json, 'utf8')
  console.log(files.summary)
  console.log('decor:report OK → shots/decor-overlaps.svg + shots/decor-overlaps.report.json')
}
