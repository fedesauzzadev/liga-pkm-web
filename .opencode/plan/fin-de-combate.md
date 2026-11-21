# Fin de combate: overlay tras la coreografía + animación de captura

## Objetivo

Que el cartel de resultado ("Ganaste/Perdiste") aparezca recién cuando la coreografía terminó de reproducir el golpe final (hoy aparece apenas el motor calcula el resultado), y que elegir "Capturar" reproduzca SÍ O SÍ la animación de Pokéball (arco → 3 sacudidas → destello) antes de cerrar el combate. La captura sigue siendo 100% exitosa: el motor no cambia.

## Criterios de aceptación

- **AC-1**: Con `BattleEnded` en el guion pero eventos aún sin reproducir (ej. `AttackUsed`/`DamageTaken`/`PokemonFainted` finales en cola), NO se renderiza `data-testid="battle-result-overlay"`.
- **AC-2**: El overlay aparece solo cuando el coreógrafo reprodujo TODOS los eventos del guion (cola vacía, incluido `BattleEnded`). Con `speed="skip"` o `reducedMotion` la reproducción es instantánea ⇒ overlay inmediato (mismo comportamiento que hoy).
- **AC-3**: El pie de acciones (`data-battle-actions`) se oculta en cuanto `BattleEnded` entra al guion (regla actual, por guion y no por reproducción): sin comandos sobre una batalla ya resuelta mientras corre la animación.
- **AC-4**: Victoria vs salvaje: "Continuar" con `CaptureOrRelease` pendiente NO cierra el popup de combate; la escena queda congelada (sin overlay ni pie) y la decisión sigue viviendo en el TilePanel (D-31 se respeta: el popup no decide).
- **AC-5**: Al elegir "Capturar" (`btn-capture` del TilePanel), el popup reproduce la coreografía `PokemonCaptured` existente sobre la escena aún abierta (`data-capture="arc"` → shakes 1..3 → `data-capture="caught"` + flash + mensaje `es.battleMsgCaptured`) y cierra recién al terminar la reproducción (auto-cierre, sin clic extra).
- **AC-6**: "Dejar ir" (`btn-release`): el popup cierra inmediato, sin animación, y el turno avanza como hoy.
- **AC-7**: La captura sigue siendo determinística ("sí o sí", motor sin cambios): gasta 1 Pokebola, el PKM capturado entra al equipo o a la pila de Oak, `pending` queda null y el turno avanza.
- **AC-8**: Degradado: partida restaurada con `CaptureOrRelease` pendiente y guion vacío (sin escena) ⇒ popup cerrado y Capturar resuelve directo como hoy (no hay escenario sobre el cual animar).

## Archivos involucrados

- `apps/web/src/battle/ChoreographedBattle.tsx` — exponer progreso de reproducción: `onPlayed(played)` tras cada evento (`onDone` ya existe).
- `apps/web/src/popup/BattlePopup.tsx` — overlay de resultado según eventos reproducidos (no según guion); estado "resultado consumido" post-"Continuar" que congela la escena sin overlay mientras pende la captura.
- `apps/web/src/popup/model.ts` — helper puro del resultado por reproducción (ej. `battleResultPlayed(script, played)`); `battlePopupKind` mantiene `'battle'` mientras el guion esté vivo durante la decisión de captura.
- `apps/web/src/game/PlayScreen.tsx` — ciclo de vida del guion: no limpiar en "Continuar" si hay `CaptureOrRelease` pendiente; acumular los eventos de `Capture` (hoy `PokemonCaptured` se descarta en `setBattleScript`); auto-cierre cuando todo está reproducido y no hay batalla/pending; `Release` limpia directo.
- Tests: `apps/web/src/popup/BattlePopup.test.tsx`, `apps/web/src/popup/model.test.ts`, `apps/web/src/game/PlayScreen.test.tsx` (actualizar los AC-2/AC-3 de `popup-solo-en-combate` que hoy exigen popup cerrado tras "Continuar"), `apps/web/src/battle/ChoreographedBattle.test.tsx`.

## Plan de pasos

1. Tests primero, uno por AC (`// AC: fin-de-combate/AC-n`): overlay diferido con fake timers (`Timing` usa `setTimeout`), overlay inmediato con `speed="skip"`, flujo captura animada y caso degradado (usar `demoBattleScript`/`demoChoreoDeps` de `apps/web/src/battle/demo.ts` y helpers de sesión de `PlayScreen.test.tsx`).
2. `ChoreographedBattle`: emitir `onPlayed(played)` tras reproducir cada evento.
3. `model.ts`: helper puro `battleResultPlayed(script, played)` + ajuste de `battlePopupKind` para el guion vivo en decisión de captura.
4. `BattlePopup`: overlay y `myTurn` según reproducción (AC-1/AC-2/AC-3); prop `resultDismissed` para congelar la escena post-"Continuar" (AC-4).
5. `PlayScreen`: guion sobrevive a "Continuar" con captura pendiente; `PokemonCaptured` se acumula y se reproduce; auto-cierre al terminar (AC-5); `Release` cierra directo (AC-6); restaurado sin guion no abre popup (AC-8). Motor intacto (AC-7).
6. Actualizar tests existentes que codifican el cierre inmediato post-"Continuar".
7. `pnpm verify` verde.

## Comandos de verificación

- `pnpm vitest run apps/web/src/popup/BattlePopup.test.tsx apps/web/src/popup/model.test.ts apps/web/src/game/PlayScreen.test.tsx apps/web/src/battle/ChoreographedBattle.test.tsx`
- `pnpm verify`
