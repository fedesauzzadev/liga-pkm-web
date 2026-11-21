// AC: SPEC-J/T-079 — terreno y biomas rehechos: migración a style.json,
// biomas acotados (maxShare), variación orgánica (ruido de luminosidad,
// colinas), plano cerca del camino, sin NaN y determinista (NO-VISION).
// Conserva invariantes de SPEC-H/T-069 que siguen vigentes (lago, relieve).
import { expect, test } from 'vitest'
import { BoardGraphSchema, type BoardGraph } from '@liga/content'
import * as THREE from 'three'
import kantoJson from '../../../../content/board/kanto.json'
import { BOARD3D } from '../theme/board3d'
import { boardDecor } from './decor'
import { buildWorldInput } from './scene'
import { boardStyle } from './style'
import { deckStacks } from './stacks'
import {
  biomeWeightsAt,
  buildWorld,
  hillsHeightAt,
  lightnessAt,
  terrainColorAt,
  terrainHeightAt,
} from './world'

const board: BoardGraph = BoardGraphSchema.parse(kantoJson)
const input = buildWorldInput(board, deckStacks, boardDecor, boardStyle)
const world = buildWorld(input)
const half = boardStyle.world.size[0] / 2

test('AC: SPEC-J/T-079/AC-1 - migración: decor.json sin world/ambient/ground y valores desde style.json', () => {
  expect('world' in boardDecor).toBe(false)
  expect('ambient' in boardDecor).toBe(false)
  for (const zone of Object.values(boardDecor.zones)) {
    expect('ground' in zone).toBe(false)
  }
  const geometry = world.terrain.geometry as THREE.PlaneGeometry
  const params = geometry.parameters
  expect(params.width).toBeCloseTo(boardStyle.world.size[0], 6)
  expect(params.height).toBeCloseTo(boardStyle.world.size[1], 6)
  expect(params.widthSegments).toBe(boardStyle.world.segments)
  expect(params.heightSegments).toBe(boardStyle.world.segments)
  expect(world.fog.near).toBe(boardStyle.fog.near)
  expect(world.fog.far).toBe(boardStyle.fog.far)
  expect(world.fog.color.getHex()).toBe(new THREE.Color(boardStyle.fog.color).getHex())
})

test('AC: SPEC-J/T-079/AC-2 - biomas acotados: dominio solo cerca del centro y funde con el pasto base', () => {
  const { radius, blend, baseGrass } = boardStyle.biomes
  const base = new THREE.Color(baseGrass)
  const color = new THREE.Color()
  const channelDist = (a: THREE.Color, b: THREE.Color): number =>
    Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)
  for (const biome of input.biomes) {
    // En el centro de la zona su color domina (cuota > 0,5 y gana al pasto base).
    const { weights, total: sum } = biomeWeightsAt(biome.center.x, biome.center.z, input)
    const own = weights.find((entry) => entry.biome.key === biome.key)
    expect(own, biome.key).toBeDefined()
    if (own === undefined) continue
    expect(own.weight / sum, `${biome.key} domina su centro`).toBeGreaterThan(0.5)
    terrainColorAt(biome.center.x, biome.center.z, input, color)
    const ground = new THREE.Color(biome.ground)
    expect(channelDist(color, ground), `${biome.key} cerca de su ground`).toBeLessThan(channelDist(color, base))
    // A radius + blend del centro (alejándose de los vecinos) vuelve al pasto
    // base: con zonas vecinas a ~4,5 u puede quedar un residuo < 2 % de mezcla.
    const far = radius + blend + 0.2
    let best: [number, number] | null = null
    let bestClearance = -1
    for (let step = 0; step < 16; step += 1) {
      const a = (Math.PI * 2 * step) / 16
      const px = biome.center.x + Math.cos(a) * far
      const pz = biome.center.z + Math.sin(a) * far
      const clearance = Math.min(
        ...input.biomes.filter((other) => other.key !== biome.key).map((other) => Math.hypot(px - other.center.x, pz - other.center.z)),
      )
      if (clearance > bestClearance) {
        bestClearance = clearance
        best = [px, pz]
      }
    }
    expect(best, biome.key).not.toBeNull()
    expect(bestClearance, `${biome.key} tiene dirección relativamente despejada`).toBeGreaterThan(4.5)
    if (best !== null) {
      terrainColorAt(best[0], best[1], input, color)
      expect(channelDist(color, base), `${biome.key} borde`).toBeLessThan(0.02)
    }
  }
  // Esquina del mundo (lejos de todo bioma): pasto base puro.
  terrainColorAt(half - 0.2, half - 0.2, input, color)
  expect(color.getHex()).toBe(base.getHex())
})

test('AC: SPEC-J/T-079/AC-2 - ningún bioma cubre más del maxShare; el pasto base sigue visible', () => {
  const geometry = world.terrain.geometry
  const position = geometry.attributes.position as THREE.BufferAttribute
  const counts = new Map<string, number>()
  let dominated = 0
  let total = 0
  for (let index = 0; index < position.count; index += 1) {
    const { weights, total: sum } = biomeWeightsAt(position.getX(index), position.getZ(index), input)
    total += 1
    if (sum < 1e-4) continue
    const winner = weights.reduce((a, b) => (b.weight > a.weight ? b : a))
    if (winner.weight / sum > 0.5) {
      counts.set(winner.biome.key, (counts.get(winner.biome.key) ?? 0) + 1)
      dominated += 1
    }
  }
  expect(total).toBeGreaterThan(0)
  for (const [key, count] of counts) {
    expect(count / total, `${key} cubre ${String(count)}/${String(total)}`).toBeLessThan(boardStyle.biomes.maxShare)
  }
  // Prohibido colorear el 100 % del terreno: el pasto base domina la mayoría.
  expect(dominated / total).toBeLessThan(0.5)
})

test('AC: SPEC-J/T-079/AC-2 - el rojo solo aparece en lava: la paleta de biomas no tiene rojo saturado', () => {
  const hsl = { h: 0, s: 0, l: 0 }
  for (const [key, hex] of Object.entries(boardStyle.biomes.colors)) {
    new THREE.Color(hex).getHSL(hsl)
    const redHue = hsl.h <= 0.05 || hsl.h >= 0.94
    expect(redHue && hsl.s > 0.45, `${key} (${hex}) es rojo saturado`).toBe(false)
  }
})

test('AC: SPEC-J/T-079/AC-3 - ruido de luminosidad en el tinte (textura de bioma, std > 0,02)', () => {
  // T-096: el color por vértice pasó a la textura de bioma (1024², sRGB);
  // la variación total del tinte (biomas + luz) se muestrea de sus bytes.
  const texture = world.biomeTexture
  const data = texture.image.data as Uint8Array
  const size = texture.image.width
  const luminance: number[] = []
  for (let j = 0; j < size; j += 7) {
    for (let i = 0; i < size; i += 7) {
      const offset = (j * size + i) * 4
      luminance.push(
        (0.2126 * (data[offset] ?? 0) + 0.7152 * (data[offset + 1] ?? 0) + 0.0722 * (data[offset + 2] ?? 0)) / 255,
      )
    }
  }
  const mean = luminance.reduce((a, b) => a + b, 0) / luminance.length
  const variance = luminance.reduce((acc, value) => acc + (value - mean) ** 2, 0) / luminance.length
  expect(Math.sqrt(variance)).toBeGreaterThan(0.02)
  // Sin NaN: el color de suelo muestreado en el terreno es finito.
  const color = new THREE.Color()
  for (let step = 0; step <= 16; step += 1) {
    for (const dz of [-half, 0, half] as const) {
      terrainColorAt(-half + (2 * half * step) / 16, dz, input, color)
      expect(Number.isFinite(color.r) && Number.isFinite(color.g) && Number.isFinite(color.b)).toBe(true)
    }
  }
  // El ruido aporta ±lightnessNoise y es determinista.
  expect(Math.abs(lightnessAt(0, 0, boardStyle))).toBeLessThanOrEqual(boardStyle.biomes.lightnessNoise)
  expect(lightnessAt(0, 0, boardStyle)).toBe(lightnessAt(0, 0, boardStyle))
})

test('AC: SPEC-J/T-079/AC-3 - colinas suaves fuera del tablero: 0 hasta radio 9, ≤ maxHeight después', () => {
  const { startRadius, maxHeight } = boardStyle.world.hills
  for (let r = 0; r < startRadius; r += 0.5) {
    expect(hillsHeightAt(r, 0, boardStyle), `r=${String(r)}`).toBeLessThan(1e-9)
  }
  let max = 0
  for (let r = startRadius; r <= half + 0.5; r += 0.25) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      max = Math.max(max, hillsHeightAt(r * Math.cos(a), r * Math.sin(a), boardStyle))
    }
  }
  expect(max).toBeGreaterThan(0)
  expect(max).toBeLessThanOrEqual(maxHeight + 1e-6)
})

test('AC: SPEC-J/T-079/AC-3 (y T-069) - terreno plano (|y| < 0,01) a ≤ 0,3 de cada nodo y arista', () => {
  for (const node of input.nodes) {
    expect(Math.abs(terrainHeightAt(node.x, node.z, input)), node.id).toBeLessThan(0.01)
    for (const [dx, dz] of [[0.29, 0], [0, 0.29], [-0.29, 0], [0, -0.29]] as const) {
      expect(Math.abs(terrainHeightAt(node.x + dx, node.z + dz, input)), `${node.id}+offset`).toBeLessThan(0.01)
    }
  }
  for (const edge of input.edges) {
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const x = edge.a.x + (edge.b.x - edge.a.x) * t
      const z = edge.a.z + (edge.b.z - edge.a.z) * t
      expect(Math.abs(terrainHeightAt(x, z, input))).toBeLessThan(0.01)
    }
  }
})

test('AC: SPEC-J/T-079/AC-6 - determinista: mismo input ⇒ mismos altos y colores', () => {
  const again = buildWorld(buildWorldInput(board, deckStacks, boardDecor, boardStyle))
  const a = world.terrain.geometry.attributes.position as THREE.BufferAttribute
  const b = again.terrain.geometry.attributes.position as THREE.BufferAttribute
  expect(b.count).toBe(a.count)
  for (let index = 0; index < a.count; index += 37) {
    expect(b.getY(index)).toBeCloseTo(a.getY(index), 12)
  }
  // T-096: el color vive en la textura de bioma ⇒ mismos bytes por muestra.
  const bytesA = world.biomeTexture.image.data as Uint8Array
  const bytesB = again.biomeTexture.image.data as Uint8Array
  expect(bytesB.length).toBe(bytesA.length)
  for (let index = 0; index < bytesA.length; index += 1013) {
    expect(bytesB[index], `byte#${String(index)}`).toBe(bytesA[index])
  }
})

test('AC: SPEC-H/T-069/AC-3 (vigente) - Isla con lago y Montaña más rugosa', () => {
  // T-095/AC-3: el lago sigue al plan de ocupación. En el tablero real el
  // panel Isla está cruzado por caminos y no entra ningún círculo ≥ 0,8 ⇒ el
  // estanque se OMITE (Q-068): sin disco de agua y sin cuenca.
  const planLake = input.lake ?? null
  if (planLake === null) {
    expect(world.water).toBeNull()
  } else {
    const waterY = world.water?.position.y
    expect(world.water).not.toBeNull()
    if (waterY === undefined) throw new Error('lago sin armar')
    const angle = Math.PI / 7
    const shoreX = planLake.x + planLake.radius * 0.7 * Math.cos(angle)
    const shoreZ = planLake.z + planLake.radius * 0.7 * Math.sin(angle)
    expect(terrainHeightAt(shoreX, shoreZ, input)).toBeLessThan(waterY)
  }

  const maxAbsAround = (key: string): number => {
    const biome = input.biomes.find((entry) => entry.key === key)
    if (biome === undefined) return 0
    let max = 0
    for (let step = 0; step < 16; step += 1) {
      const r = 1.0 + (step % 4) * 0.2
      const a = (Math.PI * 2 * step) / 16
      max = Math.max(max, Math.abs(terrainHeightAt(biome.center.x + r * Math.cos(a), biome.center.z + r * Math.sin(a), input)))
    }
    return max
  }
  expect(maxAbsAround(BOARD3D.world.relief.zone)).toBeGreaterThan(maxAbsAround('llanura'))
})

test('AC: SPEC-J/T-079/AC-1 - cielo con degradado sky.top/horizon y nubes desde style.json', () => {
  const skyMaterial = world.sky.material as THREE.MeshBasicMaterial
  expect(skyMaterial.side).toBe(THREE.BackSide)
  expect(skyMaterial.fog).toBe(false)
  expect(world.sky.geometry.attributes.color).toBeDefined()

  const clouds = world.clouds.children
  expect(clouds.length).toBe(boardStyle.sky.clouds.count)
  for (const cloud of clouds) {
    expect(Math.abs(cloud.position.y - boardStyle.sky.clouds.height)).toBeLessThanOrEqual(0.5)
    // AC: N-0004/AC-2 — nubes al norte del tablero: no tapan casilleros.
    expect(cloud.position.z).toBeLessThanOrEqual(-(BOARD3D.base.depth / 2 + BOARD3D.world.cloud.clearDepth))
  }
})
