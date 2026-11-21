# Reporte combate-legible — pacing de mensajes y tiradas de confusión visibles
- Estado: REVIEW | Rama/commit: main (sin commit; cambio en working tree)
- Resumen (≤ 5 líneas): sube `messageMs` 300→900 (legible a 1×), el turno de un
  confundido coreografía DOS dados anunciados (attackSelect explicado + gate con
  nombre/caras ANTES de rodar) y `ConditionApplied/Cleared` actualizan las
  conditions del actor del stage, así el ícono "Conf" de la placa vive sin
  esperar un sendOut. Motor intacto: `packages/engine` sin cambios.
- Archivos clave tocados (rutas):
  - `apps/web/src/events/anim.config.ts` (messageMs 900 + comentarios de presupuesto)
  - `apps/web/src/battle/choreo/stage.ts` (actingSide, conditionsAfterApplied/Cleared, confusedAttackerOf)
  - `apps/web/src/battle/choreo/registry.ts` (playDieRolled anunciado, conditions vivas, setActing)
  - `apps/web/src/battle/choreo/BattleChoreographer.ts` (patchActor + conditions)
  - `apps/web/src/battle/choreo/testkit.ts` (deps inyectables + dp/dv en el trace)
  - `apps/web/src/i18n/es.ts` (battleMsgDieAttackSelect, battleMsgGateAnnounce)
  - `specs/SPEC-D-ui.md` (T-032d/AC-2: messageMs 900 y qué mide el presupuesto)
- AC cubiertos → test (combate-legible → archivo:test):
  - AC-1 → choreography-confusion.test.ts:"messageMs ≥ 800…"; EvolveOverlay.test.tsx (presupuesto 2780 ≤ 3500 sigue verde)
  - AC-2 → choreography-confusion.test.ts:"gate del atacante confundido del jugador" (+ lado rival cubierto en AC-3)
  - AC-3 → choreography-confusion.test.ts:"turno del rival confundido" (attackSelect → mensaje → gate)
  - AC-4 → choreography-confusion.test.ts:"conditions del actor viven en el stage" + HpPlate.test.tsx:"conditions vivas"
  - AC-5 → choreography-confusion.test.ts:"guion real del motor" (Abra del content, rng guionado 4-1-4, placa "Conf")
  - AC-6 → `pnpm verify` verde (163 archivos); tests/t020-battle.test.ts sin edits y verde
- `pnpm verify`: OK (exit 0; typecheck+lint+test 163 archivos+content:validate+build+deps:check+size+bench)
  y `npx vitest run apps/web/src/battle apps/web/src/popup tests/t020-battle.test.ts`: 118 tests OK.
- Decisiones tomadas / defaults aplicados:
  - messageMs = 900 (AC pide ≥ 800; 900 da margen de lectura); typewriterMaxMs
    600 y dieRollMs 800 se revisaron y NO cambian (los textos de ataque son
    cortos: 22-25 chars × 24 ms < tope).
  - Anuncio solo para `attackSelect` y `gate`; effect/wake/dodge/bonus siguen
    mudos para no inflar el turno típico (un mensaje extra por dado de efecto
    rompería el presupuesto de SPEC-D/T-032d/AC-2).
  - El rollGate del stage se reconstruye con duration 'nextTurn' (dato que no
    viaja en el evento); es inert para la presentación: se limpia por
    ConditionCleared. Slots sin dato en el evento (poison/shield/…) no se
    parchean (AC-4 pide "al menos confused/noAttackGate/skip").
  - actingSide desempata el anuncio si AMBOS lados están confundidos (se marca
    en BattleStarted/attackSelect/AttackUsed/SelfHit/NoAttack).
  - AC-5: con selfHit, Confusión re-confunde al RIVAL (víctima = atacante, así
    lo resuelve el motor); el guion usa 2 turnos del rival: selfHit primero y en
    el segundo el gate pasa y el rival confunde al jugador (placa "Conf" final).
  - choreography.test.ts (dado-de-combate/AC-3) actualizado: con el anuncio, el
    dado de attackSelect se patchea al rodar (antes el parche era inmediato).
- Dudas nuevas: ninguna (SPEC-D actualizado; sin excepción pendiente en OPEN-QUESTIONS).
- Riesgos / deuda: turnos del rival con dado quedan ~0,9 s más largos a 1×
  (anuncio de attackSelect); los confundidos con 2 dados salen del "típico"
  (documentado en SPEC-D/T-032d/AC-2). es.ts sigue > 400 líneas (deuda Q-036).
