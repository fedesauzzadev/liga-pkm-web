// AC: SPEC-N/T-089 — solver de reubicación de edificios a los costados del
// camino (placements.json): una prueba por AC-n con su comentario.
// Los AC-7/AC-8 con el tablero real viven en placements-real.test.ts.
import { expect, test } from 'vitest'
import { BoardGraphSchema, type BoardGraph } from './board.ts'
import {
  PlacementsFileSchema,
  crossCheckPlacements,
  distPointToPolygon,
  obbCorners,
  placementsPxToWorld,
  solvePlacements,
  type PlacementsFile,
  type PlacementsKind,
} from './placements.ts'

const IMAGE: readonly [number, number] = [1176, 1600]

type NodeRow = readonly [id: string, x: number, y: number, type?: string]

const testBoard = (nodes: readonly NodeRow[], edges: readonly (readonly [string, string])[]): BoardGraph =>
  BoardGraphSchema.parse({
    meta: { id: 'test', status: 'DRAFT_UNVERIFIED', imageSize: IMAGE },
    gyms: {},
    nodes: nodes.map(([id, x, y, type]) => ({ id, type: type ?? 'empty', shape: 'round', x, y })),
    edges,
  })

const testPlacements = (
  nodes: PlacementsFile['nodes'],
  overrides?: {
    footprints?: Partial<Record<PlacementsKind, number>>
    yawOffsetDeg?: Partial<Record<PlacementsKind, number>>
  },
): PlacementsFile =>
  PlacementsFileSchema.parse({
    models: {
      sourceDir: 'assets-src/new',
      files: { gym: 'gim', pokecenter: 'pokecenter', market: 'pokemart', league: 'league', lab: 'lab', house: 'house' },
      yawOffsetDeg: { gym: 0, pokecenter: 0, market: 0, league: 0, lab: 0, house: 0, ...overrides?.yawOffsetDeg },
    },
    footprints: { gym: 0.9, pokecenter: 0.8, market: 0.7, league: 1.3, lab: 1.0, house: 0.7, ...overrides?.footprints },
    heights: { gym: 0.9, pokecenter: 0.75, market: 0.6, league: 1.3, lab: 0.9, house: 0.65 },
    minGaps: { buildingToNodeCircle: 0.25, buildingToEdge: 0.2, buildingToBuilding: 0.2, buildingToPedestal: 0.3 },
    search: {
      distStart: 0.75,
      distStep: 0.1,
      distMax: 1.8,
      rotateStepsDeg: [15, -15, 30, -30, 45, -45, 60, -60, 90, -90],
      scaleFloor: 0.7,
    },
    removeStacks: [],
    nodes,
  })

const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps
const normDeg = (d: number): number => (((d + 180) % 360) + 360) % 360 - 180

// ── AC-1 ────────────────────────────────────────────────────────────────────
test('AC: SPEC-N/T-089/AC-1 - coloca a distStart en la dirección de sideDeg con la puerta hacia el camino', () => {
  const board = testBoard(
    [['a', 300, 800], ['b', 500, 800]],
    [['a', 'b']],
  )
  const placements = testPlacements({ a: { kind: 'market', sideDeg: 180, confidence: 'high' } })
  const solution = solvePlacements({ placements, board, pedestals: [], imageSize: IMAGE })
  const building = solution.buildings.find((b) => b.nodeId === 'a')
  expect(building).toBeDefined()
  expect(building!.discarded).toBe(false)
  // Dirección pedida (180° = oeste del tablero).
  expect(near(building!.sideDeg, 180)).toBe(true)
  // El ladder aleja desde distStart solo lo necesario para cumplir minGaps
  // (market huella 0,7 ⇒ ≥ 0,8 para el círculo del nodo).
  expect(building!.dist).toBeGreaterThanOrEqual(0.8 - 1e-9)
  expect(building!.dist).toBeLessThan(1.0)
  // La puerta mira al camino más cercano (arista a–b, al este ⇒ yaw ≈ 0°).
  expect(Math.abs(normDeg(building!.yawDeg))).toBeLessThan(1)
  // La OBB cumple la distancia al círculo del nodo (radio 0,2 + gap 0,25).
  const center = placementsPxToWorld(300 - building!.dist / 0.01, 800, IMAGE)
  expect(near(center.x, building!.x, 1e-6)).toBe(true)
  expect(building!.gaps.node).toBeGreaterThanOrEqual(0.25 - 1e-9)
  expect(building!.gaps.edge).toBeGreaterThanOrEqual(0.2 - 1e-9)
})

// ── T-091/AC-3 ──────────────────────────────────────────────────────────────
test('AC: SPEC-N/T-091/AC-3 - yawOffsetDeg del modelo se suma al yaw final (la puerta gira con el modelo)', () => {
  // Arista vertical al este del nodo; el edificio cae al oeste con holgura
  // (borde del tablero lejos): la escalera de distancia rechaza el mismo
  // candidato con y sin offset y la única diferencia es el yaw pedido.
  const board = testBoard([['a', 588, 800], ['b', 588, 600]], [['a', 'b']])
  const yawOf = (marketOffset: number): number => {
    const placements = testPlacements(
      { a: { kind: 'market', sideDeg: 180, confidence: 'high' } },
      { yawOffsetDeg: { market: marketOffset } },
    )
    const solution = solvePlacements({ placements, board, pedestals: [], imageSize: IMAGE })
    const building = solution.buildings.find((entry) => entry.nodeId === 'a')
    expect(building).toBeDefined()
    expect(building!.discarded).toBe(false)
    return building!.yawDeg
  }
  expect(normDeg(yawOf(37) - yawOf(0))).toBeCloseTo(37, 6)
})

// ── AC-2 ────────────────────────────────────────────────────────────────────
test('AC: SPEC-N/T-089/AC-2 - minGaps medidos con la OBB contra TODOS los nodos/aristas/edificios/pedestales', () => {
  // a→b pegados: la arista y el nodo b bloquean el lado este de `a`.
  const board = testBoard(
    [['a', 300, 800], ['b', 340, 800], ['otro', 900, 300]],
    [['a', 'b']],
  )
  const placements = testPlacements({ a: { kind: 'market', sideDeg: 0, confidence: 'high' } })
  const solution = solvePlacements({
    placements,
    board,
    pedestals: [{ key: 'mazo', x: 300, y: 1000, radius: 0.72 }],
    imageSize: IMAGE,
  })
  const building = solution.buildings.find((b) => b.nodeId === 'a')!
  expect(building.discarded).toBe(false)
  // Sube de 0,75 hasta que el OBB quede ≥ 0,25 del círculo del nodo b.
  expect(building.dist).toBeGreaterThan(1.0)
  expect(building.gaps.node).toBeGreaterThanOrEqual(0.25 - 1e-9)
  expect(building.gaps.edge).toBeGreaterThanOrEqual(0.2 - 1e-9)
  expect(building.gaps.building).toBe(Number.POSITIVE_INFINITY) // sin otros edificios
  expect(building.gaps.pedestal).toBeGreaterThanOrEqual(0.3 - 1e-9)
  // La medición usa la OBB real, no el centro: reconstruimos y chequeamos.
  const corners = obbCorners({ x: building.x, z: building.z }, building.footprint, building.yawDeg)
  const bWorld = placementsPxToWorld(340, 800, IMAGE)
  expect(distPointToPolygon(bWorld, corners) - 0.2).toBeGreaterThanOrEqual(0.25 - 1e-9)
})

// ── AC-3 ────────────────────────────────────────────────────────────────────
test('AC: SPEC-N/T-089/AC-3 - ladder distancia → rotación → escala → descarte (nunca solapado)', () => {
  // (a) Cadena de nodos+Aristas tapando 0°, ±15 y ±30: el ladder rota hasta +45°.
  const chain = testBoard(
    [
      ['a', 300, 800], ['c', 370, 800], ['d', 440, 800],
      ['libre1', 300, 400], ['libre2', 300, 1200],
    ],
    [['a', 'c'], ['c', 'd']],
  )
  const chainSolution = solvePlacements({
    placements: testPlacements({ a: { kind: 'gym', sideDeg: 0, confidence: 'high' } }),
    board: chain,
    pedestals: [],
    imageSize: IMAGE,
  })
  const rotated = chainSolution.buildings.find((b) => b.nodeId === 'a')!
  expect(rotated.discarded).toBe(false)
  expect(near(rotated.sideDeg, 45)).toBe(true) // primera rotación de la lista que cabe
  expect(Math.abs(normDeg(rotated.sideDeg - 0))).toBeLessThanOrEqual(45) // ventana high

  // (b) Paredes a ±1,05 u con huella 2,0: solo baja la escala a 0,8.
  const wallBoard = testBoard(
    [['a', 400, 800], ['w1a', 250, 695], ['w1b', 650, 695], ['w2a', 250, 905], ['w2b', 650, 905]],
    [['w1a', 'w1b'], ['w2a', 'w2b']],
  )
  const scaled = solvePlacements({
    placements: testPlacements(
      { a: { kind: 'league', sideDeg: 0, confidence: 'high' } },
      { footprints: { league: 2.0 } },
    ),
    board: wallBoard,
    pedestals: [],
    imageSize: IMAGE,
  })
  const scaledBuilding = scaled.buildings.find((b) => b.nodeId === 'a')!
  expect(scaledBuilding.discarded).toBe(false)
  expect(near(scaledBuilding.scale, 0.8, 1e-9)).toBe(true)
  expect(scaledBuilding.gaps.edge).toBeGreaterThanOrEqual(0.2 - 1e-9)

  // (c) Huella 3,0 entre las mismas paredes: ni siquiera scaleFloor cabe ⇒ descartado.
  const discarded = solvePlacements({
    placements: testPlacements(
      { a: { kind: 'league', sideDeg: 0, confidence: 'high' } },
      { footprints: { league: 3.0 } },
    ),
    board: wallBoard,
    pedestals: [],
    imageSize: IMAGE,
  })
  const dead = discarded.buildings.find((b) => b.nodeId === 'a')!
  expect(dead.discarded).toBe(true)
  expect(dead.warning).toContain('descartado')
  expect(discarded.warnings.join(' ')).toContain('a')
})

// ── AC-4 ────────────────────────────────────────────────────────────────────
test('AC: SPEC-N/T-089/AC-4 - ventana por confidence y auto hacia el exterior', () => {
  // Muro de cadenas en 0°, ±15, ±30, ±45 desde `a`: high no puede salir de la
  // ventana y descarta; low llega a +60°.
  const blockedAngles = [0, 15, -15, 30, -30, 45, -45]
  const nodes: NodeRow[] = [['a', 588, 800]]
  const edges: (readonly [string, string])[] = []
  blockedAngles.forEach((angle, index) => {
    for (const distPx of [70, 140]) {
      const rad = (angle * Math.PI) / 180
      const id = `obs${index}_${distPx}`
      nodes.push([id, 588 + Math.round(Math.cos(rad) * distPx), 800 + Math.round(Math.sin(rad) * distPx)])
    }
    edges.push([`obs${index}_70`, `obs${index}_140`])
    edges.push(['a', `obs${index}_70`])
  })
  const board = testBoard(nodes, edges)

  const high = solvePlacements({
    placements: testPlacements({ a: { kind: 'market', sideDeg: 0, confidence: 'high' } }),
    board,
    pedestals: [],
    imageSize: IMAGE,
  })
  expect(high.buildings[0]!.discarded).toBe(true) // sin espacio dentro de ±45°

  const low = solvePlacements({
    placements: testPlacements({ a: { kind: 'market', sideDeg: 0, confidence: 'low' } }),
    board,
    pedestals: [],
    imageSize: IMAGE,
  })
  const placed = low.buildings[0]!
  expect(placed.discarded).toBe(false)
  expect(Math.abs(normDeg(placed.sideDeg))).toBeLessThanOrEqual(90)

  // auto: prefiere el lado exterior (alejándose del centro del tablero).
  const autoBoard = testBoard([['a', 200, 800]], [])
  const auto = solvePlacements({
    placements: testPlacements({ a: { kind: 'market', sideDeg: null, confidence: 'auto' } }),
    board: autoBoard,
    pedestals: [],
    imageSize: IMAGE,
  })
  const exterior = auto.buildings[0]!
  expect(exterior.discarded).toBe(false)
  expect(Math.abs(normDeg(exterior.sideDeg - 180))).toBeLessThan(1)
})

// ── AC-5 ────────────────────────────────────────────────────────────────────
test('AC: SPEC-N/T-089/AC-5 - footprints/heights son máximos: la escala nunca supera 1 ni baja de scaleFloor', () => {
  const board = testBoard([['a', 300, 800]], [])
  const solution = solvePlacements({
    placements: testPlacements(
      { a: { kind: 'league', sideDeg: 180, confidence: 'high' } },
      { footprints: { league: 2.0 } },
    ),
    board,
    pedestals: [],
    imageSize: IMAGE,
  })
  const building = solution.buildings[0]!
  expect(building.scale).toBeLessThanOrEqual(1 + 1e-9)
  expect(building.scale).toBeGreaterThanOrEqual(0.7 - 1e-9)
  expect(building.footprint).toBeLessThanOrEqual(2.0 + 1e-9)
  expect(building.height).toBeLessThanOrEqual(1.3 + 1e-9)
  // Esquema: huellas/alturas deben ser positivas.
  expect(
    PlacementsFileSchema.safeParse({
      ...testPlacements({}),
      footprints: { ...testPlacements({}).footprints, gym: 0 },
    }).success,
  ).toBe(false)
})

// ── AC-6 ────────────────────────────────────────────────────────────────────
test('AC: SPEC-N/T-089/AC-6 - cerca/árbol/farol cuando hay espacio; mismo kind ⇒ misma escala nominal', () => {
  const open = testBoard([['a', 300, 800]], [])
  const openSolution = solvePlacements({
    placements: testPlacements({ a: { kind: 'gym', sideDeg: 180, confidence: 'high' } }),
    board: open,
    pedestals: [],
    imageSize: IMAGE,
  })
  const withDecor = openSolution.buildings[0]!
  expect(withDecor.decor).not.toBeNull()
  expect(['fence', 'tree', 'lamp']).toContain(withDecor.decor!.kind)
  // El decor respeta buildingToBuilding contra la OBB de su edificio.
  const corners = obbCorners({ x: withDecor.x, z: withDecor.z }, withDecor.footprint, withDecor.yawDeg)
  const decorGap = distPointToPolygon({ x: withDecor.decor!.x, z: withDecor.decor!.z }, corners) - withDecor.decor!.radius
  expect(decorGap).toBeGreaterThanOrEqual(0.2 - 1e-9)

  // Sin espacio para el decor (edificio encerrado en una caja doble): el
  // edificio se coloca igual y el cerca/árbol/farol se omite.
  // Caja centrada en px (300, 800): paredes a ±1,25 y ±1,55 u en los 4 lados.
  const boxCenterPx = { x: 300, y: 800 }
  const nodes: NodeRow[] = [['a', 150, 800]]
  const edges: (readonly [string, string])[] = []
  let wall = 0
  for (const offsetPx of [125, 155]) {
    for (const sign of [1, -1]) {
      const h = `${wall}h`
      const h2 = `${wall}h2`
      const v = `${wall}v`
      const v2 = `${wall}v2`
      nodes.push(
        [h, boxCenterPx.x - 200, boxCenterPx.y + sign * offsetPx],
        [h2, boxCenterPx.x + 200, boxCenterPx.y + sign * offsetPx],
        [v, boxCenterPx.x + sign * offsetPx, boxCenterPx.y - 200],
        [v2, boxCenterPx.x + sign * offsetPx, boxCenterPx.y + 200],
      )
      edges.push([h, h2], [v, v2])
      wall += 1
    }
  }
  const boxBoard = testBoard(nodes, edges)
  const boxed = solvePlacements({
    placements: testPlacements(
      { a: { kind: 'league', sideDeg: 0, confidence: 'high' } },
      { footprints: { league: 2.0 } },
    ),
    board: boxBoard,
    pedestals: [],
    imageSize: IMAGE,
  })
  expect(boxed.buildings[0]!.discarded).toBe(false)
  expect(boxed.buildings[0]!.decor).toBeNull()
})

test('AC: SPEC-N/T-089/AC-8 - crossCheckPlacements atrapa nodos inexistentes en kanto.json', () => {
  const bad = testPlacements({
    a: { kind: 'gym', sideDeg: 0, confidence: 'high' },
    fantasma: { kind: 'market', sideDeg: null, confidence: 'auto' },
  })
  const board = testBoard([['a', 300, 800]], [])
  const errors = crossCheckPlacements(bad, board)
  expect(errors.length).toBe(1)
  expect(errors[0]).toContain('fantasma')
})
