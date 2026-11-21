// AC: .opencode/plan/explicar-campos-admin — ayudas visibles en /admin/cards:
// un test por criterio de aceptación. Proxy sin navegador (renderToString);
// la revisión visual la hace la dueña en dev (pnpm dev → /admin/cards).
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { es } from '../i18n/es'
import { AttackEditor } from './AttackEditor'
import { CardEditor } from './CardEditor'
import { EffectsEditor, EFFECT_OPS } from './EffectsEditor'
import { validateCardDraft, type Draft } from './draft'

const attack: Draft = {
  id: 'burbujas',
  name: 'Burbujas',
  kind: 'attack',
  rollFaces: [4, 5],
  cost: ['water', 'any'],
  element: 'water',
  damage: { base: 10, ifRoll: { faces: [4, 5, 6], damage: 20 } },
  effects: [],
  rawText: '(10) 4-5-6 (20)',
  officialMove: 'bubble',
  officialMoveStatus: 'proposed',
  fx: 'water',
}

const validCard: Draft = {
  id: 'fixture',
  dex: 60,
  name: 'Poliwag',
  stage: 'gym',
  deck: 'pantano',
  hp: 50,
  element: 'water',
  gym: { leader: 'Misty', slot: 2 },
  chances: 3,
  attacks: [attack],
  specialties: [],
  evolvesTo: [{ id: 'poliwhirl', xp: 1 }],
  source: { verified: true, manualPage: 42, photo: 'photos/pantano_03.jpg' },
}

function renderCard(): string {
  return plain(renderToString(
    <CardEditor
      file="content/pokemon/main.json"
      draft={validCard}
      valid
      errors={[]}
      photoList={[]}
      onChange={() => {}}
      onSave={() => {}}
      onVerify={() => {}}
      onPreview={() => {}}
    />,
  ))
}

/** renderToString escapa entidades (&quot; etc.): des-escapa para comparar texto plano. */
function plain(html: string): string {
  return html
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

// AC: plan/explicar-campos-admin/AC-1 — todo campo de la carta muestra su ayuda.
test('AC-1 todos los campos de la carta tienen ayuda visible', () => {
  const html = renderCard()
  for (const help of [
    es.adminHelpId, es.adminHelpDex, es.adminHelpName, es.adminHelpHp, es.adminHelpElement,
    es.adminHelpStage, es.adminHelpDeck, es.adminHelpChances, es.adminHelpGymLeader,
    es.adminHelpGymSlot, es.adminHelpManualPage, es.adminHelpPhoto, es.adminHelpVerified,
    es.adminHelpEvolves, es.adminHelpEvolvesId, es.adminHelpEvolvesXp,
  ]) {
    expect(html).toContain(help)
  }
})

// AC: plan/explicar-campos-admin/AC-2 — todo campo del ataque muestra su ayuda.
test('AC-2 todos los campos del ataque tienen ayuda visible', () => {
  const html = plain(renderToString(<AttackEditor attack={attack} patch={() => {}} onPreview={() => {}} />))
  for (const help of [
    es.adminHelpAttackId, es.adminHelpAttackName, es.adminHelpKind, es.adminHelpAttackElement,
    es.adminHelpRollFaces, es.adminHelpCost, es.adminHelpDamageBase, es.adminHelpIfRoll,
    es.adminHelpRawText,
  ]) {
    expect(html).toContain(help)
  }
})

// AC: plan/explicar-campos-admin/AC-3 — cada op de EFFECT_OPS tiene descripción
// (ni faltantes ni sobrantes: el listado no se desincroniza del esquema).
test('AC-3 cada op de EFFECT_OPS tiene descripción en adminEffectHelp', () => {
  const help = es.adminEffectHelp as Readonly<Record<string, string | undefined>>
  const keys = Object.keys(help)
  for (const op of EFFECT_OPS) {
    expect(help[op], `falta descripción para la op ${op}`).toBeTruthy()
  }
  expect([...keys].sort()).toEqual([...EFFECT_OPS].sort())
})

// AC: plan/explicar-campos-admin/AC-4 — campos genéricos con ayuda corta y
// warning con la regla del ER en la op custom.
test('AC-4 los campos de la op tienen ayuda y custom muestra la regla del ER', () => {
  const html = plain(renderToString(
    <EffectsEditor
      effects={[
        { op: 'rollGate', failFaces: [1, 2, 3], outcome: 'noAttack', duration: 'combat' },
        { op: 'custom', handler: 'TODO_prueba', rawText: 'texto' },
      ]}
      onChange={() => {}}
    />,
  ))
  expect(html).toContain(es.adminEffectHelp.rollGate)
  expect(html).toContain(es.adminEffectFieldHelp.failFaces)
  expect(html).toContain(es.adminEffectFieldHelp.outcome)
  expect(html).toContain(es.adminEffectFieldHelp.duration)
  expect(html).toContain(es.adminCustomWarning)
})

// AC: plan/explicar-campos-admin/AC-5 — el bloque de mapeo oficial explica
// officialMove, estados, FX y de dónde sacar el id.
test('AC-5 el bloque de mapeo oficial explica officialMove, estado, FX y fuentes', () => {
  const html = plain(renderToString(<AttackEditor attack={attack} patch={() => {}} onPreview={() => {}} />))
  expect(html).toContain(es.adminOfficialMoveHelp)
  expect(html).toContain(es.adminOfficialMoveHelpStatus)
  expect(html).toContain(es.adminOfficialMoveHelpFx)
  expect(html).toContain(es.adminOfficialMoveHelpSources)
})

// AC: plan/explicar-campos-admin/AC-6 — solo textos: la validación y las
// acciones de guardado siguen igual que antes de las ayudas.
test('AC-6 sin cambios de comportamiento: validación y acciones intactas', () => {
  const check = validateCardDraft(validCard)
  expect(check.valid, check.errors.join('; ')).toBe(true)
  const html = renderCard()
  expect(html).toContain(es.adminSave)
  expect(html).toContain(es.adminVerifyNext)
  expect(html).toContain(es.adminValidOk)
})
