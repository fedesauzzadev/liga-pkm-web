// digest (SPEC-A/T-005) — resumen del repo en ≤ 200 líneas, determinista:
// árbol 2 niveles · tests (última corrida) · cartas · api engine · pendientes · backlog.
// Sin timestamps, duraciones ni rutas absolutas: misma salida para mismo estado del repo.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { collect } from '../packages/content/src/validate.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const MAX_LINES = 200
const TREE_SKIP = new Set(['node_modules', 'dist', '.git', '.opencode', 'pnpm-lock.yaml'])
const SELF = 'tools/digest.ts'

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const cut = (text: string, max = 48): string => (text.length <= max ? text : `${text.slice(0, max - 1)}…`)

// ── Tests: conteos de la última corrida (sin duraciones).
export interface TestCounts {
  total: number
  passed: number
  failed: number
}
export interface TestRunSummary {
  files: TestCounts
  tests: TestCounts
}

interface VitestJson {
  numTotalTestSuites?: number
  numPassedTestSuites?: number
  numFailedTestSuites?: number
  numTotalTests?: number
  numPassedTests?: number
  numFailedTests?: number
}

export function lastTestRun(root: string): TestRunSummary | null {
  // Guarda anti-recursión: dentro de vitest no se lanza otra corrida.
  if (process.env.VITEST !== undefined) return null
  const cacheDir = join(root, 'node_modules', '.cache')
  const outFile = join(cacheDir, 'digest-vitest.json')
  mkdirSync(cacheDir, { recursive: true })
  spawnSync(
    process.execPath,
    [join('node_modules', 'vitest', 'vitest.mjs'), 'run', '--reporter=json', `--outputFile=${outFile}`],
    { cwd: root, encoding: 'utf8', timeout: 300_000 },
  )
  const raw = existsRead(outFile)
  rmSync(outFile, { force: true })
  if (raw === null) return null
  try {
    const j = JSON.parse(raw) as VitestJson
    return {
      files: {
        total: j.numTotalTestSuites ?? 0,
        passed: j.numPassedTestSuites ?? 0,
        failed: j.numFailedTestSuites ?? 0,
      },
      tests: {
        total: j.numTotalTests ?? 0,
        passed: j.numPassedTests ?? 0,
        failed: j.numFailedTests ?? 0,
      },
    }
  } catch {
    return null
  }
}

function existsRead(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function testLines(run: TestRunSummary | null): string[] {
  if (run === null) return ['tests (última corrida): omitida (dentro de vitest) o no disponible']
  const { files: f, tests: t } = run
  return [
    `tests (última corrida): ${f.total} archivos (${f.passed} OK · ${f.failed} fallas) · ` +
      `${t.total} casos (${t.passed} OK · ${t.failed} fallas)`,
  ]
}

// ── Árbol de 2 niveles: raíz + un nivel por debajo, orden lexicográfico.
// Se ignoran los archivos sonda efímeros `__*` (p. ej. probes de tests que
// corren en paralelo): existen solo durante la corrida y romperían el AC de
// determinismo (misma salida para mismo estado del repo).
function isTransient(name: string): boolean {
  return name.startsWith('__')
}

function treeLines(root: string): string[] {
  const lines: string[] = ['árbol (2 niveles):']
  const entries = readdirSync(root, { withFileTypes: true })
    .filter((e) => !TREE_SKIP.has(e.name) && !isTransient(e.name))
    .sort((a, b) => byName(a.name, b.name))
  const rootFiles: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      rootFiles.push(entry.name)
      continue
    }
    const children = readdirSync(join(root, entry.name), { withFileTypes: true })
      .filter((c) => !TREE_SKIP.has(c.name) && !isTransient(c.name))
      .map((c) => (c.isDirectory() ? `${c.name}/` : c.name))
      .sort(byName)
    lines.push(`  ${entry.name}/ ${list(children)}`)
  }
  lines.push(`  (raíz) ${list(rootFiles)}`)
  return lines
}

const list = (names: readonly string[], max = 10): string => {
  const shown = names.slice(0, max).join(', ')
  return names.length <= max ? shown : `${shown} … +${names.length - max} más`
}

// ── Cartas y tablero desde el validador de contenido.
function cardLines(root: string): string[] {
  const { stats, errors, warnings } = collect(join(root, 'content'))
  const lines = [
    `cartas: ${stats.cards} (${stats.verifiedCards} verificadas · ${stats.unverifiedCards} sin verificar) · ` +
      `efectos custom: ${stats.customEffects}`,
  ]
  const b = stats.board
  if (b !== undefined) {
    lines.push(`tablero: ${b.nodes} nodos · ${b.edges} aristas · ${b.status} · ${b.connected ? 'conexo' : 'NO conexo'}`)
  }
  if (errors.length > 0 || warnings.length > 0) {
    lines.push(`contenido: ${errors.length} error(es) · ${warnings.length} warning(s) — ver pnpm content:validate`)
  }
  return lines
}

// ── Api pública del engine: lo que index.ts exporta, con firma resuelta en su archivo origen.
const EXPORT_SKIP = new Set(['node_modules', 'dist'])

function walkSources(dir: string, rel: string, out: string[], exts: readonly string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => byName(a.name, b.name))) {
    if (EXPORT_SKIP.has(e.name)) continue
    const relPath = rel === '' ? e.name : `${rel}/${e.name}`
    if (e.isDirectory()) walkSources(join(dir, e.name), relPath, out, exts)
    else if (exts.some((ext) => e.name.endsWith(ext))) out.push(relPath)
  }
}

function isExported(st: ts.Statement): boolean {
  const mods = ts.canHaveModifiers(st) ? ts.getModifiers(st) : undefined
  if (mods === undefined) return false
  return (
    mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
    !mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
  )
}

function signatureOf(sf: ts.SourceFile, name: string): string | null {
  for (const st of sf.statements) {
    if (!isExported(st)) continue
    if (ts.isFunctionDeclaration(st) && st.name?.text === name) {
      const params = st.parameters.map((p) => p.name.getText(sf)).join(', ')
      const ret = st.type === undefined ? '' : `: ${cut(st.type.getText(sf))}`
      return `${name}(${params})${ret}`
    }
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === name) return `const ${name}`
      }
    } else if (ts.isClassDeclaration(st) && st.name?.text === name) return `class ${name}`
    else if (ts.isInterfaceDeclaration(st) && st.name.text === name) return `interface ${name}`
    else if (ts.isTypeAliasDeclaration(st) && st.name.text === name) return `type ${name}`
    else if (ts.isEnumDeclaration(st) && st.name.text === name) return `enum ${name}`
  }
  return null
}

interface ApiEntry {
  group: string
  text: string
}

function engineApiLines(root: string): string[] {
  const srcDir = join(root, 'packages', 'engine', 'src')
  const srcFiles: string[] = []
  walkSources(srcDir, '', srcFiles, ['.ts'])
  const relFiles = srcFiles.filter((f) => !f.endsWith('.test.ts'))
  const sources = new Map<string, ts.SourceFile>()
  for (const rel of relFiles) {
    sources.set(rel, ts.createSourceFile(rel, readFileSync(join(srcDir, rel), 'utf8'), ts.ScriptTarget.Latest, true))
  }
  const index = sources.get('index.ts')
  const entries: ApiEntry[] = []
  if (index !== undefined) {
    for (const st of index.statements) {
      if (ts.isExportDeclaration(st) && st.exportClause !== undefined && ts.isNamedExports(st.exportClause)) {
        const origin = st.moduleSpecifier !== undefined && ts.isStringLiteral(st.moduleSpecifier)
          ? st.moduleSpecifier.text
          : 'index.ts'
        for (const spec of st.exportClause.elements) {
          const publicName = spec.propertyName?.text ?? spec.name.text
          const external = !origin.startsWith('./')
          const group = external ? origin : origin.replace(/^\.\//, '')
          const source = external ? undefined : sources.get(group)
          const sig = source !== undefined ? signatureOf(source, spec.name.text) : null
          const prefix = spec.isTypeOnly || st.isTypeOnly ? 'type ' : ''
          entries.push({ group, text: sig !== null ? sig : `${prefix}${publicName}` })
        }
      } else if (isExported(st)) {
        const name = exportName(st)
        if (name !== null) {
          const sig = signatureOf(index, name)
          entries.push({ group: 'index.ts', text: sig !== null ? sig : name })
        }
      }
    }
  }
  entries.sort((a, b) => byName(a.group, b.group) || byName(a.text, b.text))
  const lines: string[] = ['api engine (exporta index.ts):']
  const cap = 48
  let lastGroup: string | null = null
  for (let i = 0; i < Math.min(entries.length, cap); i++) {
    const e = entries[i]
    if (e === undefined) break
    if (e.group !== lastGroup) {
      lines.push(`  ${e.group}:`)
      lastGroup = e.group
    }
    lines.push(`    ${e.text}`)
  }
  if (entries.length > cap) lines.push(`    … +${entries.length - cap} export(s) más`)
  return lines
}

function exportName(st: ts.Statement): string | null {
  if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) return st.name?.text ?? null
  if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st)) return st.name.text
  if (ts.isVariableStatement(st)) {
    const first = st.declarationList.declarations[0]
    return first !== undefined && ts.isIdentifier(first.name) ? first.name.text : null
  }
  return null
}

// ── Pendientes marcados en el código, con id de tarea (AGENTS.md: sin id no hay nuevo).
function pendingLines(root: string): string[] {
  const marker = new RegExp(`\\b(${['TO', 'DO'].join('')}|${['FIX', 'ME'].join('')})\\b`)
  const withId = /\b(T-\d+|ER-\d+)\b/
  const files: string[] = []
  for (const dir of ['apps', 'packages', 'tools', 'tests']) {
    const full = join(root, dir)
    if (statSync(full, { throwIfNoEntry: false })?.isDirectory() === true) {
      walkSources(full, dir, files, ['.ts', '.tsx', '.mjs', '.cjs'])
    }
  }
  const hits: { where: string; text: string; id: boolean }[] = []
  for (const rel of files.sort(byName)) {
    if (rel === SELF) continue // auto-referencia del digest
    const lines = readFileSync(join(root, rel), 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line !== undefined && marker.test(line)) {
        hits.push({ where: `${rel}:${i + 1}`, text: line.trim().slice(0, 72), id: withId.test(line) })
      }
    }
  }
  const sinId = hits.filter((h) => !h.id).length
  const lines = [`todo/fixme: ${hits.length} (${sinId} sin id de tarea)`]
  const cap = 15
  for (let i = 0; i < Math.min(hits.length, cap); i++) {
    const h = hits[i]
    if (h !== undefined) lines.push(`  ${h.where} ${h.text}`)
  }
  if (hits.length > cap) lines.push(`  … +${hits.length - cap} más`)
  return lines
}

// ── Backlog: conteos por estado + tareas activas.
function backlogLines(root: string): string[] {
  const text = existsRead(join(root, 'tasks', 'BACKLOG.md')) ?? ''
  const counts = { TODO: 0, DOING: 0, REVIEW: 0, DONE: 0 }
  const active: string[] = []
  for (const line of text.split('\n')) {
    const id = /^\| (T-\d+\w*) \|/.exec(line)?.[1]
    if (id === undefined) continue
    const state = /\| (TODO|DOING|REVIEW|DONE) \|/.exec(line)?.[1]
    if (state !== 'TODO' && state !== 'DOING' && state !== 'REVIEW' && state !== 'DONE') continue
    counts[state] += 1
    if (state === 'DOING' || state === 'REVIEW') active.push(`${id} ${state}`)
  }
  const lines = [
    `backlog: ${counts.TODO} TODO · ${counts.DOING} DOING · ${counts.REVIEW} REVIEW · ${counts.DONE} DONE`,
    `  activos: ${active.length > 0 ? active.join(' · ') : '—'}`,
  ]
  return lines
}

// ── Ensamble: puro y acotado a MAX_LINES.
export function buildDigest(root: string, testRun: TestRunSummary | null): string[] {
  const lines: string[] = [
    '# liga-pkm-web — digest',
    '',
    ...treeLines(root),
    '',
    ...testLines(testRun),
    '',
    ...cardLines(root),
    '',
    ...engineApiLines(root),
    '',
    ...pendingLines(root),
    '',
    ...backlogLines(root),
  ]
  if (lines.length > MAX_LINES) {
    return [...lines.slice(0, MAX_LINES - 1), `… (recortado de ${lines.length} líneas; límite T-005: ${MAX_LINES})`]
  }
  return lines
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  console.log(buildDigest(repoRoot, lastTestRun(repoRoot)).join('\n'))
}
