# Quitar el tambaleo de la ficha al moverse

## Objetivo

Eliminar el vaivén lateral ("tambaleo", `swayOffset`) de la ficha durante el
movimiento por el tablero. La caminata queda solo con lo actual salvo el sway:
paso lento (`stepMs: 320`), saltos parabólicos (`hopPosition`) y offsets de
reposo (`soloOffset`/slots) se mantienen intactos.

## Criterios de aceptación

- AC-1: `moveTokenAlong` NO aplica offset lateral: la posición de la ficha en
  cada frame es exactamente `hopPosition(from, to, t)` (sin componente
  perpendicular al tramo).
- AC-2: El paso sigue siendo lento e idéntico al actual: `stepMs` 320 a 1×,
  160 a 2×, 0 con `skip`/`reducedMotion` (`stepMsFor` sin cambios).
- AC-3: `swayOffset` y las constantes `BOARD3D.token.swayAmp`/`swayCycles`
  dejan de existir (sin código muerto ni números huérfanos).
- AC-4: El resto del comportamiento de caminata-ficha se conserva: hop
  parabólico con extremos exactos, `onFrame` con la posición del camino,
  reposo con `soloOffset` y slots para 2..5 fichas, 5 colores de peón.
- AC-5: Los tests de sway de `tokens.test.ts` (AC-2/AC-3/AC-8 de
  caminata-ficha) se eliminan o reescriben como "sin vaivén lateral"; el
  resto de la suite pasa sin cambios de comportamiento.

## Archivos involucrados

- `apps/web/src/board3d/tokens.ts` — borrar `swayOffset` (líneas 208-222) y su
  uso en `moveTokenAlong` (líneas 271-273); actualizar doc-comments.
- `apps/web/src/theme/board3d.ts` — borrar `swayAmp`/`swayCycles` (líneas
  240-243) y su comentario.
- `apps/web/src/board3d/tokens.test.ts` — reemplazar tests de tambaleo
  (AC-2 línea 143, AC-3 línea 200, AC-8 línea 228) por el nuevo AC-1/AC-5.

## Plan de pasos

1. Reescribir tests: nuevo test "sin vaivén lateral" (posición == hop en cada
   frame, componente perpendicular 0); borrar tests de sway (AC-2/AC-3/AC-8 de
   caminata-ficha); verificar que el resto queda verde.
2. Sacar el sway de `moveTokenAlong` en `tokens.ts` y borrar `swayOffset`.
3. Borrar `swayAmp`/`swayCycles` de `BOARD3D.token` en `theme/board3d.ts`.
4. Correr verificación completa.

## Comandos de verificación

- `pnpm verify`
- `pnpm --filter @liga/web exec vitest run src/board3d/tokens.test.ts`
