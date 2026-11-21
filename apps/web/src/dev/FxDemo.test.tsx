// AC: SPEC-D/T-032c0/AC-1 — /dev/fx ofrece un botón por movimiento del spike sobre la
// escena con sprites. Proxy sin navegador (renderToString): la página renderiza título,
// escena y los 6 botones; la reproducción visual sin errores de consola la verifica el
// dueño en el gate GS (tasks/OWNER-REVIEW.md).
// AC: SPEC-D/T-032c2/AC-1 — además, un botón por cada movimiento portado (12) y el de
// cadena FX-ADAPTER (adaptador → arquetipo).
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { FX_ARCHETYPES } from '../fx/archetypes'
import { SHOWDOWN_MOVE_IDS } from '../fx/showdown/registry'
import { es } from '../i18n/es'
import { ARCHETYPE_LABELS, FxDemo, MOVE_LABELS } from './FxDemo'

test('la demo /dev/fx renderiza la escena y un botón por cada movimiento del spike', () => {
  const html = renderToString(<FxDemo />)
  expect(html).toContain(es.fxDemoTitle)
  expect(html).toContain(es.fxBubble)
  expect(html).toContain(es.fxFlamethrower)
  expect(html).toContain(es.fxScratch)
  expect(html).toContain(es.fxVineWhip)
  expect(html).toContain(es.fxThunderbolt)
  expect(html).toContain(es.fxDoubleSlap)
})

test('AC: SPEC-D/T-032c2/AC-1 la demo /dev/fx tiene un botón por cada movimiento portado y el de cadena', () => {
  expect(SHOWDOWN_MOVE_IDS).toHaveLength(12)
  expect(Object.keys(MOVE_LABELS)).toHaveLength(12)
  const html = renderToString(<FxDemo />)
  for (const id of SHOWDOWN_MOVE_IDS) {
    expect(html).toContain(MOVE_LABELS[id])
  }
  expect(html).toContain(es.fxTackle)
  expect(html).toContain(es.fxHeadbutt)
  expect(html).toContain(es.fxWithdraw)
  expect(html).toContain(es.fxFireSpin)
  expect(html).toContain(es.fxStunSpore)
  expect(html).toContain(es.fxAbsorb)
  expect(html).toContain(es.fxChain)
})

// AC: SPEC-D/T-032c1/AC-2 — los 17 arquetipos visibles en /dev/fx con selector de elemento.
test('la demo /dev/fx muestra los 17 arquetipos y el selector de elemento', () => {
  const html = renderToString(<FxDemo />)
  for (const fx of FX_ARCHETYPES) {
    expect(html).toContain(ARCHETYPE_LABELS[fx])
  }
  expect(html).toContain(`aria-label="${es.fxDemoElement}"`)
  expect(html).toContain('<option value="dragon">dragon</option>')
  expect(html).toContain('<option value="normal">normal</option>')
})
