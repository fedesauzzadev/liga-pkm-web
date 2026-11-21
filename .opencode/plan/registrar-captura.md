# Registrar la captura: la carta capturada no vuelve a salir del mazo

## Objetivo
Al capturar un PKM salvaje (Pokebola tras vencer, o Ultra/Master Ball en combate), la captura queda registrada EN EL MOMENTO: ninguna copia de esa carta permanece en los mazos, así no vuelve a salir (ni robando por casillero ni invocándola con el botón dev) sin necesidad de refrescar la página.

## Diagnóstico (causa raíz)
- `content/decks.dev.json` trae `abra` ×2 en pantano (dev deck autogenerado). Al capturar, `captureWild` (`packages/engine/src/progression.ts:61`) y `throwBall` (`packages/engine/src/battle-commands.ts:263`) agregan el PKM al equipo/pila de Oak, pero solo la copia robada había salido del mazo: la copia restante queda en `state.decks.pantano` y el motor la sirve otra vez (`debugEncounter` la acepta; el robo de casillero puede sacarla).
- El refresco no "registra" nada distinto: `restoreSession` (`apps/web/src/game/session.ts:100`) reaplica el commandLog y verifica `stateHash` (determinista). La percepción de que el refreso lo arregla viene de la copia restante; removiéndola al capturar, estado vivo y refrescado quedan idénticos.

## Criterios de aceptación
- **AC-1**: `Capture` tras vencer a un salvaje: además del comportamiento actual (gasta Pokebola, PKM a equipo/pila de Oak, turno +1), los mazos que pueden contener PKM salvajes (los 5 de terreno y sorpresa) quedan SIN ninguna copia de la carta capturada, inmediatamente (sin refresco).
- **AC-2**: `ThrowBall` (Ultra/Master durante combate): misma remoción de las copias restantes de `battle.card`.
- **AC-3**: Tras capturar abra, `DebugEncounter { deck: 'pantano', card: 'abra' }` es rechazado con `ILLEGAL_COMMAND` (mensaje actual "no está en el mazo … (¿ya salió?)"). `Release` y la derrota (escapa al fondo) NO remueven copias: solo la captura registra.
- **AC-4**: Replay: reaplicar el commandLog de una partida con captura (camino de `restoreSession`, con `applyCommand` y rng por `rngState`) termina con el MISMO `state.decks` que la partida viva (sin la carta capturada); guardado/carga no diverge.
- **AC-5**: `pnpm verify` verde (incluye tests existentes de probar-encuentro-abra, t022, t049 y golden; ajustar fixtures sin relajar checks).

## Archivos involucrados
- `packages/engine/src/progression.ts` — `captureWild`: remover copias restantes de `pending.card`.
- `packages/engine/src/battle-commands.ts` — `throwBall`: misma remoción para `battle.card`.
- `tests/t022-progression.test.ts` — tests AC-1, AC-3, AC-4.
- `tests/t049-items-sorpresa.test.ts` — test AC-2 (patrón batalla wild existente).
- `docs/OPEN-QUESTIONS.md` — registrar la duda del inicial (D-25: pantano arranca con abra en equipo y su otra copia sigue en el mazo hasta que se capture) y confirmar con el dueño.

## Plan de pasos
1. Tests primero, uno por AC (comentario `// AC: registrar-captura/AC-n`): partida real montana/semilla fija → `DebugEncounter(abra)` → pelear → ganar → `Capture`; en t049 el flujo `ThrowBall` análogo. Verificar `state.decks.pantano` sin abra (uso un fixture con 2 abras, patrón `decks: { ...base.decks, pantano: [...] }`).
2. Helper en el motor (p. ej. `removeWildCopies(draft, cardId)` en `progression.ts`): filtra la carta de los mazos de terreno + sorpresa; llamarlo desde `captureWild` y `throwBall`.
3. Sin evento nuevo ni cambio de UI: `deckCounts` (PlayScreen) ya deriva de `state.decks` y se actualiza solo; el botón dev ya muestra el error del motor.
4. Registrar la duda del inicial en `docs/OPEN-QUESTIONS.md` (fuera de alcance de este fix).
5. `pnpm verify` verde.

## Comandos de verificación
- `pnpm vitest run tests/t022-progression.test.ts tests/t049-items-sorpresa.test.ts packages/engine/src/index.test.ts`
- `pnpm verify`
