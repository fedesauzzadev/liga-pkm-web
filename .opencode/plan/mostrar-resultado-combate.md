# Mostrar resultado final del combate antes de cerrar la pantalla

## Objetivo

Cuando termina un combate (victoria o derrota), la ventana de combate se cierra sola apenas `state.battle` pasa a `null` y el jugador no llega a ver "¡Ganaste el combate!" / "Perdiste el combate…" (solo queda en el historial). Mantener la escena abierta con una pantalla de resultado y un botón "Continuar" que la cierra a voluntad del jugador.

## Criterios de aceptación

- AC-1: Al emitirse `BattleEnded` (con `result: 'lost'` o `'won'`), el popup de combate NO se cierra solo; muestra un overlay de resultado con el texto `es.battleMsgLost` o `es.battleMsgWon` correspondiente.
- AC-2: El overlay tiene un botón "Continuar" (nuevo string i18n en `es.ts`); al presionarlo se cierra el popup y el juego sigue en el tablero como hasta ahora.
- AC-3: La coreografía previa se reproduce completa hasta `BattleEnded` (mensaje de debilitamiento + mensaje de resultado visibles); el cierre solo lo dispara el botón, no el fin del script.
- AC-4: El estado derivado que decide el cierre vive en un modelo puro testeable (`popup/model.ts` o similar), sin `Date.now`/timers nuevos obligatorios; los tests cubren: derrota → overlay visible; victoria → overlay visible; tras `onContinue` → popup cerrado.
- AC-5: `pnpm verify` verde (typecheck + lint + test + content:validate + build).

## Archivos involucrados

- `apps/web/src/game/PlayScreen.tsx` — posee `battleScript`, `battleKind` y el montaje de `BattlePopup` (líneas ~195-203, ~500-513); debe diferir el cierre cuando el script terminó en `BattleEnded`.
- `apps/web/src/popup/model.ts` — `battlePopupKind` y modelo puro de visibilidad; agregar lógica de "resultado pendiente de confirmar".
- `apps/web/src/popup/BattlePopup.tsx` — render del overlay de resultado + botón Continuar.
- `apps/web/src/i18n/es.ts` — nuevo string p.ej. `popupBattleContinue: 'Continuar'` (textos existentes `battleMsgWon`/`battleMsgLost` se reutilizan).
- `apps/web/src/popup/popup.module.css` — estilos del overlay (CSS Modules + variables).
- Tests: `apps/web/src/popup/BattlePopup.test.tsx`, test nuevo del modelo en `popup/` (o extensión de existente), `apps/web/src/battle/choreo/choreography.test.ts` si hace falta.

## Plan de pasos

1. Agregar en `PlayScreen` un estado `battleResultShown` (o derivarlo del script: último evento es `BattleEnded`) y pasarle a `BattlePopup` el resultado pendiente junto con un `onContinue` que limpie el script/cierre el popup.
2. En `popup/model.ts`, crear función pura p.ej. `battleResultPending(script): 'won' | 'lost' | null` (lee el último evento del guion) y testearla.
3. En `BattlePopup`, si hay resultado pendiente, renderizar overlay con `battleMsgWon`/`battleMsgLost` + botón "Continuar" (testid `btn-battle-continue`), ocultando el pie de acciones.
4. Agregar string `popupBattleContinue` en `i18n/es.ts` y estilos del overlay en `popup.module.css`.
5. Tests: componente (derrota muestra "Perdiste el combate…", victoria muestra "¡Ganaste el combate!", clic Continuar cierra) + modelo puro.
6. Correr `pnpm verify`; escribir reporte en `tasks/reports/` y actualizar `tasks/BACKLOG.md` (nueva tarea TODO→DOING→REVIEW, id siguiente libre).

## Comandos de verificación

```
pnpm verify
pnpm --filter @liga/web test -- popup
```
