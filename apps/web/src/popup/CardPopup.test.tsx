// AC: SPEC-I/T-075/AC-1 — popup de carta obtenida (D-29): muestra la carta y se
// cierra sola a autoDismissMs (timer del cliente; acá el proxy SSR).
// unificar-popup-encuentro/AC-1: la decisión FightOrRelease ya NO vive acá (el
// popup-encounter la muestra), así que este popup nunca ofrece botones.
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { es } from '../i18n/es'
import { CardPopup } from './CardPopup'

const DRAW = { deck: 'bosque' as const, card: 'weedle', nonce: 1 }

test('AC: SPEC-I/T-075/AC-1 - carta y cierre manual, sin botones', () => {
  const html = renderToString(<CardPopup draw={DRAW} autoDismissMs={2500} />)
  expect(html).toContain('data-card-popup="true"')
  expect(html).toContain('data-testid="popup-card-dismiss"')
  expect(html).toContain(es.shellTipClose)
  expect(html).not.toContain('data-command')
})

// AC: unificar-popup-encuentro/AC-1 - la decisión no se duplica en popup-card.
test('AC: unificar-popup-encuentro/AC-1 - sin botones de pelear/dejar ir', () => {
  const html = renderToString(<CardPopup draw={DRAW} autoDismissMs={2500} />)
  expect(html).not.toContain('data-testid="btn-card-fight"')
  expect(html).not.toContain('data-testid="btn-card-release"')
  expect(html).not.toContain('data-command="FightEncounter"')
  expect(html).not.toContain('data-command="ReleaseWild"')
})

test('AC: SPEC-I/T-075/AC-1 - sin robo no hay popup', () => {
  const html = renderToString(<CardPopup draw={null} autoDismissMs={2500} />)
  expect(html).toBe('')
})
