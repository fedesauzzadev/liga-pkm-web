// AC: rotar-pokemart-45 — los 5 PokéMart (kind market) giran 45° horario
// (derecha) a partir de su orientación actual (market: −90 → −45). A 45° la
// OBB cambia, así que el solver puede ajustar x/z/scale: no se comparan.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { BoardGraphSchema } from '../packages/content/src/board.ts'
import {
  PlacementsFileSchema,
  PlacementsStacksSchema,
  solvePlacements,
  type PlacementsFile,
  type PlacementsPedestal,
} from '../packages/content/src/placements.ts'
import { ModelsNewFileSchema } from '../packages/content/src/index.ts'

const IMAGE: readonly [number, number] = [1176, 1600]
const MARKET_NODES = ['mercado_2', 'mercado_b', 'mercado_l', 'mercado_r', 'mercado_t']
const normDeg = (d: number): number => (((d + 180) % 360) + 360) % 360 - 180

const placements: PlacementsFile = PlacementsFileSchema.parse(
  JSON.parse(readFileSync(join('content', 'board', 'placements.json'), 'utf8')) as unknown,
)
const board = BoardGraphSchema.parse(
  JSON.parse(readFileSync(join('content', 'board', 'kanto.json'), 'utf8')) as unknown,
)
const stacks = PlacementsStacksSchema.parse(
  JSON.parse(readFileSync(join('content', 'board', 'deck-stacks.json'), 'utf8')) as unknown,
)
const pedestals: readonly PlacementsPedestal[] = [
  ...Object.entries(stacks.stacks).map(([key, r]) => ({ key, x: r.x, y: r.y, radius: 0.72 })),
  ...Object.entries(stacks.extraStacks).map(([key, r]) => ({ key, x: r.x, y: r.y, radius: 0.72 })),
]

test('AC: rotar-pokemart-45/AC-2 - solver real: los 5 market rotan +45° sin descartarse', () => {
  // AC-1 (dato): market en −45; gym/pokecenter/league/lab siguen en 0.
  expect(placements.models.yawOffsetDeg.market).toBe(-45)
  expect(placements.models.yawOffsetDeg.gym).toBe(0)
  expect(placements.models.yawOffsetDeg.pokecenter).toBe(0)
  expect(placements.models.yawOffsetDeg.league).toBe(0)
  expect(placements.models.yawOffsetDeg.lab ?? 0).toBe(0)

  const antes = structuredClone(placements)
  antes.models.yawOffsetDeg.market = -90
  const previa = solvePlacements({ placements: antes, board, pedestals, imageSize: IMAGE })
  const actual = solvePlacements({ placements, board, pedestals, imageSize: IMAGE })

  const markets = actual.buildings.filter((b) => b.kind === 'market')
  expect(markets.map((b) => b.nodeId).sort()).toEqual(MARKET_NODES)
  // A 45° la OBB cambia: el solver puede re-colocar en otro paso de
  // rotateStepsDeg (±15°), por eso se acepta 45 + paso (ver Q-094).
  const accepted = [45, ...placements.search.rotateStepsDeg.map((s) => 45 + s)]
  for (const building of markets) {
    const prev = previa.buildings.find((b) => b.nodeId === building.nodeId)!
    expect(prev.discarded).toBe(false)
    expect(building.discarded).toBe(false)
    const diff = normDeg(building.yawDeg - prev.yawDeg)
    expect(diff).toBeGreaterThan(0)
    expect(accepted.some((a) => Math.abs(normDeg(diff - a)) < 1e-6)).toBe(true)
  }
})

test('AC: rotar-pokemart-45/AC-3 - models.new.json sincronizado: market −45 como en placements.json', () => {
  const parsed = ModelsNewFileSchema.parse(
    JSON.parse(readFileSync(join('content', 'board', 'models.new.json'), 'utf8')) as unknown,
  )
  const market = parsed.models.market
  expect(market).toBeDefined()
  expect(market!.yawOffsetDeg).toBe(-45)
  expect(market!.yawOffsetDeg).toBe(placements.models.yawOffsetDeg.market)
  expect(parsed.models.lab!.yawOffsetDeg).toBe(0)
})
