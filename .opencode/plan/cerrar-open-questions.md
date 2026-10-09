# Cerrar preguntas abiertas de OPEN-QUESTIONS

## Objetivo
Recorrer las 10 preguntas en estado `abierta` de `docs/OPEN-QUESTIONS.md` (Q-003, Q-006, Q-007, Q-008, Q-014, Q-015, Q-016, Q-017, Q-018, Q-019), registrar la respuesta del dueño en cada una y propagar las decisiones de reglas confirmadas. Tarea de documentación/decisiones: sin cambios de código acá.

## Criterios de aceptación
- [ ] Las 10 preguntas abiertas tienen respuesta registrada del dueño (confirmar default o cambiarla).
- [ ] Cada Q respondida queda con estado `resuelta por dueño (fecha)` y la decisión en su línea de `docs/OPEN-QUESTIONS.md`.
- [ ] Las decisiones que son reglas de producto (Q-007, Q-008, Q-015, Q-016, Q-017, Q-018) se agregan a la tabla D-xx de `docs/RULES.md`.
- [ ] Las Q de tooling/infra (Q-003, Q-014, Q-019) quedan cerradas con la opción confirmada (default aplicado o alternativa).
- [ ] Q-006 queda cerrada con la decisión de licenciamiento (uso privado confirmado o plan de reescritura FX T-032c1).
- [ ] Si alguna respuesta contradice un default ya implementado en `packages/engine`, se registra tarea de seguimiento en `tasks/BACKLOG.md` (no se cambia código en esta tarea).
- [ ] `pnpm verify` queda verde.

## Archivos involucrados
- `docs/OPEN-QUESTIONS.md` (actualizar estado y respuesta de cada Q)
- `docs/RULES.md` (nuevas filas D-xx con las reglas confirmadas)
- `tasks/BACKLOG.md` (solo si hacen falta tareas de seguimiento por respuestas que cambien un default)
- `docs/ASSETS.md` (solo si Q-006 cambia la condición de uso privado)

## Plan de pasos
1. Armar listado de las 10 Q abiertas con su default aplicado y qué tarea/código la implementa hoy.
2. Sesión de decisiones con el dueño: presentar cada Q, registrar confirmación o cambio.
3. Actualizar `docs/OPEN-QUESTIONS.md`: estado `resuelta por dueño (fecha)` + decisión en cada línea.
4. Agregar las reglas confirmadas como D-xx en `docs/RULES.md`.
5. Si una respuesta invalida un default implementado, crear tarea de seguimiento en `tasks/BACKLOG.md`.
6. Correr `pnpm verify` y confirmar verde.

## Comandos de verificación
- `pnpm verify`
