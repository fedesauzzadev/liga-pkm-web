# Resolver Q-020 (conciliar estado de T-032c1)

## Objetivo
Cerrar la única pregunta abierta de `docs/OPEN-QUESTIONS.md` (Q-020): T-032c1 figura `TODO` en el backlog pero `apps/web/src/fx/` ya existe y T-032d lo consumió. Se releva el estado real, se pide decisión al dueño/jefe y se concilian los registros.

## Criterios de aceptación
- [ ] AC-1: Relevamiento documentado: qué existe (`fx/archetypes.ts`, `fx/playMoveFx.ts`, `fx/index.ts`, `tests/t032c1-fx.test.ts`, ruta `/dev/fx`) vs qué exige el backlog (FX base + 17 arquetipos + `/dev/fx`), con gaps concretos (cuántos arquetipos hay, si `/dev/fx` los expone o solo muestra el spike T-032c0).
- [ ] AC-2: Decisión explícita del dueño/jefe registrada (opciones: DONE con reporte retroactivo / mantener TODO y crear tarea para completar / descartar lo existente).
- [ ] AC-3: `tasks/BACKLOG.md` refleja el estado decidido para T-032c1 (y dependientes T-032c2/T-032d/T-0040 quedan coherentes).
- [ ] AC-4: Si la decisión es DONE: reporte retroactivo `tasks/reports/T-032c1.md` con el template y checklist de `tasks/OWNER-REVIEW.md` actualizado si aplica.
- [ ] AC-5: Q-020 marcada `resuelta por ...` con fecha y decisión en `docs/OPEN-QUESTIONS.md`; sin otras preguntas en estado `abierta`.
- [ ] AC-6: `pnpm verify` verde (la tarea no toca código de producción; si la decisión exige completar arquetipos, eso queda como tarea nueva en BACKLOG, no se implementa acá).

## Archivos involucrados
- `docs/OPEN-QUESTIONS.md` (editar Q-020) — solo lectura: `AGENTS.md` (flujo), `tasks/BACKLOG.md`, `tasks/OWNER-REVIEW.md`, `tasks/reports/T-032d.md`, `tasks/reports/T-032c0.md`
- Lectura de implementación (NO modificar): `apps/web/src/fx/archetypes.ts`, `apps/web/src/fx/playMoveFx.ts`, `apps/web/src/fx/index.ts`, `tests/t032c1-fx.test.ts`, `apps/web/src/dev/`, `apps/web/src/App.tsx`
- Condicionales: `tasks/reports/T-032c1.md` (crear solo si decisión = DONE)

## Plan de pasos
1. Relevar: contar arquetipos en `fx/archetypes.ts`, ver qué expone `/dev/fx`, qué cubre `tests/t032c1-fx.test.ts`, y qué API consumió T-032d (`BattleFxPort`).
2. Armar resumen del gap (existente vs backlog) y pedírselo al dueño/jefe para decidir (usar `question` con las 3 opciones).
3. Aplicar la decisión: actualizar estado de T-032c1 en `BACKLOG.md`; si es DONE, escribir `tasks/reports/T-032c1.md` (retroactivo, evidencia = tests existentes) y ajustar `OWNER-REVIEW.md`; si es mantener TODO, crear/ajustar la tarea que complete lo faltante.
4. Marcar Q-020 como resuelta en `docs/OPEN-QUESTIONS.md` con fecha y texto de la decisión.
5. Correr `pnpm verify`.

## Comandos de verificación
- `pnpm verify`
- `pnpm digest` (estado del repo antes/empezando)
