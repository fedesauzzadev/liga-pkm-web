// AC: SPEC-A/AC-4 — .gitignore y README de desarrollo presentes.
// Sin dependencias fuera de la lista de AGENTS.md (más las de tooling registradas en
// docs/OPEN-QUESTIONS.md, Q-001: integración TS de ESLint y @types/*).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const LISTA_AGENTS = [
  'react',
  'react-dom',
  'zustand',
  'immer',
  'zod',
  'motion',
  'framer-motion',
  'vite',
  'vitest',
  'fast-check',
  '@testing-library/react',
  'playwright',
  'eslint',
  'typescript',
  'vite-plugin-pwa',
  'dependency-cruiser',
  'size-limit',
  '@size-limit/preset-small-lib',
] as const

// Tooling esencial para que eslint/typescript/react funcionen (ver Q-001).
// jsdom: entorno DOM para correr los tests de @testing-library/react en vitest
// (pantalla-carga-tablero/AC-7); solo tests, no entra al bundle.
// Ratificado por el dueño 2026-10-28 (Q-092, resolver-open-questions).
const TOOLING_APROBADO_PENDIENTE = [
  '@eslint/js',
  'typescript-eslint',
  '@types/react',
  '@types/react-dom',
  '@types/node',
  'jsdom',
] as const

// Tablero 3D aprobado por ADR-8 (docs/adr/ADR-8-board-3d.md): solo chunk 3D.
const ADR8_TABLERO_3D = ['three', '@react-three/fiber', '@react-three/drei', '@types/three'] as const

// Lector de cartas escaneadas, aprobado por SPEC-S/T-102a: solo tools/cards-scan
// (no entra al bundle web). tesseract.js entra en T-102b.
const SPEC_S_LECTOR_CARTAS = ['sharp', 'tesseract.js'] as const

const permitidas = new Set<string>([...LISTA_AGENTS, ...TOOLING_APROBADO_PENDIENTE, ...ADR8_TABLERO_3D, ...SPEC_S_LECTOR_CARTAS])

test('.gitignore cubre node_modules y dist; README tiene sección de desarrollo', () => {
  const gitignore = readFileSync(join(process.cwd(), '.gitignore'), 'utf8')
  expect(gitignore).toMatch(/^node_modules$/m)
  expect(gitignore).toMatch(/^dist$/m)
  const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8')
  expect(readme).toMatch(/pnpm verify/)
})

test('todas las dependencias del workspace están en la lista permitida', () => {
  const root = process.cwd()
  const pkgs = [
    join(root, 'package.json'),
    join(root, 'apps', 'web', 'package.json'),
    join(root, 'packages', 'engine', 'package.json'),
    join(root, 'packages', 'content', 'package.json'),
  ]
  for (const p of pkgs) {
    expect(existsSync(p), `falta ${p}`).toBe(true)
    const pkg = JSON.parse(readFileSync(p, 'utf8')) as {
      name: string
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const name of Object.keys(deps)) {
      const ok = permitidas.has(name) || name.startsWith('@liga/')
      expect(ok, `${pkg.name} depende de "${name}", fuera de la lista de AGENTS.md`).toBe(true)
    }
  }
})
