// AC: SPEC-A/T-006 — Barreras de calidad. Un test por AC del spec.
// Las sondas (archivos temporales con violaciones) siguen el patrón del test
// AC-2 de T-001: se crean, se corre la herramienta y se borran en `finally`.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, expectTypeOf, test } from 'vitest'
import fc from 'fast-check'
import { loadContent } from '../packages/content/src/node.ts'
import {
  parseCardId,
  parseNodeId,
  type CardId,
  type NodeId,
} from '../packages/content/src/ids.ts'
import {
  applyCommand,
  assertInvariants,
  createInitialState,
  createMemoryLogger,
  createRng,
  EngineError,
  InvariantError,
  invariantChecksEnabled,
  legalCommands,
  listInvariants,
  registerInvariant,
  replay,
  setInvariantChecksEnabled,
  type Command,
  type Ctx,
} from '../packages/engine/src/index.ts'
import {
  buildBugReport,
  exportBugReport,
} from '../apps/web/src/debug/bugReport.ts'
import { recordCommand, recordSeed } from '../apps/web/src/debug/session.ts'

const root = process.cwd()
const content = loadContent(join(root, 'content'))
const ctx = (): Ctx => ({ content, rng: createRng(42) })

const run = (command: string): { status: number | null; output: string } => {
  const res = spawnSync(command, {
    cwd: root,
    encoding: 'utf8',
    timeout: 240_000,
    shell: true,
  })
  return { status: res.status, output: `${res.stdout ?? ''}\n${res.stderr ?? ''}` }
}

// AC: SPEC-A/T-006/AC-1 — tsconfig base con las 5 opciones estrictas.
test('AC-1 tsconfig base estricto', () => {
  const base = JSON.parse(readFileSync(join(root, 'tsconfig.base.json'), 'utf8')) as {
    compilerOptions: Record<string, unknown>
  }
  const flags = [
    'strict',
    'noUncheckedIndexedAccess',
    'exactOptionalPropertyTypes',
    'noImplicitOverride',
    'noFallthroughCasesInSwitch',
  ] as const
  for (const flag of flags) {
    expect(base.compilerOptions[flag], flag).toBe(true)
  }
})

// AC: SPEC-A/T-006/AC-2 — ESLint bloquea motor impuro y any/ts-ignore/switch incompleto.
test('AC-2 eslint prohíbe impurezas en engine y any/ts-comment/switch incompleto en el repo', () => {
  const engineProbe = join(root, 'packages/engine/src/__t006_probe_engine__.ts')
  const repoProbe = join(root, 'tests/__t006_probe_repo__.ts')
  writeFileSync(
    engineProbe,
    'export const p1 = Math.random()\n' +
      'export const p2 = Date.now()\n' +
      'export const p3 = performance.now()\n' +
      'export const p4 = console.log("x")\n' +
      'export const p5 = document\n',
  )
  writeFileSync(
    repoProbe,
      'export const a: any = 1\n' +
      '// @ts-ignore\n' +
      'export const b = 2\n' +
      '// @ts-expect-error\n' +
      'export const c = 3\n' +
      'type Color = "rojo" | "azul"\n' +
      'export const f = (v: Color): number => {\n' +
      '  switch (v) {\n' +
      '    case "rojo":\n' +
      '      return 1\n' +
      '  }\n' +
      '}\n',
  )
  try {
    const res = run(
      'pnpm exec eslint packages/engine/src/__t006_probe_engine__.ts tests/__t006_probe_repo__.ts',
    )
    expect(res.status, res.output).not.toBe(0)
    for (const rule of [
      'no-restricted-properties',
      'no-console',
      'no-restricted-globals',
      '@typescript-eslint/no-explicit-any',
      '@typescript-eslint/ban-ts-comment',
      '@typescript-eslint/switch-exhaustiveness-check',
    ]) {
      expect(res.output, rule).toContain(rule)
    }
  } finally {
    rmSync(engineProbe, { force: true })
    rmSync(repoProbe, { force: true })
  }
}, 300_000)

// AC: SPEC-A/T-006/AC-3 — dependency-cruiser: sin ciclos y el motor no depende de la UI.
test('AC-3 depcruise bloquea ciclos y engine → web', () => {
  const webProbe = join(root, 'packages/engine/src/__t006_probe_web__.ts')
  const cycle1 = join(root, 'packages/engine/src/__t006_probe_c1__.ts')
  const cycle2 = join(root, 'packages/engine/src/__t006_probe_c2__.ts')
  writeFileSync(webProbe, "import { App } from '../../../apps/web/src/App'\nexport const p = App\n")
  writeFileSync(cycle1, "import './__t006_probe_c2__.ts'\nexport const c1 = 1\n")
  writeFileSync(cycle2, "import './__t006_probe_c1__.ts'\nexport const c2 = 2\n")
  try {
    const res = run(
      'pnpm exec depcruise packages/engine/src/__t006_probe_web__.ts packages/engine/src/__t006_probe_c1__.ts --config .dependency-cruiser.cjs',
    )
    expect(res.status, res.output).not.toBe(0)
    expect(res.output).toContain('engine-sin-ui')
    expect(res.output).toContain('no-circular')
  } finally {
    rmSync(webProbe, { force: true })
    rmSync(cycle1, { force: true })
    rmSync(cycle2, { force: true })
  }
}, 300_000)

// AC: SPEC-A/T-006/AC-4 — size-limit con presupuesto de 200 KB gzip que bloquea.
test('AC-4 size-limit falla cuando se supera el presupuesto', () => {
  if (!existsSync(join(root, 'apps/web/dist/assets'))) {
    const build = run('pnpm build')
    expect(build.status, build.output).toBe(0)
  }
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    'size-limit'?: { limit?: string }[]
  }
  const entry = pkg['size-limit']?.[0]
  expect(entry?.limit).toBe('200 KB')
  const res = run('pnpm exec size-limit --limit "1 B"')
  expect(res.status, res.output).not.toBe(0)
}, 300_000)

// AC: SPEC-A/T-006/AC-5 — ids con marca: parseo Zod y mezcla no compila.
test('AC-5 ids con marca: CardId ≠ NodeId', () => {
  const cardId = parseCardId('bosque-001')
  expect(cardId).toBe('bosque-001')
  expect(() => parseCardId('')).toThrow()
  expect(() => parseNodeId('')).toThrow()
  expectTypeOf<CardId>().not.toMatchTypeOf<NodeId>()
  // @ts-expect-error SPEC-A/T-006/AC-5 — CardId no es asignable a NodeId (marca de tipo)
  const node: NodeId = cardId
  expect(node).toBe(cardId)
})

// AC: SPEC-A/T-006/AC-6 — registro de invariantes ejecutado tras cada comando.
test('AC-6 registerInvariant + assertInvariants; el reductor las corre', () => {
  expect(() => assertInvariants(createInitialState())).not.toThrow()
  expect(listInvariants().length).toBeGreaterThan(0)

  registerInvariant('t006/version-centinela', (state) => {
    if (state.version === 999) throw new Error('versión centinela')
  })
  expect(listInvariants()).toContain('t006/version-centinela')

  const roto = { ...createInitialState(), version: 999 }
  try {
    assertInvariants(roto)
    expect.unreachable('debía lanzar InvariantError')
  } catch (error) {
    expect(error).toBeInstanceOf(InvariantError)
    expect(error).toBeInstanceOf(EngineError)
    const inv = error as InvariantError
    expect(inv.code).toBe('INVARIANT_VIOLATED')
    expect(inv.invariant).toBe('t006/version-centinela')
  }

  // Con checks habilitados (default ≠ production), applyCommand valida el resultado.
  expect(invariantChecksEnabled()).toBe(true)
  expect(() => applyCommand(roto, { type: 'Advance' }, ctx())).toThrow(InvariantError)

  // Deshabilitadas (producción) no bloquea el comando.
  setInvariantChecksEnabled(false)
  try {
    const ok = applyCommand(roto, { type: 'Advance' }, ctx())
    expect(ok.ok).toBe(true)
  } finally {
    setInvariantChecksEnabled(true)
  }
})

// AC: SPEC-A/T-006/AC-7 — Logger inyectado en ctx; registra comando, eventos y dados.
test('AC-7 Logger en ctx registra comando, eventos y dados', () => {
  const log = createMemoryLogger()
  const ctxLog: Ctx = { content, rng: createRng(7), log }
  const ok = applyCommand(createInitialState(), { type: 'Roll' }, ctxLog)
  expect(ok.ok).toBe(true)

  const kinds = log.records.map((r) => r.kind)
  expect(kinds).toContain('command')
  expect(kinds).toContain('events')
  expect(kinds).toContain('die')
  const commands = log.records.filter((r) => r.kind === 'command')
  expect(commands).toHaveLength(1)
  if (commands[0]?.kind === 'command') expect(commands[0].command.type).toBe('Roll')
  const dice = log.records.filter((r) => r.kind === 'die')
  expect(dice).toHaveLength(1)
  if (dice[0]?.kind === 'die') expect(dice[0].die.purpose).toBe('move')

  // Sin logger inyectado usa NoopLogger y no falla (lo cubren el resto de los tests).
})

// AC: SPEC-A/T-006/AC-8 — reporte de bug reproducible + shell con ErrorBoundary y ?debug=1.
test('AC-8 exportBugReport / ErrorBoundary / panel ?debug=1', () => {
  recordSeed(4242)
  recordCommand({ type: 'Roll' })
  recordCommand({ type: 'Advance' })

  const report = buildBugReport(new Error('boom'))
  expect(report.app).toBe('@liga/web')
  expect(report.appVersion).toBeTruthy()
  expect(report.stateVersion).toBeGreaterThanOrEqual(1)
  expect(report.seed).toBe(4242)
  expect(report.commandLog).toEqual([{ type: 'Roll' }, { type: 'Advance' }])
  expect(report.error?.message).toBe('boom')
  expect(report.error?.name).toBe('Error')
  expect(report.userAgent.length).toBeGreaterThan(0)
  expect(report.generatedAt).toBeTruthy()

  // Sin DOM (Node) la descarga se omite y el reporte se devuelve igual.
  const exported = exportBugReport(new Error('x'))
  expect(exported.seed).toBe(4242)

  // Wiring del shell: la app envuelve con ErrorBoundary y muestra el panel con ?debug=1.
  const main = readFileSync(join(root, 'apps/web/src/main.tsx'), 'utf8')
  expect(main).toContain('ErrorBoundary')
  const app = readFileSync(join(root, 'apps/web/src/App.tsx'), 'utf8')
  expect(app).toContain('DebugPanel')
})

// AC: SPEC-A/T-006/AC-9 — pnpm bench respeta perf-budget.json.
test('AC-9 pnpm bench corre contra perf-budget.json', () => {
  const budget = JSON.parse(readFileSync(join(root, 'perf-budget.json'), 'utf8')) as {
    budgets: Record<string, number>
  }
  expect(budget.budgets['content:load-validate']).toBe(300)
  const res = run('pnpm bench')
  expect(res.status, res.output).toBe(0)
  expect(res.output).toContain('content:load-validate')
}, 300_000)

// AC: SPEC-A/T-006/AC-10 — verify:selftest demuestra que cada barrera bloquea.
test('AC-10 verify:selftest prueba una regla rota por barrera', () => {
  const res = run('pnpm verify:selftest')
  expect(res.status, res.output).toBe(0)
  expect(res.output).toContain('lint')
  expect(res.output).toContain('depcruise')
  expect(res.output).toContain('size-limit')
}, 600_000)

// Invariantes + determinismo con secuencias aleatorias (ENGINEERING-STANDARDS §2).
test('property: comandos legales aleatorios no violan invariantes y replay reproduce', () => {
  const commandsArb = fc.array(
    fc.constantFrom<Command>({ type: 'Advance' }, { type: 'Roll' }),
    { maxLength: 40 },
  )
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 2 ** 31 - 1 }), commandsArb, (seed, commands) => {
      const manual: Ctx = { content, rng: createRng(seed) }
      let state = createInitialState()
      for (const command of commands) {
        const legal = legalCommands(state, manual).some((c) => c.type === command.type)
        if (!legal) throw new Error(`comando ilegal generado: ${command.type}`)
        const result = applyCommand(state, command, manual) // corre assertInvariants
        if (!result.ok) throw new Error(`comando legal rechazado: ${command.type}`)
        state = result.value.state
      }
      const rep = replay(seed, commands, content)
      if (!rep.ok) throw new Error('replay falló')
      expect(rep.value.state).toEqual(state)
      if (commands.length > 0) expect(rep.value.events.length).toBeGreaterThan(0)
    }),
    { numRuns: 25 },
  )
})
