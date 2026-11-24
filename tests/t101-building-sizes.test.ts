// SPEC-R/T-101 — edificios más grandes (+25 %; Liga +75 %): footprints/heights
// de placements.json a los nuevos máximos + search.distMax 1.8→2.6 (Q-073,
// aprobado por el dueño: con distMax 1.8, mercado_2/centro_r/fucsia/liga quedan
// descartados). Sin código, sin cámara, sin nodos ni caminos. Numérico y de
// datos (NO-VISION): nada de "se ve bien".
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { BoardGraphSchema } from '../packages/content/src/board.ts'
import {
  PlacementsFileSchema, PlacementsStacksSchema, solvePlacements, type PlacementsFile,
} from '../packages/content/src/index.ts'
import { obbCorners } from '../packages/content/src/placements.ts'
import { buildPlacementsReportJson } from '../packages/content/src/placements-report.ts'
import { buildDecorReportFiles } from '../tools/decor-report.ts'

const IMAGE: readonly [number, number] = [1176, 1600]

const realPlacements: PlacementsFile = PlacementsFileSchema.parse(
  JSON.parse(readFileSync(join('content', 'board', 'placements.json'), 'utf8')) as unknown,
)
const realBoard = BoardGraphSchema.parse(
  JSON.parse(readFileSync(join('content', 'board', 'kanto.json'), 'utf8')) as unknown,
)
const realStacks = PlacementsStacksSchema.parse(
  JSON.parse(readFileSync(join('content', 'board', 'deck-stacks.json'), 'utf8')) as unknown,
)
const realPedestals = Object.entries(realStacks.stacks).map(([key, r]) => ({ key, x: r.x, y: r.y, radius: 0.72 }))

const realInput = { placements: realPlacements, board: realBoard, pedestals: realPedestals, imageSize: IMAGE }
const solve = () => solvePlacements(realInput)

// AC: SPEC-R/T-101/AC-1 — cambian ÚNICAMENTE footprints/heights (valores
// exactos del spec) y search.distMax (1.8→2.6, Q-073); minGaps, el resto de
// search, models, removeStacks, proceduralBuildings y nodes quedan intactos
// (liga conserva sideDeg 11, distHint 1.3 y su nota).
test('AC: SPEC-R/T-101/AC-1 - footprints/heights nuevos + distMax 2.6; el resto del archivo intacto', () => {
  expect(realPlacements.footprints).toEqual({ gym: 1.38, pokecenter: 1.25, market: 1.06, league: 4.03, house: 0.88, lab: 1.5 })
  expect(realPlacements.heights).toEqual({ gym: 1.38, pokecenter: 1.13, market: 0.9, league: 4.03, house: 0.81, lab: 1.38 })
  expect(realPlacements.minGaps).toEqual({ buildingToNodeCircle: 0.25, buildingToEdge: 0.2, buildingToBuilding: 0.2, buildingToPedestal: 0.3 })
  expect(realPlacements.search).toEqual({ distStart: 0.75, distStep: 0.1, distMax: 2.6, rotateStepsDeg: [15, -15, 30, -30, 45, -45, 60, -60, 90, -90], scaleFloor: 0.7 })
  // puerta-al-camino: el frente real del pokemart es +Z (market 0) y el puente de la Liga es +X (league 90).
  expect(realPlacements.models.yawOffsetDeg).toEqual({ gym: 0, pokecenter: 0, market: 0, league: 90 })
  expect(realPlacements.removeStacks).toEqual(['item', 'sorpresa'])
  expect(realPlacements.proceduralBuildings).toBe(false)
  expect(Object.keys(realPlacements.nodes)).toHaveLength(21)
  expect(realPlacements.nodes.liga).toMatchObject({ kind: 'league', sideDeg: 11, distHint: 1.3 })
  expect(realPlacements.nodes.liga?.note).toContain('SE MUEVE')
})

// AC: SPEC-R/T-101/AC-2 — el tamaño dibujado viene del dato, no del código:
// para TODOS los edificios, huella/altura = máximos del archivo × escala. La
// normalización min(alto, huella) (SPEC-N/T-089/AC-5) no se toca.
test('AC: SPEC-R/T-101/AC-2 - huella/altura salen del dato (máximo × escala) en los 21', () => {
  const solution = solve()
  expect(solution.buildings).toHaveLength(21)
  for (const building of solution.buildings) {
    expect(building.footprint, `${building.nodeId} huella = máximo × escala`).toBeCloseTo(
      realPlacements.footprints[building.kind] * building.scale, 9,
    )
    expect(building.height, `${building.nodeId} altura = máximo × escala`).toBeCloseTo(
      realPlacements.heights[building.kind] * building.scale, 9,
    )
  }
})

// AC: SPEC-R/T-101/AC-3 — el solver no se relaja: 21/21 colocados (ninguno
// descartado), minGaps intactos y respetados, escala dentro de [scaleFloor, 1].
// Los que quedan a escala < 1 se registran en docs/OPEN-QUESTIONS.md (Q-073).
test('AC: SPEC-R/T-101/AC-3 - 21/21 colocados sin relajar reglas (minGaps, escala [0.7, 1])', () => {
  const solution = solve()
  expect(solution.buildings.filter((b) => b.discarded), solution.warnings.join(' | ')).toEqual([])
  expect(solution.warnings).toEqual([])
  const placed = solution.buildings.filter((b) => !b.discarded)
  expect(placed).toHaveLength(21)
  for (const building of placed) {
    expect(building.scale, `${building.nodeId} escala ≥ scaleFloor`).toBeGreaterThanOrEqual(realPlacements.search.scaleFloor - 1e-9)
    expect(building.scale, `${building.nodeId} escala ≤ 1`).toBeLessThanOrEqual(1 + 1e-9)
    expect(building.gaps.node, `${building.nodeId} gap nodo`).toBeGreaterThanOrEqual(realPlacements.minGaps.buildingToNodeCircle - 1e-9)
    expect(building.gaps.edge, `${building.nodeId} gap arista`).toBeGreaterThanOrEqual(realPlacements.minGaps.buildingToEdge - 1e-9)
    expect(building.gaps.building, `${building.nodeId} gap edificio`).toBeGreaterThanOrEqual(realPlacements.minGaps.buildingToBuilding - 1e-9)
    expect(building.gaps.pedestal, `${building.nodeId} gap pedestal`).toBeGreaterThanOrEqual(realPlacements.minGaps.buildingToPedestal - 1e-9)
  }
})

// AC: SPEC-R/T-101/AC-4 — placements:report muestra la escala final por
// edificio (21 filas, sin descartes) y decor:report queda en cero
// solapamientos (el despeje se recalcula solo desde footprints en vivo).
test('AC: SPEC-R/T-101/AC-4 - reportes: escala por edificio y decor sin solapamientos', () => {
  const report = buildPlacementsReportJson(realInput, solve())
  expect(report.buildings).toHaveLength(21)
  for (const row of report.buildings) {
    expect(row.discarded, `${row.nodeId} colocado`).toBe(false)
    expect(row.scale, `${row.nodeId} escala reportada`).toBeGreaterThanOrEqual(realPlacements.search.scaleFloor - 1e-9)
    expect(row.scale, `${row.nodeId} escala reportada`).toBeLessThanOrEqual(1 + 1e-9)
  }
  expect(report.warnings).toEqual([])

  const files = buildDecorReportFiles()
  const decor = JSON.parse(files.json) as { overlaps: readonly unknown[] }
  expect(decor.overlaps).toEqual([])
  expect(files.summary).toContain('solapamientos: 0')
})

// AC: SPEC-R/T-101/AC-5 — (b) cada edificio ≤ máximo nuevo (+ε) con escala en
// [scaleFloor, 1] y (d) cero solapes OBB↔OBB entre los 21. (c) los tests que
// fijaban los valores viejos (t100/t099) y el guardia de escala de t091 se
// actualizan con comentario SPEC-R.
test('AC: SPEC-R/T-101/AC-5 - ≤ máximos nuevos y cero solapamientos en los 21 edificios', () => {
  const solution = solve()
  for (const building of solution.buildings) {
    expect(building.footprint, `${building.nodeId} huella ≤ máximo nuevo`).toBeLessThanOrEqual(realPlacements.footprints[building.kind] + 1e-9)
    expect(building.height, `${building.nodeId} altura ≤ máximo nuevo`).toBeLessThanOrEqual(realPlacements.heights[building.kind] + 1e-9)
  }
  const placed = solution.buildings.filter((b) => !b.discarded)
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
