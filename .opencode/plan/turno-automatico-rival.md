# Turno automático del rival en combate PvE

## Objetivo
En combates contra la máquina (salvaje/NPC y gimnasio), el turno del rival se ejecuta **automáticamente dentro del mismo comando** que cede el turno (`Attack`, `Retire`, o arranque por AGILIDAD), incluyendo su dado (`attackSelect`). Hoy el motor deja `turnSide = 1` y espera un `Advance` manual del jugador para que el rival actúe: hay que eliminar ese paso y garantizar por invariante que el jugador nunca actúa dos veces seguidas sin que el rival haya tirado su dado.

## Criterios de aceptación
- [ ] AC-1: Un `Attack` que no termina la batalla ni deja decisión pendiente devuelve, en el mismo comando, los eventos del ataque propio + turno completo del rival (inicio → dado `attackSelect` → acción o `NoAttack` → fin) + inicio del turno propio; el estado queda con `turnSide === 0`.
- [ ] AC-2: `Retire` (pierde el ataque) dispara el turno del rival automáticamente en el mismo comando (mismo evento de dado que AC-1).
- [ ] AC-3: Con AGILIDAD (D-02, `startsFirst`), `FightEncounter` y `AcceptGymChallenge` ejecutan el primer turno del rival (dado incluido) dentro del mismo comando que crea la batalla.
- [ ] AC-4: Nueva invariante de motor: `phase === 'battle'` con batalla abierta (`!won`) y sin `pending` ⇒ `turnSide === 0`. Un `Attack` con `turnSide === 1` sigue siendo `ILLEGAL_COMMAND` (hoy ya lo es; ahora ese estado deja de ser observable entre comandos).
- [ ] AC-5: Si el ataque/acción deja `pending` (p. ej. `ChooseReplacement` por KO propio) o termina la batalla (`BattleEnded`, victoria, captura), el rival NO actúa en ese comando (se respeta el flujo vigente: el lado que repone actúa, D-02).
- [ ] AC-6: Gym 2v2: si tu ataque KO al activo del líder y éste repone, el turno del reemplazo corre automáticamente en el mismo comando.
- [ ] AC-7: En la UI desaparece el botón de "turno del rival / continuar" durante el combate; el único `Advance` visible en batalla es "Pasar" en tu turno. La coreografía reproduce en orden toda la secuencia de eventos del comando (tu ataque → dado y ataque del rival); ninguna lógica depende de la animación.
- [ ] AC-8: `Advance` en tu turno (pasar sin atacar) mantiene el comportamiento: corre el turno del rival y te devuelve el turno, todo en el mismo comando (ya lo hace `advanceBattle`; sin regresiones).

## Archivos involucrados
- `packages/engine/src/battle-commands.ts` — `attackCommand`, `retire`, `fightEncounter`, `advanceBattle`; extraer helper `runRivalTurn` (bloque rival de `advanceBattle`: `startSideTurn(1)` → `rivalAction` → `endSideTurn(1)` → `turnSide = 0` + `startSideTurn(0)`, cortando por `won`/`pending`).
- `packages/engine/src/battle.ts` — reuso de `startSideTurn`/`endSideTurn`/`rivalAction` (acá podría vivir el helper).
- `packages/engine/src/gyms.ts` — `acceptGymChallenge` (arranque con AGILIDAD).
- `packages/engine/src/invariants.ts` — registrar la invariante de AC-4.
- `packages/engine/src/legal.ts` — `battleCommands`: la rama `turnSide === 1` queda como red de seguridad (comentar el cambio).
- `packages/engine/src/index.test.ts` — un test por AC con comentario `// AC: turno-automatico-rival/AC-n`.
- `apps/web/src/popup/model.ts` y `apps/web/src/popup/model.test.ts` — quitar la distinción "turno del rival" en `battleActions`.
- `apps/web/src/popup/BattlePopup.test.tsx` — actualizar AC-2 de SPEC-I/T-075.
- `apps/web/src/game/PlayScreen.test.tsx` — flujo de batalla que hoy envía `Attack` + `Advance`.
- `apps/web/src/i18n/es.ts` — retirar `popupBattleRivalTurn` si queda sin uso.
- `specs/SPEC-C-battle.md` y `specs/SPEC-I-hud-and-camera.md` — actualizar los ACs afectados (turno del rival con `Advance`).

## Plan de pasos
1. Tests primero en `packages/engine/src/index.test.ts` a partir de AC-1..AC-8.
2. Extraer `runRivalTurn` del bloque rival de `advanceBattle` (sin duplicar lógica).
3. Llamarlo al final de `attackCommand` y `retire` cuando queden batalla abierta, `pending === null` y `turnSide === 1`.
4. Llamarlo en `fightEncounter` y `acceptGymChallenge` cuando `rivalStarts` (AGILIDAD, D-02).
5. Registrar la invariante AC-4 en `invariants.ts`.
6. UI: simplificar `battleActions`/i18n y actualizar tests de popup y PlayScreen.
7. Actualizar los ACs de `SPEC-C-battle.md` y `SPEC-I-hud-and-camera.md`.
8. `pnpm verify` verde + reporte.

## Comandos de verificación
- `pnpm verify` (typecheck + lint + test + content:validate + build)
- Foco manual: `pnpm test -- packages/engine/src/index.test.ts`
