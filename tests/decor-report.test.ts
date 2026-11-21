// AC: SPEC-O/T-095/AC-6 - `pnpm decor:report` genera el SVG cenital (foto del
// tablero: caminos gris, edificios rojo, agua azul, verde árboles/arbustos,
// rocas marrón, flora en puntos, solapamientos rojo intenso) + el JSON con
// cantidad por categoría y pares solapados. Sobre el contenido REAL.
import { expect, test } from 'vitest'
import { buildDecorReportFiles } from '../tools/decor-report.ts'

const files = buildDecorReportFiles()
const report = JSON.parse(files.json) as {
  countsByCategory: Record<string, number>
  overlaps: readonly { a: string; b: string; categories: string }[]
  water: readonly { zone: string; radius: number }[]
  omittedWater: readonly string[]
  trimmed: readonly string[]
  hiddenLandmarks: readonly string[]
  totals: { objects: number; scatterSpots: number }
}

test('AC: SPEC-O/T-095/AC-6 - SVG cenital con capas por categoría y leyenda', () => {
  for (const layer of ['panels', 'edges', 'nodes', 'footprints', 'overlaps']) {
    expect(files.svg.includes(`id="${layer}"`), `capa ${layer}`).toBe(true)
  }
  expect(files.svg.includes('decor T-095')).toBe(true)
  expect(files.svg.includes('solapamientos: ')).toBe(true)
  expect(files.svg.startsWith('<svg')).toBe(true)
  expect(files.svg.trimEnd().endsWith('</svg>')).toBe(true)
})

test('AC: SPEC-O/T-095/AC-6 + AC-7 - JSON: cero solapamientos y conteos reales', () => {
  expect(report.overlaps).toEqual([])
  // deck4: 5 aristas nuevas de mazo ⇒ 61 caminos (antes 56).
  expect(report.countsByCategory.road).toBe(61)
  expect(report.countsByCategory.building).toBeGreaterThan(15)
  expect(report.countsByCategory.pedestal).toBe(5)
  expect(report.totals.scatterSpots).toBeGreaterThan(50)
  expect(report.trimmed).toEqual([])
  // Q-068 (resuelta): underRoads permite agua bajo aristas ⇒ el lago SÍ entra.
  expect(report.omittedWater).toEqual([])
  expect(report.water).toHaveLength(1)
  expect(report.water[0]?.zone).toBe('isla')
  expect(report.water[0]?.radius).toBeGreaterThanOrEqual(0.75 - 1e-6)
  // Edificio del solver pisó un árbol de landmark ⇒ oculto (menor prioridad).
  expect(report.hiddenLandmarks.length).toBeGreaterThan(0)
})

test('AC: SPEC-O/T-095/AC-6 - el resumen menciona agua y cero solapamientos', () => {
  expect(files.summary.includes('solapamientos: 0')).toBe(true)
  expect(files.summary.includes('isla')).toBe(true)
  expect(files.summary.includes('OMITIDA')).toBe(false)
})
