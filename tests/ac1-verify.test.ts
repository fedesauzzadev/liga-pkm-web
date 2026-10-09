// AC: SPEC-A/AC-1 — `pnpm verify` corre typecheck+lint+test+content:validate+build.
// La corrida real en verde la prueba `pnpm verify` en sí; este test fija el contrato
// del script raíz (existencia y composición) para que no se degrade silenciosamente.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

test('el script raíz `verify` encadena los 5 pasos en orden', () => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }
  const verify = pkg.scripts['verify'] ?? ''
  expect(verify).toBeTruthy()
  for (const name of ['typecheck', 'lint', 'test', 'content:validate', 'build'] as const) {
    expect(pkg.scripts[name], `falta el script raíz ${name}`).toBeTruthy()
  }
  const pasos = ['typecheck', 'lint', 'test', 'content:validate', 'build'].map(
    (n) => `pnpm ${n}`,
  )
  const posiciones = pasos.map((p) => {
    const i = verify.indexOf(p)
    expect(i, `verify debería incluir "${p}"`).toBeGreaterThanOrEqual(0)
    return i
  })
  const ordenados = [...posiciones].sort((a, b) => a - b)
  expect(posiciones, 'los pasos deben aparecer en orden typecheck→lint→test→content:validate→build').toEqual(ordenados)
})
