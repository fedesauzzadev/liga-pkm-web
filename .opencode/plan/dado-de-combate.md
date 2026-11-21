# Dado propio de combate (aparte del dado de movimiento)

## Objetivo
Cada combate PKM muestra su **propio dado integrado** en la escena de combate (popup), que reproduce las tiradas de combate (`attackSelect`, `gate`, `effect`, `wake`, `dodge`, `bonus`). El dado del tablero (`panel-dice`) queda solo para movimiento (`move`) y `oportunidad`. Reviente parcial de T-092/AC-3 (que había centralizado el único dado en el HUD). Cambio 100% UI: el motor no se toca (Animación ≠ lógica).

## Criterios de aceptación
- AC-1: Con un combate abierto, la bandeja de `BattleScene` (mesa del dado: carta propia + dado + carta rival) muestra un dado `Die3D` que **rueda** al valor de cada `DieRolled` de propósito de combate y expone `data-testid="battle-die"` con propósito (`data-purpose`) y valor (`data-value`).
- AC-2: Separación de rutas: los eventos de combate NO alimentan `DicePanel` (panel-dice) y `DieRolled{purpose:'move'}` NO toca el dado de combate. `oportunidad` sigue en panel-dice.
- AC-3: La coreografía alimenta el dado: `playDieRolled` patchea el stage con `{valor, propósito}` de combate y mantiene la pausa `dieRollMs`; `attackSelectValue` (fila rival iluminada) se conserva igual que hoy.
- AC-4: Skip / `reducedMotion` muestran el valor final sin animación (mismo comportamiento que panel-dice).
- AC-5: El dado de combate arranca vacío en cada combate nuevo (stage reset) y conserva la última tirada visible mientras dura el combate.
- AC-6: Sin combate activo la UI queda idéntica a hoy (el dado de combate solo existe dentro del popup de combate).

## Archivos involucrados
- `apps/web/src/battle/BattleScene.tsx` — nuevo dado en la bandeja (props: valor/propósito).
- `apps/web/src/battle/BattleScene.module.css` — mesa del dado en `.tray` (ya existe la zona, AC-1 de T-032a).
- `apps/web/src/battle/choreo/stage.ts` — visual `dieValue`/`diePurpose` en el stage.
- `apps/web/src/battle/choreo/registry.ts` — `playDieRolled` patchea el dado de combate.
- `apps/web/src/battle/ChoreographedBattle.tsx` — pasa el visual del stage a `BattleScene`.
- `apps/web/src/game/PlayScreen.tsx` — enruta: tiradas de combate → solo popup; `move`/`oportunidad` → `DicePanel`.
- `apps/web/src/i18n/es.ts` — reutiliza `hudDice*` existentes (solo si falta alguna etiqueta).
- Comentarios que afirman "único dado visible" (GameShell.tsx, DicePanel.tsx, Board.tsx, layout.ts) → actualizar.
- Tests: `apps/web/src/battle/BattleScene.test.tsx`, `apps/web/src/battle/choreo/choreography.test.ts`, `apps/web/src/battle/ChoreographedBattle.test.tsx`, `apps/web/src/game/PlayScreen.test.tsx`.

## Plan de pasos
1. Tests primero (uno por AC, `// AC: dado-de-combate/AC-n`): BattleScene dado propio, routing en PlayScreen, coreografía patchea el dado.
2. Stage + registry: `playDieRolled` patchea `dieValue`/`diePurpose`; reset por combate.
3. `BattleScene`: montar `Die3D` + propósito + valor en la mesa del dado de la bandeja.
4. `PlayScreen`: filtrar propósitos de combate fuera de `diceRolls` (panel-dice).
5. Actualizar comentarios/i18n y correr verificación.

## Comandos de verificación
- `pnpm verify`
- `pnpm --filter web test -- BattleScene PlayScreen choreography ChoreographedBattle`
