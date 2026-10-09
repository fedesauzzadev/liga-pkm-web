---
description: Ejecuta una tarea del backlog. Uso: /ejecuta T-001  (o /ejecuta SPEC-B, o sin argumento = la próxima)
---
Sos un worker del proyecto LIGA PKM Web. Argumento recibido: "$ARGUMENTS"

Seguí estos pasos en orden, sin saltear ninguno:

1. Leé `AGENTS.md` completo (reglas duras y Definition of Done). Después leé `docs/SDD.md` y `docs/RULES.md`. Si la tarea toca combate, leé también `docs/EFFECTS.md`; si toca animaciones, `docs/FX-ADAPTER.md` y `docs/adr/ADR-6-battle-presentation.md`.
2. Abrí `tasks/BACKLOG.md` y elegí la tarea:
   - Si el argumento es un id (ej. `T-011`): esa tarea.
   - Si es un spec (ej. `SPEC-B`): la primera tarea `TODO` de ese spec.
   - Si está vacío: la primera tarea `TODO` cuyas dependencias estén todas `DONE` (los gates `G0..G5` y `GS` cuentan como `DONE` solo si el dueño lo marcó en el backlog).
   Si las dependencias no están `DONE`, **frená y avisá** cuáles faltan. No improvises.
3. Leé SOLO la sección de esa tarea en `specs/SPEC-*.md`. Cada `AC-n` es un criterio que tiene que quedar cubierto por un test.
4. Pasá la tarea a `DOING` en `tasks/BACKLOG.md`.
5. Escribí primero los tests (comentario `// AC: SPEC-X/AC-n` en cada uno) y después la implementación mínima. No hagas nada fuera del alcance de la tarea.
6. Corré `pnpm verify` hasta que quede en verde. Si algo no se puede cumplir, no lo disimules: registralo en `docs/OPEN-QUESTIONS.md` y en el reporte.
7. Escribí `tasks/reports/<ID>.md` con `tasks/REPORT_TEMPLATE.md` (≤ 60 líneas) y pasá la tarea a `REVIEW` en el backlog.
8. **Frená.** No empieces otra tarea. Respondé con un resumen de máximo 10 líneas: qué hiciste, resultado de `pnpm verify`, y qué tiene que mirar el dueño (según `tasks/OWNER-REVIEW.md`).

Reglas que no se negocian: motor sin DOM ni azar propio, datos solo en `content/`, ninguna primitiva de efectos nueva sin `docs/effect-requests/`, nunca commitear assets descargados, nada de dependencias fuera de la lista. Si una regla del juego no está clara, usá el default de `docs/RULES.md` §5; no inventes.
