// AC: SPEC-K/T-070d/AC-7 — chequeos de repositorio: manifiesto válido, archivos
// presentes, presupuesto de MB, tope de triángulos y nada de assets privados
// en git (T-070e/AC-6). Se saltean los chequeos de archivos si no hay
// assets-src/ (clon limpio: el manifiesto igual valida su esquema).
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { STARTER_BY_DECK } from '@liga/engine'
import {
  crossCheckModels, DecorSchema, HgssWishlistSchema, ModelsCatalogSchema, ModelsManifestSchema,
} from '@liga/content'
import manifestJson from '../../../../../content/board/models.manifest.json'
import catalogJson from '../../../../../content/board/models.catalog.json'
import wishlistJson from '../../../../../content/board/models.hgss.wishlist.json'
import decorJson from '../../../../../content/board/decor.json'
import { hgssStarterModel } from './manifest'

const ROOT = fileURLToPath(new URL('../../../../..', import.meta.url))
const HAS_ASSETS = existsSync(join(ROOT, 'assets-src'))

test('AC: SPEC-K/T-070d/AC-7 el manifiesto, el catálogo y la wishlist validan', () => {
  const manifest = ModelsManifestSchema.parse(manifestJson)
  const catalog = ModelsCatalogSchema.parse(catalogJson)
  expect(HgssWishlistSchema.parse(wishlistJson).assets.length).toBeGreaterThan(0)
  const errors = crossCheckModels(manifest, catalog)
  expect(errors, errors.join('\n')).toEqual([])
})

test.skipIf(!HAS_ASSETS)('AC: SPEC-K/T-070d/AC-7 cada archivo del manifiesto existe en assets-src/', () => {
  const manifest = ModelsManifestSchema.parse(manifestJson)
  const missing: string[] = []
  for (const entry of Object.values(manifest.kinds)) {
    for (const candidate of entry.candidates) {
      if (!existsSync(join(ROOT, 'assets-src', candidate.file))) missing.push(candidate.file)
    }
  }
  for (const group of Object.values(manifest.hgss)) {
    for (const file of group.files) {
      if (!existsSync(join(ROOT, 'assets-src', file.entry))) missing.push(file.entry)
    }
  }
  expect(missing).toEqual([])
})

test.skipIf(!HAS_ASSETS)('AC: SPEC-K/T-070d/AC-7 ningún candidato utilizable supera 20 000 triángulos', () => {
  const manifest = ModelsManifestSchema.parse(manifestJson)
  const catalog = ModelsCatalogSchema.parse(catalogJson)
  const byFile = new Map(catalog.entries.map((entry) => [`${entry.pack}::${entry.file}`, entry]))
  const heavy: string[] = []
  for (const [kind, entry] of Object.entries(manifest.kinds)) {
    for (const candidate of entry.candidates) {
      if (candidate.status === 'rejected') continue
      const info = byFile.get(`${candidate.pack}::${candidate.file}`)
      if (info !== undefined && info.triangles > 20_000) heavy.push(`${kind}:${candidate.file}`)
    }
  }
  expect(heavy).toEqual([])
})

test('AC: fichas-modelo-3d-hgss/AC-2 el manifiesto trae 5 entradas hgss.starter (una por inicial)', () => {
  const manifest = ModelsManifestSchema.parse(manifestJson)
  const group = manifest.hgss.starter
  expect(group).toBeDefined()
  const files = group?.files ?? []
  expect(files).toHaveLength(5)
  for (const file of files) {
    // Cada entrada con forSpecies de a 1 especie y targetHeight ~0,7.
    expect(file.forSpecies).toHaveLength(1)
    expect(file.targetHeight).toBeGreaterThan(0.6)
    expect(file.targetHeight).toBeLessThan(0.8)
    expect(file.entry).toMatch(/^hgss\/[^/]+\/model\.obj$/)
  }
  // Las 5 especies cubren exactamente los iniciales por mazo (STARTER_BY_DECK).
  expect(new Set(files.flatMap((file) => file.forSpecies))).toEqual(new Set(Object.values(STARTER_BY_DECK)))
  // La wishlist declara los mismos 5 assets starter.
  const wishlist = HgssWishlistSchema.parse(wishlistJson)
  const wished = wishlist.assets.filter((asset) => asset.forKind === 'starter')
  expect(new Set(wished.flatMap((asset) => asset.forSpecies))).toEqual(new Set(Object.values(STARTER_BY_DECK)))
})

test.skipIf(!HAS_ASSETS)('AC: fichas-modelo-3d-hgss/AC-3 cada starter tiene .obj + .mtl + .png hermanos en assets-src', () => {
  const manifest = ModelsManifestSchema.parse(manifestJson)
  for (const file of manifest.hgss.starter?.files ?? []) {
    const dir = join(ROOT, 'assets-src', dirname(file.entry))
    expect(existsSync(dir), dir).toBe(true)
    const names = readdirSync(dir).map((name) => name.toLowerCase())
    expect(names.some((name) => name.endsWith('.obj')), file.entry).toBe(true)
    expect(names.some((name) => name.endsWith('.mtl')), file.entry).toBe(true)
    expect(names.some((name) => name.endsWith('.png')), file.entry).toBe(true)
  }
})

test('AC: fichas-modelo-3d-hgss/AC-4/AC-5 hgssStarterModel resuelve por especie (null si no hay)', () => {
  const charmander = hgssStarterModel('charmander')
  expect(charmander?.entry).toBe('hgss/Charmander/model.obj')
  expect(charmander?.forSpecies).toContain('charmander')
  // Especie sin modelo utilizable ⇒ null (causa a sprite → peón).
  expect(hgssStarterModel('pikachu')).toBeNull()
})

test('AC: SPEC-K/T-070d/AC-1 el peso de apps/web/public/models respeta maxModelsMB', () => {
  const decor = DecorSchema.parse(decorJson)
  const dir = join(ROOT, 'apps', 'web', 'public', 'models')
  let totalKB = 0
  const walk = (current: string): void => {
    if (!existsSync(current)) return
    for (const name of readdirSync(current)) {
      const full = join(current, name)
      if (statSync(full).isDirectory()) walk(full)
      else totalKB += statSync(full).size / 1024
    }
  }
  walk(dir)
  expect(totalKB).toBeLessThanOrEqual(decor.budgets.maxModelsMB * 1024)
})

test('AC: SPEC-K/T-070e/AC-6 git no trackea assets-src/ ni public/models/hgss/ ni public/models/new/', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n')
  const forbidden = files.filter(
    (file) =>
      file.startsWith('assets-src/') ||
      file.startsWith('apps/web/public/models/hgss/') ||
      file.startsWith('apps/web/public/models/new/'),
  )
  expect(forbidden).toEqual([])
})
