// AC: plan estado-ingesta-cartas (T-106) — `pnpm cards:status`: estado de la
// ingesta (esperadas del CSV, escaneadas, staging ok/error, curadas, customs)
// en una salida determinista; robusto ante estados parciales. Fixtures en un
// directorio temporal: no depende del estado real del repo.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { buildStatusLines } from '../tools/cards-status.ts'

const repo = process.cwd()

// ── Fixture: mismo formato que usan el lector (SPEC-S) y collect (validate.ts).
let fixtureSeq = 0
function card(deck: string, verified: boolean, effects: unknown[] = []): Record<string, unknown> {
  return {
    id: `fixture-${deck}-${(fixtureSeq += 1)}`,
    dex: 1,
    name: 'Fixture',
    stage: 'basic',
    deck,
    hp: 50,
    element: 'grass',
    attacks: [{
      id: 'ataque', name: 'Ataque', kind: 'attack', rollFaces: [4, 5], cost: ['grass'],
      element: 'grass', damage: { base: 10 }, effects, rawText: '4-5_ Ataque.',
    }],
    specialties: [],
    evolvesTo: [],
    source: { photo: 'photos/X/01.jpg', verified },
  }
}

/** Repo mínimo: CSV (6 esperadas), 3 escaneos, 1 staging ok, 2 errores, 2 curadas. */
function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'cards-status-'))
  const w = (rel: string, text: string): void => {
    mkdirSync(join(root, rel, '..'), { recursive: true })
    writeFileSync(join(root, rel), text)
  }
  w(
    join('content', 'photo-manifest.csv'),
    [
      'archivo,grupo,mazo,cartas_esperadas,notas',
      'Mazo_bosque.jpg,terreno,bosque,2,"nota, con coma"',
      'Evo1.jpg,evolucion,evolucion,3,fila de 3',
      'Iniciales.jpg,iniciales,,1,tres iniciales',
    ].join('\n') + '\n',
  )
  for (const rel of [
    join('content', 'photos', 'scans', 'terrain', 'bosque', 'a.jpg'),
    join('content', 'photos', 'scans', 'terrain', 'bosque', 'b.jpg'),
    join('content', 'photos', 'scans', 'evolution', 'e.jpg'),
  ]) w(rel, 'jpg')
  w(
    join('content', 'pokemon', '_staging', 'bellsprut_bosque.json'),
    `${JSON.stringify({ fromScanner: true, photo: 'Bellsprut Bosque.jpg', cards: [card('bosque', false)] }, null, 1)}\n`,
  )
  w(
    join('content', 'pokemon', '_staging', '_errors', 'abra_s.json'),
    `${JSON.stringify({ fromScanner: true, photo: 'Abra S.jpg', issues: ['HP ilegible'], draft: { deck: 'sorpresa' } }, null, 1)}\n`,
  )
  w(
    join('content', 'pokemon', '_staging', '_errors', 'desconocida.json'),
    `${JSON.stringify({ fromScanner: true, photo: 'Desconocida.jpg', issues: ['x'], draft: { deck: null } }, null, 1)}\n`,
  )
  w(
    join('content', 'pokemon', 'fixture.json'),
    `${JSON.stringify({
      cards: [
        card('bosque', true),
        card('bosque', false, [{ op: 'custom', handler: 'TODO_T-106', rawText: 'texto sin patrón' }]),
      ],
    }, null, 1)}\n`,
  )
  return root
}

function withRoot(fn: (root: string) => void): void {
  const root = fixtureRoot()
  try {
    fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

// AC: 1 — resumen global en una corrida: esperadas (CSV) · escaneadas · staging
// ok · staging con error · curadas (verificadas/sin verificar) · customs.
test('AC-1 resumen global: esperadas, escaneadas, staging, curadas y customs', () => {
  withRoot((root) => {
    const out = buildStatusLines(root).join('\n')
    expect(out).toContain('esperadas: 6 (3 fotos del CSV)')
    expect(out).toContain('escaneadas: 3')
    expect(out).toContain('staging ok: 1')
    expect(out).toContain('staging con error: 2')
    expect(out).toContain('curadas: 2 (1 verificadas · 1 sin verificar)')
    expect(out).toContain('efectos custom pendientes: 1')
  })
})

// AC: 2 — desglose por grupo y mazo (terreno por mazo, evolucion, sorpresa,
// gimnasio, liga, iniciales): esperadas vs escaneadas vs staging ok vs errores,
// con grupo/mazo derivado de la ruta del escaneo (Q-081) y del CSV.
test('AC-2 desglose por grupo/mazo con conteos cruzados', () => {
  withRoot((root) => {
    const lines = buildStatusLines(root)
    const out = lines.join('\n')
    expect(out).toMatch(/bosque:\s+2 ·\s+2 ·\s+1 ·\s+0/)
    expect(out).toMatch(/evolucion:\s+3 ·\s+1 ·\s+0 ·\s+0/)
    expect(out).toMatch(/iniciales:\s+1 ·\s+0 ·\s+0 ·\s+0/)
    expect(out).toMatch(/sorpresa:\s+0 ·\s+0 ·\s+0 ·\s+1/)
    expect(out).toMatch(/otros:\s+0 ·\s+0 ·\s+0 ·\s+1/)
    expect(out).toMatch(/total:\s+6 ·\s+3 ·\s+1 ·\s+2/)
    // Orden fijo de la spec: terreno por mazo → evolucion → sorpresa → gimnasio → liga → iniciales.
    const pos = (name: string): number => lines.findIndex((l) => l.includes(` ${name}:`))
    const orden = ['bosque', 'isla', 'llanura', 'montana', 'pantano', 'evolucion', 'sorpresa', 'gimnasio', 'liga', 'iniciales']
    for (let i = 1; i < orden.length; i++) {
      expect(pos(orden[i]!), `${orden[i]} después de ${orden[i - 1]}`).toBeGreaterThan(pos(orden[i - 1]!))
    }
  })
})

// AC: 3 — determinista (mismo estado ⇒ mismas líneas), sin timestamps ni rutas
// absolutas, ≤ 60 líneas, estilo digest; el CLI sale 0 en el repo real.
test('AC-3 determinista, ≤ 60 líneas, sin rutas absolutas; CLI smoke', () => {
  withRoot((root) => {
    const first = buildStatusLines(root)
    expect(buildStatusLines(root)).toEqual(first)
    expect(first.length).toBeLessThanOrEqual(60)
    const out = first.join('\n')
    expect(out).not.toContain(root)
    expect(out).not.toContain(repo)
    expect(first[0]).toContain('ingesta de cartas')
  })
  const cli = spawnSync(process.execPath, ['tools/cards-status.ts'], { cwd: repo, encoding: 'utf8', timeout: 120_000 })
  expect(cli.status, `${cli.stdout ?? ''}\n${cli.stderr ?? ''}`).toBe(0)
  const cliLines = (cli.stdout ?? '').split('\n').filter((l) => l.length > 0)
  expect(cliLines.length).toBeLessThanOrEqual(60)
  expect(cli.stdout ?? '').not.toContain(repo)
}, 180_000)

// AC: 4 — robusto ante estados parciales: sin CSV/escaneos/staging/curadas
// muestra 0/— y sale 0; aviso simple si errores > escaneadas (acumuladas).
test('AC-4 estados parciales: 0/—, exit 0 y aviso si errores > escaneadas', () => {
  const empty = mkdtempSync(join(tmpdir(), 'cards-status-empty-'))
  try {
    expect(() => buildStatusLines(empty)).not.toThrow()
    const out = buildStatusLines(empty).join('\n')
    expect(out).toContain('esperadas: — (falta content/photo-manifest.csv)')
    expect(out).toContain('escaneadas: —')
    expect(out).toContain('staging ok: 0')
    expect(out).toContain('curadas: 0 (0 verificadas · 0 sin verificar)')
    const cli = spawnSync(process.execPath, ['tools/cards-status.ts', '--root', empty], {
      cwd: repo, encoding: 'utf8', timeout: 120_000,
    })
    expect(cli.status, `${cli.stdout ?? ''}\n${cli.stderr ?? ''}`).toBe(0)
  } finally {
    rmSync(empty, { recursive: true, force: true })
  }
  withRoot((root) => {
    // 3 escaneos vs 2 errores: sin aviso; duplicando errores (4 > 3) salta el aviso.
    expect(buildStatusLines(root).join('\n')).not.toContain('aviso:')
    for (const name of ['c_sorpresa.json', 'd_evo.json']) {
      writeFileSync(
        join(root, 'content', 'pokemon', '_staging', '_errors', name),
        `${JSON.stringify({ fromScanner: true, photo: 'X.jpg', issues: ['x'], draft: { deck: 'sorpresa' } }, null, 1)}\n`,
      )
    }
    expect(buildStatusLines(root).join('\n')).toContain('aviso: staging con error (4) > escaneadas (3)')
  })
})

// AC: 5 — los tests corren sobre fixtures temporales: dos raíces iguales dan la
// misma salida (independiente del estado real del repo) y una raíz vacía difiere.
test('AC-5 fixtures temporales: dos raíces iguales ⇒ misma salida; distinta de una vacía', () => {
  const a = fixtureRoot()
  const b = fixtureRoot()
  const empty = mkdtempSync(join(tmpdir(), 'cards-status-empty2-'))
  try {
    expect(buildStatusLines(b)).toEqual(buildStatusLines(a))
    expect(buildStatusLines(empty)).not.toEqual(buildStatusLines(a))
  } finally {
    for (const root of [a, b, empty]) rmSync(root, { recursive: true, force: true })
  }
})
