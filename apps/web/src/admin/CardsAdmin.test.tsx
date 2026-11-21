// @vitest-environment jsdom
// AC: SPEC-E/T-040/AC-2 — el editor ofrece foto lado a lado, selectores de
// íconos de elemento/costo y un editor de efectos limitado a las primitivas del
// esquema, con validación Zod en vivo. Proxy sin navegador (renderToString);
// la revisión visual con fotos la hace el dueño en dev (CARD-INGESTION §4).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { EffectSchema } from '@liga/content'
import { afterEach, expect, test, vi } from 'vitest'
import { es } from '../i18n/es'
import { CardsAdmin } from './CardsAdmin'
import { CardEditor } from './CardEditor'
import { adminCrossChecks } from './crossChecks'
import { deletePokemonForever } from './deleteFlow'
import { EFFECT_FIELDS, EFFECT_OPS } from './EffectsEditor'
import {
  addCard, neighborKeyAfterRemove, newCardDraft, photosByFolder, removeCard,
  validTargetFile, validateCardDraft, type Draft,
} from './draft'

// verificar-promueve-carta — la API dev queda mockeada para los tests de
// interacción (verificar staging ⇒ promote; canónico ⇒ PUT).
const apiSpies = vi.hoisted(() => ({
  fetchCards: vi.fn(),
  save: vi.fn(),
  promote: vi.fn(),
  deleteFile: vi.fn(),
}))
vi.mock('./api', () => ({
  fetchAdminCards: apiSpies.fetchCards,
  fetchAdminPhotos: async () => ({ photos: [] }),
  photoUrl: (photo: string) => `/admin/api/photo?src=${encodeURIComponent(photo)}`,
  saveAdminFile: apiSpies.save,
  promoteVerifiedCard: apiSpies.promote,
  deleteAdminFile: apiSpies.deleteFile,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const validCard = {
  id: 'fixture',
  dex: 60,
  name: 'Poliwag',
  stage: 'basic',
  deck: 'pantano',
  hp: 50,
  element: 'water',
  attacks: [
    {
      id: 'burbujas',
      name: 'Burbujas',
      kind: 'attack',
      rollFaces: [4, 5],
      cost: ['water', 'any'],
      element: 'water',
      damage: { base: 10 },
      effects: [{ op: 'rollGate', failFaces: [1, 2, 3], outcome: 'noAttack', duration: 'combat' }],
      rawText: 'texto',
      officialMove: 'bubble',
      officialMoveStatus: 'proposed',
      fx: 'water',
    },
  ],
  specialties: [{ op: 'custom', handler: 'TODO_prueba', rawText: 'texto' }],
  evolvesTo: [{ id: 'poliwhirl', xp: 1 }],
  source: { verified: true },
}

const invalidCard = { ...validCard, id: 'rota', hp: 'xx', specialties: [], source: { verified: false } }

const snapshot = {
  files: [
    {
      file: 'content/pokemon/main.json',
      staging: false,
      fileError: null,
      pending: ['poliwhirl'],
      doc: { cards: [validCard] },
      cards: [{ raw: validCard, id: 'fixture' }],
    },
    {
      file: 'content/pokemon/_staging/foo.json',
      staging: true,
      fileError: null,
      pending: [],
      doc: { cards: [invalidCard] },
      cards: [{ raw: invalidCard, id: 'rota' }],
    },
  ],
}

// El editor de efectos solo ofrece las primitivas del esquema (24 ops, T-002b).
test('AC: SPEC-E/T-040/AC-2 EFFECT_OPS coincide exactamente con las primitivas de EffectSchema', () => {
  const schemaOps = EffectSchema.options.map((o) => o.shape.op.value)
  expect([...EFFECT_OPS].sort()).toEqual([...schemaOps].sort())
  expect(EFFECT_OPS).toHaveLength(24)
  const rollGate = EFFECT_FIELDS['rollGate']
  expect(rollGate?.map((f) => f.key)).toEqual(['failFaces', 'outcome', 'duration', 'onRoll'])
  expect(rollGate?.[1]?.kind).toBe('enum')
  // fixedRolls (T-002b): rolls 2|3 editable como entero, validado en vivo por Zod.
  const fixedRolls = EFFECT_FIELDS['fixedRolls']
  expect(fixedRolls?.map((f) => f.key)).toEqual(['rolls', 'faces', 'amount', 'onRoll'])
  expect(fixedRolls?.[0]?.kind).toBe('int')
})

test('AC: SPEC-E/T-040/AC-2 validación Zod en vivo sobre el draft', () => {
  expect(validateCardDraft(validCard).valid).toBe(true)
  const broken = validateCardDraft(invalidCard)
  expect(broken.valid).toBe(false)
  expect(broken.errors.join('\n')).toContain('hp')
})

test('AC: SPEC-E/T-040/AC-2 la página renderiza filtros, foto, selectores de íconos y efectos', () => {
  const html = renderToString(<CardsAdmin initial={snapshot} />)
  expect(html).toContain(es.adminTitle)
  expect(html).toContain(`${es.adminFilterUnverified} (1)`)
  expect(html).toContain(`${es.adminFilterCustom} (1)`)
  expect(html).toContain(`${es.adminFilterErrors} (1)`)
  expect(html).toContain('Poliwag')
  // Foto lado a lado (placeholder cuando no hay source.photo) y zoom.
  expect(html).toContain(es.adminNoPhoto)
  expect(html).toContain(`aria-label="${es.adminZoomIn}"`)
  // Selector de elemento con ícono y costo con ícono por slot (Agua / cualquiera).
  expect(html).toContain('<option value="water">Agua</option>')
  expect(html).toContain(`aria-label="${es.elementNames.water}"`)
  expect(html).toContain(`aria-label="${es.anyElement}"`)
  // Efectos: la op del esquema aparece como opción; custom también.
  expect(html).toContain('<option value="rollGate">rollGate</option>')
  expect(html).toContain('<option value="custom">custom</option>')
  // Validación en vivo (badge de la carta seleccionada) + acciones de guardado
  // (AC-3) y teclado (AC-5).
  expect(html).toContain(es.adminValidOk)
  expect(html).toContain(es.adminSave)
  expect(html).toContain(es.adminVerifyNext)
  expect(html).toContain(es.adminKeyboardHint)
  expect(html).toContain(es.adminChecksTitle)
})

// AC: SPEC-E/T-042b — la carta seleccionada se dibuja como en el juego (PkmCard)
// bajo la foto: el dueño compara transcripción ↔ carta generada al revisar.
test('AC: SPEC-E/T-042b vista previa de la carta generada desde el draft', () => {
  const html = renderToString(<CardsAdmin initial={snapshot} />)
  expect(html).toContain(es.adminCardPreview)
  // La primera visible (fixture válida, sin daño) se dibuja con sus datos.
  expect(html).toContain('data-deck="pantano"')
  expect(html).toContain('data-hp="50/50"')
  // SSR de React separa nodos de texto adyacentes con <!-- -->.
  expect(html).toContain('4-5<!-- -->_')
  expect(html).toContain('(10)')
  // El editor de la carta rota muestra el aviso en lugar de la carta.
  expect(html).not.toContain(es.adminCardInvalid)
})

// ── Carga manual (plan .opencode/plan/carga-manual-cartas.md) ──

// AC: carga-manual-cartas/AC-1 — "Agregar pokemon" con template mínimo editable
// y selector de archivo destino (existente o nuevo, default _staging/carga-manual).
test('AC: carga-manual-cartas/AC-1 template mínimo, addCard y controles de alta', () => {
  const template = newCardDraft()
  expect(template).toMatchObject({
    id: '',
    name: '',
    stage: 'basic',
    hp: 1,
    element: 'normal',
    source: { verified: false },
  })
  const attack = (template.attacks as Draft[])[0]
  expect(attack).toMatchObject({ name: '', kind: 'attack', cost: [], effects: [] })

  const doc = { _comment: 'repo', pending: ['x'], cards: [validCard] }
  const added = addCard(doc, template)
  expect(added._comment).toBe('repo')
  expect(added.pending).toEqual(['x'])
  const addedCards = added.cards as unknown[]
  expect(addedCards).toHaveLength(2)
  expect(addedCards[1]).toBe(template)

  const html = renderToString(<CardsAdmin initial={snapshot} />)
  expect(html).toContain(es.adminAddPokemon)
  expect(html).toContain(es.adminTargetFile)
  expect(html).toContain('value="content/pokemon/main.json"')
  expect(html).toContain(es.adminTargetNew)
})

// AC: carga-manual-cartas/AC-2 — "Eliminar pokemon" quita la carta del doc
// (desde eliminar-carta-definitivo el borrado persiste al confirmar); la
// selección salta a la vecina.
test('AC: carga-manual-cartas/AC-2 removeCard y salto de selección a la vecina', () => {
  const other = { ...validCard, id: 'otra', dex: 61 }
  const doc = { cards: [validCard, other] }
  expect(removeCard(doc, 5)).toBe(doc)
  const removed = removeCard(doc, 0)
  expect((removed.cards as { id: string }[]).map((c) => c.id)).toEqual(['otra'])
  expect(doc.cards).toHaveLength(2)

  const flat = [
    { key: 'content/pokemon/main.json#0', file: 'content/pokemon/main.json', index: 0 },
    { key: 'content/pokemon/main.json#1', file: 'content/pokemon/main.json', index: 1 },
    { key: 'content/pokemon/_staging/foo.json#0', file: 'content/pokemon/_staging/foo.json', index: 0 },
  ]
  expect(neighborKeyAfterRemove(flat, 'content/pokemon/main.json#0')).toBe('content/pokemon/main.json#0')
  expect(neighborKeyAfterRemove(flat, 'content/pokemon/main.json#1')).toBe('content/pokemon/_staging/foo.json#0')
  expect(neighborKeyAfterRemove(flat, 'no-existe')).toBeNull()
  expect(neighborKeyAfterRemove(flat.slice(0, 1), 'content/pokemon/main.json#0')).toBeNull()

  const html = renderToString(<CardsAdmin initial={snapshot} />)
  expect(html).toContain(es.adminDeletePokemon)
})

// AC: carga-manual-cartas/AC-3 — picker de foto por carpeta (GET /photos) junto
// al input manual (fallback); al elegir setea source.photo.
test('AC: carga-manual-cartas/AC-3 picker de fotos agrupadas por carpeta junto al input', () => {
  const folders = photosByFolder([
    'photos/Mazos/Mazo bosque/01 - Paras.jpg',
    'photos/Mazos/Mazo cueva/02 - Zubat.png',
    'photos/raiz.webp',
  ])
  expect(folders.map((f) => f.folder)).toEqual(['photos', 'photos/Mazos/Mazo bosque', 'photos/Mazos/Mazo cueva'])

  const html = renderToString(
    <CardEditor
      file="content/pokemon/main.json"
      draft={validCard}
      valid
      errors={[]}
      photoList={['photos/Mazos/Mazo bosque/01 - Paras.jpg', 'photos/raiz.webp']}
      onChange={() => {}}
      onSave={() => {}}
      onVerify={() => {}}
      onPreview={() => {}}
    />,
  )
  expect(html).toContain(`aria-label="${es.adminPhotoPicker}"`)
  expect(html).toContain('<optgroup label="photos/Mazos/Mazo bosque">')
  expect(html).toContain('<option value="photos/Mazos/Mazo bosque/01 - Paras.jpg">')
  // El input manual sigue como fallback.
  expect(html).toContain('placeholder="photos/pantano_03.jpg"')
})

// AC: carga-manual-cartas/AC-4 — destinos permitidos para el archivo nuevo
// (espejo cliente de SAFE_NAME; la creación en disco la testea t040 server-side).
test('AC: carga-manual-cartas/AC-4 validTargetFile acepta pokemon/** y rechaza traversal', () => {
  expect(validTargetFile('content/pokemon/main.json')).toBe(true)
  expect(validTargetFile('content/pokemon/_staging/carga-manual.json')).toBe(true)
  for (const bad of [
    '',
    'content/photos.json',
    'content/pokemon/gyms.json',
    'content/pokemon/../evil.json',
    'content/pokemon/a/b.json',
    'content/pokemon/_staging/a\\b.json',
    'C:/evil.json',
  ]) {
    expect(validTargetFile(bad)).toBe(false)
  }
})

// AC: carga-manual-cartas/AC-5 — la carga manual "escribe" el JSON: el template
// vacío no valida (el guardado falla con errores visibles) y al completarlo sí.
test('AC: carga-manual-cartas/AC-5 el template vacío no valida; completado sí', () => {
  const empty = validateCardDraft(newCardDraft())
  expect(empty.valid).toBe(false)
  expect(empty.errors.join('\n')).toContain('id')
  expect(empty.errors.join('\n')).toContain('name')
  expect(empty.errors.join('\n')).toContain('rollFaces')

  const template = newCardDraft()
  const attacks = (template.attacks as Draft[]).map((a, i) =>
    i === 0 ? { ...a, name: 'Golpe', rollFaces: [1] } : a,
  )
  const filled = validateCardDraft({ ...template, id: 'nueva', name: 'Nueva', attacks })
  expect(filled.valid).toBe(true)
})

// AC: carga-manual-cartas/AC-6 — eliminar una carta referenciada por evolvesTo
// queda marcada por los cross-checks existentes en el panel de chequeos.
test('AC: carga-manual-cartas/AC-6 al eliminar una carta referenciada, los chequeos la marcan', () => {
  const base = { ...validCard, evolvesTo: [{ id: 'poliwhirl', xp: 1 }] }
  const evo = { ...validCard, id: 'poliwhirl', name: 'Poliwhirl', dex: 61 }
  const snapshotOf = (doc: Draft) => ({
    files: [
      {
        file: 'content/pokemon/main.json',
        staging: false,
        fileError: null,
        pending: [],
        doc: null,
        cards: (Array.isArray(doc.cards) ? doc.cards : []).map((raw) => ({ raw, id: (raw as { id: string }).id })),
      },
    ],
  })
  const doc = removeCard({ cards: [base, evo] }, 1)
  const problems = adminCrossChecks(snapshotOf(doc))
  expect(problems.some((p) => p.includes('poliwhirl') && p.includes('no existe'))).toBe(true)
  expect(adminCrossChecks(snapshotOf({ cards: [base, evo] }))).toEqual([])
})

// AC: carga-manual-cartas/AC-7 — textos nuevos en español rioplatense, sin deps nuevas.
test('AC: carga-manual-cartas/AC-7 textos de la carga manual centralizados en es.ts', () => {
  expect(es.adminAddPokemon).toBe('Agregar pokemon')
  expect(es.adminDeletePokemon).toBe('Eliminar pokemon')
  expect(es.adminDeleteConfirm).toContain('¿Eliminar')
  expect(es.adminTargetFile).toBe('Archivo destino')
  expect(es.adminTargetNew).toContain('nuevo archivo')
  expect(es.adminPhotoPicker).toContain('foto')
  expect(es.adminPhotoPick).toContain('elegir')
  expect(es.adminAdded).toContain('guardá')
  expect(es.adminDeleted).toBe('Carta eliminada')
  expect(es.adminBadTarget).toContain('inválido')
})

// ── Borrado definitivo (plan .opencode/plan/eliminar-carta-definitivo.md) ──

// IO espía del flujo de borrado: registra persist/setDocs/setSelected/setStatus.
function spyIo(persistError: string | null, confirmed = true, deleteError: string | null = null) {
  const persisted: { file: string; doc: Draft }[] = []
  const docsStates: Map<string, Draft>[] = []
  const selected: (string | null)[] = []
  const statuses: string[] = []
  const deletedFiles: string[] = []
  let confirmedWith: string | null = null
  const io = {
    confirmRemove: (message: string): boolean => {
      confirmedWith = message
      return confirmed
    },
    persist: async (file: string, doc: Draft): Promise<string | null> => {
      persisted.push({ file, doc })
      return persistError
    },
    deleteEmptyFile: async (file: string): Promise<string | null> => {
      deletedFiles.push(file)
      return deleteError
    },
    setDocs: (docs: Map<string, Draft>): void => {
      docsStates.push(docs)
    },
    setSelected: (key: string | null): void => {
      selected.push(key)
    },
    setStatus: (status: string): void => {
      statuses.push(status)
    },
  }
  return { io, persisted, docsStates, selected, statuses, deletedFiles, confirmedWith: () => confirmedWith }
}

const mainFile = 'content/pokemon/main.json'
const otherCard = { ...validCard, id: 'otra', dex: 61 }
const deleteVisible = [
  { key: `${mainFile}#0`, file: mainFile, index: 0 },
  { key: `${mainFile}#1`, file: mainFile, index: 1 },
]

// AC: eliminar-carta-definitivo/AC-1 — borrar persiste el doc sin la carta en
// el mismo momento (PUT vía persist); el estado local queda sin la carta.
test('AC: eliminar-carta-definitivo/AC-1 borrar persiste el doc sin la carta y salta a la vecina', async () => {
  const spy = spyIo(null)
  const docs = new Map<string, Draft>([[mainFile, { cards: [validCard, otherCard] }]])
  await deletePokemonForever(
    { file: mainFile, index: 0, key: `${mainFile}#0`, draft: validCard },
    docs,
    deleteVisible,
    spy.io,
  )
  // Confirmación previa (AC-3) con el nombre de la carta.
  expect(spy.confirmedWith()).toContain(es.adminDeleteConfirm)
  expect(spy.confirmedWith()).toContain('Poliwag')
  // Persistencia inmediata del doc sin la carta.
  expect(spy.persisted).toHaveLength(1)
  const saved = spy.persisted[0]
  if (saved === undefined) throw new Error('no se persistió el doc')
  expect(saved.file).toBe(mainFile)
  expect((saved.doc.cards as { id: string }[]).map((c) => c.id)).toEqual(['otra'])
  // Estado final: doc sin la carta, selección en la vecina, status definitivo.
  expect((spy.docsStates.at(-1)?.get(mainFile)?.cards as { id: string }[])).toHaveLength(1)
  expect(spy.selected.at(-1)).toBe(`${mainFile}#0`)
  expect(spy.statuses.at(-1)).toBe(es.adminDeleted)
  // Quedan cartas ⇒ no se pide borrar el archivo.
  expect(spy.deletedFiles).toEqual([])
})

// AC: eliminar-carta-definitivo/AC-2 — si el guardado falla, el borrado local
// se revierte (la carta vuelve al doc) y el error queda visible en el status.
test('AC: eliminar-carta-definitivo/AC-2 fallo de guardado revierte el borrado y muestra el error', async () => {
  const spy = spyIo('esquema inválido')
  const docs = new Map<string, Draft>([[mainFile, { cards: [validCard, otherCard] }]])
  await deletePokemonForever(
    { file: mainFile, index: 0, key: `${mainFile}#0`, draft: validCard },
    docs,
    deleteVisible,
    spy.io,
  )
  expect(spy.persisted).toHaveLength(1)
  // Reversión: el doc final es el previo, con la carta de vuelta.
  expect(spy.docsStates.at(-1)).toBe(docs)
  expect((spy.docsStates.at(-1)?.get(mainFile)?.cards as { id: string }[])).toHaveLength(2)
  expect(spy.statuses.at(-1)).toContain(es.adminSaveFailed)
  expect(spy.statuses.at(-1)).toContain('esquema inválido')
})

// AC: eliminar-carta-definitivo/AC-3 — sin confirmación no se toca nada.
test('AC: eliminar-carta-definitivo/AC-3 cancelar el confirm no borra ni persiste', async () => {
  const spy = spyIo(null, false)
  const docs = new Map<string, Draft>([[mainFile, { cards: [validCard] }]])
  await deletePokemonForever(
    { file: mainFile, index: 0, key: `${mainFile}#0`, draft: validCard },
    docs,
    deleteVisible,
    spy.io,
  )
  expect(spy.persisted).toHaveLength(0)
  expect(spy.docsStates).toHaveLength(0)
  expect(spy.statuses).toHaveLength(0)
})

// ── Promover al verificar (plan .opencode/plan/verificar-promueve-carta.md) ──

const stageCard = { ...validCard, id: 'staging_1', name: 'Bellsprout', deck: 'bosque', source: { verified: false } }
const promotedCard = { ...stageCard, source: { verified: true } }
const mainEntry = {
  file: 'content/pokemon/main.json',
  staging: false,
  fileError: null,
  pending: ['poliwhirl'],
  doc: { cards: [validCard] },
  cards: [{ raw: validCard, id: 'fixture' }],
}
const stagingSnapshot = {
  files: [
    mainEntry,
    {
      file: 'content/pokemon/_staging/foo.json',
      staging: true,
      fileError: null,
      pending: [],
      doc: { cards: [stageCard] },
      cards: [{ raw: stageCard, id: 'staging_1' }],
    },
  ],
}
const afterPromote = {
  files: [
    mainEntry,
    {
      file: 'content/pokemon/bosque.json',
      staging: false,
      fileError: null,
      pending: [],
      doc: { cards: [promotedCard] },
      cards: [{ raw: promotedCard, id: 'staging_1' }],
    },
  ],
}

// AC: verificar-promueve-carta/AC-1|AC-6 — verificar una carta de staging
// llama a promote (doc sin ella + carta verificada), recarga el snapshot y la
// muestra sin badge staging con el mensaje nuevo.
test('AC: verificar-promueve-carta/AC-1|AC-6 verificar una carta de staging promueve y refresca', async () => {
  apiSpies.fetchCards.mockResolvedValueOnce(stagingSnapshot).mockResolvedValueOnce(afterPromote)
  apiSpies.promote.mockResolvedValue({ to: 'content/pokemon/bosque.json', stagingDeleted: true })
  render(<CardsAdmin />)
  const list = await screen.findByTestId('admin-card-list')
  fireEvent.click(within(list).getByText(/Bellsprout/))
  fireEvent.click(screen.getByRole('button', { name: es.adminVerifyNext }))
  await waitFor(() => expect(apiSpies.promote).toHaveBeenCalledTimes(1))
  expect(apiSpies.promote.mock.calls[0]?.[0]).toBe('content/pokemon/_staging/foo.json')
  expect(apiSpies.promote.mock.calls[0]?.[1]).toMatchObject({ cards: [] })
  expect(apiSpies.promote.mock.calls[0]?.[2]).toMatchObject({ id: 'staging_1', source: { verified: true } })
  expect(apiSpies.save).not.toHaveBeenCalled()
  // Recarga: el promote toca dos archivos ⇒ snapshot de nuevo del disco.
  await waitFor(() => expect(apiSpies.fetchCards).toHaveBeenCalledTimes(2))
  // AC-6: sin badge "staging", verificada, mensaje de estado nuevo.
  await waitFor(() => expect(screen.queryByText(es.adminStagingBadge)).toBeNull())
  expect(screen.getAllByText(/Bellsprout/).length).toBeGreaterThan(0)
  expect(screen.getByText(es.adminPromoted)).toBeTruthy()
})

// AC: verificar-promueve-carta/AC-3 — verificar una carta canónica hace lo de
// hoy (PUT al mismo archivo); no se promueve.
test('AC: verificar-promueve-carta/AC-3 verificar una carta canónica hace PUT y no promueve', async () => {
  apiSpies.fetchCards.mockResolvedValue(stagingSnapshot)
  apiSpies.save.mockResolvedValue(undefined)
  render(<CardsAdmin />)
  const list = await screen.findByTestId('admin-card-list')
  fireEvent.click(within(list).getByText(/Poliwag/))
  fireEvent.click(screen.getByRole('button', { name: es.adminVerifyNext }))
  await waitFor(() => expect(apiSpies.save).toHaveBeenCalledTimes(1))
  expect(apiSpies.save.mock.calls[0]?.[0]).toBe('content/pokemon/main.json')
  expect(apiSpies.save.mock.calls[0]?.[1]).toMatchObject({ cards: [{ id: 'fixture', source: { verified: true } }] })
  expect(apiSpies.promote).not.toHaveBeenCalled()
})

// AC: verificar-promueve-carta/AC-2 — si el promote falla, el error del server
// queda visible en el status con el formato existente.
test('AC: verificar-promueve-carta/AC-2 fallo del promote muestra el error en el status', async () => {
  apiSpies.fetchCards.mockResolvedValue(stagingSnapshot)
  apiSpies.promote.mockRejectedValue(new Error('ya existe una carta con id "staging_1"'))
  render(<CardsAdmin />)
  const list = await screen.findByTestId('admin-card-list')
  fireEvent.click(within(list).getByText(/Bellsprout/))
  fireEvent.click(screen.getByRole('button', { name: es.adminVerifyNext }))
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain(es.adminSaveFailed))
  expect(screen.getByRole('status').textContent).toContain('ya existe')
})

// AC: verificar-promueve-carta/AC-5 — borrar la última carta de un archivo pide
// borrar el archivo vacío (sin archivos fantasma re-apareciendo).
test('AC: verificar-promueve-carta/AC-5 borrar la última carta del archivo borra el archivo', async () => {
  const spy = spyIo(null)
  const docs = new Map<string, Draft>([[mainFile, { cards: [validCard] }]])
  await deletePokemonForever(
    { file: mainFile, index: 0, key: `${mainFile}#0`, draft: validCard },
    docs,
    [{ key: `${mainFile}#0`, file: mainFile, index: 0 }],
    spy.io,
  )
  expect(spy.deletedFiles).toEqual([mainFile])
  expect(spy.statuses.at(-1)).toBe(es.adminDeleted)
})

// AC: verificar-promueve-carta/AC-5 — si el borrado del archivo falla, el
// error queda visible (el doc ya persistió sin la carta).
test('AC: verificar-promueve-carta/AC-5 fallo al borrar el archivo deja el error visible', async () => {
  const spy = spyIo(null, true, 'todavía tiene 2 carta(s); no se borra')
  const docs = new Map<string, Draft>([[mainFile, { cards: [validCard] }]])
  await deletePokemonForever(
    { file: mainFile, index: 0, key: `${mainFile}#0`, draft: validCard },
    docs,
    [{ key: `${mainFile}#0`, file: mainFile, index: 0 }],
    spy.io,
  )
  expect(spy.deletedFiles).toEqual([mainFile])
  expect(spy.statuses.at(-1)).toBe(`${es.adminSaveFailed}: todavía tiene 2 carta(s); no se borra`)
})
