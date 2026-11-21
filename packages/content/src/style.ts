// Look del mundo (content/board/style.json, SPEC-J): fuente de verdad con
// precedencia sobre decor.json. T-078 valida `labels`; T-079 migró y validó
// world/biomes/distantMountains/sky/fog (terreno y horizonte rehechos);
// T-080 valida lighting (luces, toon, contornos) y profiles. T-081 agregará
// edgeProps/life/ambientFx. Chequeos cruzados puros: los consume validate.ts
// y los tests.
import { z } from 'zod'
import { NodeTypeSchema } from './board.ts'
import { DecorKindSchema } from './decor.ts'

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color hex #rrggbb')

/** Parámetros de las etiquetas 3D de nodos (SPEC-J/T-078). */
export const LabelsStyleSchema = z.object({
  /** Tamaño del texto en px de pantalla (mínimo legible 13, T-082/AC-3). */
  fontPx: z.number().min(13, 'fontPx mínimo 13 (legibilidad, T-082/AC-3)'),
  /** Contorno en px, relativo al texto. */
  outlinePx: z.number().min(0),
  /** Fundido de aparición/desaparición en ms. */
  fadeMs: z.number().min(0),
  /** Anti-colisión activada. */
  collision: z.boolean(),
  /** Recálculo de visibilidad/colisión por segundo (10 ⇒ cada 100 ms). */
  throttleHz: z.number().positive(),
  /** Tipos de nodo siempre visibles (p. ej. gimnasios). */
  alwaysShow: z.array(NodeTypeSchema),
  /** Distancia máxima del nodo a la ficha activa para mostrar la etiqueta. */
  showWithinTokenDistance: z.number().positive(),
  /** Distancia máxima de la cámara al nodo para mostrar etiquetas no always. */
  showOnlyIfCameraDistanceBelow: z.number().positive(),
  /** Orden de prioridad anti-colisión (menor índice gana); 'other' = resto. */
  priority: z.array(z.string().min(1)).min(1),
  /** true ⇒ el texto mide fontPx px en pantalla a cualquier distancia. */
  screenSpaceSize: z.boolean(),
})
export type LabelsStyle = z.infer<typeof LabelsStyleSchema>

/** Geometría del terreno (SPEC-J/T-079/AC-2..AC-3). */
export const WorldStyleSchema = z.object({
  /** Lado del mundo en unidades (terreno size×size centrado en el origen). */
  size: z.tuple([z.number().positive(), z.number().positive()]),
  /** Vértices por lado de la malla del terreno. */
  segments: z.number().int().min(2),
  /** Semilla del ruido base (determinista, sin Math.random). */
  seed: z.number().int(),
  noiseAmplitude: z.number().min(0),
  /** Colinas suaves fuera del tablero: altura 0 a startRadius, ≤ maxHeight. */
  hills: z.object({
    startRadius: z.number().positive(),
    maxHeight: z.number().positive(),
    seed: z.number().int(),
  }),
  /** Terreno plano a ≤ aroundNodes/aroundEdges de nodos y aristas. */
  flatten: z.object({
    aroundNodes: z.number().min(0),
    aroundEdges: z.number().min(0),
    smooth: z.number().min(0),
  }),
})
export type WorldStyle = z.infer<typeof WorldStyleSchema>

/** Biomas: el color de una zona solo domina cerca de su centro (T-079/AC-2). */
export const BiomesStyleSchema = z.object({
  /** Pasto base: color por defecto de todo el terreno. */
  baseGrass: HexColor,
  /** Radio (desde el centro de la zona) donde el color domina por completo. */
  radius: z.number().positive(),
  /** Distancia extra de funde con el pasto base (hasta radius + blend). */
  blend: z.number().positive(),
  /** Ruido de luminosidad por vértice (± fracción, 0,06 ⇒ ±6 %). */
  lightnessNoise: z.number().min(0).max(0.2),
  /** Tope de vértices que un bioma puede dominar (AC-6). */
  maxShare: z.number().positive().max(1),
  /** Color por zona (borde → color dominante cerca del centro). */
  colors: z.record(z.string().min(1), HexColor),
})
export type BiomesStyle = z.infer<typeof BiomesStyleSchema>

/** Anillos de montañas lejanas (T-079/AC-4). */
export const MountainRingStyleSchema = z.object({
  count: z.number().int().min(0),
  radius: z.number().positive(),
  height: z.tuple([z.number().positive(), z.number().positive()]),
  color: HexColor,
  snow: z.boolean(),
})
export type MountainRingStyle = z.infer<typeof MountainRingStyleSchema>

export const DistantMountainsStyleSchema = z.object({
  rings: z.array(MountainRingStyleSchema).min(1),
  seed: z.number().int(),
})
export type DistantMountainsStyle = z.infer<typeof DistantMountainsStyleSchema>

/** Cielo y nubes (colores de fondo migrados de decor.ambient, T-079/AC-1). */
export const SkyStyleSchema = z.object({
  top: HexColor,
  horizon: HexColor,
  sunDisk: z.boolean(),
  clouds: z.object({
    count: z.number().int().min(0),
    height: z.number().positive(),
    speed: z.number().min(0),
    seed: z.number().int(),
  }),
})
export type SkyStyle = z.infer<typeof SkyStyleSchema>

export const FogStyleSchema = z.object({
  color: HexColor,
  near: z.number().positive(),
  far: z.number().positive(),
})
export type FogStyle = z.infer<typeof FogStyleSchema>

/** Anillo de arbolado entre el borde del tablero y las colinas (T-079/AC-5). */
export const TreeRingStyleSchema = z.object({
  innerRadius: z.number().positive(),
  outerRadius: z.number().positive(),
  count: z.number().int().min(0),
  seed: z.number().int(),
})
export type TreeRingStyle = z.infer<typeof TreeRingStyleSchema>

/** Mapeos de toneMapping de three (style.json → THREE.ToneMapping). */
export const ToneMappingSchema = z.enum(['Linear', 'Reinhard', 'Cineon', 'ACESFilmic', 'Neutral'])
export type ToneMapping = z.infer<typeof ToneMappingSchema>

/** Luz y materiales cartoon (SPEC-J/T-080). */
export const LightingStyleSchema = z.object({
  /** Luz hemisférica: cielo/suelo tintan el ambiente (AC-2). */
  hemisphere: z.object({
    sky: HexColor,
    ground: HexColor,
    intensity: z.number().positive(),
  }),
  /** Sol direccional cálida con sombras que siguen a la ficha (AC-2). */
  directional: z.object({
    color: HexColor,
    intensity: z.number().positive(),
    /** Dirección DESDE la que llega la luz (y > 0: siempre desde arriba). */
    from: z.tuple([z.number().finite(), z.number().positive(), z.number().finite()]),
    /** Resolución del mapa de sombra (potencia de 2). */
    shadowMapSize: z.union([
      z.literal(512), z.literal(1024), z.literal(2048), z.literal(4096),
    ]),
    /** Radio (u) alrededor del objetivo que cubre la cámara de sombra. */
    shadowRadiusAroundTarget: z.number().positive(),
  }),
  /** Material toon: escalones del mapa de degradado (AC-1). */
  toon: z.object({ steps: z.number().int().min(2).max(8) }),
  toneMapping: ToneMappingSchema,
  exposure: z.number().positive(),
  /** Contorno de piezas (Outlines, AC-4): solo onlyKinds, tope maxMeshes. */
  outlines: z.object({
    enabled: z.boolean(),
    thickness: z.number().positive(),
    color: HexColor,
    maxMeshes: z.number().int().positive(),
    onlyKinds: z.array(DecorKindSchema).min(1),
  }),
  /** Sombras de contacto suaves bajo edificios y árboles (AC-2). */
  contactShadows: z.object({
    radius: z.number().positive(),
    opacity: z.number().min(0).max(1),
  }),
})
export type LightingStyle = z.infer<typeof LightingStyleSchema>

/** Perfil de rendimiento (SPEC-J/T-080/AC-5..AC-6; T-081 escala life/ambientFx). */
export const ProfileStyleSchema = z.object({
  /** Rango de device pixel ratio [mín, máx]. */
  dpr: z.tuple([z.number().min(1), z.number().min(1)]),
  shadows: z.boolean(),
  outlines: z.boolean(),
  /** Multiplicadores que T-081 consume (0 < x ≤ 1). */
  life: z.number().gt(0).max(1),
  ambientFx: z.number().gt(0).max(1),
  propDensity: z.number().gt(0).max(1),
  maxDrawCalls: z.number().int().positive(),
  maxTriangles: z.number().int().positive(),
})
export type ProfileStyle = z.infer<typeof ProfileStyleSchema>

export const ProfilesStyleSchema = z.object({
  high: ProfileStyleSchema,
  low: ProfileStyleSchema,
})
export type ProfilesStyle = z.infer<typeof ProfilesStyleSchema>

export const BoardStyleSchema = z.object({
  _status: z.string().optional(),
  world: WorldStyleSchema,
  biomes: BiomesStyleSchema,
  distantMountains: DistantMountainsStyleSchema,
  sky: SkyStyleSchema,
  fog: FogStyleSchema,
  treeRing: TreeRingStyleSchema,
  labels: LabelsStyleSchema,
  lighting: LightingStyleSchema,
  profiles: ProfilesStyleSchema,
})
export type BoardStyle = z.infer<typeof BoardStyleSchema>

/**
 * Chequeos cruzados de style.json (SPEC-J/T-078 + T-079): labels (priority sin
 * duplicados y con fallback 'other', alwaysShow con rank, throttles con
 * sentido) y mundo (niebla, anillos de montañas crecientes, biomas y arbolado
 * dentro del mundo).
 */
export function crossCheckStyle(style: BoardStyle): string[] {
  const errors: string[] = []
  const labels = style.labels
  const unique = new Set(labels.priority)
  if (unique.size !== labels.priority.length) {
    errors.push('content/board/style.json: labels.priority debe ir sin duplicados')
  }
  if (!unique.has('other')) {
    errors.push("content/board/style.json: labels.priority debería incluir 'other' como fallback")
  }
  for (const type of labels.alwaysShow) {
    if (!unique.has(type)) {
      errors.push(`content/board/style.json: labels.alwaysShow "${type}" no está en labels.priority`)
    }
  }
  if (labels.throttleHz > 30) {
    errors.push('content/board/style.json: labels.throttleHz no debería pasar de 30 (costo por frame)')
  }
  if (labels.fadeMs > 600) {
    errors.push('content/board/style.json: labels.fadeMs no debería pasar de 600 ms')
  }

  if (style.fog.far <= style.fog.near) {
    errors.push('content/board/style.json: fog.far debería superar a fog.near')
  }
  if (style.world.size[0] !== style.world.size[1]) {
    errors.push('content/board/style.json: world.size debería ser cuadrado [lado, lado]')
  }
  if (Object.keys(style.biomes.colors).length === 0) {
    errors.push('content/board/style.json: biomes.colors debería traer al menos una zona')
  }
  let prevRadius = 0
  style.distantMountains.rings.forEach((ring, index) => {
    const [hMin, hMax] = ring.height
    if (hMin >= hMax) {
      errors.push(`content/board/style.json: distantMountains.rings[${String(index)}].height debe ser [mín, máx] creciente`)
    }
    if (ring.radius <= prevRadius) {
      errors.push(`content/board/style.json: distantMountains.rings[${String(index)}].radius debería superar al anillo anterior`)
    }
    prevRadius = ring.radius
  })
  const halfSide = style.world.size[0] / 2
  if (style.treeRing.innerRadius >= style.treeRing.outerRadius) {
    errors.push('content/board/style.json: treeRing.innerRadius debería ser menor que outerRadius')
  }
  if (style.treeRing.outerRadius > halfSide) {
    errors.push('content/board/style.json: treeRing.outerRadius no debería salirse del mundo (world.size/2)')
  }
  if (style.treeRing.innerRadius <= style.biomes.radius + style.biomes.blend) {
    errors.push('content/board/style.json: treeRing.innerRadius debería quedar fuera de los biomas (biomes.radius + blend)')
  }

  // T-080: luces, contornos y perfiles (AC-4/AC-5).
  const outlineKinds = new Set(style.lighting.outlines.onlyKinds)
  if (outlineKinds.size !== style.lighting.outlines.onlyKinds.length) {
    errors.push('content/board/style.json: lighting.outlines.onlyKinds debería ir sin duplicados')
  }
  for (const [name, profile] of [['high', style.profiles.high], ['low', style.profiles.low]] as const) {
    if (profile.dpr[0] > profile.dpr[1]) {
      errors.push(`content/board/style.json: profiles.${name}.dpr debería ser [mín, máx]`)
    }
  }
  // AC-5: el perfil bajo es sin sombras ni contornos y con dpr fijado en 1.
  if (style.profiles.low.dpr[1] !== 1) {
    errors.push('content/board/style.json: profiles.low.dpr debería ser [1, 1] (perfil bajo)')
  }
  if (style.profiles.low.shadows) {
    errors.push('content/board/style.json: profiles.low.shadows debería ser false (sin sombras)')
  }
  if (style.profiles.low.outlines) {
    errors.push('content/board/style.json: profiles.low.outlines debería ser false (sin contornos)')
  }
  if (style.profiles.low.maxDrawCalls > style.profiles.high.maxDrawCalls) {
    errors.push('content/board/style.json: profiles.low.maxDrawCalls no debería superar al de high')
  }
  if (style.profiles.low.maxTriangles > style.profiles.high.maxTriangles) {
    errors.push('content/board/style.json: profiles.low.maxTriangles no debería superar al de high')
  }
  return errors
}
