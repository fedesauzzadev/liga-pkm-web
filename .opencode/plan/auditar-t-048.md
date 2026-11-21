# Auditoría T-048 — Ediciones de la casa: ¿ya está hecha?

## Objetivo
Determinar con evidencia si T-048 (SPEC-F: parches sobre cartas en `content/house-edits/`) ya está implementada pese a estar en `TODO`, y decidir si sigue siendo útil ahora que existe edición directa de cartas en `/admin/cards` (T-040). Sin implementar nada.

## Contexto preliminar (hallazgos de esta sesión)
- T-048 ≠ `/admin/cards`: T-040 **edita los archivos originales** (`content/pokemon/**.json`); T-048 es una **capa de parches reversible** encima de la transcripción original (D-26), activable por archivo, que nunca toca los originales.
- Ya existe (de T-002b): esquemas Zod (`packages/content/src/house-edits.ts`), `content/house-edits/_example.json`, validación de solo-esquema (`packages/content/src/validate.ts:312`) y `features.houseEdits:true` en `content/ruleset.classic.json`.
- No existe (núcleo de T-048): aplicación de ediciones (set/attacks/addAttacks/removeAttacks + fusión + revalidación + `source.houseEdited/editId`), integración en el loader, vista original vs. editada en `/admin/cards`, tests de `_example.json` y `contentHash` en partidas guardadas.
- Veredicto tentativo: **PARCIAL** (solo el andamiaje de esquemas de T-002b; el pipeline y la UI de T-048 no existen). Esta auditoría debe confirmarlo AC por AC.

## Criterios de aceptación
- [ ] AC-1: Veredicto por cada `AC-n` de SPEC-F/T-048 (AC-1..AC-6): `YA HECHA`, `PARCIAL` o `PENDIENTE`, con archivo:test concretos como evidencia.
- [ ] AC-2: Se verifica en código si el loader/`collect` aplica ediciones (AC-1), si existe la fusión+revalidación con `source.houseEdited` (AC-2/AC-3), si `/admin/cards` tiene original vs. editada y toggle (AC-4), si hay tests (AC-5) y `contentHash` en partidas (AC-6).
- [ ] AC-3: Se explica la diferencia con la edición directa de T-040 y los casos de uso donde T-048 sigue aporte (reversibilidad, balance de "reglas de la casa" sin ensuciar la transcripción, auditoría de cambios con `reason`).
- [ ] AC-4: El informe se escribe en `docs/audits/t-048.md` (nuevo) y, si hay dudas o decision pendiente (p. ej. cambiar estado del backlog), se registran en `docs/OPEN-QUESTIONS.md` sin cambiar estados por decisión propia.
- [ ] AC-5: No se implementa funcionalidad nueva ni se modifican fuentes de la app; solo docs de auditoría.

## Archivos involucrados
- Lectura: `specs/SPEC-F-cards-and-items.md` (§T-048), `tasks/BACKLOG.md`, `docs/RULES.md` (D-26), `docs/CARD-INGESTION.md`
- Lectura (evidencia): `packages/content/src/{house-edits.ts,validate.ts,loader.ts,cards.ts}`, `content/house-edits/_example.json`, `content/ruleset.classic.json`, `apps/web/src/admin/**` (CardsAdmin/CardEditor), `packages/engine/**` y `apps/web/src/**` (búsqueda de `contentHash`/save)
- Escritura: `docs/audits/t-048.md` (nuevo), `docs/OPEN-QUESTIONS.md` (solo si hay dudas)

## Plan de pasos
1. Releer SPEC-F §T-048 (AC-1..AC-6) y D-26 en `docs/RULES.md`.
2. Buscar en `packages/` y `apps/` la aplicación de ediciones (`houseEdited`, `editId`, fusión de `attacks`, `addAttacks`/`removeAttacks`): confirmar ausencia o presencia.
3. Verificar en `/admin/cards` (Código de `apps/web/src/admin/`) si hay vista original vs. editada o toggle de archivos de ediciones (AC-4).
4. Buscar `contentHash` en partidas guardadas (engine/web, AC-6).
5. Escribir `docs/audits/t-048.md` con veredicto por AC + conclusión sobre utilidad vs. T-040; registrar dudas en `docs/OPEN-QUESTIONS.md`.

## Comandos de verificación
- `pnpm digest`
- `rg -n "houseEdited|editId|contentHash|addAttacks|removeAttacks" packages apps content tests`
- `pnpm content:validate` (evidencia: solo valida esquema de `house-edits`)
- `pnpm verify` (debe seguir verde; la auditoría no toca código)
