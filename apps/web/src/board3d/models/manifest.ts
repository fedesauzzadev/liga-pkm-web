// Manifiesto de modelos en runtime (SPEC-K/T-070d): carga
// content/board/models.manifest.json (validado por content:validate) y expone
// las queries que usa la capa 3D: candidatos Kenney por (kind, variant) de
// decoración, archivos HGSS por kind/nodo y los modelos nuevos de SPEC-N/T-091
// por edificio de placements. Puro (sin three): testeable.
import {
  HGSS_KINDS, MODEL_KIND_TO_DECOR, ModelsManifestSchema, usableCandidates,
  type DecorKind, type HgssFile, type HgssKind, type ModelCandidate, type ModelKind,
  type ModelsManifest, type NewModelFile, type NewModelKind,
} from '@liga/content'
import manifestJson from '../../../../../content/board/models.manifest.json'

export const modelsManifest: ModelsManifest = ModelsManifestSchema.parse(manifestJson)

/** kind de modelo Kenney que reemplaza una pieza (kind, variant) del decor. */
export function modelKindForDecor(
  kind: DecorKind,
  variant?: 'pine' | 'round',
): ModelKind | null {
  for (const [modelKind, target] of Object.entries(MODEL_KIND_TO_DECOR) as readonly [
    ModelKind,
    { readonly kind: DecorKind; readonly variant?: 'pine' | 'round' } | undefined,
  ][]) {
    if (target === undefined) continue
    if (target.kind !== kind) continue
    if (target.variant !== undefined && target.variant !== variant) continue
    if (target.variant === undefined && variant !== undefined) {
      // pieza con variante (tree pine/round) y el kind no la pide ⇒ no aplica
      if (kind === 'tree') continue
    }
    return modelKind
  }
  return null
}

/** Candidatos utilizables (approved/proposed) para una pieza de decoración. */
export function kenneyCandidatesFor(
  kind: DecorKind,
  variant?: 'pine' | 'round',
): readonly ModelCandidate[] {
  const modelKind = modelKindForDecor(kind, variant)
  if (modelKind === null) return []
  return usableCandidates(modelsManifest.kinds[modelKind]?.candidates ?? [])
}

/** Archivos HGSS utilizables para un kind; primero los del nodo, luego default. */
export function hgssFilesFor(kind: DecorKind, nodeId?: string): readonly HgssFile[] {
  if (!HGSS_KINDS.includes(kind as HgssKind)) return []
  const group = modelsManifest.hgss[kind as HgssKind]
  if (group === undefined) return []
  const usable = usableCandidates(group.files)
  const forNode = usable.filter((file) => file.forNodes.includes(nodeId ?? ''))
  if (forNode.length > 0) return forNode
  return usable.filter((file) => file.forNodes.length === 0)
}

/** URL pública de un archivo Kenney importado (public/models/<pack>/…). */
export const kenneyModelUrl = (candidate: ModelCandidate): string =>
  `/models/${candidate.file.replace(/^kenney\//, '').split('/').map(encodeURIComponent).join('/')}`

/** URL pública de un .obj HGSS importado (bajo /models/hgss/, gitignored). */
export const hgssModelUrl = (file: HgssFile): string =>
  `/models/${file.entry.split('/').map(encodeURIComponent).join('/')}`

/** Archivo HGSS utilizable (approved/proposed) del inicial de una especie
 *  (grupo `hgss.starter`, matching por `forSpecies`); null ⇒ no hay modelo. */
export function hgssStarterModel(species: string): HgssFile | null {
  const group = modelsManifest.hgss.starter
  if (group === undefined) return null
  return usableCandidates(group.files).find((file) => file.forSpecies.includes(species)) ?? null
}

// ── Modelos nuevos (SPEC-N/T-091/AC-2/AC-3) ─────────────────────────────────

export type NewModelTarget =
  /** Entrada utilizable (approved/proposed): el modelo nuevo reemplaza la pieza. */
  | { readonly type: 'new'; readonly kind: NewModelKind; readonly file: NewModelFile }
  /** Entrada presente pero failed/rejected ⇒ pieza procedural de su kind (AC-3). */
  | { readonly type: 'blocked' }
  /** Sin entrada en el manifiesto ⇒ cadena hgss/kenney de siempre. */
  | { readonly type: 'absent' }

/** Modelos nuevos por `kind` de placements (gym, pokecenter, market, league).
 *  `undefined` (nodo sin reubicar) ⇒ 'absent'. `source` inyectable para testear
 *  failed/rejected sin tocar el manifiesto real. */
export function newModelTargetFor(
  kind: string | undefined,
  source: ModelsManifest = modelsManifest,
): NewModelTarget {
  if (kind === undefined) return { type: 'absent' }
  const file = source.newModels[kind as NewModelKind]
  if (file === undefined) return { type: 'absent' }
  if (usableCandidates([file]).length === 0) return { type: 'blocked' }
  return { type: 'new', kind: kind as NewModelKind, file }
}

/** URL pública de un modelo nuevo (public/models/new/, gitignorado). */
export const newModelUrl = (file: string): string =>
  `/models/new/${file.split('/').map(encodeURIComponent).join('/')}`
