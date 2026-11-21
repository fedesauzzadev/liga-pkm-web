// AC: SPEC-N/T-091/AC-1 — el manifiesto registra los modelos nuevos con
// status usable y el middleware dev de /dev/models sirve el prefijo new/ con
// glb/gltf/obj/fbx, sin traversal ni extensiones ajenas.
// AC: SPEC-N/T-091/AC-6 — los GLB reales de assets-src/new escalan dentro de
// heights/footprints de placements.json y ningún material queda negro puro.
// SPEC-P/T-099/AC-A2: son 5 (gym, league, market, pokecenter + lab/oak).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { PlacementsFileSchema, type PlacementsKind } from '../packages/content/src/placements.ts'
import { NEW_MODEL_EXTENSIONS, glbBytesOf, glbMaterialsOf, glbStatsOf } from '../tools/models-format.ts'
import { modelsAssetPath } from '../apps/web/src/dev/models-server.ts'

const placements = PlacementsFileSchema.parse(
  JSON.parse(readFileSync(join('content', 'board', 'placements.json'), 'utf8')) as unknown,
)
const manifest = JSON.parse(readFileSync(join('content', 'board', 'models.manifest.json'), 'utf8')) as {
  newModels: Record<string, { file: string; format: string; status: string }>
}
const NEW_KINDS = ['gym', 'lab', 'league', 'market', 'pokecenter'] as const

test('AC: SPEC-N/T-091/AC-1 - el manifiesto registra los modelos nuevos usables', () => {
  expect(Object.keys(manifest.newModels).sort()).toEqual([...NEW_KINDS])
  for (const kind of NEW_KINDS) {
    const entry = manifest.newModels[kind]
    expect(entry, `entrada de ${kind}`).toBeDefined()
    expect(['proposed', 'approved'], `${kind} status usable`).toContain(entry!.status)
    expect(entry!.format).toBe('glb')
    expect(NEW_MODEL_EXTENSIONS).toContain(entry!.format)
    expect(entry!.file.endsWith('.glb')).toBe(true)
  }
})

test('AC: SPEC-N/T-091/AC-1 - modelsAssetPath sirve new/ (glb/gltf/obj/fbx) y bloquea traversal', () => {
  const src = 'assets-src'
  expect(modelsAssetPath(src, 'new/gim.glb')).toBe(join(src, 'new', 'gim.glb'))
  expect(modelsAssetPath(src, 'new/model.gltf')).toBe(join(src, 'new', 'model.gltf'))
  expect(modelsAssetPath(src, 'new/model.fbx')).toBe(join(src, 'new', 'model.fbx'))
  expect(modelsAssetPath(src, 'new/model.obj')).toBe(join(src, 'new', 'model.obj'))
  expect(modelsAssetPath(src, '/new/gim.glb')).toBe(join(src, 'new', 'gim.glb'))
  // Prefijos ajenos, traversal y extensiones fuera del whitelist de CONTENT_TYPES.
  expect(modelsAssetPath(src, 'sprites/pikachu.png')).toBeNull()
  expect(modelsAssetPath(src, 'new/../../secreto.glb')).toBeNull()
  expect(modelsAssetPath(src, 'new/./gim.glb')).toBeNull()
  expect(modelsAssetPath(src, 'new/gim.exe')).toBeNull()
})

const anyNewGlb = existsSync(join('assets-src', 'new', manifest.newModels.gym?.file ?? 'gim.glb'))

test.skipIf(!anyNewGlb)(
  'AC: SPEC-N/T-091/AC-6 - los GLB reales quedan dentro de heights/footprints y sin materiales negros',
  () => {
    let checked = 0
    for (const [kind, entry] of Object.entries(manifest.newModels)) {
      const file = join('assets-src', 'new', entry.file)
      if (!existsSync(file)) continue
      checked += 1
      const stats = glbStatsOf(glbBytesOf(file))
      expect(stats.triangles, `${kind} con triángulos`).toBeGreaterThan(0)
      const height = stats.bboxMax[1] - stats.bboxMin[1]
      const footprint = Math.max(
        stats.bboxMax[0] - stats.bboxMin[0],
        stats.bboxMax[2] - stats.bboxMin[2],
      )
      expect(height, `${kind} con alto`).toBeGreaterThan(1e-4)
      expect(footprint, `${kind} con huella`).toBeGreaterThan(1e-4)
      const targetHeight = placements.heights[kind as PlacementsKind] ?? 1
      const maxFootprint = placements.footprints[kind as PlacementsKind] ?? 1
      // El escalado final = min(altura, huella) y los GLB nuevos vienen casi a
      // medida (escala razonable), sin quedar gigantes ni microscópicos.
      const scale = Math.min(targetHeight / height, maxFootprint / footprint)
      expect(scale, `${kind} escala razonable`).toBeGreaterThan(0.05)
      // SPEC-Q/T-100 (Q-072): la Liga a 2.3 exige escala ~2,29 (> 2,1 del tope
      // "casi a medida" de T-091); se sube el tope en vez de achicar la Liga.
      // SPEC-R/T-101 (Q-073): la Liga a 4,03 exige ~4,01; mismo criterio.
      expect(scale, `${kind} modelo casi a medida`).toBeLessThan(4.1)
      expect(scale * height, `${kind} alto final`).toBeLessThanOrEqual(targetHeight + 1e-9)
      expect(scale * footprint, `${kind} huella final`).toBeLessThanOrEqual(maxFootprint + 1e-9)
      const materials = glbMaterialsOf(glbBytesOf(file))
      expect(materials.length, `${kind} con materiales`).toBeGreaterThan(0)
      for (const material of materials) {
        const black = !material.hasTexture && material.color.every((channel) => channel < 0.05)
        expect(black, `${kind}/${material.name} sin negro puro`).toBe(false)
      }
    }
    expect(checked).toBeGreaterThan(0)
  },
)
