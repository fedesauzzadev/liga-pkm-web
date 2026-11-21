# Reemplazo obligatorio tras desmayo (fix: no puedo cambiar a un vivo)

## Objetivo

Cuando matan a tu Pokémon activo con banca viva, el jugador tiene que poder
elegir (y obligatoriamente) un reemplazo sano; hoy la pestaña "Cambiar" no
habilita a ningún vivo y no se puede aceptar. Si no queda banca sana, el
combate termina (ya funciona en el motor y hay que conservarlo). Un vivo
nunca se puede cambiar por un muerto.

## Criterios de aceptación

- **AC-1**: con el activo propio `fainted` y `pending = ChooseReplacement`, la
  escena fuerza la pestaña "Cambiar" (tab inicial `switch`) mientras dure el
  reemplazo pendiente.
- **AC-2**: en ese estado, cada opción de banca **sana** sale
  `legal: true` y "Aceptar" despacha `{ type: 'SendOut', pkmUid }` con el uid
  elegido (hoy solo se reconocen comandos `Retire`, por eso está bugeado).
- **AC-3**: los Pokémon **derrotados** de la banca siguen deshabilitados con
  motivo "Debilitado": no se puede reponer con un muerto.
- **AC-4**: si no hay banca sana, el motor emite `BattleEnded{lost}` y no hay
  `ChooseReplacement`: la UI no muestra la fuerza de pestaña ni opciones de
  reemplazo.
- **AC-5**: tras aceptar el `SendOut`, se limpia `pending`, el nuevo activo
  entra en `battle.active[0]` y el combate sigue con mi turno
  (`turnSide = 0`, `actedThisTurn = false`).
- **AC-6**: sin regresiones del cambio voluntario: `Retire` hacia un muerto
  sigue rechazado por el motor ("el reemplazo debe estar sano (D-07)") y el
  resto de pestañas (Atacar/Mochila/Dejar ir) se comporta igual fuera del
  reemplazo pendiente.

## Archivos involucrados

- `apps/web/src/battle/controls.ts` — `switchOptions()` suma los destinos de
  `SendOut` como legales (además de `Retire`); `commandOfSelection()` para
  `kind: 'switch'` devuelve `SendOut` cuando no hay `Retire` correspondiente.
- `apps/web/src/battle/BattleScene.tsx` — nueva prop `forceSwitch?: boolean`:
  con `true` fuerza `tab = 'switch'` (efecto al montar/cuando cambia) y evita
  salir de esa pestaña mientras `pending` siga.
- `apps/web/src/battle/ChoreographedBattle.tsx` — pasa la prop hacia
  `BattleScene`.
- `apps/web/src/popup/BattlePopup.tsx` — deriva
  `forceSwitch = state.pending?.type === 'ChooseReplacement'` y la pasa.
- `packages/engine/src/legal.ts` — solo verificar (`case 'ChooseReplacement'`
  ya devuelve `SendOut` por cada opción sana); no debería cambiar.
- `packages/engine/src/battle-core.ts` (`afterFaints`) y
  `packages/engine/src/battle-commands.ts` (`sendOut`) — solo verificar, sin
  cambios.
- Tests: `apps/web/src/battle/controls.test.ts`,
  `apps/web/src/battle/BattleScene.test.tsx`, `apps/web/src/popup/BattlePopup.test.tsx`;
  regresión de motor en `packages/engine/src/index.test.ts` y
  `tests/retirada-solo-inicio-turno.test.ts`.

## Plan de pasos

1. Test rojo en `controls.test.ts`: con `legal = [{ type: 'SendOut', pkmUid }]`
   la banca sana queda `legal: true` y `commandOfSelection` devuelve `SendOut`
   (`// AC: reemplazo-tras-desmayo/AC-2`); el muerto sigue con motivo
   "Debilitado" (AC-3).
2. Arreglar `controls.ts` (`switchOptions` + `commandOfSelection`).
3. Test de escena (AC-1): `forceSwitch` monta en pestaña "Cambiar"; pasar la
   prop por `BattleScene` → `ChoreographedBattle` → `BattlePopup`.
4. Test de motor ya cubierto (AC-4/AC-5): correr `index.test.ts` y
   `retirada-solo-inicio-turno.test.ts`; si falta un AC, agregarlo ahí.
5. Correr `pnpm verify` y dejar verde.

## Comandos de verificación

```bash
pnpm test -- apps/web/src/battle/controls.test.ts apps/web/src/battle/BattleScene.test.tsx apps/web/src/popup/BattlePopup.test.tsx
pnpm test -- packages/engine/src/index.test.ts tests/retirada-solo-inicio-turno.test.ts
pnpm verify
```
