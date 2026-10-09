// AC: SPEC-E/T-043/AC-1 — `pnpm assets`: sprites frente/espalda con fallback,
// manifests sprites.json/fx.json, reintentos y reporte de faltantes. Red inyectada.
// AC: SPEC-E/T-043/AC-2 — nada de lo descargado entra a git (git ls-files / .gitignore).
// AC: SPEC-E/T-043/AC-3 — docs/ASSETS.md completo: URL + licencia por fuente.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import {
  buildFxManifest,
  buildSpritesManifest,
  buildSummary,
  parseConfig,
  syncAssets,
  toShowdownId,
  type AssetsConfig,
  type Fetcher,
  type TaskReport,
} from '../tools/assets.ts'

const root = process.cwd()
const outRoot = join(root, 'node_modules', '.cache', 't043-assets')
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

const miniConfig: AssetsConfig = {
  sources: {
    aniFront: 'https://example.com/ani/{id}.gif',
    aniBack: 'https://example.com/ani-back/{id}.gif',
    staticFront: 'https://example.com/static/{dex}.png',
    staticBack: 'https://example.com/static/back/{dex}.png',
    fx: 'https://example.com/fx/{file}',
  },
  retries: 2,
  species: [
    { dex: 1, name: 'Bulbasaur' },
    { dex: 150, name: 'Mewtwo' },
    { dex: 151, name: 'Mew' },
  ],
  fx: [
    { key: 'fireball', file: 'fireball.png' },
    { key: 'wisp', file: 'wisp.png' },
  ],
}

// Fetcher falso: 404 definitivo para mewtwo y wisp; mew sin ani (fallback estático);
// el ani de bulbasaur falla 1 vez con 500 y a la 2ª OK (valida reintentos).
function makeFetcher(calls: Map<string, number>): Fetcher {
  return async (url) => {
    calls.set(url, (calls.get(url) ?? 0) + 1)
    if (url.includes('mewtwo') || url.endsWith('/150.png') || url.endsWith('/back/150.png')) {
      return { ok: false, status: 404 }
    }
    if (url.endsWith('/mew.gif')) return { ok: false, status: 404 }
    if (url.endsWith('/wisp.png')) return { ok: false, status: 404 }
    if (url === 'https://example.com/ani/bulbasaur.gif' && (calls.get(url) ?? 0) === 1) {
      return { ok: false, status: 500 }
    }
    return { ok: true, bytes: url.endsWith('.gif') ? GIF : PNG }
  }
}

const byId = (report: readonly TaskReport[]): Map<string, TaskReport> =>
  new Map(report.map((r) => [r.id, r]))

test('AC: SPEC-E/T-043/AC-1 descarga con fallback + manifests + reintentos + faltantes', async () => {
  rmSync(outRoot, { recursive: true, force: true })
  const calls = new Map<string, number>()
  const run = await syncAssets(miniConfig, outRoot, {
    fetcher: makeFetcher(calls),
    sleeper: async () => {},
  })

  // Archivos: bulbasaur ani directo; mew cayó al estático; mewtwo no bajó nada.
  expect(existsSync(join(outRoot, 'sprites', '1.gif'))).toBe(true)
  expect(existsSync(join(outRoot, 'sprites', '1-back.gif'))).toBe(true)
  expect(existsSync(join(outRoot, 'sprites', '151.png'))).toBe(true)
  expect(existsSync(join(outRoot, 'sprites', '151-back.png'))).toBe(true)
  expect(existsSync(join(outRoot, 'sprites', '150.png'))).toBe(false)
  expect(existsSync(join(outRoot, 'fx', 'fireball.png'))).toBe(true)
  expect(existsSync(join(outRoot, 'fx', 'wisp.png'))).toBe(false)

  // Manifest sprites.json: {dex:{front,back}}, faltante = null.
  const sprites = JSON.parse(readFileSync(join(outRoot, 'sprites', 'sprites.json'), 'utf8'))
  expect(Object.keys(sprites)).toEqual(['1', '150', '151'])
  expect(sprites['1']).toEqual({ front: '/sprites/1.gif', back: '/sprites/1-back.gif' })
  expect(sprites['150']).toEqual({ front: null, back: null })
  expect(sprites['151']).toEqual({ front: '/sprites/151.png', back: '/sprites/151-back.png' })
  expect(run.sprites).toEqual(sprites)

  // Manifest fx.json: solo lo descargado.
  expect(run.fx).toEqual({ fireball: '/fx/fireball.png' })
  expect(JSON.parse(readFileSync(join(outRoot, 'fx', 'fx.json'), 'utf8'))).toEqual(run.fx)

  // Reintentos: 500 reintenta y logra bajar (2 intentos); 404 es definitivo (1 intento).
  const rep = byId(run.report)
  expect(rep.get('s:1:front')).toMatchObject({ status: 'ok', attempts: 2 })
  expect(rep.get('f:wisp')).toMatchObject({ status: 'missing', attempts: 1 })
  expect(rep.get('s:150:front')?.status).toBe('missing')
  expect(rep.get('s:150:back')?.status).toBe('missing')

  // Reporte de faltantes visible.
  expect(buildSummary(run.report).join('\n')).toContain('faltantes')

  rmSync(outRoot, { recursive: true, force: true })
})

test('AC: SPEC-E/T-043/AC-1 config validada y fuente configurable; id Showdown derivado', () => {
  expect(toShowdownId("Farfetch'd")).toBe('farfetchd')
  expect(toShowdownId('Mr. Mime')).toBe('mrmime')
  expect(() => parseConfig(JSON.parse(readFileSync(join(root, 'tools', 'assets.config.json'), 'utf8')))).not.toThrow()

  const bad = JSON.parse(JSON.stringify(miniConfig)) as Record<string, unknown>
  expect(() => parseConfig({})).toThrow(/sources/)
  expect(() => parseConfig({ ...bad, species: [...miniConfig.species, { dex: 1, name: 'Dup' }] })).toThrow(/dex 1/)
  expect(() => parseConfig({ ...bad, fx: [...miniConfig.fx, { key: 'wisp', file: 'wisp2.png' }] })).toThrow(/fx key/)
  expect(() =>
    parseConfig({ ...bad, sources: { ...miniConfig.sources, staticFront: 'https://x/pokemon.png' } }),
  ).toThrow(/\{dex\}/)

  // Manifests puros a partir de un reporte.
  const rep: TaskReport[] = [
    { id: 's:1:front', label: '1 Bulbasaur front', status: 'ok', url: 'u', destRel: 'sprites/1.gif', reason: null, attempts: 1 },
    { id: 's:1:back', label: '1 Bulbasaur back', status: 'missing', url: null, destRel: null, reason: 'sin fuente', attempts: 1 },
    { id: 'f:fireball', label: 'fx fireball', status: 'ok', url: 'u2', destRel: 'fx/fireball.png', reason: null, attempts: 1 },
  ]
  expect(buildSpritesManifest(miniConfig, rep)).toEqual({
    '1': { front: '/sprites/1.gif', back: null },
    '150': { front: null, back: null },
    '151': { front: null, back: null },
  })
  expect(buildFxManifest(miniConfig, rep)).toEqual({ fireball: '/fx/fireball.png' })
})

test('AC: SPEC-E/T-043/AC-2 nada descargado entra a git', () => {
  const paths = ['apps/web/public/sprites', 'apps/web/public/fx', 'content/reference']
  const res = spawnSync('git', ['ls-files', '--', ...paths], { cwd: root, encoding: 'utf8' })
  if (res.status === 0 && res.stdout !== undefined) {
    expect(res.stdout.trim(), 'assets commiteados:').toBe('')
  } else {
    // Sin repo git en este checkout: el guard respalda en .gitignore (vigente al crear el repo).
    const gi = readFileSync(join(root, '.gitignore'), 'utf8')
    for (const p of paths) expect(gi, p).toContain(p)
  }
})

test('AC: SPEC-E/T-043/AC-3 ASSETS.md completo con URL y licencia por fuente', () => {
  const md = readFileSync(join(root, 'docs', 'ASSETS.md'), 'utf8')
  const rows = md
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .filter((l) => !l.startsWith('| Asset') && !l.includes('---'))
  expect(rows.length).toBeGreaterThanOrEqual(6)
  for (const row of rows) {
    const cells = row.split('|').slice(1, -1).map((c) => c.trim())
    expect(cells.length, row).toBeGreaterThanOrEqual(5)
    expect(cells[1], row).toMatch(/^(https:|sin URL)/)
    expect(cells[2] ?? '', row).not.toMatch(/pendiente/i)
    expect(cells[2] ?? '', row).toMatch(/\(CC0|AGPL|©|privado/i)
    expect(cells[3] ?? '', row).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(cells[4] ?? '', row).not.toBe('')
  }
})
