// Glifos de los casilleros (SPEC-H/T-067/AC-2): formas 2D simples pintadas
// sobre un contexto de canvas 128×128. Puro y estructural (patrón die.ts):
// GlyphPainter es el subconjunto del 2D context que se usa, testeable con un
// stub; la textura real la crea glyph-textures.ts (capa runtime). El símbolo
// de cada mazo sale de deck-stacks.json (sun/skull/drop/tree/flame).
import { deckStacks } from './stacks'

export type GlyphId =
  | 'cross'
  | 'bag'
  | 'mortarboard'
  | 'shield'
  | 'pokeball'
  | 'question'
  | 'star'
  | 'house'
  | 'duel'
  | 'sun'
  | 'skull'
  | 'drop'
  | 'tree'
  | 'flame'

export const GLYPH_IDS: readonly GlyphId[] = [
  'cross', 'bag', 'mortarboard', 'shield', 'pokeball', 'question', 'star',
  'house', 'duel', 'sun', 'skull', 'drop', 'tree', 'flame',
]

/** Contexto 2D mínimo para pintar un glifo (structural, testeable con stub). */
export interface GlyphPainter {
  fillStyle: string | CanvasGradient | CanvasPattern | null
  font: string
  textAlign: string
  textBaseline: string
  fillText(text: string, x: number, y: number): void
  beginPath(): void
  closePath(): void
  fill(): void
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  fillRect(x: number, y: number, w: number, h: number): void
}

const typeGlyphs: Record<string, GlyphId> = {
  centro: 'cross',
  mercado: 'bag',
  oak: 'mortarboard',
  gym: 'shield',
  empty: 'pokeball',
  sorpresa: 'question',
  liga: 'star',
  start: 'house',
  duelo: 'duel',
}

const deckSymbols = new Map<string, GlyphId>(
  deckStacks.panels.map((panel) => [panel.deck, panel.symbol as GlyphId]),
)

/** AC-2: glifo de un nodo — deck ⇒ símbolo del mazo; si no, el de su tipo. */
export function glyphIdFor(node: {
  readonly type: string
  readonly deck?: string | undefined
}): GlyphId | null {
  if (node.type === 'deck') {
    return node.deck === undefined ? null : deckSymbols.get(node.deck) ?? null
  }
  return typeGlyphs[node.type] ?? null
}

/** AC-5: ancho en px de un objeto de mundo a esa distancia (proyección). */
export function projectedPx(
  worldSize: number,
  distance: number,
  fovDeg: number,
  viewportHeight: number,
): number {
  const halfTan = Math.tan((fovDeg * Math.PI) / 360)
  return (worldSize * viewportHeight) / (2 * halfTan * distance)
}

const fullTurn = Math.PI * 2

/** AC-2: pinta el glifo (coordenadas en una grilla de 128, escaladas a px). */
export function paintGlyph(
  painter: GlyphPainter,
  id: GlyphId,
  px: number,
  ink: string,
  bg: string,
): void {
  const s = px / 128
  const rect = (x: number, y: number, w: number, h: number, color: string): void => {
    painter.fillStyle = color
    painter.fillRect(x * s, y * s, w * s, h * s)
  }
  const circle = (cx: number, cy: number, r: number, color: string): void => {
    painter.fillStyle = color
    painter.beginPath()
    painter.arc(cx * s, cy * s, r * s, 0, fullTurn)
    painter.closePath()
    painter.fill()
  }
  const polygon = (points: readonly (readonly [number, number])[], color: string): void => {
    painter.fillStyle = color
    painter.beginPath()
    points.forEach(([x, y], index) =>
      index === 0 ? painter.moveTo(x * s, y * s) : painter.lineTo(x * s, y * s),
    )
    painter.closePath()
    painter.fill()
  }

  if (id === 'question') {
    painter.font = `bold ${92 * s}px sans-serif`
    painter.textAlign = 'center'
    painter.textBaseline = 'middle'
    painter.fillStyle = ink
    painter.fillText('?', 64 * s, 68 * s)
    return
  }

  if (id === 'cross') {
    rect(54, 28, 20, 72, ink)
    rect(28, 54, 72, 20, ink)
    return
  }
  if (id === 'bag') {
    circle(64, 80, 28, ink)
    rect(52, 32, 24, 18, ink)
    rect(45, 46, 38, 8, ink)
    return
  }
  if (id === 'mortarboard') {
    polygon([[64, 34], [108, 56], [64, 78], [20, 56]], ink)
    rect(102, 58, 5, 26, ink)
    circle(104, 88, 5, ink)
    return
  }
  if (id === 'shield') {
    polygon([[64, 22], [102, 36], [102, 62], [64, 104], [26, 62], [26, 36]], ink)
    return
  }
  if (id === 'pokeball') {
    circle(64, 64, 38, ink)
    circle(64, 64, 26, bg)
    rect(26, 58, 76, 12, ink)
    circle(64, 64, 9, ink)
    return
  }
  if (id === 'star') {
    const points: [number, number][] = []
    for (let index = 0; index < 10; index += 1) {
      const r = index % 2 === 0 ? 42 : 17
      const angle = -Math.PI / 2 + (index * Math.PI) / 5
      points.push([64 + r * Math.cos(angle), 64 + r * Math.sin(angle)])
    }
    polygon(points, ink)
    return
  }
  if (id === 'house') {
    polygon([[64, 20], [106, 58], [22, 58]], ink)
    rect(32, 58, 64, 44, ink)
    rect(55, 74, 18, 28, bg)
    return
  }
  if (id === 'duel') {
    const blade = (ax: number, ay: number, bx: number, by: number): [number, number][] => {
      const dx = bx - ax
      const dy = by - ay
      const len = Math.hypot(dx, dy)
      const nx = (-dy / len) * 5
      const ny = (dx / len) * 5
      return [[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]]
    }
    polygon(blade(30, 96, 92, 34), ink)
    polygon(blade(98, 96, 36, 34), ink)
    circle(30, 96, 6, ink)
    circle(98, 96, 6, ink)
    return
  }
  if (id === 'sun') {
    circle(64, 64, 22, ink)
    for (let index = 0; index < 8; index += 1) {
      const angle = (index * Math.PI) / 4
      const ca = Math.cos(angle)
      const sa = Math.sin(angle)
      polygon(
        [
          [64 + ca * 28 - sa * 5, 64 + sa * 28 + ca * 5],
          [64 + ca * 28 + sa * 5, 64 + sa * 28 - ca * 5],
          [64 + ca * 42, 64 + sa * 42],
        ],
        ink,
      )
    }
    return
  }
  if (id === 'skull') {
    circle(64, 58, 30, ink)
    rect(48, 82, 32, 16, ink)
    circle(52, 56, 7, bg)
    circle(76, 56, 7, bg)
    polygon([[64, 66], [59, 74], [69, 74]], bg)
    return
  }
  if (id === 'drop') {
    polygon([[64, 24], [86, 58], [92, 78], [82, 96], [64, 104], [46, 96], [36, 78], [42, 58]], ink)
    return
  }
  if (id === 'tree') {
    polygon([[64, 18], [96, 58], [32, 58]], ink)
    polygon([[64, 42], [102, 90], [26, 90]], ink)
    rect(57, 90, 14, 16, ink)
    return
  }
  // 'flame'
  polygon([[64, 20], [80, 46], [92, 66], [86, 92], [64, 104], [42, 92], [36, 66], [48, 46]], ink)
}
