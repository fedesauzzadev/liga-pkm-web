# Girar 45° a la derecha los PokéMart (kind `market`)

## Objetivo
Girar 45° en sentido horario (a la derecha, visto desde arriba) los 5 edificios PokéMart (kind `market`: mercado_l, mercado_t, mercado_2, mercado_b, mercado_r) a partir de su orientación actual, para que el dueño verifique visualmente si quedan alineados con sus respectivos nodos. SOLO cambia el giro de `market`; ningún otro edificio, tamaño ni posición se toca intencionalmente.

## Contexto técnico (mecanismo ya existente, NO hay que programar nada nuevo)
- Reutiliza el mecanismo de la tarea `rotar-pokemart-90`: `content/board/placements.json › models.yawOffsetDeg` (hoy `market: -90`) se suma al yaw final en `packages/content/src/placements.ts:330` (`yawDeg = doorYawDeg(...) + yawOffset`).
- Signo (ver `packages/content/src/landmarks.ts:55`): positivo = horario (derecha) visto desde arriba ⇒ girar 45° a la derecha = `yawOffsetDeg` **+45** ⇒ `market` pasa de `-90` a **`-45`**.
- **Diferencia clave con rotar-pokemart-90**: girar ±90° una huella cuadrada no cambia la OBB, pero girar 45° SÍ (`obbCorners(center, side, yawDeg)` en `packages/content/src/placements.ts:331` usa el yaw final). El solver puede ajustar levemente posiciones/escalas de market para evitar solapamientos ⇒ NO exigir x/z/scale idénticos.
- `content/board/models.new.json` es generado por `pnpm models:use-new` leyendo el yaw de placements.json; hay que regenerarlo (o editarlo a mano con el mismo valor) para que no queden desincronizados.

## Criterios de aceptación
- [ ] AC-1: `content/board/placements.json › models.yawOffsetDeg.market` queda en `-45`; `gym`, `pokecenter`, `league` y `lab` siguen en `0` (sin tocar).
- [ ] AC-2: Test del solver con el tablero real: los 5 nodos `market` siguen presentes y NINGUNO queda `discarded`, y para cada uno `yawDeg` difiere exactamente en +45 respecto de antes del cambio (comparado contra el mismo placements con `market: -90`). Comentario `// AC: rotar-pokemart-45/AC-2`.
- [ ] AC-3: `content/board/models.new.json › models.market.yawOffsetDeg` queda en `-45` (mismo valor que placements.json). Comentario `// AC: rotar-pokemart-45/AC-3`.
- [ ] AC-4: Verificación visual del dueño en el navegador (`pnpm dev`): los 5 PokéMart giraron 45° a la derecha respecto de su orientación anterior, para evaluar la alineación con sus nodos. Si giraron al revés (izquierda), cambiar el valor a `-135` (≈ +45 con el signo invertido), regenerar/editar models.new.json y reverificar.

## Archivos involucrados
- `content/board/placements.json` — editar `models.yawOffsetDeg.market`: `-90` → `-45` (única edición de datos).
- `content/board/models.new.json` — regenerar con `pnpm models:use-new` (o editar `models.market.yawOffsetDeg` a mano con el mismo valor si `assets-src/new/` no está disponible localmente).
- `tests/rotar-pokemart-45.test.ts` — NUEVO: tests AC-2 y AC-3 (uno por AC, estilo de `tests/rotar-pokemart-90.test.ts`).
- Solo lectura (referencia, NO modificar): `packages/content/src/placements.ts`, `packages/content/src/landmarks.ts`, `apps/web/src/board3d/placements.ts`, `tests/rotar-pokemart-90.test.ts`.

## Plan de pasos
1. Escribir `tests/rotar-pokemart-45.test.ts` (AC-2 y AC-3, baseline `market: -90`) y verificar que fallan en rojo.
2. Editar `content/board/placements.json`: `yawOffsetDeg.market = -45`.
3. Correr `pnpm models:use-new` para regenerar `models.new.json` (fallback: editarlo a mano) y verificar los tests en verde.
4. Verificación visual con el dueño (`pnpm dev`): los 5 PokéMart girados 45° a la derecha; si quedó al revés, valor `-135` y repetir 2–3.

## Comandos de verificación
- `pnpm test -- tests/rotar-pokemart-45.test.ts` (o `pnpm vitest run tests/rotar-pokemart-45.test.ts`)
- `pnpm content:validate`
- `pnpm models:use-new` (regenera `content/board/models.new.json`)
- `pnpm verify`
- `pnpm dev` + inspección visual del tablero por el dueño

## Fuera de alcance
Mover edificios de lugar manualmente, cambiar tamaños/escalas a mano, tocar gym/pokecenter/league/lab/house, nodos/caminos, cámara/vista, código del solver o del render (el mecanismo ya existe). Otras correcciones de alineación que surjan de la inspección visual van en una tarea nueva.
