// AC: SPEC-E/T-045/AC-1 — `pnpm pokeapi` genera content/reference/pokeapi/{species,moves,
// evolutions}.json con id, nombres EN/ES y tipo; reintentos; faltantes reportados; targets
// de evolución con dex > 151 excluidos; cadenas dedupeadas por URL. Red inyectada.
// AC: SPEC-E/T-045/AC-2 — content:validate cruza dex↔nombre↔tipo, evoluciones y
// officialMove contra la referencia (errores claros si no coinciden).
// AC: SPEC-E/T-045/AC-3 — funciona sin red si los archivos ya existen (--force regenera).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { syncReference, type JsonFetcher } from '../tools/pokeapi.ts'
import { normalizeName, typeToElement } from '../packages/content/src/reference.ts'
import { collect } from '../packages/content/src/validate.ts'

const root = process.cwd()
const outDir = join(root, 'node_modules', '.cache', 't045-pokeapi')
const API = 'https://pokeapi.co/api/v2'

// ── Mini PokeAPI en memoria ─────────────────────────────────────────────────────
const pokemon = (dex: number, types: string[]): unknown => ({
  id: dex,
  types: types.map((t, i) => ({ slot: i + 1, type: { name: t } })),
})
const species = (dex: number, nameEn: string, nameEs: string, chain: number): unknown => ({
  id: dex,
  names: [
    { language: { name: 'en' }, name: nameEn },
    { language: { name: 'es' }, name: nameEs },
  ],
  evolution_chain: { url: `${API}/evolution-chain/${chain}/` },
})
const node = (dex: number, evolvesTo: unknown[] = []): unknown => ({
  species: { url: `${API}/pokemon-species/${dex}/` },
  evolves_to: evolvesTo,
})
const move = (id: string, nameEn: string, nameEs: string, type: string): unknown => ({
  name: id,
  names: [
    { language: { name: 'en' }, name: nameEn },
    { language: { name: 'es' }, name: nameEs },
  ],
  type: { name: type },
})

// Especies: cadena compartida squirtle→wartortle→blastoise (dedupe), poliwag→poliwhirl→
// politoed(186, debe quedar fuera), clefairy (fairy, alias normal), abra→kadabra (plan
// probar-encuentro-abra) + las de _samples.json.
function serverData(): Map<string, unknown> {
  const data = new Map<string, unknown>()
  const put = (url: string, payload: unknown): void => void data.set(url, payload)
  const entries: Array<[number, unknown]> = [
    [4, pokemon(4, ['fire'])], [5, pokemon(5, ['fire'])], [6, pokemon(6, ['fire'])],
    [7, pokemon(7, ['water'])], [8, pokemon(8, ['water'])], [9, pokemon(9, ['water'])],
    [35, pokemon(35, ['fairy'])], [60, pokemon(60, ['water'])], [61, pokemon(61, ['water'])],
    [63, pokemon(63, ['psychic'])], [64, pokemon(64, ['psychic'])], [114, pokemon(114, ['grass'])],
  ]
  for (const [dex, payload] of entries) put(`${API}/pokemon/${dex}`, payload)
  const speciesEntries: Array<[number, unknown]> = [
    [4, species(4, 'Charmander', 'Charmander', 1)], [5, species(5, 'Charmeleon', 'Charmeleon', 1)],
    [6, species(6, 'Charizard', 'Charizard', 1)],
    [7, species(7, 'Squirtle', 'Squirtle', 2)], [8, species(8, 'Wartortle', 'Wartortle', 2)],
    [9, species(9, 'Blastoise', 'Blastoise', 2)], [35, species(35, 'Clefairy', 'Clefairy', 3)],
    [60, species(60, 'Poliwag', 'Poliwag', 4)], [61, species(61, 'Poliwhirl', 'Poliwhirl', 4)],
    [63, species(63, 'Abra', 'Abra', 6)], [64, species(64, 'Kadabra', 'Kadabra', 6)],
    [114, species(114, 'Tangela', 'Tangela', 5)],
  ]
  for (const [dex, payload] of speciesEntries) put(`${API}/pokemon-species/${dex}`, payload)
  put(`${API}/evolution-chain/1/`, { chain: node(4, [node(5, [node(6)])]) })
  put(`${API}/evolution-chain/2/`, { chain: node(7, [node(8, [node(9)])]) })
  put(`${API}/evolution-chain/3/`, { chain: node(35) })
  put(`${API}/evolution-chain/4/`, { chain: node(60, [node(61, [node(186)])]) })
  put(`${API}/evolution-chain/5/`, { chain: node(114) })
  put(`${API}/evolution-chain/6/`, { chain: node(63, [node(64)]) })
  const moves = [
    move('absorb', 'Absorb', 'Absorber', 'grass'), move('bubble', 'Bubble', 'Burbuja', 'water'),
    move('double-slap', 'Double Slap', 'Doble bofetón', 'normal'),
    move('fire-spin', 'Fire Spin', 'Giro fuego', 'fire'),
    move('flamethrower', 'Flamethrower', 'Lanzallamas', 'fire'),
    move('headbutt', 'Headbutt', 'Golpe cabeza', 'normal'), move('pound', 'Pound', 'Golpe', 'normal'),
    move('scratch', 'Scratch', 'Arañazo', 'normal'),
    move('stun-spore', 'Stun Spore', 'Espora paralizadora', 'grass'),
    move('tackle', 'Tackle', 'Placaje', 'normal'), move('withdraw', 'Withdraw', 'Refugio', 'water'),
  ]
  put(`${API}/generation/1`, { moves: moves.map((m) => ({ name: (m as { name: string }).name })) })
  for (const m of moves) put(`${API}/move/${(m as { name: string }).name}`, m)
  return data
}

function makeServer(calls: Map<string, number>, fail500once: string[] = [], fail404: string[] = []): JsonFetcher {
  const data = serverData()
  return async (url) => {
    calls.set(url, (calls.get(url) ?? 0) + 1)
    if (fail404.includes(url)) return { ok: false, status: 404 }
    if (fail500once.includes(url) && calls.get(url) === 1) return { ok: false, status: 500 }
    const payload = data.get(url)
    if (payload === undefined) return { ok: false, status: 404 }
    return { ok: true, json: payload }
  }
}

const DEXES = [4, 5, 6, 7, 8, 9, 35, 60, 61, 63, 64, 114]

test('AC: SPEC-E/T-045/AC-1 genera species/moves/evolutions con nombres EN/ES y tipos', async () => {
  rmSync(outDir, { recursive: true, force: true })
  const calls = new Map<string, number>()
  const run = await syncReference(outDir, {
    fetcher: makeServer(calls, [`${API}/pokemon-species/7`]),
    sleeper: async () => {},
    dexes: DEXES,
  })
  expect(run.skipped).toBe(false)
  expect(run.missing).toEqual([])

  const sp = JSON.parse(readFileSync(join(outDir, 'species.json'), 'utf8')) as {
    species: Array<{ dex: number; nameEn: string; nameEs: string; types: string[] }>
  }
  expect(sp.species.map((s) => s.dex)).toEqual([4, 5, 6, 7, 8, 9, 35, 60, 61, 63, 64, 114])
  expect(sp.species.find((s) => s.dex === 7)).toMatchObject({ nameEn: 'Squirtle', nameEs: 'Squirtle', types: ['water'] })

  const mv = JSON.parse(readFileSync(join(outDir, 'moves.json'), 'utf8')) as {
    moves: Array<{ id: string; nameEn: string; nameEs: string; type: string }>
  }
  expect(mv.moves.map((m) => m.id)).toContain('flamethrower')
  expect(mv.moves.find((m) => m.id === 'flamethrower')).toMatchObject({ nameEn: 'Flamethrower', nameEs: 'Lanzallamas', type: 'fire' })

  const ev = JSON.parse(readFileSync(join(outDir, 'evolutions.json'), 'utf8')) as {
    evolutions: Array<{ dex: number; evolvesTo: Array<{ dex: number; nameEn: string }> }>
  }
  expect(ev.evolutions.find((e) => e.dex === 60)?.evolvesTo).toEqual([{ dex: 61, nameEn: 'Poliwhirl', nameEs: 'Poliwhirl' }])
  expect(ev.evolutions.find((e) => e.dex === 61)?.evolvesTo).toEqual([]) // politoed (186) excluido
  expect(ev.evolutions.find((e) => e.dex === 7)?.evolvesTo?.map((t) => t.dex)).toEqual([8])
  expect(ev.evolutions.find((e) => e.dex === 114)?.evolvesTo).toEqual([])

  // Reintento: 500 reintenta y logra (2 intentos); cadena compartida: 1 sola request.
  expect(calls.get(`${API}/pokemon-species/7`)).toBe(2)
  expect(calls.get(`${API}/evolution-chain/2/`)).toBe(1)

  // Faltantes: 404 en una especie ⇒ reporte + data degradada (sin dex 61).
  const bad = await syncReference(join(outDir, 'bad'), {
    fetcher: makeServer(new Map(), [], [`${API}/pokemon/61`]),
    sleeper: async () => {},
    dexes: DEXES,
  })
  expect(bad.missing.join('\n')).toContain('61')
  expect(bad.summary.join('\n')).toContain('faltantes')
})

test('AC: SPEC-E/T-045/AC-2 content:validate cruza cartas contra la referencia', () => {
  // Normalización y alias de tipos (Gen 1 sin fairy ⇒ normal).
  expect(normalizeName('Nidoran♀')).toBe('nidoran')
  expect(normalizeName("Farfetch'd")).toBe('farfetchd')
  expect(typeToElement('fairy')).toBe('normal')
  expect(typeToElement('steel')).toBeNull()
  expect(typeToElement('water')).toBe('water')

  // Copia del content real + referencia generada por AC-1.
  const contentDir = join(outDir, 'content')
  rmSync(contentDir, { recursive: true, force: true })
  mkdirSync(join(contentDir, 'pokemon'), { recursive: true })
  mkdirSync(join(contentDir, 'board'), { recursive: true })
  cpSync(join(root, 'content', 'pokemon', '_samples.json'), join(contentDir, 'pokemon', '_samples.json'))
  cpSync(join(root, 'content', 'ruleset.classic.json'), join(contentDir, 'ruleset.classic.json'))
  cpSync(join(root, 'content', 'board', 'kanto.json'), join(contentDir, 'board', 'kanto.json'))
  cpSync(join(root, 'content', 'energy.json'), join(contentDir, 'energy.json'))
  const refDir = join(contentDir, 'reference', 'pokeapi')
  mkdirSync(refDir, { recursive: true })
  for (const f of ['species.json', 'moves.json', 'evolutions.json']) cpSync(join(outDir, f), join(refDir, f))

  const ok = collect(contentDir)
  expect(ok.errors).toEqual([])
  expect(ok.warnings.join('\n')).toContain('12/151') // referencia chica ⇒ warning, no error

  // Errores claros: dex↔nombre, tipo, evolución y officialMove.
  const samplesPath = join(contentDir, 'pokemon', '_samples.json')
  const samples = JSON.parse(readFileSync(samplesPath, 'utf8')) as { cards: Array<Record<string, unknown>> }
  const byId = (id: string): Record<string, unknown> => samples.cards.find((c) => c.id === id) ?? {}
  byId('squirtle').name = 'Squirtel'
  byId('squirtle').element = 'grass'
  ;(byId('poliwag').evolvesTo as Array<{ id: string }>)[0]!.id = 'politoed'
  ;((byId('charmander').attacks as Array<Record<string, unknown>>)[0] as { officialMove: string }).officialMove = 'psybeam'
  writeFileSync(samplesPath, JSON.stringify(samples))

  const bad = collect(contentDir)
  const all = bad.errors.join('\n')
  expect(all).toContain('dex 7 es "Squirtle"')
  expect(all).toContain('la carta usa "grass"')
  expect(all).toContain('evolvesTo "politoed"')
  expect(all).toContain('psybeam')

  // Referencia incompleta (falta evolutions.json) ⇒ error claro.
  rmSync(join(refDir, 'evolutions.json'))
  expect(collect(contentDir).errors.join('\n')).toContain('referencia incompleta')
})

test('AC: SPEC-E/T-045/AC-3 funciona sin red si los archivos ya existen', async () => {
  // outDir conserva los 3 archivos del test AC-1.
  const boom: JsonFetcher = async () => {
    throw new Error('no debería llamarse')
  }
  const run = await syncReference(outDir, { fetcher: boom })
  expect(run.skipped).toBe(true)
  expect(run.summary.join('\n')).toContain('sin red')

  const run2 = await syncReference(outDir, {
    fetcher: makeServer(new Map()),
    sleeper: async () => {},
    force: true,
    dexes: DEXES,
  })
  expect(run2.skipped).toBe(false)
  expect(run2.missing).toEqual([])
  rmSync(outDir, { recursive: true, force: true })
})
