# Rotar 90° en el lugar los PokéMart (kind `market`)

## Objetivo
Girar 90° en sentido antihorario (visto desde arriba) TODOS los edificios PokéMart (kind `market`, los 5 mercados: mercado_l, mercado_t, mercado_2, mercado_b, mercado_r) sin moverlos de su posición, escala ni tamaño actual, para que la puerta de entrada quede mirando al camino. Los demás edificios (gym, pokecenter, league, lab, house) no cambian.

## Contexto técnico (mecanismo ya existente, NO hay que programar nada nuevo)
- `content/board/placements.json › models.yawOffsetDeg` ya existe para esto: "Giro para que la puerta mire al camino" (`_yawNota`). Hoy `market: 0`.
- El solver lo suma al yaw final: `yawDeg = doorYawDeg(...) + yawOffset` en `packages/content/src/placements.ts:330` (cubierto por el test AC-3 de T-091 en `packages/content/src/placements.test.ts:86`).
- La OBB de colisión usa footprint cuadrado (`obbCorners(center, side, yaw)` en `packages/content/src/placements-geometry.ts:16`), así que girar ±90° no cambia la huella ⇒ el solver devuelve las MISMAS posiciones/escalas; solo cambia el yaw. Eso garantiza "rotar en el lugar, sin moverlos".
- Signo: `sceneRotYOf(yawDeg) = (90 − yawDeg)°` (`packages/content/src/landmarks.ts:55`) aplicado a `rotation.y` de three.js, donde positivo = antihorario visto desde arriba ⇒ **antihorario = yawOffsetDeg −90** (+90 sería horario).
- `content/board/models.new.json` es generado por `pnpm models:use-new` leyendo el yaw de `placements.json`; hay que regenerarlo (o editarlo a mano con el mismo valor) para que no queden desincronizados.

## Criterios de aceptación
- [ ] AC-1: `content/board/placements.json › models.yawOffsetDeg.market` queda en `-90`; `gym`, `pokecenter` y `league` siguen en `0` (sin tocar).
- [ ] AC-2: Test del solver con el tablero real: para los 5 nodos `market`, `x`, `z` y `scale` son IDÉNTICOS a los de antes del cambio y `yawDeg` difiere exactamente en −90 (rotación en el lugar). Comentario `// AC: rotar-pokemart-90/AC-2`.
- [ ] AC-3: `content/board/models.new.json › models.market.yawOffsetDeg` queda en `-90` (mismo valor que placements.json). Comentario `// AC: rotar-pokemart-90/AC-3`.
- [ ] AC-4: Verificación visual del dueño en el navegador (`pnpm dev`): los 5 PokéMart quedan con la puerta mirando al camino. Si giraron al revés (horario), cambiar el signo a `+90` en placements.json, regenerar/editar models.new.json y reverificar.

## Archivos involucrados
- `content/board/placements.json` — editar `models.yawOffsetDeg.market`: `0` → `-90` (única edición de datos).
- `content/board/models.new.json` — regenerar con `pnpm models:use-new` (o editar `models.market.yawOffsetDeg` a mano con el mismo valor si `assets-src/new/` no está disponible localmente).
- `tests/rotar-pokemart-90.test.ts` — NUEVO: tests AC-2 y AC-3 (uno por AC, estilo de `tests/models-use-new.test.ts`).
- Solo lectura (referencia, NO modificar): `packages/content/src/placements.ts`, `packages/content/src/landmarks.ts`, `apps/web/src/board3d/placements.ts`.

## Plan de pasos
1. Escribir `tests/rotar-pokemart-90.test.ts` (AC-2 y AC-3) y verificar que fallan en rojo.
2. Editar `content/board/placements.json`: `yawOffsetDeg.market = -90`.
3. Correr `pnpm models:use-new` para regenerar `models.new.json` (fallback: editarlo a mano) y verificar los tests en verde.
4. Verificación visual con el dueño (`pnpm dev`): puerta al camino; si quedó al revés, signo `+90` y repetir 2–3.

## Comandos de verificación
- `pnpm test -- tests/rotar-pokemart-90.test.ts` (o `pnpm vitest run tests/rotar-pokemart-90.test.ts`)
- `pnpm content:validate`
- `pnpm models:use-new` (regenera `content/board/models.new.json`)
- `pnpm verify`
- `pnpm dev` + inspección visual del tablero por el dueño

## Fuera de alcance
Mover edificios de lugar, cambiar tamaños/escalas, tocar gym/pokecenter/league/lab/house, nodos/caminos, cámara/vista, código del solver o del render (el mecanismo ya existe).
