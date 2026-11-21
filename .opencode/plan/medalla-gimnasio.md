# Medalla al ganar un gimnasio + aviso de gimnasio ya ganado

## Objetivo

Al ganar un duelo de gimnasio, el juego te dice "¡Ganaste la Medalla {medal}!" (con el líder/gimnasio) y muestra la imagen de la insignia. Al caer en un gimnasio ya ganado, avisa "Ya ganaste este gimnasio" (hoy se resuelve en silencio como `TileResolved none`).

## Criterios de aceptación

- AC-1: Al ganar un duelo de gimnasio, el overlay de resultado (`BattleResultOverlay` en `popup/BattlePopup.tsx`) muestra, junto al texto de victoria existente, el bloque de medalla: "¡Ganaste la Medalla {medal}!" + nombre del líder (de `content/gyms.json` vía `leaderNameOf`) + `<img>` del sprite de la insignia (`data-testid="gym-medal-img"`). Todo deriva del evento `MedalWon` del guion (nada depende de la animación).
- AC-2: Al aterrizar en un gimnasio cuya medalla el jugador ya tiene, `resolveTile` emite un evento nuevo `GymAlreadyWon` (player, gym) en lugar del `TileResolved none` silencioso; `tileEventMessage` (`game/TilePanel.tsx`) muestra "Ya ganaste este gimnasio" y el historial lo registra (caso nuevo en `i18n/event-log.ts` + `hud/history.ts`).
- AC-3: Pipeline de assets: `tools/assets.ts` + `tools/assets.config.json` descargan los 8 sprites de insignias a `apps/web/public/badges/` y generan el manifest `badges.json` ({medal → ruta}); `.gitignore` cubre `apps/web/public/badges`; fuentes y licencias se registran en `docs/ASSETS.md`.
- AC-4: Fallback sin red: si el manifest no tiene la insignia, el overlay muestra un disco CSS con el color de `decor.medalColors` + nombre de la medalla (`data-testid="gym-medal-fallback"`); el build y `content:validate` siguen verdes sin los archivos descargados.
- AC-5: Textos nuevos centralizados en `apps/web/src/i18n/es.ts` (español rioplatense); nombres de medalla/líder salen del contenido, sin hardcodeos.
- AC-6: `pnpm verify` verde; un test por AC (engine: `GymAlreadyWon`; UI: overlay con medalla, fallback, mensaje de TilePanel, `eventToLog`).

## Archivos involucrados

- `packages/engine/src/events.ts` — nuevo tipo `GymAlreadyWon` en la unión `GameEvent`.
- `packages/engine/src/tiles.ts` — `resolveTile` caso `gym`: emitir `GymAlreadyWon` si `player.medals.includes(node.gym)` (líneas ~215-233).
- `packages/engine/src/index.ts` — export del tipo.
- `packages/engine/src/index.test.ts` — test de aterrizaje en gimnasio ya ganado.
- `apps/web/src/game/TilePanel.tsx` — `tileEventMessage`: caso `GymAlreadyWon`.
- `apps/web/src/game/TilePanel.test.tsx` — test AC-2.
- `apps/web/src/i18n/es.ts` — `battleResultMedal`, `tileMsgGymAlreadyWon`, `historyGymAlreadyWon`.
- `apps/web/src/i18n/event-log.ts` + `event-log.test.ts` — caso `GymAlreadyWon`.
- `apps/web/src/hud/history.ts` — `GymAlreadyWon: 'system'`.
- `apps/web/src/popup/model.ts` — función pura `battleMedal(script)` que extrae `{ gym, medal }` del `MedalWon` del guion + test.
- `apps/web/src/popup/BattlePopup.tsx` — bloque de medalla en el overlay (texto + `<img>` + fallback); usa `leaderNameOf` ya existente.
- `apps/web/src/popup/BattlePopup.test.tsx` — tests AC-1/AC-4.
- `apps/web/src/popup/popup.module.css` — estilos del bloque y del fallback.
- `apps/web/src/game/PlayScreen.tsx` — pasar manifest de badges al popup.
- `tools/assets.ts` + `tools/assets.config.json` — sección `badges` (8 insignias, fuente configurable tipo PokeAPI) + manifest `badges.json`.
- `.gitignore` — `apps/web/public/badges`.
- `docs/ASSETS.md` — fuentes/licencias de las insignias.

## Plan de pasos

1. Engine: agregar `GymAlreadyWon` en `events.ts`, emitirlo en `resolveTile` cuando la medalla ya está ganada, exportar el tipo y testear.
2. Mensaje UI: strings en `es.ts`, caso en `tileEventMessage` (TilePanel), `event-log.ts` y `history.ts`, con sus tests.
3. Assets: extender `tools/assets.ts`/config con las 8 insignias, manifest `badges.json`, `.gitignore` y `docs/ASSETS.md`; correr `pnpm assets` y verificar los 8 archivos.
4. Overlay: `battleMedal(script)` en `popup/model.ts` + test; bloque de medalla en `BattleResultOverlay` (texto con líder + `<img>` con fallback CSS); estilos; cablear manifest y líder desde `PlayScreen`.
5. Tests UI (AC-1/AC-4) y `pnpm verify` completo.

## Comandos de verificación

```
pnpm assets
pnpm verify
pnpm --filter @liga/web test -- popup
pnpm --filter @liga/engine test
```
