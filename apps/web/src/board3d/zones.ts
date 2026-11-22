// Zonas del tablero (N-0011): cada panel de mazo (llanura, montaña, isla,
// bosque, pantano) es una celda orgánica que llena el hueco entre caminos —
// forma, relieve, color de suelo y agua salen de UNA máscara por zona. Three
// puro y determinista; los números viven en theme/board3d.ts (world.zones) y
// los colores de suelo en content/board/style.json (biomes.colors).
import type { BoardStyle } from '@liga/content'
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'
import { valueNoise } from './noise'
import { smoothstep } from './smooth'

interface Point { readonly x: number; readonly z: number }

export interface ZoneBiome {
  readonly key: string
  readonly center: Point
  readonly ground: string
  readonly half?: readonly [number, number]
}

/** Lo que las zonas leen del mundo (WorldInput lo cumple estructuralmente). */
export interface ZoneInput {
  readonly style: BoardStyle
  readonly nodes: readonly Point[]
  readonly edges: readonly { readonly a: Point; readonly b: Point }[]
  readonly biomes: readonly ZoneBiome[]
  readonly obstacles?: readonly { readonly x: number; readonly z: number; readonly radius: number }[]
}

interface ZoneRule {
  readonly depth?: number
  readonly pools?: number
  readonly rise?: number
  readonly shore?: string
  readonly water?: { readonly color: string; readonly level: number }
}

const THEME = BOARD3D.world.zones
const ruleOf = (key: string): ZoneRule => (THEME.rules as Readonly<Record<string, ZoneRule>>)[key] ?? {}

const distToSegment = (px: number, pz: number, a: Point, b: Point): number => {
  const abx = b.x - a.x
  const abz = b.z - a.z
  const len2 = abx * abx + abz * abz
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - a.x) * abx + (pz - a.z) * abz) / len2))
  return Math.hypot(px - (a.x + abx * t), pz - (a.z + abz * t))
}

/** Distancia libre a lo que una zona no puede pisar: nodos, caminos y edificios. */
export function clearDistance(x: number, z: number, input: ZoneInput): number {
  let d = Number.POSITIVE_INFINITY
  for (const node of input.nodes) d = Math.min(d, Math.hypot(x - node.x, z - node.z))
  for (const edge of input.edges) d = Math.min(d, distToSegment(x, z, edge.a, edge.b))
  for (const item of input.obstacles ?? []) d = Math.min(d, Math.hypot(x - item.x, z - item.z) - item.radius)
  // Borde ondulado: la orilla no copia la recta del camino.
  return d + (valueNoise(x * 1.7 + 3, z * 1.7 + 11, input.style.world.seed) - 0.5) * THEME.clearWobble
}

/** Forma de la zona sin recorte: elipse del panel × reach con borde ondulado (0..1). */
const reachAt = (x: number, z: number, biome: ZoneBiome, seed: number): number => {
  const half = biome.half ?? THEME.defaultHalf
  const e = Math.hypot((x - biome.center.x) / (half[0] * THEME.reach), (z - biome.center.z) / (half[1] * THEME.reach))
  if (e > 1 + THEME.wobble) return 0
  const wobble = (valueNoise(x * THEME.wobbleFreq, z * THEME.wobbleFreq, seed) - 0.5) * 2 * THEME.wobble
  return 1 - smoothstep(1 - THEME.blend, 1, e + wobble)
}

/** AC-1/AC-3: 1 dentro de la celda de la zona, 0 sobre caminos, nodos, mazos y edificios. */
export function zoneMaskAt(x: number, z: number, input: ZoneInput, biome: ZoneBiome, clear?: number): number {
  const reach = reachAt(x, z, biome, input.style.world.seed)
  if (reach <= 0) return 0
  return reach * smoothstep(THEME.clear, THEME.clear + THEME.clearSoft, clear ?? clearDistance(x, z, input))
}

/** AC-2: cuenca del lago, charcos del pantano y relieve de la montaña (antes de aplanar). */
export function zoneHeightAt(x: number, z: number, input: ZoneInput): number {
  let height = 0
  let clear: number | undefined
  const seed = input.style.world.seed
  for (const biome of input.biomes) {
    const rule = ruleOf(biome.key)
    if (rule.depth === undefined && rule.rise === undefined) continue
    if (reachAt(x, z, biome, seed) <= 0) continue
    clear ??= clearDistance(x, z, input)
    // El mazo queda en tierra firme: islote en el lago, claro en la montaña.
    const pedestal = Math.hypot(x - biome.center.x, z - biome.center.z) - THEME.pedestalRadius
    const mask = zoneMaskAt(x, z, input, biome, clear) * smoothstep(0, THEME.clearSoft, pedestal)
    if (mask <= 0) continue
    if (rule.depth !== undefined) {
      const pool = rule.pools === undefined
        ? 1
        : smoothstep(rule.pools, rule.pools + 0.12, valueNoise(x * 1.1 + 31, z * 1.1 + 17, seed))
      // Playa primero (banda de orilla seca), después la cuenca baja rápido.
      height -= rule.depth * smoothstep(THEME.beach, THEME.beach + 0.25, mask) * pool
    }
    if (rule.rise !== undefined) {
      height += rule.rise * mask * (0.35 + valueNoise(x * 0.9 + 5, z * 0.9 + 9, seed ^ 0x77))
    }
  }
  return height
}

export interface BiomeWeights {
  readonly weights: readonly { readonly biome: ZoneBiome; readonly weight: number }[]
  readonly total: number
}

/** Peso (máscara) de cada zona en (x, z); vacío ⇒ pasto base puro. */
export function biomeWeightsAt(x: number, z: number, input: ZoneInput): BiomeWeights {
  const weights: { biome: ZoneBiome; weight: number }[] = []
  let total = 0
  let clear: number | undefined
  for (const biome of input.biomes) {
    if (reachAt(x, z, biome, input.style.world.seed) <= 0) continue
    clear ??= clearDistance(x, z, input)
    const weight = zoneMaskAt(x, z, input, biome, clear)
    if (weight <= 1e-4) continue
    weights.push({ biome, weight })
    total += weight
  }
  return { weights, total }
}

const scratch = new THREE.Color()

/** AC-1: color de suelo — pasto base → (orilla) → suelo de la zona. */
export function zoneGroundAt(x: number, z: number, input: ZoneInput, out: THREE.Color): THREE.Color {
  out.set(input.style.biomes.baseGrass)
  const { weights } = biomeWeightsAt(x, z, input)
  for (const { biome, weight } of weights) {
    const shore = ruleOf(biome.key).shore
    if (shore !== undefined) out.lerp(scratch.set(shore), smoothstep(0, THEME.shoreBand, weight))
    const from = shore === undefined ? 0 : THEME.shoreBand
    out.lerp(scratch.set(biome.ground), smoothstep(from, from + THEME.groundBand, weight))
  }
  return out
}

/** Alias histórico (T-079): color de suelo de biomas sin ruido de luz. */
export const terrainColorAt = zoneGroundAt

/**
 * AC-2/AC-5: un espejo de agua por zona con `water`, recortado a la forma de la
 * zona (solo las celdas donde empieza la cuenca): no asoma en otras hondonadas.
 */
export function buildZoneWater(input: ZoneInput): THREE.Mesh[] {
  return input.biomes.flatMap((biome) => {
    const water = ruleOf(biome.key).water
    if (water === undefined) return []
    const half = biome.half ?? THEME.defaultHalf
    const span = (THEME.reach + THEME.wobble) * 2
    const cells = THEME.waterCells
    const geometry = new THREE.PlaneGeometry(half[0] * span, half[1] * span, cells, cells)
    geometry.rotateX(-Math.PI / 2)
    const position = geometry.attributes.position as THREE.BufferAttribute
    const wet: boolean[] = []
    for (let index = 0; index < position.count; index += 1) {
      const x = biome.center.x + position.getX(index)
      const z = biome.center.z + position.getZ(index)
      wet.push(zoneMaskAt(x, z, input, biome) >= THEME.beach)
    }
    const source = geometry.index
    if (source === null) return []
    const kept: number[] = []
    for (let face = 0; face < source.count; face += 3) {
      const a = source.getX(face)
      const b = source.getX(face + 1)
      const c = source.getX(face + 2)
      if (wet[a] === true || wet[b] === true || wet[c] === true) kept.push(a, b, c)
    }
    geometry.setIndex(kept)
    const mesh = new THREE.Mesh(
      geometry,
      // Opaca a propósito: superficie de agua, no mancha translúcida (T-088/T-096).
      new THREE.MeshStandardMaterial({ color: water.color, roughness: 0.25, metalness: 0, flatShading: true }),
    )
    mesh.name = `water:${biome.key}`
    mesh.position.set(biome.center.x, water.level, biome.center.z)
    return [mesh]
  })
}
