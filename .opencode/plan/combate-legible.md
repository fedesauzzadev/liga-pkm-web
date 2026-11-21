# Combate legible: pacing de mensajes y tiradas de confusión visibles

## Objetivo

Que una pelea se entienda: (1) los mensajes duran lo suficiente para leerse, (2) un atacante confundido se ve tirar DOS dados (1 para ver si se auto-ataca, 1 para elegir con qué ataca) cada uno explicado, y (3) la placa de estados refleja la confusión en vivo (hoy "decía" que no estaba confundido y al atacar tiraba el gate). Diagnóstico: el motor está correcto (tira `attackSelect` + `gate` y evalúa el gate al atacar); todo es de coreografía/UI: `messageMs: 300`, dos `DieRolled` mudos que parchean el mismo dado sin mensajes, y conditions del stage congeladas al entrar el PKM (`toStageActor` solo corre en entrada; `ConditionApplied`/`ConditionCleared` no actualizan el actor).

## Criterios de aceptación

- AC-1 (pacing): `ANIMATION_CONFIG.battle.messageMs` sube a un valor legible (≥ 800 ms a 1×) y las esperas por mensaje de la coreografía lo usan; test verifica la nueva pausa por mensaje y `specs/SPEC-D-ui.md` (presupuesto de turno T-032d/AC-2) se actualiza al nuevo presupuesto o se registra la excepción en `docs/OPEN-QUESTIONS.md`.
- AC-2 (gate anunciado): antes de reproducir un `DieRolled purpose 'gate'` de un atacante confundido (jugador o rival), el chat muestra un mensaje que explica la tirada con nombre y caras (p. ej. "X está confundido: con 1-2-3 se auto-ataca") y el dado queda visible con `diePurpose 'gate'`; test de coreografía lo cubre para ambos lados.
- AC-3 (dos tiradas distinguibles): el turno de un rival confundido coreografía DOS tiradas separadas y explicadas (dado `attackSelect` con su valor → mensaje del gate → dado `gate` con su valor); test de coreografía verifica que el stage pasa por `diePurpose 'attackSelect'` y luego `'gate'` con un mensaje entre ambas.
- AC-4 (placa en vivo): `ConditionApplied`/`ConditionCleared` actualizan las conditions del actor en el stage (al menos `confused`/`noAttackGate`/`skip`), así el ícono "Conf" del HpPlate aparece al aplicarse y desaparece al limpiarse sin esperar un sendOut; test: tras `ConditionApplied confused` el actor del stage tiene `rollGate.outcome 'selfHit'` y tras `ConditionCleared` ya no.
- AC-5 (integración): guion real del motor (jugador con Abra confunde al rival → turno rival con selfHit → rival re-confunde al jugador): la secuencia coreografiada muestra cada paso en orden legible y el estado final de la placa del jugador indica "Conf" al comenzar su turno; sin cambios en `packages/engine`.
- AC-6: `pnpm verify` verde; textos nuevos centralizados en `apps/web/src/i18n/es.ts`; motor intacto (regresiones de `tests/t020-battle.test.ts` siguen pasando sin edits).

## Archivos involucrados

- `apps/web/src/events/anim.config.ts` — `messageMs` (300 → ≥ 800) y revisión de pausas vecinas (typewriter tope, dieRollMs).
- `apps/web/src/battle/choreo/registry.ts` — `playDieRolled` (mensaje por propósito), anuncio del gate, `playConditionApplied`/`playConditionCleared` (actualizar actor del stage).
- `apps/web/src/battle/choreo/stage.ts` — helpers para conditions del actor y flag de atacante confundido en el stage.
- `apps/web/src/battle/choreo/BattleChoreographer.ts` — `patchActor` extendido a `conditions` si hace falta.
- `apps/web/src/i18n/es.ts` — `battleMsgGateAnnounce` (y variantes por lado/propósito si corresponde).
- Tests: `apps/web/src/battle/choreo/choreography-attack.test.ts` (+ nuevo `choreography-confusion.test.ts` si conviene), `apps/web/src/battle/HpPlate.test.tsx`, tests de presupuesto/timing que afirmaban 300 ms.
- `specs/SPEC-D-ui.md` — presupuesto de turno T-032d/AC-2; `docs/OPEN-QUESTIONS.md` solo si queda excepción.

## Plan de pasos

1. Tests primero (AC-2/AC-3/AC-4): coreografía del turno de un rival confundido y de un jugador confundido, con guion real generado por el motor (carta de Abra del content).
2. Timing (AC-1): subir `messageMs` y pausas afectadas; actualizar tests de presupuesto y SPEC-D (o registrar excepción).
3. Coreografía: mensajes por propósito del dado + anuncio del gate; `ConditionApplied`/`ConditionCleared` actualizan el actor del stage.
4. Textos en `i18n/es.ts` (español rioplatense).
5. Test integrador (AC-5), `pnpm verify` y reporte en `tasks/reports/combate-legible.md`.

## Comandos de verificación

```
pnpm verify
npx vitest run apps/web/src/battle apps/web/src/popup tests/t020-battle.test.ts
```
