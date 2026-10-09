// AC: SPEC-A/AC-1 — wiring del workspace: el paquete de contenido carga y exporta.
import { expect, test } from 'vitest'
import { CONTENT_NAME } from './index'

test('content exporta su identificador', () => {
  expect(CONTENT_NAME).toBe('liga-pkm-content')
})
