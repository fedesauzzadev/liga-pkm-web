# Sincronizar estado del motor con la animación de combate

## Objetivo

Ningún efecto del motor (daño, desmayo, condición, tirada) es visible en la UI antes de que su evento del guion se reproduzca. Hoy el estado final se aplica al instante y la animación llega tarde: un cambio a Squirtle lo muestra ya golpeado/muerto sin que se haya visto ningún ataque.

## Contexto (diagnóstico)

- `PlayScreen.sendOnce` (apps/web/src/game/PlayScreen.tsx:200) ejecuta el comando con `applyToSession` y hace `setCurrent(step.value.session)` en el mismo tick: el estado final (Squirtle con daño/desmayado) ya vive en React, mientras los eventos se acumulan en `battleScript` y el popup los reproduce después.
- `BattlePopup.deps.actorOf` (apps/web/src/popup/BattlePopup.tsx:162) lee `stateRef.current` (estado FINAL): cuando el coreógrafo arma la escena a partir de los eventos, cada actor ya llega con `damage`/`fainted` post-ataque → el HP baja (o aparece muerto) antes de reproducir el evento de ataque.
- Los tiempos de dado (`anim.config.ts`, `dieTiming.ts`) agravan la percepción: todo el guion pasa demasiado rápido.
- Invariante existente a respetar: animación ≠ lógica (AGENTS.md). El motor queda intacto; esto es solo presentación.

## Criterios de aceptación

- [ ] AC-1: Al cambiar de Pokémon y el rival atacar, el HP del Pokémon que entra no baja ni aparece desmayado hasta que el evento de daño correspondiente del guion se reproduce en la escena.
- [ ] AC-2: Ningún dato de combate visible (HP, daño, `fainted`, condiciones, tirada de dado) se refleja en la UI antes de que su evento se reproduzca (mientras `battleScriptPlaying` sea true, la presentación muestra el estado del prefijo ya reproducido).
- [ ] AC-3: Al terminar el guion, la UI muestra exactamente el estado final del motor (sin drift residual entre presentación y `state.battle`).
- [ ] AC-4: `skip`, `reducedMotion` y velocidades rápidas resuelven instantáneo pero conservan el orden evento→visual (nada se adelanta).
- [ ] AC-5: El bloqueo de comandos mientras corre el guion y el overlay de resultado solo con guion completo (`fin-de-combate/AC-1`) siguen funcionando igual.
- [ ] AC-6: La tirada de dado de combate es legible a 1x (revisar tiempos de `anim.config.ts`/`dieTiming.ts` si el replay pasa más rápido que lo configurado).
- [ ] AC-7: Cada AC tiene un test con comentario `// AC: sync-estado-combate/AC-n`.

## Archivos involucrados

- `apps/web/src/game/PlayScreen.tsx` — `sendOnce`: aplica estado final antes de que se reproduzca el guion.
- `apps/web/src/popup/BattlePopup.tsx` — `actorOf` lee estado vivo; `played`/`playing`.
- `apps/web/src/popup/model.ts` — `battleScriptPlaying`, helpers de guion.
- `apps/web/src/battle/ChoreographedBattle.tsx` — `playQueue`/`onPlayed` (reproducción por incrementos).
- `apps/web/src/battle/choreo/BattleChoreographer.ts` y `apps/web/src/battle/choreo/stage.ts` — estado de presentación.
- `apps/web/src/battle/dieTiming.ts` y `apps/web/src/events/anim.config.ts` — tiempos de dado/velocidades.
- Tests: `apps/web/src/game/PlayScreen.test.tsx`, `apps/web/src/popup/BattlePopup.test.tsx`, `apps/web/src/battle/ChoreographedBattle.test.tsx`.

## Plan de pasos

1. Test rojo (AC-1): switch Abra→Squirtle con ataque rival en el guion; afirmar que el HP visible no cambia hasta reproducir el evento de daño.
2. Elegir mecanismo de sincronización: la presentación de combate se deriva del prefijo reproducido del guion (p. ej. `actorOf` no consulta el estado final mientras quedan eventos pendientes, o se retiene el snapshot previo hasta `onPlayed` final). Registrar la decisión en el reporte.
3. Implementar en `BattlePopup`/`ChoreographedBattle` (y `PlayScreen` si hace falta retener el snapshot).
4. Tests AC-2..AC-6 (incluye skip/reducedMotion y tiempos del dado).
5. `pnpm verify` + reporte `tasks/reports/`.

## Comandos de verificación

```powershell
pnpm vitest run apps/web/src/popup/BattlePopup.test.tsx apps/web/src/battle apps/web/src/game/PlayScreen.test.tsx
pnpm verify
```
