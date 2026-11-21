// AC: SPEC-F/T-047/AC-4 — cada `icon` de energy.json existe como archivo en
// apps/web/src/assets/energy y es un SVG válido: XML bien formado, ≤ 2 KB y sin
// scripts ni fuentes/referencias externas (docs/ENERGY-ICONS.md). Corre en Node.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EnergyFileSchema } from '@liga/content'
import { expect, test } from 'vitest'
import energyJson from '../../../../content/energy.json'

const assetsDir = join(fileURLToPath(new URL('.', import.meta.url)), '../assets/energy')

const energy = EnergyFileSchema.parse(energyJson)
const icons = [
  ...energy.types.map((type) => ({ id: type.id, icon: type.icon })),
  { id: energy.multicolor.id, icon: energy.multicolor.icon },
]

/** Tags XML con atributos citados; pila para verificar apertura/cierre. */
const TAG =
  /<(\/)?([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[a-zA-Z:][a-zA-Z0-9:.-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/)?>/g

function expectWellFormedSvg(file: string, source: string): void {
  expect(source.trim().startsWith('<svg'), `${file}: debe empezar con <svg`).toBe(true)
  expect(source.trim().endsWith('</svg>'), `${file}: debe terminar con </svg>`).toBe(true)
  expect(source.includes('<?') || source.includes('<!'), `${file}: sin xml/doctype/comentarios`).toBe(
    false,
  )
  const stack: string[] = []
  let roots = 0
  for (const match of source.matchAll(TAG)) {
    const closing = match[1] === '/'
    const name = match[2] ?? ''
    if (match[4] === '/') continue // autocerrado
    if (closing) {
      expect(stack.pop(), `${file}: </${name}> sin apertura`).toBe(name)
    } else {
      if (stack.length === 0) roots += 1
      stack.push(name)
    }
  }
  expect(stack, `${file}: tags sin cerrar (${stack.join(', ')})`).toEqual([])
  expect(roots, `${file}: debe tener un único elemento raíz`).toBe(1)
}

test('AC: SPEC-F/T-047/AC-4 - cada icono de energy.json existe y es un SVG válido y seguro', () => {
  expect(icons.length).toBe(16) // 15 tipos + multicolor
  for (const { id, icon } of icons) {
    const path = join(assetsDir, icon)
    expect(existsSync(path), `falta ${icon} para "${id}"`).toBe(true)
    const source = readFileSync(path, 'utf8')
    expectWellFormedSvg(icon, source)
    expect(statSync(path).size, `${icon}: ≤ 2 KB`).toBeLessThanOrEqual(2048)
    expect(source.includes('<script'), `${icon}: sin scripts`).toBe(false)
    expect(source.includes('<image'), `${icon}: sin imágenes embebidas`).toBe(false)
    // el namespace xmlns (http://www.w3.org/2000/svg) es obligatorio y local;
    // lo prohibido son referencias a recursos externos
    expect(/(?:href|src)\s*=/i.test(source), `${icon}: sin referencias externas`).toBe(false)
    expect(source.includes('url('), `${icon}: sin urls de CSS`).toBe(false)
    expect(source.includes('xlink'), `${icon}: sin xlink`).toBe(false)
    expect(/@font-face|<font|font-family/i.test(source), `${icon}: sin fuentes`).toBe(false)
    expect(source.toLowerCase().includes('javascript:'), `${icon}: sin javascript:`).toBe(false)
  }
})

test('AC: SPEC-F/T-047/AC-4 - sin huérfanos: los SVG del directorio son exactamente los 16 referenciados', () => {
  const onDisk = readdirSync(assetsDir)
    .filter((file) => file.endsWith('.svg'))
    .sort()
  const referenced = icons.map(({ icon }) => icon).sort()
  expect(onDisk).toEqual(referenced)
})
