# Retirada: cambio solo al inicio del propio turno, sin acciones previas

## Objetivo

Cambiar de PKM activo (`Retire`) solo se puede en MI turno y solo si aún no hice ninguna otra acción en ese turno: no se puede atacar y cambiar, ni curar y cambiar. Cambiar gasta el turno (ya corre el turno del rival en el mismo comando). Además la UI no puede dejar despachar comandos de combate mientras la acción/animación anterior se está resolviendo o reproduciendo (anti doble-click / timing).

## Criterios de aceptación

- **AC-1** (motor, regresión): `Retire` con `turnSide !== 0` (turno del rival) es rechazado con `ILLEGAL_COMMAND`.
- **AC-2** (motor, regresión): después de un `Attack` exitoso no existe turno propio con `Retire` disponible: el ataque termina el turno (turno automático del rival) y el cambio recién se ofrece en el turno siguiente.
- **AC-3** (motor, nuevo): después de `UsePotion` **en combate** (que hoy NO consume el turno, D-11), `Retire` queda ilegal en ese mismo turno: el handler lo rechaza y `legalCommands` deja de ofrecer los botones de retiro.
- **AC-4** (motor, nuevo): la marca de "acción usada este turno" vive en `BattleState` (JSON serializable, p. ej. `actedThisTurn`), se setea con la poción en combate, se limpia al iniciar cada turno propio (`startSideTurn`) y al crear la batalla / reponer tras desmayo; no afecta D-11 (poción + ataque en el mismo turno sigue siendo legal).
- **AC-5** (motor, regresión): un `Retire` exitoso pone `turnSide = 1` y resuelve el turno del rival en el mismo comando (cambiar gasta el turno).
- **AC-6** (UI): mientras el guion de combate está reproduciéndose (`played < script.length`) los botones de acción del popup (pie `data-battle-actions` y menú de la escena) no despachan comandos: quedan deshabilitados o el handler los ignora.
- **AC-7** (UI, anti doble-click): dos clicks casi simultáneos sobre acciones de combate no aplican dos comandos: el segundo se ignora (guard reentrante en `send`/BattlePopup), sin esperar a que termine la animación.
- **AC-8** (reglas): se registra la decisión en `docs/RULES.md` (nueva D-xx: retirar exige turno propio sin acciones previas; ajusta el orden ②pociones→③retirar de p.53-57) y la duda del conflicto con el manual en `docs/OPEN-QUESTIONS.md`.

## Archivos involucrados

- `packages/engine/src/state.ts` — `BattleCore`: nueva marca `actedThisTurn`.
- `packages/engine/src/battle-commands.ts` — `usePotion` (setea la marca en combate), `retire` (la valida); `fightEncounter` inicializa la marca en `false`.
- `packages/engine/src/battle.ts` — `startSideTurn` limpia la marca al arrancar el turno del jugador.
- `packages/engine/src/legal.ts` — `battleCommands`: no ofrecer `Retire` con la marca activa.
- `packages/engine/src/invariants.ts` — invariante de la marca (solo con `turnSide === 0`).
- `apps/web/src/popup/BattlePopup.tsx` y `apps/web/src/popup/model.ts` — gatear acciones del pie y del menú mientras `played < script.length`; guard anti doble-dispatch.
- `apps/web/src/game/PlayScreen.tsx` — `send`: mantener el guard reentrante para comandos de combate.
- Tests: `tests/retirada-solo-inicio-turno.test.ts` (nuevo, motor), `tests/t020-battle.test.ts` y `tests/turno-automatico-rival.test.ts` (regresiones si hace falta ajustarlas), `apps/web/src/popup/model.test.ts`, `apps/web/src/popup/BattlePopup.test.tsx`.
- `docs/RULES.md`, `docs/OPEN-QUESTIONS.md`.

## Plan de pasos

1. Tests primero, uno por AC con `// AC: retirada-solo-inicio-turno/AC-n` (motor en `tests/retirada-solo-inicio-turno.test.ts` con los helpers de `tests/t020-battle.test.ts`; UI en `model.test.ts`/`BattlePopup.test.tsx`).
2. Motor: marca `actedThisTurn` en `BattleCore` + `fightEncounter`/`startSideTurn`/`sendOut` la resetean; `usePotion` en combate la setea; `retire` la rechaza; `legalCommands` deja de ofrecer `Retire`; invariante.
3. UI: `BattlePopup` deshabilita pie y menú mientras el guion no terminó de reproducirse (`played < script.length`, misma señal que fin-de-combate) y agrega guard anti doble-dispatch; `send` queda reentrante-seguro.
4. Actualizar tests existentes que asuman poción→retirar legal o botones activos durante la reproducción.
5. `docs/RULES.md` (nueva D-xx) + `docs/OPEN-QUESTIONS.md` (conflicto con p.53-57).
6. `pnpm verify` verde.

## Comandos de verificación

- `pnpm vitest run tests/retirada-solo-inicio-turno.test.ts tests/t020-battle.test.ts tests/turno-automatico-rival.test.ts apps/web/src/popup/model.test.ts apps/web/src/popup/BattlePopup.test.tsx`
- `pnpm verify`
