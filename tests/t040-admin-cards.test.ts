// AC: SPEC-E/T-040 — /admin/cards: middleware dev (listado/guardado), filtros,
// chequeos cruzados, teclado y exclusión del build de producción.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { AdminSaveError, adminCardsPlugin, adminFilePath, listAdminCards, listAdminPhotos, saveAdminFile } from '../apps/web/src/admin/server.ts'
import { applyFilter, adminKeyAction, flattenCards, markVerified, stepIndex } from '../apps/web/src/admin/draft.ts'
import { adminCrossChecks } from '../apps/web/src/admin/crossChecks.ts'

function card(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    dex: 10,
    name: id,
    stage: 'basic',
    deck: 'bosque',
    hp: 40,
    element: 'grass',
    attacks: [
      {
        id: 'placaje',
        name: 'Placaje',
        kind: 'attack',
        rollFaces: [1, 2],
        cost: ['any'],
        element: 'normal',
        damage: { base: 10 },
        effects: [],
        rawText: '',
      },
    ],
    specialties: [],
    evolvesTo: [],
    source: { verified: true },
    ...over,
  }
}

function makeContent(): string {
  const tmp = mkdtempSync(join(tmpdir(), 't040-'))
  mkdirSync(join(tmp, 'pokemon', '_staging'), { recursive: true })
  writeFileSync(
    join(tmp, 'pokemon', 'main.json'),
    JSON.stringify({
      _comment: 'fixture',
      pending: ['later'],
      cards: [
        card('a', { dex: 1, specialties: [{ op: 'custom', handler: 'TODO_x' }] }),
        card('b', { dex: 2, source: { verified: false } }),
      ],
    }),
  )
  writeFileSync(
    join(tmp, 'pokemon', '_staging', 'foo.json'),
    JSON.stringify({ cards: [card('c', { dex: 3, hp: 'xx', source: { verified: true } })] }),
  )
  return tmp
}

function atk(id: string, faces: number[]): Record<string, unknown> {
  return {
    id,
    name: id,
    kind: 'attack',
    rollFaces: faces,
    cost: [],
    element: 'normal',
    damage: { base: 10 },
    effects: [],
    rawText: '',
  }
}

// AC: SPEC-E/T-040/AC-1 — lista cartas de content/pokemon/** y _staging/**, con
// flags para los filtros: sin verificar / con custom / con errores de esquema.
test('AC: SPEC-E/T-040/AC-1 el listado cubre pokemon/** y _staging/** y los filtros clasifican', () => {
  const tmp = makeContent()
  try {
    const snap = listAdminCards(tmp)
    expect(snap.files.map((f) => f.file)).toEqual([
      'content/pokemon/main.json',
      'content/pokemon/_staging/foo.json',
    ])
    expect(snap.files[0]?.staging).toBe(false)
    expect(snap.files[1]?.staging).toBe(true)
    expect(snap.files[0]?.doc).toMatchObject({ _comment: 'fixture' })
    expect(snap.files[0]?.cards).toHaveLength(2)
    expect(snap.files[1]?.cards).toHaveLength(1)

    const flat = flattenCards(snap)
    expect(applyFilter(flat, 'unverified').map((c) => c.draft.id)).toEqual(['b'])
    expect(applyFilter(flat, 'custom').map((c) => c.draft.id)).toEqual(['a'])
    expect(applyFilter(flat, 'errors').map((c) => c.draft.id)).toEqual(['c'])
    expect(applyFilter(flat, 'all')).toHaveLength(3)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-E/T-040/AC-3 — guardar escribe el JSON (solo destinos permitidos y
// docs que validan); "Verificada" ⇒ source.verified=true.
test('AC: SPEC-E/T-040/AC-3 saveAdminFile escribe validado y rechaza rutas/esquemas inválidos', () => {
  const tmp = makeContent()
  try {
    const snap = listAdminCards(tmp)
    const doc = snap.files[0]?.doc as { cards: Record<string, unknown>[] }
    doc.cards[1] = markVerified(doc.cards[1] ?? {})
    saveAdminFile(tmp, 'content/pokemon/main.json', doc)
    const written = JSON.parse(readFileSync(join(tmp, 'pokemon', 'main.json'), 'utf8')) as { _comment: string; cards: { id: string; source: { verified: boolean } }[] }
    expect(written._comment).toBe('fixture')
    expect(written.cards[1]?.source.verified).toBe(true)

    saveAdminFile(tmp, 'content/pokemon/_staging/new.json', { cards: [card('n')] })
    expect(readFileSync(join(tmp, 'pokemon', '_staging', 'new.json'), 'utf8')).toContain('"n"')

    for (const bad of ['content/items.json', 'content/pokemon/../evil.json', 'C:/evil.json', 'content/pokemon/gyms.json']) {
      expect(adminFilePath(tmp, bad)).toBeNull()
      expect(() => saveAdminFile(tmp, bad, { cards: [] })).toThrow(AdminSaveError)
    }
    expect(() => saveAdminFile(tmp, 'content/pokemon/main.json', { cards: [{ sin: 'ataques' }] })).toThrow(/esquema inválido/)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-E/T-040/AC-3 — la herramienta no entra al build de producción: el
// import dinámico de /admin/cards está gated por import.meta.env.DEV en App.tsx.
test('AC: SPEC-E/T-040/AC-3 el chunk de /admin/cards solo se carga en dev', () => {
  const src = readFileSync(join('apps', 'web', 'src', 'App.tsx'), 'utf8')
  expect(/import\.meta\.env\.DEV[\s\S]{0,160}?admin\/CardsAdmin/.test(src)).toBe(true)
  const plugin = adminCardsPlugin()
  expect(plugin.name).toBe('admin-cards-dev')
  expect(plugin.apply).toBe('serve')
})

// AC: carga-manual-cartas/AC-3 — el middleware responde JSON siempre: GET /photos
// lista las fotos y las rutas desconocidas dan 404 JSON (nunca el HTML del
// fallback SPA, que rompería res.json() con "Unexpected token '<'").
test('AC: carga-manual-cartas/AC-3 GET /photos responde JSON y lo desconocido da 404 JSON', () => {
  const tmp = mkdtempSync(join(tmpdir(), 't040ruta-'))
  try {
    mkdirSync(join(tmp, 'photos'), { recursive: true })
    writeFileSync(join(tmp, 'photos', 'una.jpg'), 'x')
    const handlers: Array<(req: unknown, res: unknown) => void> = []
    const fakeServer = {
      middlewares: {
        use: (_prefix: string, h: (req: unknown, res: unknown) => void) => {
          handlers.push(h)
        },
      },
    }
    const configure = adminCardsPlugin(tmp).configureServer
    if (typeof configure !== 'function') throw new Error('configureServer no es función')
    // El hook declara `this` de plugin context; acá se invoca suelto (sin this).
    const invoke = configure as unknown as (server: unknown) => void
    invoke(fakeServer)
    expect(handlers).toHaveLength(1)

    const call = (method: string, url: string): { status: number; type: string; body: string } => {
      const out = { status: 0, type: '', body: '' }
      const res = {
        statusCode: 0,
        setHeader: (k: string, v: string) => {
          if (k === 'content-type') out.type = v
        },
        end: (b: string) => {
          out.status = res.statusCode
          out.body = b
        },
      }
      handlers[0]?.({ method, url }, res)
      return out
    }

    const photos = call('GET', '/photos')
    expect(photos.status).toBe(200)
    expect(photos.type).toContain('application/json')
    expect(JSON.parse(photos.body)).toEqual({ photos: ['photos/una.jpg'] })

    const bogus = call('GET', '/no-existe')
    expect(bogus.status).toBe(404)
    expect(bogus.type).toContain('application/json')
    expect((JSON.parse(bogus.body) as { error: string }).error).toContain('no implementada')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-E/T-040/AC-4 — chequeos cruzados visibles: evoluciones faltantes,
// dex duplicados y solapamiento de rollFaces.
test('AC: SPEC-E/T-040/AC-4 adminCrossChecks detecta evoluciones, dex y rollFaces', () => {
  const snap = {
    files: [
      {
        file: 'content/pokemon/x.json',
        staging: false,
        fileError: null,
        pending: ['prometido'],
        doc: null,
        cards: [
          { raw: card('uno', { dex: 5, evolvesTo: [{ id: 'fantasma', xp: 2 }, { id: 'prometido', xp: 1 }] }), id: 'uno' },
          { raw: card('dos', { dex: 5 }), id: 'dos' },
          { raw: card('tres', { dex: 6, attacks: [atk('at1', [3, 4]), atk('at2', [4, 5])] }), id: 'tres' },
        ],
      },
    ],
  }
  const problems = adminCrossChecks(snap)
  expect(problems.some((p) => p.includes('#uno') && p.includes('fantasma'))).toBe(true)
  expect(problems.some((p) => p.includes('dex 5 duplicado'))).toBe(true)
  expect(problems.some((p) => p.includes('#tres') && p.includes('cara 4'))).toBe(true)

  const clean = {
    files: [
      {
        file: 'content/pokemon/x.json',
        staging: false,
        fileError: null,
        pending: ['prometido'],
        doc: null,
        cards: [{ raw: card('ok', { evolvesTo: [{ id: 'prometido', xp: 1 }] }), id: 'ok' }],
      },
    ],
  }
  expect(adminCrossChecks(clean)).toEqual([])
})

// AC: carga-manual-cartas/AC-3 — GET /photos: listado recursivo de content/photos/**
// (carpetas y subcarpetas, solo .jpg/.jpeg/.png/.webp, segmentos seguros).
test('AC: carga-manual-cartas/AC-3 listAdminPhotos recorre carpetas y filtra extensiones', () => {
  const tmp = mkdtempSync(join(tmpdir(), 't040fotos-'))
  try {
    mkdirSync(join(tmp, 'photos', 'Mazos', 'Mazo bosque'), { recursive: true })
    writeFileSync(join(tmp, 'photos', 'Mazos', 'Mazo bosque', '01 - Paras.jpg'), 'x')
    writeFileSync(join(tmp, 'photos', 'Mazos', 'anim.gif'), 'x')
    writeFileSync(join(tmp, 'photos', 'raiz.png'), 'x')
    writeFileSync(join(tmp, 'photos', 'notas.txt'), 'x')
    const { photos } = listAdminPhotos(tmp)
    expect(photos).toEqual(['photos/Mazos/Mazo bosque/01 - Paras.jpg', 'photos/raiz.png'])
    expect(listAdminPhotos(join(tmp, 'sin-photos'))).toEqual({ photos: [] })
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: carga-manual-cartas/AC-4 — el archivo destino nuevo se crea al guardar
// (respeta SAFE_NAME, sin traversal) y aparece en el snapshot recargado.
test('AC: carga-manual-cartas/AC-4 saveAdminFile crea el archivo destino nuevo', () => {
  const tmp = makeContent()
  try {
    saveAdminFile(tmp, 'content/pokemon/_staging/carga-manual.json', { cards: [card('manual_1')] })
    const written = JSON.parse(readFileSync(join(tmp, 'pokemon', '_staging', 'carga-manual.json'), 'utf8')) as { cards: { id: string }[] }
    expect(written.cards[0]?.id).toBe('manual_1')
    expect(listAdminCards(tmp).files.map((f) => f.file)).toContain('content/pokemon/_staging/carga-manual.json')
    for (const bad of ['content/photos.json', 'content/pokemon/_staging/../x.json', 'content/pokemon/a/b.json']) {
      expect(() => saveAdminFile(tmp, bad, { cards: [card('x')] })).toThrow(AdminSaveError)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: borrar-abra-sin-verificar/AC-1|AC-2 — el CRUD guarda en archivos con `_`
// inicial: `_samples.json` se lista en /admin/cards pero el PUT /cards lo
// rechazaba con "destino no permitido" (el borrado persiste vía saveAdminFile).
test('AC: borrar-abra-sin-verificar/AC-1|AC-2 adminFilePath/saveAdminFile aceptan nombres con `_` inicial', () => {
  const tmp = makeContent()
  try {
    expect(adminFilePath(tmp, 'content/pokemon/_samples.json')).toBe(join(tmp, 'pokemon', '_samples.json'))
    expect(adminFilePath(tmp, 'content/pokemon/_staging/_nuevo.json')).toBe(join(tmp, 'pokemon', '_staging', '_nuevo.json'))
    saveAdminFile(tmp, 'content/pokemon/_samples.json', { cards: [card('s')] })
    const back = JSON.parse(readFileSync(join(tmp, 'pokemon', '_samples.json'), 'utf8')) as { cards: { id: string }[] }
    expect(back.cards.map((c) => c.id)).toEqual(['s'])
    for (const bad of ['content/items.json', 'content/pokemon/../evil.json', 'C:/evil.json', 'content/pokemon/gyms.json', 'content/pokemon/a/b.json']) {
      expect(adminFilePath(tmp, bad)).toBeNull()
      expect(() => saveAdminFile(tmp, bad, { cards: [] })).toThrow(AdminSaveError)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-E/T-040/AC-5 — navegación con teclado para revisar ≥ 30 cartas/hora:
// j/k navegan (con wrap), v verifica, s guarda, +/- zoom, f FX; nunca mientras
// se escribe en INPUT/TEXTAREA/SELECT.
test('AC: SPEC-E/T-040/AC-5 adminKeyAction y stepIndex implementan la navegación', () => {
  expect(adminKeyAction('j', 'BODY')).toBe('next')
  expect(adminKeyAction('ArrowDown', 'BODY')).toBe('next')
  expect(adminKeyAction('k', 'BODY')).toBe('prev')
  expect(adminKeyAction('ArrowUp', 'BODY')).toBe('prev')
  expect(adminKeyAction('v', 'BODY')).toBe('verify')
  expect(adminKeyAction('s', 'BODY')).toBe('save')
  expect(adminKeyAction('+', 'BODY')).toBe('zoomIn')
  expect(adminKeyAction('-', 'BODY')).toBe('zoomOut')
  expect(adminKeyAction('f', 'BODY')).toBe('fx')
  expect(adminKeyAction('x', 'BODY')).toBeNull()
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
    expect(adminKeyAction('v', tag)).toBeNull()
  }
  expect(stepIndex(0, 3, -1)).toBe(2)
  expect(stepIndex(2, 3, 1)).toBe(0)
  expect(stepIndex(0, 0, 1)).toBe(-1)
})
