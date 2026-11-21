# Estado de la ingesta de cartas (`pnpm cards:status`)

## Objetivo
Un comando de consola, determinista, que responda "¿en qué estado está la ingesta de las cartas?": cuántas se esperan (manifiesto de fotos), cuántas hay escaneadas, cuántas en staging (ok / con error), cuántas curadas y verificadas, y cuántos efectos custom quedan por triage.

Contexto actual: ~266 esperadas (CSV), 251 escaneos en `content/photos/scans/`, 16 en `_staging/` ok, 258 en `_staging/_errors/` (acumuladas entre corridas), 0 curadas en `content/pokemon/` (solo `_samples.json`). Hoy esa info está dispersa entre `report.html`, `pnpm digest` y `pnpm content:validate`.

## Criterios de aceptación
- [ ] AC-1: `pnpm cards:status` imprime un resumen global en una sola corrida: esperadas (suma de `cartas_esperadas` de `content/photo-manifest.csv`), escaneadas (`*.jpg` bajo `content/photos/scans/`), staging ok (`*.json` en `content/pokemon/_staging/` sin subcarpetas), staging con error (`content/pokemon/_staging/_errors/`), curadas (`collect()` de `packages/content/src/validate.ts` → `stats.cards`, con verificadas / sin verificar) y efectos custom pendientes.
- [ ] AC-2: desglose por grupo y mazo (terreno por mazo: bosque/isla/llanura/montana/pantano; evolucion; sorpresa; gimnasio; liga; iniciales): esperadas (del CSV) vs escaneadas vs staging ok vs errores, derivando grupo/mazo de la ruta del escaneo (convención Q-081) y del CSV.
- [ ] AC-3: la salida es determinista (mismo estado del repo ⇒ mismas líneas), sin timestamps ni rutas absolutas ni duraciones, en español rioplatense, ≤ 60 líneas, estilo `tools/digest.ts` (misma convención de conteos).
- [ ] AC-4: es robusto ante estados parciales: si falta el CSV, los escaneos, el staging o las cartas curadas, muestra `0` / `—` en ese renglón y termina con exit 0 (sin crashear). Aviso simple si errores > escaneos (errores acumuladas de corridas anteriores).
- [ ] AC-5: un test por AC en `tests/t105-cards-status.test.ts` (ajustar el id al que asigne el BACKLOG), con comentario `// AC: <n>` y fixtures en un directorio temporal (no depende del estado real del repo).

## Archivos involucrados
- Nuevos:
  - `tools/cards-status.ts` (función pura `buildStatusLines(root): string[]` + entrypoint CLI, ≤ 400 líneas).
  - `tests/t105-cards-status.test.ts`
- Modificados:
  - `package.json` (agregar script `"cards:status": "node tools/cards-status.ts"` junto a los otros `cards:*`).
- Solo lectura (no modificar):
  - `content/photo-manifest.csv`
  - `content/photos/scans/<grupo>[/<mazo>]/*.jpg`
  - `content/pokemon/_staging/*.json` y `content/pokemon/_staging/_errors/*.json`
  - `packages/content/src/validate.ts` (`collect()` para curadas/verificadas/customs)
  - `tools/digest.ts` y `docs/CARD-INGESTION.md` como referencia de estilo y flujo.

## Plan de pasos
1. Tests primero: `tests/t105-cards-status.test.ts`, un test por AC con fixtures temporales (CSV parcial, scans de 2 grupos, staging con ok+errors, curadas vía `collect`).
2. Implementar `tools/cards-status.ts`: leer CSV + contar archivos + `collect()`; función pura que arma las líneas; main que imprime.
3. Agregar el script `cards:status` en `package.json`.
4. Correr `pnpm verify` (verde) y escribir el reporte `tasks/reports/T-xxx.md` siguiendo `tasks/REPORT_TEMPLATE.md`.

## Comandos de verificación
- `pnpm cards:status` (salida esperada: resumen global + tabla por grupo/mazo con los números actuales)
- `pnpm vitest run tests/t105-cards-status.test.ts`
- `pnpm verify`

## Fuera de alcance
- No modificar el lector (`tools/cards-scan/`), el validador de contenido ni `report.html`.
- No crear/curar cartas: solo reportar el estado.
- No agregar UI web: es un comando de consola.
