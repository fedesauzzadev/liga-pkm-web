// AC: SPEC-K/T-070b..d — esquemas del manifiesto/catálogo, elección
// determinista por seed y cruces manifiesto↔catálogo (pure, sin fs).
import { expect, test } from 'vitest'
import {
  MODEL_KINDS,
  MODEL_KIND_TO_DECOR,
  MODEL_TARGET_HEIGHTS,
  ModelsManifestSchema,
  crossCheckModels,
  pickModelVariant,
  usableCandidates,
  type ModelsCatalog,
} from './models.ts'

const catalog = (entries: Partial<ModelsCatalog['entries'][number]>[]): ModelsCatalog => ({
  packs: {},
  entries: entries.map((entry, index) => ({
    pack: 'p',
    file: `f${String(index)}.glb`,
    format: 'glb',
    sizeKB: 10,
    triangles: 100,
    bbox: { min: [0, 0, 0], max: [1, 1, 1] },
    dimensions: [1, 1, 1],
    flags: [],
    textures: [],
    missingTextures: [],
    ...entry,
  })),
})

const manifestOf = (raw: unknown): ReturnType<typeof ModelsManifestSchema.parse> =>
  ModelsManifestSchema.parse(raw)

test('AC: SPEC-K/T-070b/AC-1 los kinds del manifiesto validan contra MODEL_KINDS', () => {
  const ok = manifestOf({ kinds: { rock: { targetHeight: 0.3, candidates: [] } } })
  expect(Object.keys(ok.kinds)).toEqual(['rock'])
  expect(() => manifestOf({ kinds: { nave: { targetHeight: 1, candidates: [] } } })).toThrow()
})

test('AC: SPEC-K/T-070b/AC-2 cada candidato trae weight/targetHeight/rotY con defaults', () => {
  const manifest = manifestOf({
    kinds: {
      'tree.pine': {
        targetHeight: 1.1,
        candidates: [{ pack: 'kenney_nature-kit', file: 'Models/GLTF format/tree_pineRoundA.glb', targetHeight: 1.1 }],
      },
    },
  })
  const candidate = manifest.kinds['tree.pine']!.candidates[0]!
  expect(candidate.weight).toBe(1)
  expect(candidate.rotY).toBe(0)
  expect(candidate.status).toBe('proposed')
})

test('AC: SPEC-K/T-070e/AC-4 el manifiesto HGSS valida kinds, forNodes y opciones', () => {
  const manifest = manifestOf({
    kinds: {},
    hgss: {
      gym: {
        targetHeight: 1.2,
        files: [{ name: 'Viridian Gym', entry: 'hgss/Kanto Pokemon Gyms/Viridian Gym/viridian.obj', forNodes: ['verde'], targetHeight: 1.2 }],
      },
    },
  })
  expect(manifest.hgss.gym!.files[0]!.options.ignoreTextures).toBe(false)
  expect(() =>
    manifestOf({ kinds: {}, hgss: { arbol: { targetHeight: 1, files: [] } } }),
  ).toThrow()
})

test('AC: fichas-modelo-3d-hgss/AC-1 HGSS_KINDS admite starter y HgssFileSchema acepta forSpecies', () => {
  const manifest = manifestOf({
    kinds: {},
    hgss: {
      starter: {
        targetHeight: 0.7,
        files: [{ name: 'Charmander', entry: 'hgss/Charmander/model.obj', forSpecies: ['charmander'], targetHeight: 0.7 }],
      },
    },
  })
  expect(manifest.hgss.starter!.files[0]!.forSpecies).toEqual(['charmander'])
  // forSpecies es opcional con default [] (los kinds de decoración no lo usan).
  expect(manifestOf({ kinds: {}, hgss: { lamp: { targetHeight: 0.7, files: [{ name: 'L', entry: 'hgss/l.obj', targetHeight: 0.7 }] } } }).hgss.lamp!.files[0]!.forSpecies).toEqual([])
  // El catálogo de kinds HGSS sigue cerrado.
  expect(() => manifestOf({ kinds: {}, hgss: { nave: { targetHeight: 1, files: [] } } })).toThrow()
})

test('AC: SPEC-K/T-070d/AC-2 pickModelVariant es determinista y respeta pesos', () => {
  const candidates = [
    { weight: 3, id: 'a' },
    { weight: 1, id: 'b' },
  ]
  expect(pickModelVariant(candidates, 42).id).toBe(pickModelVariant(candidates, 42).id)
  // Con peso 3:1, el seed 0 cae en "a"; alguno de 20 seeds debe dar "b".
  const picks = new Set(Array.from({ length: 40 }, (_, seed) => pickModelVariant(candidates, seed).id))
  expect(picks.has('a')).toBe(true)
  expect(picks.has('b')).toBe(true)
  expect(() => pickModelVariant([], 1)).toThrow()
})

test('AC: SPEC-K/T-070d/AC-1 usableCandidates descarta rechazados y fallidos del chequeo', () => {
  const list = [
    { weight: 1, status: 'proposed' as const },
    { weight: 1, status: 'approved' as const },
    { weight: 1, status: 'rejected' as const },
    { weight: 1, status: 'failed' as const, failedFrom: 'approved' as const },
  ]
  expect(usableCandidates(list)).toHaveLength(2)
})

test('AC: T-086/AC-4 el manifiesto valida status failed con failedFrom y opciones por candidato', () => {
  const manifest = manifestOf({
    kinds: {
      rock: {
        targetHeight: 0.3,
        candidates: [
          { pack: 'p', file: 'ok.glb', targetHeight: 0.3, status: 'failed', failedFrom: 'approved' },
          { pack: 'p', file: 'kept.glb', targetHeight: 0.3, options: { ignoreTextures: true, keepOriginalMaterial: true } },
        ],
      },
    },
  })
  expect(manifest.kinds.rock!.candidates[0]!.status).toBe('failed')
  expect(manifest.kinds.rock!.candidates[0]!.failedFrom).toBe('approved')
  expect(manifest.kinds.rock!.candidates[1]!.options.keepOriginalMaterial).toBe(true)
  // failedFrom solo admite estados restaurables.
  expect(() =>
    manifestOf({ kinds: { rock: { targetHeight: 0.3, candidates: [{ pack: 'p', file: 'x.glb', targetHeight: 0.3, status: 'failed', failedFrom: 'rejected' }] } } }),
  ).toThrow()
})

test('AC: SPEC-K/T-070d/AC-7 el cruce rechaza candidatos fuera de catálogo o pesados', () => {
  const cat = catalog([
    { pack: 'p', file: 'ok.glb' },
    { pack: 'p', file: 'heavy.glb', triangles: 25_000, flags: ['heavy'] },
  ])
  const manifest = manifestOf({
    kinds: {
      rock: {
        targetHeight: 0.3,
        candidates: [
          { pack: 'p', file: 'ok.glb', targetHeight: 0.3 },
          { pack: 'p', file: 'heavy.glb', targetHeight: 0.3 },
          { pack: 'p', file: 'no-existe.glb', targetHeight: 0.3 },
        ],
      },
    },
  })
  const errors = crossCheckModels(manifest, cat)
  expect(errors.some((error) => error.includes('no-existe.glb'))).toBe(true)
  expect(errors.some((error) => error.includes('heavy.glb') && error.includes('20 000'))).toBe(true)
})

test('AC: SPEC-K/T-070e/AC-1 el cruce marca OBJ con texturas faltantes sin ignoreTextures', () => {
  const cat = catalog([
    { pack: 'hgss', file: 'hgss/lab/model.obj', format: 'obj', missingTextures: ['lab_lm.png'] },
  ])
  const base = {
    kinds: {},
    hgss: {
      lab: {
        targetHeight: 1.2,
        files: [{ name: 'Lab', entry: 'hgss/lab/model.obj', targetHeight: 1.2 }],
      },
    },
  }
  expect(crossCheckModels(manifestOf(base), cat)[0]).toContain('lab_lm.png')
  const withIgnore = manifestOf({
    ...base,
    hgss: {
      lab: {
        targetHeight: 1.2,
        files: [{ name: 'Lab', entry: 'hgss/lab/model.obj', targetHeight: 1.2, options: { ignoreTextures: true, keepOriginalMaterial: false } }],
      },
    },
  })
  expect(crossCheckModels(withIgnore, cat)).toHaveLength(0)
})

test('MODEL_KIND_TO_DECOR cubre kinds con pieza procedural y alturas > 0', () => {
  for (const kind of MODEL_KINDS) {
    expect(MODEL_TARGET_HEIGHTS[kind]).toBeGreaterThan(0)
  }
  expect(MODEL_KIND_TO_DECOR['tree.pine']).toEqual({ kind: 'tree', variant: 'pine' })
  expect(MODEL_KIND_TO_DECOR.mushroom).toEqual({ kind: 'bush' })
  expect(MODEL_KIND_TO_DECOR.tent).toBeUndefined()
})
