# BOSS-PROTOCOL — cómo revisa Claude con pocos tokens

## Roles
- **Dueño**: decide producto y reglas dudosas (RULES §5), provee fotos/cartas, aprueba despliegue.
- **Jefe (Claude)**: arquitectura, aprobar primitivas de efectos (ER), revisar gates, resolver ambigüedades técnicas, detectar desvíos.
- **Workers**: cualquier modelo/agente que implemente tareas siguiendo `AGENTS.md`.

## Cuándo se llama al jefe (solo en gates)
G0 tras T-001..T-005 · **GS (spike de animaciones) tras T-032c0, en paralelo con M1** · G1 tras T-010..T-013 · G2 tras T-020..T-024 · G3 tras T-030..T-034 y T-032a..d · G4 tras T-040..T-046 · G5 release. Además: cualquier `ER-xxx` pendiente o duda que bloquee.

## Paquete de revisión (lo que se pega al jefe; objetivo ≤ 6-8k tokens)
1. Salida de `pnpm digest` (árbol + resumen de tests + conteo de TODO/custom + API pública del motor).
2. Los `tasks/reports/T-xxx.md` del gate.
3. Solo los archivos "críticos" del gate (lista por gate, abajo) o su `git diff`; nunca el repo entero.
4. `docs/OPEN-QUESTIONS.md` y `docs/effect-requests/*` nuevos.

Archivos críticos por gate — G0: `packages/content/src/*.ts`, `content/board/kanto.json`(+captura del overlay) · G1: `packages/engine/src/{movement,turn,state}.ts` · G2: `packages/engine/src/battle/*` + tests golden · GS: informe del spike + demo `/dev/fx` · G3: `apps/web/src/events/EventPlayer.ts`, `battle/choreo/*`, `battle/fx/index.ts` · G4: 10 cartas al azar de `content/pokemon` + foto original.

## Prompt de revisión (plantilla)
```
Actuá como jefe del proyecto LIGA PKM Web. Revisá el gate G<n> con AGENTS.md, docs/SDD.md y docs/RULES.md como criterio.
Devolveme: (1) APROBADO / CAMBIOS REQUERIDOS, (2) lista priorizada de problemas con archivo y AC violado,
(3) respuestas a las dudas de OPEN-QUESTIONS, (4) decisión sobre cada ER, (5) instrucciones exactas para el próximo worker (≤ 15 líneas).
Paquete: <pegar>
```

## Prompt para un worker (plantilla)
```
Sos un worker del proyecto LIGA PKM Web. Leé AGENTS.md y luego ejecutá SOLO la tarea <T-xxx> de tasks/BACKLOG.md
siguiendo su spec. Terminá con pnpm verify en verde y el reporte tasks/reports/T-xxx.md. No avances a otra tarea.
```

## Criterios de rechazo automático
Motor con `Math.random`/DOM · stats hardcodeados · primitiva de efecto nueva sin ER · AC sin test · animación que decide un resultado · dependencia no listada · archivos > 400 líneas sin justificación.

## Qué decide el jefe vs. el dueño
Jefe: nombres de primitivas, estructura de estado, ADRs, orden de tareas. Dueño: cualquier decisión D-xx que cambie la sensación de juego, fidelidad al manual, alcance del MVP, publicación.
