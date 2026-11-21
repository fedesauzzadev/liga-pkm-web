# Reporte retirada-solo-inicio-turno — Retirada solo al inicio del turno propio
- Estado: REVIEW | Rama/commit: working tree (sin commit)
- Resumen (≤ 5 líneas): `Retire` exige turno propio sin acciones previas: la poción en
  combate setea `BattleState.actedThisTurn` (D-32) y el handler pasa a rechazar el retiro
  con `ILLEGAL_COMMAND`; `legalCommands` deja de ofrecer los botones. La marca se limpia al
  crear la batalla, en `startSideTurn`/`endSideTurn` del lado 0 y al reponer tras desmayo
  (`SendOut`); D-11 queda intacto (poción + ataque en el mismo turno sigue legal). UI: el pie
  y el menú del popup no despachan mientras `played < script.length` (botones
  `disabled`) y un latch anti doble-dispatch ignora el segundo click casi simultáneo
  (`battleShouldDispatch` + guard reentrante en `send`).
- Archivos clave tocados (rutas):
  - Motor: `packages/engine/src/state.ts`, `battle-commands.ts`, `battle.ts`, `legal.ts`,
    `invariants.ts`, `gyms.ts`
  - UI: `apps/web/src/popup/model.ts`, `apps/web/src/popup/BattlePopup.tsx`,
    `apps/web/src/game/PlayScreen.tsx`
  - Docs: `docs/RULES.md` (D-32 + §4), `docs/OPEN-QUESTIONS.md` (Q-095)
- AC cubiertos → test (retirada-solo-inicio-turno/AC-n → archivo:test):
  - AC-1..AC-5 → `tests/retirada-solo-inicio-turno.test.ts` (uno por AC + invariante
    `batalla/accion-usada-en-turno-propio`)
  - AC-3 (UI) → `apps/web/src/popup/model.test.ts` (pie sin Retire con la marca)
  - AC-6 → `apps/web/src/popup/model.test.ts` (`battleScriptPlaying`) +
    `apps/web/src/popup/BattlePopup.test.tsx` (botones disabled con guion en curso)
  - AC-7 → `apps/web/src/popup/model.test.ts` (`battleShouldDispatch`)
  - AC-8 → `docs/RULES.md` D-32 + `docs/OPEN-QUESTIONS.md` Q-095
- `pnpm verify`: OK (EXIT=0; 165 archivos de test passed; depcruise/size-limit/bench OK)
- Decisiones tomadas / defaults aplicados: la marca también se limpia en `endSideTurn(0)`
  (además de `startSideTurn(0)`/`SendOut`) para que la invariante `actedThisTurn ⇒
  turnSide===0` valga incluso en estados con `ChooseReplacement` pendiente; el latch de la
  UI compara comando estructuralmente + identidad de `state` (dos pociones seguidas siguen
  siendo posibles, D-11).
- Dudas nuevas (→ OPEN-QUESTIONS.md) y ER solicitados: Q-095 (conflicto con el orden
  ②pociones→③retirar de p.53-57 del manual).
- Riesgos / deuda: la Super Poción en combate setea la misma marca (mismo handler); el gateo
  visual del MENÚ de la escena es por handler (los botones del pie sí quedan `disabled`).
