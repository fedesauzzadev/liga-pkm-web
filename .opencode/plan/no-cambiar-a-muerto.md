# No cambiar un PKM vivo por uno muerto

## Objetivo

Garantizar que ningún comando de intercambio (`Retire`, `SendOut`, `SwapWithOak`) permita jamás que un PKM debilitado (`fainted: true`) entre a reemplazar a uno vivo. Hoy `retire` y `sendOut` ya lo validan pero sin tests que lo cubran, y `swapWithOak` no valida nada (solo confía en el invariante de pila sana).

## Criterios de aceptación

- AC-1: `Retire` con `to` = PKM debilitado es rechazado con error `illegal` y el estado queda sin cambios (regresión de la validación existente en `battle-commands.ts:154`).
- AC-2: `SendOut` con `pkmUid` debilitado (dentro o fuera de `pending.options`) es rechazado y el estado queda sin cambios (regresión de `battle-commands.ts:227`).
- AC-3: `SwapWithOak` rechaza el comando si el PKM de la pila está debilitado o dañado; el equipo y la pila quedan idénticos (nueva validación en `tiles.ts`, defensa en profundidad además del invariante `casillero/pila-de-oak-sana`).
- AC-4: Ningún test nuevo rompe los invariantes existentes (`pnpm test` verde) y no se registra ningún evento de intercambio cuando el comando es rechazado.
- AC-5: Cada AC tiene su test con comentario `// AC: no-cambiar-a-muerto/AC-n` en `packages/engine/src/index.test.ts`.

## Archivos involucrados

- `packages/engine/src/tiles.ts` — `swapWithOak` (agregar validación del PKM entrante, líneas 267-291).
- `packages/engine/src/battle-commands.ts` — `retire` (139) y `sendOut` (211): validaciones ya existentes, no se modifica lógica.
- `packages/engine/src/index.test.ts` — tests de regresión (uno por AC).
- `packages/engine/src/invariants.ts` — solo lectura/referencia (`casillero/pila-de-oak-sana`, línea 188); no se cambia.

## Plan de pasos

1. Escribir los 3 tests de rechazo (AC-1, AC-2, AC-3) construyendo estados de batalla/casillero Oak con un reemplazo debilitado.
2. Agregar en `swapWithOak` la validación: si el PKM de la pila tiene `fainted` o `damage > 0`, devolver `illegal` (AC-3).
3. Correr `pnpm verify` y confirmar verde.
4. Reporte en `tasks/reports/` según template si la tarea existe en el backlog; si no, anotar en el PR/descripción.

## Comandos de verificación

- `pnpm exec vitest run packages/engine/src/index.test.ts`
- `pnpm verify`
