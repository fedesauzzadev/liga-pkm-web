# Reporte dado-de-combate — Dado propio de combate (aparte del de movimiento)
- Estado: REVIEW | Rama/commit: main (sin commitear)
- Resumen (≤ 5 líneas): reviente parcial de T-092/AC-3. El popup de combate muestra su
  propio Die3D en la mesa del dado de la bandeja (battle-die) para attackSelect/gate/
  effect/wake/dodge/bonus; panel-dice queda solo para move/oportunidad. 100 % UI: el
  motor no se toca; la coreografía patchea dieValue/diePurpose en el stage y resetea
  por combate (BattleStarted).
- Archivos clave tocados (rutas):
  - apps/web/src/battle/BattleScene.tsx (+ .module.css) — Die3D en bandeja, props die/dieSpeed/reducedMotion.
  - apps/web/src/battle/choreo/stage.ts — dieValue/diePurpose + BATTLE_DIE_PURPOSES/isBattleDiePurpose.
  - apps/web/src/battle/choreo/registry.ts — playDieRolled patchea el dado; playBattleStarted resetea (AC-5).
  - apps/web/src/battle/ChoreographedBattle.tsx — visualsOf (exportado) mapea die; pasa dieSpeed/reducedMotion.
  - apps/web/src/game/PlayScreen.tsx — isBoardDiePurpose filtra combate fuera de diceRolls.
  - apps/web/src/board/Die3D.tsx — exporta clampDieValue (Face → DieValue).
  - Comentarios actualizados: DicePanel.tsx, GameShell.tsx, Board.tsx, Board3D.tsx, i18n/es.ts.
- AC cubiertos → test:
  - AC-1 → battle/BattleScene.test.tsx (battle-die con propósito/valor en bandeja) + ChoreographedBattle.test.tsx (visualsOf mapea die).
  - AC-2 → game/PlayScreen.test.tsx (isBoardDiePurpose) + choreo/choreography.test.ts (move no toca dado).
  - AC-3 → choreo/choreography.test.ts (patchea die + pausa dieRollMs + fila rival intacta).
  - AC-4 → battle/BattleScene.test.tsx (skip/reducedMotion exponen valor final).
  - AC-5 → choreo/choreography.test.ts (BattleStarted resetea) + BattleScene.test.tsx (mesa vacía).
  - AC-6 → game/PlayScreen.test.tsx (sin battle-die fuera del popup).
  - Ajuste de invariant viejo: hud/dice-panel.test.tsx T-092/AC-3 ahora exige los DOS dados oficiales (DicePanel + BattleScene) y el routing por isBoardDiePurpose.
- `pnpm verify`: typecheck/lint/content:validate/build/deps:check/size/bench OK; tests 970/971 —
  único fallo preexistente y ajeno: manifest-runtime.test.ts (public/models 34,3 MB > 24 MB, Q-090;
  verificado con stash que falla igual sin esta tarea).
- Decisiones tomadas / defaults aplicados: i18n reutiliza hudDice* (nada nuevo); el efecto de
  rodado depende de [dieValue] (rollTo imperativo, igual patrón que panel-dice); dado vacío =
  mesa con data-value="" (sin Die3D); BattleEnded NO limpia el dado (AC-5 exige vacío solo al inicio).
- Dudas nuevas: ninguna (Q-090 ya cubre el fallo de models). ER solicitados: ninguno.
- Riesgos / deuda: tiradas consecutivas con el MISMO valor no re-ruedian el dado (sin nonce en
  stage); visual fino (mesa del dado en 360×640) para OWNER-REVIEW, como el resto de la escena.
