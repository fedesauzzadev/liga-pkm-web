# Reporte borrar-extraccion-vision — Borrar extracción por visión, cerrar ER y aliviar verify
- Estado: REVIEW | Rama/commit: n/a (repo local)
- Resumen (≤ 5 líneas): eliminado el pipeline de visión (`pnpm extract`/`pilot`, tools y tests); los 2 customs de Raichu de Surge se resolvieron contra la carta escaneada del manual (p.60, OCR a 300dpi) y quedaron como primitivas; ER-001/002 aprobados, Q-030/Q-032 cerradas; `verify` acelerado con cachés de tsc/eslint sin tocar reglas (265s → 225s frío / 194s caliente).

## Archivos clave tocados
- Borrados: `tools/extract.ts`, `tools/pilot.ts`, `tools/pilot-cards.json`, `tests/t041-extract.test.ts`, `tests/t042b-pilot.test.ts`
- `package.json`: fuera scripts `extract`/`pilot`; `typecheck` con `--incremental --tsBuildInfoFile node_modules/.cache/tsc/*`; `lint` con `--cache --cache-location node_modules/.cache/.eslintcache`
- `tools/triage-customs.ts`: +2 mapeos Raichu de Surge (Attack-trueno → `rollGate [2] noAttack combat`; DOBLE EQUIPO → `defendGate [3,4] noAttack`)
- `content/pokemon/_staging/Gimnasios 2_03.json` (gitignored): rawTexts corregidos + primitivas aplicadas (`pnpm triage --apply`)
- `docs/effect-requests/ER-001.md` / `ER-002.md`: Estado aprobado + resolución con fuente
- `docs/OPEN-QUESTIONS.md`: Q-030 y Q-032 cerradas citando esta tarea
- `docs/CARD-INGESTION.md`: v3 — flujo de visión eliminado; carga manual + `pnpm crop-cards`
- Limpieza: residuos `packages/engine/src/__selftest_lint__.ts` y `tests/__selftest_lint__.ts` (son sondas que `verify:selftest` crea/borra; quedaron huérfanas y rompían typecheck de base)

## Cobertura de AC (spec `.opencode/plan/borrar-extraccion-vision.md`)
- AC-1 → borrados + `git grep VISION_API_KEY -- tools apps packages tests` = 0 resultados (verificado)
- AC-2 → `pnpm triage`: 0 customs / 0 grupos, 0 "SIN MAPEO", `customs (0) == ER pendientes (0): OK`
- AC-3 → ER-001/002 aprobados; Q-030/Q-032 cerradas; nota en CARD-INGESTION.md
- AC-4 → ver tabla de tiempos (eslint --cache + tsc --incremental; sin deps nuevas, sin reglas desactivadas)
- AC-5 → `pnpm verify` verde (2 corridas completas)

## `pnpm verify`: OK — tiempos por paso (segundos)
| paso | baseline | post frío | post caliente |
|---|---|---|---|
| typecheck | 30,0 | 21,5 | 11,1 |
| lint | 23,0 | 3,4 | 2,9 |
| test | 184,2 | 177,1 | 174,7 |
| content:validate | 0,7 | 1,0 | 1,0 |
| build | 20,0 | 21,3 | 21,5 |
| deps:check | 4,9 | 4,7 | 6,4 |
| size | 6,4 | 8,2 | 6,0 |
| bench | 0,9 | 1,8 | 1,5 |
| **total** | **~270** | **~239** | **~225** |

Optimizaciones aplicadas: `eslint --cache` y `tsc --incremental` (cacheo puro, mismas reglas). Descartado deduplicar los 4 tsc: los proyectos por paquete son MÁS estrictos que el root (engine `types:[]`) y juntarlos relajaría un chequeo real. `test` (~175s) domina; no se tocó vitest.config (Q-019 exige `fileParallelism:false` y reporter `dot` por estabilidad).

## Decisiones tomadas / defaults aplicados
- Texto de las cartas confirmado contra el manual p.60 (render 300dpi + OCR palabra por palabra, el worker no ve imágenes): «4-5_ Attack-trueno: cada turno si sacás 2 tu PKM no ataca. (30)» y «DOBLE EQUIPO: cuando ataques a Raichu tira el dado. Si sacás 3-4 tu PKM no ataca.» — la foto del dueño (630×1000, original ~197px/carta) no alcanza para OCR.
- Mapeos por canon EFFECTS §4 (misma forma que Polvo de esporas / fila "Raichu DOBLE EQUIPO"); no hizo falta handler nuevo.
- No se deduplicó typecheck (ver arriba) ni se cambió vitest: "sin relajar reglas" prima.

## Dudas nuevas / ER solicitados
- Ninguna nueva; ER-001/ER-002 quedan aprobados y cerrados.

## Riesgos / deuda
- El staging de Raichu conserva `id`/`name` "shock-trueno"/"Shock-trueno" (lectura errónea de la visión; la carta dice "Attack-trueno") y `rollFaces` que no cierran con el manual (4-5 / 1-2-3): fuera del alcance "rawText + effects"; la dueña lo corrige en `/admin/cards` (needsReview ya true). Detalle en ER-001.
- Las cachés de tsc/eslint viven en `node_modules/.cache/` (fuera de git); primera corrida tras un cambio grande paga el costo frío.
