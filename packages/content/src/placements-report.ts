// Reporte de placements (SPEC-N/T-089/AC-7): SVG del tablero en la
// orientación de la foto + JSON por edificio. Funciones puras (sin fs/DOM);
// el CLI `pnpm placements:report` (tools/placements-report.ts) las consume.
import type { BoardGraph } from './board.ts'
import {
  PLACEMENTS_PX_TO_UNITS,
  obbCorners,
  type PlacementsPedestal,
  type PlacementSolution,
  type PlacementsFile,
  type Vec2,
} from './placements.ts'

export interface PlacementsReportInput {
  readonly placements: PlacementsFile
  readonly board: BoardGraph
  readonly pedestals: readonly PlacementsPedestal[]
  readonly imageSize: readonly [number, number]
}

export interface PlacementsReportRow {
  readonly nodeId: string
  readonly kind: string
  readonly sideDeg: number
  readonly dist: number
  readonly x: number
  readonly z: number
  readonly yawDeg: number
  readonly scale: number
  readonly height: number
  /** null = sin obstáculos de ese tipo en el tablero (Infinity en el solver). */
  readonly gaps: {
    readonly node: number
    readonly edge: number
    readonly building: number | null
    readonly pedestal: number | null
  }
  readonly discarded: boolean
  readonly decor: { readonly kind: string; readonly x: number; readonly z: number } | null
}

export interface PlacementsReportJson {
  readonly buildings: readonly PlacementsReportRow[]
  readonly warnings: readonly string[]
}

const worldToPx = (p: Vec2, imageSize: readonly [number, number]): Vec2 => ({
  x: p.x / PLACEMENTS_PX_TO_UNITS + imageSize[0] / 2,
  z: p.z / PLACEMENTS_PX_TO_UNITS + imageSize[1] / 2,
})

const px = (value: number): string => value.toFixed(1)

/** AC-7: SVG del tablero (px, y hacia abajo = foto original) con edificios OBB. */
export function buildPlacementsSvg(input: PlacementsReportInput, solution: PlacementSolution): string {
  const [width, height] = input.imageSize
  const nodeById = new Map(input.board.nodes.map((node) => [node.id, node]))
  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(width)} ${String(height)}" ` +
      `width="${String(width)}" height="${String(height)}">`,
  )
  parts.push(`<rect x="0" y="0" width="${String(width)}" height="${String(height)}" fill="#f2efe4"/>`)
  parts.push('<g id="edges">')
  for (const [fromId, toId] of input.board.edges) {
    const from = nodeById.get(fromId)
    const to = nodeById.get(toId)
    if (from === undefined || to === undefined) continue
    parts.push(
      `<line x1="${px(from.x)}" y1="${px(from.y)}" x2="${px(to.x)}" y2="${px(to.y)}" ` +
        'stroke="#C9A877" stroke-width="16" stroke-linecap="round"/>',
    )
  }
  parts.push('</g>')
  parts.push('<g id="pedestals">')
  for (const pedestal of input.pedestals) {
    const radiusPx = pedestal.radius / PLACEMENTS_PX_TO_UNITS
    parts.push(
      `<circle cx="${px(pedestal.x)}" cy="${px(pedestal.y)}" r="${px(radiusPx)}" ` +
        'fill="#9a938a" fill-opacity="0.3" stroke="#6b655e" stroke-width="2"/>',
    )
  }
  parts.push('</g>')
  parts.push('<g id="nodes">')
  for (const node of input.board.nodes) {
    parts.push(
      `<circle cx="${px(node.x)}" cy="${px(node.y)}" r="20" fill="#b3aca1" stroke="#5c5750" stroke-width="2"/>`,
    )
  }
  parts.push('</g>')
  parts.push('<g id="buildings">')
  for (const building of solution.buildings) {
    const node = nodeById.get(building.nodeId)
    const labelX = px(node?.x ?? 0)
    const labelY = px((node?.y ?? 0) + 42)
    if (building.discarded) {
      parts.push(
        `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-family="monospace" font-size="16" ` +
          `fill="#c0392b">${building.nodeId} (DESCARTADO)</text>`,
      )
      continue
    }
    const corners = obbCorners({ x: building.x, z: building.z }, building.footprint, building.yawDeg)
      .map((corner) => worldToPx(corner, input.imageSize))
      .map((corner) => `${px(corner.x)},${px(corner.z)}`)
      .join(' ')
    parts.push(
      `<polygon points="${corners}" fill="#4E9D5B" fill-opacity="0.45" stroke="#1c2430" stroke-width="3"/>`,
    )
    const label = worldToPx({ x: building.x, z: building.z }, input.imageSize)
    parts.push(
      `<text x="${px(label.x)}" y="${px(label.z + 6)}" text-anchor="middle" ` +
        `font-family="monospace" font-size="16" fill="#1c2430">${building.nodeId}</text>`,
    )
  }
  parts.push('</g>')
  parts.push('<g id="decor">')
  for (const building of solution.buildings) {
    if (building.decor === null) continue
    const radiusPx = building.decor.radius / PLACEMENTS_PX_TO_UNITS
    const center = worldToPx({ x: building.decor.x, z: building.decor.z }, input.imageSize)
    parts.push(
      `<circle cx="${px(center.x)}" cy="${px(center.z)}" r="${px(radiusPx)}" ` +
        'fill="#8C6A3F" fill-opacity="0.7"/>',
    )
  }
  parts.push('</g>')
  parts.push(
    `<text x="16" y="28" font-family="monospace" font-size="18" fill="#1c2430">` +
      `placements T-089 — ${String(solution.buildings.filter((b) => !b.discarded).length)}/` +
      `${String(solution.buildings.length)} edificios · verde = edificio (OBB) · café = decor</text>`,
  )
  parts.push('</svg>')
  return parts.join('\n')
}

/** AC-7: JSON por edificio (nodo, kind, dirección, distancias, escala, descarte). */
export function buildPlacementsReportJson(
  _input: PlacementsReportInput,
  solution: PlacementSolution,
): PlacementsReportJson {
  return {
    buildings: solution.buildings.map((building) => ({
      nodeId: building.nodeId,
      kind: building.kind,
      sideDeg: building.sideDeg,
      dist: building.dist,
      x: building.x,
      z: building.z,
      yawDeg: building.yawDeg,
      scale: building.scale,
      height: building.height,
      gaps: {
        node: building.gaps.node,
        edge: building.gaps.edge,
        building: Number.isFinite(building.gaps.building) ? building.gaps.building : null,
        pedestal: Number.isFinite(building.gaps.pedestal) ? building.gaps.pedestal : null,
      },
      discarded: building.discarded,
      decor: building.decor === null ? null : { kind: building.decor.kind, x: building.decor.x, z: building.decor.z },
    })),
    warnings: [...solution.warnings],
  }
}
