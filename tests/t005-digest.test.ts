// AC: SPEC-A/T-005/AC-1 — salida determinista y ≤ 200 líneas.
// El resumen de tests se inyecta (stub): correr vitest dentro de vitest recursa.
// El smoke del CLI fuerza VITEST=1 para que el digest omita esa corrida.
import { spawnSync } from 'node:child_process'
import { expect, test } from 'vitest'
import { buildDigest, type TestRunSummary } from '../tools/digest.ts'

const root = process.cwd()
const stubRun: TestRunSummary = {
  files: { total: 8, passed: 8, failed: 0 },
  tests: { total: 41, passed: 41, failed: 0 },
}

test('AC-1 digest determinista, ≤ 200 líneas, 6 secciones; CLI smoke', () => {
  const first = buildDigest(root, stubRun)
  const second = buildDigest(root, stubRun)
  expect(first.length).toBeGreaterThan(0)
  expect(first.length).toBeLessThanOrEqual(200)
  expect(second).toEqual(first)

  const out = first.join('\n')
  for (const seccion of ['árbol', 'tests', 'cartas', 'engine', 'todo/fixme', 'backlog']) {
    expect(out, seccion).toContain(seccion)
  }
  expect(out).not.toContain(root)

  const cli = spawnSync(process.execPath, ['tools/digest.ts'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, VITEST: '1' },
    timeout: 120_000,
  })
  expect(cli.status, `${cli.stdout ?? ''}\n${cli.stderr ?? ''}`).toBe(0)
  const cliLines = (cli.stdout ?? '').split('\n').filter((l) => l.length > 0)
  expect(cliLines.length).toBeLessThanOrEqual(200)
  expect(cliLines[0]).toContain('liga-pkm-web')
}, 180_000)
