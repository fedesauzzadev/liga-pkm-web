// AC: rotar-pokemart-90 — los 5 PokéMart (kind market) giran 90° antihorario
// EN EL LUGAR: mismas x/z/scale del solver, yawDeg exactamente −90 respecto de
// antes; models.new.json queda sincronizado con placements.json.
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

test('AC: rotar-pokemart-90/AC-2 - solver real: los 5 market rotan −90° en el lugar', () => {
  // AC-1 (dato, en su momento): market −90; hoy el valor vivo lo pinea
  // tests/rotar-pokemart-45.test.ts (Q-094): acá se pinea el mecanismo.
  expect(placements.models.yawOffsetDeg.gym).toBe(0)
  expect(placements.models.yawOffsetDeg.pokecenter).toBe(0)
  expect(placements.models.yawOffsetDeg.league).toBe(90)

  const antes = structuredClone(placements)
  antes.models.yawOffsetDeg.market = 0
  const actual = structuredClone(placements)
  actual.models.yawOffsetDeg.market = -90
  const previa = solvePlacements({ placements: antes, board, pedestals, imageSize: IMAGE })
  const solved = solvePlacements({ placements: actual, board, pedestals, imageSize: IMAGE })

  const markets = solved.buildings.filter((b) => b.kind === 'market')
  expect(markets.map((b) => b.nodeId).sort()).toEqual(MARKET_NODES)
  for (const building of markets) {
    const prev = previa.buildings.find((b) => b.nodeId === building.nodeId)!
    expect(prev.discarded).toBe(false)
    expect(building.discarded).toBe(false)
    expect(building.x).toBe(prev.x)
    expect(building.z).toBe(prev.z)
    expect(building.scale).toBe(prev.scale)
    expect(normDeg(building.yawDeg - prev.yawDeg)).toBeCloseTo(-90, 6)
  }
})

test('AC: rotar-pokemart-90/AC-3 - models.new.json sincronizado: market igual a placements.json', () => {
  const parsed = ModelsNewFileSchema.parse(
    JSON.parse(readFileSync(join('content', 'board', 'models.new.json'), 'utf8')) as unknown,
  )
  const market = parsed.models.market
  expect(market).toBeDefined()
  expect(market!.yawOffsetDeg).toBe(placements.models.yawOffsetDeg.market)
})
