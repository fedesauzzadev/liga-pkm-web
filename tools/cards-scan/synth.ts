// cards-scan/synth (SPEC-S/T-102a/AC-5) — cartas SINTÉTICAS dibujadas por
// código con la misma estructura que el diseño 'terrain' (medida sobre los
// escaneos reales: línea bajo el encabezado ~7 %, fin de arte ~44.7 %,
// separadores cromático-oscuros entre ataques, línea negra gruesa del pie
// ~89 %). El "texto" son rects negros: el segmentador ve píxeles, no glifos,
// y así no dependemos de fuentes del sistema.
import sharp from 'sharp'
export interface SynthSpec {
  readonly attacks: number // 1..4
  readonly specialty?: boolean
  readonly pad?: { readonly deg: number } | undefined // rotar sobre el fondo (test de deskew)
  // Perfil de la carta (T-104): gym/league no tienen columna de costos.
  readonly profile?: 'terrain' | 'gym' | 'league' | undefined
  // Color de los separadores entre bloques (default: rojo oscuro del diseño
  // terrain). Un color claro (p. ej. #a8c8e8) solo es detectable por la vía
  // de densidad de bordes ⇒ testea la independencia del color (T-104/AC-3).
  readonly separator?: string | undefined
  // Íconos dibujados (T-102c): 'any' = círculo gris vacío; cualquier otro
  // string = color del disco. costs es por ataque (fila o 2 filas apiladas).
  readonly icons?: {
    readonly element?: string | undefined
    readonly deck?: string | undefined
    readonly costs?: readonly (readonly ('any' | string)[])[] | undefined
  } | undefined
  // Glifos reales (T-105): HP dibujado dentro del círculo, prefijo de caras y
  // columna de daño por ataque (attackSpecs[i] = ataque i+1). Sin esto se
  // dibujan los garabatos históricos (compatibilidad con T-102a..e).
  readonly hp?: number | undefined
  readonly hpCircleDx?: number | undefined
  readonly attackSpecs?: readonly SynthAttackSpec[] | undefined
  // Simula un escaneo real: la carta rodeada de fondo oscuro; con strips,
  // agrega franjas de ruido del escáner (full ancho, otro color) separadas
  // de la carta por fondo (patrón Q-078: Mew S / Monkey).
  readonly bg?:
    | { readonly color: string; readonly marginX: number; readonly marginY: number; readonly strips?: boolean }
    | undefined
}

/** Contenido numérico de un ataque para la fuente de glifos (T-105). */
export interface SynthAttackSpec {
  readonly faces?: readonly number[] | undefined // [4,5] ⇒ glifos `4-5_`
  readonly damage?: number | undefined // 10 ⇒ `(10)`
  readonly plusDamage?: boolean | undefined // true ⇒ `(+10)`
}

/** Caracteres que la fuente de glifos sabe dibujar (T-105). */
export const GLYPH_CHARS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '_', '(', ')', '+'] as const

/** Ancho de cada glifo en unidades de la grilla 20 (T-105). */
const GLYPH_W: Record<string, number> = { '-': 8, _: 14 }

/** Trazos de cada glifo en la grilla 20×~12: UNA polilínea (o dos que se
 * cruzan/tocan) ⇒ un componente conectado por carácter. */
const GLYPH_PATH: Record<string, string> = {
  '0': 'M 1,10 C 1,3 11,3 11,10 C 11,17 1,17 1,10',
  '1': 'M 2,6 L 5,2 L 5,17 M 1.5,17 L 8.5,17',
  '2': 'M 1,5 C 1,1 11,1 11,6 C 11,10 1,13 1,18 L 11,18',
  '3': 'M 1,2 L 10,2 L 6,9 L 11,13 L 9,18 L 1,18',
  '4': 'M 10,1 L 1,12 L 11,12 M 8,5 L 8,18',
  '5': 'M 11,2 L 2,2 L 1,9 L 10,10 C 11,12 11,18 1,18',
  '6': 'M 11,1 C 3,4 1,8 1,13 C 1,17 11,18 11,12 C 11,9 1,9 1,11',
  '7': 'M 1,3 L 11,3 L 4,18',
  '8': 'M 6,2 C 0,2 0,9 6,10 C 12,11 12,18 6,18 C 0,18 0,11 6,10 C 12,9 12,2 6,2',
  '9': 'M 1,18 C 9,15 11,11 11,6 C 11,2 1,1 1,7 C 1,10 11,10 11,8',
  '-': 'M 0,10 L 8,10',
  _: 'M 0,18.5 L 14,18.5',
  '(': 'M 7,1 C 1,4 1,16 7,19',
  ')': 'M 1,1 C 7,4 7,16 1,19',
  '+': 'M 0,10 L 11,10 M 5.5,4 L 5.5,16',
}

/** Un glifo stroke (un componente conectado), altura h px en (x,y). Trazos
 * gruesos (≈24 % de la altura, como la imprenta serif bold de las cartas
 * reales): los mapas de tinta quedan estables entre tamaños. */
export function glyphSvg(ch: string, x: number, y: number, h: number): string {
  const d = GLYPH_PATH[ch]
  if (d === undefined) return ''
  const u = h / 20
  const sw = ch === '_' ? 5.8 : ch === '-' ? 5.0 : 4.8
  return `<path d="${d}" transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${u.toFixed(3)})" fill="none" stroke="${INK}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`
}

const glyphGap = (h: number): number => h * 0.5

/** Ancho total de un texto en la fuente de glifos (sin el gap final). */
export function glyphTextWidth(text: string, h: number): number {
  const u = h / 20
  let w = 0
  for (const ch of text) w += (GLYPH_W[ch] ?? 12) * u + glyphGap(h)
  return Math.max(0, w - glyphGap(h))
}

/** Texto como secuencia de glifos; devuelve el SVG acumulado. */
function glyphTextSvg(text: string, x: number, y: number, h: number): string {
  const u = h / 20
  const parts: string[] = []
  let cx = x
  for (const ch of text) {
    parts.push(glyphSvg(ch, cx, y, h))
    cx += (GLYPH_W[ch] ?? 12) * u + glyphGap(h)
  }
  return parts.join('')
}

const W = 700
const H = 1060
const INK = '#141414'
const SEPARATOR = '#97392b' // croma alto, valor medio-bajo (como el rojo oscuro real)
const ART_LINE_Y = 470
const FOOTER_LINE_Y = 940
const ATTACK_TOP = ART_LINE_Y + 5
const ATTACK_BOTTOM = FOOTER_LINE_Y

/** Filas de "texto" (rects con huecos) a partir de x,y con ancho total w. */
function dashes(x: number, y: number, w: number, h: number, rows: number): string {
  const out: string[] = []
  const dash = 26
  const gap = 9
  for (let r = 0; r < rows; r++) {
    let cx = x
    let i = 0
    while (cx < x + w - 6) {
      const dw = i % 4 === 3 ? dash / 2 : dash
      out.push(`<rect x="${cx.toFixed(0)}" y="${y + r * (h + 7)}" width="${dw.toFixed(0)}" height="${h}" fill="${INK}"/>`)
      cx += dw + gap
      i += 1
    }
  }
  return out.join('')
}

/** Un ícono de costo: 'any' ⇒ círculo gris vacío; color ⇒ disco lleno. */
function costIcon(cx: number, cy: number, spec: 'any' | string): string {
  if (spec === 'any') return `<circle cx="${cx}" cy="${cy}" r="13" fill="none" stroke="#6e6e6e" stroke-width="5"/>`
  return `<circle cx="${cx}" cy="${cy}" r="13" fill="${spec}"/>`
}

/** Costos de un ataque: ≤2 en fila; 3+ apilados en 2 filas (orden de lectura). */
function costIcons(top: number, h: number, specs: readonly ('any' | string)[]): string {
  if (specs.length === 0) return ''
  if (specs.length <= 2) return specs.map((s, i) => costIcon(640 + i * 34, top + h - 26, s)).join('')
  const fila = Math.ceil(specs.length / 2)
  const arriba = specs.slice(0, fila).map((s, i) => costIcon(640 + i * 34, top + h - 54, s))
  const abajo = specs.slice(fila).map((s, i) => costIcon(640 + i * 34, top + h - 20, s))
  return [...arriba, ...abajo].join('')
}

/** Un bloque: prefijo de caras + nombre+texto a la izquierda, daño y costo a
 * la derecha. Con attackSpec (T-105) el prefijo y el daño se dibujan con la
 * fuente de glifos; si no, quedan los garabatos históricos. */
function attackBlock(top: number, h: number, costs: readonly ('any' | string)[], spec: SynthAttackSpec | undefined): string {
  const parts: string[] = []
  let nameX = 42
  if (spec?.faces !== undefined) {
    const prefix = `${spec.faces.join('-')}_`
    parts.push(glyphTextSvg(prefix, 42, top + 11, 18))
    nameX = 42 + glyphTextWidth(prefix, 18) + 12
  }
  parts.push(dashes(nameX, top + 12, Math.max(120, 300 - (nameX - 42)), 9, 1)) // nombre
  parts.push(dashes(42, top + 40, 420, 8, 1)) // texto del ataque
  parts.push(dashes(42, top + Math.max(64, h - 30), 380, 8, 1))
  if (spec?.damage !== undefined) {
    const texto = `(${spec.plusDamage === true ? '+' : ''}${spec.damage})`
    parts.push(glyphTextSvg(texto, 505, top + 8, 18))
    parts.push(costIcons(top, h, costs))
    return parts.join('')
  }
  // daño "(10)" a la derecha (termina antes de la columna de costos ~0.87)
  parts.push(`<rect x="560" y="${top + 10}" width="7" height="30" fill="${INK}"/>`)
  parts.push(dashes(575, top + 14, 30, 20, 1))
  parts.push(`<rect x="598" y="${top + 10}" width="7" height="30" fill="${INK}"/>`)
  parts.push(costIcons(top, h, costs))
  return parts.join('')
}

/** Especialidad: UNA línea corta en MAYÚSCULAS, sin nada a la derecha. */
function specialtyBlock(top: number, h: number): string {
  return dashes(42, top + Math.round(h / 2) - 6, 260, 10, 1)
}

/** Carta sintética 700×1060 (PNG); con pad, rotada deg sobre fondo gris. */
export async function syntheticCard(spec: SynthSpec): Promise<Buffer> {
  const nAtk = Math.max(1, Math.min(4, spec.attacks))
  const sepColor = spec.separator ?? SEPARATOR
  const hasCosts = spec.profile === undefined || spec.profile === 'terrain'
  const parts: string[] = []
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#f2ecf2"/>`)
  // Encabezado: nombre, círculo de HP (movible, T-105) e ícono de elemento.
  // El círculo NO toca la línea del encabezado (si se funden, el detector
  // pierde el candidato redondo: componente = línea completa).
  const hpCx = 575 + (spec.hpCircleDx ?? 0)
  parts.push(dashes(40, 28, 280, 12, 1))
  parts.push(`<circle cx="${hpCx}" cy="40" r="32" fill="#ffffff" stroke="#222222" stroke-width="4"/>`)
  if (spec.hp !== undefined) {
    const texto = String(spec.hp)
    parts.push(glyphTextSvg(texto, hpCx - glyphTextWidth(texto, 18) / 2, 40 - 9, 18))
  } else parts.push(dashes(562, 34, 26, 16, 1))
  parts.push(`<rect x="620" y="22" width="56" height="44" fill="${spec.icons?.element ?? '#e8963c'}"/>`)
  parts.push(`<rect x="30" y="76" width="640" height="5" fill="#111111"/>`)
  // Arte: bloques de color (nada de negro ni croma-oscura de fila completa).
  parts.push('<rect x="20" y="86" width="660" height="180" fill="#6ea6d8"/>')
  parts.push('<rect x="20" y="274" width="330" height="92" fill="#78c26e"/>')
  parts.push('<rect x="360" y="274" width="320" height="92" fill="#e8963c"/>')
  parts.push('<rect x="20" y="372" width="660" height="92" fill="#d86e6e"/>')
  parts.push(`<rect x="30" y="${ART_LINE_Y}" width="640" height="5" fill="#111111"/>`)
  // Zona de ataques: bloques separados por líneas cromático-oscuras.
  const blocks: Array<{ kind: 'specialty' | 'attack'; top: number; h: number }> = []
  const k = (spec.specialty === true ? 1 : 0) + nAtk
  const innerTop = ATTACK_TOP + 4
  const innerBottom = ATTACK_BOTTOM - 4
  const sepZone = 5 + 2 * 8 // separador + margen a cada lado
  const blockH = Math.floor((innerBottom - innerTop - (k - 1) * sepZone) / k)
  let y = innerTop
  for (let i = 0; i < k; i++) {
    const kind: 'specialty' | 'attack' = spec.specialty === true && i === 0 ? 'specialty' : 'attack'
    blocks.push({ kind, top: y, h: blockH })
    y += blockH
    if (i < k - 1) {
      parts.push(`<rect x="30" y="${y + 8}" width="640" height="5" fill="${sepColor}"/>`)
      y += sepZone
    }
  }
  let attackNo = 0
  for (const b of blocks) {
    if (b.kind === 'specialty') {
      parts.push(specialtyBlock(b.top, b.h))
      continue
    }
    const costs = hasCosts ? (spec.icons?.costs?.[attackNo] ?? ['any', '#f0c828']) : []
    const atkSpec = spec.attackSpecs?.[attackNo]
    attackNo += 1
    parts.push(attackBlock(b.top, b.h, costs, atkSpec))
  }
  // Pie: línea negra gruesa, texto e ícono de mazo; borde inferior oscuro.
  parts.push(`<rect x="30" y="${FOOTER_LINE_Y}" width="640" height="8" fill="#111111"/>`)
  parts.push(dashes(42, 968, 150, 9, 1))
  parts.push(dashes(430, 968, 240, 9, 1))
  parts.push(`<rect x="280" y="985" width="44" height="44" fill="${spec.icons?.deck ?? '#54346e'}"/>`)
  parts.push(`<rect x="0" y="${H - 14}" width="${W}" height="14" fill="#8f2b25"/>`)

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join('')}</svg>`
  let card = await sharp(Buffer.from(svg)).png().toBuffer()
  if (spec.bg !== undefined) {
    const { color, marginX, marginY, strips } = spec.bg
    const cw = W + 2 * marginX
    const ch = H + 2 * marginY
    let img = sharp(card).extend({
      top: marginY,
      bottom: marginY,
      left: marginX,
      right: marginX,
      background: color,
    })
    if (strips === true) {
      const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}"><rect x="0" y="2" width="${cw}" height="3" fill="#9a9a9a"/><rect x="0" y="${ch - 5}" width="${cw}" height="3" fill="#9a9a9a"/></svg>`
      img = img.composite([{ input: Buffer.from(overlay) }])
    }
    card = await img.png().toBuffer()
  }
  if (spec.pad === undefined) return card
  const bgc = spec.bg !== undefined ? spec.bg.color : '#c8c8c8'
  return sharp(card).rotate(spec.pad.deg, { background: bgc }).png().toBuffer()
}
