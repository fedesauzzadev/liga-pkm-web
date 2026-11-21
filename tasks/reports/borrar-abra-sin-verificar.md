# Reporte — Borrar la Abra sin verificar (fix CRUD + swap por la verificada)
- Estado: REVIEW · Rama/commit: — (plan `.opencode/plan/borrar-abra-sin-verificar.md`)
- Resumen (≤ 5 líneas): `SAFE_NAME` de `adminFilePath` ahora acepta nombres con `_` inicial
  (misma política que `houseEditFilePath`), así el CRUD de `/admin/cards` puede
  guardar/borrar en `_samples.json` (antes: "destino no permitido"). La abra sin verificar
  de `_samples.json` fue reemplazada por la verificada de `_staging/Iniciales_02.json`
  (mismo id `abra` → decks.dev.json, STARTER_BY_DECK y tests de probar-encuentro-abra
  intactos); el staging se eliminó. Quedan 5 cartas, 0 sin verificar.
- Archivos clave tocados (rutas):
  - `apps/web/src/admin/server.ts` — `SAFE_NAME` + comentario (AC-1).
  - `tests/t040-admin-cards.test.ts` — test nuevo AC-1/AC-2 (`_` inicial + bads siguen rebotando).
  - `content/pokemon/_samples.json` — carta `abra` reemplazada (verified=true, needsReview).
  - `content/pokemon/_staging/Iniciales_02.json` — eliminado (gitignored, su única carta se movió).
- AC cubiertos → test:
  - AC-1/AC-2 → `tests/t040-admin-cards.test.ts` "adminFilePath/saveAdminFile aceptan `_` inicial".
  - AC-3 → `pnpm content:validate` (5 cartas, 5 verificadas, 0 sin verificar) + staging eliminado.
  - AC-4 → suites verdes sin cambios: t-dev-encounter, PlayScreen AC-6, t010, t032c2, t045, t002/t002b.
- `pnpm verify`: typecheck + lint + content:validate + build + deps:check + size + bench OK;
  tests 902/905 — 3 fallas PREEXISTENTES de Q-089 (2026-10-23): `t098-close` AC-3 (string
  "Aspecto congelado" perdido en el merge del backlog) y `lighting` T-080 AC-4/AC-5. Sus
  entradas (BACKLOG.md, board3d/style) no fueron tocadas por este plan.
- Decisiones tomadas / defaults aplicados:
  - La carta migrada NO lleva `officialMove`/`officialMoveStatus` (confusion/confuse-ray/psychic
    no están portados a Showdown y `t032c2/AC-2` exige que todo officialMove resuelva a un
    puerto): mismo criterio del plan probar-encuentro-abra (reporte T-032c2: "los 3 de Abra
    usan arquetipos fx hasta que se porteen"). Se conservan `needsReview`, `source.position` y
    `source.photo` tal cual del staging (claves que Zod ignora; pasan "tal cual" como dice el plan).
  - `e2e/t103-card-modal.mjs` solo consume squirtle de `_samples.json` → sin cambios (paso 4 del plan).
- Dudas nuevas (→ OPEN-QUESTIONS.md) y ER solicitados: ninguna nueva (Q-089 ya cubre las fallas
  preexistentes). ER: ninguno.
- Riesgos / deuda: los ids de ataques de abra pasaron a los del staging (`Confusión`,
  `Rayo de Confusión`, `psiquico`); si se quiere tipar `needsReview`/`position` en el esquema,
  es tarea nueva. Los `officialMove` de Abra se re-agregan cuando se porteen sus animaciones.
