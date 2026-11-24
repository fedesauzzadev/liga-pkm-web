// AC: SPEC-O/T-095 — plan de decoración sin solapamientos (mapa de ocupación
// único). Una prueba por AC numérico del spec; el tablero REAL se prueba en
// tests/decor-report.test.ts (tool) y apps/web t095 (escena).
import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  categoryOfKind, colorSanityOf, crossCheckDecorCollision, DecorCollisionSchema,
  hexPassesSanity, kindsWithCategory, OccupancyMap,
} from './decor-collision.ts'
import { DECOR_KINDS, DecorSchema, type Decor } from './decor.ts'
import {
  nearestPanel, panelRectOf, planDecor, trimScatterToMeshBudget,
  type DecorPlanInput, type PlanPanel,
} from './decor-plan.ts'
import type { Vec2 } from './placements.ts'

const collision = DecorCollisionSchema.parse(
  JSON.parse(readFileSync(new URL('../../../content/board/decor.collision.json', import.meta.url), 'utf8')) as unknown,
)

const decor: Decor = DecorSchema.parse({
  palette: { leafGreen: '#4E9D5B', leafDark: '#2F7A45', rock: '#8C8577', water: '#4F8FD6' },
  zones: {
    isla: {
      panel: 'isla', margin: 0.5,
      scatter: [
        { kind: 'rock', count: 6, seed: 32 },
        { kind: 'reeds', count: 6, seed: 33 },
      ],
    },
    montana: {
      panel: 'montana', margin: 0.5,
      scatter: [
        { kind: 'mountain', count: 3, seed: 21 },
        { kind: 'rock', count: 6, seed: 22 },
      ],
    },
  },
  budgets: { maxDrawCalls: 120, maxTriangles: 150000, maxModelsMB: 20 },
  clearance: { fromNodeCenter: 0.45, fromEdge: 0.3 },
})

const nodes: readonly Vec2[] = [{ x: 0, z: 0 }, { x: 1.5, z: 0 }]
const edges = [{ a: { x: 0, z: 0 }, b: { x: 1.5, z: 0 } }]
const panels: readonly PlanPanel[] = [
  { key: 'isla', rect: { minX: 4, maxX: 10, minZ: 0, maxZ: 6 }, anchor: { x: 4.3, z: 0.4 } },
  { key: 'montana', rect: { minX: -10, maxX: -4, minZ: 0, maxZ: 6 }, anchor: { x: -4.3, z: 0.4 } },
]

const planInput: DecorPlanInput = {
  collision,
  decor,
  nodes,
  edges,
  panels,
  buildings: [],
  landmarkPieces: [
    { id: 'n0:0', kind: 'lamp', category: 'landmarkProp', x: 0.3, z: 0.5, scale: 1, buildingRadius: 0, hasObb: false },
  ],
  worldHalf: 12,
  maxScatterMeshes: 50,
}

const plan = planDecor(planInput)
const MARGIN = collision.categories.water?.margin ?? 0.35
const SHORE = collision.waterRules.shoreBand
const keepFree = new Set(collision.waterRules.keepFree)

// AC: SPEC-O/T-095/AC-1 - un único mapa registra TODO y ningún kind sin categoría
test('AC: SPEC-O/T-095/AC-1 - mapa de ocupación único; ningún kind queda sin categoría', () => {
  expect(kindsWithCategory()).toHaveLength(DECOR_KINDS.length)
  expect(categoryOfKind('mist')).toBe('patch')
  expect(categoryOfKind('reeds')).toBe('flora')
  expect(categoryOfKind('lamp')).toBe('landmarkProp')
  const categories = new Set(plan.map.all.map((f) => f.category))
  for (const expected of ['pedestal', 'water', 'mountain', 'landmarkProp', 'rock', 'flora'] as const) {
    expect(categories.has(expected), `huella de ${expected} registrada`).toBe(true)
  }
  // El farol fijo del fixture también vive en el mapa (nada fuera del mecanismo).
  expect(plan.map.all.some((f) => f.id === 'landmark:n0:0' && f.fixed)).toBe(true)
})

// AC: SPEC-O/T-095/AC-2 - orden por prioridad + poisson-disk determinista
test('AC: SPEC-O/T-095/AC-2 - poisson-disk: misma categoría separada por la suma de huellas', () => {
  const mountains = plan.map.all.filter((f) => f.category === 'mountain' && !f.fixed)
  expect(mountains.length).toBeGreaterThanOrEqual(2)
  for (let i = 0; i < mountains.length; i += 1) {
    for (let j = i + 1; j < mountains.length; j += 1) {
      const a = mountains[i]!
      const b = mountains[j]!
      const distance = Math.hypot(a.x - b.x, a.z - b.z) - a.radius - b.radius
      expect(distance, `montañas ${a.id}/${b.id} se pisan`).toBeGreaterThanOrEqual(-1e-6)
    }
  }
})

// AC: SPEC-O/T-095/AC-3 - agua limpia: primero, con margen y orilla
test('AC: SPEC-O/T-095/AC-3 - agua en el punto más libre, margen limpio y orilla solo juncos', () => {
  expect(plan.omittedWater).toEqual([])
  const water = plan.water.find((entry) => entry.zone === 'isla')
  expect(water).toBeDefined()
  if (water === undefined) throw new Error('sin agua')
  expect(water.radius).toBeGreaterThanOrEqual(collision.waterRules.minRadius - 1e-6)
  expect(water.radius).toBeLessThanOrEqual(collision.waterRules.preferredRadius + 1e-6)
  for (const f of plan.map.all) {
    if (f.id === `water:${water.zone}`) continue
    const d = Math.hypot(f.x - water.x, f.z - water.z)
    if (keepFree.has(f.category)) {
      expect(
        d, `${f.category} ${f.id} en el margen del agua`,
      ).toBeGreaterThanOrEqual(water.radius + MARGIN + f.radius - 1e-6)
    } else if (!collision.waterRules.shoreAllows.includes(f.kind)) {
      expect(
        d, `${f.kind} ${f.id} en la orilla del agua`,
      ).toBeGreaterThanOrEqual(water.radius + SHORE + f.radius - 1e-6)
    } else {
      expect(d, `${f.kind} ${f.id} dentro del agua`).toBeGreaterThanOrEqual(water.radius - 1e-6)
    }
  }
  // El pedestal de la zona ya NO queda dentro del lago (bug de T-069).
  const pedestal = plan.map.all.find((f) => f.id === 'pedestal:isla')
  expect(pedestal).toBeDefined()
  if (pedestal !== undefined) {
    expect(Math.hypot(pedestal.x - water.x, pedestal.z - water.z)).toBeGreaterThanOrEqual(
      water.radius + MARGIN + pedestal.radius - 1e-6,
    )
  }
})

test('AC: SPEC-O/T-095/AC-3 - si el estanque no entra (panel chico), se omite', () => {
  const tiny: DecorPlanInput = {
    ...planInput,
    panels: [{ key: 'isla', rect: { minX: 4, maxX: 5.2, minZ: 0, maxZ: 1.2 }, anchor: { x: 4.3, z: 0.4 } }],
  }
  const tinyPlan = planDecor(tiny)
  expect(tinyPlan.omittedWater).toContain('isla')
  expect(tinyPlan.water).toHaveLength(0)
})

// AC: SPEC-O/T-095/AC-4 - una zona por objeto (centro de panel más cercano + inset)
test('AC: SPEC-O/T-095/AC-4 - cada objeto dentro de SU zona con inset', () => {
  const inset = collision.zones.inset - collision.zones.grow
  for (const spec of plan.scatterSpecs) {
    const panel = panels.find((candidate) => candidate.key === decor.zones[spec.zone]?.panel)
    expect(panel, `panel de la zona ${spec.zone}`).toBeDefined()
    if (panel === undefined) continue
    expect(spec.spots.length, `${spec.kind} en ${spec.zone} consiguió lugar`).toBeGreaterThan(0)
    for (const spot of spec.spots) {
      expect(nearestPanel(panels, spot.x, spot.z)?.key, `${spec.kind} fuera de su zona`).toBe(panel.key)
      expect(spot.x).toBeGreaterThanOrEqual(panel.rect.minX + inset - 1e-6)
      expect(spot.x).toBeLessThanOrEqual(panel.rect.maxX - inset + 1e-6)
      expect(spot.z).toBeGreaterThanOrEqual(panel.rect.minZ + inset - 1e-6)
      expect(spot.z).toBeLessThanOrEqual(panel.rect.maxZ - inset + 1e-6)
    }
  }
})

// AC: SPEC-O/T-095/AC-5 - colorSanity por categoría (objetos celestes → procedural)
test('AC: SPEC-O/T-095/AC-5 - colorSanity: fuera de rango no pasa', () => {
  expect(hexPassesSanity(collision, 'tree', '#4E9D5B')).toBe(true)
  expect(hexPassesSanity(collision, 'tree', '#4F8FD6'), 'árbol celeste = cristal').toBe(false)
  expect(hexPassesSanity(collision, 'bush', '#2F7A45')).toBe(true)
  expect(hexPassesSanity(collision, 'rock', '#8C8577')).toBe(true)
  expect(hexPassesSanity(collision, 'rock', '#E8483B'), 'roca saturada').toBe(false)
  expect(hexPassesSanity(collision, 'water', '#4F8FD6')).toBe(true)
  expect(hexPassesSanity(collision, 'water', '#4E9D5B'), 'agua verde').toBe(false)
  expect(colorSanityOf(collision, 'mountain')).toBeNull()
})

// AC: SPEC-O/T-095/AC-7 - cero solapamientos, nada sobre caminos, determinismo
test('AC: SPEC-O/T-095/AC-7 - cero solapamientos y nada sobre caminos/nodos', () => {
  expect(plan.map.overlappingPairs()).toEqual([])
  const road = collision.categories.road
  for (const f of plan.map.all) {
    if (f.fixed) continue // edificios/pedestales/landmarks rigen por T-089/offsets
    for (const node of nodes) {
      expect(Math.hypot(f.x - node.x, f.z - node.z), `${f.id} sobre el nodo`).toBeGreaterThanOrEqual(
        (road?.nodeBuffer ?? 0.4) + f.radius - 1e-6,
      )
    }
    for (const edge of edges) {
      const dx = edge.b.x - edge.a.x
      const dz = edge.b.z - edge.a.z
      const len2 = dx * dx + dz * dz
      const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((f.x - edge.a.x) * dx + (f.z - edge.a.z) * dz) / len2))
      const distance = Math.hypot(f.x - (edge.a.x + dx * t), f.z - (edge.a.z + dz * t))
      expect(distance, `${f.id} sobre el camino`).toBeGreaterThanOrEqual((road?.edgeBuffer ?? 0.45) + f.radius - 1e-6)
    }
  }
})

test('AC: SPEC-O/T-095/AC-7 - mismo seed ⇒ mismo resultado', () => {
  const again = planDecor(planInput)
  expect(JSON.stringify(again.water)).toBe(JSON.stringify(plan.water))
  expect(JSON.stringify(again.scatterSpecs)).toBe(JSON.stringify(plan.scatterSpecs))
  expect(again.hiddenLandmarks).toEqual(plan.hiddenLandmarks)
})

test('AC: SPEC-O/T-095/AC-7 - presupuesto: se quita primero lo de menor prioridad', () => {
  const specs = [...plan.scatterSpecs]
  expect(specs.length).toBeGreaterThan(1)
  const priorityOf = (kind: string): number => collision.categories[categoryOfKind(kind) ?? 'flora']?.priority ?? 99
  const { kept, trimmed } = trimScatterToMeshBudget(specs, 1, priorityOf)
  expect(kept).toHaveLength(1)
  expect(trimmed.length).toBe(specs.length - 1)
  // mountain (3) es la más prioritaria; flora/reeds (6) se van primero.
  expect(kept[0]?.kind).toBe('mountain')
  expect(trimmed.some((id) => id.endsWith(':reeds'))).toBe(true)
})

test('SPEC-O/T-095 - crossCheck del archivo real de colisión cruza con decor.json real', () => {
  const realDecor = DecorSchema.parse(
    JSON.parse(readFileSync(new URL('../../../content/board/decor.json', import.meta.url), 'utf8')) as unknown,
  )
  expect(crossCheckDecorCollision(collision, realDecor)).toEqual([])
})

test('SPEC-O/T-095 - panelRectOf mapea px a mundo sin margen', () => {
  const rect = panelRectOf({ x: 555, y: 785, w: 270, h: 385 }, [1176, 1600])
  expect(rect.minX).toBeCloseTo(-0.33, 6)
  expect(rect.maxX).toBeCloseTo(2.37, 6)
  expect(rect.minZ).toBeCloseTo(-0.15, 6)
  expect(rect.maxZ).toBeCloseTo(3.7, 6)
})

test('SPEC-O/T-095 - OccupancyMap: canPlace respeta prioridad y allowOverlap', () => {
  const map = new OccupancyMap(collision)
  map.addCircle('water', 'lake', 0, 0, 1.0, 'water:isla')
  // árbol (keepFree) fuera del margen falla; flora común tampoco entra a la orilla.
  expect(map.canPlace('tree', 'tree', 1.2, 0, 0.35)).toBe(false)
  expect(map.canPlace('flora', 'grassTuft', 1.2, 0, 0.1)).toBe(false)
  // juncos: permitidos pegados a la orilla (fuera del agua).
  expect(map.canPlace('flora', 'reeds', 1.05, 0, 0.1)).toBe(true)
  // flora lejos del agua y sin nadie más: entra; después otra flora puede
  // solaparse (allowOverlap flora/flora) pero un árbol no la pisa… sí puede
  // (prioridad 4 < 6): lo permitido es pisar solo a MENOR prioridad.
  expect(map.canPlace('flora', 'grassTuft', 4, 4, 0.1)).toBe(true)
  map.addCircle('flora', 'grassTuft', 4, 4, 0.1, 'f1')
  expect(map.canPlace('flora', 'grassTuft', 4.05, 4, 0.1)).toBe(true)
  expect(map.canPlace('rock', 'rock', 4.05, 4, 0.3)).toBe(true)
  map.addCircle('rock', 'rock', 4.4, 4, 0.3, 'r1')
  // otra roca (misma prioridad) no puede pisarla.
  expect(map.canPlace('rock', 'rock', 4.5, 4, 0.3)).toBe(false)
  // flora sí puede vivir bajo la roca (allowOverlap flora/rock).
  expect(map.canPlace('flora', 'grassTuft', 4.4, 4, 0.1)).toBe(true)
})
