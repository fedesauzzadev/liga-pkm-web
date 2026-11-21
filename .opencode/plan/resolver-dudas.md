# Resolver las dudas abiertas de OPEN-QUESTIONS (Q-021, Q-022)

## Objetivo
Cerrar las únicas 2 dudas en estado `abierta` de `docs/OPEN-QUESTIONS.md` (Q-021: gate GS de T-032c2 + mapeos `officialMove` sin confirmar; Q-022: activación del adaptador Showdown en el combate real), consignando decisiones en los registros del repo. Sin tocar código de combate/FX.

## Criterios de aceptación
- [ ] Q-021 figura `resuelta` en `docs/OPEN-QUESTIONS.md` con fecha, quién decidió y la decisión GS consignada.
- [ ] Q-022 figura `resuelta` o con decisión explícita registrada (migrar BattleScene al stage del shim / parametrizar `pos()` / postergar a G3), con derivación concreta.
- [ ] `tasks/OWNER-REVIEW.md` refleja la decisión GS del spike T-032c0 (ítem de la sección Spike) y es coherente con el ítem de T-032c2.
- [ ] `tasks/BACKLOG.md` queda coherente: fila y nota de gate de T-032c2 según lo decidido; si la decisión de Q-022 es migrar, existe una tarea nueva (ej. T-032e) con dependencias explícitas.
- [ ] La confirmación de los mapeos `officialMoveStatus: "proposed"` queda explícitamente derivada a T-046 (o confirmada por el dueño en esta sesión, si elige validarlos ya).
- [ ] No se modifica código de combate/FX (`apps/web/src/fx/**`, BattleScene): solo docs, tasks y —si aplica— estado de contenido.
- [ ] `pnpm verify` verde.

## Archivos involucrados
- `docs/OPEN-QUESTIONS.md` — Q-021 (línea 25) y Q-022 (línea 26): cierre/consigna.
- `tasks/OWNER-REVIEW.md` — ítem GS del spike T-032c0 (línea 13) e ítem T-032c2 (línea 32).
- `tasks/BACKLOG.md` — fila T-032c2 (línea 35), nota del gate GS (línea 52); tarea derivada nueva si Q-022 ⇒ migrar.
- Solo lectura (evidencia para decidir): `tasks/reports/T-032c0.md`, `tasks/reports/T-032c2.md`, `content/pokemon/_samples.json` (mapeos `proposed`).

## Plan de pasos
1. Releer la evidencia: reportes T-032c0/T-032c2 y el texto de Q-021/Q-022.
2. Q-021: consignar la decisión GS del dueño en `tasks/OWNER-REVIEW.md` (ítem Spike) y cerrar la Q en `docs/OPEN-QUESTIONS.md` con fecha y responsable; dejar constancia de que la confirmación de mapeos vive en T-046.
3. Q-022: registrar la decisión (migrar escena al stage 640×360 / parametrizar `pos()` / postergar a G3); si implica trabajo, crear la tarea derivada en `tasks/BACKLOG.md` con deps y cerrar/actualizar la Q en consecuencia.
4. Ajustar `tasks/BACKLOG.md` (fila T-032c2 y nota del gate GS) para que reflejen lo decidido.
5. Correr `pnpm verify` y confirmar verde.

## Comandos de verificación
- `pnpm verify`
- `pnpm digest` (sanity: estado del repo ≤ 200 líneas)
