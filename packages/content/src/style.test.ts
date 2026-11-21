// AC: SPEC-J/T-078/AC-1 + T-079/AC-1 + T-080/AC-4..AC-6 — esquema y chequeos
// de content/board/style.json (labels + world/biomas/distantMountains/sky/fog/
// treeRing + lighting/profiles). T-081 agregará edgeProps/life/ambientFx.
import { expect, test } from 'vitest'
import {
  BoardStyleSchema,
  crossCheckStyle,
  type BoardStyle,
  type LabelsStyle,
} from './style.ts'

const validLabels: LabelsStyle = {
  fontPx: 13,
  outlinePx: 3,
  fadeMs: 150,
  collision: true,
  throttleHz: 10,
  alwaysShow: ['gym'],
  showWithinTokenDistance: 6.0,
  showOnlyIfCameraDistanceBelow: 9.0,
  priority: ['gym', 'centro', 'oak', 'mercado', 'start', 'deck', 'other'],
  screenSpaceSize: true,
}

const validWorld = {
  size: [36, 36] as [number, number],
  segments: 120,
  seed: 2026,
  noiseAmplitude: 0.35,
  hills: { startRadius: 9.0, maxHeight: 1.4, seed: 3 },
  flatten: { aroundNodes: 0.35, aroundEdges: 0.35, smooth: 0.3 },
}

const validLighting = {
  hemisphere: { sky: '#CFE8FF', ground: '#8DBF6A', intensity: 0.9 },
  directional: {
    color: '#FFF3D6', intensity: 1.0, from: [-6, 10, 4] as [number, number, number],
    shadowMapSize: 2048, shadowRadiusAroundTarget: 10,
  },
  toon: { steps: 3 },
  toneMapping: 'ACESFilmic' as const,
  exposure: 1.0,
  outlines: {
    enabled: true, thickness: 0.02, color: '#2B2B2B', maxMeshes: 40,
    onlyKinds: ['house', 'pokecenter', 'market', 'lab', 'gym'],
  },
  contactShadows: { radius: 0.5, opacity: 0.28 },
}

const validProfiles = {
  high: { dpr: [1, 1.5] as [number, number], shadows: true, outlines: true, life: 1.0, ambientFx: 1.0, propDensity: 1.0, maxDrawCalls: 160, maxTriangles: 250000 },
  low: { dpr: [1, 1] as [number, number], shadows: false, outlines: false, life: 0.3, ambientFx: 0.3, propDensity: 0.5, maxDrawCalls: 100, maxTriangles: 120000 },
}

const validStyle = {
  world: validWorld,
  biomes: {
    baseGrass: '#8DBF6A',
    radius: 3.4,
    blend: 1.6,
    lightnessNoise: 0.06,
    maxShare: 0.25,
    colors: { bosque: '#5FA85F', montana: '#B59A7E', isla: '#8FC6E8', llanura: '#CFC48F', pantano: '#6B7A45' },
  },
  distantMountains: {
    rings: [
      { count: 12, radius: 22, height: [2.5, 4.0] as [number, number], color: '#7F93A8', snow: true },
      { count: 14, radius: 30, height: [3.5, 6.0] as [number, number], color: '#A9B8C8', snow: true },
    ],
    seed: 5,
  },
  sky: {
    top: '#8EC5F5',
    horizon: '#EAF6FF',
    sunDisk: true,
    clouds: { count: 5, height: 7.0, speed: 0.15, seed: 7 },
  },
  fog: { color: '#CFE6F7', near: 30, far: 80 },
  treeRing: { innerRadius: 10.4, outerRadius: 17.2, count: 240, seed: 79 },
  labels: validLabels,
  lighting: validLighting,
  profiles: validProfiles,
}

test('AC: SPEC-J/T-078/AC-1 - BoardStyleSchema acepta style.json válido', () => {
  const parsed = BoardStyleSchema.safeParse(validStyle)
  expect(parsed.success).toBe(true)
  if (parsed.success) expect(parsed.data.labels.fontPx).toBe(13)
  expect(crossCheckStyle(parsed.success ? parsed.data : BoardStyleSchema.parse(validStyle))).toEqual([])
})

test('AC: SPEC-J/T-078/AC-1 - el esquema rechaza valores inválidos', () => {
  const cases: readonly unknown[] = [
    { labels: { ...validLabels, fontPx: 12 } },
    { labels: { ...validLabels, throttleHz: 0 } },
    { labels: { ...validLabels, showWithinTokenDistance: -1 } },
    { labels: { ...validLabels, alwaysShow: ['nonsense'] } },
    { labels: { ...validLabels, priority: [] } },
    { labels: { ...validLabels, fadeMs: -10 } },
    { labels: validLabels },
    { ...validStyle, world: { ...validWorld, segments: 1 } },
    { ...validStyle, biomes: { ...validStyle.biomes, lightnessNoise: 0.5 } },
    { ...validStyle, distantMountains: { rings: [], seed: 5 } },
    { ...validStyle, sky: { ...validStyle.sky, clouds: { count: -1, height: 7, speed: 0.1, seed: 1 } } },
    { ...validStyle, treeRing: { innerRadius: 10.4, outerRadius: -1, count: 10, seed: 1 } },
    { ...validStyle, lighting: { ...validLighting, toneMapping: 'Vintage' } },
    { ...validStyle, lighting: { ...validLighting, toon: { steps: 1 } } },
    { ...validStyle, lighting: { ...validLighting, directional: { ...validLighting.directional, from: [-6, -10, 4] } } },
    { ...validStyle, lighting: { ...validLighting, directional: { ...validLighting.directional, shadowMapSize: 1000 } } },
    { ...validStyle, lighting: { ...validLighting, outlines: { ...validLighting.outlines, onlyKinds: ['rascacielos'] } } },
    { ...validStyle, profiles: { ...validProfiles, low: { ...validProfiles.low, life: 0 } } },
  ]
  for (const bad of cases) {
    expect(BoardStyleSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
  }
})

test('AC: SPEC-J/T-078/AC-1 - crossCheckStyle: priority única con other, alwaysShow ⊆ priority, límites', () => {
  const dup = BoardStyleSchema.parse({
    ...validStyle,
    labels: { ...validLabels, priority: ['gym', 'gym', 'other'] },
  })
  expect(crossCheckStyle(dup).join(' ')).toContain('sin duplicados')

  const noOther = BoardStyleSchema.parse({ ...validStyle, labels: { ...validLabels, priority: ['gym', 'centro'] } })
  expect(crossCheckStyle(noOther).join(' ')).toContain("'other'")

  const outside = BoardStyleSchema.parse({
    ...validStyle,
    labels: { ...validLabels, alwaysShow: ['liga'] },
  })
  expect(crossCheckStyle(outside).join(' ')).toContain('alwaysShow')

  const fast = BoardStyleSchema.parse({ ...validStyle, labels: { ...validLabels, throttleHz: 60 } })
  expect(crossCheckStyle(fast).join(' ')).toContain('throttleHz')

  const slowFade = BoardStyleSchema.parse({ ...validStyle, labels: { ...validLabels, fadeMs: 2000 } })
  expect(crossCheckStyle(slowFade).join(' ')).toContain('fadeMs')
})

// AC: SPEC-J/T-079/AC-1 — chequeos del mundo migrado (niebla, rings, arbolado).
test('AC: SPEC-J/T-079/AC-1 - crossCheckStyle: niebla, anillos crecientes y treeRing dentro del mundo', () => {
  const style = BoardStyleSchema.parse(validStyle) as BoardStyle

  const badFog = structuredClone(style)
  badFog.fog = { color: '#CFE6F7', near: 80, far: 30 }
  expect(crossCheckStyle(badFog).join(' ')).toContain('fog.far')

  const flatRing = structuredClone(style)
  flatRing.distantMountains.rings[1]!.radius = 22
  expect(crossCheckStyle(flatRing).join(' ')).toContain('rings[1].radius')

  const inverted = structuredClone(style)
  inverted.distantMountains.rings[0]!.height = [4.0, 2.5]
  expect(crossCheckStyle(inverted).join(' ')).toContain('rings[0].height')

  const outsideWorld = structuredClone(style)
  outsideWorld.treeRing = { innerRadius: 10.4, outerRadius: 20.0, count: 10, seed: 1 }
  expect(crossCheckStyle(outsideWorld).join(' ')).toContain('treeRing.outerRadius')

  const overBiomes = structuredClone(style)
  overBiomes.treeRing = { innerRadius: 3.0, outerRadius: 17.2, count: 10, seed: 1 }
  expect(crossCheckStyle(overBiomes).join(' ')).toContain('treeRing.innerRadius')
})

// AC: SPEC-J/T-080/AC-4..AC-6 — luces, contornos y perfiles.
test('AC: SPEC-J/T-080/AC-5 - crossCheckStyle: perfil bajo sin sombras/contornos, dpr 1 y presupuestos acotados', () => {
  const style = BoardStyleSchema.parse(validStyle) as BoardStyle

  const hiDpr = structuredClone(style)
  hiDpr.profiles.low.dpr = [1, 1.5]
  expect(crossCheckStyle(hiDpr).join(' ')).toContain('profiles.low.dpr')

  const withShadows = structuredClone(style)
  withShadows.profiles.low.shadows = true
  expect(crossCheckStyle(withShadows).join(' ')).toContain('profiles.low.shadows')

  const withOutlines = structuredClone(style)
  withOutlines.profiles.low.outlines = true
  expect(crossCheckStyle(withOutlines).join(' ')).toContain('profiles.low.outlines')

  const invertedDpr = structuredClone(style)
  invertedDpr.profiles.high.dpr = [1.5, 1]
  expect(crossCheckStyle(invertedDpr).join(' ')).toContain('profiles.high.dpr')

  const fatLow = structuredClone(style)
  fatLow.profiles.low.maxTriangles = style.profiles.high.maxTriangles + 1
  expect(crossCheckStyle(fatLow).join(' ')).toContain('profiles.low.maxTriangles')

  const dupKinds = structuredClone(style)
  dupKinds.lighting.outlines.onlyKinds = ['house', 'house']
  expect(crossCheckStyle(dupKinds).join(' ')).toContain('onlyKinds')
})
