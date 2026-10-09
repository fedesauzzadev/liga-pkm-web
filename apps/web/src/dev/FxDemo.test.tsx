// AC: SPEC-D/T-032c0/AC-1 — /dev/fx ofrece un botón por movimiento del spike sobre la
// escena con sprites. Proxy sin navegador (renderToString): la página renderiza título,
// escena y los 6 botones; la reproducción visual sin errores de consola la verifica el
// dueño en el gate GS (tasks/OWNER-REVIEW.md).
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { es } from '../i18n/es'
import { FxDemo } from './FxDemo'

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
