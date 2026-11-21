# Cámara libre 3D (WASD + rueda + arrastre 360°)

## Objetivo

Que la vista del tablero 3D sea de cámara libre: pan con WASD, zoom in/out con la rueda del mouse y rotación continua (hasta 360° de azimuth) manteniendo click y arrastrando. Extiende el modo `explore` existente; no cambia el modo `overview` ni el encuadre automático.

## Criterios de aceptación

- [ ] AC-1: Con la cámara en modo `explore`, `W`/`S`/`A`/`D` mueven el target arriba/abajo/izquierda/derecha (relativo a la orientación actual de la cámara), respetando `panBounds` y `panSpeed` del preset.
- [ ] AC-2: La rueda del mouse hace zoom-in/zoom-out continuo (no por pasos) modificando `distance` dentro de `distanceRange`, con `damping` del preset.
- [ ] AC-3: Mantener click (botón principal) + arrastrar rota la cámara: el azimuth cubre 360° continuos (sin salto ni clamp en ±180°); el polar queda limitado por `polarDegRange` para no pasar por debajo del tablero.
- [ ] AC-4: El arrastre no interfiere con clicks en paneles/casillas del HUD ni con el drag de cartas: la rotación solo inicia sobre el canvas del tablero y se cancela si el pointer sale o se suelta.
- [ ] AC-5: Teclado y mouse componen: rotar con drag mientras se panea con WASD funciona sin saltos ni peleas de estado.
- [ ] AC-6: Las sensibilidades (zoom por notch, grados por pixel de drag) viven en `content/ui/camera.json`, no hardcodeadas.
- [ ] AC-7: `V` (overview) y `C` (recenter) siguen funcionando y resetean la cámara libre a su preset.

## Archivos involucrados

- `content/ui/camera.json` — presets `explore` y `keys`: agregar `wheelZoomStep`, `dragRotateDegPerPx` (y ajustes que falten).
- `packages/content/` (schema Zod de `UiCamera`) — extender schema con los campos nuevos.
- `apps/web/src/board3d/camera.ts` — plan/controles: tipos y rangos para los nuevos parámetros.
- `apps/web/src/board3d/explore.ts` — estado explore: pasos/reducciones para zoom por rueda y rotación por drag (azimuth libre, wrap 360°).
- `apps/web/src/board3d/rig.ts` — integración de las nuevas acciones al reducer del rig.
- `apps/web/src/board3d/useCameraKeys.ts` — sin cambios funcionales (WASD ya existe); verificar composición.
- `apps/web/src/board3d/CameraRig.tsx` / `Board3D.tsx` — listeners de `wheel` y `pointerdown/move/up` sobre el canvas.
- Tests: `apps/web/src/board3d/rig.test.ts`, `camera.test.ts` (uno por AC con `// AC: camara-libre-3d/AC-n`).

## Plan de pasos

1. Extender `content/ui/camera.json` + schema Zod con `wheelZoomStep` y `dragRotateDegPerPx`.
2. Tests primero en `rig.test.ts` / `camera.test.ts` para AC-1..AC-7.
3. Implementar reducciones en `explore.ts` + `rig.ts` (zoom continuo, rotación drag con wrap de azimuth 360°, polar clamp).
4. Cablear listeners `wheel` y pointer en `CameraRig.tsx`/`Board3D.tsx` (solo canvas, sin capturar clicks del HUD).
5. Verificar composición teclado+mouse (AC-5) y resets V/C (AC-7).
6. `pnpm verify` verde + reporte.

## Comandos de verificación

```bash
pnpm verify
pnpm --filter web test -- rig camera
```

## Notas / defaults

- Rotación 360° = azimuth libre con wrap; polar se mantiene clampado por `polarDegRange` (default existente `[25, 75]`) para no meter la cámara bajo el tablero. Si el dueño quiere polar libre, registralo en `docs/OPEN-QUESTIONS.md`.
