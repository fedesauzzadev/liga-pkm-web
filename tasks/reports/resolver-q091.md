# Reporte resolver-q091 — Arreglar los 4 tests preexistentes de Q-091
- Estado: REVIEW | Rama/commit: —
- Resumen (≤ 5 líneas): fixtures/reportes desactualizados tras el paso de charmeleon de
  `pending` a carta cargada. (a) t045: el mini-server agrega charizard (pokemon/species
  dex 6, cadena 1 `node(4,[node(5,[node(6)])])`, DEXES +6) y las aserciones de species y
  warning pasan a 12/151. (b) t048: `makeTmp()` copia también la carta charmeleon real.
  (c) T-032c2.md declara 12/15 (80%) y 12/12.
- Archivos clave tocados (rutas): `tests/t045-pokeapi.test.ts` · `tests/t048-house-edits.test.ts`
  (solo `makeTmp()`) · `tasks/reports/T-032c2.md` · `docs/OPEN-QUESTIONS.md` (Q-091 → resuelta).
- AC cubiertos → test: los AC del plan `.opencode/plan/resolver-q091.md` →
  `npx vitest run tests/t045-pokeapi.test.ts tests/t048-house-edits.test.ts tests/t032c2-showdown-port.test.ts`.
- `pnpm verify`: OK.
- Decisiones tomadas / defaults aplicados: para (b) se tomó la opción "copiar la carta"
  (default del plan); charizard queda válido porque sí está en `pending`. No se tocó el
  motor, ni `content/` real, ni `content/reference/pokeapi/`.
- Dudas nuevas y ER solicitados: ninguno. Deuda preexistente del tope de 400 líneas de
  `tests/t048-house-edits.test.ts` (tipo Q-056): el cambio lo mantiene lo más chico posible.
- Riesgos / deuda: ninguno nuevo.
