// AC: SPEC-F/T-047/AC-1, AC-2, AC-3 — componentes de íconos de energía.
// Proxy SSR (renderToString, sin DOM) como el resto de la UI; lo visual lo
// revisa el dueño en /dev/icons (gate G3, tasks/OWNER-REVIEW.md).
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { es } from '../i18n/es'
import { CostRow, EnergyIcon } from './EnergyIcon'
import { EnergyToken } from './EnergyToken'
import { energyFile, energyIconUrl } from './icons'

const labels = new Map(energyFile.types.map((type) => [type.id, type.es] as const))

/** React escapa ' como &#x27; en atributos: compara el src como en el HTML final. */
const srcAttr = (type: 'water' | 'normal'): string =>
  `src="${energyIconUrl(type).replaceAll("'", '&#x27;')}"`

test('AC: SPEC-F/T-047/AC-1 - <EnergyIcon type size />: img con tamaño y aria-label en español desde energy.json', () => {
  expect(labels.get('fire')).toBe('Fuego') // sanity del fixture
  for (const size of [16, 24, 32, 48] as const) {
    const html = renderToString(<EnergyIcon type="fire" size={size} />)
    expect(html).toContain(`width="${size}"`)
    expect(html).toContain(`height="${size}"`)
    expect(html).toContain(`aria-label="Fuego"`)
  }
  const html = renderToString(<EnergyIcon type="water" />)
  expect(html).toContain('role="img"') // accesible por nombre
  expect(html).toContain(`aria-label="${labels.get('water')}"`)
  expect(html).toContain(srcAttr('water'))
  expect(html).toContain('width="24"') // tamaño default
  const multicolor = renderToString(<EnergyIcon type="multicolor" size={48} />)
  expect(multicolor).toContain(`aria-label="${energyFile.multicolor.es}"`)
})

test('AC: SPEC-F/T-047/AC-2 - <CostRow cost>: un ícono por slot; any usa normal.svg', () => {
  const html = renderToString(<CostRow cost={['grass', 'any', 'fire']} />)
  expect((html.match(/data-energy-icon=/g) ?? []).length).toBe(3)
  expect(html).toContain('data-energy-icon="grass"')
  expect(html).toContain('data-energy-icon="fire"')
  expect(html).toContain(`aria-label="${labels.get('grass')}"`)
  // 'any' ⇒ círculo gris (RULES §3): mismo SVG que normal + label propio
  expect(html).toContain('data-energy-icon="normal"')
  expect(html).toContain(srcAttr('normal'))
  expect(html).toContain(`aria-label="${es.anyElement}"`)
  expect(html).toContain('data-cost-row="3"')
  expect(html).toContain('width="16"') // tamaño default chico para filas de carta

  const empty = renderToString(<CostRow cost={[]} />)
  expect(empty).toContain('data-cost-row="0"')
  expect((empty.match(/data-energy-icon=/g) ?? []).length).toBe(0)
})

test('AC: SPEC-F/T-047/AC-3 - <EnergyToken>: ficha redonda arrastrable con estado equipada', () => {
  const html = renderToString(<EnergyToken type="water" />)
  expect(html).toContain('data-energy-token="water"')
  expect(html).toContain('draggable="true"')
  expect(html).toContain(`aria-label="${labels.get('water')}"`)

  const equipped = renderToString(<EnergyToken type="water" equipped />)
  expect(equipped).toContain('data-equipped="true"')
  expect(equipped).toContain('draggable="false"') // equipada no se arrastra
  expect(equipped).toContain(`(${es.iconsTokenEquipped})`)

  const pick = renderToString(
    <EnergyToken type="multicolor" onPick={() => undefined} onDragStart={() => undefined} />,
  )
  expect(pick).toContain('<button') // con onPick es accionable
  expect(pick).toContain(`aria-label="${energyFile.multicolor.es}"`)

  const disabled = renderToString(<EnergyToken type="fire" equipped disabled />)
  expect(disabled).toContain('data-disabled="true"')
})
