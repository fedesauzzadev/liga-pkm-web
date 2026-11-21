# Reporte sync-estado-combate — Sincronizar estado del motor con la animación de combate
- Estado: REVIEW | Rama/commit: working tree (sin commit)
- Resumen (≤ 5 líneas): El popup de combate arma los actores desde el snapshot del
  PREFIJO ya reproducido del guion (no del estado final): PlayScreen retiene el estado
  pre-comando del primer lote (`battleView`), lo actualiza al estado final cuando la cola
  termina (`onScriptDone`) y lo suelta al limpiar el guion. El motor queda intacto
  (animación ≠ lógica); la escena sigue reconstruyéndose solo desde eventos.
- Archivos clave tocados (rutas):
  - `apps/web/src/popup/model.ts` (presentationActorOf/presentationRivalEntry + battleViewAfterCommand/AfterScriptDone)
  - `apps/web/src/popup/BattlePopup.tsx` (prop `viewState`, deps/team desde el prefijo)
  - `apps/web/src/game/PlayScreen.tsx` (snapshot `battleView` + wiring a `viewState`)
  - Tests: `apps/web/src/popup/BattlePopup.test.tsx`, `apps/web/src/battle/ChoreographedBattle.test.tsx`, `apps/web/src/game/PlayScreen.test.tsx`
- AC cubiertos → test (sync-estado-combate/AC-n → archivo:test):
  - AC-1 → BattlePopup.test.tsx "el PKM que entra no llega golpeado" (flujo real
    Retire→Psíquico 40, semilla 1; verificado rojo sin snapshot).
  - AC-2 → BattlePopup.test.tsx "presentationActorOf/presentationRivalEntry leen el
    prefijo" + PlayScreen.test.tsx "battleViewAfterCommand/AfterScriptDone".
  - AC-3 → BattlePopup.test.tsx "guion completo: HP de la escena == estado final".
  - AC-4 → BattlePopup.test.tsx "skip y reducedMotion: instantáneo, mismo estado final"
    (orden evento→visual: playQueue, cubierto en fin-de-combate/AC-1,AC-2).
  - AC-5 → BattlePopup.test.tsx "bloqueo durante el guion y overlay solo al terminar".
  - AC-6 → ChoreographedBattle.test.tsx "el dado de combate rueda legible a 1x".
- `pnpm verify`: OK (typecheck, lint, 179 archivos/1148 tests, content:validate, build,
  deps:check, size-limit 35.39/200 kB y 433.04/450 kB, bench OK).
- Decisiones tomadas / defaults aplicados: mecanismo = "retener el snapshot" (opción b
  del plan §2): `viewState` (prefijo) alimenta actorOf/rivalEntry y el team de la escena;
  el estado final queda como fallback SOLO para actores creados en el lote en curso (rival
  del BattleStarted, que nace sin daño en el prefijo). Ítems/firstTurn/activeUid siguen
  del estado final (datos de control, bloqueados mientras corre el guion). AC-6 no
  requirió cambios de tiempos: dieRoll ya espera la duración real (dieTiming), se cubrió
  con test de no-adelanto a 1x.
- Dudas nuevas: ninguna. ER solicitados: ninguno.
- Riesgos / deuda: el TeamStrip del HUD sigue leyendo el estado final durante el guion
  (fuera del alcance del spec: la presentación de combate es el popup); una sesión
  concurrente edita PlayScreen.test.tsx (cerrar-popup-mensajes) — verify corrido con su
  versión final ya en verde.
