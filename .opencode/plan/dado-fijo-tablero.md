# Dado fijo en el tablero (parte del mapa) + safezone de paneo ampliada

## Objetivo

El dado deja de reposar delante de la cámara y pasa a ser un elemento FIJO del mundo (como un landmark del tablero): siempre gira sobre sí mismo en el mismo lugar, sin importar dónde esté o cómo se mueva la cámara (totalmente libre, sin anclaje). Además se expande un poco el límite de paneo ("safezone"), porque al chocar contra su pared la cámara se va hacia arriba.

## Criterios de aceptación

- AC-1: El reposo del dado es una posición fija del mundo definida en `content/ui/camera.json` (`dice.rest: [x, z]`, default los actuales `3.4 / 6.2`): se elimina `diePosInFront` y el wiring `dieRestRef` (rig/CameraRig/Board3D.shared/Board3D ya no reposicionan el dado según la pose de cámara).
- AC-2: La tirada rueda y rebota SIEMPRE en ese punto fijo (`rollDieTo` con reposo constante); panear, rotar o zoomear la cámara no mueve el dado (la posición del mesh es invariante ante cualquier evento/pose de cámara en cualquier modo).
- AC-3: Con zoom-in total (distanceRange mínimo, 3,0) la cámara nunca queda encima del dado ni lo atraviesa: no existe más offset del dado relativo a la cámara.
- AC-4: `camera.json` + esquema sin claves muertas: `dice.inWorldOffset` se reemplaza por `dice.rest`; `posX`/`posZ` salen de `theme/board3d.ts` (única fuente = content); `UiCameraSchema` + `crossCheckCamera` actualizados y `pnpm content:validate` verde.
- AC-5: Safezone ampliada: `overview.panLimit` 0,1 → 0,25 ⇒ los `panBounds` (explore y overview, que derivan de ese valor) corren un 15 % más allá del borde del tablero antes de tocar la pared.
- AC-6: Al chocar contra la pared del paneo, la cámara NO se levanta: el clamp de posición en `explorePose` preserva la dirección del offset (sin salto aparente de elevación; hoy se clampea solo x/z y la vista "sube").
- AC-7: Tests actualizados: los tests de `diePosInFront` (`rig.test.ts`, `camara-libre-sin-ficha.test.ts`, `camera.test.ts`) se reemplazan por tests del reposo fijo y del clamp sin elevación; un test por AC.

## Archivos involucrados

- `content/ui/camera.json` — `dice.inWorldOffset` → `dice.rest: [3.4, 6.2]`; `overview.panLimit` 0,25.
- `packages/content/src/ui.ts` — `UiCameraSchema` (dice) + `crossCheckCamera` (rest válido).
- `apps/web/src/board3d/die.ts` — `dieRest()` lee `cameraPresets.dice.rest` (fijo).
- `apps/web/src/board3d/rig.ts` — borra `diePosInFront`; panBounds siguen derivando de `panLimit`.
- `apps/web/src/board3d/CameraRig.tsx` — quita `dieRestRef` (prop y asignación en `apply`).
- `apps/web/src/board3d/Board3D.shared.ts` — quita `dieRestRef`.
- `apps/web/src/board3d/Board3D.tsx` — quita `dieRestHere`/`getRest` (Die3D usa su default fijo).
- `apps/web/src/board3d/explore.ts` — `explorePose`: clamp de posición preservando dirección (AC-6).
- `apps/web/src/theme/board3d.ts` — sin `die.posX`/`die.posZ`.
- Tests: `apps/web/src/board3d/{rig,camera,die,camara-libre-sin-ficha}.test.ts` + tests de contenido en `packages/content`.

## Plan de pasos

1. Content + esquema: `camera.json` (`dice.rest`, `panLimit` 0,25), `ui.ts` (schema + crossCheck) y tests de contenido; `pnpm content:validate` verde.
2. Dado fijo: `die.ts` (reposo desde content), quitar `diePosInFront`/`dieRestRef`/`getRest` en rig/CameraRig/shared/Board3D, limpiar theme; tests AC-1..AC-4.
3. Safezone: verificar panBounds ampliados por `panLimit` + clamp sin elevación en `explorePose`; tests AC-5/AC-6.
4. `pnpm verify` verde + reporte `tasks/reports/T-xxx.md`.

## Comandos de verificación

- `pnpm verify` (typecheck + lint + test + content:validate + build)
- `pnpm --filter @liga/web test -- board3d` (feedback rápido durante desarrollo)
- `pnpm shots` (chequeo visual del dueño: dado siempre en el mismo lugar del mapa y sin salto en la pared de paneo)

## Notas / dudas a registrar

- Interpretación: la "safezone" con pared es el límite de paneo (`panLimit` → `panBounds`), no el `safeArea` de `layout.json` (que solo centra el frustum y no tiene pared contra la que chocar). Registrar en OPEN-QUESTIONS si el dueño en realidad quería ampliar el `safeArea` del layout.
- Registrar en OPEN-QUESTIONS: con cámara "totalmente libre", ¿quiere paneo SIN límites (panLimit ∞) o alcanza con la pared más lejos + sin salto vertical (AC-5/AC-6)?
