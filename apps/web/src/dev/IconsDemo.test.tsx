// AC: SPEC-F/T-047/AC-5 — /dev/icons muestra los 16 íconos en 3 tamaños y los
// costos de cartas de ejemplo con fichas (los revisa el dueño en el gate G3).
// Proxy SSR (renderToString) como el resto de la UI.
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { demoCards } from '../battle/demo'
import { energyFile } from '../energy/icons'
import { es } from '../i18n/es'
import { IconsDemo } from './IconsDemo'

test('AC: SPEC-F/T-047/AC-5 - galería con los 16 íconos (15 tipos + multicolor) a 16/24/48 px', () => {
  const html = renderToString(<IconsDemo />)
  expect(html).toContain(es.iconsTitle)
  expect(html).toContain(es.iconsHint)
  for (const type of energyFile.types) {
    expect(html).toContain(`data-icon-row="${type.id}"`)
    expect(html).toContain(`>${type.es}<`)
    // marca qué tipos son cartas de energía (normal/dragon no lo son, D-24)
    expect(html).toContain(type.energyCard ? es.iconsCardYes : es.iconsCardNo)
  }
  expect(html).toContain('data-icon-row="multicolor"')
  expect(html).toContain(`>${energyFile.multicolor.es}<`)
  expect(html).toContain(es.iconsCardItem)
  for (const size of [16, 24, 48]) {
    expect((html.match(new RegExp(`data-size="${size}"`, 'g')) ?? []).length).toBe(16)
  }
})

test('AC: SPEC-F/T-047/AC-5 - costos de ejemplo legibles y fichas EnergyToken', () => {
  const html = renderToString(<IconsDemo />)
  for (const card of [demoCards.squirtle, demoCards.poliwag, demoCards.charmander]) {
    for (const attack of card.attacks) {
      expect(html).toContain(`data-cost-example="${attack.id}"`)
      expect(html).toContain(attack.name)
    }
  }
  expect(html).toContain(es.anyElement) // slot 'any' de un costo demo
  expect(html).toContain(es.iconsCostTitle)
  expect(html).toContain(es.iconsTokenTitle)
  expect(html).toContain('data-energy-token="water"')
  expect(html).toContain('data-energy-token="multicolor"')
  expect(html).toContain('data-equipped="true"')
})
