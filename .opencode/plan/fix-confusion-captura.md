# Arreglar turno del rival tras confusión y cartel de captura tras vencer a un salvaje

## Objetivo

Dos problemas reportados en una pelea contra Abra: (1) tras un auto-golpe por confusión, el jugador percibe que el rival "no tuvo su turno"; (2) al vencer a un salvaje nunca aparece el cartel para capturarlo con una Pokebola. Diagnóstico ya hecho: el motor está correcto (el turno del rival corre dentro del comando `Attack`; con `attackSelect` 6 → `NoAttack` casi invisible); el bug de captura es de UI (`battlePopupKind` cierra el popup tras "Continuar" y `CaptureOrRelease` queda sin interfaz).

## Criterios de aceptación

- AC-1 (motor, regresión): en un test del engine, un ataque del jugador confundido que resulta `SelfHit` ejecuta dentro del MISMO comando el turno completo del rival: eventos `DieRolled attackSelect` + (ataque del rival ó `NoAttack`), y el estado final queda `battle.turnSide === 0` con la confusión `nextTurn` limpiada (una sola vez).
- AC-2 (captura, flujo real): tras vencer a un salvaje (guion con `BattleEnded result 'won'`), al presionar "Continuar" el popup de combate NO se cierra mientras `state.pending.type === 'CaptureOrRelease'`: queda en modo captura.
- AC-3 (captura, acciones): en modo captura el pie del popup muestra "Capturar" (`data-command="Capture"`, solo si hay Pokebolas) y "Dejar ir" (`Release`), según `legalCommands`; ejecutar `Capture` gasta 1 Pokebola, manda al PKM a equipo/Reserva de Oak y cierra el popup (comportamiento motor T-022 ya existente).
- AC-4 (coreografía, selfHit): el FX de un `AttackUsed` cuyo `target` es el propio atacante se dibuja sobre el atacante (hoy `fxPort` asume defensor = lado contrario y el golpe se ve sobre el rival).
- AC-5 (feedback del turno rival): el mensaje de `NoAttack` por `attackSelect` informa el valor del dado (p. ej. "Abra no atacó (sacó 6).") y el dado del rival (`attackSelectValue`) queda visible; la secuencia coreografiada `SelfHit → turno del rival` se reproduce completa en un test de coreografía.
- AC-6: `pnpm verify` verde; sin cambios de reglas del motor (`RULES`/`EFFECTS` intactos).

## Archivos involucrados

- `apps/web/src/popup/model.ts` — `battlePopupKind`: mantener `'battle'` con `pending CaptureOrRelease`.
- `apps/web/src/popup/BattlePopup.tsx` — modo captura tras "Continuar" (hoy `onMenuAction` se omite con `result !== null` y el footer se oculta).
- `apps/web/src/game/PlayScreen.tsx` — `battleScript`/`onContinue` (el flujo `inBattleFlow` ya incluye `CaptureOrRelease`).
- `apps/web/src/battle/choreo/registry.ts` — `playNoAttack` (valor del dado), `playAttackUsed`/`playSelfHit` (target del FX).
- `apps/web/src/battle/ChoreographedBattle.tsx` — `fxPort`: defensor según `target` del evento.
- `apps/web/src/i18n/es.ts` — `battleMsgNoAttackDie` con el valor del dado.
- Tests: `apps/web/src/popup/BattlePopup.test.tsx`, `apps/web/src/game/PlayScreen.test.tsx` (batalla completa vía UI), `apps/web/src/battle/choreo/choreography-attack.test.ts`, `tests/t020-battle.test.ts` (regresión motor selfHit).

## Plan de pasos

1. Test de regresión del motor (AC-1): confusión de Abra (`rollGate selfHit nextTurn`) → jugador ataca → `SelfHit` → verificar eventos del turno del rival en el mismo comando y `turnSide === 0`.
2. Captura (AC-2/AC-3): `battlePopupKind` considera `pending CaptureOrRelease`; `BattlePopup` muestra el pie Capturar/Dejar ir tras el overlay de resultado (Continuar limpia `result` pero no cierra el popup).
3. Coreografía (AC-4/AC-5): propagar `target` al FX para el selfHit; mensaje de `NoAttack` con el valor del dado.
4. Tests de UI/coreografía (AC-2..AC-5) incluyendo el flujo real ganado → Continuar → Capturar.
5. `pnpm verify` + reporte en `tasks/reports/`.

## Comandos de verificación

```
pnpm verify
npx vitest run apps/web/src/popup apps/web/src/battle/choreo apps/web/src/game/PlayScreen.test.tsx tests/t020-battle.test.ts
```
