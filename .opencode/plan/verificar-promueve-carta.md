# Verificar una carta la promueve de _staging y la deja usable

## Objetivo

Que "Verificar" en `/admin/cards` deje la carta **lista para usarse en una sola acción**: hoy una carta de `content/pokemon/_staging/` queda verificada pero sigue en staging (badge incluido) y el juego ni la mira — `gameContent.cards` solo carga `_samples.json` (apps/web/src/game/content.ts:30). Verificar ⇒ la carta sale de staging a un archivo canónico que el juego carga; eliminar ⇒ sin archivos fantasma; el alta nueva sigue naciendo "sin verificar" en staging.

Decisiones (defaults, documentados):
- Destino de la promoción: `content/pokemon/<deck>.json` (convención del SDD §106 "un archivo por mazo"; `deck` es obligatorio en el esquema). Se crea si no existe; se preserva `_comment`/`pending` si ya existía.
- "Usarse" = estar en `gameContent.cards` (canónicos). Sumar la carta a `decks.json`/`decks.dev.json` queda fuera de alcance.
- El alta manual sigue igual: `source.verified=false`, default `content/pokemon/_staging/carga-manual.json` (newCardDraft/addPokemon en draft.ts).

## Criterios de aceptación

- **AC-1** — Verificar ('v' o botón) una carta de `content/pokemon/_staging/**` la **promueve** en una sola operación (`POST /admin/api/promote` con el doc de staging editado sin la carta + la carta con ediciones locales y `source.verified=true`): el server valida todo con Zod ANTES de escribir, agrega la carta a `content/pokemon/<deck>.json`, guarda el doc de staging sin ella y, si el archivo de staging queda con 0 cartas, lo **borra del disco**. Escrituras atómicas (tmp+rename, como `saveAdminFile`).
- **AC-2** — Si la carta no valida el esquema, o su `id` ya existe en el archivo destino (o en otro canónico), ⇒ `AdminSaveError` con mensaje claro y **no se escribe nada**; la UI lo muestra en `status` con el formato existente.
- **AC-3** — Verificar una carta que ya está en un archivo canónico hace lo de hoy (`source.verified=true` + `PUT` al mismo archivo, `markVerified`); no se mueve.
- **AC-4** — El juego carga **todos** los canónicos `content/pokemon/*.json` (incl. `_` como `_samples.json`; excl. `gyms.json` y la subcarpeta `_staging/`) vía `import.meta.glob`: `gameContent.cards` incluye las promovidas ⇒ usables sin reiniciar nada. Archivo inválido ⇒ `console.error` + salteo (patrón house-edits, la app no rompe); id duplicado entre archivos ⇒ gana el primero en orden alfabético + aviso; `pendingEvos` concatena `pending` de todos los archivos; house-edits se aplican sobre el conjunto completo.
- **AC-5** — Eliminar persiste (ya existe, `deletePokemonForever`) y además, si el doc queda con 0 cartas, se borra el archivo (`DELETE /admin/api/cards` guardado por `adminFilePath`; se niega si el archivo en disco todavía tiene cartas). Sin archivos vacíos re-apareciendo en la lista.
- **AC-6** — Tras verificar/promover, la UI recarga el snapshot y la carta aparece en `content/pokemon/<deck>.json` **sin badge "staging"**, verificada, con mensaje de estado nuevo en `es.ts` (p. ej. `adminPromoted`); el alta nueva sigue mostrando "Sin verificar".
- **AC-7** — Tests: uno por AC — server (`promoteVerifiedCard`, borrado de staging vacío, rechazos de AC-2, DELETE de archivo vacío) en Node; merge de archivos canónicos (helper puro) con fixtures; UI (verify de carta staging llama a promote y refresca, verify canónico no).

Fuera de alcance: re-ingesta del lector de escaneos (regenerar `_staging/` revive las cartas — re-visita, no bug); edición de `decks.json`; el flujo `_errors/`.

## Archivos involucrados

- `apps/web/src/admin/server.ts` — `promoteVerifiedCard(contentDir, file, doc, card)` + `deleteAdminFileIfEmpty` + rutas `POST /admin/api/promote` y `DELETE /admin/api/cards`.
- `apps/web/src/admin/api.ts` — clientes `promoteVerifiedCard`, `deleteAdminFile`.
- `apps/web/src/admin/CardsAdmin.tsx` — `verifyCurrent` ramifica staging/canónico (AC-1/AC-3); delete pide el borrado del archivo vacío (AC-5).
- `apps/web/src/admin/deleteFlow.ts` — tras `persist` exitoso, si el doc quedó con 0 cartas ⇒ `deleteAdminFile`.
- `apps/web/src/game/pokemonFiles.ts` (nuevo) — helper puro `mergePokemonFiles(entries)` (parse, dedupe por id, `pending` concatenado, errores tolerantes).
- `apps/web/src/game/content.ts` — reemplaza el import fijo de `_samples.json` por `import.meta.glob('../../../../content/pokemon/*.json', { eager: true })` (excl. `gyms.json`) + `mergePokemonFiles`; house-edits sobre el total.
- `apps/web/src/i18n/es.ts` — `adminPromoted` (+ texto de delete si hace falta).
- Tests: `tests/t040-admin-cards.test.ts` (extender) o `tests/verificar-promueve-carta.test.ts` (server), `apps/web/src/game/pokemonFiles.test.ts` (nuevo), `apps/web/src/admin/CardsAdmin.test.tsx` (extender).
- `docs/CARD-INGESTION.md` — actualizar el flujo (verificar ⇒ promote a canónico ⇒ usable).

## Plan de pasos

1. Tests primero, uno por AC (server con tmp dirs, merge helper con fixtures, UI con mocks de `api.ts`).
2. Server: `promoteVerifiedCard` + `deleteAdminFileIfEmpty` + rutas nuevas en `server.ts` (validación Zod completa antes de escribir; tmp+rename).
3. Cliente: `api.ts`, `CardsAdmin.tsx` (`verifyCurrent` promueve si `current.staging`), `deleteFlow.ts` (archivo vacío ⇒ DELETE), `es.ts`.
4. Juego: `pokemonFiles.ts` + glob en `content.ts` (cartas promovidas usables; `contentHash` cambia ⇒ saves viejos invalidados, aceptable).
5. Docs (`CARD-INGESTION.md`) y `pnpm verify` verde.

## Comandos de verificación

- `pnpm vitest run tests/t040-admin-cards.test.ts apps/web/src/game/pokemonFiles.test.ts apps/web/src/admin/CardsAdmin.test.tsx`
- `pnpm verify`
- Manual (dev): `pnpm dev` → `/admin/cards` → verificar una carta de `_staging` → refrescar: sin badge "staging", en `content/pokemon/<deck>.json`; el juego la resuelve (p. ej. aparece en el setup del mazo que la incluya vía decks).
