// Reubicación de edificios a los costados del camino (SPEC-N/T-089): esquema
// de content/board/placements.json + solver puro determinista. Trabaja en
// unidades de mundo (1 px = 0,01 u, igual que BOARD3D.pxToUnits); las
// restricciones (minGaps) se miden con la OBB orientada del edificio contra
// TODOS los nodos, aristas, otros edificios y pedestales del tablero.
// La geometría 2D pura vive en placements-geometry.ts y el reporte SVG/JSON en
// placements-report.ts (`pnpm placements:report`).
import { z } from 'zod'
import type { BoardGraph } from './board.ts'
import {
  type Obb,
  type Vec2,
  distPointToPolygon,
  distPointToSegment,
  distPolygonToPolygon,
  distSegmentToPolygon,
  obbCorners,
  placementsPxToWorld,
} from './placements-geometry.ts'

export {
  PLACEMENTS_PX_TO_UNITS, obbCorners, distPointToSegment, distSegmentToSegment, distPointToPolygon,
  distSegmentToPolygon, distPolygonToPolygon, placementsPxToWorld, type Obb, type Vec2,
} from './placements-geometry.ts'

const DEG = Math.PI / 180
const EPS = 1e-9

export const PLACEMENTS_KINDS = ['gym', 'pokecenter', 'market', 'lab', 'league', 'house'] as const
export type PlacementsKind = (typeof PLACEMENTS_KINDS)[number]

export const PlacementsKindSchema = z.enum(PLACEMENTS_KINDS)

/** Radio del círculo del nodo para los gaps (T-089/AC-2: "radio 0,2"). */
export const NODE_RADIUS_UNITS = 0.2
/** Radio de la piedra del pedestal de mazo (board3d.theme world.pedestal). */
export const PEDESTAL_RADIUS_UNITS = 0.72

export const PlacementsNodeSchema = z.object({
  kind: PlacementsKindSchema,
  /** Dirección nodo → edificio en coordenadas del tablero (0° = +x). null ⇒ auto. */
  sideDeg: z.number().finite().nullable(),
  confidence: z.enum(['high', 'medium', 'low', 'auto']),
  /** Distancia inicial sugerida por el dueño (si no, search.distStart). */
  distHint: z.number().positive().optional(),
  note: z.string().optional(),
})
export type PlacementsNode = z.infer<typeof PlacementsNodeSchema>

export const PlacementsFileSchema = z.object({
  _status: z.string().optional(),
  models: z.object({
    sourceDir: z.string().min(1),
    files: z.record(z.string().min(1), z.string().min(1)),
    _nota: z.string().optional(),
    yawOffsetDeg: z.partialRecord(PlacementsKindSchema, z.number().finite()).default({}),
    _yawNota: z.string().optional(),
  }),
  footprints: z.record(PlacementsKindSchema, z.number().positive()),
  heights: z.record(PlacementsKindSchema, z.number().positive()),
  minGaps: z.object({
    buildingToNodeCircle: z.number().nonnegative(),
    buildingToEdge: z.number().nonnegative(),
    buildingToBuilding: z.number().nonnegative(),
    buildingToPedestal: z.number().nonnegative(),
  }),
  search: z.object({
    distStart: z.number().positive(),
    distStep: z.number().positive(),
    distMax: z.number().positive(),
    rotateStepsDeg: z.array(z.number().finite()),
    scaleFloor: z.number().positive().max(1),
  }),
  removeStacks: z.array(z.string().min(1)).default([]),
  /** SPEC-P/T-099/AC-B1/AC-B2: false ⇒ nunca se dibuja la pieza procedural de
   *  gym/pokecenter/market/league/lab (un solo edificio por nodo); las casas
   *  (`house`) conservan la suya. Default true tolera archivos viejos. */
  proceduralBuildings: z.boolean().default(true),
  nodes: z.record(z.string().min(1), PlacementsNodeSchema),
})
export type PlacementsFile = z.infer<typeof PlacementsFileSchema>

/** Deck-stacks simplificado para el solver/report: solo centros de pedestal.
 * T-090/AC-1: `extraStacks` (Ítem/Sorpresa) se eliminó del archivo; default
 * vacío para tolerar archivos viejos. */
export const PlacementsStacksSchema = z.object({
  stacks: z.record(z.string().min(1), z.object({ x: z.number(), y: z.number() })),
  extraStacks: z.record(z.string().min(1), z.object({ x: z.number(), y: z.number() })).default({}),
})
export type PlacementsStacks = z.infer<typeof PlacementsStacksSchema>

// ── Solver ──────────────────────────────────────────────────────────────────

export interface PlacementsPedestal {
  readonly key: string
  /** Centro en px del tablero (mismo criterio que la escena). */
  readonly x: number
  readonly y: number
  readonly radius: number
}

export interface SolvePlacementsInput {
  readonly placements: PlacementsFile
  readonly board: BoardGraph
  readonly pedestals: readonly PlacementsPedestal[]
  readonly imageSize: readonly [number, number]
}

export interface BuildingGaps {
  readonly node: number
  readonly edge: number
  readonly building: number
  readonly pedestal: number
}

export interface PlacedDecor {
  readonly kind: 'fence' | 'tree' | 'lamp'
  readonly x: number
  readonly z: number
  readonly yawDeg: number
  readonly radius: number
}

export interface PlacedBuilding {
  readonly nodeId: string
  readonly kind: PlacementsKind
  /** Dirección final nodo → edificio (grados, coordenadas del tablero). */
  readonly sideDeg: number
  readonly dist: number
  readonly scale: number
  readonly x: number
  readonly z: number
  readonly yawDeg: number
  readonly footprint: number
  readonly height: number
  readonly gaps: BuildingGaps
  readonly discarded: boolean
  readonly warning: string | null
  readonly decor: PlacedDecor | null
}

export interface PlacementSolution {
  readonly buildings: readonly PlacedBuilding[]
  readonly warnings: readonly string[]
}

interface Edge { readonly a: Vec2; readonly b: Vec2 }
interface Circle { readonly center: Vec2; readonly radius: number }

interface Obstacles {
  readonly nodes: readonly Circle[]
  readonly edges: readonly Edge[]
  readonly pedestals: readonly Circle[]
}

interface PlacedObb { readonly obb: Obb }

const DECOR_BY_KIND: Readonly<Record<PlacementsKind, PlacedDecor['kind']>> = {
  gym: 'fence',
  league: 'fence',
  lab: 'tree',
  pokecenter: 'lamp',
  market: 'tree',
  house: 'fence',
}

const DECOR_RADIUS: Readonly<Record<PlacedDecor['kind'], number>> = { fence: 0.28, tree: 0.2, lamp: 0.12 }

const normDeg = (d: number): number => (((d + 180) % 360) + 360) % 360 - 180

function measureGaps(poly: Obb, obstacles: Obstacles, placed: readonly PlacedObb[]): BuildingGaps {
  let node = Number.POSITIVE_INFINITY
  for (const n of obstacles.nodes) node = Math.min(node, distPointToPolygon(n.center, poly) - n.radius)
  let edge = Number.POSITIVE_INFINITY
  for (const e of obstacles.edges) edge = Math.min(edge, distSegmentToPolygon(e.a, e.b, poly))
  let building = Number.POSITIVE_INFINITY
  for (const other of placed) building = Math.min(building, distPolygonToPolygon(poly, other.obb))
  let pedestal = Number.POSITIVE_INFINITY
  for (const p of obstacles.pedestals) pedestal = Math.min(pedestal, distPointToPolygon(p.center, poly) - p.radius)
  return { node, edge, building, pedestal }
}

function meetsMins(gaps: BuildingGaps, mins: PlacementsFile['minGaps']): boolean {
  return (
    gaps.node >= mins.buildingToNodeCircle - EPS &&
    gaps.edge >= mins.buildingToEdge - EPS &&
    gaps.building >= mins.buildingToBuilding - EPS &&
    gaps.pedestal >= mins.buildingToPedestal - EPS
  )
}

/** Puerta hacia el camino más cercano (AC-1): yaw apuntando a la arista más próxima. */
function doorYawDeg(center: Vec2, edges: readonly Edge[], fallbackDeg: number): number {
  let best = Number.POSITIVE_INFINITY
  let target = center
  for (const edge of edges) {
    const abx = edge.b.x - edge.a.x
    const abz = edge.b.z - edge.a.z
    const len2 = abx * abx + abz * abz
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((center.x - edge.a.x) * abx + (center.z - edge.a.z) * abz) / len2))
    const point = { x: edge.a.x + abx * t, z: edge.a.z + abz * t }
    const dist = Math.hypot(point.x - center.x, point.z - center.z)
    if (dist < best) {
      best = dist
      target = point
    }
  }
  if (!Number.isFinite(best)) return fallbackDeg
  return Math.atan2(target.z - center.z, target.x - center.x) / DEG
}

function scaleSteps(scaleFloor: number): readonly number[] {
  const steps: number[] = []
  for (let s = 1; s >= scaleFloor - EPS; s -= 0.1) steps.push(Math.round(s * 10) / 10)
  return steps
}

/** AC-6: cerca/árbol/farol cerca del edificio cuando hay espacio (sin romper minGaps). */
function placeDecor(
  center: Vec2,
  footprint: number,
  yawDeg: number,
  kind: PlacementsKind,
  obstacles: Obstacles,
  placed: readonly PlacedObb[],
  mins: PlacementsFile['minGaps'],
): PlacedDecor | null {
  const decorKind = DECOR_BY_KIND[kind]
  const radius = DECOR_RADIUS[decorKind]
  const half = footprint / 2
  const dx = Math.cos(yawDeg * DEG)
  const dz = Math.sin(yawDeg * DEG)
  const px = -dz
  const pz = dx
  const reach = half + radius + mins.buildingToBuilding + 0.05
  const offsets: readonly Vec2[] = [
    { x: px * reach, z: pz * reach },
    { x: -px * reach, z: -pz * reach },
    { x: -dx * reach, z: -dz * reach },
    { x: px * (reach + 0.3), z: pz * (reach + 0.3) },
    { x: -px * (reach + 0.3), z: -pz * (reach + 0.3) },
  ]
  for (const offset of offsets) {
    const decorCenter = { x: center.x + offset.x, z: center.z + offset.z }
    // El decor es un círculo chico: medimos sus gaps contra los mismos obstáculos.
    let node = Number.POSITIVE_INFINITY
    for (const n of obstacles.nodes) node = Math.min(node, Math.hypot(n.center.x - decorCenter.x, n.center.z - decorCenter.z) - n.radius - radius)
    let edge = Number.POSITIVE_INFINITY
    for (const e of obstacles.edges) edge = Math.min(edge, distPointToSegment(decorCenter, e.a, e.b) - radius)
    let building = Number.POSITIVE_INFINITY
    for (const other of placed) building = Math.min(building, distPointToPolygon(decorCenter, other.obb) - radius)
    let pedestal = Number.POSITIVE_INFINITY
    for (const p of obstacles.pedestals) {
      pedestal = Math.min(pedestal, Math.hypot(p.center.x - decorCenter.x, p.center.z - decorCenter.z) - p.radius - radius)
    }
    if (
      node >= mins.buildingToNodeCircle - EPS &&
      edge >= mins.buildingToEdge - EPS &&
      building >= mins.buildingToBuilding - EPS &&
      pedestal >= mins.buildingToPedestal - EPS
    ) {
      return { kind: decorKind, x: decorCenter.x, z: decorCenter.z, yawDeg, radius }
    }
  }
  return null
}

/** Coloca los edificios de placements.nodes a los costados del camino (AC-1..AC-6). */
export function solvePlacements(input: SolvePlacementsInput): PlacementSolution {
  const { placements, board, pedestals, imageSize } = input
  const nodeById = new Map(board.nodes.map((node) => [node.id, node]))
  const obstacles: Obstacles = {
    nodes: board.nodes.map((node) => ({
      center: placementsPxToWorld(node.x, node.y, imageSize),
      radius: NODE_RADIUS_UNITS,
    })),
    edges: board.edges.flatMap(([fromId, toId]): readonly Edge[] => {
      const from = nodeById.get(fromId)
      const to = nodeById.get(toId)
      if (from === undefined || to === undefined) return []
      return [{
        a: placementsPxToWorld(from.x, from.y, imageSize),
        b: placementsPxToWorld(to.x, to.y, imageSize),
      }]
    }),
    pedestals: pedestals.map((pedestal) => ({
      center: placementsPxToWorld(pedestal.x, pedestal.y, imageSize),
      radius: pedestal.radius,
    })),
  }

  const buildings: PlacedBuilding[] = []
  const warnings: string[] = []
  const placed: PlacedObb[] = []

  for (const [nodeId, entry] of Object.entries(placements.nodes)) {
    const node = nodeById.get(nodeId)
    if (node === undefined) {
      warnings.push(`placements: nodo "${nodeId}" no existe en el tablero (corré crossCheckPlacements)`)
      continue
    }
    const nodeWorld = placementsPxToWorld(node.x, node.y, imageSize)
    const footprintMax = placements.footprints[entry.kind]
    const heightMax = placements.heights[entry.kind]
    const yawOffset = placements.models.yawOffsetDeg[entry.kind] ?? 0
    const isAuto = entry.sideDeg === null
    const windowDeg = isAuto ? Number.POSITIVE_INFINITY : entry.confidence === 'low' ? 90 : 45
    // AC-4: auto prefiere el exterior (alejándose del centro del tablero = origen).
    const exteriorDeg = Math.atan2(nodeWorld.z, nodeWorld.x) / DEG
    const bases = isAuto ? [exteriorDeg, normDeg(exteriorDeg + 180)] : [entry.sideDeg!]
    const startDist = entry.distHint ?? placements.search.distStart
    const { distStep, distMax, rotateStepsDeg, scaleFloor } = placements.search
    const rotations = [0, ...rotateStepsDeg]

    let found: { center: Vec2; sideDeg: number; dist: number; scale: number; yawDeg: number; obb: Obb; gaps: BuildingGaps } | null = null

    outer: for (const scale of scaleSteps(scaleFloor)) {
      for (const base of bases) {
        for (const delta of rotations) {
          const angle = base + delta
          if (Math.abs(normDeg(delta)) > windowDeg + EPS) continue
          for (let i = 0; ; i++) {
            const dist = startDist + i * distStep
            if (dist > distMax + EPS) break
            const center = {
              x: nodeWorld.x + Math.cos(angle * DEG) * dist,
              z: nodeWorld.z + Math.sin(angle * DEG) * dist,
            }
            const sideDeg = Math.atan2(center.z - nodeWorld.z, center.x - nodeWorld.x) / DEG
            const yawDeg = doorYawDeg(center, obstacles.edges, sideDeg) + yawOffset
            const obb = obbCorners(center, footprintMax * scale, yawDeg)
            const gaps = measureGaps(obb, obstacles, placed)
            if (meetsMins(gaps, placements.minGaps)) {
              found = { center, sideDeg, dist, scale, yawDeg, obb, gaps }
              break outer
            }
          }
        }
      }
    }

    if (found === null) {
      const warning =
        `placements: edificio "${nodeId}" (${entry.kind}) descartado: sin espacio dentro de minGaps ` +
        `(dist ≤ ${String(distMax)}, ±${String(windowDeg === Number.POSITIVE_INFINITY ? 180 : windowDeg)}°, escala ≥ ${String(scaleFloor)})`
      warnings.push(warning)
      buildings.push({
        nodeId,
        kind: entry.kind,
        sideDeg: entry.sideDeg ?? Math.round(exteriorDeg),
        dist: 0,
        scale: scaleFloor,
        x: nodeWorld.x,
        z: nodeWorld.z,
        yawDeg: 0,
        footprint: footprintMax * scaleFloor,
        height: heightMax * scaleFloor,
        gaps: { node: 0, edge: 0, building: 0, pedestal: 0 },
        discarded: true,
        warning,
        decor: null,
      })
      continue
    }

    const footprint = footprintMax * found.scale
    const decor = placeDecor(found.center, footprint, found.yawDeg, entry.kind, obstacles, placed, placements.minGaps)
    placed.push({ obb: found.obb })
    buildings.push({
      nodeId,
      kind: entry.kind,
      sideDeg: found.sideDeg,
      dist: found.dist,
      scale: found.scale,
      x: found.center.x,
      z: found.center.z,
      yawDeg: found.yawDeg,
      footprint,
      height: heightMax * found.scale,
      gaps: found.gaps,
      discarded: false,
      warning: null,
      decor,
    })
  }

  return { buildings, warnings }
}

/** AC-8: los nodos de placements.nodes deben existir en kanto.json. */
export function crossCheckPlacements(placements: PlacementsFile, board: BoardGraph): string[] {
  const errors: string[] = []
  const nodeIds = new Set(board.nodes.map((node) => node.id))
  for (const nodeId of Object.keys(placements.nodes)) {
    if (!nodeIds.has(nodeId)) errors.push(`placements.nodes.${nodeId}: no existe en kanto.json`)
  }
  return errors
}
