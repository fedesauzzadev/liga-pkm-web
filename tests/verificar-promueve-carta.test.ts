// AC: verificar-promueve-carta — Verificar una carta de _staging la promueve al
// canónico content/pokemon/<deck>.json en una sola operación (server-side).
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import {
  AdminSaveError, adminFilePath, deleteAdminFileIfEmpty, promoteVerifiedCard, saveAdminFile,
} from '../apps/web/src/admin/promote.ts'
import { adminCardsPlugin, listAdminCards } from '../apps/web/src/admin/server.ts'

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
  const tmp = mkdtempSync(join(tmpdir(), 'vpromote-'))
  mkdirSync(join(tmp, 'pokemon', '_staging'), { recursive: true })
  writeFileSync(
    join(tmp, 'pokemon', 'main.json'),
    JSON.stringify({ _comment: 'fixture', pending: ['later'], cards: [card('a', { dex: 1 }), card('b', { dex: 2 })] }),
  )
  writeFileSync(
    join(tmp, 'pokemon', '_staging', 'foo.json'),
    JSON.stringify({ cards: [card('c', { dex: 3, source: { verified: false } })] }),
  )
  return tmp
}

// AC: verificar-promueve-carta/AC-1 — verificar una carta de _staging la
// promueve en una sola operación: agrega la carta (verified) al canónico
// content/pokemon/<deck>.json y, si el staging queda con 0 cartas, lo borra.
test('AC: verificar-promueve-carta/AC-1 promover escribe el canónico y borra el staging vacío', () => {
  const tmp = makeContent()
  try {
    const out = promoteVerifiedCard(tmp, 'content/pokemon/_staging/foo.json', { cards: [] }, card('c'))
    expect(out).toEqual({ to: 'content/pokemon/bosque.json', stagingDeleted: true })
    const canon = JSON.parse(readFileSync(join(tmp, 'pokemon', 'bosque.json'), 'utf8')) as {
      cards: { id: string; source: { verified: boolean } }[]
    }
    expect(canon.cards).toHaveLength(1)
    expect(canon.cards[0]?.id).toBe('c')
    expect(canon.cards[0]?.source.verified).toBe(true)
    expect(existsSync(join(tmp, 'pokemon', '_staging', 'foo.json'))).toBe(false)
    const snap = listAdminCards(tmp)
    expect(snap.files.map((f) => f.file)).toEqual(['content/pokemon/bosque.json', 'content/pokemon/main.json'])
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: verificar-promueve-carta/AC-1 — si el staging conserva cartas, se guarda
// sin la promovida (preservando _comment/pending); el canónico preserva los
// _comment/pending del archivo destino existente.
test('AC: verificar-promueve-carta/AC-1 staging con más cartas se guarda sin la promovida', () => {
  const tmp = makeContent()
  try {
    writeFileSync(
      join(tmp, 'pokemon', '_staging', 'dos.json'),
      JSON.stringify({ _comment: 'escaneo', pending: ['evo'], cards: [card('d', { dex: 4 }), card('e', { dex: 5 })] }),
    )
    saveAdminFile(tmp, 'content/pokemon/bosque.json', { _comment: 'mazo', pending: ['futuro'], cards: [card('z')] })
    const out = promoteVerifiedCard(
      tmp,
      'content/pokemon/_staging/dos.json',
      { _comment: 'escaneo', pending: ['evo'], cards: [card('e', { dex: 5 })] },
      card('d', { dex: 4, source: { verified: false } }),
    )
    expect(out).toEqual({ to: 'content/pokemon/bosque.json', stagingDeleted: false })
    const staging = JSON.parse(readFileSync(join(tmp, 'pokemon', '_staging', 'dos.json'), 'utf8')) as {
      _comment: string
      pending: string[]
      cards: { id: string }[]
    }
    expect(staging._comment).toBe('escaneo')
    expect(staging.pending).toEqual(['evo'])
    expect(staging.cards.map((c) => c.id)).toEqual(['e'])
    const canon = JSON.parse(readFileSync(join(tmp, 'pokemon', 'bosque.json'), 'utf8')) as {
      _comment: string
      pending: string[]
      cards: { id: string }[]
    }
    expect(canon._comment).toBe('mazo')
    expect(canon.pending).toEqual(['futuro'])
    expect(canon.cards.map((c) => c.id)).toEqual(['z', 'd'])
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: verificar-promueve-carta/AC-2 — carta inválida, id duplicado (en el
// destino o en otro canónico), doc de staging inválido o origen no staging ⇒
// AdminSaveError claro y no se escribe nada.
test('AC: verificar-promueve-carta/AC-2 rechazos sin escribir nada', () => {
  const tmp = makeContent()
  try {
    expect(() => promoteVerifiedCard(tmp, 'content/pokemon/_staging/foo.json', { cards: [] }, card('c', { hp: 'xx' })))
      .toThrow(AdminSaveError)
    expect(() => promoteVerifiedCard(tmp, 'content/pokemon/_staging/foo.json', { cards: [] }, card('a'))).toThrow(/ya existe/)
    saveAdminFile(tmp, 'content/pokemon/bosque.json', { cards: [card('c')] })
    expect(() => promoteVerifiedCard(tmp, 'content/pokemon/_staging/foo.json', { cards: [] }, card('c'))).toThrow(/ya existe/)
    expect(() => promoteVerifiedCard(tmp, 'content/pokemon/_staging/foo.json', { cards: [{ mal: 1 }] }, card('n', { dex: 9 })))
      .toThrow(AdminSaveError)
    // el doc todavía contiene la carta ⇒ promoción inconsistente.
    expect(() => promoteVerifiedCard(tmp, 'content/pokemon/_staging/foo.json', { cards: [card('q')] }, card('q')))
      .toThrow(AdminSaveError)
    // solo se promueve desde _staging.
    expect(() => promoteVerifiedCard(tmp, 'content/pokemon/main.json', { cards: [] }, card('n', { dex: 9 })))
      .toThrow(/no permitido/)
    expect(() => promoteVerifiedCard(tmp, 'content/pokemon/_staging/../evil.json', { cards: [] }, card('n', { dex: 9 })))
      .toThrow(/no permitido/)
    // nada se escribió: staging intacto, canónico sin alta nueva.
    const staging = JSON.parse(readFileSync(join(tmp, 'pokemon', '_staging', 'foo.json'), 'utf8')) as { cards: { id: string }[] }
    expect(staging.cards.map((c) => c.id)).toEqual(['c'])
    const canon = JSON.parse(readFileSync(join(tmp, 'pokemon', 'bosque.json'), 'utf8')) as { cards: { id: string }[] }
    expect(canon.cards.map((c) => c.id)).toEqual(['c'])
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: verificar-promueve-carta/AC-2 — el lector de escaneos escribe nombres
// con espacios (p. ej. "Gimnasios 2_03.json"): también se promueven.
test('AC: verificar-promueve-carta/AC-2 acepta archivos de staging con espacios en el nombre', () => {
  const tmp = makeContent()
  try {
    writeFileSync(
      join(tmp, 'pokemon', '_staging', 'Gimnasios 2_03.json'),
      JSON.stringify({ cards: [card('g', { dex: 6 })] }),
    )
    const out = promoteVerifiedCard(
      tmp,
      'content/pokemon/_staging/Gimnasios 2_03.json',
      { cards: [] },
      card('g', { dex: 6 }),
    )
    expect(out.to).toBe('content/pokemon/bosque.json')
    expect(existsSync(join(tmp, 'pokemon', '_staging', 'Gimnasios 2_03.json'))).toBe(false)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: verificar-promueve-carta/AC-5 — borrar la última carta del archivo lo
// elimina del disco; se niega si todavía tiene cartas o la ruta no va.
test('AC: verificar-promueve-carta/AC-5 deleteAdminFileIfEmpty borra el vacío y se niega con cartas', () => {
  const tmp = makeContent()
  try {
    saveAdminFile(tmp, 'content/pokemon/_staging/vacio.json', { cards: [] })
    deleteAdminFileIfEmpty(tmp, 'content/pokemon/_staging/vacio.json')
    expect(existsSync(join(tmp, 'pokemon', '_staging', 'vacio.json'))).toBe(false)
    expect(() => deleteAdminFileIfEmpty(tmp, 'content/pokemon/main.json')).toThrow(/todavía tiene/)
    for (const bad of ['content/pokemon/gyms.json', 'content/pokemon/../evil.json', 'content/items.json']) {
      expect(adminFilePath(tmp, bad)).toBeNull()
      expect(() => deleteAdminFileIfEmpty(tmp, bad)).toThrow(AdminSaveError)
    }
    expect(() => deleteAdminFileIfEmpty(tmp, 'content/pokemon/inexistente.json')).toThrow(AdminSaveError)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: verificar-promueve-carta/AC-1|AC-5 — rutas del middleware: POST /promote
// y DELETE /cards responden JSON (éxito y error) como el resto de la API.
test('AC: verificar-promueve-carta/AC-1|AC-5 POST /promote y DELETE /cards responden JSON', async () => {
  const tmp = makeContent()
  try {
    const handlers: Array<(req: unknown, res: unknown) => void> = []
    const configure = adminCardsPlugin(tmp).configureServer
    if (typeof configure !== 'function') throw new Error('configureServer no es función')
    const invoke = configure as unknown as (server: unknown) => void
    invoke({
      middlewares: {
        use: (_prefix: string, h: (req: unknown, res: unknown) => void) => {
          handlers.push(h)
        },
      },
    })
    const call = (method: string, url: string, body?: unknown): Promise<{ status: number; type: string; body: string }> =>
      new Promise((resolve) => {
        const out = { status: 0, type: '', body: '' }
        const res = {
          statusCode: 0,
          setHeader: (k: string, v: string) => {
            if (k === 'content-type') out.type = v
          },
          end: (b: string) => {
            out.status = res.statusCode
            out.body = b
            resolve(out)
          },
        }
        const req = {
          method,
          url,
          on: (ev: string, cb: (chunk?: Buffer) => void) => {
            if (ev === 'data' && body !== undefined) cb(Buffer.from(JSON.stringify(body)))
            if (ev === 'end') cb()
          },
        }
        handlers[0]?.(req, res)
      })

    const ok = await call('POST', '/promote', {
      file: 'content/pokemon/_staging/foo.json',
      doc: { cards: [] },
      card: card('c'),
    })
    expect(ok.status).toBe(200)
    expect(ok.type).toContain('application/json')
    expect(JSON.parse(ok.body)).toMatchObject({ ok: true, to: 'content/pokemon/bosque.json', stagingDeleted: true })
    expect(existsSync(join(tmp, 'pokemon', 'bosque.json'))).toBe(true)

    saveAdminFile(tmp, 'content/pokemon/_staging/vacio.json', { cards: [] })
    const del = await call('DELETE', '/cards', { file: 'content/pokemon/_staging/vacio.json' })
    expect(del.status).toBe(200)
    expect(JSON.parse(del.body)).toEqual({ ok: true })
    expect(existsSync(join(tmp, 'pokemon', '_staging', 'vacio.json'))).toBe(false)

    const bad = await call('POST', '/promote', { file: 'content/pokemon/main.json', doc: { cards: [] }, card: card('x') })
    expect(bad.status).toBe(400)
    expect((JSON.parse(bad.body) as { error: string }).error).toContain('no permitido')

    const delBad = await call('DELETE', '/cards', { file: 'content/pokemon/main.json' })
    expect(delBad.status).toBe(400)
    expect((JSON.parse(delBad.body) as { error: string }).error).toContain('todavía tiene')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
