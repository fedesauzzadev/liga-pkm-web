// models-format (SPEC-K/T-070): lectura de .glb (chunk JSON, sin librerías)
// y de .obj/.mtl de HGSS (T-070e/AC-1). Solo Node (node:fs); lo consumen los
// tools models-scan/suggest/import/new. Sin dependencias nuevas.
// T-091/AC-1: además, la detección pura de los modelos nuevos en assets-src/new/.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface GlbStats {
  readonly triangles: number
  readonly bboxMin: readonly [number, number, number]
  readonly bboxMax: readonly [number, number, number]
}

const GLB_MAGIC = 0x46546c67
const CHUNK_JSON = 0x4e4f534a

interface GltfAccessor {
  readonly count?: number
  readonly min?: number[]
  readonly max?: number[]
}
interface GltfPrimitive {
  readonly attributes?: { readonly POSITION?: number }
  readonly indices?: number
}
interface GltfMaterial {
  readonly name?: string
  readonly pbrMetallicRoughness?: {
    readonly baseColorFactor?: readonly number[]
    readonly baseColorTexture?: unknown
  }
}
interface GltfDoc {
  readonly meshes?: { readonly primitives?: readonly GltfPrimitive[] }[]
  readonly accessors?: readonly GltfAccessor[]
  readonly materials?: readonly GltfMaterial[]
}

/** Parsea el chunk JSON de un GLB y suma triángulos + bbox de POSITION. */
export function glbStatsOf(bytes: Uint8Array): GlbStats {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error('no es un GLB v2 (magic inválido)')
  }
  const chunkLength = view.getUint32(12, true)
  const chunkType = view.getUint32(16, true)
  if (chunkType !== CHUNK_JSON) throw new Error('el primer chunk del GLB no es JSON')
  const jsonText = new TextDecoder().decode(bytes.subarray(20, 20 + chunkLength))
  const doc = JSON.parse(jsonText) as GltfDoc
  const accessors = doc.accessors ?? []

  let triangles = 0
  let min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
  let max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
  const fold = (accessor: GltfAccessor | undefined): void => {
    if (accessor?.min === undefined || accessor.max === undefined) return
    for (let axis = 0; axis < 3; axis += 1) {
      const lo = accessor.min[axis]
      const hi = accessor.max[axis]
      if (typeof lo === 'number' && lo < (min[axis] ?? Number.POSITIVE_INFINITY)) {
        const next: [number, number, number] = [...min]
        next[axis] = lo
        min = next
      }
      if (typeof hi === 'number' && hi > (max[axis] ?? Number.NEGATIVE_INFINITY)) {
        const next: [number, number, number] = [...max]
        next[axis] = hi
        max = next
      }
    }
  }
  for (const mesh of doc.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const position = primitive.attributes?.POSITION
      if (position === undefined) continue
      if (primitive.indices !== undefined) triangles += Math.ceil((accessors[primitive.indices]?.count ?? 0) / 3)
      else triangles += Math.ceil((accessors[position]?.count ?? 0) / 3)
      fold(accessors[position])
    }
  }
  return { triangles, bboxMin: min, bboxMax: max }
}

export interface ObjStats {
  readonly triangles: number
  readonly bboxMin: readonly [number, number, number]
  readonly bboxMax: readonly [number, number, number]
  /** map_Kd declarados en el .mtl (nombres tal cual). */
  readonly textureRefs: readonly string[]
}

/** Parsea un .obj: triángulos (cuadriláteros y n-gonos triangulados), bbox y mtllib. */
export function parseObj(text: string): { triangles: number; min: [number, number, number]; max: [number, number, number]; mtllibs: string[] } {
  let triangles = 0
  let min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
  let max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
  const mtllibs: string[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith('v ')) {
      const parts = line.split(/\s+/).slice(1, 4).map(Number)
      for (let axis = 0; axis < 3; axis += 1) {
        const value = parts[axis]
        if (value === undefined || !Number.isFinite(value)) continue
        if (value < (min[axis] ?? Number.POSITIVE_INFINITY)) {
          const next: [number, number, number] = [...min]
          next[axis] = value
          min = next
        }
        if (value > (max[axis] ?? Number.NEGATIVE_INFINITY)) {
          const next: [number, number, number] = [...max]
          next[axis] = value
          max = next
        }
      }
    } else if (line.startsWith('f ')) {
      const verts = line.split(/\s+/).slice(1).filter((token) => token.length > 0)
      triangles += Math.max(1, verts.length - 2)
    } else if (line.startsWith('mtllib ')) {
      const name = line.slice('mtllib '.length).trim()
      if (name.length > 0) mtllibs.push(name)
    }
  }
  return { triangles, min, max, mtllibs }
}

/** Estadísticas de un .obj + su .mtl (texturas referenciadas, T-070e/AC-1). */
export function objStatsOf(objPath: string, objText: string): ObjStats {
  const parsed = parseObj(objText)
  const dir = join(objPath, '..')
  const textureRefs: string[] = []
  for (const mtllib of parsed.mtllibs) {
    let mtlText: string | null = null
    try {
      mtlText = readFileSync(join(dir, mtllib), 'utf8')
    } catch {
      continue
    }
    for (const rawLine of mtlText.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (line.startsWith('map_Kd ')) {
        const ref = line.split(/\s+/).pop() ?? ''
        if (ref.length > 0) textureRefs.push(ref.replace(/\\/g, '/'))
      }
    }
  }
  return { triangles: parsed.triangles, bboxMin: parsed.min, bboxMax: parsed.max, textureRefs }
}

/** Bytes de un directorio de modelo OBJ: .obj + .mtl + .png hermanos (AC-1). */
export function objDirSizeBytes(objPath: string): number {
  const dir = join(objPath, '..')
  let total = statSync(objPath).size
  for (const name of readdirSync(dir)) {
    if (name === objPath.split(/[\\/]/).pop()) continue
    if (/\.(mtl|png)$/i.test(name)) total += statSync(join(dir, name)).size
  }
  return total
}

/** Nombres de archivo .png/.mtl presentes en el directorio del .obj. */
export function objSiblingFiles(objPath: string): readonly string[] {
  return readdirSync(join(objPath, '..')).filter((name) => /\.(png|mtl)$/i.test(name))
}

export const glbBytesOf = (path: string): Uint8Array => new Uint8Array(readFileSync(path))

/** Normaliza para comparar: minúsculas, sin acentos, solo [a-z0-9]. */
export const foldName = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export const KB_OF = (bytes: number): number => Math.round((bytes / 1024) * 10) / 10

export interface GlbMaterialInfo {
  readonly name: string
  /** Tiene textura baseColor (embebida o externa): no puede quedar negro. */
  readonly hasTexture: boolean
  /** baseColorFactor RGB (default [1,1,1] si el material no lo trae). */
  readonly color: readonly [number, number, number]
}

/** Materiales del chunk JSON de un GLB/.gltf: textura baseColor y color base.
 *  SPEC-N/T-091/AC-6: para verificar que ningún material queda negro puro. */
export function glbMaterialsOf(bytes: Uint8Array): readonly GlbMaterialInfo[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const isGlb = bytes.byteLength >= 20 && view.getUint32(0, true) === GLB_MAGIC
  let jsonText: string
  if (isGlb) {
    const chunkLength = view.getUint32(12, true)
    const chunkType = view.getUint32(16, true)
    if (chunkType !== CHUNK_JSON) throw new Error('el primer chunk del GLB no es JSON')
    jsonText = new TextDecoder().decode(bytes.subarray(20, 20 + chunkLength))
  } else {
    jsonText = new TextDecoder().decode(bytes)
  }
  const doc = JSON.parse(jsonText) as GltfDoc
  return (doc.materials ?? []).map((material, index) => {
    const pbr = material.pbrMetallicRoughness
    const factor = pbr?.baseColorFactor ?? [1, 1, 1, 1]
    return {
      name: material.name ?? `material-${String(index)}`,
      hasTexture: pbr?.baseColorTexture !== undefined,
      color: [factor[0] ?? 1, factor[1] ?? 1, factor[2] ?? 1] as const,
    }
  })
}

// ── Modelos nuevos (SPEC-N/T-091/AC-1) ──────────────────────────────────────

/** Formatos admitidos para los modelos nuevos (AC-1). */
export const NEW_MODEL_EXTENSIONS = ['glb', 'gltf', 'obj', 'fbx'] as const
export type NewModelExtension = (typeof NEW_MODEL_EXTENSIONS)[number]

export interface DetectedNewModel {
  /** Nombre del archivo dentro del directorio fuente (con extensión). */
  readonly file: string
  readonly format: NewModelExtension
}

const suffixRe = /^_(\d+)$/

/**
 * AC-1: detecta los archivos de los modelos nuevos por nombre base
 * (`gim.*`, `pokecenter.*`, `pokemart.*`, `league.*`; admite sufijos como
 * `gim_01`) con extensión .glb/.gltf/.obj/.fbx. Determinista: prefiere el
 * nombre exacto, luego el más corto y en último lugar el orden lexicográfico.
 * Devuelve por kind (clave de `placements.models.files`); los que no aparecen
 * quedan ausentes del resultado.
 */
export function detectNewModelFiles(
  names: readonly string[],
  files: Readonly<Record<string, string>>,
): Readonly<Record<string, DetectedNewModel>> {
  const byLower = [...names].sort().filter((name) => !name.startsWith('.'))
  const result: Record<string, DetectedNewModel> = {}
  for (const [kind, base] of Object.entries(files)) {
    const wanted = base.toLowerCase()
    const matches: { name: string; exact: boolean }[] = []
    for (const name of byLower) {
      const dot = name.lastIndexOf('.')
      if (dot <= 0) continue
      const ext = name.slice(dot + 1).toLowerCase()
      if (!(NEW_MODEL_EXTENSIONS as readonly string[]).includes(ext)) continue
      const stem = name.slice(0, dot).toLowerCase()
      const exact = stem === wanted
      const suffixed = stem.startsWith(wanted) && suffixRe.test(stem.slice(wanted.length))
      if (!exact && !suffixed) continue
      matches.push({ name, exact })
    }
    if (matches.length === 0) continue
    matches.sort((a, b) =>
      a.exact === b.exact ? a.name.localeCompare(b.name) : a.exact ? -1 : 1,
    )
    const chosen = matches[0]!
    result[kind] = {
      file: chosen.name,
      format: chosen.name.slice(chosen.name.lastIndexOf('.') + 1).toLowerCase() as NewModelExtension,
    }
  }
  return result
}

/** T-086/AC-2 (movido de models-import): rutas relativas (images[].uri) de las
 *  texturas externas que un .glb o .gltf referencia (las embebidas no cuentan). */
export function glbExternalImages(glbPath: string): readonly string[] {
  const buffer = readFileSync(glbPath)
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546c67) {
    // .gltf: JSON de texto con la misma forma images[].uri.
    try {
      const doc = JSON.parse(buffer.toString('utf8')) as { images?: { uri?: string }[] }
      return (doc.images ?? []).map((image) => image.uri ?? '').filter((uri) => uri !== '' && !uri.startsWith('data:'))
    } catch {
      return []
    }
  }
  const jsonLength = buffer.readUInt32LE(12)
  const json = buffer.subarray(20, 20 + jsonLength).toString('utf8')
  try {
    const parsed = JSON.parse(json) as { images?: { uri?: string }[] }
    return (parsed.images ?? [])
      .map((image) => image.uri ?? '')
      .filter((uri) => uri !== '' && !uri.startsWith('data:'))
  } catch {
    return []
  }
}
