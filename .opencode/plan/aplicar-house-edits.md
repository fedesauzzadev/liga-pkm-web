# T-048 — Aplicar ediciones de la casa (pipeline + UI + contentHash)

## Objetivo
Completar T-048 (SPEC-F, D-26) según `docs/audits/t-048.md`: hoy `content/house-edits/*.json` son datos inertes (solo esquema de T-002b). Implementar la aplicación en el loader, la vista en `/admin/cards` y `contentHash` en partidas guardadas. Cierra Q-033 con "se mantiene T-048 tal cual (AC-1..AC-6)".

## Criterios de aceptación
- AC-1 Con `ruleset.features.houseEdits:true` y archivo `enabled:true`, el contenido cargado tiene las ediciones aplicadas tras cargar las cartas, en orden alfabético por archivo y por `edits[]` (loader Node y carga de la UI usan la misma función pura).
- AC-2 Operaciones soportadas y aplicadas: `set` (campos de carta), `attacks.<id>` (fusión profunda), `addAttacks[]`, `removeAttacks[]`; el resultado se revalida con Zod y la carta queda marcada `source.houseEdited:true` + `source.editId` (campos nuevos en `source` de `PokemonCardSchema`).
- AC-3 `target` inexistente o edición inválida ⇒ error claro que incluye el `id` de la edición y el archivo; nunca se escriben los originales `content/pokemon/**.json` (solo se aplica en memoria).
- AC-4 `/admin/cards` muestra original vs. editada lado a lado (diff por carta con ediciones activas) y permite activar/desactivar cada archivo de `content/house-edits/` (toggle persiste `enabled` vía API dev de T-040).
- AC-5 Test: `_example.json` `enabled:true` sobre carta fixture da el resultado esperado; `enabled:false` no cambia nada (cubre también aplicación on/off end-to-end del loader).
- AC-6 `SaveData` incluye `contentHash` (hash canónico del contenido CON ediciones); al continuar una partida cuyo `contentHash` difiere, la UI avisa (texto en `es.ts`).
- AC-7 Q-033 cerrada en `docs/OPEN-QUESTIONS.md` (decisión: alcance completo) y `tasks/BACKLOG.md` actualizado.

## Archivos involucrados
- `packages/content/src/house-edits.ts` — esquemas existentes; agregá campos `source.houseEdited`/`editId`.
- `packages/content/src/apply-house-edits.ts` (nuevo) — función pura de aplicación/fusión/revalidación (usable en Node y UI).
- `packages/content/src/validate.ts` — `collect` aplica ediciones tras cargar cartas (o llama a `apply-house-edits`); errores con id de edición.
- `packages/content/src/loader.ts` — sin cambios funcionales esperados (ya delega en `collect`).
- `apps/web/src/game/content.ts` — usar la misma función de aplicación para la carga de la UI; exponer `contentHash`.
- `apps/web/src/game/save.ts` — `contentHash` en `SaveData`/schema (definí bump de `SAVE_VERSION` o campo con default).
- `apps/web/src/admin/CardsAdmin.tsx` — vista original vs. editada + toggle por archivo.
- `apps/web/src/admin/server.ts` + `apps/web/src/admin/api.ts` — endpoint dev para alternar `enabled` de `content/house-edits/*.json`.
- `apps/web/src/i18n/es.ts` — textos de la vista diff, toggle y aviso de `contentHash`.
- `content/house-edits/_example.json` — queda `enabled:false` (fixture del test lo copia/habilita).
- `tests/t048-house-edits.test.ts` (nuevo) — un test por AC con `// AC: SPEC-F/T-048/AC-n`.
- `docs/OPEN-QUESTIONS.md`, `tasks/BACKLOG.md`, `tasks/reports/T-048.md` — cierre y reporte.

## Plan de pasos
1. `tasks/BACKLOG.md`: T-048 → `DOING`.
2. Tests primero: `tests/t048-house-edits.test.ts` desde AC-1..AC-6 (más tests de UI para AC-4/AC-6 con Testing Library).
3. Implementar `apply-house-edits.ts` (ops, orden determinista, revalidación, `houseEdited`/`editId`, errores con id) y conectar en `collect`/`validate.ts`.
4. `contentHash` en `apps/web/src/game/content.ts` + `save.ts` + aviso al continuar.
5. UI `/admin/cards`: diff original vs. editada + toggle por archivo (API dev reutilizada de T-040).
6. `pnpm verify` verde (nota: fallo preexistente de `tests/triage-customs.test.ts` AC-2 ya registrado en Q-032, ajeno a esta tarea) + `pnpm content:validate`.
7. Reporte `tasks/reports/T-048.md`, backlog → `REVIEW`, cerrar Q-033 en `docs/OPEN-QUESTIONS.md`.

## Comandos de verificación
- `pnpm digest`
- `pnpm content:validate`
- `pnpm verify` (typecheck + lint + test + content:validate + build; verde salvo fallo preexistente Q-032)
- Búsqueda de trazas: `houseEdited`, `editId` y `contentHash` deben tener matches en `packages/` y `apps/` (hoy: 0).
