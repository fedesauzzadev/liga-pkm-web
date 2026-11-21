# Borrar extracción por visión, cerrar ER pendientes y aliviar pnpm verify

## Objetivo

Eliminar el pipeline de extracción por visión (llamado a la API de Google con `VISION_API_KEY`, que no funciona): `pnpm extract`/`pnpm pilot` y todo lo que depende de eso. Resolver los 2 ER pendientes de Raichu de Surge que dejó esa extracción (textos truncados). Además, medir y bajar los tiempos de `pnpm verify` sin relajar reglas ni agregar dependencias.

## Criterios de aceptación

- [ ] AC-1: No queda ningún llamado a la API de visión: se eliminan `tools/extract.ts`, `tools/pilot.ts`, `tools/pilot-cards.json`, los scripts `extract`/`pilot` de `package.json`, y los tests `tests/t041-extract.test.ts` y `tests/t042b-pilot.test.ts`. `grep VISION_API_KEY` en `tools/ apps/ packages/ tests/` da 0 resultados.
- [ ] AC-2: Los 2 customs de Raichu de Surge quedan resueltos: `rawText` corregido contra fuente confiable (foto de la carta en `content/photos/crops/` o manual) y mapeados a primitivas de `docs/EFFECTS.md` (o handler definido si no hay primitiva, aprobado por el jefe). `pnpm triage` informa 0 grupos "SIN MAPEO" y la invariante customs == ER pendientes da OK.
- [ ] AC-3: `docs/effect-requests/ER-001.md` y `ER-002.md` marcados resueltos/cerrados; `Q-030` y `Q-032` pasan a `cerrada` en `docs/OPEN-QUESTIONS.md` citando esta tarea; `docs/CARD-INGESTION.md` nota que el flujo de visión fue eliminado (la carga de cartas es manual + `pnpm crop-cards`).
- [ ] AC-4: Informe de tiempos de `pnpm verify` por paso (baseline vs post-cambio) en el reporte, con al menos una optimización aplicada SIN nuevas dependencias y SIN desactivar reglas (candidatos: deduplicar los 4 proyectos de `tsc` en `typecheck`, `eslint --cache`, tuning de `vitest.config.ts`). Verify sigue verde.
- [ ] AC-5: `pnpm verify` completo verde (typecheck, lint, test, content:validate, build, deps:check, size, bench).

## Archivos involucrados

- Borrar: `tools/extract.ts`, `tools/pilot.ts`, `tools/pilot-cards.json`, `tests/t041-extract.test.ts`, `tests/t042b-pilot.test.ts`
- Editar: `package.json` (quitar scripts `extract`/`pilot`; tocar `verify` solo si aplica AC-4), `docs/OPEN-QUESTIONS.md` (cerrar Q-030/Q-032), `docs/effect-requests/ER-001.md` + `ER-002.md` (cierre), `tools/triage-customs.ts` (mapeos nuevos de Raichu de Surge), `content/pokemon/_staging/Gimnasios 2_03.json` (gitignored, local: rawText + effects), `docs/CARD-INGESTION.md` (nota), `vitest.config.ts` (solo si AC-4 lo justifica)
- NO tocar: `tools/crop_cards.py` ni `tests/t042a-crop-cards.test.ts` (recorte offline, sigue vigente), `tools/triage-customs.ts` como flujo (queda), `tasks/reports/*` y `.opencode/plan/T-041.md`/`T-042b.md` (registros históricos), `e2e/*.mjs` (Playwright de e2e no es parte de verify ni de la extracción)

## Plan de pasos

1. Medir baseline: tiempo por paso de `pnpm verify` (typecheck, lint, test, content:validate, build, deps:check, size, bench) y guardarlo para el reporte.
2. Borrar el pipeline de visión (los 5 archivos de AC-1) + los 2 scripts en `package.json`.
3. Resolver los 2 customs de Raichu de Surge: confirmar el texto real contra la foto/manual, corregir `rawText` en el JSON de staging, agregar mapeos en `tools/triage-customs.ts` (o pedir aprobación de handler nuevo), correr `pnpm triage --apply`.
4. Cerrar ER-001/ER-002, Q-030 y Q-032; nota en `docs/CARD-INGESTION.md`.
5. Aplicar optimizaciones seguras de verify (sin deps nuevas, sin relajar reglas); re-medir y comparar contra el baseline.
6. Correr `pnpm verify` completo y escribir el reporte con tiempos antes/después.

## Comandos de verificación

```
pnpm verify
pnpm triage            # 0 grupos SIN MAPEO; customs == ER pendientes: OK
pnpm content:validate
git grep -n "VISION_API_KEY" -- tools apps packages tests   # 0 resultados
```
