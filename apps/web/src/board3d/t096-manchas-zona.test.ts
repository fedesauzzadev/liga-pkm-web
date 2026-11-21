// AC: SPEC-O/T-096 — manchas de zona sin volúmenes translúcidos ni bloques.
// El tinte de cada zona pasa a textura de bioma ≥ 1024×1024 (filtro lineal,
// desenfoque gaussiano) en lugar de color por vértice a paso 0,3 (Q-057:
// bloques cuadrados). Numérico (NO-VISION): sin render ni DOM; los deltas
// salen de los texels y de las geometrías.
import { expect, test, vi } from 'vitest'
import { BoardGraphSchema, type BoardGraph } from '@liga/content'
import * as THREE from 'three'
import kantoJson from '../../../../content/board/kanto.json'
import { BOARD3D } from '../theme/board3d'
import { boardDecor } from './decor'
import { decorPlanFor, boardCollision } from './decor/plan'
import { piecePartsOf } from './decor/registry'
import { buildWorldInput } from './scene'
import { boardStyle } from './style'
import { deckStacks } from './stacks'
import { buildScatter } from './scatter'
import { buildWorld, distToSegment, lightnessAt, terrainColorAt } from './world'

const board: BoardGraph = BoardGraphSchema.parse(kantoJson)
const input = buildWorldInput(board, deckStacks, boardDecor, boardStyle)
const world = buildWorld(input)
const texture = world.biomeTexture
const data = texture.image.data as Uint8Array
const N = texture.image.width
const plan = decorPlanFor(board, deckStacks, boardDecor)
const scatterGroup = buildScatter(input, plan)

const texelRgb = (i: number, j: number): [number, number, number] => {
  const offset = (j * N + i) * 4
  return [(data[offset] ?? 0) / 255, (data[offset + 1] ?? 0) / 255, (data[offset + 2] ?? 0) / 255]
}

const worldToTexel = (x: number, z: number): [number, number] => {
  const u = x / boardStyle.world.size[0] + 0.5
  const v = 0.5 - z / boardStyle.world.size[1]
  return [Math.min(N - 1, Math.max(0, Math.floor(u * N))), Math.min(N - 1, Math.max(0, Math.floor(v * N)))]
}

// ── AC-1 ─────────────────────────────────────────────────────────────────────

test('AC: SPEC-O/T-096/AC-1 - sin volúmenes translúcidos grandes; el tinte de zona es el suelo (opaco, con map)', () => {
  // El terreno tiñe con la textura de bioma y NO es transparente (tinte del
  // suelo, sin transparencia); los vertex colors desaparecieron.
  const terrainMaterial = world.terrain.material as THREE.MeshStandardMaterial
  expect(terrainMaterial.transparent).toBeFalsy()
  expect(terrainMaterial.map).toBe(texture)
  expect(terrainMaterial.vertexColors).toBeFalsy()
  expect((world.terrain.geometry as THREE.BufferGeometry).attributes.color).toBeUndefined()

  // Ningún mesh del mundo o del relleno es un volumen translúcido grande
  // (opacidad > 0,12 con huella > 1,2): las manchas azul/violeta grandes ya
  // no existen como geometría separada.
  for (const group of [world.root, scatterGroup]) {
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of materials) {
        const standard = material as THREE.MeshStandardMaterial
        if (!standard.transparent || standard.opacity <= 0.12) continue
        const box = new THREE.Box3().setFromObject(child)
        const footprint = Math.max(box.max.x - box.min.x, box.max.z - box.min.z)
        expect(footprint, `${child.name} volumen translúcido grande`).toBeLessThanOrEqual(1.2 + 1e-9)
      }
    })
  }
})

// ── AC-2 ─────────────────────────────────────────────────────────────────────

test('AC: SPEC-O/T-096/AC-2 - textura de bioma ≥ 1024×1024, filtro lineal (sin NearestFilter)', () => {
  expect(N).toBeGreaterThanOrEqual(1024)
  expect(texture.image.height).toBeGreaterThanOrEqual(1024)
  expect(texture.minFilter).toBe(THREE.LinearFilter)
  expect(texture.magFilter).toBe(THREE.LinearFilter)
  expect(texture.minFilter).not.toBe(THREE.NearestFilter)
  expect(texture.magFilter).not.toBe(THREE.NearestFilter)
  expect(data.length).toBe(N * N * 4)
})

test('AC: SPEC-O/T-096/AC-2 - cada zona se tiñe con su color en el texel de su centro (orientación y contenido)', () => {
  const color = new THREE.Color()
  const srgb = new THREE.Color()
  for (const biome of input.biomes) {
    const [i, j] = worldToTexel(biome.center.x, biome.center.z)
    const offset = (j * N + i) * 4
    // Esperado: color de bioma × luz, tal como antes lo pintaba el terreno
    // por vértice, codificado a sRGB (bytes) igual que la textura.
    terrainColorAt(biome.center.x, biome.center.z, input, color)
    const lightness = 1 + lightnessAt(biome.center.x, biome.center.z, boardStyle)
    color.setRGB(
      Math.min(1, color.r * lightness),
      Math.min(1, color.g * lightness),
      Math.min(1, color.b * lightness),
    )
    color.getRGB(srgb, THREE.SRGBColorSpace)
    const label = `${biome.key}@texel(${String(i)},${String(j)})`
    expect(Math.abs((data[offset] ?? 0) - Math.round(Math.min(1, srgb.r) * 255)), `${label} r`).toBeLessThanOrEqual(3)
    expect(Math.abs((data[offset + 1] ?? 0) - Math.round(Math.min(1, srgb.g) * 255)), `${label} g`).toBeLessThanOrEqual(3)
    expect(Math.abs((data[offset + 2] ?? 0) - Math.round(Math.min(1, srgb.b) * 255)), `${label} b`).toBeLessThanOrEqual(3)
  }
})

test('AC: SPEC-O/T-096/AC-2 - mezcla continua entre zonas: sin escalón de bloque entre texels vecinos de una línea', () => {
  // Recorre la línea entre centros de zonas texel a texel: el salto entre
  // vecinos es mínimo (antes, entre vértices a paso 0,3 llegaba a 0,195).
  const zones = input.biomes
  expect(zones.length).toBeGreaterThanOrEqual(2)
  let maxStep = 0
  for (let zoneIndex = 0; zoneIndex + 1 < zones.length; zoneIndex += 1) {
    const a = zones[zoneIndex]
    const b = zones[zoneIndex + 1]
    if (a === undefined || b === undefined) continue
    const steps = Math.ceil(1 + Math.hypot(b.center.x - a.center.x, b.center.z - a.center.z) * N / boardStyle.world.size[0])
    let previous: [number, number, number] | null = null
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps
      const [i, j] = worldToTexel(
        a.center.x + (b.center.x - a.center.x) * t,
        a.center.z + (b.center.z - a.center.z) * t,
      )
      const rgb = texelRgb(i, j)
      if (previous !== null) {
        maxStep = Math.max(
          maxStep,
          Math.abs(rgb[0] - previous[0]),
          Math.abs(rgb[1] - previous[1]),
          Math.abs(rgb[2] - previous[2]),
        )
      }
      previous = rgb
    }
  }
  expect(maxStep, `salto máximo entre texels vecinos: ${maxStep.toFixed(4)}`).toBeLessThan(0.08)
})

// ── AC-3 ─────────────────────────────────────────────────────────────────────

test('AC: SPEC-O/T-096/AC-3 - mist: opacidad ≤ 0,10, huella ≤ 1,2 y sin pisar caminos ni nodos', () => {
  expect(BOARD3D.decor.mist.opacity).toBeLessThanOrEqual(0.1)
  const mistParts = piecePartsOf({ kind: 'mist' }, boardDecor.palette)
  expect(mistParts, 'piezas de niebla definidas').not.toBeNull()
  if (mistParts === null) throw new Error('sin niebla')
  const mistPart = mistParts[0]
  if (mistPart === undefined) throw new Error('niebla sin partes')
  const mistMaterial = mistPart.material as THREE.MeshStandardMaterial
  expect(mistMaterial.transparent).toBe(true)
  expect(mistMaterial.opacity).toBeLessThanOrEqual(0.1)
  const mistBox = new THREE.Box3().setFromBufferAttribute(
    mistPart.geometry.attributes.position as THREE.BufferAttribute,
  )
  expect(
    Math.max(mistBox.max.x - mistBox.min.x, mistBox.max.z - mistBox.min.z) * BOARD3D.decor.scatter.scaleMax,
    'huella de la niebla',
  ).toBeLessThanOrEqual(1.2 + 1e-9)

  // Clearance con el mapa de ocupación (plan T-095): ninguna mancha pisa
  // caminos ni nodos.
  const road = boardCollision.categories.road
  const patchRadius = boardCollision.categories.patch?.radius ?? 0.45
  for (const spec of plan.scatterSpecs) {
    if (spec.kind !== 'mist') continue
    for (const spot of spec.spots) {
      for (const node of input.nodes) {
        expect(
          Math.hypot(spot.x - node.x, spot.z - node.z) + 1e-6,
          `mist tapa ${node.id}`,
        ).toBeGreaterThanOrEqual((road?.nodeBuffer ?? 0.4) + patchRadius)
      }
      for (const edge of input.edges) {
        expect(distToSegment(spot.x, spot.z, edge.a, edge.b) + 1e-6).toBeGreaterThanOrEqual(
          (road?.edgeBuffer ?? 0.45) + patchRadius,
        )
      }
    }
  }
})

// ── AC-4 ─────────────────────────────────────────────────────────────────────

test('AC: SPEC-O/T-096/AC-4 - diferencia de color entre texels vecinos < 0,08 (todo el mapa)', () => {
  let maxDelta = 0
  for (let j = 0; j < N; j += 1) {
    for (let i = 0; i < N - 1; i += 1) {
      const a = texelRgb(i, j)
      const b = texelRgb(i + 1, j)
      maxDelta = Math.max(
        maxDelta,
        Math.abs(a[0] - b[0]),
        Math.abs(a[1] - b[1]),
        Math.abs(a[2] - b[2]),
      )
    }
  }
  for (let j = 0; j < N - 1; j += 1) {
    for (let i = 0; i < N; i += 1) {
      const a = texelRgb(i, j)
      const b = texelRgb(i, j + 1)
      maxDelta = Math.max(
        maxDelta,
        Math.abs(a[0] - b[0]),
        Math.abs(a[1] - b[1]),
        Math.abs(a[2] - b[2]),
      )
    }
  }
  expect(maxDelta, `delta máximo entre texels vecinos: ${maxDelta.toFixed(4)}`).toBeLessThan(0.08)
})

test('AC: SPEC-O/T-096/AC-4 - NearestFilter solo en texturas de modelos HGSS (bioma y glifos con filtro lineal)', async () => {
  expect(texture.minFilter).not.toBe(THREE.NearestFilter)
  expect(texture.magFilter).not.toBe(THREE.NearestFilter)
  const terrainMaterial = world.terrain.material as THREE.MeshStandardMaterial
  expect(terrainMaterial.map).not.toBeNull()
  expect(terrainMaterial.map?.minFilter).not.toBe(THREE.NearestFilter)
  expect(terrainMaterial.map?.magFilter).not.toBe(THREE.NearestFilter)
  const skyMaterial = world.sky.material as THREE.MeshBasicMaterial
  expect(skyMaterial.map ?? null).toBeNull()

  const fakeCanvas = (): { width: number; height: number; getContext: () => null } => ({
    width: 8,
    height: 8,
    getContext: () => null,
  })
  vi.stubGlobal('document', { createElement: fakeCanvas })
  try {
    vi.resetModules()
    const { makeGlyphTexture } = await import('./glyph-textures')
    const glyph = makeGlyphTexture('star')
    expect(glyph.minFilter).not.toBe(THREE.NearestFilter)
    expect(glyph.magFilter).not.toBe(THREE.NearestFilter)
  } finally {
    vi.unstubAllGlobals()
  }
})

test('AC: SPEC-O/T-096/AC-4 - mismo input ⇒ misma textura de bioma (determinismo)', () => {
  const again = buildWorld(buildWorldInput(board, deckStacks, boardDecor, boardStyle))
  const bytesA = world.biomeTexture.image.data as Uint8Array
  const bytesB = again.biomeTexture.image.data as Uint8Array
  expect(bytesB.length).toBe(bytesA.length)
  for (let index = 0; index < bytesA.length; index += 997) {
    expect(bytesB[index], `byte#${String(index)}`).toBe(bytesA[index])
  }
})
