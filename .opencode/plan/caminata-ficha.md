# Caminata lenta con tambaleo y offset de la ficha en el nodo

## Objetivo

Que la ficha del inicial camine entre nodos más lento y con un vaivén lateral
("tambaleo", como si diera pasos), y que en reposo no se pare exactamente en el
centro del nodo sino un poquito hacia afuera, con slots que evitan que hasta 5
jugadores se superpongan en el mismo nodo.

Contexto actual (`apps/web/src/board3d/tokens.ts`): la ficha se mueve con saltos
parabólicos (`hopPosition` + `moveTokenAlong`, `stepMs: 180`) y en reposo una
ficha sola queda en el centro exacto del nodo; solo se corre del centro cuando
hay 2+ fichas (círculo radial de 0,25).

## Criterios de aceptación

- AC-1: El paso es más lento: `BOARD3D.token.stepMs` pasa de 180 a ~320 ms; se
  siguen respetando `2x` (mitad) y `skip`/`reducedMotion` (0 ms, salto directo),
  sin cambiar `stepMsFor`.
- AC-2: Durante cada tramo la ficha se tambalea: vaivén lateral senoidal
  perpendicular a la dirección del tramo (± `swayAmp`), con N ciclos enteros por
  paso (`swayCycles`, mismo N en todos los tramos) para arrancar y terminar en 0
  sin salto visual entre nodos.
- AC-3: El tambaleo acompaña al hop actual (se suma, no lo reemplaza) y termina
  en 0 exacto en cada waypoint y al finalizar el camino.
- AC-4: Con `reducedMotion` o `skip` no hay tambaleo ni vaivén (comportamiento
  actual: teletransporte al destino).
- AC-5: En reposo, una ficha sola NO queda en el centro exacto del nodo: queda a
  `soloOffset` (~0,1) del centro, en dirección determinista según su índice de
  jugador (estable entre renders, sin Math.random).
- AC-6: Con 2..5 fichas en el mismo nodo, cada una ocupa un slot distinto
  alrededor del centro (distribución radial existente generalizada); la distancia
  entre cualquier par de slots es ≥ 2·`baseRadius` (bases sin superponerse).
- AC-7: Los slots soportan hasta 5 jugadores: agregar 5º color a
  `BOARD3D.token.pawnColors` (hoy hay 4) para que el fallback de peón no se
  repita con 5 jugadores.
- AC-8: El vaivén NO alimenta el foco de la cámara (T-076): `onFrame` recibe la
  posición del camino sin el offset lateral del tambaleo, para que la cámara no
  tiemble; el sprite billboard y el idle ambiental (`token.userData.moving`)
  siguen funcionando igual.
- AC-9: Todos los números nuevos viven en `BOARD3D.token` (theme/board3d.ts);
  nada de mágicos en tokens.ts.

## Archivos involucrados

- `apps/web/src/theme/board3d.ts` — constantes: `stepMs`, `swayAmp`,
  `swayCycles`, `soloOffset`, `radialOffset` (ajustar), 5º `pawnColors`.
- `apps/web/src/board3d/tokens.ts` — `hopPosition`/`moveTokenAlong` (tambaleo),
  `tokenTargetPos` (offset solo + slots hasta 5).
- `apps/web/src/board3d/Tokens3D.tsx` — wiring si cambian firmas (pasa índice de
  jugador a `tokenTargetPos` si hace falta).
- `apps/web/src/board3d/tokens.test.ts` — tests nuevos/ajustados (uno por AC).

## Plan de pasos

1. Agregar constantes a `BOARD3D.token` (`stepMs` 320, `swayAmp` ~0,05,
   `swayCycles` 2, `soloOffset` 0,1, 5º color de peón).
2. Escribir tests en `tokens.test.ts` a partir de los AC (tambaleo perpendicular
   y en 0 en extremos, reducedMotion sin vaivén, offset de ficha sola, slots
   2..5 sin superposición, paso 320 ms).
3. Implementar tambaleo en `moveTokenAlong`/`hopPosition`: offset lateral
   senoidal perpendicular al tramo; `onFrame` reporta la posición sin sway.
4. Implementar offset/slots en `tokenTargetPos`: sola → `soloOffset` por índice;
   N ≥ 2 → círculo radial existente (validar distancia mínima con 5).
5. Ajustar `Tokens3D.tsx` si cambian firmas y correr verificación completa.

## Comandos de verificación

- `pnpm verify`
- `pnpm --filter @liga/web exec vitest run src/board3d/tokens.test.ts`
