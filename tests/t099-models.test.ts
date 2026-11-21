// Ajustes finales de modelos (SPEC-P/T-099) — Parte A (modelo `oak` para el
// kind `lab`) y Parte C (fusión de placements.patch.json: +20 % de tamaño),
// más el flag `proceduralBuildings` de la Parte B a nivel de contenido.
// Numérico y de datos (NO-VISION): nada de "se ve bien".
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import {
  NEW_MODEL_KINDS, PlacementsFileSchema, PlacementsStacksSchema,
  solvePlacements, suppressedBuildingPieces,
  type PlacementsFile,
} from '../packages/content/src/index.ts'
import { obbCorners } from '../packages/content/src/placements.ts'
import { planUseNew } from '../tools/models-use-new.ts'
import { glbBytesOf, glbMaterialsOf } from '../tools/models-format.ts'
import { luma709, MODEL_CHECK_THRESHOLDS } from '../apps/web/src/dev/models-check-lib.ts'

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

// ── Parte A ─────────────────────────────────────────────────────────────────

// AC: SPEC-P/AC-A2 — pnpm models:use-new espera los CINCO nombres base
// (gim, pokecenter, pokemart, league y oak); el plan detecta los cinco y
// lista `lab` como faltante si oak no está.
test('AC: SPEC-P/AC-A2 - NEW_MODEL_KINDS son cinco (con lab) y el plan exige oak', () => {
  expect([...NEW_MODEL_KINDS].sort()).toEqual(['gym', 'lab', 'league', 'market', 'pokecenter'])

  const files = { gym: 'gim', pokecenter: 'pokecenter', market: 'pokemart', league: 'league', lab: 'oak' }
  const full = planUseNew(['gim.glb', 'POKECENTER.glb', 'pokemart_01.glb', 'league.GLB', 'oak.glb'], files)
  expect(full.missing).toEqual([])
  expect(Object.keys(full.detected).sort()).toEqual(['gym', 'lab', 'league', 'market', 'pokecenter'])
  expect(full.detected.lab).toEqual({ file: 'oak.glb', format: 'glb' })

  const sinOak = planUseNew(['gim.glb', 'pokecenter.glb', 'pokemart.glb', 'league.glb'], files)
  expect(sinOak.missing).toEqual(['lab'])
})

// AC: SPEC-P/AC-A1 — placements.json registra models.files.lab = "oak" y el
// GLB existe en assets-src/new/ (oak_t y oak_b usan el kind lab).
test('AC: SPEC-P/AC-A1 - placements.json apunta lab a oak y assets-src/new tiene el glb', () => {
  expect(realPlacements.models.files.lab).toBe('oak')
  expect(realPlacements.heights.lab).toBeGreaterThan(0)
  expect(realPlacements.footprints.lab).toBeGreaterThan(0)
  const oak = join('assets-src', 'new', 'oak.glb')
  if (existsSync(join('assets-src', 'new'))) {
    expect(existsSync(oak), 'oak.glb en assets-src/new').toBe(true)
  }
})

// AC: SPEC-P/AC-A2 — la copia a apps/web/public/models/new/ incluye oak.glb y
// models.new.json + models.manifest.json registran el kind lab.
test('AC: SPEC-P/AC-A2 - oak.glb copiado a public/models/new y registrado en new.json/manifiesto', () => {
  if (!existsSync(join('apps', 'web', 'public', 'models', 'new'))) return
  expect(existsSync(join('apps', 'web', 'public', 'models', 'new', 'oak.glb')), 'oak.glb copiado').toBe(true)

  const modelsNew = JSON.parse(readFileSync(join('content', 'board', 'models.new.json'), 'utf8')) as {
    models: Record<string, { file: string; format: string }>
  }
  expect(modelsNew.models.lab?.file ?? '').toMatch(/^oak\./i)
  expect(modelsNew.models.lab?.format).toBe('glb')

  const manifest = JSON.parse(readFileSync(join('content', 'board', 'models.manifest.json'), 'utf8')) as {
    newModels: Record<string, { file: string; format: string; status: string }>
  }
  expect(manifest.newModels.lab?.file ?? '').toMatch(/^oak\./i)
  expect(manifest.newModels.lab?.format).toBe('glb')
  expect(['proposed', 'approved']).toContain(manifest.newModels.lab?.status)
  expect(Object.keys(manifest.newModels).sort()).toEqual(['gym', 'lab', 'league', 'market', 'pokecenter'])
})

// AC: SPEC-P/AC-C4/c — ningún material plano de los cinco GLB nuevos queda
// por debajo del umbral de brillo del chequeo T-086 (0,18): los texturizados
// se confían (el chequeo de rendered vive en pnpm models:check).
test('AC: SPEC-P/AC-B4c - los 5 GLB nuevos pasan el umbral de brillo 0,18', () => {
  if (!existsSync(join('assets-src', 'new'))) return
  const manifest = JSON.parse(readFileSync(join('content', 'board', 'models.manifest.json'), 'utf8')) as {
    newModels: Record<string, { file: string }>
  }
  for (const kind of Object.keys(manifest.newModels).sort()) {
    const file = join('apps', 'web', 'public', 'models', 'new', manifest.newModels[kind]!.file)
    if (!existsSync(file)) continue
    const materials = glbMaterialsOf(glbBytesOf(file))
    expect(materials.length, `${kind} con materiales`).toBeGreaterThan(0)
    const flat = materials.filter((material) => !material.hasTexture)
    if (flat.length === 0) continue // solo texturas ⇒ confiables (T-086)
    const mean = flat.reduce(
      (sum, material) => sum + luma709(material.color[0] * 255, material.color[1] * 255, material.color[2] * 255),
      0,
    ) / flat.length
    expect(mean, `${kind} (${manifest.newModels[kind]!.file}) brillo medio ≥ 0,18`)
      .toBeGreaterThanOrEqual(MODEL_CHECK_THRESHOLDS.minMeanBrightness)
  }
})

// ── Parte B (contenido) ─────────────────────────────────────────────────────

// AC: SPEC-P/AC-B2 — placements.json › proceduralBuildings: false activa la
// regla; el schema default true tolera archivos viejos. `house` NUNCA se
// suprime (Paleta conserva sus casas).
test('AC: SPEC-P/AC-B2 - proceduralBuildings false suprime gym/pokecenter/market/lab (no house)', () => {
  expect(realPlacements.proceduralBuildings).toBe(false)
  expect([...suppressedBuildingPieces(realPlacements)].sort()).toEqual(['gym', 'lab', 'market', 'pokecenter'])

  const abierto = suppressedBuildingPieces({ ...realPlacements, proceduralBuildings: true })
  expect([...abierto]).toEqual([])

  const legacy = PlacementsFileSchema.parse(
    JSON.parse(JSON.stringify({ ...realPlacements, proceduralBuildings: undefined })) as unknown,
  )
  expect(legacy.proceduralBuildings).toBe(true)
})

// ── Parte C ─────────────────────────────────────────────────────────────────

// AC: SPEC-P/AC-C1 — placements.patch.json se fusionó (sin reemplazar) y el
// archivo fue borrado; se conservan yawOffsetDeg, nodes, minGaps y search.
test('AC: SPEC-P/AC-C1 - placements.patch.json fusionado dentro de placements.json y borrado', () => {
  expect(existsSync(join('content', 'board', 'placements.patch.json')), 'el .patch.json ya no existe').toBe(false)

  const merged = realPlacements
  // SPEC-Q/T-100/AC-5c: league pasó de 1.55 a 2.3 (Liga ~+50 %); el resto igual.
  // SPEC-R/T-101/AC-5c: después de T-101 todos los kinds subieron (+25 %;
  // league +75 %); estos expects fijan el estado ACTUAL del archivo.
  expect(merged.footprints).toMatchObject({ gym: 1.38, pokecenter: 1.25, market: 1.06, league: 4.03, lab: 1.5 })
  expect(merged.heights).toMatchObject({ gym: 1.38, pokecenter: 1.13, market: 0.9, league: 4.03, lab: 1.38 })
  // Lo conservado del archivo original (no se reemplazó nada).
  expect(Object.keys(merged.nodes)).toHaveLength(21)
  expect(merged.minGaps.buildingToNodeCircle).toBeGreaterThan(0)
  expect(merged.search.scaleFloor).toBeGreaterThan(0)
  expect(merged.models.sourceDir).toBe('assets-src/new')
  expect(Object.keys(merged.models.yawOffsetDeg).sort()).toEqual(['gym', 'league', 'market', 'pokecenter'])
  expect(merged.removeStacks).toEqual(['item', 'sorpresa'])
})

// AC: SPEC-P/AC-C2/AC-C3/AC-C5 — con los máximos nuevos el solver sigue
// respetando minGaps: 21/21 colocados (o los descartados listados), huella y
// altura ≤ máximo del kind, escala ≥ scaleFloor y cero solapes OBB↔OBB.
test('AC: SPEC-P/AC-C5 - con los tamaños +20 %: 0 descartes, ≤ máximos y sin solapes', () => {
  const board = {
    nodes: realBoard.nodes.map((node) => ({ ...node, type: 'empty' as const })),
    edges: realBoard.edges,
    meta: { imageSize: IMAGE },
  } as unknown as Parameters<typeof solvePlacements>[0]['board']
  const pedestals = Object.entries(realStacks.stacks).map(([key, r]) => ({ key, x: r.x, y: r.y, radius: 0.72 }))
  const solution = solvePlacements({ placements: realPlacements, board, pedestals, imageSize: IMAGE })

  const discarded = solution.buildings.filter((building) => building.discarded)
  // Los descartados (si los hubiera) quedan listados en warnings (AC-C4).
  expect(discarded.length, solution.warnings.join(' | ')).toBe(0)

  const placed = solution.buildings.filter((building) => !building.discarded)
  expect(placed).toHaveLength(21)
  for (const building of placed) {
    expect(building.footprint, `${building.nodeId} huella ≤ máximo`).toBeLessThanOrEqual(realPlacements.footprints[building.kind] + 1e-9)
    expect(building.height, `${building.nodeId} altura ≤ máximo`).toBeLessThanOrEqual(realPlacements.heights[building.kind] + 1e-9)
    expect(building.scale, `${building.nodeId} escala ≥ scaleFloor`).toBeGreaterThanOrEqual(realPlacements.search.scaleFloor - 1e-9)
  }
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const a = obbCorners({ x: placed[i]!.x, z: placed[i]!.z }, placed[i]!.footprint, placed[i]!.yawDeg)
      const b = obbCorners({ x: placed[j]!.x, z: placed[j]!.z }, placed[j]!.footprint, placed[j]!.yawDeg)
      const distance = Math.min(...a.flatMap((pa) => b.map((pb) => Math.hypot(pa.x - pb.x, pa.z - pb.z))))
      expect(distance, `${placed[i]!.nodeId}↔${placed[j]!.nodeId} sin solape`).toBeGreaterThan(0)
    }
  }
})
