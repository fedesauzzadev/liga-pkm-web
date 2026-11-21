// Tests T-098 (SPEC-O/T-098): cierre visual final. Parte pura: los tres
// reportes de cierre existen como scripts (AC-1), el estado congelado del
// contenido y el tema pasan el checklist numérico (AC-2) y el aspecto queda
// congelado con nota explícita en el backlog (AC-3). Los comandos con
// navegador (`pnpm shots`) y `pnpm verify` se corren a mano y su resumen va
// al reporte tasks/reports/T-098.md.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import {
  crossCheckDecorCollision,
  crossCheckModelsNew,
  DecorCollisionSchema,
  DecorSchema,
  ModelsManifestSchema,
  ModelsNewFileSchema,
} from '../packages/content/src/index.ts'
import { buildDecorReportFiles } from '../tools/decor-report.ts'
import { BOARD3D } from '../apps/web/src/theme/board3d.ts'

const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(join(rel), 'utf8')) as unknown

// ── AC-1: los tres comandos de cierre ───────────────────────────────────────

// AC: SPEC-O/T-098/AC-1 — `pnpm shots`, `pnpm placements:report` y
// `pnpm decor:report` existen como scripts y apuntan a archivos presentes.
test('AC-1 - los tres scripts de reporte existen y apuntan a archivos reales', () => {
  const pkg = readJson('package.json') as { scripts: Record<string, string> }
  expect(pkg.scripts.shots).toBe('node e2e/t066-shots.mjs')
  expect(pkg.scripts['placements:report']).toBe('node tools/placements-report.ts')
  expect(pkg.scripts['decor:report']).toBe('node tools/decor-report.ts')
  for (const file of ['e2e/t066-shots.mjs', 'tools/placements-report.ts', 'tools/decor-report.ts']) {
    expect(existsSync(file), `falta ${file}`).toBe(true)
  }
})

// ── AC-2: checklist numérico sobre el contenido REAL ───────────────────────

// AC: SPEC-O/T-098/AC-2 — modelos nuevos activos: los kinds están en
// models.new.json, cruzan limpio contra el manifiesto y los archivos GLB
// existen en apps/web/public/models/new/. SPEC-P/T-099: son 5 (lab/oak).
test('AC-2 - modelos nuevos activos (5 kinds + archivos GLB presentes)', () => {
  const parsed = ModelsNewFileSchema.parse(readJson('content/board/models.new.json'))
  expect(Object.keys(parsed.models).sort()).toEqual(['gym', 'lab', 'league', 'market', 'pokecenter'])
  const manifest = ModelsManifestSchema.parse(readJson('content/board/models.manifest.json'))
  expect(crossCheckModelsNew(parsed, manifest)).toEqual([])
  for (const [kind, entry] of Object.entries(parsed.models)) {
    const path = join('apps/web/public/models/new', entry.file)
    expect(existsSync(path), `${kind}: falta ${path} (corré pnpm models:use-new)`).toBe(true)
  }
})

// AC: SPEC-O/T-098/AC-2 — cero solapamientos y categorías cerradas
// (sin objetos celestes sin categoría ni fuera de rango de color).
test('AC-2 - cero solapamientos y decor.collision cruzado limpio', () => {
  const files = buildDecorReportFiles()
  const report = JSON.parse(files.json) as {
    overlaps: readonly unknown[]
    omittedWater: readonly string[]
  }
  expect(report.overlaps).toEqual([])
  expect(report.omittedWater).toEqual([])
  expect(files.summary).toContain('solapamientos: 0')
  const collision = DecorCollisionSchema.parse(readJson('content/board/decor.collision.json'))
  const decor = DecorSchema.parse(readJson('content/board/decor.json'))
  expect(crossCheckDecorCollision(collision, decor)).toEqual([])
})

// AC: SPEC-O/T-098/AC-2 — sin manchas translúcidas: opacidades del tema
// ≤ 0,10 (mist), con tamaño contenido. N-0011: el agua de las zonas es una
// superficie OPACA recortada a la zona (sin clave de opacidad), no una mancha.
test('AC-2 - sin manchas translúcidas (mist y agua dentro del tope)', () => {
  for (const rule of Object.values(BOARD3D.world.zones.rules)) expect(rule).not.toHaveProperty('water.opacity')
  expect(BOARD3D.decor.mist.opacity).toBeLessThanOrEqual(0.1)
  expect(BOARD3D.decor.mist.radius).toBeLessThanOrEqual(1.2)
})

// AC: SPEC-O/T-098/AC-2 — etiquetas visibles: anclaje, dibujo encima de todo
// y renderOrder alto congelados en el tema.
test('AC-2 - etiquetas visibles (lift, depthTest y renderOrder congelados)', () => {
  expect(BOARD3D.label.lift).toBe(0.5)
  expect(BOARD3D.label.depthTest).toBe(false)
  expect(BOARD3D.label.renderOrder).toBeGreaterThanOrEqual(1000)
})

// AC: SPEC-O/T-098/AC-2 — cámara y vista sin cambios: los valores congelados
// de content/ui/camera.json (SPEC-M/T-085 + SPEC-J/T-077).
test('AC-2 - cámara y vista sin cambios (valores congelados)', () => {
  const camera = readJson('content/ui/camera.json') as {
    pitchClampDeg: number
    afterTurn: string
    explore: { elevationDeg: number }
    overview: { elevationDeg: number }
    follow: { elevationDeg: number }
    fork: { elevationDeg: number }
  }
  expect(camera.pitchClampDeg).toBe(70)
  expect(camera.explore.elevationDeg).toBe(38)
  expect(camera.overview.elevationDeg).toBe(50)
  expect(camera.follow.elevationDeg).toBe(28)
  expect(camera.fork.elevationDeg).toBe(38)
  expect(camera.afterTurn).toBe('explore')
})

// ── AC-3: congelado del aspecto ─────────────────────────────────────────────

// AC: SPEC-O/T-098/AC-3 — el backlog declara el congelado: cualquier cambio
// visual posterior va como tarea nueva.
test('AC-3 - el backlog congela el aspecto (cambio visual = tarea nueva)', () => {
  const backlog = readFileSync(join('tasks', 'BACKLOG.md'), 'utf8')
  expect(backlog).toContain('Aspecto congelado (SPEC-O/T-098/AC-3)')
  expect(backlog).toMatch(/tarea nueva/)
})
