// AC: SPEC-N/T-089/AC-7 y AC-8 — reporte y validación sobre el tablero REAL
// (content/board/kanto.json + placements.json + deck-stacks.json).
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { BoardGraphSchema } from './board.ts'
import {
  PlacementsFileSchema,
  PlacementsStacksSchema,
  crossCheckPlacements,
  distPointToPolygon,
  obbCorners,
  solvePlacements,
  type PlacementsPedestal,
  type PlacementsFile,
  type PlacementSolution,
} from './placements.ts'
import { buildPlacementsReportJson, buildPlacementsSvg } from './placements-report.ts'

const IMAGE: readonly [number, number] = [1176, 1600]

const realBoard = BoardGraphSchema.parse(
  JSON.parse(readFileSync(new URL('../../../content/board/kanto.json', import.meta.url), 'utf8')),
)
const realPlacements: PlacementsFile = PlacementsFileSchema.parse(
  JSON.parse(readFileSync(new URL('../../../content/board/placements.json', import.meta.url), 'utf8')),
)
const realStacks = PlacementsStacksSchema.parse(
  JSON.parse(readFileSync(new URL('../../../content/board/deck-stacks.json', import.meta.url), 'utf8')),
)
const realPedestals: readonly PlacementsPedestal[] = [
  ...Object.entries(realStacks.stacks).map(([key, r]) => ({ key, x: r.x, y: r.y, radius: 0.72 })),
  ...Object.entries(realStacks.extraStacks).map(([key, r]) => ({ key, x: r.x, y: r.y, radius: 0.72 })),
]

const realInput = { placements: realPlacements, board: realBoard, pedestals: realPedestals, imageSize: IMAGE }
const normDeg = (d: number): number => (((d + 180) % 360) + 360) % 360 - 180

// ── AC-7 ────────────────────────────────────────────────────────────────────
test('AC: SPEC-N/T-089/AC-7 - placements:report genera SVG del tablero y JSON por edificio', () => {
  const solution = solvePlacements(realInput)
  const svg = buildPlacementsSvg(realInput, solution)
  expect(svg).toContain('viewBox="0 0 1176 1600"')
  expect(svg).toContain('<polygon') // edificios como rectángulos orientados
  expect(svg).toContain('<line') // aristas
  expect(svg).toContain('<circle') // nodos y pedestales
  for (const building of solution.buildings) {
    if (building.discarded) continue
    expect(svg).toContain(`>${building.nodeId}<`)
  }

  const report = buildPlacementsReportJson(realInput, solution)
  expect(report.buildings.length).toBe(21)
  // La clave `decor` siempre existe (objeto o null); el resto es el contrato.
  for (const row of report.buildings) {
    expect(Object.keys(row).sort()).toEqual([
      'decor', 'discarded', 'dist', 'gaps', 'height', 'kind', 'nodeId', 'scale', 'sideDeg', 'x', 'yawDeg', 'z',
    ])
    expect(typeof row.nodeId).toBe('string')
    expect(['gym', 'pokecenter', 'market', 'lab', 'league', 'house']).toContain(row.kind)
  }
  expect(Array.isArray(report.warnings)).toBe(true)
})

// ── AC-8 ────────────────────────────────────────────────────────────────────
test('AC: SPEC-N/T-089/AC-8 - sin solapes, determinista y los 21 nodos existen en kanto.json', () => {
  expect(Object.keys(realPlacements.nodes).length).toBe(21)
  expect(crossCheckPlacements(realPlacements, realBoard)).toEqual([])

  const solution = solvePlacements(realInput)
  const again = solvePlacements(realInput)
  expect(JSON.stringify(solution)).toBe(JSON.stringify(again)) // determinista

  const placed = solution.buildings.filter((b) => !b.discarded)
  expect(solution.buildings.length).toBe(21)
  // Ningún descartado con estos datos (si el tablero real no alcanzara, el
  // AC exige "falta de espacio demostrada" en el warning).
  expect(solution.buildings.filter((b) => b.discarded)).toEqual([])
  for (const building of placed) {
    expect(building.gaps.node).toBeGreaterThanOrEqual(0.25 - 1e-9)
    expect(building.gaps.edge).toBeGreaterThanOrEqual(0.2 - 1e-9)
    expect(building.gaps.building).toBeGreaterThanOrEqual(0.2 - 1e-9)
    expect(building.gaps.pedestal).toBeGreaterThanOrEqual(0.3 - 1e-9)
    expect(building.scale).toBeLessThanOrEqual(1 + 1e-9)
  }
  // Entre edificios: la distancia OBB–OBB se re-verifica de forma independiente.
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = obbCorners({ x: placed[i]!.x, z: placed[i]!.z }, placed[i]!.footprint, placed[i]!.yawDeg)
      const b = obbCorners({ x: placed[j]!.x, z: placed[j]!.z }, placed[j]!.footprint, placed[j]!.yawDeg)
      const distance = Math.min(
        ...a.flatMap((pa) => b.map((pb) => Math.hypot(pa.x - pb.x, pa.z - pb.z))),
      )
      expect(distance).toBeGreaterThan(0) // sin solapes (OBBs separadas)
    }
  }
  // AC-4 sobre el tablero real: cada dirección final dentro de su ventana.
  for (const building of placed) {
    const entry = realPlacements.nodes[building.nodeId]!
    if (entry.sideDeg === null) continue
    const windowDeg = entry.confidence === 'low' ? 90 : 45
    expect(Math.abs(normDeg(building.sideDeg - entry.sideDeg))).toBeLessThanOrEqual(windowDeg + 1e-6)
  }
})

test('SPEC-N/T-089 - solución real: sin descartes, escalas ≤ 1 y decors válidos', () => {
  const solution: PlacementSolution = solvePlacements(realInput)
  expect(solution.warnings).toEqual([])
  // AC-5: toda escala dentro de [scaleFloor, 1] y huella/altura ≤ máximo del kind.
  for (const building of solution.buildings) {
    expect(building.scale).toBeLessThanOrEqual(1 + 1e-9)
    expect(building.scale).toBeGreaterThanOrEqual(0.7 - 1e-9)
    expect(building.footprint).toBeLessThanOrEqual(realPlacements.footprints[building.kind] + 1e-9)
    expect(building.height).toBeLessThanOrEqual(realPlacements.heights[building.kind] + 1e-9)
  }
  // AC-6: cada decor (si existe) respeta los mismos minGaps contra su edificio.
  for (const building of solution.buildings) {
    if (building.decor === null || building.discarded) continue
    const corners = obbCorners({ x: building.x, z: building.z }, building.footprint, building.yawDeg)
    const gap = distPointToPolygon({ x: building.decor.x, z: building.decor.z }, corners) - building.decor.radius
    expect(gap).toBeGreaterThanOrEqual(0.2 - 1e-9)
  }
})

// ── T-090 ───────────────────────────────────────────────────────────────────
test('AC: SPEC-N/T-090/AC-1+AC-3 - deck-stacks sin extraStacks: pedestales = los 5 de terreno y edificios respetan 0,3', () => {
  // AC-1: el archivo ya no trae extraStacks; el schema default vacío lo tolera.
  expect(realStacks.extraStacks).toEqual({})
  expect(Object.keys(realStacks.stacks)).toHaveLength(5)
  // AC-3: los pedestales del solver son exactamente los 5 de terreno, con sus
  // posiciones originales (ninguna cambió al quitar Ítem/Sorpresa).
  expect(realPedestals.map((p) => p.key).sort()).toEqual(['bosque', 'isla', 'llanura', 'montana', 'pantano'])
  for (const pedestal of realPedestals) {
    const source = realStacks.stacks[pedestal.key]
    expect(source, `pedestal ${pedestal.key}`).toBeDefined()
    expect(pedestal.x).toBe(source!.x)
    expect(pedestal.y).toBe(source!.y)
  }
  // AC-3: ningún edificio se ubica sobre un pedestal (buildingToPedestal 0,3).
  const solution = solvePlacements(realInput)
  expect(solution.warnings).toEqual([])
  for (const building of solution.buildings) {
    expect(building.gaps.pedestal, `edificio ${building.nodeId}`).toBeGreaterThanOrEqual(0.3 - 1e-9)
  }
})
