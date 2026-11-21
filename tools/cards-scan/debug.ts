// cards-scan/debug (SPEC-S/T-102a/AC-3) — dibuja sobre la carta normalizada
// los rectángulos numerados de la segmentación. Los rótulos usan una fuente
// 3×5 propia en rects: no dependemos de fuentes del sistema (librsvg).
import sharp from 'sharp'
import type { Segmentation } from './segment.ts'

interface Labeled {
  readonly rect: { x: number; y: number; w: number; h: number }
  readonly color: string
  readonly label: string
}

// Fuente 3×5: bits por fila (msb = izquierda). Suficiente para 0-9, A, E, P.
const FONT: Record<string, [number, number, number, number, number]> = {
  '0': [0b111, 0b101, 0b101, 0b101, 0b111],
  '1': [0b010, 0b110, 0b010, 0b010, 0b111],
  '2': [0b111, 0b001, 0b111, 0b100, 0b111],
  '3': [0b111, 0b001, 0b111, 0b001, 0b111],
  '4': [0b101, 0b101, 0b111, 0b001, 0b001],
  '5': [0b111, 0b100, 0b111, 0b001, 0b111],
  '6': [0b111, 0b100, 0b111, 0b101, 0b111],
  '7': [0b111, 0b001, 0b010, 0b010, 0b010],
  '8': [0b111, 0b101, 0b111, 0b101, 0b111],
  '9': [0b111, 0b101, 0b111, 0b001, 0b111],
  A: [0b111, 0b101, 0b111, 0b101, 0b101],
  E: [0b111, 0b100, 0b111, 0b100, 0b111],
  P: [0b111, 0b101, 0b111, 0b100, 0b100],
}

/** Rótulo tipo chip: fondo oscuro + glifos blancos, arriba a la izquierda. */
function chip(x: number, y: number, text: string, color: string): string {
  const s = 3 // escala del pixel de fuente
  const padC = 4
  const w = text.length * (3 * s + s) + padC * 2
  const h = 5 * s + padC * 2
  const parts = [`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" opacity="0.9"/>`]
  let cx = x + padC
  for (const ch of text) {
    const glyph = FONT[ch]
    if (glyph !== undefined) {
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 3; col++) {
          if (((glyph[row] ?? 0) >> (2 - col)) & 1) {
            parts.push(
              `<rect x="${cx + col * s}" y="${y + padC + row * s}" width="${s}" height="${s}" fill="#ffffff"/>`,
            )
          }
        }
      }
    }
    cx += 4 * s
  }
  return parts.join('')
}

/** Leyenda corta de la numeración (va al reporte/summary). */
export function legendOf(s: Segmentation): string[] {
  const lines = ['1 encabezado', '2 arte']
  let n = 3
  for (const b of s.blocks) {
    lines.push(b.kind === 'specialty' ? `${n} especialidad` : `${n} ataque ${b.number}`)
    n += 1
  }
  lines.push(`${n} pie`)
  return lines
}

/** PNG normalizado + rectángulos numerados (colores por tipo de región). */
export async function debugPng(normalized: Buffer, s: Segmentation): Promise<Buffer> {
  const meta = await sharp(normalized).metadata()
  const w = meta.width ?? 700
  const h = meta.height ?? 1060
  const items: Labeled[] = [
    { rect: s.header, color: '#0066cc', label: '1' },
    { rect: s.art, color: '#00aa44', label: '2' },
  ]
  let n = 3
  for (const b of s.blocks) {
    items.push({ rect: b.rect, color: b.kind === 'specialty' ? '#cc00cc' : '#ff8800', label: String(n) })
    n += 1
  }
  items.push({ rect: s.footer, color: '#333333', label: String(n) })
  const parts: string[] = []
  for (const it of items) {
    const x = Math.max(2, Math.min(w - 60, it.rect.x))
    const y = Math.max(2, Math.min(h - 26, it.rect.y))
    parts.push(
      `<rect x="${it.rect.x}" y="${it.rect.y}" width="${it.rect.w}" height="${it.rect.h}" fill="none" stroke="${it.color}" stroke-width="3"/>`,
      chip(x, y, it.label, it.color),
    )
  }
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${parts.join('')}</svg>`,
  )
  return sharp(normalized)
    .composite([{ input: svg, top: 0, left: 0 }])
    .png()
    .toBuffer()
}
