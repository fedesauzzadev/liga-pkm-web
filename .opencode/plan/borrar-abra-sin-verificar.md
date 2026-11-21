# Borrar la Abra sin verificar (fix CRUD + swap por la verificada)

## Objetivo
Que el CRUD de `/admin/cards` pueda guardar/borrar cartas en archivos con `_` inicial (`_samples.json`), y que la abra sin verificar de `_samples.json` desaparezca reemplazada por la verificada de `_staging/Iniciales_02.json` (mismo id `abra`).

## Diagnóstico (causa raíz)
- El error `destino no permitido: content/pokemon/_samples.json` sale de `adminFilePath` (`apps/web/src/admin/server.ts:38`): `SAFE_NAME` no acepta `_` inicial, pero `listAdminCards` lista todos los `.json` de `content/pokemon/` → el archivo se lista y se edita en la UI, pero el `PUT /cards` (que persiste el borrado vía `deletePokemonForever`) lo rechaza.
- La abra verificada vive en `content/pokemon/_staging/Iniciales_02.json` (única carta del archivo, `source.verified=true`); la de `_samples.json` es un fixture sin verificar del plan probar-encuentro-abra.
- Borrar la abra SIN reemplazo rompería `decks.dev.json` (abra ×2 en pantano), `STARTER_BY_DECK.pantano` (`packages/engine/src/setup.ts:23`) y los tests del plan probar-encuentro-abra (t-dev-encounter, PlayScreen AC-6, t010). El reemplazo con mismo id `abra` evita la cascada.
- `content:validate` valida `_staging/` con el mismo esquema (`packages/content/src/validate.ts:293`), así que la carta verificada (con `needsReview`) pasa tal cual dentro de `_samples.json`.

## Criterios de aceptación
- [ ] AC-1: `adminFilePath` acepta `content/pokemon/_samples.json` y nombres con `_` inicial en `_staging/`; sigue rechazando traversal (`../`), rutas fuera de `content/pokemon/` y `gyms.json`.
- [ ] AC-2: `saveAdminFile` persiste un doc en `_samples.json` (round-trip temp+rename); borrar una carta desde `/admin/cards` ya no da "destino no permitido".
- [ ] AC-3: En `_samples.json` la carta `abra` queda con `source.verified=true` (datos de `Iniciales_02.json`); `content/pokemon/_staging/Iniciales_02.json` se elimina; no queda ninguna abra sin verificar.
- [ ] AC-4: `pnpm verify` verde: `content:validate` resuelve `decks.dev.json` (abra ×2) y los tests de probar-encuentro-abra pasan sin cambios.

## Archivos involucrados
- `apps/web/src/admin/server.ts` — `SAFE_NAME` (línea ~35) + comentario AC-1/AC-3.
- `tests/t040-admin-cards.test.ts` — test nuevo (AC-1/AC-2).
- `content/pokemon/_samples.json` — reemplazar carta `abra`.
- `content/pokemon/_staging/Iniciales_02.json` — borrar (su única carta se mueve).

## Plan de pasos
1. Test primero en `tests/t040-admin-cards.test.ts` (comentario `// AC: borrar-abra-sin-verificar/AC-1|AC-2`): `adminFilePath` acepta `content/pokemon/_samples.json`; `saveAdminFile` escribe y relee un doc ahí; los `bad` existentes siguen lanzando `AdminSaveError`.
2. Cambiar `SAFE_NAME` a `/^[A-Za-z0-9_][A-Za-z0-9_.-]*\.json$/` (misma política de `_` inicial que `houseEditFilePath`) y actualizar el comentario.
3. Contenido: reemplazar la carta `abra` de `_samples.json` por la de `Iniciales_02.json` (indent 1 espacio, conservar `_comment`/`pending` del doc) y borrar `content/pokemon/_staging/Iniciales_02.json`.
4. `pnpm verify`; si `e2e/t103-card-modal.mjs` (lee `_samples.json`) reclama por los ids de ataques cambiados (`hipno-rayo`→`Confusión`, etc.), ajustar el fixture sin relajar checks.

## Comandos de verificación
- `pnpm verify`
- `pnpm content:validate`
