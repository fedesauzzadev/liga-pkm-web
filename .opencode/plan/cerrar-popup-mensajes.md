# Cerrar popup de mensajes (panel de casillero)

## Objetivo
El overlay del panel de casillero (mensajes tras caer en un casillero: "robaste una energía", "acá no tenés nada para hacer"…) queda abierto hasta la próxima tirada y no tiene forma de cerrarse. Agregar un botón "Cerrar" que descarte los mensajes; la decisión pendiente (ChallengeGym/OakSwap) no se cierra con el botón.

## Criterios de aceptación
- **AC-1**: Con mensajes visibles y sin decisión pendiente, el panel muestra un botón "Cerrar" (`data-testid="btn-tile-close"`, label `es.shellTipClose`); al clickearlo el panel desaparece del overlay.
- **AC-2**: Con decisión pendiente (`ChallengeGym`/`OakSwap`), "Cerrar" oculta solo los mensajes: el panel sigue visible con sus botones de decisión (el pending se responde ahí o con Continuar).
- **AC-3**: Al llegar eventos nuevos de casillero (nueva tirada/comando) los mensajes vuelven a mostrarse (el cierre anterior no persists).
- **AC-4**: El error del motor (`role="alert"`) y la nota de reproducción (`isPlaying`) NO se ven afectados por el cierre del panel.

## Archivos involucrados
- `apps/web/src/game/TilePanel.tsx` — botón "Cerrar" + prop `onClose` (presentacional).
- `apps/web/src/game/PlayScreen.tsx` — estado `tileDismissed`, reset al recibir eventos, visibilidad del panel y de `hasOverlay` (~líneas 288, 443-449, 704-712).
- `apps/web/src/game/TilePanel.test.tsx` — tests AC-1/AC-2.
- `apps/web/src/game/PlayScreen.test.tsx` — tests AC-3/AC-4.

## Plan de pasos
1. Tests primero en `TilePanel.test.tsx` (AC-1, AC-2) con comentarios `// AC: cerrar-popup-mensajes/AC-n`.
2. Tests en `PlayScreen.test.tsx` (AC-3, AC-4).
3. `TilePanel.tsx`: prop `onClose`; renderiza el botón solo si `messages.length > 0`.
4. `PlayScreen.tsx`: `tileDismissed` (reset en `sendOnce` junto a `setTileEvents`); panel visible si `(!tileDismissed && messages) || pending !== null`; ajustar `hasOverlay`.
5. `pnpm verify` verde.

## Comandos de verificación
- `pnpm verify`
- `pnpm --filter web test -- TilePanel PlayScreen` (si el filtro aplica; si no, `pnpm verify` alcanza)
