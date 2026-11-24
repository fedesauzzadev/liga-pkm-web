// layer (SPEC-K/T-070d): capa imperativa de modelos sobre la escena del
// tablero. Reemplaza piezas procedurales (landmarks + scatter) por modelos
// Kenney/HGSS/nuevos (SPEC-N/T-091) del manifiesto: elección determinista por
// seed+peso (AC-2), carga perezosa por cercanía de cámara con precarga de
// Pueblo Paleta (AC-6), instancias por (spec, candidato, material) dentro del
// presupuesto (AC-4) y fallback a la pieza procedural si el archivo falta o
// falla (AC-5; T-091/AC-3: también si el chequeo dejó el modelo "failed";
// SPEC-O/T-094/AC-3: el fallback es RUIDOSO — registro por kind + warn único).
// Three puro (NO-VISION); los loaders se inyectan para testear en node.
import type { DecorKind } from '@liga/content'
import {
  categoryOfKind, colorPassesSanity, colorSanityOf, pickModelVariant, type ModelCandidate,
} from '@liga/content'
import * as THREE from 'three'
import { neutralModelColor } from '../../theme/models'
import { boardCollision } from '../decor/plan'
import { fnv1a } from '../rand'
import { naturalizeFoliage } from './foliage'
import {
  hgssModelUrl, kenneyModelUrl, scatterCandidatesFor,
} from './manifest'
import {
  mergeModelByMaterial, normalizeParts, toonizeModel,
  type MergedModelPart, type ModelTuneOptions,
} from './normalize'
import { buildBuildingOverlay } from './overlays'
import { registerModelFallback, registerModelResolved } from './report'
import {
  landmarkTarget, newModelFallbackReason, newModelQuotaOf, type LandmarkModelSpec,
} from './target'

// Re-export para consumers de siempre (tests/ModelDecor importan desde layer).
export { landmarkTarget, newModelFallbackReason, newModelQuotaOf, type LandmarkModelSpec }
export type { BuildingOverlayKind, LandmarkTarget } from './target'

export interface ModelLoaders {
  readonly loadGltf: (url: string) => Promise<THREE.Object3D>
  readonly loadObj: (url: string, options: ModelTuneOptions) => Promise<THREE.Object3D>
  /** SPEC-N/T-091/AC-1: FBXLoader de three/examples (import dinámico). */
  readonly loadFbx: (url: string) => Promise<THREE.Object3D>
}

export interface ScatterSpot {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly scale: number
  readonly rotY: number
}

export interface ScatterModelSpec {
  readonly zone: string
  readonly kind: DecorKind
  readonly variant?: 'pine' | 'round' | undefined
  readonly seed: number
  readonly spots: readonly ScatterSpot[]
}

export interface ModelDecorDeps {
  readonly landmarks: THREE.Group
  readonly scatter: THREE.Group
  readonly palette: Record<string, string>
  readonly outlines: THREE.Group
  readonly outlineStyle: {
    readonly color: string
    readonly thickness: number
    readonly maxMeshes: number
    readonly onlyKinds: readonly string[]
  }
  readonly specs: readonly LandmarkModelSpec[]
  readonly scatterSpecs: readonly ScatterModelSpec[]
  readonly loaders: ModelLoaders
  readonly budget: { readonly maxDrawCalls: number; readonly maxTriangles: number }
  /** Distancia de cámara para cargar una zona (SPEC-K/T-070d/AC-6: 14). */
  readonly loadDistance?: number
}

interface Template {
  readonly parts: readonly MergedModelPart[]
  readonly triangles: number
}

const trianglesOf = (geometry: THREE.BufferGeometry): number => {
  const index = geometry.getIndex()
  const count = index !== null ? index.count : (geometry.getAttribute('position')?.count ?? 0)
  return Math.ceil(count / 3)
}

interface RgbColor { readonly r: number; readonly g: number; readonly b: number }

/** SPEC-O/T-095/AC-5: color dominante del template — media de los colores de
 * los materiales SIN textura (arte con textura se confía); null si no hay
 * colores planos que promediar. */
export function templateDominantColor(parts: readonly MergedModelPart[]): RgbColor | null {
  let r = 0
  let g = 0
  let b = 0
  let count = 0
  for (const part of parts) {
    const material = part.material
    if (!(material instanceof THREE.MeshStandardMaterial)) continue
    if (material.map !== null) continue
    r += material.color.r
    g += material.color.g
    b += material.color.b
    count += 1
  }
  if (count === 0) return null
  return { r: r / count, g: g / count, b: b / count }
}

/** AC-5: el template pasa colorSanity de la categoría del kind (fuera de
 * rango ⇒ pieza procedural). Sin rango definido ⇒ siempre pasa. */
export function templatePassesSanity(kind: string, parts: readonly MergedModelPart[]): boolean {
  const category = categoryOfKind(kind)
  if (category === null) return false
  const dominant = templateDominantColor(parts)
  if (dominant === null) return true
  return colorPassesSanity(colorSanityOf(boardCollision, category), dominant)
}

/** Capa de modelos: se construye y actualiza desde ModelDecor (R3F). */
export class ModelDecorLayer {
  private readonly deps: ModelDecorDeps
  /** Cache de templates + llaves "en vuelo" de specs (evita doble disparo). */
  private readonly templates = new Map<string, Promise<Template | null>>()
  private readonly pending = new Set<string>()
  private drawCallsUsed = 0
  private trianglesUsed = 0
  private failedCount = 0
  private landmarksReplaced = 0
  private specsReplaced = 0
  /** SPEC-O/T-094/AC-2: draw calls reservados por los edificios con modelo
   *  nuevo aún no colocados — el scatter no puede comerse esta reserva. */
  private newModelReserve = 0

  constructor(deps: ModelDecorDeps) {
    this.deps = deps
    for (const spec of deps.specs) {
      this.newModelReserve += newModelQuotaOf(spec)
    }
  }

  get stats(): { templates: number; drawCalls: number; triangles: number; landmarks: number; specs: number; failed: number } {
    return {
      templates: this.templates.size,
      drawCalls: this.drawCallsUsed,
      triangles: this.trianglesUsed,
      landmarks: this.landmarksReplaced,
      specs: this.specsReplaced,
      failed: this.failedCount,
    }
  }

  /** AC-6: precarga (Pueblo Paleta al arrancar). */
  preload(nodeIds: readonly string[]): void {
    for (const spec of this.deps.specs) {
      if (nodeIds.includes(spec.nodeId)) void this.loadLandmark(spec)
    }
  }

  /** AC-6: dispara cargas a < loadDistance de la cámara. */
  update(cameraX: number, cameraZ: number): void {
    const distance = this.deps.loadDistance ?? 14
    // SPEC-O/T-094/AC-2: los landmarks (edificios) se disparan ANTES que el
    // scatter: son la prioridad del presupuesto y su carga es async.
    for (const spec of this.deps.specs) {
      const key = `landmark:${spec.key}`
      if (this.pending.has(key)) continue
      if (Math.hypot(spec.x - cameraX, spec.z - cameraZ) < distance) void this.loadLandmark(spec)
    }
    for (const spec of this.deps.scatterSpecs) {
      const key = `scatter:${spec.zone}:${spec.kind}:${spec.variant ?? '-'}:${spec.seed}`
      if (this.pending.has(key)) continue
      if (spec.spots.some((spot) => Math.hypot(spot.x - cameraX, spot.z - cameraZ) < distance)) {
        this.pending.add(key)
        void this.loadScatterSpec(spec, key)
      }
    }
  }

  private templateFor(
    url: string,
    targetHeight: number,
    loader: 'glb' | 'gltf' | 'obj' | 'fbx',
    options: ModelTuneOptions,
    maxFootprint?: number,
    /** SPEC-O/T-094/AC-3: notifica el error de carga/parseo (fallback ruidoso). */
    onFailure?: (error: unknown) => void,
  ): Promise<Template | null> {
    // La clave incluye el color neutro: el mismo archivo usado con dos kinds
    // distintos debe poder quedarse con el color neutro de cada uno (AC-2).
    const cacheKey =
      `${loader}:${url}:${targetHeight}:${maxFootprint ?? '-'}:${options.ignoreTextures ? 'i' : ''}` +
      `${options.keepOriginalMaterial ? 'k' : ''}:${options.neutralColor ?? '-'}`
    const cached = this.templates.get(cacheKey)
    if (cached !== undefined) return cached
    const promise = (async (): Promise<Template | null> => {
      try {
        const raw = await (loader === 'obj'
          ? this.deps.loaders.loadObj(url, options)
          : loader === 'fbx'
            ? this.deps.loaders.loadFbx(url)
            : this.deps.loaders.loadGltf(url))
        toonizeModel(raw, options)
        const parts = normalizeParts(mergeModelByMaterial(raw), targetHeight, maxFootprint)
        return { parts, triangles: parts.reduce((sum, part) => sum + trianglesOf(part.geometry), 0) }
      } catch (error) {
        this.failedCount += 1
        onFailure?.(error)
        return null
      }
    })()
    this.templates.set(cacheKey, promise)
    return promise
  }

  /** AC-4 + AC-5: spots repartidos entre los candidatos que cargaron. */
  private async loadScatterSpec(spec: ScatterModelSpec, key: string): Promise<void> {
    const candidates = scatterCandidatesFor(spec.kind, spec.variant, spec.zone, fnv1a(key))
    if (candidates.length === 0 || spec.spots.length === 0) return
    const loaded = await Promise.all(
      candidates.map(async (candidate) => ({
        candidate,
        template: await this.templateFor(kenneyModelUrl(candidate), candidate.targetHeight, 'glb', {
          ...candidate.options,
          // AC-2 (T-086): color neutro del kind si una textura no carga.
          neutralColor: neutralModelColor(spec.kind),
          label: candidate.file,
        }),
      })),
    )
    const usable = loaded.filter((entry): entry is { candidate: ModelCandidate; template: Template } => entry.template !== null)
      // AC-5 (T-095): modelos con color fuera del rango de su categoría no
      // reemplazan el procedural (p. ej. "cristales" celestes como árboles).
      .filter((entry) => templatePassesSanity(spec.kind, entry.template.parts))
    if (usable.length === 0) return
    for (const entry of usable) naturalizeFoliage(entry.template.parts.map((part) => part.material), spec.kind)

    // Reparto determinista por seed (AC-2).
    const buckets = new Map<ModelCandidate, readonly ScatterSpot[]>()
    const pool = usable.map((entry) => ({ entry, weight: entry.candidate.weight }))
    for (let index = 0; index < spec.spots.length; index += 1) {
      const chosen = pickModelVariant(pool, fnv1a(`${key}:${index}`)).entry
      const current = buckets.get(chosen.candidate) ?? []
      buckets.set(chosen.candidate, [...current, spec.spots[index]!])
    }

    const active = usable.filter((entry) => (buckets.get(entry.candidate)?.length ?? 0) > 0)
    const drawCalls = active.reduce((sum, entry) => sum + entry.template.parts.length, 0)
    const triangles = usable.reduce((sum, entry) => sum + entry.template.triangles * (buckets.get(entry.candidate)?.length ?? 0), 0)
    // AC-4: el total respeta el presupuesto; si no entra, queda procedural.
    // SPEC-O/T-094/AC-2: la reserva de los edificios nuevos no se toca.
    if (this.drawCallsUsed + drawCalls + this.newModelReserve > this.deps.budget.maxDrawCalls) return
    if (this.trianglesUsed + triangles > this.deps.budget.maxTriangles) return

    const group = new THREE.Group()
    group.name = `models:${spec.zone}:${spec.kind}`
    const quaternion = new THREE.Quaternion()
    const euler = new THREE.Euler()
    const matrix = new THREE.Matrix4()
    for (const { candidate, template } of active) {
      const spots = buckets.get(candidate)!
      template.parts.forEach((part, partIndex) => {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, spots.length)
        mesh.name = `model:${spec.zone}:${spec.kind}:${partIndex}`
        // T-095/AC-5: categoría en escena para el sceneDump.
        mesh.userData = {
          zone: spec.zone,
          kind: spec.kind,
          seed: spec.seed,
          variant: spec.variant,
          category: categoryOfKind(spec.kind) ?? undefined,
        }
        spots.forEach((spot, index) => {
          euler.set(0, spot.rotY + candidate.rotY, 0)
          quaternion.setFromEuler(euler)
          matrix.compose(
            new THREE.Vector3(spot.x, spot.y, spot.z),
            quaternion,
            new THREE.Vector3(spot.scale, spot.scale, spot.scale),
          )
          mesh.setMatrixAt(index, matrix)
        })
        mesh.instanceMatrix.needsUpdate = true
        group.add(mesh)
      })
    }
    this.deps.scatter.add(group)
    this.drawCallsUsed += drawCalls
    this.trianglesUsed += triangles
    this.specsReplaced += 1
    // Oculta el procedural del spec recién cubierto (userData de scatter.ts).
    for (const child of this.deps.scatter.children) {
      const data = child.userData as { zone?: string; kind?: string; variant?: string; seed?: number }
      if (
        data.zone === spec.zone && data.kind === spec.kind &&
        (data.variant ?? undefined) === (spec.variant ?? undefined) && data.seed === spec.seed
      ) {
        child.visible = false
      }
    }
  }

  private async loadLandmark(spec: LandmarkModelSpec): Promise<void> {
    const key = `landmark:${spec.key}`
    if (this.pending.has(key)) return
    this.pending.add(key)
    const target = landmarkTarget(spec)
    // SPEC-O/T-094/AC-3: fallback ruidoso — si el modelo nuevo del kind no está
    // (ausente/rechazado/failed), el motivo queda registrado y advertido una
    // vez, aunque la cadena hgss/kenney atrape la caída.
    const newReason = spec.buildingKind !== undefined ? newModelFallbackReason(spec.buildingKind) : null
    if (newReason !== null) {
      registerModelFallback(spec.buildingKind!, newReason, target === null ? undefined : 'sigue por hgss/kenney')
    }
    if (target === null) return
    if (target.type === 'new') {
      // T-091/AC-2/AC-6: máximos conservadores (heights/footprints) y opciones
      // del manifiesto; sin targetHeight no hay escala posible ⇒ procedural.
      if (spec.targetHeight === undefined) {
        if (spec.buildingKind !== undefined) {
          registerModelFallback(spec.buildingKind, 'no encontrado', 'sin targetHeight en placements.json')
        }
        return
      }
      const template = await this.templateFor(
        target.url,
        spec.targetHeight,
        target.kind,
        {
          ...target.options,
          neutralColor: neutralModelColor(spec.kind),
          label: target.url,
        },
        spec.maxFootprint,
        // AC-3: el motivo exacto del fallback queda en el registro + consola.
        spec.buildingKind === undefined
          ? undefined
          : (error) => registerModelFallback(
            spec.buildingKind!,
            'error de carga',
            `${target.url}: ${error instanceof Error ? error.message : String(error)}`,
          ),
      )
      // T-091/AC-4: la bandera procedural del gimnasio (color del líder/Liga)
      // queda ENCIMA del modelo nuevo; el resto de edificios sin overlay.
      const overlayKind = spec.kind === 'gym' ? 'gym' : null
      // SPEC-O/T-094/AC-2: el edificio consume SU reserva al colocarse (los
      // GLB nuevos son 1 parte fusionada; gym suma la bandera ⇒ quota 2).
      this.newModelReserve -= newModelQuotaOf(spec)
      if (template !== null && this.placeLandmark(spec, template, overlayKind, spec.targetHeight ?? 0.8, 'new')) {
        // AC-3: éxito registrado una vez por kind (gim.glb desde la URL).
        if (spec.buildingKind !== undefined) {
          registerModelResolved(spec.buildingKind, target.url.split('/').pop() ?? target.url)
        }
      } else if (template !== null && spec.buildingKind !== undefined) {
        registerModelFallback(
          spec.buildingKind,
          'sin presupuesto',
          `${String(template.parts.length)} draw calls > ${String(this.deps.budget.maxDrawCalls)}`,
        )
      }
      return
    }
    if (target.type === 'hgss') {
      const template = await this.templateFor(hgssModelUrl(target.file), target.file.targetHeight, 'obj', {
        ...target.file.options,
        pixelArt: true,
        // AC-2 (T-086): color neutro del kind + nombre del modelo en warnings.
        neutralColor: neutralModelColor(spec.kind),
        label: target.file.name,
      }, spec.maxFootprint)
      if (template !== null) this.placeLandmark(spec, template, null, 0.8, 'hgss')
      return
    }
    const overlayKind = target.overlayKind !== undefined && target.overlayKind !== 'house' ? target.overlayKind : null
    const template = await this.templateFor(kenneyModelUrl(target.candidate), target.candidate.targetHeight, 'glb', {
      ...target.candidate.options,
      neutralColor: neutralModelColor(spec.kind),
      label: target.candidate.file,
    }, spec.maxFootprint)
    // AC-5 (T-095): color dominante fuera del rango de la categoría ⇒ queda
    // la pieza procedural.
    if (template !== null && !templatePassesSanity(spec.kind, template.parts)) return
    if (template !== null) this.placeLandmark(spec, template, overlayKind, 0.8, 'kenney')
  }

  /** Coloca el modelo (+ overlay) y oculta el procedural (AC-5: solo tras
   *  cargar). Devuelve false si el presupuesto de draw calls no alcanzó
   *  (contando la reserva de edificios nuevos aún pendientes, AC-2/T-094).
   *  SPEC-P/T-099/AC-B3: `source` (new/hgss/kenney) queda en userData para el
   *  sceneDump — nunca "procedural" en un grupo de modelo. */
  private placeLandmark(
    spec: LandmarkModelSpec,
    template: Template,
    overlayKind: 'house' | 'pokecenter' | 'market' | 'lab' | 'gym' | null,
    overlayHeight = 0.8,
    source: 'new' | 'hgss' | 'kenney' = 'kenney',
  ): boolean {
    // El overlay (bandera del gimnasio/Liga) también consume un draw call.
    const overlayCost = overlayKind === null ? 0 : 1
    if (
      this.drawCallsUsed + template.parts.length + overlayCost + this.newModelReserve >
      this.deps.budget.maxDrawCalls
    ) {
      return false
    }
    const group = new THREE.Group()
    group.name = `model:${spec.key}`
    group.userData = {
      kind: spec.kind,
      nodeId: spec.nodeId,
      category: categoryOfKind(spec.kind) ?? undefined,
      source,
      ...(spec.buildingKind === undefined ? {} : { buildingKind: spec.buildingKind }),
    }
    for (const part of template.parts) group.add(new THREE.Mesh(part.geometry, part.material))
    const overlay =
      overlayKind === null ? null : buildBuildingOverlay(overlayKind, this.deps.palette, overlayHeight, spec.flagColor)
    if (overlay !== null) group.add(overlay)
    group.position.set(spec.x, spec.y, spec.z)
    group.rotation.y = spec.rotY
    group.scale.setScalar(spec.scale)
    this.deps.landmarks.add(group)
    this.drawCallsUsed += template.parts.length + (overlay === null ? 0 : 1)
    this.trianglesUsed += template.triangles
    this.landmarksReplaced += 1

    const procedural = this.deps.landmarks.children.find((child) => child.name === `landmark:${spec.key}`)
    if (procedural !== undefined) procedural.visible = false

    // AC-3 (T-070d): contornos solo en house/landmarks, con tope de mallas.
    const outlineSlots = this.deps.outlineStyle.maxMeshes - this.deps.outlines.children.length
    if (outlineSlots > 0 && this.deps.outlineStyle.onlyKinds.includes(spec.kind) && template.parts[0] !== undefined) {
      const outline = new THREE.Mesh(
        template.parts[0]!.geometry,
        new THREE.MeshBasicMaterial({ color: this.deps.outlineStyle.color, side: THREE.BackSide }),
      )
      outline.name = `outline:model:${spec.key}`
      outline.position.copy(group.position)
      outline.rotation.copy(group.rotation)
      outline.scale.setScalar(spec.scale * (1 + this.deps.outlineStyle.thickness))
      this.deps.outlines.add(outline)
    }
    return true
  }

  dispose(): void {
    this.templates.clear()
    this.pending.clear()
  }
}
