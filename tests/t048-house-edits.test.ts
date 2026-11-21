// AC: SPEC-F/T-048 — ediciones de la casa: aplicación en el loader (función pura
// compartida con la UI), ops + revalidación + marcas, errores con id de edición,
// toggle persistente del server dev y contentHash en el save. Un test por AC.
// T-048b — fixes: el ejemplo apunta a una carta real, la carga de la UI degrada
// sin romper la app y el toggle del server dev valida antes de habilitar.
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import {
  HouseEditsFileSchema,
  PokemonCardSchema,
} from '../packages/content/src/index.ts'
import { applyHouseEdits, resolveHouseEdits } from '../packages/content/src/apply-house-edits.ts'
import { collect } from '../packages/content/src/validate.ts'
import { AdminSaveError, listHouseEdits, setHouseEditEnabled } from '../apps/web/src/admin/server.ts'
import { contentHash, gameContent, houseEditsIssues } from '../apps/web/src/game/content.ts'
import { createMemoryStorage, hashJson, readSave, writeSave, type SaveData } from '../apps/web/src/game/save.ts'

const repoContent = join(process.cwd(), 'content')

/** magmar_a con el ataque giro_fuego que edita `_example.json`. */
function fixtureCard(): Record<string, unknown> {
  return {
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
        id: 'placaje', name: 'Placaje', kind: 'attack', rollFaces: [1, 2], cost: [],
        element: 'normal', damage: { base: 20 }, effects: [], rawText: '',
      },
      {
        id: 'giro_fuego', name: 'Giro fuego', kind: 'attack', rollFaces: [3, 4], cost: ['fire'],
        element: 'fire', damage: { base: 30, ifRoll: { faces: [6], damage: 40 } }, effects: [], rawText: '',
      },
    ],
    specialties: [],
    evolvesTo: [],
    source: { verified: true },
  }
}

/** Directorio content/ mínimo y válido: ruleset/board/energy reales del repo +
 * una carta fixture + charmander REAL (target de `_example.json`) + los
 * archivos de house-edits que pase el test. */
function makeTmp(edits: Record<string, unknown> = {}): string {
  const tmp = mkdtempSync(join(tmpdir(), 't048-'))
  mkdirSync(join(tmp, 'board'), { recursive: true })
  mkdirSync(join(tmp, 'pokemon'), { recursive: true })
  mkdirSync(join(tmp, 'house-edits'), { recursive: true })
  copyFileSync(join(repoContent, 'ruleset.classic.json'), join(tmp, 'ruleset.classic.json'))
  copyFileSync(join(repoContent, 'board', 'kanto.json'), join(tmp, 'board', 'kanto.json'))
  copyFileSync(join(repoContent, 'energy.json'), join(tmp, 'energy.json'))
  // T-048b: charmander y charmeleon de verdad (_samples.json) para que el
  // dry-run del toggle y `_example.json` ejerzan el contenido real, no solo la
  // fixture (Q-091: charmeleon ya es carta cargada; su evolvesTo charizard sí
  // está en pending).
  const samples = JSON.parse(
    readFileSync(join(repoContent, 'pokemon', '_samples.json'), 'utf8'),
  ) as { cards?: unknown[]; pending?: string[] }
  const byId = (id: string): unknown =>
    samples.cards?.find((card) => (card as { id?: unknown } | null)?.id === id)
  const charmander = byId('charmander')
  const charmeleon = byId('charmeleon')
  if (charmander === undefined || charmeleon === undefined) {
    throw new Error('falta charmander/charmeleon en content/pokemon/_samples.json')
  }
  writeFileSync(
    join(tmp, 'pokemon', 'main.json'),
    JSON.stringify({ cards: [fixtureCard(), charmander, charmeleon], pending: samples.pending ?? [] }, null, 1),
  )
  for (const [name, doc] of Object.entries(edits)) {
    writeFileSync(join(tmp, 'house-edits', name), JSON.stringify(doc, null, 1))
  }
  return tmp
}

const exampleDoc = (enabled: boolean): Record<string, unknown> => {
  const raw = JSON.parse(readFileSync(join(repoContent, 'house-edits', '_example.json'), 'utf8')) as Record<string, unknown>
  return { ...raw, enabled }
}

const cardAt = (tmp: string, id = 'magmar_a') => {
  const { content, errors } = collect(tmp)
  expect(errors, errors.join('\n')).toEqual([])
  const card = content?.cards.find((c) => c.id === id)
  expect(card).toBeDefined()
  return card!
}

// AC: SPEC-F/T-048/AC-1 — con features.houseEdits y enabled:true el loader
// aplica las ediciones tras cargar las cartas: orden alfabético por archivo y
// por edits[]; la carga de la UI usa la misma función pura.
test('AC-1 el loader aplica en orden alfabético por archivo y por edits[]', () => {
  const tmp = makeTmp({
    // Se listan desordenados a propósito: 'a' debe aplicar antes que 'b'.
    'b.json': { enabled: true, edits: [{ id: 'b-1', target: 'magmar_a', set: { hp: 70 } }] },
    'a.json': {
      enabled: true,
      edits: [
        { id: 'a-1', target: 'magmar_a', set: { hp: 60 } },
        { id: 'a-2', target: 'magmar_a', set: { hp: 61 } },
      ],
    },
  })
  try {
    const card = cardAt(tmp)
    // edits[] en orden (a-2 pisa a a-1) y archivos en orden (b pisa a a).
    expect(card.hp).toBe(70)
    expect(card.source.houseEdited).toBe(true)
    expect(card.source.editId).toBe('b-1')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  // La carga de la UI usa la misma resolución pura (parse + enabled + aplicación).
  const ui = readFileSync(join(process.cwd(), 'apps', 'web', 'src', 'game', 'content.ts'), 'utf8')
  expect(ui).toContain('resolveHouseEdits(')
})

// AC: SPEC-F/T-048/AC-2 — ops set/attacks/addAttacks/removeAttacks aplicadas con
// fusión profunda, revalidación Zod y marcas source.houseEdited/editId.
test('AC-2 las 4 ops aplican, el resultado revalida y la carta queda marcada', () => {
  const original = PokemonCardSchema.parse(fixtureCard())
  const result = applyHouseEdits([original], [
    {
      file: 'content/house-edits/x.json',
      doc: HouseEditsFileSchema.parse({
        enabled: true,
        edits: [
          {
            id: 'e-1',
            target: 'magmar_a',
            set: { hp: 80 },
            attacks: { giro_fuego: { name: 'Giro Fuego+', damage: { base: 50 } } },
            removeAttacks: ['placaje'],
            addAttacks: [
              {
                id: 'lanza_llamas', name: 'Lanza llamas', kind: 'attack', rollFaces: [5, 6],
                cost: ['fire'], element: 'fire', damage: { base: 40 }, effects: [], rawText: '',
              },
            ],
          },
        ],
      }),
    },
  ])
  expect(result.errors).toEqual([])
  const edited = result.cards[0]!
  expect(edited.hp).toBe(80)
  expect(edited.attacks.map((a) => a.id)).toEqual(['giro_fuego', 'lanza_llamas'])
  // Fusión profunda: base 50 nuevo, ifRoll del original conservado.
  expect(edited.attacks[0]!.name).toBe('Giro Fuego+')
  expect(edited.attacks[0]!.damage).toEqual({ base: 50, ifRoll: { faces: [6], damage: 40 } })
  expect(edited.source.houseEdited).toBe(true)
  expect(edited.source.editId).toBe('e-1')
  // El original no se toca (solo copias en memoria).
  expect(result.cards[0]).not.toBe(original)
  expect(original.hp).toBe(70)
  expect(original.attacks.map((a) => a.id)).toEqual(['placaje', 'giro_fuego'])
  expect(original.source.houseEdited).toBeUndefined()
})

// AC: SPEC-F/T-048/AC-3 — target inexistente o edición inválida ⇒ error claro
// con id de edición y archivo; nunca se escriben los originales de content/pokemon.
test('AC-3 target inexistente/edición inválida dan error con id y no escriben originales', () => {
  // Función pura: target que no existe.
  const missing = applyHouseEdits([PokemonCardSchema.parse(fixtureCard())], [
    {
      file: 'content/house-edits/no-existe.json',
      doc: HouseEditsFileSchema.parse({
        enabled: true,
        edits: [{ id: 'e-404', target: 'fantasma', set: { hp: 99 } }],
      }),
    },
  ])
  expect(missing.cards[0]!.hp).toBe(70) // sin cambios
  expect(missing.errors.join('\n')).toContain('content/house-edits/no-existe.json#e-404')
  expect(missing.errors.join('\n')).toContain('fantasma')

  // Función pura: ataque inexistente en el patch.
  const badAttack = applyHouseEdits([PokemonCardSchema.parse(fixtureCard())], [
    {
      file: 'content/house-edits/x.json',
      doc: HouseEditsFileSchema.parse({
        enabled: true,
        edits: [{ id: 'e-atk', target: 'magmar_a', attacks: { rayo: { damage: { base: 1 } } } }],
      }),
    },
  ])
  expect(badAttack.errors.join('\n')).toContain('x.json#e-atk')
  expect(badAttack.errors.join('\n')).toContain('rayo')

  // Loader: edición que rompe el esquema (hp negativo) ⇒ error con id de
  // edición y archivo; el JSON original queda byte a byte igual en disco.
  const tmp = makeTmp({
    'roto.json': {
      enabled: true,
      edits: [{ id: 'e-bad', target: 'magmar_a', set: { hp: -5 } }],
    },
  })
  try {
    const before = readFileSync(join(tmp, 'pokemon', 'main.json'), 'utf8')
    const { errors } = collect(tmp)
    expect(errors.join('\n')).toContain('content/house-edits/roto.json#e-bad')
    expect(readFileSync(join(tmp, 'pokemon', 'main.json'), 'utf8')).toBe(before)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-F/T-048/AC-4 — el server dev lista los archivos y persiste `enabled`
// (la vista lado a lado se testea en apps/web/src/admin/HouseEditsPanel.test.tsx).
test('AC-4 setHouseEditEnabled persiste el flag y rechaza destinos raros', () => {
  const tmp = makeTmp({ '_example.json': exampleDoc(true), 'roto.json': { enabled: 'si' } })
  try {
    const listed = listHouseEdits(tmp)
    expect(listed.files.map((f) => f.file)).toEqual([
      'content/house-edits/_example.json',
      'content/house-edits/roto.json',
    ])
    expect(listed.files[0]!.enabled).toBe(true)
    expect(listed.files[1]!.error).not.toBeNull()

    const off = setHouseEditEnabled(tmp, 'content/house-edits/_example.json', false)
    expect(off.enabled).toBe(false)
    const onDisk = readFileSync(join(tmp, 'house-edits', '_example.json'), 'utf8')
    expect(onDisk).toContain('"enabled": false')
    // Solo cambia el flag: el resto del doc (edits, _comment) se conserva.
    expect(JSON.parse(onDisk)).toMatchObject({ edits: [{ id: 'edit-001', target: 'charmander' }] })

    setHouseEditEnabled(tmp, 'content/house-edits/_example.json', true)
    expect(readFileSync(join(tmp, 'house-edits', '_example.json'), 'utf8')).toContain('"enabled": true')

    for (const bad of ['content/pokemon/main.json', 'content/house-edits/../x.json', 'content/house-edits/sub/x.json']) {
      expect(() => setHouseEditEnabled(tmp, bad, true)).toThrow(AdminSaveError)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-F/T-048/AC-5 — `_example.json` habilitado sobre la carta real
// (charmander) da el resultado esperado; deshabilitado no cambia nada (on/off
// end-to-end). T-048b: el ejemplo SIEMPRE apunta a una carta que existe.
test('AC-5 _example.json on aplica el diff esperado; off no cambia nada', () => {
  const on = makeTmp({ '_example.json': exampleDoc(true) })
  try {
    const card = cardAt(on, 'charmander')
    expect(card.hp).toBe(70)
    const giro = card.attacks.find((a) => a.id === 'giro_fuego')
    expect(giro?.damage.base).toBe(30)
    // Fusión profunda: el ifRoll del original se conserva.
    expect(giro?.damage.ifRoll).toEqual({ faces: [5, 6], damage: 50 })
    expect(card.source.houseEdited).toBe(true)
    expect(card.source.editId).toBe('edit-001')
  } finally {
    rmSync(on, { recursive: true, force: true })
  }

  const off = makeTmp({ '_example.json': exampleDoc(false) })
  try {
    const card = cardAt(off, 'charmander')
    expect(card.hp).toBe(60)
    expect(card.attacks.find((a) => a.id === 'giro_fuego')?.damage.base).toBe(20)
    expect(card.source.houseEdited).toBeUndefined()
    expect(card.source.editId).toBeUndefined()
  } finally {
    rmSync(off, { recursive: true, force: true })
  }
})

// T-048b/Fix-2 — la carga de la UI degrada en vez de romper la app: archivos con
// esquema inválido o ediciones que no aplican se REPORTAN y se saltean (las
// válidas siguen aplicando); nunca lanza. Antes: throw a nivel de módulo ⇒
// pantalla blanca en toda la web.
test('T-048b resolveHouseEdits reporta y sigue (sin throw) con archivos inválidos', () => {
  const samples = JSON.parse(
    readFileSync(join(repoContent, 'pokemon', '_samples.json'), 'utf8'),
  ) as { cards?: unknown[] }
  const charmanderRaw = samples.cards?.find(
    (card) => (card as { id?: unknown } | null)?.id === 'charmander',
  )
  const charmander = PokemonCardSchema.parse(charmanderRaw)

  const result = resolveHouseEdits(
    [charmander],
    [
      {
        file: 'content/house-edits/bueno.json',
        doc: { enabled: true, edits: [{ id: 'ok-1', target: 'charmander', set: { hp: 65 } }] },
      },
      {
        file: 'content/house-edits/target-fantasma.json',
        doc: { enabled: true, edits: [{ id: 'bad-1', target: 'fantasma', set: { hp: 99 } }] },
      },
      {
        file: 'content/house-edits/esquema-roto.json',
        doc: { enabled: true, edits: 'no soy un array' },
      },
    ],
    true,
  )
  const joined = result.errors.join('\n')
  expect(joined).toContain('target-fantasma.json#bad-1')
  expect(joined).toContain('fantasma')
  expect(joined).toContain('esquema-roto.json')
  expect(joined).toContain('esquema inválido')
  // La edición válida aplicó igual (degradación, no todo-o-nada).
  expect(result.cards[0]!.hp).toBe(65)
  expect(result.cards[0]!.source.houseEdited).toBe(true)

  // features.houseEdits=false: no aplica nada ni reporta errores.
  const off = resolveHouseEdits(
    [charmander],
    [{ file: 'content/house-edits/bueno.json', doc: { enabled: true, edits: [{ id: 'ok-1', target: 'charmander', set: { hp: 65 } }] } }],
    false,
  )
  expect(off.errors).toEqual([])
  expect(off.cards[0]!.hp).toBe(60)
  expect(off.cards[0]!.source.houseEdited).toBeUndefined()
})

// T-048b/Fix-2 (wiring) — content.ts expone los issues de la carga; con el
// contenido del repo (ejemplo deshabilitado) no hay ninguno.
test('T-048b content.ts expone houseEditsIssues; repo limpio ⇒ []', () => {
  expect(houseEditsIssues).toEqual([])
  expect(contentHash).toBe(hashJson(gameContent))
})

// T-048b/Fix-3 — el toggle del server dev hace dry-run antes de habilitar: un
// archivo que no aplica (target inexistente) o que choca con otro habilitado
// (ataque duplicado) se RECHAZA con el error y queda disabled en disco.
// Deshabilitar nunca se bloquea (es la vía de recuperación).
test('T-048b setHouseEditEnabled rechaza habilitar si el dry-run falla', () => {
  const nuevoAtaque = {
    id: 'ataque_nuevo', name: 'Ataque nuevo', kind: 'attack', rollFaces: [6],
    cost: [], element: 'normal', damage: { base: 10 }, effects: [], rawText: '',
  }
  const tmp = makeTmp({
    '_example.json': exampleDoc(false),
    'fantasma.json': { enabled: false, edits: [{ id: 'f-1', target: 'fantasma', set: { hp: 1 } }] },
    'a-activo.json': { enabled: true, edits: [{ id: 'a-1', target: 'charmander', addAttacks: [nuevoAtaque] }] },
    'b-choque.json': { enabled: false, edits: [{ id: 'b-1', target: 'charmander', addAttacks: [nuevoAtaque] }] },
  })
  try {
    // Target inexistente ⇒ AdminSaveError con archivo#id y el target.
    let error: AdminSaveError | null = null
    try {
      setHouseEditEnabled(tmp, 'content/house-edits/fantasma.json', true)
    } catch (err) {
      error = err instanceof AdminSaveError ? err : null
    }
    expect(error).not.toBeNull()
    expect(error!.message).toContain('fantasma.json#f-1')
    expect(error!.message).toContain('fantasma')
    expect(JSON.parse(readFileSync(join(tmp, 'house-edits', 'fantasma.json'), 'utf8')).enabled).toBe(false)

    // Colisión con un archivo ya habilitado (mismo ataque agregado) ⇒ rechazo.
    let choque: AdminSaveError | null = null
    try {
      setHouseEditEnabled(tmp, 'content/house-edits/b-choque.json', true)
    } catch (err) {
      choque = err instanceof AdminSaveError ? err : null
    }
    expect(choque).not.toBeNull()
    expect(choque!.message).toContain('b-choque.json#b-1')
    expect(JSON.parse(readFileSync(join(tmp, 'house-edits', 'b-choque.json'), 'utf8')).enabled).toBe(false)

    // Un archivo válido se habilita normal y deshabilitar jamás se bloquea.
    const ok = setHouseEditEnabled(tmp, 'content/house-edits/fantasma.json', false)
    expect(ok.enabled).toBe(false)
    const on = setHouseEditEnabled(tmp, 'content/house-edits/_example.json', true)
    expect(on.enabled).toBe(true)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-F/T-048/AC-6 — `contentHash` (hash canónico del contenido CON
// ediciones) en SaveData; los saves viejos sin el campo siguen cargando. El
// aviso de la UI al continuar se testea en GameApp.test.tsx.
test('AC-6 contentHash en el save; hash canónico; saves viejos siguen ok', () => {
  expect(contentHash).toMatch(/^[0-9a-f]{8}$/)
  expect(contentHash).toBe(hashJson(gameContent))
  // Canónico: orden de claves irrelevante, contenido distinto ⇒ hash distinto.
  expect(hashJson({ a: 1, b: 2 })).toBe(hashJson({ b: 2, a: 1 }))
  expect(hashJson({ a: 1, b: 2 })).not.toBe(hashJson({ a: 1, b: 3 }))

  const storage = createMemoryStorage()
  const withHash: SaveData = {
    version: 1, seed: 1, starterDeck: 'isla', commandLog: [], stateHash: 'aaaa1111', contentHash,
  }
  writeSave(storage, withHash)
  const read = readSave(storage)
  expect(read).toMatchObject({ kind: 'ok' })
  if (read.kind === 'ok') expect(read.save.contentHash).toBe(contentHash)

  // Save pre-T-048 (sin contentHash): sigue siendo válido y sin hash.
  writeSave(storage, {
    version: 1, seed: 1, starterDeck: 'isla', commandLog: [], stateHash: 'aaaa1111',
  })
  const old = readSave(storage)
  expect(old).toMatchObject({ kind: 'ok' })
  if (old.kind === 'ok') expect(old.save.contentHash).toBeUndefined()
})
