# Fix sprites de líderes de gimnasio y pokémon en combate de gimnasio

## Objetivo
Reparar la feature de sprites de líderes de gimnasio (T-112) introducida con errores por otros LLMs: el build está roto, el sprite del líder se solapa con el pokémon rival, faltan sprites de 4 líderes y el mensaje de aparición sale con nombre vacío.

## Diagnóstico (verificado)
1. **Error de TypeScript (bloquea `pnpm verify`)** — `apps/web/src/battle/ChoreographedBattle.tsx:290` referencia `trainers` que no existe en el módulo (`TS2304: Cannot find name 'trainers'`, confirmado con `tsc`). Además la prop `spritesOverride` de `ChoreographedBattle` quedó con el tipo viejo (`SpritesManifest`) mientras `BattleScene` espera `{ sprites, trainers }`.
2. **Pokémon rival "bugeado" (solapamiento)** — `BattleScene.tsx:377-384`: el `SpriteSlot` del líder usa `side="rival"` ⇒ hereda la clase CSS `.rival` (misma posición `top: 6%; right: 8%; width: 42%`) ⇒ el GIF del líder se dibuja encima del pokémon rival. Duplica además `data-side="rival"` (el `fxPort` resuelve targets con `querySelector('[data-side=…]')`) y `stage.trainerAppeared` nunca vuelve a `null` (no hay evento de retiro) ⇒ el líder queda solapado todo el combate.
3. **Faltan sprites de 4 líderes** — `tools/assets.config.json` (líneas 164-168) solo lista brock, misty, koga y giovanni; `content/gyms.json` define 8 líderes (faltan surge, erika, sabrina, blaine) ⇒ `trainerUrl` devuelve `null` para esos gimnasios y se ve la caja fallback.
4. **Nombre vacío en el mensaje** — `choreo/registry.ts:113`: `api.deps.cardOf(trainerId)` busca una carta de *pokémon*; los líderes viven en `content/gyms.json` con `name` ⇒ `trainerName = ''` ⇒ el textbox muestra " aparece.".

## Criterios de aceptación
- [ ] AC-1: `npx tsc --noEmit -p apps/web` da verde (sin referencia a `trainers` rota); el override de sprites se arma con sprites + trainers reales (o no se pasa, dejando que `BattleScene` use `useSprites()`).
- [ ] AC-2: En combate de gimnasio el líder y el pokémon rival se ven SIMULTÁNEAMENTE, cada uno en su slot, sin solaparse (slot dedicado `.trainer` en `BattleScene.module.css`, con `data-side` propio que no compita con los del `fxPort`).
- [ ] AC-3: `trainerAppeared` se limpia cuando el evento lo indica (p. ej. al enviar al primer pokémon / `RivalSentOut`), de modo que el líder no quede pegado todo el combate.
- [ ] AC-4: Los 8 líderes de `content/gyms.json` tienen entrada en `tools/assets.config.json` y en `trainers.json` tras `pnpm assets`; los 4 faltantes (surge, erika, sabrina, blaine) bajan con sprite front.
- [ ] AC-5: El mensaje de aparición muestra el nombre real del líder (resuelto desde `content/gyms.json`, p. ej. extendiendo `BattleChoreoDeps` con `leaderNameOf` o equivalente), nunca " aparece.".
- [ ] AC-6: Un test por AC (comentario `// AC: fix-sprites-lideres-gimnasio/AC-n`) cubriendo: compilación/passthrough del override, render sin solapamiento (dos slots distintos con posiciones diferentes), limpieza de `trainerAppeared`, manifest con 8 líderes, y nombre en el mensaje.
- [ ] AC-7: `pnpm verify` verde (typecheck + lint + test + content:validate + build + deps:check + size + bench).

## Archivos involucrados
- `apps/web/src/battle/ChoreographedBattle.tsx` — fix de la referencia rota y del tipo/passthrough de `spritesOverride`.
- `apps/web/src/battle/BattleScene.tsx` — SpriteSlot del líder con side/`data-side` propio.
- `apps/web/src/battle/BattleScene.module.css` — clase `.trainer` (posición propia, sin pisar `.rival`).
- `apps/web/src/battle/choreo/stage.ts` — deps: resolución de nombre de líder (`leaderNameOf`).
- `apps/web/src/battle/choreo/registry.ts` — `playTrainerAppeared` usa `leaderNameOf`; limpieza en `RivalSentOut`.
- `apps/web/src/battle/choreo/BattleChoreographer.ts` — cablear nuevo dep (si hace falta).
- `apps/web/src/popup/BattlePopup.tsx` / `apps/web/src/game/GameApp.tsx` — proveer el dep nuevo donde se arma `BattleChoreoDeps`.
- `tools/assets.config.json` — agregar surge, erika, sabrina, blaine.
- `apps/web/public/sprites/trainers.json` — regenerado por `pnpm assets` (no se commitea; ver `docs/PRIVACY-DEPLOY.md`).
- Tests: `apps/web/src/battle/BattleScene.test.tsx`, `apps/web/src/battle/choreo/choreography.test.ts` (o archivos nuevos `*.test.tsx` junto a los tocados).
- `docs/ASSETS.md` — registrar fuente/licencia de los sprites de trainer (PlayShowdown, ya usada para los otros 4).

## Plan de pasos
1. Fix `ChoreographedBattle.tsx`: eliminar la referencia a `trainers`; dejar que `BattleScene` use `useSprites()` o pasar ambos manifests con tipos correctos.
2. `BattleScene.tsx` + CSS: slot `.trainer` con `data-side="trainer"` y posición propia (zona rival, sin solaparse con `.rival`).
3. `registry.ts` + `stage.ts` + deps: `leaderNameOf` para el mensaje y limpieza de `trainerAppeared` en `RivalSentOut`.
4. `tools/assets.config.json`: agregar los 4 líderes faltantes; correr `pnpm assets` (regenera `trainers.json` + GIFs).
5. Tests por AC (paso previo ideal: escribirlos primero según el flujo de AGENTS.md).
6. `pnpm verify` + reporte en `tasks/reports/`.

## Comandos de verificación
- `npx tsc --noEmit -p apps/web --incremental --tsBuildInfoFile node_modules/.cache/tsc/web.tsbuildinfo`
- `pnpm assets` (regenera `apps/web/public/sprites/trainers.json` con 8 líderes)
- `pnpm test -- --run apps/web/src/battle` (suites de battle)
- `pnpm verify`
