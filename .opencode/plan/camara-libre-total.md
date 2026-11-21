# Cámara libre total: sin centrado automático en la ficha

## Objetivo

En modo explore la cámara sigue "clavada" mirando la ficha: `CameraRig.apply` pasa la posición de la ficha seguida a `applyCenteredOffset` con `safeMix` 0, lo que desplaza el frustum cada frame para que la ficha quede en el centro del safeArea (el paneo parece girar en torno a ella). Queremos una cámara completamente libre: el frustum se centra en el safeArea (como overview) y ninguna ficha se auto-centra.

## Criterios de aceptación

- AC-1: En modo explore el frustum NO sigue la ficha: el centro del frustum es el centro del safeArea (mismo criterio que overview). Panear con WASD/arrastre mueve el punto mirado sin que la ficha quede clavada al centro de pantalla.
- AC-2: El centrado en ficha queda reservado a la cámara de combate (`follow`/`fork`/`transitionIn`): en esos modos `tokenWorld` se sigue pasando igual que antes.
- AC-3: Las transiciones hacia explore terminan con el frustum centrado en el safeArea, interpolando sin salto visual (sin snap al final del `transitionOut`).
- AC-4: El encuadre inicial sobre mi ficha (una sola vez, al montar) y la acción explícita "Centrar en mí" (botón/tecla C/doble click) siguen funcionando; después de usarse no hay pinning posterior.
- AC-5: `battleCameraCue` y el zoom del popup de combate (T-075/AC-4) quedan intactos.
- AC-6: Un test por AC (`// AC: camara-libre-total/AC-n`) en `apps/web/src/board3d/camara-libre-total.test.ts`; los tests existentes que asuman pinning de ficha en explore se actualizan.

## Archivos involucrados

- `apps/web/src/board3d/CameraRig.tsx` — no pasar `tokenWorld` fuera de los modos de combate (hoy: líneas 102-106).
- `apps/web/src/board3d/rig.ts` — `safeMix` del explore/transiciones (hoy explore devuelve 0, línea 466; transición hacia explore termina en 0): pasar a frustum safeArea sin snap.
- `apps/web/src/board3d/rig.test.ts` y `apps/web/src/board3d/camara-libre-sin-ficha.test.ts` — ajustar asserts de `safeMix`/pinning en explore si hace falta.
- Nuevo: `apps/web/src/board3d/camara-libre-total.test.ts`.
- `apps/web/src/board3d/camera.ts` — solo lectura: `applyCenteredOffset`/`applySafeOffset` no cambian (los usa la cámara de combate).

## Plan de pasos

1. Escribir los tests primero (un test por AC-1..AC-5) en `camara-libre-total.test.ts`.
2. `rig.ts`: explore devuelve frustum safeArea (`safeMix` 1) y `transitionOut` interpola hacia 1 también cuando el destino es explore (AC-1/AC-3).
3. `CameraRig.tsx`: pasar `tokenWorld` solo en `follow`/`fork`/`transitionIn` (AC-2).
4. Actualizar tests afectados de `rig.test.ts` / `camara-libre-sin-ficha.test.ts` (AC-6).
5. Correr `pnpm verify` y dejarlo verde; reporte en `tasks/reports/camara-libre-total.md`.

## Comandos de verificación

- `pnpm vitest run apps/web/src/board3d` (tests del área)
- `pnpm verify`
