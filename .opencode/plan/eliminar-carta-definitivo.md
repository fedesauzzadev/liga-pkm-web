# Eliminar carta definitivamente en /admin/cards

## Objetivo

Que "Eliminar pokemon" en `/admin/cards` borre la carta **definitivamente**: hoy `deletePokemon` (apps/web/src/admin/CardsAdmin.tsx:183) solo la quita del estado local del navegador y queda "Carta eliminada (guardá para escribir el JSON)". Si no se guarda a mano, al refrescar o reiniciar el dev server la carta vuelve a aparecer (releída de `content/pokemon/**`), y el dueño tiene que verificarla/eliminarla otra vez, una y otra vez.

## Criterios de aceptación

- **AC-1** — Al confirmar "Eliminar pokemon" se persiste el doc sin la carta en el mismo momento (PUT `/admin/api/cards` vía `saveFile`); tras refrescar la página o reiniciar `pnpm dev`, la carta eliminada NO reaparece en la lista.
- **AC-2** — Si el guardado falla (p. ej. otra carta del archivo no valida el esquema), el borrado local se **revierte** (la carta vuelve a la lista, la UI refleja el disco) y el error se muestra en el `status` con el formato existente de fallo de guardado.
- **AC-3** — Se conserva el salto de selección a la carta vecina (`neighborKeyAfterRemove`) y el `window.confirm` previo.
- **AC-4** — `es.adminDeleted` se actualiza a un texto sin la aclaración "(guardá para escribir el JSON)" (p. ej. `'Carta eliminada'`), porque el borrado ya es definitivo.
- **AC-5** — Tests: uno nuevo cubre AC-1/AC-2 (borrar ⇒ llama a `saveAdminFile` con el doc sin la carta; fallo de guardado ⇒ reversión + error visible); se actualizan `AC: carga-manual-cartas/AC-2` (ya no "aplica al guardar") y `AC-7` (assert de `es.adminDeleted` sin 'guardá').

Fuera de alcance: si la carta vuelve porque se re-corre el lector de escaneos (`tools/cards-scan/staging.ts` regenera `_staging/` desde las fotos), es re-ingesta, no este bug; no se toca el pipeline.

## Archivos involucrados

- `apps/web/src/admin/CardsAdmin.tsx` — `deletePokemon`: quitar del doc local + `saveFile` inmediato; revertir si falla.
- `apps/web/src/i18n/es.ts` — `adminDeleted` (línea ~499).
- `apps/web/src/admin/CardsAdmin.test.tsx` — test nuevo + ajuste de AC-2/AC-7 de `carga-manual-cartas`.
- `apps/web/src/admin/api.ts` y `apps/web/src/admin/server.ts` — solo referencia (API de guardado ya existente, no se cambia).

## Plan de pasos

1. Test primero: en `CardsAdmin.test.tsx`, caso de borrado definitivo (mock/espía de `saveAdminFile`) y caso de fallo con reversión; ajustar los asserts de `carga-manual-cartas/AC-2` y `AC-7`.
2. `es.ts`: nuevo texto de `adminDeleted`.
3. `CardsAdmin.tsx`: `deletePokemon` pasa a async — `removeCard` local + `setSelected(neighbor)` + `saveFile(current.file)`; si `saveFile` devuelve `false`, restaurar el doc previo (guardar referencia antes del `setDocs`) y dejar el error en `status`.
4. Correr verificación completa.

## Comandos de verificación

- `pnpm vitest run apps/web/src/admin/CardsAdmin.test.tsx`
- `pnpm verify`
- Manual (dev): `pnpm dev` → eliminar una carta de `_staging` → refrescar y reiniciar el dev server → la carta no reaparece.
