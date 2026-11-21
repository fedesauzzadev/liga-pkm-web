// AC: SPEC-F/T-048/AC-4 — panel de ediciones de la casa en /admin/cards: toggle
// por archivo (estado visible) y diff original vs. editada lado a lado por carta
// con ediciones activas. Proxy SSR con snapshots inyectados (sin middleware).
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { es } from '../i18n/es'
import { HouseEditsPanel } from './HouseEditsPanel'

const magmar = {
  id: 'magmar_a',
  dex: 126,
  variant: 'a',
  name: 'Magmar',
  stage: 'basic',
  deck: 'montana',
  hp: 70,
  element: 'fire',
  attacks: [
    {
      id: 'giro_fuego', name: 'Giro fuego', kind: 'attack', rollFaces: [3, 4], cost: ['fire'],
      element: 'fire', damage: { base: 30 }, effects: [], rawText: '',
    },
  ],
  specialties: [],
  evolvesTo: [],
  source: { verified: true },
}

const cardsSnapshot = {
  files: [
    {
      file: 'content/pokemon/main.json',
      staging: false,
      fileError: null,
      pending: [],
      cards: [{ raw: magmar, id: 'magmar_a' }],
      doc: null,
    },
  ],
}

const editsSnapshot = {
  files: [
    {
      file: 'content/house-edits/_example.json',
      enabled: true,
      error: null,
      doc: {
        enabled: true,
        edits: [{ id: 'edit-001', target: 'magmar_a', reason: 'nerf de vida', set: { hp: 80 } }],
      },
    },
    {
      file: 'content/house-edits/apagado.json',
      enabled: false,
      error: null,
      doc: { enabled: false, edits: [{ id: 'off-1', target: 'magmar_a', set: { hp: 10 } }] },
    },
  ],
}

// AC: SPEC-F/T-048/AC-4 — vista original vs. editada lado a lado y toggle por
// archivo de content/house-edits/ con su estado (activadas/desactivadas).
test('AC-4 diff lado a lado de la carta editada y toggle por archivo', () => {
  const html = renderToString(<HouseEditsPanel edits={editsSnapshot} cards={cardsSnapshot} />)
  expect(html).toContain(es.adminHouseEditsTitle)

  // Toggle por archivo: el activado ofrece Desactivar y el apagado Activar.
  expect(html).toContain('aria-pressed="true"')
  expect(html).toContain(es.adminHouseEditsDisable)
  expect(html).toContain(es.adminHouseEditsEnabled)
  expect(html).toContain(es.adminHouseEditsEnable)

  // Diff por carta con ediciones activas: original (hp 70) vs. editada (hp 80,
  // marcada houseEdited) lado a lado, con id de edición y motivo.
  expect(html).toContain(es.adminHouseEditsOriginal)
  expect(html).toContain(es.adminHouseEditsEdited)
  expect(html).toContain('magmar_a')
  expect(html).toContain('edit-001')
  expect(html).toContain('nerf de vida')
  expect(html).toContain('&quot;hp&quot;: 70')
  expect(html).toContain('&quot;hp&quot;: 80')
  expect(html).toContain('houseEdited')
})

// AC: SPEC-F/T-048/AC-4 — sin ediciones activas ni carta de destino, avisos
// claros en vez de un diff vacío.
test('AC-4 sin ediciones activas avisa; target inexistente muestra el error', () => {
  const quiet = renderToString(
    <HouseEditsPanel
      edits={{ files: [{ file: 'content/house-edits/off.json', enabled: false, error: null, doc: editsSnapshot.files[1]!.doc }] }}
      cards={cardsSnapshot}
    />,
  )
  expect(quiet).toContain(es.adminHouseEditsNoActive)
  expect(quiet).not.toContain(es.adminHouseEditsEdited)

  const ghost = renderToString(
    <HouseEditsPanel
      edits={{
        files: [
          {
            file: 'content/house-edits/fantasma.json',
            enabled: true,
            error: null,
            doc: { enabled: true, edits: [{ id: 'g-1', target: 'no_existe', set: { hp: 1 } }] },
          },
        ],
      }}
      cards={cardsSnapshot}
    />,
  )
  expect(ghost).toContain('no_existe')
  expect(ghost).toContain('no existe')
})
