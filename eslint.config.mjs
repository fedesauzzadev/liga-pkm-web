import js from '@eslint/js'
import tseslint from 'typescript-eslint'

// Límites de import (SDD §3): web → engine → content.
// `packages/content` no importa nada del workspace; `packages/engine` solo puede
// importar `@liga/content`; `apps/web` puede usar ambos. Nadie importa la app.
const UI = ['react', 'react-dom', 'react/*', 'react-dom/*', 'zustand', 'motion', 'framer-motion']
const DIR_DEPS = 'Dirección de dependencias: web → engine → content (SDD §3).'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  // Registra extensiones TS/TSX para que `eslint .` las descubra en directorios.
  { files: ['**/*.{js,mjs,cjs,ts,tsx}'], name: 'setup/extensiones' },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Convención `_nombre` para parámetros de la firma pública que aún no se usan
    // (p. ej. `ctx` en legalCommands, SDD §3).
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        require: 'readonly',
      },
    },
  },
  {
    // SPEC-A/T-006/AC-2 — repo: sin `any`, sin ts-comments sin describir.
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-expect-error': 'allow-with-description',
        },
      ],
    },
  },
  {
    // SPEC-A/T-006/AC-2 — switches exhaustivos (regla type-aware).
    // `project: true` resuelve el tsconfig más cercano por archivo.
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parserOptions: { project: true } },
    rules: {
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        // El default defensivo queda permitido (p. ej. comandos corruptos de un save).
        { allowDefaultCaseForExhaustiveSwitch: true },
      ],
    },
  },
  {
    // SPEC-A/T-006/AC-2 — motor puro: sin azar propio, ni tiempo, ni consola, ni DOM.
    files: ['packages/engine/**/*.ts'],
    rules: {
      'no-console': 'error',
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Motor determinista: el azar entra por ctx.rng (AGENTS.md).',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'El tiempo no entra al motor (determinismo, AGENTS.md).',
        },
        {
          object: 'performance',
          property: 'now',
          message: 'Los benchmarks viven en tools/bench.ts, no en el motor.',
        },
      ],
      'no-restricted-globals': [
        'error',
        ...[
          'window',
          'document',
          'navigator',
          'location',
          'history',
          'localStorage',
          'sessionStorage',
          'fetch',
          'XMLHttpRequest',
          'WebSocket',
          'Event',
          'CustomEvent',
          'EventTarget',
          'Node',
          'Element',
          'HTMLElement',
          'MutationObserver',
          'ResizeObserver',
          'IntersectionObserver',
          'DOMParser',
          'requestAnimationFrame',
          'cancelAnimationFrame',
          'alert',
          'confirm',
          'prompt',
          'getComputedStyle',
          'matchMedia',
        ].map((name) => ({ name, message: 'Motor puro: sin DOM (AGENTS.md).' })),
        { name: 'Date', message: 'No determinista: el tiempo no entra al motor (AGENTS.md).' },
        { name: 'performance', message: 'No determinista: medir tiempo no es cosa del motor.' },
      ],
    },
  },
  {
    files: ['packages/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: UI,
              message: 'Motor puro: sin React/DOM ni estado de UI (AGENTS.md).',
            },
            { group: ['@liga/web', '@liga/web/*'], message: DIR_DEPS },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/content/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: UI, message: 'packages/content no depende de UI.' },
            {
              group: ['@liga/engine', '@liga/engine/*', '@liga/web', '@liga/web/*'],
              message: DIR_DEPS,
            },
          ],
        },
      ],
    },
  },
)
