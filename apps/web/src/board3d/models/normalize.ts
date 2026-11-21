// normalize (SPEC-K/T-070d/AC-2/AC-3 + T-070e/AC-2/AC-3): normaliza un modelo
// (centrado en el piso con Box3 + escala a targetHeight), lo convierte a
// MeshToonMaterial conservando map/color (T-080) y fusiona mallas por
// material. Texturas HGSS: NearestFilter, sRGB, alphaTest + DoubleSide y
// opciones ignoreTextures/keepOriginalMaterial. Three puro (NO-VISION).
// T-086 (modelos negros): normales al cargar, textura caída ⇒ color neutro del
// kind (nunca negro) con advertencia, alphaTest solo si el material es
// realmente transparente y `map` siempre en sRGB.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { NEUTRAL_MODEL_FALLBACK } from '../../theme/models'
import { toonMaterial } from '../toon'

export interface ModelTuneOptions {
  /** Descarta mapas (texturas) y queda con el color base. */
  readonly ignoreTextures?: boolean
  /** No convertir a toon (deja el material original). */
  readonly keepOriginalMaterial?: boolean
  /** Texturas pintadas de DS (HGSS): NearestFilter + alphaTest + DoubleSide. */
  readonly pixelArt?: boolean
  /** AC-2 (T-086): color neutro del kind para materiales sin textura válida. */
  readonly neutralColor?: string
  /** AC-2 (T-086): nombre del modelo para la advertencia de textura fallida. */
  readonly label?: string
}

/** AC-1 (T-086): cada BufferGeometry sin atributo `normal` recibe
 *  `computeVertexNormals()` al cargar (una sola vez, antes de fusionar). */
export function ensureVertexNormals(root: THREE.Object3D): number {
  let fixed = 0
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    if (object.geometry.getAttribute('normal') === undefined) {
      object.geometry.computeVertexNormals()
      fixed += 1
    }
  })
  return fixed
}

/** ¿La textura tiene imagen ya cargada? (vacía ⇒ muestrea negro en WebGL). */
export function isTextureLoaded(texture: THREE.Texture | null): boolean {
  if (texture === null) return false
  const image = texture.image as { width?: number; data?: unknown } | null | undefined
  if (image === null || image === undefined) return false
  if (typeof image.width === 'number') return image.width > 0
  return image.data !== undefined
}

const isPureBlack = (color: THREE.Color): boolean =>
  color.r < 1e-4 && color.g < 1e-4 && color.b < 1e-4

/** AC-2 (T-086): un material sin textura cargada nunca queda negro puro —
 *  usa el color neutro del kind y avisa con el nombre del modelo. */
function neutralizeMaterial(material: THREE.Material, options: ModelTuneOptions, reason: string): void {
  ;(material as THREE.MeshStandardMaterial).map = null
  const current = (material as THREE.MeshStandardMaterial).color
  if (current !== undefined && isPureBlack(current)) {
    current.set(options.neutralColor ?? NEUTRAL_MODEL_FALLBACK)
  }
  console.warn(
    `[models] ${options.label ?? 'modelo'}: ${reason} — material con color neutro (${String(options.neutralColor ?? NEUTRAL_MODEL_FALLBACK)})`,
  )
}

/** AC-2: centra en el piso (Box3) y escala uniforme a targetHeight.
 *  AC-5 (T-089): si se pasa `maxFootprint`, la escala final es la menor entre
 *  la que cumple la altura objetivo y la que limita la huella (X/Z) a ese valor. */
export function normalizeModel(
  root: THREE.Object3D,
  targetHeight: number,
  maxFootprint?: number,
): THREE.Group {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const scaleHeight = size.y > 1e-6 ? targetHeight / size.y : 1
  const footprint = Math.max(size.x, size.z)
  const scaleFootprint =
    maxFootprint !== undefined && footprint > 1e-6 ? maxFootprint / footprint : Number.POSITIVE_INFINITY
  const scale = Math.min(scaleHeight, scaleFootprint)
  const center = box.getCenter(new THREE.Vector3())
  const wrap = new THREE.Group()
  wrap.name = 'model:normalized'
  root.position.set(-center.x, -box.min.y, -center.z)
  wrap.scale.setScalar(scale)
  wrap.add(root)
  return wrap
}

// N-0008: `kage` (sombra) solo como palabra del nombre de archivo (h_kage.png);
// suelto descartaba Hitokage_*.png, la textura de Charmander.
const isShadowMap = (name: string): boolean => /(_lm|(^|[_/\\])kage)/i.test(name)

/** T-070e/AC-2: texturas pixeladas de DS + transparencias recortables. */export function tuneHgssTexture(texture: THREE.Texture): void {
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.colorSpace = THREE.SRGBColorSpace
}

/**
 * AC-1/AC-2/AC-3/AC-5 (T-086) + T-070d/AC-3: normales al cargar, y recorre el
 * modelo convirtiendo cada malla a MeshToonMaterial conservando `map` (sRGB) y
 * `color`; descarta mapas caídos (⇒ color neutro del kind, nunca negro),
 * alphaTest solo si el material es realmente transparente, e ignoreTextures.
 */
export function toonizeModel(root: THREE.Object3D, options: ModelTuneOptions = {}): void {
  ensureVertexNormals(root)
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const wasArray = Array.isArray(object.material)
    const materials: readonly THREE.Material[] = wasArray ? object.material : [object.material]
    const converted = materials.map((material: THREE.Material) => {
      if (!(material instanceof THREE.MeshStandardMaterial) && !(material instanceof THREE.MeshPhongMaterial)) {
        return material
      }
      let map = material.map ?? null
      // AC-2: textura referenciada que nunca cargó ⇒ se descarta (si no,
      // WebGL muestrea una textura incompleta en negro).
      if (map !== null && !isTextureLoaded(map)) {
        neutralizeMaterial(material, options, `textura no cargada: ${map.name === '' ? '(sin nombre)' : map.name}`)
        map = null
      }
      const dropMap = options.ignoreTextures === true || (map !== null && isShadowMap(map.name))
      const keptMap = map !== null && !dropMap ? map : null
      // AC-3: el `map` que se conserva SIEMPRE es color ⇒ sRGB.
      if (keptMap !== null) {
        keptMap.colorSpace = THREE.SRGBColorSpace
        if (options.pixelArt === true) tuneHgssTexture(keptMap)
      }
      // AC-3: alphaTest solo si el material es realmente transparente
      // (declarado, opacidad < 1 o cutout del material original).
      const reallyTransparent =
        material.transparent === true || material.opacity < 1 || material.alphaTest > 0
      const alphaTest =
        material.alphaTest > 0 ? material.alphaTest : reallyTransparent ? 0.5 : 0
      if (options.keepOriginalMaterial === true) {
        if (keptMap === null) material.map = null
        material.transparent = false
        material.alphaTest = 0
        material.side = THREE.FrontSide
        return material
      }
      const toon = toonMaterial({
        // AC-5: sin textura cargada el color base nunca es negro puro.
        color: keptMap !== null || !isPureBlack(material.color)
          ? material.color.clone()
          : new THREE.Color(options.neutralColor ?? NEUTRAL_MODEL_FALLBACK),
        ...(keptMap !== null ? { map: keptMap } : {}),
      })
      // T-070e/AC-2: hojas/rejas con alfa recortadas (alphaTest, DoubleSide).
      if (keptMap !== null && (options.pixelArt === true || reallyTransparent)) {
        toon.transparent = false
        toon.alphaTest = alphaTest
        toon.side = reallyTransparent ? THREE.DoubleSide : THREE.FrontSide
      }
      material.dispose()
      return toon
    })
    object.material = wasArray ? converted : converted[0]!
  })
}

export interface MergedModelPart {
  readonly geometry: THREE.BufferGeometry
  readonly material: THREE.Material
}

/**
 * AC-2 (T-070d): normaliza en el lugar un conjunto de partes horneadas —
 * centra en x/z, apoya en y=0 y escala uniforme a targetHeight.
 * AC-5 (T-089) + SPEC-N/T-091/AC-6: si se pasa `maxFootprint`, la escala es la
 * menor entre la que cumple la altura objetivo y la que limita la huella (X/Z).
 */
export function normalizeParts(
  parts: readonly MergedModelPart[],
  targetHeight: number,
  maxFootprint?: number,
): readonly MergedModelPart[] {
  const box = new THREE.Box3()
  for (const part of parts) box.expandByObject(new THREE.Mesh(part.geometry))
  const size = box.getSize(new THREE.Vector3())
  const scaleHeight = size.y > 1e-6 ? targetHeight / size.y : 1
  const footprint = Math.max(size.x, size.z)
  const scaleFootprint =
    maxFootprint !== undefined && footprint > 1e-6 ? maxFootprint / footprint : Number.POSITIVE_INFINITY
  const scale = Math.min(scaleHeight, scaleFootprint)
  const center = box.getCenter(new THREE.Vector3())
  for (const part of parts) {
    part.geometry.translate(-center.x, -box.min.y, -center.z)
    part.geometry.scale(scale, scale, scale)
  }
  return parts
}

/**
 * AC-4 (T-070d): fusiona las mallas por material (bake de matrixWorld) para
 * instanciar repetidos con un draw call por material. Las mallas con grupos
 * multi-material no se fusionan (el drawRange del grupo no sobrevive al merge).
 */
export function mergeModelByMaterial(root: THREE.Object3D): readonly MergedModelPart[] {
  root.updateMatrixWorld(true)
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>()
  const parts: MergedModelPart[] = []
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const wasArray = Array.isArray(object.material)
    const materials: readonly THREE.Material[] = wasArray ? object.material : [object.material]
    materials.forEach((material: THREE.Material, slot: number) => {
      const geometry = object.geometry.clone()
      // Solo un mesh multi-material se parte por grupo (BoxGeometry trae grupos
      // aun con un solo material: ahí se fusiona completo).
      const group = wasArray
        ? object.geometry.groups.find(
            (entry: { start: number; count: number; materialIndex: number }) => entry.materialIndex === slot,
          )
        : undefined
      if (group !== undefined) {
        geometry.setDrawRange(group.start, group.count)
        geometry.clearGroups()
        parts.push({ geometry: geometry.applyMatrix4(object.matrixWorld), material })
        return
      }
      geometry.clearGroups()
      geometry.applyMatrix4(object.matrixWorld)
      const list = byMaterial.get(material) ?? []
      list.push(geometry)
      byMaterial.set(material, list)
    })
  })
  for (const [material, geometries] of byMaterial) {
    const merged =
      geometries.length === 1 ? geometries[0]! : mergeGeometries(geometries, false)
    if (merged === null) {
      for (const geometry of geometries) parts.push({ geometry, material })
      continue
    }
    parts.push({ geometry: merged, material })
  }
  return parts
}
