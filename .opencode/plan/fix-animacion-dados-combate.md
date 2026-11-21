# Fix: animación de los dados de combate + pacing realista del guion

## Objetivo
Que las tiradas de dados de combate (mías y del enemigo) se vean rodar y muestren el número que salió antes de que pase lo siguiente, y que la coreografía del popup **espere** cada tirada real en vez de dejar que los resultados aparezcan "calculados por atrás". Cambio 100% de UI/coreografía: el motor no se toca (Animación ≠ lógica).

## Criterios de aceptación
- AC-1: En un combate, cada `DieRolled` de combate (`attackSelect`, `gate`, `effect`, `dodge`, `bonus`, `wake`, `oportunidad` de escena) dispara la tirada completa en el slot correspondiente y, al terminar, el dado expone `data-value` = valor del evento (hoy `BattleDie` arranca con `value={1}` y la cara puede quedar vieja si `rollTo` no corre).
- AC-2: Ambos slots funcionan: el slot enemigo anima `attackSelect`/tiradas del rival y el slot propio las propias; ninguna tirada de combate queda sin animar ni en el slot equivocado (routing `dieSide` incluido).
- AC-3: Sincronización: `playDieRolled` espera la **duración real** de la tirada (misma fórmula que `rollDurationMs(seed, speed)` de `BattleDie` + margen de asentamiento) antes de continuar; ningún evento posterior (`AttackUsed`, `DamageTaken`, `ConditionApplied`, `PokemonFainted`) empieza mientras el dado sigue rodando.
- AC-4: Velocidades alineadas: a `2x` la espera corresponde a la tirada real de `2x` (sin doble escalado con el factor de `Timing`); con `skip` o `reducedMotion` el valor final se muestra instantáneo (comportamiento actual conservado).
- AC-5: Orden visible por ataque: dado (gate/effect) → mensaje "X usó Y" → daño/estado; el número del dado queda visible hasta la próxima tirada (no se pisa ni desaparece).
- AC-6: `packages/engine` sin cambios (eventos, orden, determinismo y replay idénticos); solo archivos de `apps/web`.
- AC-7: Un test por AC con comentario `// AC: fix-animacion-dados-combate/AC-n` y `pnpm verify` verde.

## Archivos involucrados
- `apps/web/src/battle/BattleScene.tsx` — `DieSlot`: guard de nonce/lado, prop `value={1}` fijo, disparo de `rollTo`.
- `apps/web/src/battle/BattleDie.tsx` — `rollTo`, `rollDurationMs`, cara interna (`face`) sincronizada con `value` cuando no rueda.
- `apps/web/src/battle/choreo/registry.ts` — `playDieRolled`: patch del dado y espera `cfg.dieRollMs` fija (800 ms) que no coincide con la tirada real (1600 ms a 1×).
- `apps/web/src/battle/choreo/timing.ts` — `Timing.wait` escala por factor de velocidad; hace falta esperar ms reales de la tirada sin doble escalado.
- `apps/web/src/events/anim.config.ts` — `battle.dieRollMs` (referencia a actualizar o comentar).
- `apps/web/src/battle/ChoreographedBattle.tsx` — `dieSpeed`/`reduced` pasados a `BattleScene` (l.273).
- `apps/web/src/battle/choreo/stage.ts` — `dieValue/diePurpose/dieSide/dieNonce/dieChain` (reset por combate si hace falta).
- Tests: `apps/web/src/battle/BattleDie.test.tsx`, `apps/web/src/battle/BattleScene.test.tsx`, `apps/web/src/battle/choreo/choreography.test.ts` (+ variantes `choreography-attack/confusion/turn`), `apps/web/src/battle/ChoreographedBattle.speed.test.tsx`.

## Plan de pasos
1. Tests primero (uno por AC, `// AC: fix-animacion-dados-combate/AC-n`): ambos slots muestran el valor tras la tirada; `playDieRolled` espera ≥ duración real de `rollPlan`; orden en pantalla dado → ataque → daño; velocidad `2x`/`skip` sin espera doble.
2. Correr los tests en rojo y diagnosticar por qué hoy no rueda ni muestra el número (lado/nonce/prop `value={1}`/espera fija de 800 ms vs tirada de 1600 ms).
3. Arreglar `DieSlot`/`BattleDie`: cara sincronizada con el valor del evento y tirada garantizada en el slot correcto.
4. Sincronizar tiempos: `playDieRolled` espera los ms reales de la tirada (método nuevo en `Timing` si hace falta), dejando `dieRollMs` como respaldo/comentario.
5. Verificar en navegador (`pnpm dev`) un combate a 1× y 2×: se ve rodar el dado propio y el enemigo con su número antes del resultado.
6. `pnpm verify` y reporte en `tasks/reports/`.

## Comandos de verificación
- `pnpm verify`
- `pnpm test -- BattleDie BattleScene ChoreographedBattle choreography`
