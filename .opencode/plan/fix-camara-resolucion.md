# Fix: dibujado dependiente de la resolución (mundo pulsa al fullscreen + mover cámara)

## Objetivo

Eliminar la oscilación del mundo (crece/achica por frame) que aparece al cambiar el tamaño de la ventana (típicamente al pasar a fullscreen) y mover/girar la cámara en explore: el render se "re-configura" con tamaños mezclados. El dibujado debe ser independiente de la resolución: mismo encuadre en cualquier tamaño de pantalla.

## Diagnóstico (raíz)

- `CameraRig.tsx`: el loop de ticks (`ensureTicking`, setTimeout de 16 ms) captura el `apply` del render donde arrancó. `apply` depende de `size.width/height` (`useThree`); tras un resize se recrea `apply`, pero el loop ya agendado sigue llamando al closure VIEJO con el tamaño previo, mientras los eventos (drag/rueda/controles) llaman al `apply` nuevo.
- `camera.ts: applyCenteredOffset` hace `camera.setViewOffset(width, height, ...)` con ese tamaño. Alternar tamaño viejo/nuevo por frame cambia el frustum (aspect/zoom efectivo) ⇒ el mundo pulsa.
- Agravante: `setViewOffset` + `updateProjectionMatrix` se ejecutan en cada tick aunque nada cambie (re-configuración permanente por resolución).

## Criterios de aceptación

- [ ] AC-1: Tras un cambio de tamaño, TODOS los ticks del rig aplican el offset con el tamaño ACTUAL (sin closures viejos). Test que simula resize + ticks sucesivos y verifica que la proyección no alterna entre dos tamaños.
- [ ] AC-2: `applyCenteredOffset` es idempotente: llamadas repetidas con los mismos parámetros no re-escriben el view offset ni la matriz de proyección.
- [ ] AC-3: Encuadre independiente de la resolución: con igual aspecto y distinto tamaño (p. ej. 1440×900 vs 2880×1800), las esquinas del tablero proyectan a los mismos NDC (±1e-6), en overview y explore.
- [ ] AC-4: En fullscreen, mover/girar/zoomear la cámara (drag, rueda, Q/E/WASD) no produce cambio de tamaño aparente del mundo (verificación manual con `pnpm dev`; la parte automática la cubren AC-1/AC-2).
- [ ] AC-5: `pnpm verify` verde.

## Archivos involucrados

- `apps/web/src/board3d/CameraRig.tsx` — leer el tamaño actual sin closure viejo (ref a `size` o `useThree.getState()` dentro de `apply`); re-aplicar pose al cambiar tamaño también desde el loop.
- `apps/web/src/board3d/camera.ts` — `applyCenteredOffset`: idempotente, solo `setViewOffset`/`updateProjectionMatrix` cuando cambian los valores.
- `apps/web/src/board3d/camera.test.ts` — tests nuevos (AC-1..AC-3).
- `apps/web/src/board3d/rig.ts` — solo lectura de referencia (poses con `aspect`); tocar solo si AC-1 lo exige.

## Plan de pasos

1. Tests primero en `camera.test.ts`: idempotencia de `applyCenteredOffset` (AC-2), encuadre NDC igual con igual aspecto y distinto tamaño (AC-3), y secuencia resize + ticks sin alternancia de frustum (AC-1, extrayendo si hace falta un helper puro de offset).
2. `CameraRig.tsx`: guardar `size` en un ref actualizado en cada render (o leer `useThree.getState().size` dentro de `apply`) y quitar `size.width/height` de las deps del closure del loop; asegurar que el efecto de resize re-aplica también con el loop corriendo.
3. `camera.ts`: cortar temprano en `applyCenteredOffset` si `(width, height, ox, oy)` no cambian desde la última aplicación.
4. Verificación manual (AC-4): `pnpm dev`, abrir ventana chica → F (fullscreen) → girar con drag, zoom con rueda, panear con WASD: sin pulso, mismo encuadre.
5. `pnpm verify` verde.

## Comandos de verificación

```bash
pnpm --filter @liga/web test -- camera
pnpm typecheck && pnpm lint && pnpm test
pnpm verify
pnpm dev   # manual: resize/fullscreen + drag/rueda/teclas (AC-4)
```
