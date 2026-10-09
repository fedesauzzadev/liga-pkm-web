// AC: SPEC-A/AC-2 — Un import de `react` dentro de packages/engine hace fallar lint.
// El test crea un archivo temporario con el import prohibido, corre el CLI de ESLint
// sobre él y verifica que falle con la regla de límites (no-restricted-imports).
import { spawnSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

test('importar react en packages/engine hace fallar lint', () => {
  const root = process.cwd()
  const probe = join(root, 'packages', 'engine', 'src', '__ac2_probe__.ts')
  writeFileSync(probe, "import 'react'\nexport const probe = 1\n")
  try {
    const eslintBin = join(root, 'node_modules', 'eslint', 'bin', 'eslint.js')
    const res = spawnSync(process.execPath, [eslintBin, probe], {
      encoding: 'utf8',
      timeout: 120_000,
    })
    expect(res.status, `eslint debía fallar, salió ${res.status}\n${res.stdout}\n${res.stderr}`).not.toBe(0)
    expect(`${res.stdout}\n${res.stderr}`).toContain('no-restricted-imports')
  } finally {
    rmSync(probe, { force: true })
  }
}, 180_000)
