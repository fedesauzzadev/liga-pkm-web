// AC: SPEC-G/T-065/AC-5 - al asentarse el dado se muestra "Movés N casilleros"
// (singular con 1) y sin tirada no hay aviso. Proxy SSR (patrón Die3D/DrawnCard).
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { MoveHint, moveHintText } from './MoveHint'

test('AC-5 muestra "Movés N casilleros" con data-testid y singular con 1', () => {
  const html = renderToString(<MoveHint value={3} />)
  expect(html).toContain('data-testid="move-hint"')
  expect(html).toContain('Movés 3 casilleros')
  expect(renderToString(<MoveHint value={1} />)).toContain('Movés 1 casillero')
  expect(moveHintText(6)).toBe('Movés 6 casilleros')
})

test('AC-5 sin tirada no hay aviso', () => {
  expect(renderToString(<MoveHint value={null} />)).toBe('')
})
