// Geometría 2D pura del solver de placements (SPEC-N/T-089): plano x/z del
// mundo (1 px del tablero = 0,01 u, origen en el centro de la imagen).
// Sin dependencias: solo tipos; las funciones son puras y deterministas.
export const PLACEMENTS_PX_TO_UNITS = 0.01

const DEG = Math.PI / 180

export interface Vec2 {
  readonly x: number
  readonly z: number
}

/** Esquinas de la OBB (cuadrado de lado `side` girado `yawDeg`). */
export type Obb = readonly [Vec2, Vec2, Vec2, Vec2]

export function obbCorners(center: Vec2, side: number, yawDeg: number): Obb {
  const half = side / 2
  const c = Math.cos(yawDeg * DEG)
  const s = Math.sin(yawDeg * DEG)
  const fx = half * c
  const fz = half * s
  const px = -half * s
  const pz = half * c
  return [
    { x: center.x + fx + px, z: center.z + fz + pz },
    { x: center.x + fx - px, z: center.z + fz - pz },
    { x: center.x - fx - px, z: center.z - fz - pz },
    { x: center.x - fx + px, z: center.z - fz + pz },
  ]
}

export function distPointToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x
  const abz = b.z - a.z
  const len2 = abx * abx + abz * abz
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2))
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t))
}

function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x)
}

function segmentsIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const d1 = cross(b1, b2, a1)
  const d2 = cross(b1, b2, a2)
  const d3 = cross(a1, a2, b1)
  const d4 = cross(a1, a2, b2)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

export function distSegmentToSegment(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): number {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0
  return Math.min(
    distPointToSegment(a1, b1, b2),
    distPointToSegment(a2, b1, b2),
    distPointToSegment(b1, a1, a2),
    distPointToSegment(b2, a1, a2),
  )
}

function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

export function distPointToPolygon(p: Vec2, poly: readonly Vec2[]): number {
  if (pointInPolygon(p, poly)) return 0
  let min = Number.POSITIVE_INFINITY
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    min = Math.min(min, distPointToSegment(p, poly[j]!, poly[i]!))
  }
  return min
}

export function distSegmentToPolygon(a: Vec2, b: Vec2, poly: readonly Vec2[]): number {
  if (pointInPolygon(a, poly) || pointInPolygon(b, poly)) return 0
  let min = Number.POSITIVE_INFINITY
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    min = Math.min(min, distSegmentToSegment(a, b, poly[j]!, poly[i]!))
  }
  return min
}

export function distPolygonToPolygon(a: readonly Vec2[], b: readonly Vec2[]): number {
  for (const p of a) if (pointInPolygon(p, b)) return 0
  for (const p of b) if (pointInPolygon(p, a)) return 0
  let min = Number.POSITIVE_INFINITY
  for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
    for (let k = 0, l = b.length - 1; k < b.length; l = k++) {
      min = Math.min(min, distSegmentToSegment(a[j]!, a[i]!, b[l]!, b[k]!))
    }
  }
  return min
}

/** 1 px = 0,01 u; origen en el centro del tablero (mismo mapeo que la escena). */
export function placementsPxToWorld(xPx: number, yPx: number, imageSize: readonly [number, number]): Vec2 {
  const width = imageSize[0]
  const height = imageSize[1]
  return {
    x: (xPx - width / 2) * PLACEMENTS_PX_TO_UNITS,
    z: (yPx - height / 2) * PLACEMENTS_PX_TO_UNITS,
  }
}
