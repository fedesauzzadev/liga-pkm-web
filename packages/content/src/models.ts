// Modelos 3D externos (SPEC-K/T-070): catálogo y manifiesto de modelos Kenney
// (CC0) + HeartGold/SoulSilver (privado, gitignored). Esquemas Zod puros +
// elección determinista de variante; los chequeos cruzados los consume
// validate.ts y los tests. Las rutas `file`/`entry` son relativas a
// assets-src/ (kenney/… y hgss/…); nunca se commitean los binarios de hgss.
import { z } from 'zod'
import type { DecorKind } from './decor.ts'

/** Catálogo de kinds de modelos (SPEC-K/T-070b/AC-1). */
export const MODEL_KINDS = [
  'tree.pine', 'tree.round', 'tree.dead', 'rock', 'bush', 'mushroom',
  'flower', 'grass', 'log', 'fence', 'house', 'lamp', 'sign', 'tent',
  'campfire', 'crate', 'barrel', 'bridge', 'other',
] as const
export type ModelKind = (typeof MODEL_KINDS)[number]

export const ModelKindSchema = z.enum(MODEL_KINDS, {
  error: (issue) => `kind de modelo desconocido: "${String(issue.input)}" (catálogo MODEL_KINDS, SPEC-K/T-070b)`,
})

/**
 * Altura objetivo por kind (SPEC-K/T-070b/AC-2): árbol 1,1; roca 0,3; arbusto
 * 0,35; hongo/flor 0,2; cerca 0,35; casa 0,8; farol 0,7; carpa 0,6; caja y
 * barril 0,25. Los que la spec no fija usan el default documentado acá.
 */
export const MODEL_TARGET_HEIGHTS: Readonly<Record<ModelKind, number>> = {
  'tree.pine': 1.1,
  'tree.round': 1.1,
  'tree.dead': 1.1,
  rock: 0.3,
  bush: 0.35,
  mushroom: 0.2,
  flower: 0.2,
  grass: 0.3,
  log: 0.25,
  fence: 0.35,
  house: 0.8,
  lamp: 0.7,
  sign: 0.6,
  tent: 0.6,
  campfire: 0.3,
  crate: 0.25,
  barrel: 0.25,
  bridge: 0.4,
  other: 0.5,
}

/** Mapeo kind de modelo → pieza procedural que reemplaza (null ⇒ aún sin uso). */
export const MODEL_KIND_TO_DECOR: Readonly<
  Record<ModelKind, { readonly kind: DecorKind; readonly variant?: 'pine' | 'round' } | undefined>
> = {
  'tree.pine': { kind: 'tree', variant: 'pine' },
  'tree.round': { kind: 'tree', variant: 'round' },
  'tree.dead': { kind: 'deadTree' },
  rock: { kind: 'rock' },
  bush: { kind: 'bush' },
  // Hongo rellena como arbusto (sin kind propio en DECOR_KINDS).
  mushroom: { kind: 'bush' },
  flower: { kind: 'flowerPatch' },
  grass: { kind: 'grassTuft' },
  fence: { kind: 'fence' },
  house: { kind: 'house' },
  lamp: { kind: 'lamp' },
  sign: { kind: 'sign' },
  // log/tent/campfire/crate/barrel/bridge/other: sin pieza procedural hoy
  // (T-081 los usa como props); la galería y el import los preparan igual.
  log: undefined,
  tent: undefined,
  campfire: undefined,
  crate: undefined,
  barrel: undefined,
  bridge: undefined,
  other: undefined,
}

/** Kinds de decoración que pueden venir de HGSS (edificios Pokémon + faroles)
 *  + `starter`: modelos 3D de los iniciales para las fichas del tablero. */
export const HGSS_KINDS = ['house', 'pokecenter', 'market', 'lab', 'gym', 'lamp', 'starter'] as const
export type HgssKind = (typeof HGSS_KINDS)[number]

export const HgssKindSchema = z.enum(HGSS_KINDS, {
  error: (issue) => `kind HGSS inválido: "${String(issue.input)}" (HGSS_KINDS, SPEC-K/T-070e/AC-4)`,
})

/** Estado de revisión del dueño en la galería /dev/models (T-070c/AC-1).
 *  `failed` lo escribe `pnpm models:check` (T-086/AC-4) cuando el modelo no
 *  pasa el chequeo de brillo: el juego lo salta y usa la pieza procedural. */
export const ModelStatusSchema = z.enum(['proposed', 'approved', 'rejected', 'failed'])
export type ModelStatus = z.infer<typeof ModelStatusSchema>

/** Estado previo de un `failed` (para restaurarlo si vuelve a pasar el chequeo). */
export const FailedFromSchema = z.enum(['approved', 'proposed'])
export type FailedFrom = z.infer<typeof FailedFromSchema>

/** Opciones por modelo (SPEC-K/T-070e/AC-2/AC-3 + T-086/AC-3): válidas tanto
 *  para los candidatos Kenney como para los archivos HGSS del manifiesto. */
export const ModelOptionsSchema = z.object({
  /** Descarta mapas de sombra/luz (*_lm*.png, *kage*) si ensucian. */
  ignoreTextures: z.boolean().default(false),
  /** Conserva el material original si el toon lo desfavorece. */
  keepOriginalMaterial: z.boolean().default(false),
})
export type ModelOptions = z.infer<typeof ModelOptionsSchema>

/** Opciones por modelo HGSS (nombre histórico; mismo esquema que ModelOptions). */
export const HgssOptionsSchema = ModelOptionsSchema
export type HgssOptions = ModelOptions

/** Opciones por defecto (mismo default que el esquema). */
export const HGSS_OPTIONS_DEFAULT: HgssOptions = { ignoreTextures: false, keepOriginalMaterial: false }

/** Candidato Kenney de un kind (SPEC-K/T-070b/AC-2). */
export const ModelCandidateSchema = z.object({
  pack: z.string().min(1),
  file: z.string().min(1),
  weight: z.number().positive().default(1),
  targetHeight: z.number().positive(),
  rotY: z.number().finite().default(0),
  status: ModelStatusSchema.default('proposed'),
  /** Solo con status "failed": estado a restaurar si el chequeo vuelve a pasar. */
  failedFrom: FailedFromSchema.optional(),
  /** T-086/AC-3: mantener material original / ignorar texturas por modelo. */
  options: ModelOptionsSchema.default(HGSS_OPTIONS_DEFAULT),
  /** Zonas donde se usa (palmeras ⇒ isla). Una zona con candidatos propios
   *  usa SOLO esos; sin definir ⇒ candidato genérico de las demás zonas. */
  zones: z.array(z.string().min(1)).optional(),
})
export type ModelCandidate = z.infer<typeof ModelCandidateSchema>

export const ModelKindEntrySchema = z.object({
  targetHeight: z.number().positive(),
  candidates: z.array(ModelCandidateSchema).default([]),
})
export type ModelKindEntry = z.infer<typeof ModelKindEntrySchema>

export const HgssFileSchema = z.object({
  name: z.string().min(1),
  /** Ruta del .obj relativa a assets-src/ (p. ej. "hgss/Poke Mart/…/model.obj"). */
  entry: z.string().min(1),
  /** Nodos donde usarlo (vacío ⇒ candidato por defecto del kind). */
  forNodes: z.array(z.string().min(1)).default([]),
  /** Solo kind `starter`: especies (id dex, p. ej. "charmander") que lo usan. */
  forSpecies: z.array(z.string().min(1)).default([]),
  targetHeight: z.number().positive(),
  status: ModelStatusSchema.default('proposed'),
  /** Solo con status "failed": estado a restaurar si el chequeo vuelve a pasar. */
  failedFrom: FailedFromSchema.optional(),
  options: ModelOptionsSchema.default(HGSS_OPTIONS_DEFAULT),
})
export type HgssFile = z.infer<typeof HgssFileSchema>

/** Kinds de los modelos nuevos del dueño (SPEC-N/T-091/AC-1 + SPEC-P/T-099/
 *  AC-A2): un archivo por kind en `content/board/placements.json › models.files`
 *  (gim/pokecenter/pokemart/league/oak; la extensión se detecta en assets-src/new/). */
export const NEW_MODEL_KINDS = ['gym', 'pokecenter', 'market', 'league', 'lab'] as const
export type NewModelKind = (typeof NEW_MODEL_KINDS)[number]

export const NewModelKindSchema = z.enum(NEW_MODEL_KINDS, {
  error: (issue) => `kind de modelo nuevo inválido: "${String(issue.input)}" (NEW_MODEL_KINDS, SPEC-N/T-091)`,
})

/** Formatos admitidos para los modelos nuevos (T-091/AC-1). */
export const NewModelFormatSchema = z.enum(['glb', 'gltf', 'obj', 'fbx'])
export type NewModelFormat = z.infer<typeof NewModelFormatSchema>

/** Entrada de `ModelsManifestSchema.newModels` (T-091/AC-1/AC-3): el archivo
 *  copiado a apps/web/public/models/new/ + estado de revisión/chequeo. */
export const NewModelFileSchema = z.object({
  /** Nombre del archivo (con extensión) dentro de public/models/new/. */
  file: z.string().min(1),
  format: NewModelFormatSchema,
  status: ModelStatusSchema.default('proposed'),
  /** Solo con status "failed": estado a restaurar si el chequeo vuelve a pasar. */
  failedFrom: FailedFromSchema.optional(),
  options: ModelOptionsSchema.default(HGSS_OPTIONS_DEFAULT),
})
export type NewModelFile = z.infer<typeof NewModelFileSchema>

/** Entrada de content/board/models.new.json (SPEC-O/T-094/AC-1): qué archivo
 *  usa cada kind de edificio nuevo + giro + estado. Lo escribe
 *  `pnpm models:use-new`; el manifiesto sigue siendo la fuente de runtime. */
export const NewModelEntrySchema = z.object({
  file: z.string().min(1),
  format: NewModelFormatSchema,
  /** Giro adicional para que la puerta mire al camino (grados, [-180, 180]). */
  yawOffsetDeg: z.number().min(-180).max(180),
  status: ModelStatusSchema.default('proposed'),
})
export type NewModelEntry = z.infer<typeof NewModelEntrySchema>

export const ModelsNewFileSchema = z.object({
  _status: z.string().optional(),
  models: z.partialRecord(NewModelKindSchema, NewModelEntrySchema).default({}),
})
export type ModelsNewFile = z.infer<typeof ModelsNewFileSchema>

/** Cruce models.new.json ↔ models.manifest.json (SPEC-O/T-094/AC-1): el
 *  archivo/formato por kind debe ser el mismo en ambos (los escribe el mismo
 *  tool; si divergen, corré `pnpm models:use-new`). */
export function crossCheckModelsNew(
  modelsNew: ModelsNewFile,
  manifest: ModelsManifest,
): string[] {
  const errors: string[] = []
  for (const [kind, entry] of Object.entries(modelsNew.models)) {
    const runtime = manifest.newModels[kind as NewModelKind]
    if (runtime === undefined) {
      errors.push(`models.new.json ${kind}: existe acá pero no en models.manifest.json (corré pnpm models:use-new)`)
      continue
    }
    if (runtime.file !== entry.file || runtime.format !== entry.format) {
      errors.push(
        `models.new.json ${kind}: ${entry.file} (${entry.format}) ≠ models.manifest.json ${runtime.file} ` +
          `(${runtime.format}) (corré pnpm models:use-new)`,
      )
    }
  }
  return errors
}

/** Manifiesto (T-070b): propuesto por `models:suggest`, revisado por el dueño. */
export const ModelsManifestSchema = z.object({
  _status: z.string().optional(),
  kinds: z.partialRecord(ModelKindSchema, ModelKindEntrySchema).default({}),
  hgss: z.partialRecord(HgssKindSchema, z.object({
    targetHeight: z.number().positive(),
    files: z.array(HgssFileSchema).default([]),
  })).default({}),
  /** T-091/AC-1: modelos nuevos por kind; los escribe `pnpm models:new`. */
  newModels: z.partialRecord(NewModelKindSchema, NewModelFileSchema).default({}),
  unclassified: z.array(z.object({ pack: z.string().min(1), file: z.string().min(1) })).default([]),
})
export type ModelsManifest = z.infer<typeof ModelsManifestSchema>

const Vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])

/** Entrada del catálogo (T-070a): un .glb Kenney o un .obj HGSS. */
export const CatalogEntrySchema = z.object({
  pack: z.string().min(1),
  file: z.string().min(1),
  format: z.enum(['glb', 'obj']),
  sizeKB: z.number().positive(),
  triangles: z.number().int().nonnegative(),
  bbox: z.object({ min: Vec3, max: Vec3 }),
  dimensions: Vec3,
  /** heavy ⇒ > 20 000 triángulos; big ⇒ > 300 KB (T-070a/AC-2). */
  flags: z.array(z.enum(['heavy', 'big'])).default([]),
  /** OBJ: texturas presentes / referenciadas pero faltantes (T-070e/AC-1). */
  textures: z.array(z.string().min(1)).default([]),
  missingTextures: z.array(z.string().min(1)).default([]),
})
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>

export const CatalogPackSchema = z.object({
  files: z.number().int().nonnegative(),
  triangles: z.number().int().nonnegative(),
  sizeKB: z.number().nonnegative(),
  license: z.string().nullable(),
  /** Kenney: debe existir y decir CC0 (T-070a/AC-3); hgss ⇒ false esperado. */
  licenseOk: z.boolean(),
  private: z.boolean().default(false),
})
export type CatalogPack = z.infer<typeof CatalogPackSchema>

export const ModelsCatalogSchema = z.object({
  _status: z.string().optional(),
  packs: z.record(z.string().min(1), CatalogPackSchema),
  entries: z.array(CatalogEntrySchema),
})
export type ModelsCatalog = z.infer<typeof ModelsCatalogSchema>

/** Wishlist HGSS (content/board/models.hgss.wishlist.json, el dueño descarga). */
export const HgssWishlistSchema = z.object({
  _status: z.string().optional(),
  pageUrlTemplate: z.string().optional(),
  assets: z.array(z.object({
    id: z.number().int(),
    name: z.string().min(1),
    forKind: z.string().min(1),
    forNodes: z.array(z.string().min(1)).default([]),
    /** Solo forKind `starter`: especies (id dex) que usan el modelo. */
    forSpecies: z.array(z.string().min(1)).default([]),
    targetHeight: z.number().positive().optional(),
    optional: z.boolean().default(false),
    notes: z.string().optional(),
  })),
})
export type HgssWishlist = z.infer<typeof HgssWishlistSchema>

// ── Elección determinista (SPEC-K/T-070d/AC-2) ──────────────────────────────

const hashSeed = (seed: number): number => {
  let h = seed | 0
  h ^= h >>> 16
  h = Math.imul(h, 2246822519)
  h ^= h >>> 13
  h = Math.imul(h, 3266489917)
  h ^= h >>> 16
  return h >>> 0
}

/** Candidatos utilizables: aprobados o aún sin revisar (T-070d/AC-1).
 *  T-086/AC-4: los que fallan el chequeo de brillo quedan `failed` y el juego
 *  usa la pieza procedural. */
export function usableCandidates<T extends { readonly status: ModelStatus }>(
  candidates: readonly T[],
): readonly T[] {
  return candidates.filter((candidate) => candidate.status !== 'rejected' && candidate.status !== 'failed')
}

/** Variante elegida por seed y peso: mismo seed ⇒ mismo candidato (AC-2). */
export function pickModelVariant<T extends { readonly weight: number }>(
  candidates: readonly T[],
  seed: number,
): T {
  if (candidates.length === 0) throw new Error('pickModelVariant: lista de candidatos vacía')
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0)
  let pick = (hashSeed(seed) / 4294967296) * total
  for (const candidate of candidates) {
    pick -= candidate.weight
    if (pick <= 0) return candidate
  }
  return candidates[candidates.length - 1]!
}

// ── Chequeos cruzados puros (los consume validate.ts) ───────────────────────

const catalogKey = (pack: string, file: string): string => `${pack}::${file}`

/** Cruces manifiesto ↔ catálogo (SPEC-K/T-070d/AC-7). */
export function crossCheckModels(manifest: ModelsManifest, catalog: ModelsCatalog | null): string[] {
  const errors: string[] = []
  const known = new Set(catalog?.entries.map((entry) => catalogKey(entry.pack, entry.file)) ?? [])
  const byKey = new Map(catalog?.entries.map((entry) => [catalogKey(entry.pack, entry.file), entry]) ?? [])

  for (const [kind, entry] of Object.entries(manifest.kinds)) {
    const seen = new Set<string>()
    for (const candidate of entry.candidates) {
      const key = catalogKey(candidate.pack, candidate.file)
      if (seen.has(key)) errors.push(`models.manifest kinds.${kind}: candidato duplicado ${key}`)
      seen.add(key)
      if (known.size > 0 && !known.has(key)) {
        errors.push(`models.manifest kinds.${kind}: ${key} no está en el catálogo (corré pnpm models:scan)`)
        continue
      }
      const info = byKey.get(key)
      if (info !== undefined && (info.flags.includes('heavy') || info.triangles > 20_000)) {
        errors.push(`models.manifest kinds.${kind}: ${key} supera 20 000 triángulos (${String(info.triangles)})`)
      }
    }
  }

  for (const [kind, group] of Object.entries(manifest.hgss)) {
    const seen = new Set<string>()
    for (const file of group.files) {
      if (seen.has(file.entry)) errors.push(`models.manifest hgss.${kind}: entrada duplicada ${file.entry}`)
      seen.add(file.entry)
      const info = byKey.get(catalogKey('hgss', file.entry))
      if (info === undefined && known.size > 0) {
        errors.push(`models.manifest hgss.${kind}: ${file.entry} no está en el catálogo (corré pnpm models:scan)`)
      } else if (info !== undefined && info.missingTextures.length > 0 && !file.options.ignoreTextures) {
        errors.push(
          `models.manifest hgss.${kind}: ${file.entry} tiene texturas faltantes (${info.missingTextures.join(', ')}); ` +
            `marcá options.ignoreTextures o rechazalo en /dev/models`,
        )
      }
    }
  }
  return errors
}
