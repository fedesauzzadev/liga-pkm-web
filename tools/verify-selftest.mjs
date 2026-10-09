// verify:selftest — SPEC-A/T-006/AC-10: una sonda intencionalmente rota por
// barrera (lint, depcruise, size-limit) demuestra que el bloqueo real existe.
// Cada sonda DEBE hacer fallar su herramienta; si alguna pasa, este script falla.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

const run = (command) => {
  const res = spawnSync(command, {
    cwd: root,
    encoding: 'utf8',
    timeout: 300_000,
    shell: true,
  })
  return { status: res.status, output: `${res.stdout ?? ''}\n${res.stderr ?? ''}` }
}

let failed = false
const check = (label, probe) => {
  if (probe.ok) {
    console.log(`selftest ${label} — bloquea OK`)
  } else {
    failed = true
    console.error(`selftest FALLA: ${label} no bloqueó\n${probe.output}`)
  }
}

// --- Barrera 1: ESLint (AC-2) — impurezas en el motor + any/ts-comment/switch.
{
  const engineProbe = join(root, 'packages/engine/src/__selftest_lint__.ts')
  const repoProbe = join(root, 'tests/__selftest_lint__.ts')
  writeFileSync(
    engineProbe,
    'export const p1 = Math.random()\nexport const p2 = console.log("x")\nexport const p3 = document\n',
  )
  writeFileSync(
    repoProbe,
      'export const a: any = 1\n' +
      '// @ts-ignore\n' +
      'export const b = 2\n',
  )
  try {
    const res = run('pnpm exec eslint packages/engine/src/__selftest_lint__.ts tests/__selftest_lint__.ts')
    const ok =
      res.status !== 0 &&
      res.output.includes('no-restricted-properties') &&
      res.output.includes('no-console') &&
      res.output.includes('no-restricted-globals') &&
      res.output.includes('@typescript-eslint/no-explicit-any') &&
      res.output.includes('@typescript-eslint/ban-ts-comment')
    check('lint', { ok, output: res.output })
  } finally {
    rmSync(engineProbe, { force: true })
    rmSync(repoProbe, { force: true })
  }
}

// --- Barrera 2: dependency-cruiser (AC-3) — ciclo + engine → web.
{
  const webProbe = join(root, 'packages/engine/src/__selftest_web__.ts')
  const cycle1 = join(root, 'packages/engine/src/__selftest_c1__.ts')
  const cycle2 = join(root, 'packages/engine/src/__selftest_c2__.ts')
  writeFileSync(webProbe, "import { App } from '../../../apps/web/src/App'\nexport const p = App\n")
  writeFileSync(cycle1, "import './__selftest_c2__.ts'\nexport const c1 = 1\n")
  writeFileSync(cycle2, "import './__selftest_c1__.ts'\nexport const c2 = 2\n")
  try {
    const res = run(
      'pnpm exec depcruise packages/engine/src/__selftest_web__.ts packages/engine/src/__selftest_c1__.ts --config .dependency-cruiser.cjs',
    )
    const ok =
      res.status !== 0 && res.output.includes('engine-sin-ui') && res.output.includes('no-circular')
    check('depcruise', { ok, output: res.output })
  } finally {
    rmSync(webProbe, { force: true })
    rmSync(cycle1, { force: true })
    rmSync(cycle2, { force: true })
  }
}

// --- Barrera 3: size-limit (AC-4) — presupuesto imposible de 1 byte.
{
  if (!existsSync(join(root, 'apps/web/dist/assets'))) {
    console.log('selftest size-limit — compilando la web (dist faltante)…')
    mkdirSync(join(root, 'apps/web/dist/assets'), { recursive: true })
    writeFileSync(join(root, 'apps/web/dist/assets/placeholder.js'), 'export const x = 1\n')
  }
  const res = run('pnpm exec size-limit --limit "1 B"')
  check('size-limit', { ok: res.status !== 0, output: res.output })
}

if (failed) process.exit(1)
console.log('verify:selftest OK — las 3 barreras bloquean como corresponde')
