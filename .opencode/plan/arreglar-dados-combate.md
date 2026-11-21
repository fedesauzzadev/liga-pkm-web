# Fix: dados de ataque ilegibles, que se traban y corren fuera de tiempo

## Objetivo
Que los dados de ataque (mío y del rival) terminen siempre su giro mostrando CLARO el número que salió, y que la siguiente acción del combate (mensaje de ataque, daño, estado, desmayo) recién pase cuando el dado terminó de rodar — como en un tablero real. Cambio 100% UI/coreografía (`apps/web`); el motor no se toca (animación ≠ lógica). Es la continuación de `fix-animacion-dados-combate` (REVIEW): quedaron 4 síntomas.

## Síntomas reportados → sospechosos concretos
- "Giran mal / no se entiende el número": `finalYaw` (BattleDie.tsx) deja la cara final inclinada 17°-87° (a ~87° se ve casi de canto).
- "Se quedan tildados girando": tirada superada/cambio de `speed` a mitad no cierra `rolling`; el disparo vive en un `useEffect` de `DieSlot` (guard de nonce) que ignora el nuevo contexto.
- "Las acciones pasan antes": la espera del coreógrafo (`Timing.dieRoll`) arranca con el patch, pero la animación arranca recién con el efecto de React (≥ 1 frame tarde) ⇒ la espera queda corta.

## Criterios de aceptación
- AC-1: Al terminar cada tirada la cara final mira al frente (orientación alineada a ejes; inclinación final ≤ 15°) y `data-value` = valor del `DieRolled`, en `battle-die-mine` y `battle-die-enemy`.
- AC-2: Toda tirada termina: a los `rollDurationMs(seed, speed) + margen` ms del disparo, `data-rolling='false'` y cara = valor. Cubre tirada superada por otra, tirada encadenada (Doble bofetón), cambio de lado, remonte del popup y cambio de `speed`/`reducedMotion` a mitad de tirada (replanifica o corta al instante; nunca queda girando en el vacío).
- AC-3: Ningún evento posterior al `DieRolled` (`AttackUsed`, `DamageTaken`, `NoAttack`, `ConditionApplied`, `PokemonFainted`…) se ve en pantalla antes de que el dado muestre el valor final: la espera de `playDieRolled` cubre animación real + retardo del efecto + asentamiento.
- AC-4: A `2x` tirada y espera escalan juntas (sin doble escalado); `skip`/`reducedMotion` muestran el valor final al instante, sin giro ni resto visual pendiente.
- AC-5: `packages/engine` sin cambios (eventos, orden, determinismo intactos); solo `apps/web`; sin `Math.random`/`Date.now`.
- AC-6: Un test por AC con `// AC: arreglar-dados-combate/AC-n`, `pnpm verify` verde y verificación manual en navegador de un combate con tiradas propias y del rival a 1x/2x/skip.

## Archivos involucrados
- `apps/web/src/battle/BattleDie.tsx` — `finalYaw`, `rollPlan` (orientación final legible, asentamiento), `rollTo` (terminación garantizada ante supersede/contexto).
- `apps/web/src/battle/BattleDie.module.css` — transición/asentamiento de la cara final.
- `apps/web/src/battle/dieTiming.ts` — duraciones/espera compartidas (margen de disparo-efecto si hace falta).
- `apps/web/src/battle/BattleScene.tsx` — `DieSlot`: disparo por efecto, guard de nonce, reacción a `speed`/`reducedMotion` a mitad de tirada.
- `apps/web/src/battle/choreo/registry.ts` — `playDieRolled`: espera hasta valor visible.
- `apps/web/src/battle/choreo/timing.ts` — `Timing.dieRoll`.
- `apps/web/src/battle/ChoreographedBattle.tsx` — paso de `dieSpeed`/`reduced` (contexto vivo).
- Tests: `apps/web/src/battle/BattleDie.test.tsx`, `BattleScene.test.tsx`, `choreo/{choreography,choreography-attack,choreography-confusion,timing}.test.ts`.

## Plan de pasos
1. Reproducir en navegador (`pnpm dev`, combate con rival `attackSelect` y confusión/gate propio) y confirmar qué sospechoso produce cada síntoma; anotar en el reporte.
2. Tests primero, uno por AC (en rojo): cara final legible y `data-value`; terminación ante supersede/speed/remount; orden dado→acción; escalado 2x/skip.
3. Arreglar `BattleDie`: orientación final alineada (yaw ≤ 15°) y plan de giro legible.
4. Garantizar terminación en `BattleDie`/`DieSlot`: interrupción/replanificación ante supersede y cambio de contexto; `rolling` siempre se cierra.
5. Sincronizar pacing en `registry`/`timing`: esperar hasta que el valor final queda visible (efecto + asentamiento incluidos).
6. Verificar en navegador 1x/2x/skip, correr `pnpm verify` y escribir `tasks/reports/arreglar-dados-combate.md`.

## Comandos de verificación
- `pnpm verify`
- `pnpm vitest run apps/web/src/battle`
- `pnpm dev` → combate manual (dados propio y rival: giro legible, sin trabarse, acción después del giro)
