// Reglas de dependencia (SDD §3): web → engine → content, sin ciclos (SPEC-A/T-006/AC-3).
// Se corre con `pnpm deps:check` (depcruise apps packages) y bloquea `pnpm verify`.
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Sin dependencias circulares (ENGINEERING-STANDARDS §2).',
      from: {},
      to: { circular: true },
    },
    {
      name: 'engine-sin-ui',
      severity: 'error',
      comment: 'Motor puro: packages/engine no depende de la UI ni de React (AGENTS.md).',
      from: { path: '^packages/engine' },
      to: {
        path: ['^apps/web', 'node_modules/(react|react-dom|zustand|motion|framer-motion)(/|$)'],
      },
    },
    {
      name: 'content-hoja',
      severity: 'error',
      comment: 'packages/content no depende de nada del workspace (SDD §3).',
      from: { path: '^packages/content' },
      to: { path: ['^packages/engine', '^apps/web'] },
    },
    {
      name: 'nadie-importa-web',
      severity: 'error',
      comment: 'La app no es dependencia de nadie: web → engine → content.',
      from: { path: '^packages' },
      to: { path: '^apps/web' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: '(^|/)dist(/|$)',
  },
}
