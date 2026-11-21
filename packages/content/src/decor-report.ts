// Reporte de solapamientos de decoración (SPEC-O/T-095/AC-6): vista cenital
// del tablero en la orientación de la foto — caminos gris, edificios rojo,
// agua azul, árboles/arbustos verde, rocas marrón, flora en puntos y los
// solapamientos en rojo intenso. Funciones puras; el CLI `pnpm decor:report`
// (tools/decor-report.ts) escribe shots/decor-overlaps.svg + .report.json.
import type { DecorCollision } from './decor-collision.ts'
import type { DecorPlan, PlanPanel } from './decor-plan.ts'
import type { Vec2 } from './placements.ts'

export interface DecorReportInput {
  readonly collision: DecorCollision
  readonly imageSize: readonly [number, number]
  readonly nodes: readonly Vec2[]
  readonly edges: readonly { readonly a: Vec2; readonly b: Vec2 }[]
  readonly panels: readonly PlanPanel[]
}

export interface DecorOverlapRow {
  readonly a: string
  readonly b: string
  readonly categories: string
  readonly distance: number
}

export interface DecorReportJson {
  readonly countsByCategory: Readonly<Record<string, number>>
  readonly overlaps: readonly DecorOverlapRow[]
  readonly water: readonly { readonly zone: string; readonly x: number; readonly z: number; readonly radius: number }[]
  readonly omittedWater: readonly string[]
  readonly trimmed: readonly string[]
  readonly hiddenLandmarks: readonly string[]
  readonly totals: { readonly objects: number; readonly scatterSpots: number }
}

const CATEGORY_COLORS: Readonly<Record<string, string>> = {
  road: '#9a938a',
  building: '#C0392B',
  pedestal: '#6b655e',
  water: '#4F8FD6',
  mountain: '#b3543f',
  landmarkProp: '#c9a877',
  tree: '#4E9D5B',
  rock: '#8C6A3F',
  bush: '#2F7A45',
  flora: '#7FB069',
  patch: '#c9cdd4',
}

const OVERLAP_COLOR = '#FF1E00'

const px = (value: number): string => value.toFixed(1)

const toPx = (p: Vec2, imageSize: readonly [number, number]): Vec2 => ({
  x: p.x / 0.01 + imageSize[0] / 2,
  z: p.z / 0.01 + imageSize[1] / 2,
})

/** AC-6: SVG cenital (px, y hacia abajo = foto original) con las huellas. */
export function buildDecorOverlapsSvg(input: DecorReportInput, plan: DecorPlan): string {
  const [width, height] = input.imageSize
  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(width)} ${String(height)}" ` +
      `width="${String(width)}" height="${String(height)}">`,
  )
  parts.push(`<rect x="0" y="0" width="${String(width)}" height="${String(height)}" fill="#f2efe4"/>`)

  parts.push('<g id="panels">')
  for (const panel of input.panels) {
    const a = toPx({ x: panel.rect.minX, z: panel.rect.minZ }, input.imageSize)
    const b = toPx({ x: panel.rect.maxX, z: panel.rect.maxZ }, input.imageSize)
    parts.push(
      `<rect x="${px(a.x)}" y="${px(a.z)}" width="${px(b.x - a.x)}" height="${px(b.z - a.z)}" ` +
        'fill="none" stroke="#c5bfae" stroke-width="2" stroke-dasharray="8 6"/>',
    )
  }
  parts.push('</g>')

  parts.push('<g id="edges" stroke="#9a938a" stroke-width="14" stroke-linecap="round">')
  for (const edge of input.edges) {
    const a = toPx(edge.a, input.imageSize)
    const b = toPx(edge.b, input.imageSize)
    parts.push(`<line x1="${px(a.x)}" y1="${px(a.z)}" x2="${px(b.x)}" y2="${px(b.z)}"/>`)
  }
  parts.push('</g>')

  parts.push('<g id="nodes">')
  for (const node of input.nodes) {
    const p = toPx(node, input.imageSize)
    parts.push(`<circle cx="${px(p.x)}" cy="${px(p.z)}" r="14" fill="#9a938a" stroke="#5c5750" stroke-width="2"/>`)
  }
  parts.push('</g>')

  parts.push('<g id="footprints">')
  for (const footprint of plan.map.all) {
    const color = CATEGORY_COLORS[footprint.category] ?? '#000000'
    if (footprint.poly !== null) {
      const corners = footprint.poly
        .map((corner) => toPx(corner, input.imageSize))
        .map((corner) => `${px(corner.x)},${px(corner.z)}`)
        .join(' ')
      parts.push(`<polygon points="${corners}" fill="${color}" fill-opacity="0.45" stroke="#1c2430" stroke-width="2"/>`)
      continue
    }
    const p = toPx({ x: footprint.x, z: footprint.z }, input.imageSize)
    const radiusPx = footprint.radius / 0.01
    if (footprint.category === 'flora') {
      parts.push(`<circle cx="${px(p.x)}" cy="${px(p.z)}" r="3" fill="${color}"/>`)
    } else {
      parts.push(
        `<circle cx="${px(p.x)}" cy="${px(p.z)}" r="${px(Math.max(radiusPx, 4))}" ` +
          `fill="${color}" fill-opacity="0.4" stroke="${color}" stroke-width="2"/>`,
      )
    }
  }
  parts.push('</g>')

  const overlaps = plan.map.overlappingPairs()
  parts.push('<g id="overlaps">')
  for (const pair of overlaps) {
    const midpoint = toPx(
      { x: (pair.a.x + pair.b.x) / 2, z: (pair.a.z + pair.b.z) / 2 },
      input.imageSize,
    )
    parts.push(
      `<circle cx="${px(midpoint.x)}" cy="${px(midpoint.z)}" r="18" fill="none" ` +
        `stroke="${OVERLAP_COLOR}" stroke-width="6"/>` +
      `<line x1="${px(midpoint.x - 24)}" y1="${px(midpoint.z)}" x2="${px(midpoint.x + 24)}" y2="${px(midpoint.z)}" ` +
        `stroke="${OVERLAP_COLOR}" stroke-width="6"/>` +
      `<line x1="${px(midpoint.x)}" y1="${px(midpoint.z - 24)}" x2="${px(midpoint.x)}" y2="${px(midpoint.z + 24)}" ` +
        `stroke="${OVERLAP_COLOR}" stroke-width="6"/>`,
    )
  }
  parts.push('</g>')

  const counts = countsByCategory(input, plan)
  const legend = Object.entries(counts)
    .map(([category, count]) => `${category} ${String(count)}`)
    .join(' · ')
  parts.push(
    `<text x="16" y="28" font-family="monospace" font-size="18" fill="#1c2430">` +
      `decor T-095 — ${legend}</text>`,
  )
  parts.push(
    `<text x="16" y="52" font-family="monospace" font-size="18" ` +
      `fill="${overlaps.length === 0 ? '#2F7A45' : OVERLAP_COLOR}">solapamientos: ${String(overlaps.length)}` +
      `${plan.omittedWater.length === 0 ? '' : ` · agua omitida: ${plan.omittedWater.join(',')}`}` +
      `${plan.hiddenLandmarks.length === 0 ? '' : ` · landmarks ocultos: ${String(plan.hiddenLandmarks.length)}`}` +
      '</text>',
  )
  parts.push('</svg>')
  return parts.join('\n')
}

function countsByCategory(input: DecorReportInput, plan: DecorPlan): Record<string, number> {
  const counts: Record<string, number> = { road: input.nodes.length }
  for (const footprint of plan.map.all) {
    counts[footprint.category] = (counts[footprint.category] ?? 0) + 1
  }
  return counts
}

/** AC-6: JSON con cantidad por categoría y lista de pares solapados. */
export function buildDecorReportJson(input: DecorReportInput, plan: DecorPlan): DecorReportJson {
  const overlaps = plan.map.overlappingPairs().map((pair) => ({
    a: pair.a.id,
    b: pair.b.id,
    categories: `${pair.a.category}/${pair.b.category}`,
    distance: Math.round(pair.distance * 1000) / 1000,
  }))
  return {
    countsByCategory: countsByCategory(input, plan),
    overlaps,
    water: plan.water.map((water) => ({ zone: water.zone, x: water.x, z: water.z, radius: water.radius })),
    omittedWater: [...plan.omittedWater],
    trimmed: [...plan.trimmed],
    hiddenLandmarks: [...plan.hiddenLandmarks],
    totals: {
      objects: plan.map.all.length,
      scatterSpots: plan.scatterSpecs.reduce((sum, spec) => sum + spec.spots.length, 0),
    },
  }
}
