# t003-verificar-tablero — Cierre de pendientes de T-003 (AC-4 + VERIFIED)

## Objetivo
Cerrar lo pendiente de T-003: producir la evidencia gráfica del grafo corregido para el reporte (AC-4 de SPEC-A) y marcar `content/board/kanto.json` como `VERIFIED`. Decisión del dueño (registrada): marcar VERIFIED ahora; el gate G0 revisa la evidencia después y puede reabrir.

## Criterios de aceptación
- AC-1: `content/board/kanto.json` tiene `meta.status === "VERIFIED"`; `content:validate` no emite warning de estado (tablero 56 nodos / 59 aristas, conexo, conteos del spec intactos).
- AC-2: Existe evidencia gráfica del grafo corregido (`tasks/reports/assets/t003-kanto-graph.svg`, generada desde el JSON integrado; sin foto de fondo por regla de privacidad) y está referenciada en `tasks/reports/T-003.md` como cierre de AC-4 de SPEC-A/T-003.
- AC-3: El caso extra de `tests/t003-board.test.ts` (warning por tablero sin verificar) se actualiza: con VERIFIED no hay warning; el resto de los tests de T-003 queda verde y sin cambios de comportamiento del grafo.
- AC-4: `docs/OPEN-QUESTIONS.md` actualiza Q-004/Q-005: worker marcó VERIFIED tras integrar la corrección del dueño (decisión confirmada); queda pendiente solo la revisión de la evidencia en G0.

## Archivos involucrados
- `content/board/kanto.json` — `meta.status` → `"VERIFIED"`.
- `tools/board-render.mjs` (nuevo) — lee `kanto.json` y escribe el SVG (nodos/aristas/ids/colores como el overlay; cero dependencias, determinista).
- `tasks/reports/assets/t003-kanto-graph.svg` (nuevo) — evidencia para G0.
- `tests/t003-board.test.ts` — actualizar test de estado (sin warning con VERIFIED).
- `tasks/reports/T-003.md` — marcar AC-4 cubierto + referencia al SVG.
- `docs/OPEN-QUESTIONS.md` — Q-004/Q-005.

## Plan de pasos
1. Actualizar primero el test de estado en `tests/t003-board.test.ts` (espera VERIFIED, sin warning).
2. Cambiar `meta.status` a `"VERIFIED"` en `content/board/kanto.json`.
3. Crear `tools/board-render.mjs` y generar `tasks/reports/assets/t003-kanto-graph.svg` (regenerable: script ≤ 400 líneas, sin deps nuevas).
4. Actualizar `tasks/reports/T-003.md` (AC-4 → cubierto) y `docs/OPEN-QUESTIONS.md` (Q-004/Q-005).
5. Correr verificación completa.

## Comandos de verificación
- `node tools/board-render.mjs` (genera el SVG)
- `pnpm verify`
