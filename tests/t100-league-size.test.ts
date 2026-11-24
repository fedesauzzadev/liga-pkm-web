// SPEC-Q/T-100 — la Liga más grande (~+50 %, SOLO `league`): el cambio son dos
// valores de placements.json (1.55 → 2.3); sin código, sin cámara, sin nodos
// ni caminos. Numérico y de datos (NO-VISION): nada de "se ve bien".
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import {
  PlacementsFileSchema, PlacementsStacksSchema, solvePlacements, type PlacementsFile,
} from '../packages/content/src/index.ts'
import { obbCorners } from '../packages/content/src/placements.ts'
import { buildDecorReportFiles } from '../tools/decor-report.ts'

const IMAGE: readonly [number, number] = [1176, 1600]

const realPlacements: PlacementsFile = PlacementsFileSchema.parse(
  JSON.parse(readFileSync(join('content', 'board', 'placements.json'), 'utf8')) as unknown,
)
const realBoard = JSON.parse(readFileSync(join('content', 'board', 'kanto.json'), 'utf8')) as {
  nodes: readonly { id: string; x: number; y: number }[]
  edges: readonly (readonly [string, string])[]
  meta: { imageSize?: readonly [number, number] }
}
const realStacks = PlacementsStacksSchema.parse(
  JSON.parse(readFileSync(join('content', 'board', 'deck-stacks.json'), 'utf8')) as unknown,
)

const solve = () => {
  const board = {
    nodes: realBoard.nodes.map((node) => ({ ...node, type: 'empty' as const })),
    edges: realBoard.edges,
    meta: { imageSize: IMAGE },
  } as unknown as Parameters<typeof solvePlacements>[0]['board']
  const pedestals = Object.entries(realStacks.stacks).map(([key, r]) => ({ key, x: r.x, y: r.y, radius: 0.72 }))
  return solvePlacements({ placements: realPlacements, board, pedestals, imageSize: IMAGE })
}

// AC: SPEC-Q/T-100/AC-1 — cambian ÚNICAMENTE footprints.league y
// heights.league (2.3); los demás kinds, minGaps, search, models,
// removeStacks, proceduralBuildings y nodes.liga quedan intactos.
// SPEC-R/T-101/AC-5c: después de T-101 todos los kinds subieron
// (+25 %; league +75 %) y search.distMax pasó a 2.6 (Q-073); estos
// expects fijan el estado ACTUAL del archivo.
test('AC: SPEC-Q/T-100/AC-1 - solo league cambió a 2.3/2.3; el resto del archivo intacto', () => {
  expect(realPlacements.footprints).toEqual({ gym: 1.38, pokecenter: 1.25, market: 1.06, league: 4.03, house: 0.88, lab: 1.5 })
  expect(realPlacements.heights).toEqual({ gym: 1.38, pokecenter: 1.13, market: 0.9, league: 4.03, house: 0.81, lab: 1.38 })
  expect(realPlacements.minGaps).toEqual({ buildingToNodeCircle: 0.25, buildingToEdge: 0.2, buildingToBuilding: 0.2, buildingToPedestal: 0.3 })
  expect(realPlacements.search).toEqual({ distStart: 0.75, distStep: 0.1, distMax: 2.6, rotateStepsDeg: [15, -15, 30, -30, 45, -45, 60, -60, 90, -90], scaleFloor: 0.7 })
  // puerta-al-camino: el frente real del pokemart es +Z (market 0) y el puente de la Liga es +X (league 90).
  expect(realPlacements.models.yawOffsetDeg).toEqual({ gym: 0, pokecenter: 0, market: 0, league: 90 })
  expect(realPlacements.removeStacks).toEqual(['item', 'sorpresa'])
  expect(realPlacements.proceduralBuildings).toBe(false)
  expect(realPlacements.nodes.liga).toMatchObject({ kind: 'league', sideDeg: 11, distHint: 1.3 })
})

// AC: SPEC-Q/T-100/AC-2 — el tamaño dibujado viene del dato, no del código:
// el solver produce huella/altura = máximos del archivo (2.3) × escala. La
// normalización min(alto, huella) (SPEC-N/T-089/AC-5) no se toca.
test('AC: SPEC-Q/T-100/AC-2 - huella/altura de liga salen del dato (2.3 × escala)', () => {
  const liga = solve().buildings.find((building) => building.nodeId === 'liga')
  expect(liga).toBeDefined()
  expect(liga!.footprint).toBeCloseTo(realPlacements.footprints.league * liga!.scale, 9)
  expect(liga!.height).toBeCloseTo(realPlacements.heights.league * liga!.scale, 9)
})

// AC: SPEC-Q/T-100/AC-3 — el solver no se relaja: con la huella nueva la Liga
// queda colocada (no descartada), respeta minGaps y su escala queda dentro de
// [scaleFloor, 1]. Si la escala da < 1 va a OPEN-QUESTIONS (no se fuerza).
test('AC: SPEC-Q/T-100/AC-3 - liga colocada sin relajar reglas (minGaps, escala [0.7, 1])', () => {
  const liga = solve().buildings.find((building) => building.nodeId === 'liga')
  expect(liga, 'la Liga tiene que quedar colocada').toBeDefined()
  expect(liga!.discarded).toBe(false)
  expect(liga!.scale).toBeGreaterThanOrEqual(realPlacements.search.scaleFloor - 1e-9)
  expect(liga!.scale).toBeLessThanOrEqual(1 + 1e-9)
  expect(liga!.gaps.node).toBeGreaterThanOrEqual(realPlacements.minGaps.buildingToNodeCircle - 1e-9)
  expect(liga!.gaps.edge).toBeGreaterThanOrEqual(realPlacements.minGaps.buildingToEdge - 1e-9)
  expect(liga!.gaps.building).toBeGreaterThanOrEqual(realPlacements.minGaps.buildingToBuilding - 1e-9)
  expect(liga!.gaps.pedestal).toBeGreaterThanOrEqual(realPlacements.minGaps.buildingToPedestal - 1e-9)
})

// AC: SPEC-Q/T-100/AC-4 — el plan de decoración lee footprints en vivo: con la
// huella nueva el despeje se recalcula solo y decor:report queda en cero.
test('AC: SPEC-Q/T-100/AC-4 - decor:report sin solapamientos con la huella nueva', () => {
  const files = buildDecorReportFiles()
  const report = JSON.parse(files.json) as { overlaps: readonly unknown[] }
  expect(report.overlaps).toEqual([])
  expect(files.summary).toContain('solapamientos: 0')
})

// AC: SPEC-Q/T-100/AC-5 — (b) la Liga respeta los máximos nuevos (≤ 2.3 +ε)
// y (d) los 21 edificios siguen sin solapes OBB↔OBB. (c) los tests que
// fijaban 1.55 (tests/t099-models.test.ts) ahora fijan 2.3.
test('AC: SPEC-Q/T-100/AC-5 - liga ≤ 2.3 +ε y cero solapamientos en los 21 edificios', () => {
  const solution = solve()
  const liga = solution.buildings.find((building) => building.nodeId === 'liga')
  expect(liga).toBeDefined()
  expect(liga!.footprint).toBeLessThanOrEqual(realPlacements.footprints.league + 1e-9)
  expect(liga!.height).toBeLessThanOrEqual(realPlacements.heights.league + 1e-9)
  expect(solution.warnings).toEqual([])

  const placed = solution.buildings.filter((building) => !building.discarded)
  expect(placed).toHaveLength(21)
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const a = obbCorners({ x: placed[i]!.x, z: placed[i]!.z }, placed[i]!.footprint, placed[i]!.yawDeg)
      const b = obbCorners({ x: placed[j]!.x, z: placed[j]!.z }, placed[j]!.footprint, placed[j]!.yawDeg)
      const distance = Math.min(...a.flatMap((pa) => b.map((pb) => Math.hypot(pa.x - pb.x, pa.z - pb.z))))
      expect(distance, `${placed[i]!.nodeId}↔${placed[j]!.nodeId} sin solape`).toBeGreaterThan(0)
    }
  }
})
