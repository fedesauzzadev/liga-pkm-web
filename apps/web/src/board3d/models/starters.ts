// starters (fichas-modelo-3d-hgss): plantillas 3D HGSS de los iniciales para
// las fichas del tablero. Caché por especie (AC-7: 1 carga por inicial,
// compartida entre fichas iguales) + instancias que reutilizan geometría y
// material. Toonizado + normalización a targetHeight (AC-4) reutilizando los
// helpers del pipeline HGSS; carga fallida ⇒ null (AC-5: cae a sprite/peón).
// Three puro (NO-VISION); los loaders se inyectan para testear en node.
import type { HgssFile } from '@liga/content'
import * as THREE from 'three'
import { NEUTRAL_MODEL_FALLBACK } from '../../theme/models'
import type { ModelLoaders } from './layer'
import { hgssModelUrl, hgssStarterModel } from './manifest'
import {
  mergeModelByMaterial, normalizeParts, toonizeModel,
  type MergedModelPart,
} from './normalize'

export interface StarterTemplate {
  readonly species: string
  readonly parts: readonly MergedModelPart[]
  readonly triangles: number
}

const trianglesOf = (geometry: THREE.BufferGeometry): number => {
  const index = geometry.getIndex()
  const count = index !== null ? index.count : (geometry.getAttribute('position')?.count ?? 0)
  return Math.ceil(count / 3)
}

/** Opciones de tuneo del modelo del inicial (pixelArt + color neutro). */
const tuneOptions = (file: HgssFile) => ({
  ...file.options,
  pixelArt: true,
  neutralColor: NEUTRAL_MODEL_FALLBACK,
  label: file.name,
})

/** Caché de plantillas por especie: una sola carga/parseo por inicial. */
export class StarterModelCache {
  private readonly loaders: ModelLoaders
  private readonly templates = new Map<string, Promise<StarterTemplate | null>>()

  constructor(loaders: ModelLoaders) {
    this.loaders = loaders
  }

  get size(): number {
    return this.templates.size
  }

  /** AC-4/AC-5/AC-7: plantilla de la especie (toonizada, altura normalizada);
   *  null si no hay entrada utilizable o la carga falla. Comparte la promesa. */
  templateFor(species: string): Promise<StarterTemplate | null> {
    const cached = this.templates.get(species)
    if (cached !== undefined) return cached
    const promise = (async (): Promise<StarterTemplate | null> => {
      const file = hgssStarterModel(species)
      if (file === null) return null
      try {
        const raw = await this.loaders.loadObj(hgssModelUrl(file), tuneOptions(file))
        toonizeModel(raw, tuneOptions(file))
        const parts = normalizeParts(mergeModelByMaterial(raw), file.targetHeight)
        return { species, parts, triangles: parts.reduce((sum, part) => sum + trianglesOf(part.geometry), 0) }
      } catch {
        return null
      }
    })()
    this.templates.set(species, promise)
    return promise
  }
}

/** Instancia por ficha (AC-7): mallas nuevas que comparten la geometría y el
 *  material de la plantilla — la misma plantilla sirve a varias fichas. */
export function starterModelInstance(template: StarterTemplate): THREE.Group {
  const group = new THREE.Group()
  group.name = 'starter:model'
  for (const part of template.parts) group.add(new THREE.Mesh(part.geometry, part.material))
  return group
}
