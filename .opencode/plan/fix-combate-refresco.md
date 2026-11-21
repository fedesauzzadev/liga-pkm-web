# Reanudar combate tras refrescar la página

## Objetivo

Al refrescar el navegador en medio de una pelea y continuar la partida, el popup de combate queda congelado (sin PKM en escena, sin poder avanzar ni salir). La causa: la escena se reconstruye SOLO desde el guion de eventos (`battleScript`), que es estado de React no persistido; al restaurar, `restoreSession` no re-emite eventos históricos (`apps/web/src/game/session.ts:96`) y el popup monta con guion vacío sobre un stage inicial vacío (`createStage()` en `apps/web/src/battle/choreo/stage.ts:101`).

Corregirlo reconstruyendo la escena desde el estado ya persistido (`state.battle`): presentación, sin tocar el motor ni el formato del save.

## Criterios de aceptación

- [ ] AC-1: Continuar una partida restaurada con `state.battle !== null` monta el popup de combate con los PKM visibles (activo del jugador y primer rival no desmayado), su HP/daño actual y el `kind` correcto (`wild`/`gym`), sin animaciones de entrada (estado instantáneo, "mismo punto").
- [ ] AC-2: La escena reanudada acepta los comandos legales del motor (`legalCommands`) según turno/lado; tras despachar uno, el guion acumula los eventos nuevos y el combate sigue fluyendo normal.
- [ ] AC-3: Combate de gimnasio reanudado muestra al entrenador/líder en la zona rival (`trainerAppeared`); el salvaje no muestra trainer.
- [ ] AC-4: Si al restaurar hay `pending: ChooseReplacement` (activo desmayado), la pestaña "Cambiar" forzada funciona tras la reanudación.
- [ ] AC-5: Sin regresión: restaurar con batalla terminada y captura pendiente (`battle === null` + `CaptureOrRelease`) sigue resolviendo directo por el TilePanel con popup cerrado (fin-de-combate/AC-8), y el flujo normal (sin refresco) no cambia.
- [ ] AC-6: `pnpm verify` verde.

## Archivos involucrados

- `apps/web/src/battle/choreo/stage.ts` — snapshot puro de reanudación derivado de `state.battle` (o nuevo `apps/web/src/battle/choreo/resume.ts` si conviene por tamaño).
- `apps/web/src/battle/ChoreographedBattle.tsx` — prop para stage inicial (modo reanudar, sin animar).
- `apps/web/src/popup/BattlePopup.tsx` — pasar el snapshot cuando `script` está vacío y `state.battle !== null`.
- `apps/web/src/popup/model.ts` — helper de decisión si hace falta (puro, testeable).
- `apps/web/src/game/PlayScreen.tsx` — inicializar la escena al montar con sesión restaurada.
- Tests: `apps/web/src/battle/ChoreographedBattle.test.tsx`, `apps/web/src/popup/BattlePopup.test.tsx`, `apps/web/src/game/PlayScreen.test.tsx`.

## Plan de pasos

1. Tests primero: un test por AC (comment `// AC: fix-combate-refresco/AC-n`) usando una sesión restaurada con batalla en curso (replay de comandos real vía `restoreSession`, storage inyectado).
2. Implementar el builder puro `resumeStage(state, deps)` → `BattleStage` con actores/kind/trainer desde `state.battle` (serializable, sin `Math.random`/tiempo).
3. Cablear: `PlayScreen`/`BattlePopup`/`ChoreographedBattle` usan el snapshot como stage inicial cuando el guion está vacío en una batalla viva.
4. `pnpm verify` + reporte en `tasks/reports/`.

## Comandos de verificación

```bash
pnpm test                # vitest run (tests nuevos por AC)
pnpm verify              # typecheck + lint + test + content:validate + build + deps:check + size + bench
```
