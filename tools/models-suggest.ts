// models:suggest (SPEC-K/T-070b + T-070e): clasifica el catálogo SOLO por
// palabras del nombre + allowlist por pack (AC-4) y mapea los OBJ HGSS según
// models.hgss.wishlist.json (AC-4 de T-070e). Escribe
// content/board/models.manifest.json con status:"proposed". Nunca elige por
// gusto (AC-3): lo que no entra va a `unclassified`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  HGSS_KINDS, MODEL_KINDS, MODEL_TARGET_HEIGHTS, ModelsCatalogSchema, ModelsManifestSchema,
  HgssWishlistSchema, type ModelKind, type ModelsCatalog,
} from '../packages/content/src/models.ts'
import { foldName } from './models-format.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CATALOG = join(ROOT, 'content', 'board', 'models.catalog.json')
const WISHLIST = join(ROOT, 'content', 'board', 'models.hgss.wishlist.json')
const OUT = join(ROOT, 'content', 'board', 'models.manifest.json')

/** AC-4: kinds sugeridos por pack (reglas por defecto de la spec). */
const PACK_KINDS: readonly { readonly match: RegExp; readonly kinds: readonly ModelKind[] }[] = [
  { match: /city-kit-suburban/, kinds: ['house', 'fence', 'lamp'] },
  { match: /nature-kit|mini-forest/, kinds: ['tree.pine', 'tree.round', 'tree.dead', 'rock', 'bush', 'mushroom', 'flower', 'log', 'bridge'] },
  { match: /survival-kit/, kinds: ['tent', 'campfire', 'crate', 'barrel', 'sign'] },
]

/** AC-1: kind por palabras del nombre base (sin extensión, plegado). */
export function classifyByName(name: string): ModelKind | null {
  const n = foldName(name)
  const has = (word: string): boolean => n.includes(word)
  if (has('pine') || has('cone')) return has('tree') ? 'tree.pine' : null
  if (has('palm')) return null
  if (has('mushroom')) return 'mushroom'
  if (has('flower') || has('lily')) return 'flower'
  if (has('bush') || has('shrub') || has('hedge')) return 'bush'
  if (has('tree')) {
    if (has('dead')) return 'tree.dead'
    if (has('log') || has('stump') || has('trunk')) return 'log'
    return 'tree.round'
  }
  if (has('log') || has('stump')) return 'log'
  if (n.startsWith('rock') || n.startsWith('stone') || n.startsWith('rocks')) return 'rock'
  if (n.startsWith('grass') || n.startsWith('patch grass') || has('tuft')) return 'grass'
  if (n.startsWith('fence')) return 'fence'
  if (n.startsWith('building type') || has('house')) return 'house'
  if (has('lamp') || has('lantern') || has('streetlight')) return 'lamp'
  if (has('sign')) return 'sign'
  if (has('tent')) return 'tent'
  if (has('campfire') || has('fire')) return 'campfire'
  if (has('barrel')) return 'barrel'
  if (has('crate') || n.startsWith('box')) return 'crate'
  if (has('bridge')) return 'bridge'
  return null
}

/** Gimnasios HGSS: subcarpeta "X Gym" → nodo de ciudad (T-070e/AC-4). */
export const HGSS_GYM_CITY_NODES: Readonly<Record<string, string>> = {
  viridian: 'verde',
  pewter: 'plateada',
  cerulean: 'celeste',
  vermilion: 'carmin',
  saffron: 'azafran',
  celadon: 'azulona',
  fuchsia: 'fucsia',
}

const HGSS_DEFAULT_HEIGHTS: Readonly<Record<(typeof HGSS_KINDS)[number], number>> = {
  house: 0.8, pokecenter: 1.0, market: 0.9, lab: 1.2, gym: 1.2, lamp: 0.7, starter: 0.7,
}

interface SuggestResult {
  readonly kinds: Record<string, { targetHeight: number; candidates: { pack: string; file: string; weight: number; targetHeight: number; rotY: number; status: 'proposed' }[] }>
  readonly hgss: Record<string, { targetHeight: number; files: { name: string; entry: string; forNodes: string[]; forSpecies: string[]; targetHeight: number; status: 'proposed'; options?: { ignoreTextures: boolean; keepOriginalMaterial: boolean } }[] }>
  readonly unclassified: { pack: string; file: string }[]
}

/** Clasificación pura del catálogo (testeable); sin IO. */
export function suggestFrom(catalog: ModelsCatalog, wishlistNameToAsset: ReadonlyMap<string, { forKind: string; forNodes: string[]; forSpecies: string[]; targetHeight?: number }>): SuggestResult {
  const result: SuggestResult = { kinds: {}, hgss: {}, unclassified: [] }

  for (const entry of catalog.entries) {
    if (entry.format === 'glb') {
      const allow = PACK_KINDS.find((rule) => rule.match.test(entry.pack))?.kinds ?? []
      const basename = entry.file.split('/').pop() ?? entry.file
      const kind = classifyByName(basename)
      if (kind === null || !allow.includes(kind) || entry.flags.includes('heavy')) {
        result.unclassified.push({ pack: entry.pack, file: entry.file })
        continue
      }
      const bucket = (result.kinds[kind] ??= { targetHeight: MODEL_TARGET_HEIGHTS[kind], candidates: [] })
      bucket.candidates.push({
        pack: entry.pack,
        file: entry.file,
        weight: 1,
        targetHeight: MODEL_TARGET_HEIGHTS[kind],
        rotY: 0,
        status: 'proposed',
      })
    } else {
      const parts = entry.file.split('/').slice(1)
      if (parts.length < 2) {
        result.unclassified.push({ pack: 'hgss', file: entry.file })
        continue
      }
      // Kanto Gyms: una subcarpeta por ciudad.
      if (foldName(parts[0]!).startsWith('kanto pokemon gyms')) {
        const city = foldName(parts[1]!).replace(' gym', '').trim()
        const node = HGSS_GYM_CITY_NODES[city]
        if (node === undefined) {
          result.unclassified.push({ pack: 'hgss', file: entry.file })
          continue
        }
        const group = (result.hgss.gym ??= { targetHeight: 1.2, files: [] })
        group.files.push({ name: parts[1]!, entry: entry.file, forNodes: [node], forSpecies: [], targetHeight: 1.2, status: 'proposed' })
        continue
      }
      // Resto: match por prefijo del nombre contra la wishlist plegada.
      const pathFold = foldName(parts.join(' '))
      const asset = [...wishlistNameToAsset.entries()].find(([name]) => pathFold.startsWith(name))
        ?? [...wishlistNameToAsset.entries()].find(([name]) => name.startsWith(pathFold.slice(0, 12)))
      if (asset === undefined || !HGSS_KINDS.includes(asset[1].forKind as (typeof HGSS_KINDS)[number])) {
        result.unclassified.push({ pack: 'hgss', file: entry.file })
        continue
      }
      const kind = asset[1].forKind as (typeof HGSS_KINDS)[number]
      const height = asset[1].targetHeight ?? HGSS_DEFAULT_HEIGHTS[kind]
      const group = (result.hgss[kind] ??= { targetHeight: height, files: [] })
      // Texturas faltantes (suelen ser lightmaps sueltos, p. ej. lambert1.png):
      // se entra con ignoreTextures y el dueño decide en la galería (T-070e/AC-2).
      group.files.push({
        name: parts[parts.length - 2] ?? parts[0]!,
        entry: entry.file,
        forNodes: asset[1].forNodes,
        forSpecies: asset[1].forSpecies,
        targetHeight: height,
        status: 'proposed',
        ...(entry.missingTextures.length > 0 ? { options: { ignoreTextures: true, keepOriginalMaterial: false } } : {}),
      })
    }
  }

  for (const kind of MODEL_KINDS) {
    const bucket = result.kinds[kind]
    if (bucket !== undefined) bucket.candidates.sort((a, b) => a.file.localeCompare(b.file))
  }
  result.unclassified.sort((a, b) => a.file.localeCompare(b.file))
  return result
}

if (!existsSync(CATALOG)) {
  console.error('models:suggest FALLA — falta content/board/models.catalog.json (corré pnpm models:scan)')
  process.exit(1)
}
const catalog = ModelsCatalogSchema.parse(JSON.parse(readFileSync(CATALOG, 'utf8')) as unknown)
const wishlist = existsSync(WISHLIST)
  ? HgssWishlistSchema.parse(JSON.parse(readFileSync(WISHLIST, 'utf8')) as unknown)
  : { assets: [] }
const wishlistMap = new Map(wishlist.assets.map((asset) => [foldName(asset.name), {
  forKind: asset.forKind,
  forNodes: asset.forNodes,
  forSpecies: asset.forSpecies,
  ...(asset.targetHeight === undefined ? {} : { targetHeight: asset.targetHeight }),
}]))

const suggested = suggestFrom(catalog, wishlistMap)
// T-091/AC-1: los modelos nuevos (`newModels`) los escribe `pnpm models:new`;
// este tool reescribe el resto del manifiesto sin tocarlos.
const previous = existsSync(OUT)
  ? ModelsManifestSchema.parse(JSON.parse(readFileSync(OUT, 'utf8')) as unknown)
  : null
const manifest = ModelsManifestSchema.parse({
  _status: 'Generado por `pnpm models:suggest` (SPEC-K/T-070b); revisalo en /dev/models y exportá. status: proposed|approved|rejected.',
  kinds: suggested.kinds,
  hgss: suggested.hgss,
  newModels: previous?.newModels ?? {},
  unclassified: suggested.unclassified,
})
writeFileSync(OUT, `${JSON.stringify(manifest, null, 1)}\n`, 'utf8')

const kindSummary = Object.entries(manifest.kinds).map(([kind, entry]) => `${kind}:${String(entry.candidates.length)}`)
console.log(`models:suggest — kinds: ${kindSummary.join(' ') || '(ninguno)'}`)
const hgssSummary = Object.entries(manifest.hgss).map(([kind, group]) => `${kind}:${String(group.files.length)}`)
console.log(`  hgss: ${hgssSummary.join(' ') || '(ninguno)'}`)
console.log(`  sin clasificar: ${String(manifest.unclassified.length)} archivo(s)`)
console.log('OK → content/board/models.manifest.json')
