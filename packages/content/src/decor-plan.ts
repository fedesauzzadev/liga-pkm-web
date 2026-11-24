// Planificador de decoración (SPEC-O/T-095): un único OccupancyMap decide dónde
// va CADA objeto del tablero. Orden (sampling.order): agua → montañas →
// faroles/cercas/carteles → árboles → rocas → arbustos → flora/manchas, con
// poisson-disk determinista por zona (AC-2), agua limpia (AC-3: punto con más
// espacio libre del panel, radio 1,3→0,8, margin 0,35 y orilla solo juncos y
// guijarros), una zona por objeto (AC-4: centro de panel más cercano + inset).
// Puro: la escena (apps/web) y `pnpm decor:report` comparten este plan.
import type { Decor } from './decor.ts'
import type { BoardGraph } from './board.ts'
import {
  categoryOfKind, fnv1a, mulberry32, OccupancyMap,
  type DecorCollision, type DecorCategory,
} from './decor-collision.ts'
import { buildingTransformsFor, landmarkEntriesFor } from './landmarks.ts'
import { obbCorners, type PlacedBuilding, type PlacementsFile, type PlacementsKind, type Vec2 } from './placements.ts'

/** Radio conservador para piezas de edificio sin OBB del solver (descartados). */
const DEFAULT_BUILDING_RADIUS = 0.65
const EPS = 1e-9

export interface PlanPanel {
  readonly key: string
  readonly rect: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }
  readonly anchor: Vec2
}

/** Rect de mundo de un panel (px) sin margen: el inset lo aplica el plan. */
export function panelRectOf(
  panel: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  imageSize: readonly [number, number],
): PlanPanel['rect'] {
  const minX = (panel.x - imageSize[0] / 2) * 0.01
  const maxX = (panel.x + panel.w - imageSize[0] / 2) * 0.01
  const minZ = (panel.y - imageSize[1] / 2) * 0.01
  const maxZ = (panel.y + panel.h - imageSize[1] / 2) * 0.01
  return { minX, maxX, minZ, maxZ }
}

export interface LandmarkPiecePos {
  /** `${nodeId}:${index}` — la clave de transforms/capa de modelos. */
  readonly id: string
  readonly kind: string
  readonly category: DecorCategory
  readonly x: number
  readonly z: number
  readonly scale: number
  /** Edificios: footprint/2 × escala del solver (0 ⇒ usar el default). */
  readonly buildingRadius: number
  /** Huella exacta cuando se conoce (decor del solver: fence/tree/lamp). */
  readonly radiusOverride?: number
  /** true ⇒ su edificio ya tiene OBB del solver (no se registra el círculo). */
  readonly hasObb: boolean
}

/** Landmarks con posición final (transform del solver u offset del nodo). */
export function landmarkPiecesOf(
  board: BoardGraph,
  decor: Decor,
  buildings: ReadonlyMap<string, PlacedBuilding>,
  placements: PlacementsFile,
  nodePos: ReadonlyMap<string, Vec2>,
): readonly LandmarkPiecePos[] {
  const transforms = buildingTransformsFor(board, decor, buildings, placements)
  return landmarkEntriesFor(board, decor).flatMap((entry) => {
    const anchor = nodePos.get(entry.nodeId)
    if (anchor === undefined) return []
    const transform = transforms.get(`${entry.nodeId}:${entry.index}`)
    const x = transform?.x ?? anchor.x + entry.piece.offset[0]
    const z = transform?.z ?? anchor.z + entry.piece.offset[1]
    const scale = transform?.buildingScale ?? entry.piece.scale ?? 1
    const category = categoryOfKind(entry.piece.kind)
    if (category === null) return []
    let buildingRadius = 0
    if (category === 'building') {
      // Los kinds de pieza-edificio (house/pokecenter/market/lab/gym) son
      // también kinds de placements; la Liga usa la pieza `gym`.
      const footprintKind = transform?.buildingKind ?? (entry.piece.kind as PlacementsKind)
      buildingRadius = ((placements.footprints[footprintKind] ?? 1.3) / 2) * scale
    }
    return [{
      id: `${entry.nodeId}:${entry.index}`,
      kind: entry.piece.kind,
      category,
      x,
      z,
      scale,
      buildingRadius,
      hasObb: transform !== undefined && category === 'building',
    }]
  })
}

export interface DecorPlanSpot {
  readonly x: number
  readonly z: number
  readonly scale: number
  readonly rotY: number
}

export interface DecorPlanScatterSpec {
  readonly zone: string
  readonly kind: string
  readonly variant?: 'pine' | 'round'
  readonly seed: number
  readonly count: number
  readonly spots: readonly DecorPlanSpot[]
}

export interface DecorPlanWater {
  readonly zone: string
  readonly x: number
  readonly z: number
  readonly radius: number
}

export interface DecorPlanInput {
  readonly collision: DecorCollision
  readonly decor: Decor
  readonly nodes: readonly Vec2[]
  readonly edges: readonly { readonly a: Vec2; readonly b: Vec2 }[]
  readonly panels: readonly PlanPanel[]
  readonly buildings: readonly PlacedBuilding[]
  readonly landmarkPieces: readonly LandmarkPiecePos[]
  readonly worldHalf: number
  /** Presupuesto de mallas del scatter (AC-7: sobra ⇒ se quita lo menos prioritario). */
  readonly maxScatterMeshes: number
}

export interface DecorPlan {
  readonly water: readonly DecorPlanWater[]
  readonly scatterSpecs: readonly DecorPlanScatterSpec[]
  readonly map: OccupancyMap
  /** Zones donde el estanque no entró (AC-3: "si no hay lugar se omite"). */
  readonly omittedWater: readonly string[]
  /** Specs recortadas por presupuesto (AC-7). */
  readonly trimmed: readonly string[]
  /** Landmarks fijos ocultos: su huella pisa algo de prioridad ≥ (edificios). */
  readonly hiddenLandmarks: readonly string[]
}

const centerOf = (rect: PlanPanel['rect']): Vec2 => ({
  x: (rect.minX + rect.maxX) / 2,
  z: (rect.minZ + rect.maxZ) / 2,
})

/** AC-4: panel cuyo CENTRO está más cerca del punto (asignación de zona). */
export function nearestPanel(panels: readonly PlanPanel[], x: number, z: number): PlanPanel | null {
  let best: PlanPanel | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const panel of panels) {
    const center = centerOf(panel.rect)
    const distance = Math.hypot(x - center.x, z - center.z)
    if (distance < bestDistance - EPS) {
      bestDistance = distance
      best = panel
    }
  }
  return best
}

/** AC-3: ubica el cuerpo de agua en el punto con más espacio libre del panel;
 * radio preferido waterRules.preferredRadius, mínimo minRadius, con margen
 * limpio alrededor; si no entra ni el mínimo, se omite el estanque. */
export function siteWater(
  map: OccupancyMap,
  collision: DecorCollision,
  panel: PlanPanel,
): DecorPlanWater | null {
  const { minRadius, preferredRadius, margin } = waterMarginOf(collision)
  const inset = collision.zones.inset
  const minX = panel.rect.minX + inset
  const maxX = panel.rect.maxX - inset
  const minZ = panel.rect.minZ + inset
  const maxZ = panel.rect.maxZ - inset
  const center = centerOf(panel.rect)
  const stepsX = Math.max(0, Math.floor((maxX - minX) / 0.1))
  const stepsZ = Math.max(0, Math.floor((maxZ - minZ) / 0.1))
  let best: { x: number; z: number; radius: number } | null = null
  for (let ix = 0; ix <= stepsX; ix += 1) {
    for (let iz = 0; iz <= stepsZ; iz += 1) {
      const x = minX + ix * 0.1
      const z = minZ + iz * 0.1
      const fitRect = Math.min(x - minX, maxX - x, z - minZ, maxZ - z)
      // Caminos por huella física; edificios/pedestales/landmarks con margen.
      const fit = Math.min(preferredRadius, map.waterFreeDistanceAt(x, z, margin), fitRect)
      if (fit < minRadius - EPS) continue
      if (best === null || fit > best.radius + EPS) {
        best = { x, z, radius: fit }
        continue
      }
      // Desempate determinista: más cerca del centro del panel.
      if (Math.abs(fit - best.radius) <= EPS) {
        const d = Math.hypot(x - center.x, z - center.z)
        const dBest = Math.hypot(best.x - center.x, best.z - center.z)
        if (d < dBest - EPS) best = { x, z, radius: fit }
      }
    }
  }
  if (best === null) return null
  return { zone: panel.key, x: best.x, z: best.z, radius: Math.round(best.radius * 100) / 100 }
}

function waterMarginOf(collision: DecorCollision): {
  minRadius: number
  preferredRadius: number
  margin: number
} {
  return {
    minRadius: collision.waterRules.minRadius,
    preferredRadius: collision.waterRules.preferredRadius,
    margin: collision.categories.water?.margin ?? 0.35,
  }
}

/** AC-7: recorta specs hasta cumplir el presupuesto de mallas, quitando
 * primero las de menor prioridad (empate: la de más instancias). */
export function trimScatterToMeshBudget(
  specs: readonly DecorPlanScatterSpec[],
  maxMeshes: number,
  priorityOf: (kind: string) => number,
): { kept: readonly DecorPlanScatterSpec[]; trimmed: readonly string[] } {
  const kept = [...specs]
  const trimmed: string[] = []
  while (kept.length > maxMeshes) {
    let victim = 0
    for (let index = 1; index < kept.length; index += 1) {
      const a = kept[index]!
      const b = kept[victim]!
      const pa = priorityOf(a.kind)
      const pb = priorityOf(b.kind)
      if (pa > pb || (pa === pb && a.spots.length > b.spots.length)) victim = index
    }
    trimmed.push(`${kept[victim]!.zone}:${kept[victim]!.kind}`)
    kept.splice(victim, 1)
  }
  return { kept, trimmed }
}

/** Construye el plan completo de decoración (AC-1..AC-7). Determinista. */
export function planDecor(input: DecorPlanInput): DecorPlan {
  const { collision, decor } = input
  const map = new OccupancyMap(collision)

  // AC-1: caminos y nodos primero (intocables).
  for (const node of input.nodes) map.addRoadNode(node)
  for (const edge of input.edges) map.addRoadEdge(edge.a, edge.b)

  // Edificios del solver (OBB) + pedestales de mazo: preexistentes (T-089).
  for (const building of input.buildings) {
    if (building.discarded) continue
    map.addObb(
      'building', building.kind,
      obbCorners({ x: building.x, z: building.z }, building.footprint, building.yawDeg),
      `building:${building.nodeId}`, true,
    )
  }
  for (const panel of input.panels) {
    map.addCircle('pedestal', panel.key, panel.anchor.x, panel.anchor.z, collision.categories.pedestal?.radius ?? 0.9, `pedestal:${panel.key}`, true)
  }

  // AC-1: landmarks fijos (props + edificios sin OBB) ANTES del agua: son
  // preexistentes y el agua los esquiva (los pisados se ocultan después).
  const panelByKey = new Map(input.panels.map((panel) => [panel.key, panel]))
  for (const piece of input.landmarkPieces) {
    if (piece.hasObb) continue
    const radius = piece.radiusOverride ??
      (piece.category === 'building'
        ? piece.buildingRadius > 0 ? piece.buildingRadius : DEFAULT_BUILDING_RADIUS
        : map.radiusOf(piece.category) * piece.scale)
    map.addCircle(piece.category, piece.kind, piece.x, piece.z, radius, `landmark:${piece.id}`, true)
  }

  // AC-3: el agua se coloca PRIMERO (sampling.order[0] = water) en el punto
  // con más espacio libre de cada zona configurada (waterRules.zones).
  const water: DecorPlanWater[] = []
  const omittedWater: string[] = []
  for (const zoneKey of collision.waterRules.zones) {
    const zone = decor.zones[zoneKey]
    const panel = zone === undefined ? undefined : panelByKey.get(zone.panel)
    if (panel === undefined) continue
    const sited = siteWater(map, collision, panel)
    if (sited === null) {
      omittedWater.push(zoneKey)
      continue
    }
    map.addCircle('water', 'lake', sited.x, sited.z, sited.radius, `water:${zoneKey}`)
    water.push(sited)
  }

  // AC-2: resto en orden de prioridad; solo se MUESTREA el scatter (los fijos
  // ya están registrados; landmarkProp no tiene scatter propio).
  const scatterSpecs: DecorPlanScatterSpec[] = []
  const { triesPerPoint, scale } = collision.sampling
  const [scaleMin, scaleMax] = scale

  for (const category of collision.sampling.order) {
    if (category === 'water' || category === 'road' || category === 'building' || category === 'pedestal') {
      continue
    }
    for (const [zoneKey, entry] of Object.entries(decor.zones)) {
      const panel = panelByKey.get(entry.panel)
      if (panel === undefined) continue
      for (const spec of entry.scatter ?? []) {
        if (categoryOfKind(spec.kind) !== category) continue
        const spots = sampleScatter({
          map, collision, panel, panels: input.panels, zone: zoneKey,
          kind: spec.kind, count: spec.count, seed: spec.seed,
          ...(spec.variant !== undefined ? { variant: spec.variant } : {}),
          category: category as DecorCategory,
          worldHalf: input.worldHalf, triesPerPoint, scaleMin, scaleMax,
        })
        scatterSpecs.push({
          zone: zoneKey,
          kind: spec.kind,
          ...(spec.variant !== undefined ? { variant: spec.variant } : {}),
          seed: spec.seed,
          count: spec.count,
          spots,
        })
      }
    }
  }

  const { kept, trimmed } = trimScatterToMeshBudget(
    scatterSpecs, input.maxScatterMeshes,
    (kind) => map.priorityOf(categoryOfKind(kind) ?? 'flora'),
  )

  // Solapamientos preexistentes (fijo vs fijo): se oculta el lado landmark
  // (los edificios del solver son autoritativos, T-089) y su huella sale del
  // mapa (no se renderiza ⇒ no existe).
  const hidden = new Set<string>()
  for (const pair of map.overlappingPairs()) {
    const aIsLandmark = pair.a.id.startsWith('landmark:')
    const bIsLandmark = pair.b.id.startsWith('landmark:')
    const victim = aIsLandmark === bIsLandmark
      ? (pair.a.priority >= pair.b.priority ? pair.a : pair.b)
      : aIsLandmark ? pair.a : pair.b
    if (victim.id.startsWith('landmark:')) {
      const id = victim.id.slice('landmark:'.length)
      hidden.add(id)
      map.removeById(victim.id)
    }
  }

  return { water, scatterSpecs: kept, map, omittedWater, trimmed, hiddenLandmarks: [...hidden].sort() }
}

/** AC-2: poisson-disk determinista por zona (rechazo con distancia mínima =
 * suma de huellas, que el propio mapa impide pisar) + reglas de agua/zona. */
function sampleScatter(args: {
  map: OccupancyMap
  collision: DecorCollision
  panel: PlanPanel
  panels: readonly PlanPanel[]
  zone: string
  kind: string
  count: number
  seed: number
  variant?: 'pine' | 'round'
  category: DecorCategory
  worldHalf: number
  triesPerPoint: number
  scaleMin: number
  scaleMax: number
}): readonly DecorPlanSpot[] {
  const { map, panel, panels, zone, kind, count, seed, variant, category, worldHalf, triesPerPoint } = args
  const inset = args.collision.zones.inset - args.collision.zones.grow
  const radius = map.radiusOf(category)
  const rect = {
    minX: panel.rect.minX + inset,
    maxX: panel.rect.maxX - inset,
    minZ: panel.rect.minZ + inset,
    maxZ: panel.rect.maxZ - inset,
  }
  const rng = mulberry32(fnv1a(`${zone}:${String(seed)}:${kind}:${variant ?? '-'}`))
  const spots: DecorPlanSpot[] = []
  for (let index = 0; index < count; index += 1) {
    for (let attempt = 0; attempt < triesPerPoint; attempt += 1) {
      const x = rect.minX + rng() * (rect.maxX - rect.minX)
      const z = rect.minZ + rng() * (rect.maxZ - rect.minZ)
      if (Math.abs(x) > worldHalf || Math.abs(z) > worldHalf) continue
      // AC-4: una zona por objeto (centro de panel más cercano).
      const nearest = nearestPanel(panels, x, z)
      if (nearest === null || nearest.key !== panel.key) continue
      if (!map.canPlace(category, kind, x, z, radius)) continue
      const scale = args.scaleMin + rng() * (args.scaleMax - args.scaleMin)
      const rotY = rng() * Math.PI * 2
      map.addCircle(category, kind, x, z, radius, `${zone}:${kind}:${variant ?? '-'}:${String(spots.length)}`)
      spots.push({ x, z, scale, rotY })
      break
    }
  }
  return spots
}
