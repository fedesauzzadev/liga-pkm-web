# Resolver los 3 fallos preexistentes de verify (Q-089)

## Objetivo
Dejar `pnpm verify` en verde arreglando los 3 tests rojos preexistentes y ajenos registrados en Q-089: `tests/t098-close.test.ts` AC-3 (nota de congelado perdida en el merge del backlog) y `apps/web/src/board3d/lighting.test.ts` AC-4/AC-5 (contornos apagados). Decisión del dueño (2026-10-23, question tool): **los contornos quedan apagados**; no se restaura `outlines.enabled: true`.

## Criterios de aceptación
- [ ] AC-1: `tasks/BACKLOG.md` vuelve a contener "Aspecto congelado (SPEC-O/T-098/AC-3)" y "tarea nueva" (sección Notas de orden) ⇒ `tests/t098-close.test.ts` 7/7 verde.
- [ ] AC-2: `tools/merge-backlog.mjs` ya no pierde la sección "Notas de orden" del backlog viejo al fusionar (verificado con copias temporales de `BACKLOG.md`/`BACKLOG.new.md` fuera del repo; raíz causa de que la nota se perdiera 2 veces — Q-077).
- [ ] AC-3: lighting AC-4 verde con la letra nueva: `buildOutlines` respeta `onlyKinds`/`maxMeshes`/color/BackSide probando el camino habilitado con un style sintético (`enabled: true` forzado), y el contenido REAL mantiene `lighting.outlines.enabled: false` (decisión del dueño).
- [ ] AC-4: lighting AC-5 verde con la letra nueva: perfil low ⇒ sin sombras ni contornos, dpr [1,1]; con el contenido real (`enabled: false`) los contornos quedan invisibles también en high (`visible = profile.outlines && enabled`, scene.ts:277); con style forzado `enabled: true`, high los muestra.
- [ ] AC-5: `pnpm verify` verde completo (0 de los 3 rojos); Q-071 y Q-089 quedan cerradas en `docs/OPEN-QUESTIONS.md` con la decisión del dueño (contornos apagados) y el reporte `tasks/reports/resolver-q089.md` escrito.

## Archivos involucrados
- `tasks/BACKLOG.md` — restaurar la nota "Aspecto congelado (SPEC-O/T-098/AC-3): …cambio visual posterior = tarea nueva" en Notas de orden (texto según reporte T-098; el `.bak` actual ya no la tiene).
- `tools/merge-backlog.mjs` — preservar/fusionar la sección de notas en vez de pisarla.
- `apps/web/src/board3d/lighting.test.ts` — reescribir AC-4 y AC-5 según AC-3/AC-4 de este plan.
- `docs/OPEN-QUESTIONS.md` — cerrar Q-071 y Q-089 (resueltas por dueño, 2026-10-23).
- `tasks/reports/resolver-q089.md` — reporte (template corto).
- NO se tocan: `content/board/style.json` (queda `outlines.enabled: false`), `apps/web/src/board3d/{outlines,scene,lighting}.ts` (el código data-driven se conserva).

## Plan de pasos
1. Restaurar la nota de congelado en `tasks/BACKLOG.md` (AC-1).
2. Endurecer `tools/merge-backlog.mjs` para que las notas de orden sobrevivan un merge; verificar con copias temporales en `%TEMP%` (AC-2).
3. Reescribir los tests AC-4 y AC-5 de `lighting.test.ts` con style sintético `enabled: true` para la maquinaria + aserciones del estado real apagado (AC-3/AC-4).
4. Cerrar Q-071/Q-089 en `docs/OPEN-QUESTIONS.md` y escribir `tasks/reports/resolver-q089.md` (AC-5).

## Comandos de verificación
- `pnpm vitest run tests/t098-close.test.ts apps/web/src/board3d/lighting.test.ts` — 13/13 verde.
- Verificación del merge con copias: `node tools/merge-backlog.mjs` sobre copias temporales de `BACKLOG.md`/`BACKLOG.new.md` en `%TEMP%` (corroborar que la nota sobrevive); NUNCA sobre los archivos reales sin querer re-fusionar.
- `pnpm verify` — verde completo.
