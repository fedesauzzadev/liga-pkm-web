# Capturar/Dejar ir dentro del popup de combate + captura más lenta

## Objetivo

Tras vencer a un PKM salvaje, la decisión "Capturar"/"Dejar ir" debe aparecer dentro del popup de combate (escena congelada tras "Continuar"), no en el TilePanel lateral ("popup aparte a la izquierda"). Además, la coreografía de captura (arco, sacudidas, destello) se reproduce más lenta.

## Criterios de aceptación

- [ ] AC-1: Con `pending.type === 'CaptureOrRelease'` y resultado consumido (`resultDismissed`, escena congelada), el `BattlePopup` muestra un pie con "¿Capturar a {name}?" y los botones **Capturar** y **Dejar ir** dentro del popup.
- [ ] AC-2: El `TilePanel` ya no renderiza la decisión `CaptureOrRelease` (título prompt ni botones `btn-capture`/`btn-release`); el resto de pendings (ChallengeGym, OakSwap) queda intacto.
- [ ] AC-3: "Capturar" solo se ofrece con `items.pokeball > 0` (D-12); sin stock solo se ofrece "Dejar ir".
- [ ] AC-4: Los botones despachan `{ type: 'Capture' }` / `{ type: 'Release' }` vía el `onCommand` existente; sin cambios en `packages/engine`.
- [ ] AC-5: Sin captura pendiente el popup se comporta igual que hoy (overlay de resultado + "Continuar", sin pie de captura).
- [ ] AC-6: Animación de captura más lenta: en `anim.config.ts`, `captureArcMs` 420→700, `captureShakeMs` 220→400, `captureFlashMs` 320→500; las keyframes CSS (`ballArc`, `ballShake`, `ballCaught` en `BattleScene.module.css`) quedan sincronizadas con esos valores (mismas duraciones, sin hardcodear valores distintos).
- [ ] AC-7: Partida restaurada con captura pendiente (`fin-de-combate/AC-8`, `fix-combate-refresco/AC-5`): la decisión aparece en el popup (tests actualizados de TilePanel → popup).
- [ ] AC-8: `pnpm verify` verde (typecheck + lint + test + content:validate + build).

## Archivos involucrados

- `apps/web/src/popup/BattlePopup.tsx` — pie de captura (derive de `state.pending` + `own.items.pokeball`, sin props nuevas salvo necesidad).
- `apps/web/src/popup/BattlePopup.test.tsx` — tests AC-1/AC-3/AC-5.
- `apps/web/src/popup/popup.module.css` — estilos del pie de captura (si hace falta).
- `apps/web/src/game/TilePanel.tsx` — eliminar rama `CaptureOrRelease` (D-31 se revierte).
- `apps/web/src/game/TilePanel.test.tsx` — quitar/ajustar tests de captura.
- `apps/web/src/game/PlayScreen.tsx` — wiring y comentarios (D-31 → decisión en popup).
- `apps/web/src/game/PlayScreen.test.tsx` — actualizar `fin-de-combate/AC-7`, `AC-8`, `popup-solo-en-combate/AC-2`, `fix-combate-refresco/AC-5`.
- `apps/web/src/events/anim.config.ts` — nuevos tiempos de captura.
- `apps/web/src/battle/BattleScene.module.css` — duraciones de `ballArc`/`ballShake`/`ballCaught`.
- `apps/web/src/i18n/es.ts` — reutilizar `tileCapturePrompt`/`battleCapture`/`battleRelease` (o claves nuevas si el texto cambia).
- Referencias a `popup-solo-en-combate` en `docs/` y comentarios — actualizar nota de decisión (D-31).

## Plan de pasos

1. Tests primero: BattlePopup (AC-1, AC-3, AC-5), TilePanel sin captura (AC-2), PlayScreen flujo completo + restore (AC-4, AC-7).
2. BattlePopup: con `resultDismissed && state.pending.type === 'CaptureOrRelease'` renderizar pie con prompt + botones; gating por pokeballs; dispatch via `onCommand`.
3. TilePanel: eliminar rama `CaptureOrRelease` y `captureName`.
4. PlayScreen: ajustar wiring/comentarios; verificar que el popup siga montado con captura pendiente (guion sobrevive, D-31).
5. `anim.config.ts`: 700/400/500 ms; sincronizar keyframes CSS de `BattleScene.module.css`; actualizar tests de timing afectados.
6. Actualizar specs/docs que citan `popup-solo-en-combate/AC-2` (decisión ahora en el popup).
7. `pnpm verify` + reporte `tasks/reports/` si corresponde por backlog.

## Comandos de verificación

```powershell
pnpm verify
# Tests focalizados (iteración rápida):
pnpm vitest run apps/web/src/popup/BattlePopup.test.tsx apps/web/src/game/TilePanel.test.tsx apps/web/src/game/PlayScreen.test.tsx
```
