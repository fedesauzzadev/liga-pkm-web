// AC: SPEC-A/AC-3 — `pnpm dev` muestra una página "LIGA PKM" en el navegador.
// Proxy sin navegador: la App renderiza el título (react-dom/server, sin DOM).
// La comprobación en navegador la hace el dueño (tasks/OWNER-REVIEW.md Fase 0).
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { App } from './App'

test('la app renderiza el título LIGA PKM', () => {
  const html = renderToString(<App />)
  expect(html).toContain('LIGA PKM')
})
