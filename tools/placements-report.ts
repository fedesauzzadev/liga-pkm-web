// placements:report — resuelve la reubicación de edificios (SPEC-N/T-089) y
// escribe shots/placements.svg (orientación de la foto del tablero) +
// shots/placements.report.json. Corre con type-stripping nativo de Node (≥22.18).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BoardGraphSchema } from '../packages/content/src/board.ts'
import {
  PEDESTAL_RADIUS_UNITS,
  PlacementsFileSchema,
  PlacementsStacksSchema,
  crossCheckPlacements,
  solvePlacements,
  type PlacementsPedestal,
} from '../packages/content/src/placements.ts'
import {
  buildPlacementsReportJson,
  buildPlacementsSvg,
} from '../packages/content/src/placements-report.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(join(repoRoot, rel), 'utf8')) as unknown

const board = BoardGraphSchema.parse(readJson('content/board/kanto.json'))
const placements = PlacementsFileSchema.parse(readJson('content/board/placements.json'))
const stacks = PlacementsStacksSchema.parse(readJson('content/board/deck-stacks.json'))
const imageSize = board.meta.imageSize ?? [1176, 1600]

const crossErrors = crossCheckPlacements(placements, board)
if (crossErrors.length > 0) {
  console.error('placements:report FALLA — nodos inexistentes en kanto.json:')
  for (const error of crossErrors) console.error(`  ${error}`)
  process.exit(1)
}

const pedestals: PlacementsPedestal[] = [
  ...Object.entries(stacks.stacks).map(([key, stack]) => ({
    key,
    x: stack.x,
    y: stack.y,
    radius: PEDESTAL_RADIUS_UNITS,
  })),
  ...Object.entries(stacks.extraStacks).map(([key, stack]) => ({
    key,
    x: stack.x,
    y: stack.y,
    radius: PEDESTAL_RADIUS_UNITS,
  })),
]

const input = { placements, board, pedestals, imageSize }
const solution = solvePlacements(input)

const shotsDir = join(repoRoot, 'shots')
mkdirSync(shotsDir, { recursive: true })
writeFileSync(join(shotsDir, 'placements.svg'), buildPlacementsSvg(input, solution), 'utf8')
writeFileSync(
  join(shotsDir, 'placements.report.json'),
  `${JSON.stringify(buildPlacementsReportJson(input, solution), null, 2)}\n`,
  'utf8',
)

for (const warning of solution.warnings) console.warn(`WARN ${warning}`)
for (const building of solution.buildings) {
  const state = building.discarded ? 'DESCARTADO' : `escala ${building.scale.toFixed(2)} a ${building.dist.toFixed(2)} u`
  const decor = building.decor === null ? 'sin decor' : `decor ${building.decor.kind}`
  console.log(
    `  ${building.nodeId.padEnd(12)} ${building.kind.padEnd(10)} ${state.padEnd(24)} ` +
      `sideDeg ${building.sideDeg.toFixed(0).padStart(4)}  gaps n/e/b/p ` +
      `${building.gaps.node.toFixed(2)}/${building.gaps.edge.toFixed(2)}/` +
      `${building.gaps.building === Number.POSITIVE_INFINITY ? '∞' : building.gaps.building.toFixed(2)}/` +
      `${building.gaps.pedestal.toFixed(2)}  ${decor}`,
  )
}
const placedCount = solution.buildings.filter((b) => !b.discarded).length
console.log(
  `placements:report OK — ${String(placedCount)}/${String(solution.buildings.length)} edificios · ` +
    `${String(solution.warnings.length)} warning(s) → shots/placements.svg + shots/placements.report.json`,
)
