// AC: SPEC-E/T-046/AC-2 — el editor de ataques ofrece "Confirmar mapeo"
// (verified, requiere officialMove) junto a la vista previa de FX con
// playMoveFx sobre sprites de ejemplo (T-040, FxPreview). Proxy sin navegador
// (renderToString); la revisión visual de la animación la hace el dueño en dev.
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { es } from '../i18n/es'
import { AttackEditor } from './AttackEditor'
import type { Draft } from './draft'

const proposed: Draft = {
  id: 'burbujas',
  name: 'Burbujas',
  kind: 'attack',
  rollFaces: [1, 2],
  cost: ['water'],
  element: 'water',
  damage: { base: 20 },
  effects: [],
  rawText: '',
  officialMove: 'bubble',
  officialMoveStatus: 'proposed',
  fx: 'water',
}

const sinMove: Draft = { ...proposed, id: 'furia', name: 'Furia inédita', element: 'dragon' }
delete sinMove.officialMove
delete sinMove.officialMoveStatus

test('AC: SPEC-E/T-046/AC-2 el editor ofrece confirmar el mapeo junto a la vista previa de FX', () => {
  const html = renderToString(
    <AttackEditor attack={proposed} patch={() => {}} onPreview={() => {}} />,
  )
  expect(html).toContain(es.adminConfirmMove)
  expect(html).toContain(es.adminFxPreview) // vista previa playMoveFx (T-040, se reusa)
  // Confirmar deshabilitado sin officialMove.
  const htmlSin = renderToString(
    <AttackEditor attack={sinMove} patch={() => {}} onPreview={() => {}} />,
  )
  expect(htmlSin).toContain('disabled')
})
