// target (SPEC-K/T-070d + SPEC-O/T-094): resolución PURA del destino de un
// landmark — orden por edificio nuevo (T-091) → HGSS → casa Kenney → Kenney
// del kind → null (procedural) — y el motivo de fallback de los modelos
// nuevos (AC-3: no encontrado / falló chequeo / rechazado). Sin three: lo
// consumen layer.ts y los tests.
import type { DecorKind, HgssFile, ModelCandidate, NewModelKind, PlacementsKind } from '@liga/content'
import { NEW_MODEL_KINDS, pickModelVariant } from '@liga/content'
import { fnv1a } from '../rand'
import {
  hgssFilesFor, kenneyCandidatesFor, modelsManifest, newModelTargetFor, newModelUrl,
} from './manifest'
import type { ModelTuneOptions } from './normalize'

export interface LandmarkModelSpec {
  /** `${nodeId}:${kind}:${index}` — coincide con el nombre del procedural. */
  readonly key: string
  readonly kind: DecorKind
  readonly variant?: 'pine' | 'round' | undefined
  readonly nodeId: string
  readonly x: number
  readonly y: number
  readonly z: number
  readonly rotY: number
  readonly scale: number
  readonly flagColor?: string | undefined
  /** T-091: kind de placements.nodes si esta pieza es el edificio reubicado
   *  (gym/pokecenter/market/league/lab/house); define el modelo nuevo y los
   *  máximos de altura/huella. Ausente ⇒ cadena hgss/kenney de siempre. */
  readonly buildingKind?: PlacementsKind | undefined
  /** Altura máxima (heights de placements.json) para normalizeParts. */
  readonly targetHeight?: number | undefined
  /** Huella máxima (footprints de placements.json): escala = min(alto, huella). */
  readonly maxFootprint?: number | undefined
}

const BUILDING_KINDS: readonly DecorKind[] = ['house', 'pokecenter', 'market', 'lab', 'gym']

/** SPEC-O/T-094/AC-3: el motivo de fallback de un kind de modelo nuevo según
 *  el manifiesto (blocked se parte en rechazado/falló chequeo; absent ⇒ no
 *  encontrado). null ⇒ el modelo nuevo está disponible (o kind no aplica). */
export function newModelFallbackReason(
  kind: PlacementsKind,
  manifest?: Parameters<typeof newModelTargetFor>[1],
): 'no encontrado' | 'falló chequeo' | 'rechazado' | null {
  if (!(NEW_MODEL_KINDS as readonly string[]).includes(kind)) return null
  const target = newModelTargetFor(kind, manifest)
  if (target.type === 'new') return null
  if (target.type === 'absent') return 'no encontrado'
  return (manifest ?? modelsManifest).newModels[kind as NewModelKind]?.status === 'rejected'
    ? 'rechazado'
    : 'falló chequeo'
}

/** SPEC-O/T-094/AC-2: draw calls que un edificio con modelo nuevo reserva
 *  (1 parte fusionada + overlay de bandera si su pieza es gym). 0 si no tiene
 *  modelo nuevo disponible (esos van por la cadena de siempre, sin reserva). */
export function newModelQuotaOf(spec: LandmarkModelSpec): number {
  if (spec.buildingKind === undefined) return 0
  if (newModelFallbackReason(spec.buildingKind) !== null) return 0
  return 1 + (spec.kind === 'gym' ? 1 : 0)
}

/** AC-2 (SPEC-O/T-094): target de un landmark — modelo nuevo → HGSS → casa
 *  Kenney + overlay → Kenney del kind; null ⇒ pieza procedural. */
export type BuildingOverlayKind = 'house' | 'pokecenter' | 'market' | 'lab' | 'gym'

export type LandmarkTarget =
  | { readonly type: 'new'; readonly url: string; readonly kind: 'glb' | 'gltf' | 'obj' | 'fbx'; readonly options: ModelTuneOptions }
  | { readonly type: 'hgss'; readonly file: HgssFile }
  | { readonly type: 'kenney'; readonly candidate: ModelCandidate; overlayKind?: BuildingOverlayKind }

export function landmarkTarget(
  spec: LandmarkModelSpec,
  manifest?: Parameters<typeof newModelTargetFor>[1],
): LandmarkTarget | null {
  // SPEC-N/T-091/AC-2: los 4 modelos nuevos (gym/league/pokecenter/market) del
  // edificio reubicado. Si el chequeo T-086 lo dejó "failed" (AC-3), null ⇒
  // queda la pieza procedural de su kind y se informa en /dev/models-check.
  const fresh = newModelTargetFor(spec.buildingKind, manifest)
  if (fresh.type === 'new') {
    return { type: 'new', url: newModelUrl(fresh.file.file), kind: fresh.file.format, options: fresh.file.options }
  }
  if (fresh.type === 'blocked') return null
  const hgss = hgssFilesFor(spec.kind, spec.nodeId)
  if (hgss.length > 0) {
    const file = pickModelVariant(hgss.map((entry) => ({ entry, weight: 1 })), fnv1a(`hgss:${spec.key}`)).entry
    return { type: 'hgss', file }
  }
  if (BUILDING_KINDS.includes(spec.kind)) {
    const houses = kenneyCandidatesFor('house')
    if (houses.length > 0) {
      return {
        type: 'kenney',
        candidate: pickModelVariant(houses, fnv1a(`kenney:${spec.key}`)),
        overlayKind: spec.kind as BuildingOverlayKind,
      }
    }
  }
  const candidates = kenneyCandidatesFor(spec.kind, spec.variant)
  if (candidates.length === 0) return null
  return { type: 'kenney', candidate: pickModelVariant(candidates, fnv1a(`kenney:${spec.key}`)) }
}
