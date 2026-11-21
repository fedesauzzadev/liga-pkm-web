// AC: SPEC-O/T-094/AC-1 — `pnpm models:use-new` detecta los modelos nuevos
// (mayúsculas indiferentes, sufijos _01, extensiones admitidas), lista las no
// soportadas con la lista de las válidas, falla si falta alguno y escribe
// content/board/models.new.json consistente con el manifiesto (cross-check).
// SPEC-P/T-099/AC-A2: son CINCO (gim, pokecenter, pokemart, league y oak).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import {
  crossCheckModelsNew, ModelsManifestSchema, ModelsNewFileSchema, PlacementsFileSchema,
} from '../packages/content/src/index.ts'
import {
  modelsNewFileOf, planUseNew, SUPPORTED_NEW_MODEL_FORMATS, trianglesOfModel,
} from '../tools/models-use-new.ts'

const placements = PlacementsFileSchema.parse(
  JSON.parse(readFileSync(join('content', 'board', 'placements.json'), 'utf8')) as unknown,
)

test('AC: SPEC-O/T-094/AC-1 - planUseNew halla los 5 (mayúsculas/sufijos), marca FALTA y lista no soportadas', () => {
  const files = placements.models.files
  const full = planUseNew(['gim.glb', 'POKECENTER.glb', 'pokemart_01.glb', 'league.GLB', 'oak.glb'], files)
  expect(Object.keys(full.detected).sort()).toEqual(['gym', 'lab', 'league', 'market', 'pokecenter'])
  expect(full.detected.market?.file).toBe('pokemart_01.glb')
  expect(full.detected.pokecenter?.format).toBe('glb')
  expect(full.detected.lab?.file).toBe('oak.glb')
  expect(full.missing).toEqual([])
  expect(full.unsupported).toEqual([])

  const missing = planUseNew(['gim.glb', 'pokecenter.glb'], files)
  expect(missing.missing).toEqual(['lab', 'league', 'market'])

  const bad = planUseNew(['gim.3ds', 'pokecenter.glb', 'pokemart.obj', 'league.glb', 'oak.glb'], files)
  // gim.3ds no es admitido ⇒ gym queda FALTA (y error al correr el tool).
  expect(bad.missing).toEqual(['gym'])
  expect(bad.unsupported).toEqual([{ kind: 'gym', file: 'gim.3ds', ext: '3ds' }])
  expect(SUPPORTED_NEW_MODEL_FORMATS).toContain('.glb')
  expect(SUPPORTED_NEW_MODEL_FORMATS).toContain('.fbx')
})

test('AC: SPEC-O/T-094/AC-1 - modelsNewFileOf arma kind → archivo/yawOffsetDeg/estado', () => {
  const file = modelsNewFileOf(
    { gym: { file: 'gim.glb', format: 'glb' } },
    { gym: 15, pokecenter: 0 },
    { gym: 'approved' },
  )
  expect(Object.keys(file.models)).toEqual(['gym'])
  expect(file.models.gym).toEqual({ file: 'gim.glb', format: 'glb', yawOffsetDeg: 15, status: 'approved' })
})

test('AC: SPEC-O/T-094/AC-1 - crossCheckModelsNew detecta divergencia con el manifiesto', () => {
  const manifest = ModelsManifestSchema.parse({
    newModels: { gym: { file: 'gim.glb', format: 'glb', status: 'proposed' } },
  })
  const ok = modelsNewFileOf({ gym: { file: 'gim.glb', format: 'glb' } }, { gym: 0 }, {})
  expect(crossCheckModelsNew(ModelsNewFileSchema.parse(ok), manifest)).toEqual([])
  const divergente = modelsNewFileOf({ gym: { file: 'gim_v2.glb', format: 'glb' } }, { gym: 0 }, {})
  const errors = crossCheckModelsNew(ModelsNewFileSchema.parse(divergente), manifest)
  expect(errors.length).toBe(1)
  expect(errors[0]).toContain('pnpm models:use-new')
  const huerfano = modelsNewFileOf({ league: { file: 'league.glb', format: 'glb' } }, { league: 0 }, {})
  expect(crossCheckModelsNew(ModelsNewFileSchema.parse(huerfano), manifest)[0]).toContain('league')
})

test('AC: SPEC-O/T-094/AC-1 - el models.new.json del repo valida y cruza limpio contra el manifiesto', () => {
  const path = join('content', 'board', 'models.new.json')
  if (!existsSync(path)) {
    throw new Error('falta content/board/models.new.json: corré `pnpm models:use-new`')
  }
  const parsed = ModelsNewFileSchema.parse(JSON.parse(readFileSync(path, 'utf8')) as unknown)
  expect(Object.keys(parsed.models).sort()).toEqual(['gym', 'lab', 'league', 'market', 'pokecenter'])
  const manifest = ModelsManifestSchema.parse(
    JSON.parse(readFileSync(join('content', 'board', 'models.manifest.json'), 'utf8')) as unknown,
  )
  expect(crossCheckModelsNew(parsed, manifest)).toEqual([])
  for (const [kind, entry] of Object.entries(parsed.models)) {
    expect(entry.yawOffsetDeg).toBe(
      placements.models.yawOffsetDeg[kind as keyof typeof placements.models.yawOffsetDeg] ?? 0,
    )
  }
})

const anyNewGlb = existsSync(join('assets-src', 'new'))

test.skipIf(!anyNewGlb)(
  'AC: SPEC-O/T-094/AC-1 - trianglesOfModel lee los triángulos de los GLB reales',
  () => {
    const triangles = trianglesOfModel(join('assets-src', 'new', 'gim.glb'))
    expect(triangles).not.toBeNull()
    expect(triangles!).toBeGreaterThan(1000)
  },
)
