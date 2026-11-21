# Auditoría de tasks TODO del backlog

## Objetivo
Determinar, para cada tarea de `tasks/BACKLOG.md` en estado `TODO`, si ya está implementada en código o si falta hacerla, produciendo un informe de brechas (spec vs. código) sin implementar nada.

## Alcance (tasks en TODO al día de hoy)
- T-048 — Ediciones de la casa (parches sobre cartas) — SPEC-F
- T-042c — Carga completa de las ~266 cartas + `build-decks` — SPEC-F
- T-050 — Presupuesto de peso, code-splitting, despliegue privado — SPEC-D

## Criterios de aceptación
- [ ] AC-1: Para cada task TODO hay una fila con veredicto: `YA HECHA`, `PARCIAL` (con qué falta) o `PENDIENTE`, justificada con archivos/tests concretos.
- [ ] AC-2: Cada veredicto se contrasta contra los criterios `AC-n` de su spec (SPEC-F para T-048/T-042c, SPEC-D para T-050); no contra impresiones.
- [ ] AC-3: Se verifica en código y/o `content/` lo que cada spec pide (ej. T-048: esquema/pipeline de parches; T-042c: cartas cargadas y `build-decks`; T-050: size-limit, code-splitting, config de deploy privado) citando rutas existentes o su ausencia.
- [ ] AC-4: Se corren y se citan los comandos existentes relevantes (`pnpm digest`, `pnpm verify`, `content:validate`, scripts de tools) como evidencia.
- [ ] AC-5: El informe se escribe en `docs/audits/backlog-todo.md` (nuevo) y se registran discrepancias o dudas en `docs/OPEN-QUESTIONS.md` sin cambiar estados del backlog por decisión propia.
- [ ] AC-6: No se implementa funcionalidad nueva ni se modifican fuentes de la app; solo docs de auditoría.

## Archivos involucrados
- Lectura: `tasks/BACKLOG.md`, `specs/SPEC-F-cards-and-items.md`, `specs/SPEC-D-ui.md`, `docs/RULES.md`, `docs/ENGINEERING-STANDARDS.md`, `docs/PRIVACY-DEPLOY.md`
- Lectura (evidencia): `content/*.json`, `packages/`, `apps/web/`, `tools/`, `package.json` (scripts)
- Escritura: `docs/audits/backlog-todo.md` (nuevo), `docs/OPEN-QUESTIONS.md` (solo si hay dudas)

## Plan de pasos
1. Correr `pnpm digest` y releer las secciones de SPEC-F (T-048, T-042c) y SPEC-D (T-050) con sus `AC-n`.
2. T-048: buscar en `content/`, `tools/` y `packages/` esquema/validación/aplicación de ediciones de la casa (house patches) sobre cartas; verificar si hay parches cargados.
3. T-042c: contar cartas cargadas en `content/` (¿~266?), verificar existencia y ejecución de `build-decks` y reportes de errores del piloto.
4. T-050: verificar size-limit/code-splitting (config y `pnpm verify`), PWA/build y qué existe de despliegue privado según `docs/PRIVACY-DEPLOY.md`.
5. Escribir `docs/audits/backlog-todo.md` con el veredicto por task y evidencia; registrar dudas en `docs/OPEN-QUESTIONS.md`.
6. Proponer (no aplicar) cambios de estado sugeridos para que el jefe/dueño decida.

## Comandos de verificación
- `pnpm digest`
- `pnpm content:validate`
- `pnpm verify` (para T-050: peso/size-limit e invariantes como evidencia)
- Conteos de contenido: `rg -c` / glob sobre `content/` (cartas cargadas, decks generados)
