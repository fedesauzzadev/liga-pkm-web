# Carga manual de cartas en /admin/cards

## Objetivo
Adaptar `/admin/cards` para que el dueño cargue a mano cada carta de Pokémon: botones **Agregar pokemon** / **Eliminar pokemon**, selector del archivo físico de la foto (`content/photos/**`) en vez de tipear la ruta, y un selector de archivo destino para las cartas nuevas. El JSON se sigue generando al guardar (ya existe: `PUT /admin/api/cards` escribe `content/pokemon/**.json` validado con `PokemonFileSchema`).

## Criterios de aceptación
- [ ] AC-1: Botón "Agregar pokemon" crea una carta nueva con template mínimo editable (id/name vacíos, stage `basic`, hp 1, element `normal`, 1 ataque vacío, `source.verified=false`), la agrega al archivo destino elegido por selector (existente en `content/pokemon/` o `_staging/`, o nombre nuevo con default `content/pokemon/_staging/carga-manual.json`), queda seleccionada en la lista y el editor abre enfocado en el primer campo.
- [ ] AC-2: Botón "Eliminar pokemon" borra la carta seleccionada de su doc (con confirmación `confirm()`), la lista se actualiza y la selección salta a la vecina; el borrado aplica al guardar (igual que hoy).
- [ ] AC-3: Selector de foto que navega `content/photos/**` (carpetas y subcarpetas, solo `.jpg/.jpeg/.png/.webp`) servido por un endpoint nuevo `GET /admin/api/photos`; al elegir setea `source.photo` y la foto se ve en el panel existente (zoom incluido); se conserva el input manual como fallback.
- [ ] AC-4: Si el archivo destino no existe, se crea al guardar (respeta `SAFE_NAME`, sin traversal); después de guardar, el snapshot se recarga y el archivo nuevo aparece en la lista con su carta.
- [ ] AC-5: Al guardar, el JSON en disco queda exactamente como se ve en el editor (comportamiento actual): la carga manual "escribe" el JSON; si la carta nueva no valida contra `PokemonCardSchema`, el guardado falla con los errores visibles (como hoy).
- [ ] AC-6: Al eliminar una carta referenciada (por `evolvesTo` de otra carta o en `decks.json`), los cross-checks existentes lo marcan en el panel de chequeos.
- [ ] AC-7: Textos nuevos en `apps/web/src/i18n/es.ts` (español rioplatense); sin assets ni dependencias nuevas.

## Archivos involucrados
- `apps/web/src/admin/draft.ts` — `newCardDraft()` (template mínimo) + helpers de add/delete en el doc.
- `apps/web/src/admin/server.ts` — endpoint `GET /photos` (listado recursivo de `content/photos/**`, segmentos seguros, filtro por extensión).
- `apps/web/src/admin/api.ts` — `fetchAdminPhotos()` + tipos espejo.
- `apps/web/src/admin/CardsAdmin.tsx` — botones Agregar/Eliminar, selector de archivo destino, alta de archivo nuevo.
- `apps/web/src/admin/CardEditor.tsx` — picker de foto (dropdown por carpeta) junto al input actual de `source.photo`.
- `apps/web/src/admin/cards-admin.module.css` — estilos de los controles nuevos.
- `apps/web/src/i18n/es.ts` — textos.
- Tests: `tests/t040-admin-cards.test.ts` (endpoint y helpers server-side), `apps/web/src/admin/CardsAdmin.test.tsx` (UI, un test por AC).

## Plan de pasos
1. `draft.ts`: `newCardDraft()` + `addCard(doc, card)` / `removeCard(doc, index)` con sus tests.
2. `server.ts`: `listAdminPhotos(contentDir)` + ruta `GET /photos` (reusa anti-traversal por segmento); test en `tests/t040-admin-cards.test.ts`.
3. `api.ts`: tipos y `fetchAdminPhotos()`.
4. `CardsAdmin.tsx`: botones Agregar/Eliminar, selector de destino (archivos existentes + "nuevo archivo…"), confirmación de borrado y refresh post-guardado.
5. `CardEditor.tsx`: picker de foto alimentado por `fetchAdminPhotos()`, setea `source.photo`.
6. `i18n/es.ts` + CSS de los controles.
7. Tests de UI (uno por AC) y `pnpm verify` verde.

## Comandos de verificación
- `pnpm test -- t040-admin-cards` y `pnpm test -- CardsAdmin`
- `pnpm verify`
