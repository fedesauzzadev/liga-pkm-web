# Reporte reemplazo-tras-desmayo — Reemplazo obligatorio tras desmayo
- Estado: REVIEW | Rama/commit: main (working tree, sin commit)
- Resumen (≤ 5 líneas): con el activo propio `fainted` y `pending = ChooseReplacement`,
  `switchOptions()` suma los destinos de `SendOut` como legales (además de `Retire`) y
  `commandOfSelection()` devuelve `SendOut`; `BattleScene` gana la prop `forceSwitch`
  (estado inicial + guard de `selectTab`), que `ChoreographedBattle` pasa y `BattlePopup`
  deriva del pending ⇒ la pestaña inicial es "Cambiar" y la banca sana ofertada queda
  habilitada. El motor ya cumplía AC-4/AC-5/AC-6: solo se agregaron sus tests tageados.
- Archivos clave tocados (rutas):
  - UI: `apps/web/src/battle/controls.ts`, `apps/web/src/battle/BattleScene.tsx`,
    `apps/web/src/battle/ChoreographedBattle.tsx`, `apps/web/src/popup/BattlePopup.tsx`
  - Tests: `apps/web/src/battle/controls.test.ts`, `apps/web/src/battle/BattleScene.test.tsx`
    (jsdom), `apps/web/src/popup/BattlePopup.test.tsx` (jsdom), `packages/engine/src/index.test.ts`
  - Docs: `docs/OPEN-QUESTIONS.md` (Q-099)
  - Motor (`legal.ts`, `battle-core.ts`, `battle-commands.ts`): verificado, SIN cambios
- AC cubiertos → test (reemplazo-tras-desmayo/AC-n → archivo:test):
  - AC-1 → `BattleScene.test.tsx` (tab inicial `switch` con forceSwitch + guard de clic) y
    `BattlePopup.test.tsx` (popup con pending ⇒ pestaña Cambiar seleccionada)
  - AC-2 → `controls.test.ts` (banca sana `legal:true`, `commandOfSelection` ⇒ `SendOut`) y
    `BattlePopup.test.tsx` (`btn-switch-p1-b` habilitado en el flujo real)
  - AC-3 → `controls.test.ts` (muerto sigue `legal:false` con motivo "Debilitado")
  - AC-4 → `packages/engine/src/index.test.ts` (sin banca ⇒ `BattleEnded{lost}`, `pending` null) y
    `BattleScene.test.tsx`/`BattlePopup.test.tsx` (sin forceSwitch ⇒ sin fuerza de pestaña ni SendOut)
  - AC-5 → `packages/engine/src/index.test.ts` (`SendOut`: pending limpio, `active[0]`
    actualizado, `turnSide=0`, `actedThisTurn=false`)
  - AC-6 → `packages/engine/src/index.test.ts` (`Retire` a muerto ⇒ D-07; sin `SendOut`
    fuera del pending; `Advance` sigue legal) y `BattleScene.test.tsx` (cambio libre sin forceSwitch)
- `pnpm verify`: OK (EXIT=0; 169 archivos / 1063 tests passed; depcruise/size-limit/bench OK)
- Decisiones tomadas / defaults aplicados: los tests live del popup usan `reducedMotion`
  (coreografía instantánea) + `waitFor` de 5000 ms porque `speed="skip"` no surte efecto en
  el componente (bug preexistente, Q-099); `BattleScene.test.tsx` pasó a jsdom con
  `renderToString`+`render` (mismo patrón que `EncounterPopup.test.tsx`); sin fila de
  backlog (precedente de fixes por plan: `retirada-solo-inicio-turno`, `no-cambiar-a-muerto`).
- Dudas nuevas (→ OPEN-QUESTIONS.md) y ER solicitados: Q-099 —
  `BattleChoreographer.setReducedMotion` pisa la velocidad elegida (`setOptions('1x', …)`);
  el efecto de `ChoreographedBattle` corre siempre a 1x (medido: `BattleStarted` con
  `speed='skip'` tarda 1918 ms). No se tocó (fuera de alcance); fix propuesto: que `Timing`
  guarde `speed`+`reduced`. Sin ER.
- Riesgos / deuda: sin cambios de motor ni de datos; la animación de reemplazo en sí
  (entrada del nuevo activo) es la ya existente (`PkmSentOut`), no se agregó FX nuevo.
