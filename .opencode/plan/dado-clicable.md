# Fix: el dado del panel-dice no se puede tirar haciendo click

## Objetivo
Que hacer click en el dado de `panel-dice` tire el dado (envía `RollMove`) cuando es legal. Diagnóstico verificado con repro e2e a 1x: `btn-roll` de panel-turn existe y funciona, pero el dado de T-092 nunca fue clickeable (la tarea que lo movió del mundo al HUD perdió la interacción; `onRollRequest` quedó muerto en `Board.tsx:117`) y el rótulo "Tirá el dado para moverte." invita a un click que no hace nada.

## Criterios de aceptación
- [ ] AC-1: Con `canRoll` (organize sin pending), el dado de panel-dice es clickeable: un botón `data-testid="btn-roll-die"` con `data-command="RollMove"` que al click llama a `onRoll` (una vez; mismo comando que btn-roll).
- [ ] AC-2: Con `canRoll=false` NO hay botón en panel-dice y el click no dispara `RollMove` (el panel queda informativo, AC-4 de T-092 intacto: no bloquea clics fuera de su caja).
- [ ] AC-3: `btn-roll` de panel-turn sigue existiendo y funcionando; ambos camisos llaman al mismo `send({ type: 'RollMove' })`.
- [ ] AC-4: e2e (extensión de `e2e/t092-dice.mjs` o clic directo en el dado): click en `btn-roll-die` produce la tirada del motor (`move-hint` muestra el valor forzado y panel-dice actualiza `data-value`).
- [ ] AC-5: `pnpm verify` verde.

## Archivos involucrados
- `apps/web/src/hud/DicePanel.tsx` — props nuevas `canRoll`/`onRoll`; envolver el dado en un `<button>` accesible solo cuando `canRoll` (aria-label `es.hudRollButton`, sin texto nuevo de i18n).
- `apps/web/src/hud/dice-panel.module.css` — reset del botón (sin borde/fondo, cursor pointer, hereda layout actual del dado).
- `apps/web/src/hud/dice-panel.test.tsx` — tests AC-1/AC-2 (render con props; click dispara `onRoll`; sin canRoll no hay botón).
- `apps/web/src/game/PlayScreen.tsx` — cablear `canRoll={canRoll(state)}` y `onRoll={() => send({ type: 'RollMove' })}` al DicePanel.
- `apps/web/src/game/PlayScreen.test.tsx` — SSR: panel-dice contiene `btn-roll-die` con `data-command="RollMove"` (AC-3, junto al btn-roll existente).
- `e2e/t092-dice.mjs` — clickear `btn-roll-die` en lugar de (o además de) `btn-roll` para cubrir AC-4.

## Plan de pasos
1. Tests primero: `dice-panel.test.tsx` (AC-1, AC-2) y aserción SSR en `PlayScreen.test.tsx` (AC-3).
2. `DicePanel.tsx`: envolver `Die3D` en un botón cuando `canRoll`; sin `canRoll` el render queda igual que hoy.
3. CSS: reset del botón envolvente (mismo tamaño/posición del dado).
4. `PlayScreen.tsx`: pasar `canRoll`/`onRoll`.
5. Extender `e2e/t092-dice.mjs` para clickear el dado (AC-4) y correr la suite.

## Comandos de verificación
- `pnpm test -- dice-panel`
- `pnpm test -- PlayScreen`
- `node e2e/t092-dice.mjs`
- `pnpm verify`
