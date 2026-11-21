// Reglas de NO-solapamiento de la decoración (SPEC-O/T-095, AC-1): esquema de
// content/board/decor.collision.json, categoría de cada kind (AC-5: ningún
// objeto sin categoría), chequeo de color por categoría (colorSanity) y el
// OccupancyMap único: toda huella 2D (círculo u OBB) se registra acá y nada se
// coloca si pisa algo de prioridad mayor o igual (salvo allowOverlap). Puro,
// sin node:fs ni THREE; lo consumen apps/web (escena) y tools/decor-report.ts.
import { z } from 'zod'
import type { Decor, DecorKind } from './decor.ts'
import { DECOR_KINDS } from './decor.ts'
import {
  distPointToPolygon,
  distPointToSegment,
  type Obb,
  type Vec2,
} from './placements-geometry.ts'

// ── Categorías (SPEC-O/T-095/AC-1) ──────────────────────────────────────────

/** Categorías de ocupación: menor número = más intocable. */
export const DECOR_CATEGORIES = [
  'road', 'building', 'pedestal', 'water', 'mountain',
  'landmarkProp', 'tree', 'rock', 'bush', 'flora', 'patch',
] as const
export type DecorCategory = (typeof DECOR_CATEGORIES)[number]

/** AC-5: todo kind (catálogo + edgeProps de style.json) tiene categoría. */
const KIND_CATEGORY: Readonly<Record<string, DecorCategory>> = {
  house: 'building', pokecenter: 'building', market: 'building', lab: 'building', gym: 'building',
  tree: 'tree', deadTree: 'tree', bush: 'bush', rock: 'rock', mountain: 'mountain',
  pond: 'water', reeds: 'flora', grassTuft: 'flora', flowerPatch: 'flora',
  lavaPool: 'patch', mist: 'patch',
  fence: 'landmarkProp', sign: 'landmarkProp', lamp: 'landmarkProp', flag: 'landmarkProp',
  mushroom: 'flora', pebble: 'flora', fern: 'flora', dryGrass: 'flora', deadBush: 'flora',
}

export function categoryOfKind(kind: string): DecorCategory | null {
  return KIND_CATEGORY[kind] ?? null
}

// ── Esquema ─────────────────────────────────────────────────────────────────

const CategoryRuleSchema = z.object({
  priority: z.number().int().min(0),
  radius: z.number().positive().optional(),
  shape: z.literal('obb').optional(),
  source: z.string().optional(),
  kinds: z.array(z.string().min(1)).optional(),
  edgeBuffer: z.number().min(0).optional(),
  nodeBuffer: z.number().min(0).optional(),
  margin: z.number().min(0).optional(),
  radiusFrom: z.string().optional(),
  note: z.string().optional(),
})

const ColorRangeSchema = z.object({
  hue: z.tuple([z.number().min(0).max(360), z.number().min(0).max(360)]).optional(),
  maxSaturation: z.number().min(0).max(1).optional(),
  _nota: z.string().optional(),
})

export const DecorCollisionSchema = z
  .object({
    _status: z.string().optional(),
    categories: z.record(z.string().min(1), CategoryRuleSchema),
    allowOverlap: z.array(z.tuple([z.string().min(1), z.string().min(1)])),
    waterRules: z.object({
      /** Zonas (decor.json) que llevan un cuerpo de agua diseñado. */
      zones: z.array(z.string().min(1)),
      keepFree: z.array(z.string().min(1)),
      shoreBand: z.number().min(0),
      shoreAllows: z.array(z.string().min(1)),
      minRadius: z.number().positive(),
      preferredRadius: z.number().positive(),
      /** El agua no traga caminos: gap físico contra piedra (r 0,2) y cinta. */
      roadGap: z.object({ node: z.number().min(0), edge: z.number().min(0) }).default({ node: 0.25, edge: 0.15 }),
      /** Q-068: el agua puede pasar por DEBAJO de las aristas (cinta como puente
       *  decorativo); los nodos (piedras) siguen intocables. La cinta del camino
       *  queda plana sobre la depresión del terreno ⇒ efecto puente gratis. */
      underRoads: z.boolean().default(false),
    }),
    zones: z.object({
      assign: z.literal('nearestPanelCenter'),
      inset: z.number().min(0),
      note: z.string().optional(),
    }),
    sampling: z.object({
      method: z.literal('poisson-disk'),
      triesPerPoint: z.number().int().min(1),
      seedFromZone: z.boolean(),
      scale: z.tuple([z.number().positive(), z.number().positive()]),
      order: z.array(z.string().min(1)),
    }),
    colorSanity: z.record(z.string(), ColorRangeSchema),
    report: z.object({ svg: z.string().min(1), json: z.string().min(1) }),
  })
  .strict()
export type DecorCollision = z.infer<typeof DecorCollisionSchema>

// ── colorSanity (AC-5) ──────────────────────────────────────────────────────

export interface Rgb {
  readonly r: number
  readonly g: number
  readonly b: number
}

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex)
  if (m === null) return null
  const value = Number.parseInt(m[1]!, 16)
  return { r: ((value >> 16) & 0xff) / 255, g: ((value >> 8) & 0xff) / 255, b: (value & 0xff) / 255 }
}

export interface Hsl {
  readonly h: number
  readonly s: number
  readonly l: number
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h: h * 360, s, l }
}

/** Rango de color aceptado por categoría (sin rango ⇒ todo pasa). */
export interface ColorRange {
  readonly hue?: readonly [number, number]
  readonly maxSaturation?: number
}

/** AC-5: el color dominante de una instancia debe caer en el rango de su
 * categoría; si no, se usa la pieza procedural. */
export function colorPassesSanity(range: ColorRange | null, rgb: Rgb): boolean {
  if (range === null) return true
  const { h, s } = rgbToHsl(rgb)
  if (range.hue !== undefined && (h < range.hue[0] - 1e-9 || h > range.hue[1] + 1e-9)) return false
  if (range.maxSaturation !== undefined && s > range.maxSaturation + 1e-9) return false
  return true
}

export function colorSanityOf(collision: DecorCollision, category: string): ColorRange | null {
  const entry = collision.colorSanity[category]
  if (entry === undefined) return null
  return {
    ...(entry.hue !== undefined ? { hue: entry.hue } : {}),
    ...(entry.maxSaturation !== undefined ? { maxSaturation: entry.maxSaturation } : {}),
  }
}

/** AC-5 (ayuda para la UI/modelos): hex dominante de un kind pasa colorSanity. */
export function hexPassesSanity(collision: DecorCollision, category: string, hex: string): boolean {
  const rgb = hexToRgb(hex)
  if (rgb === null) return false
  return colorPassesSanity(colorSanityOf(collision, category), rgb)
}

// ── RNG determinista (mismo algoritmo que apps/web rand.ts; content no puede
//    importar la web — duplicado a propósito, ver D-13/replay) ────────────────

export function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── OccupancyMap (AC-1) ─────────────────────────────────────────────────────

/** Huella registrada: círculo u OBB, con su categoría y prioridad. */
export interface DecorFootprint {
  readonly id: string
  readonly category: DecorCategory
  readonly kind: string
  readonly priority: number
  readonly x: number
  readonly z: number
  readonly radius: number
  readonly poly: readonly Vec2[] | null
  /** true = preexistente (edificio/pedestal/landmark), no lo coloca el plan. */
  readonly fixed: boolean
}

export interface DecorOverlapPair {
  readonly a: DecorFootprint
  readonly b: DecorFootprint
  readonly distance: number
}

const EPS = 1e-9

/** Mapa de ocupación único: registra huellas y decide si algo entra. */
export class OccupancyMap {
  private readonly footprints: DecorFootprint[] = []
  private readonly roadNodes: readonly Vec2[] = []
  private readonly roadEdges: readonly { readonly a: Vec2; readonly b: Vec2 }[] = []
  readonly collision: DecorCollision

  constructor(collision: DecorCollision) {
    this.collision = collision
  }

  get all(): readonly DecorFootprint[] {
    return this.footprints
  }

  priorityOf(category: DecorCategory): number {
    return this.collision.categories[category]?.priority ?? 99
  }

  radiusOf(category: DecorCategory): number {
    return this.collision.categories[category]?.radius ?? 0.1
  }

  addRoadNode(node: Vec2): void {
    ;(this.roadNodes as Vec2[]).push(node)
  }

  addRoadEdge(a: Vec2, b: Vec2): void {
    ;(this.roadEdges as { a: Vec2; b: Vec2 }[]).push({ a, b })
  }

  addCircle(
    category: DecorCategory,
    kind: string,
    x: number,
    z: number,
    radius: number,
    id: string,
    fixed = false,
  ): void {
    this.footprints.push({
      id, category, kind, priority: this.priorityOf(category), x, z, radius, poly: null, fixed,
    })
  }

  addObb(category: DecorCategory, kind: string, obb: Obb, id: string, fixed = false): void {
    const center = {
      x: (obb[0].x + obb[2].x) / 2,
      z: (obb[0].z + obb[2].z) / 2,
    }
    this.footprints.push({
      id, category, kind, priority: this.priorityOf(category),
      x: center.x, z: center.z, radius: 0, poly: obb, fixed,
    })
  }

  /** Saca una huella del mapa (landmark oculto: no se renderiza ⇒ no existe). */
  removeById(id: string): void {
    const index = this.footprints.findIndex((f) => f.id === id)
    if (index >= 0) (this.footprints as DecorFootprint[]).splice(index, 1)
  }

  private allowedPair(a: DecorCategory, b: DecorCategory): boolean {
    return this.collision.allowOverlap.some(
      ([left, right]) => (left === a && right === b) || (left === b && right === a),
    )
  }

  private waterMargin(): number {
    return this.collision.categories.water?.margin ?? 0.35
  }

  private distanceTo(footprint: DecorFootprint, x: number, z: number): number {
    if (footprint.poly !== null) return distPointToPolygon({ x, z }, footprint.poly)
    return Math.hypot(x - footprint.x, z - footprint.z) - footprint.radius
  }

  /**
   * AC-2/AC-3: ¿entra un círculo (category, kind, radio) en (x, z)? Regla:
   * no pisar nada de prioridad mayor o igual (salvo allowOverlap), respetar
   * los buffers de caminos/nodos y las reglas del agua (margin/shoreBand).
   */
  canPlace(
    category: DecorCategory,
    kind: string,
    x: number,
    z: number,
    radius: number,
  ): boolean {
    return this.blockReason(category, kind, x, z, radius) === null
  }

  blockReason(
    category: DecorCategory,
    kind: string,
    x: number,
    z: number,
    radius: number,
  ): string | null {
    const road = this.collision.categories.road
    const myPriority = this.priorityOf(category)
    for (const node of this.roadNodes) {
      if (Math.hypot(x - node.x, z - node.z) < (road?.nodeBuffer ?? 0.4) + radius - EPS) {
        return `road: nodo a ${Math.hypot(x - node.x, z - node.z).toFixed(2)} < ${(road?.nodeBuffer ?? 0.4) + radius}`
      }
    }
    for (const edge of this.roadEdges) {
      const d = distPointToSegment({ x, z }, edge.a, edge.b)
      if (d < (road?.edgeBuffer ?? 0.45) + radius - EPS) {
        return `road: arista a ${d.toFixed(2)}`
      }
    }
    const water = this.collision.waterRules
    for (const f of this.footprints) {
      if (f.category === 'water') {
        // AC-3: dentro del agua no va nada; alrededor, solo lo permitido.
        const d = Math.hypot(x - f.x, z - f.z)
        const shoreOnly = water.shoreAllows.includes(kind)
        if (d < f.radius + radius - EPS) {
          if (d < f.radius - EPS) return `water: dentro del agua (${d.toFixed(2)} < ${f.radius})`
          if (water.keepFree.includes(category)) {
            return `water: ${category} en el margen (${d.toFixed(2)} < ${(f.radius + this.waterMargin() + radius).toFixed(2)})`
          }
          if (!shoreOnly) {
            return `water: ${kind} en la orilla (solo ${water.shoreAllows.join('/')})`
          }
          continue
        }
        if (water.keepFree.includes(category) && d < f.radius + this.waterMargin() + radius - EPS) {
          return `water: ${category} en el margen (${d.toFixed(2)} < ${(f.radius + this.waterMargin() + radius).toFixed(2)})`
        }
        if (!shoreOnly && !water.keepFree.includes(category) &&
          d < f.radius + water.shoreBand + radius - EPS) {
          return `water: orilla (${d.toFixed(2)}) reservada a ${water.shoreAllows.join('/')}`
        }
        continue
      }
      const d = this.distanceTo(f, x, z)
      if (d < radius - EPS && f.priority <= myPriority && !this.allowedPair(category, f.category)) {
        return `overlap: ${category} pisa ${f.category} (${f.id}, ${d.toFixed(2)})`
      }
    }
    return null
  }

  /** Distancia libre en (x, z) al obstáculo más cercano (nodos, aristas,
   * huellas); para ubicar el agua en el punto con más espacio (AC-3). */
  freeDistanceAt(x: number, z: number): number {
    let free = Number.POSITIVE_INFINITY
    for (const node of this.roadNodes) {
      free = Math.min(free, Math.hypot(x - node.x, z - node.z))
    }
    for (const edge of this.roadEdges) {
      free = Math.min(free, distPointToSegment({ x, z }, edge.a, edge.b))
    }
    for (const f of this.footprints) {
      free = Math.min(free, Math.max(0, this.distanceTo(f, x, z)))
    }
    return free
  }

  /**
   * AC-3: espacio libre para ubicar el AGUA: los caminos cuentan por su
   * huella física (piedra del nodo / cinta) porque el margen del agua no
   * aplica a caminos (un camino puede besar la orilla); el resto (edificios,
   * pedestales, landmarks) exige el margen del agua. Q-068: con
   * `underRoads: true` las ARISTAS no restringen el agua (la cinta queda
   * como puente sobre la depresión); los nodos siguen intocables.
   */
  waterFreeDistanceAt(x: number, z: number, margin: number): number {
    const water = this.collision.waterRules
    const gap = water.roadGap
    let free = Number.POSITIVE_INFINITY
    for (const node of this.roadNodes) {
      free = Math.min(free, Math.hypot(x - node.x, z - node.z) - gap.node)
    }
    if (!water.underRoads) {
      for (const edge of this.roadEdges) {
        free = Math.min(free, distPointToSegment({ x, z }, edge.a, edge.b) - gap.edge)
      }
    }
    for (const f of this.footprints) {
      if (f.category === 'water') continue
      free = Math.min(free, Math.max(0, this.distanceTo(f, x, z)) - margin)
    }
    return free
  }

  /** Pares de huellas que se pisan sin permiso (para el reporte, AC-6). Los
   * juncos/guijarros pueden tocar la orilla del agua (AC-3: shoreAllows). */
  overlappingPairs(): readonly DecorOverlapPair[] {
    const pairs: DecorOverlapPair[] = []
    for (let i = 0; i < this.footprints.length; i += 1) {
      for (let j = i + 1; j < this.footprints.length; j += 1) {
        const a = this.footprints[i]!
        const b = this.footprints[j]!
        if (this.allowedPair(a.category, b.category)) continue
        if (a.category === 'water' && this.shoreTouchOk(b, a)) continue
        if (b.category === 'water' && this.shoreTouchOk(a, b)) continue
        const distance = pairDistance(a, b)
        if (distance < -EPS) pairs.push({ a, b, distance })
      }
    }
    return pairs
  }

  /** true si `piece` es un kind de orilla con el centro fuera del agua. */
  private shoreTouchOk(piece: DecorFootprint, water: DecorFootprint): boolean {
    if (!this.collision.waterRules.shoreAllows.includes(piece.kind)) return false
    return Math.hypot(piece.x - water.x, piece.z - water.z) >= water.radius - EPS
  }
}

function pairDistance(a: DecorFootprint, b: DecorFootprint): number {
  if (a.poly !== null && b.poly !== null) return polygonDistance(a.poly, b.poly)
  if (a.poly !== null) return distPointToPolygon({ x: b.x, z: b.z }, a.poly) - b.radius
  if (b.poly !== null) return distPointToPolygon({ x: a.x, z: a.z }, b.poly) - a.radius
  return Math.hypot(a.x - b.x, a.z - b.z) - a.radius - b.radius
}

function polygonDistance(a: readonly Vec2[], b: readonly Vec2[]): number {
  for (const p of a) if (distPointToPolygon(p, b) === 0) return -1
  for (const p of b) if (distPointToPolygon(p, a) === 0) return -1
  return 0
}

// ── Chequeos cruzados (los consume content:validate) ────────────────────────

/** AC-1/AC-5: el archivo de colisión y su cruce con decor.json cierran. */
export function crossCheckDecorCollision(collision: DecorCollision, decor?: Decor): string[] {
  const errors: string[] = []
  const categories = new Set(Object.keys(collision.categories))
  const known = new Set<string>(DECOR_CATEGORIES)
  for (const category of DECOR_CATEGORIES) {
    if (!categories.has(category)) {
      errors.push(`decor.collision.json: falta la categoría "${category}"`)
    }
  }
  for (const category of categories) {
    if (!known.has(category)) {
      errors.push(`decor.collision.json: categoría desconocida "${category}" (catálogo DECOR_CATEGORIES)`)
    }
  }
  const checkName = (name: string, what: string): void => {
    if (!categories.has(name) && !known.has(name)) {
      errors.push(`decor.collision.json: ${what} "${name}" no es una categoría`)
    }
  }
  for (const [a, b] of collision.allowOverlap) {
    checkName(a, 'allowOverlap')
    checkName(b, 'allowOverlap')
  }
  for (const category of collision.sampling.order) checkName(category, 'sampling.order')
  for (const category of collision.waterRules.keepFree) checkName(category, 'waterRules.keepFree')
  if (collision.waterRules.minRadius > collision.waterRules.preferredRadius) {
    errors.push('decor.collision.json: waterRules.minRadius > preferredRadius')
  }
  for (const category of Object.keys(collision.colorSanity)) {
    if (category.startsWith('_')) continue
    checkName(category, 'colorSanity')
  }
  if (decor !== undefined) {
    for (const zone of collision.waterRules.zones) {
      if (decor.zones[zone] === undefined) {
        errors.push(`decor.collision.json: waterRules.zones "${zone}" no es una zona de decor.json`)
      }
    }
    const kinds: string[] = []
    for (const [zone, entry] of Object.entries(decor.zones)) {
      for (const spec of entry.scatter ?? []) kinds.push(`${zone}:${spec.kind}`)
    }
    for (const [nodeId, pieces] of Object.entries(decor.landmarks?.byNodeId ?? {})) {
      for (const piece of pieces) kinds.push(`${nodeId}:${piece.kind}`)
    }
    for (const [type, pieces] of Object.entries(decor.landmarks?.byNodeType ?? {})) {
      for (const piece of pieces) kinds.push(`${type}:${piece.kind}`)
    }
    for (const label of kinds) {
      const kind = label.slice(label.indexOf(':') + 1)
      if (categoryOfKind(kind) === null) {
        errors.push(`decor.collision.json: kind "${kind}" (${label}) sin categoría (AC-5)`)
      }
    }
    // AC-5: la paleta procedural pasa colorSanity de su categoría.
    const paletteChecks: readonly [string, DecorCategory][] = [
      ['leafGreen', 'tree'], ['leafDark', 'tree'], ['rock', 'rock'], ['water', 'water'],
    ]
    for (const [key, category] of paletteChecks) {
      const hex = decor.palette[key]
      if (hex !== undefined && !hexPassesSanity(collision, category, hex)) {
        errors.push(`decor.json: palette.${key} ${hex} fuera del rango colorSanity de "${category}"`)
      }
    }
  }
  return errors
}

/** Kinds del catálogo con categoría (AC-5: tienen que ser todos). */
export function kindsWithCategory(): readonly DecorKind[] {
  return DECOR_KINDS.filter((kind) => categoryOfKind(kind) !== null)
}
