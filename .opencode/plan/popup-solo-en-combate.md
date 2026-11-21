# Popup de combate solo en combate/intercambio + caja sin ampliar más chica y sin solaparse

## Objetivo
El popup "Combate / Intercambio" queda abierto solo mientras hay un combate activo (`state.battle !== null`), resultado sin confirmar (T-108) o intercambio de Oak. La decisión de captura (`CaptureOrRelease`) pasa al panel de casillero (TilePanel), como ya hace `FightOrRelease`. Además, la caja normal (sin ampliar) se achica y deja de solaparse con el HUD.

## Contexto / reproducción (e2e temporal, ya eliminado)
- Ganar batalla salvaje → "Continuar" → popup queda abierto en modo captura con escena vacía: título "Combate / Intercambio", texto "¡Se acerca un PKM!" y botones Capturar/Dejar ir sin ningún PKM (comportamiento introducido por `fix-confusion-captura/AC-2`, hoy revertido por decisión del dueño).
- Recargar (Continuar partida) con `CaptureOrRelease` pendiente o a mitad de batalla: mismo popup vacío (el restore no re-emite eventos ⇒ `battleScript = []` ⇒ escena sin actores).
- Caja normal actual (`x=0.53, y=0.033, w=0.44, h=0.78`): a 1280×720 ocupa 678–1241 × 24–586 px y pisa history/backpack (columna derecha desde x=0.829) y teamTab/team (desde y=0.7266).

## Criterios de aceptación
- AC-1: `battlePopupKind` NO abre el popup por `pending.type === 'CaptureOrRelease'`; solo por `state.battle !== null`, `resultPending !== null` (T-108 se conserva) u `oakOpen`/`OakSwap`. Test unitario en `apps/web/src/popup/model.test.ts`.
- AC-2: Al vencer un salvaje y presionar "Continuar", el popup se CIERRA y el TilePanel muestra la decisión con el nombre del PKM ("¿Capturar a {name}?") con botones Capturar (solo si hay Pokebolas) y Dejar ir; Capture gasta la Pokebola y suma el PKM; Dejar ir devuelve la carta al fondo del mazo; en ambos casos el panel se cierra y el turno avanza. Test de flujo real en `apps/web/src/game/PlayScreen.test.tsx` (actualiza el test `fix-confusion-captura/AC-2`).
- AC-3: Al "Continuar" una partida guardada con captura pendiente, el popup queda cerrado y el TilePanel muestra la decisión (sin "¡Se acerca un PKM!" ni popup vacío). Test de render con sesión restaurada.
- AC-4: Caja normal nueva `x=0.40, y=0.05, w=0.42, h=0.66` en `content/ui/layout.json` (minW/minH y `expanded` sin cambios): a 1280×720 es ~538×475 px (antes 563×562, ~13% menos área) y NO se superpone con ningún panel del HUD en 1280×720 ni en el mínimo 1024×600 (márgenes: ≥0.009 contra la columna derecha x=0.829 y ≥0.016 contra teamTab y=0.7266). Test puro sobre `layout.json` (bounds vs. panels) en `apps/web/src/shell/layout.test.ts`.
- AC-5: Sin regresión T-075: con batalla activa el popup abre con la escena; con `OakSwap` pendiente o btn-oak abre el intercambio; con `BattleEnded` sin Continuar mantiene el overlay de resultado.
- AC-6: `pnpm verify` verde; tests que afirmaban el popup en modo captura (`BattlePopup.test.tsx`, `PlayScreen.test.tsx`, `GameShell.test.tsx` si toca caja normal) actualizados; registrar la decisión que revierte `fix-confusion-captura/AC-2` como entrada nueva en `docs/RULES.md` (tabla D-xx, "confirmado dueño").

## Archivos involucrados
- `apps/web/src/popup/model.ts` — `battlePopupKind`: quitar rama `CaptureOrRelease`.
- `apps/web/src/game/PlayScreen.tsx` — `tilePending` incluye `CaptureOrRelease` (con card); `inBattleFlow` de `setBattleScript` se reduce a `battle !== null`; pasar Pokebolas/decisiones al TilePanel.
- `apps/web/src/game/TilePanel.tsx` — `TilePending` suma `{ type: 'CaptureOrRelease'; card: string }`; botones Capturar/Dejar ir (Capturar gated por Pokebolas); título/prompt con nombre del PKM.
- `apps/web/src/i18n/es.ts` — textos nuevos (ej. `tileCapturePrompt`) en español rioplatense.
- `content/ui/layout.json` — caja normal de `battlePopup`.
- Tests: `apps/web/src/popup/model.test.ts`, `apps/web/src/popup/BattlePopup.test.tsx`, `apps/web/src/game/PlayScreen.test.tsx`, `apps/web/src/shell/layout.test.ts`, `apps/web/src/game/TilePanel.test.tsx` (si existe; si no, cubrir desde PlayScreen).
- `docs/RULES.md` — entrada D-xx de la decisión.

## Plan de pasos
1. Tests primero (AC-1..AC-5) con comentarios `// AC: popup-solo-en-combate/AC-n`; actualizar los tests que hoy esperan lo contrario.
2. `model.ts`: sacar `CaptureOrRelease` de `battlePopupKind` (dejar comentario de la decisión + referencia a la entrada D-xx).
3. `PlayScreen.tsx` + `TilePanel.tsx` + `es.ts`: mover la decisión de captura al TilePanel; simplificar `inBattleFlow`.
4. `layout.json`: caja normal `x=0.40, y=0.05, w=0.42, h=0.66` (expanded intacto).
5. `docs/RULES.md`: registrar la decisión (supera `fix-confusion-captura/AC-2`).
6. `pnpm verify` + reporte.

## Comandos de verificación
- `pnpm verify` (typecheck + lint + test + content:validate + build)
- `npx vitest run apps/web/src/popup apps/web/src/game/PlayScreen.test.tsx apps/web/src/shell` (iteración rápida)

## Fuera de alcance
- Recargar a mitad de batalla sigue abriendo el popup (hay batalla activa) con escena vacía ("¡Se acerca un PKM!" + Pasar): sembrar la escena desde `state.battle` al montar sin guion es una mejora aparte (registrar en `docs/OPEN-QUESTIONS.md` si el dueño la quiere).
- El popup normal puede solaparse con `popup-card` (transitorio, no HUD); no se trata acá.
