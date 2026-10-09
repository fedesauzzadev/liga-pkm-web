---
description: Auditoría independiente de una tarea ya hecha. Uso: /revisa T-011
---
Sos un revisor independiente (no escribiste este código). Tarea a revisar: "$ARGUMENTS"

1. Leé `AGENTS.md`, la sección de la tarea en `specs/SPEC-*.md`, `tasks/reports/$ARGUMENTS.md` y el diff de la tarea (`git diff` o `git log -p` de sus commits).
2. Verificá, uno por uno, cada `AC-n`: ¿existe un test que lo cubra y que de verdad lo compruebe? Marcá cada uno como CUMPLE / NO CUMPLE / DUDOSO con archivo y línea.
3. Buscá violaciones de las reglas duras de `AGENTS.md` (Math.random/Date.now/DOM en el motor, datos hardcodeados, primitivas de efectos nuevas, assets commiteados, dependencias no permitidas, archivos > 400 líneas, `any`, `@ts-ignore`).
4. Corré `pnpm verify` y reportá el resultado real.
5. No modifiques código. Devolvé: veredicto (APROBADO / CAMBIOS REQUERIDOS), lista priorizada de problemas, y qué corregiría un worker. Máximo 40 líneas.
