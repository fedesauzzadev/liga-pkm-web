// Mundo continuo (SPEC-H/T-069, rehecho en SPEC-J/T-079): terreno con biomas
// acotados, colinas fuera del tablero, cielo, nubes y niebla. Three puro (sin
// R3F ni DOM) para verificar numéricamente en node (NO-VISION); los números
// vienen de content/board/style.json (world/biomes/sky/fog). Las montañas
// lejanas y el anillo de arbolado viven en horizon.ts. Ruido determinista por
// semilla (sin Math.random).
import type { BoardStyle, Decor } from '@liga/content'
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'
import { buildBiomeTexture } from './biome-texture'
import { buildDistantMountains, buildTreeRing } from './horizon'
import { smoothstep } from './smooth'
import type { WorldPos } from './scene'

export interface WorldBiome {
  readonly key: string
  readonly center: WorldPos
  readonly ground: string
}

export interface WorldNodePoint {
  readonly id: string
  readonly x: number
  readonly z: number
}

export interface WorldEdgeSegment {
  readonly a: WorldPos
  readonly b: WorldPos
}

export interface WorldInput {
  readonly decor: Decor
  /** Look del mundo (SPEC-J/T-079): style.json manda sobre lo que fue decor. */
  readonly style: BoardStyle
  readonly nodes: readonly WorldNodePoint[]
  readonly edges: readonly WorldEdgeSegment[]
  readonly biomes: readonly WorldBiome[]
  /**
   * SPEC-O/T-095/AC-3: cuerpo de agua de la zona del lago según el plan de
   * ocupación (posición con más espacio libre del panel + radio 0,8..1,3).
   * null ⇒ el estanque no entró y se omite; undefined ⇒ legacy (centro del
   * panel de la zona, radio de tema) para inputs armados a mano en tests.
   */
  readonly lake?: { readonly x: number; readonly z: number; readonly radius: number } | null
}

export interface WorldScene {
  readonly root: THREE.Group
  readonly terrain: THREE.Mesh
  /** T-096/AC-2: tinte de zona por textura de bioma (1024², lineal, sRGB). */
  readonly biomeTexture: THREE.DataTexture
  readonly water: THREE.Mesh | null
  readonly sky: THREE.Mesh
  /** T-080/AC-3: disco solar sobre el domo (null si sky.sunDisk es false). */
  readonly sunDisk: THREE.Mesh | null
  readonly mountains: THREE.Group
  /** Anillo de arbolado entre el borde del tablero y las colinas (AC-5). */
  readonly treeRing: THREE.Group
  readonly clouds: THREE.Group
  readonly fog: THREE.Fog
  /** Media extensión del mundo (size/2): límite de deriva de nubes. */
  readonly halfSpan: number
}

// ── Ruido determinista (hash entero + interpolación suave) ──────────────────

const hash2 = (ix: number, iz: number, seed: number): number => {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 2246822519)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

const fade = (t: number): number => t * t * (3 - 2 * t)

export function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = fade(x - ix)
  const fz = fade(z - iz)
  const a = hash2(ix, iz, seed)
  const b = hash2(ix + 1, iz, seed)
  const c = hash2(ix, iz + 1, seed)
  const d = hash2(ix + 1, iz + 1, seed)
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz
}

/** Dos octavas de baja frecuencia, centrado en 0 (ruido suave). */
const fbm = (x: number, z: number, seed: number): number =>
  0.65 * valueNoise(x * 0.16, z * 0.16, seed) +
  0.35 * valueNoise(x * 0.37 + 19.3, z * 0.37 + 7.7, seed ^ 0x9e37) -
  0.5

export { smoothstep } from './smooth'

export const distToSegment = (px: number, pz: number, a: WorldPos, b: WorldPos): number => {
  const abx = b.x - a.x
  const abz = b.z - a.z
  const len2 = abx * abx + abz * abz
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - a.x) * abx + (pz - a.z) * abz) / len2))
  return Math.hypot(px - (a.x + abx * t), pz - (a.z + abz * t))
}

const gaussian = (x: number, z: number, center: WorldPos, sigma: number): number => {
  const d2 = (x - center.x) ** 2 + (z - center.z) ** 2
  return Math.exp(-d2 / (2 * sigma * sigma))
}

/** 1 cerca de nodos/aristas/pedestales se aplana con smoothstep (AC-3). */
export function flattenMask(x: number, z: number, input: WorldInput): number {
  const f = input.style.world.flatten
  let dNodes = Number.POSITIVE_INFINITY
  for (const node of input.nodes) {
    const d = Math.hypot(x - node.x, z - node.z)
    if (d < dNodes) dNodes = d
  }
  let dEdges = Number.POSITIVE_INFINITY
  for (const edge of input.edges) {
    const d = distToSegment(x, z, edge.a, edge.b)
    if (d < dEdges) dEdges = d
  }
  // Los pedestales de mazo (centros de bioma) se tratan como nodos.
  for (const biome of input.biomes) {
    const d = Math.hypot(x - biome.center.x, z - biome.center.z)
    if (d < dNodes) dNodes = d
  }
  const maskNodes = smoothstep(f.aroundNodes, f.aroundNodes + f.smooth, dNodes)
  const maskEdges = smoothstep(f.aroundEdges, f.aroundEdges + f.smooth, dEdges)
  return Math.min(maskNodes, maskEdges)
}

/**
 * AC-3: colinas suaves fuera del tablero — altura 0 hasta hills.startRadius,
 * de ahí al borde del mundo crece hasta hills.maxHeight (siempre ≥ 0).
 */
export function hillsHeightAt(x: number, z: number, style: BoardStyle): number {
  const { hills, size } = style.world
  const r = Math.hypot(x, z)
  const ramp = smoothstep(hills.startRadius, size[0] / 2, r)
  return Math.max(0, ramp * (0.5 + fbm(x, z, hills.seed)) * hills.maxHeight)
}

/** AC-1/AC-3: alto del terreno en (x, z) — ruido × máscara, lago, relieve y colinas. */
export function terrainHeightAt(x: number, z: number, input: WorldInput): number {
  const world = input.style.world
  let height = fbm(x, z, world.seed) * 2 * world.noiseAmplitude

  const relief = input.biomes.find((biome) => biome.key === BOARD3D.world.relief.zone)
  if (relief !== undefined) {
    const g = gaussian(x, z, relief.center, input.style.biomes.radius)
    height *= 1 + BOARD3D.world.relief.boost * g
  }

  const lake = input.biomes.find((biome) => biome.key === BOARD3D.world.lake.zone)
  if (lake !== undefined) {
    // T-095/AC-3: centro/radio del plan cuando existe; legacy si no hay plan.
    const center = input.lake ?? lake.center
    const radius = input.lake?.radius ?? BOARD3D.world.lake.radius
    const d = Math.hypot(x - center.x, z - center.z)
    const inner = radius * BOARD3D.world.lake.innerRatio
    const outer = radius
    height -= BOARD3D.world.lake.depth * (1 - smoothstep(inner, outer, d))
  }

  // Dentro del tablero (r < startRadius) las colinas aportan 0.
  return height * flattenMask(x, z, input) + hillsHeightAt(x, z, input.style)
}

export interface BiomeWeights {
  /** Peso (> 0) de cada bioma en (x, z); vacío ⇒ pasto base puro. */
  readonly weights: readonly { readonly biome: WorldBiome; readonly weight: number }[]
  /** Suma de pesos sin normalizar (0 ⇒ sin influencia de biomas). */
  readonly total: number
}

/**
 * AC-2: peso de cada bioma — domina (1) a menos de biomes.radius del centro de
 * su zona y se funde con el pasto base en biomes.blend (0 en radius + blend).
 */
export function biomeWeightsAt(x: number, z: number, input: WorldInput): BiomeWeights {
  const { radius, blend } = input.style.biomes
  const weights: { biome: WorldBiome; weight: number }[] = []
  let total = 0
  for (const biome of input.biomes) {
    const d = Math.hypot(x - biome.center.x, z - biome.center.z)
    const weight = 1 - smoothstep(radius, radius + blend, d)
    if (weight <= 1e-4) continue
    weights.push({ biome, weight })
    total += weight
  }
  return { weights, total }
}

/** AC-2/T-096: color de suelo — biomas acotados sobre el pasto base (lo muestrea la textura). */
export function terrainColorAt(x: number, z: number, input: WorldInput, out: THREE.Color): THREE.Color {
  const base = new THREE.Color(input.style.biomes.baseGrass)
  const { weights, total } = biomeWeightsAt(x, z, input)
  const mix = new THREE.Color(0, 0, 0)
  for (const entry of weights) {
    const color = new THREE.Color(entry.biome.ground)
    const share = entry.weight / total
    mix.r += color.r * share
    mix.g += color.g * share
    mix.b += color.b * share
  }
  // La mezcla de biomas reemplaza al pasto base solo donde hay peso.
  return out.copy(base).lerp(mix, Math.min(1, total))
}

/**
 * AC-3/T-088: variación orgánica — ruido de luminosidad en ±lightnessNoise
 * (0,06 ⇒ ±6 %), determinista por posición: valueNoise interpolado de baja
 * frecuencia (sin escalones; T-096 lo hornea en la textura de bioma).
 */
export function lightnessAt(x: number, z: number, style: BoardStyle): number {
  const seed = (style.world.seed ^ 0x51ab) | 0
  const freq = BOARD3D.world.lightnessFreq
  return (valueNoise(x * freq, z * freq, seed) - 0.5) * 2 * style.biomes.lightnessNoise
}

/** T-096: color de suelo (biomas × luz) que la textura de bioma muestrea. */
const sampleGroundColor = (x: number, z: number, input: WorldInput, out: THREE.Color): void => {
  terrainColorAt(x, z, input, out)
  const k = 1 + lightnessAt(x, z, input.style)
  out.setRGB(Math.min(1, out.r * k), Math.min(1, out.g * k), Math.min(1, out.b * k))
}

const standard = (color: string | THREE.Color, extra?: Partial<THREE.MeshStandardMaterialParameters>) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, ...extra })

// ── Piezas del mundo ────────────────────────────────────────────────────────

function buildTerrainMesh(input: WorldInput, biomeTexture: THREE.Texture): THREE.Mesh {
  const { size, segments } = input.style.world
  const geometry = new THREE.PlaneGeometry(size[0], size[1], segments, segments)
  geometry.rotateX(-Math.PI / 2)
  const position = geometry.attributes.position as THREE.BufferAttribute
  for (let index = 0; index < position.count; index += 1) {
    position.setY(index, terrainHeightAt(position.getX(index), position.getZ(index), input))
  }
  geometry.computeVertexNormals()
  // T-096/AC-1: el tinte de zona es el suelo mismo (textura opaca, sin color por vértice).
  const mesh = new THREE.Mesh(geometry, standard('#ffffff', { map: biomeTexture }))
  mesh.name = 'terrain'
  return mesh
}

function buildWaterMesh(
  biome: WorldBiome,
  decor: Decor,
  lake: { readonly x: number; readonly z: number; readonly radius: number },
): THREE.Mesh {
  const theme = BOARD3D.world.lake
  const radius = lake.radius * theme.waterRadiusRatio
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 24),
    new THREE.MeshStandardMaterial({
      color: decor.palette.water ?? '#4F8FD6',
      transparent: true,
      opacity: theme.waterOpacity,
      roughness: 0.3,
      metalness: 0,
    }),
  )
  mesh.name = `water:${biome.key}`
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(lake.x, theme.waterLift, lake.z)
  return mesh
}

/** Domo con degradado por vértice (sky.top/horizon), sin niebla. */
function buildSkyMesh(style: BoardStyle, radius: number): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(
    radius,
    BOARD3D.world.sky.widthSegments,
    BOARD3D.world.sky.heightSegments,
  )
  const position = geometry.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(position.count * 3)
  const bottom = new THREE.Color(style.sky.horizon)
  const top = new THREE.Color(style.sky.top)
  const color = new THREE.Color()
  for (let index = 0; index < position.count; index += 1) {
    const t = Math.min(1, Math.max(0, position.getY(index) / radius / 2 + 0.5))
    color.copy(bottom).lerp(top, t)
    colors[index * 3] = color.r
    colors[index * 3 + 1] = color.g
    colors[index * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
  )
  mesh.name = 'sky'
  mesh.renderOrder = -1
  return mesh
}

/** T-080/AC-3: disco solar cálido en la dirección del sol (sin niebla). */
function buildSunDisk(style: BoardStyle): THREE.Mesh | null {
  if (!style.sky.sunDisk) return null
  const from = new THREE.Vector3(...style.lighting.directional.from).normalize()
  const radius = BOARD3D.world.sky.radius
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(2.4, 24),
    new THREE.MeshBasicMaterial({
      color: style.lighting.directional.color,
      fog: false,
      depthWrite: false,
    }),
  )
  mesh.name = 'sunDisk'
  mesh.position.copy(from).multiplyScalar(radius * 0.9)
  mesh.lookAt(0, 0, 0)
  mesh.renderOrder = -0.5
  return mesh
}

/** Nubes low-poly con deriva (las mueve Ambient); config de style.sky.clouds. */
function buildClouds(style: BoardStyle): THREE.Group {
  const group = new THREE.Group()
  group.name = 'clouds'
  const { count, height, seed } = style.sky.clouds
  const material = standard(BOARD3D.world.cloud.color, { roughness: 1 })
  const halfSpan = style.world.size[0] / 2 - 4
  for (let index = 0; index < count; index += 1) {
    const cloud = new THREE.Group()
    cloud.name = `cloud:${index}`
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(BOARD3D.world.cloud.size, 0), material)
    puff.scale.set(BOARD3D.world.cloud.stretch, BOARD3D.world.cloud.squash, 1)
    puff.name = 'puff'
    cloud.add(puff)
    const rx = hash2(index, 11, seed)
    const rz = hash2(index, 12, seed)
    const ry = hash2(index, 13, seed)
    cloud.position.set((rx * 2 - 1) * halfSpan, height + (ry - 0.5), (rz * 2 - 1) * halfSpan)
    cloud.userData.speedMul = 0.7 + 0.6 * hash2(index, 14, seed)
    cloud.userData.baseY = cloud.position.y
    group.add(cloud)
  }
  return group
}

/** AC-1..AC-5: el mundo continuo completo (terreno, agua, cielo, horizonte). */
export function buildWorld(input: WorldInput): WorldScene {
  const root = new THREE.Group()
  root.name = 'world'

  const biomeTexture = buildBiomeTexture({
    worldSize: input.style.world.size,
    sampleAt: (x, z, out) => sampleGroundColor(x, z, input, out),
  })
  const terrain = buildTerrainMesh(input, biomeTexture)
  root.add(terrain)

  const lakeBiome = input.biomes.find((biome) => biome.key === BOARD3D.world.lake.zone)
  // T-095/AC-3: null ⇒ el estanque no entró en el panel ⇒ sin lago; undefined
  // ⇒ legacy (centro del panel con radio de tema, tests sin plan).
  const water = lakeBiome === undefined
    ? null
    : input.lake === null
      ? null
      : buildWaterMesh(lakeBiome, input.decor, input.lake ?? {
        x: lakeBiome.center.x,
        z: lakeBiome.center.z,
        radius: BOARD3D.world.lake.radius,
      })
  if (water !== null) root.add(water)

  const sky = buildSkyMesh(input.style, BOARD3D.world.sky.radius)
  root.add(sky)
  const sunDisk = buildSunDisk(input.style)
  if (sunDisk !== null) root.add(sunDisk)
  const mountains = buildDistantMountains(input.style, input.decor.palette)
  root.add(mountains)
  const treeRing = buildTreeRing({
    style: input.style,
    palette: input.decor.palette,
    terrainHeightAt: (x, z) => terrainHeightAt(x, z, input),
  })
  root.add(treeRing)
  const clouds = buildClouds(input.style)
  root.add(clouds)

  const fog = new THREE.Fog(input.style.fog.color, input.style.fog.near, input.style.fog.far)
  return {
    root,
    terrain,
    biomeTexture,
    water,
    sky,
    sunDisk,
    mountains,
    treeRing,
    clouds,
    fog,
    halfSpan: input.style.world.size[0] / 2 + 4,
  }
}
