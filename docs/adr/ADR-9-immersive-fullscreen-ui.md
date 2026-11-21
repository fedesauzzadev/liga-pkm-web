# ADR-9 — Pantalla completa inmersiva: mundo 3D + HUD de vidrio
Estado: aprobado por el dueño (boceto propio) · Fecha: 2026-10-11

## Decisión
1. La app es una **pantalla completa sin scroll** (`100dvh`/`100dvw`, `overflow:hidden`), pensada para F11. Mínimo 1024×600, solo horizontal; botón "Pantalla completa" (Fullscreen API) en el menú.
2. **El tablero es la pantalla**: el canvas 3D ocupa toda la ventana y el HUD son paneles semitransparentes encima. No hay "cartón con borde" en el medio: el mundo continúa hasta el horizonte (terreno, biomas, montañas lejanas, cielo, niebla). Reemplaza el "diorama flotante" de la versión anterior de SPEC-H.
3. **Cámara cinemática**: vista general ↔ seguimiento. Al tirar el dado hace zoom in a tu ficha, la acompaña por el camino y al terminar hace zoom out para ver al resto. Reemplaza `OrbitControls` de SPEC-G/T-062 (se mantiene paneo/zoom libres y limitados solo en la vista general).
4. El HUD vive en `content/ui/layout.json` (fracciones de ventana) y respeta un `safeArea`: la cámara centra la ficha dentro de esa zona, no detrás de los paneles.
5. Combate e intercambio se muestran como **popups** sobre el mundo, visibles para todos los jugadores cuando alguien combate o intercambia. La escena de combate (T-032a/d) debe adaptarse al tamaño del popup (container queries), no al de la ventana.

## Consecuencias
- Tareas nuevas T-071…T-076 (SPEC-I) y reescritura de SPEC-H (T-067…T-070).
- Las pruebas de layout son numéricas (cajas de `data-testid` vs `layout.json`), porque el worker no ve imágenes (`docs/NO-VISION.md`).
- El canvas a pantalla completa es más caro: `dpr` máximo 1,5, `PerformanceMonitor` y perfil bajo automático.
