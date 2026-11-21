# Reporte fix-confusion-captura — turno del rival tras confusión y cartel de captura
- Estado: REVIEW | Spec: `.opencode/plan/fix-confusion-captura.md`
- Resumen: motor ya correcto (regresión AC-1 only); bug de captura era `battlePopupKind`
  cerrando el popup tras "Continuar" con `CaptureOrRelease` pendiente. Coreografía: FX del
  selfHit se dibuja sobre el atacante (target del evento) y `NoAttack` por attackSelect
  informa el dado.
- Archivos clave tocados:
  - `apps/web/src/popup/model.ts` (battlePopupKind: pending CaptureOrRelease ⇒ 'battle')
  - `apps/web/src/battle/choreo/registry.ts` + `BattleChoreographer.ts` + `ChoreographedBattle.tsx` (fxPort con target)
  - `apps/web/src/i18n/es.ts` (`battleMsgNoAttackDie` con {n})
  - Tests: `tests/t020-battle.test.ts`, `apps/web/src/popup/BattlePopup.test.tsx`,
    `apps/web/src/game/PlayScreen.test.tsx`, `apps/web/src/battle/choreo/{choreography-attack.test.ts,testkit.ts}`
- AC cubiertos → test:
  - AC-1 → tests/t020-battle.test.ts (selfHit → attackSelect+NoAttack en el mismo Attack, turnSide 0, 1× ConditionCleared)
  - AC-2 → BattlePopup.test.tsx (Continuar ⇒ modo captura) + PlayScreen.test.tsx (flujo real montana/abra)
  - AC-3 → BattlePopup.test.tsx (pie según legalCommands; sin Pokebolas solo Dejar ir) + PlayScreen.test.tsx (Capture gasta bola y cierra)
  - AC-4 → choreography-attack.test.ts (FX target=player en selfHit; rival→player intacto)
  - AC-5 → choreography-attack.test.ts (mensaje con dado + attackSelectValue visible + secuencia completa)
- `pnpm verify`: OK (exit 0; tests 78/78 en los suites de la spec)
- Decisiones: el valor del dado de attackSelect se lee del stage (`attackSelectValue`, seteado
  por el DieRolled previo) porque el evento NoAttack no lo trae; BattleFxPort ganó 3.º param
  `target` (atacante/redirigido) — firmas internas únicamente.
- Dudas nuevas: ninguna. ER solicitados: ninguno.
- Riesgos / deuda: ninguno identificado (sin cambios de reglas; RULES/EFFECTS intactos).
