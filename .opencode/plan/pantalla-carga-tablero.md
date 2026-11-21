# Pantalla de carga del tablero (loading screen con imagen fullhd)

## Objetivo

Al entrar a la partida, no mostrar el tablero/HUD a medio renderizar: tapar todo con una pantalla de carga a pantalla completa (imagen `content/loading/loading fullhd.jpg` + texto "Cargando…" + spinner) y recién cuando el tablero terminó de renderizar, hacer una transición ordenada (fade) hacia el tablero.

## Contexto actual

- `GameApp` pasa de `setup` → `play` y `PlayScreen` monta de una: el HUD se ve mientras el chunk 3D del tablero (`BoardHost` → `lazy(Board3D)`) todavía carga, con un `<p>` como único feedback (`board3dLoading`).
- La imagen existe en `content/loading/loading fullhd.jpg` (nombre con espacio; no está en `.gitignore`).

## Criterios de aceptación

- AC-1: Al montarse `PlayScreen`, se muestra un overlay a pantalla completa con la imagen de fondo (`object-fit: cover`), el texto "Cargando…" y un spinner; el tablero y el HUD no son visibles durante la carga.
- AC-2: Mientras el overlay está activo, no se puede interactuar con el tablero/HUD (cubre todo el viewport y bloquea puntero/teclado).
- AC-3: Cuando el tablero terminó de renderizar (chunk 3D resuelto, modelos cargados y primer frame pintado; o tablero 2D montado), el overlay se desvanece con una transición corta (~300ms) y prolija. Con `reducedMotion` activo, el cambio es instantáneo (sin fade).
- AC-4: Los caminos alternativos también revelan el tablero: fallback a 2D sin WebGL y error de carga del chunk 3D nunca dejan la pantalla de carga colgada.
- AC-5: En ningún momento se ve el tablero parcialmente renderizado (el `<p board-3d-loading>` actual deja de ser el feedback visible al usuario).
- AC-6: El texto vive centralizado en `apps/web/src/i18n/es.ts` (español rioplatense) y el spinner es CSS puro; sin dependencias nuevas.
- AC-7: Un test de `@testing-library/react` por AC (comentario `// AC: pantalla-carga-tablero/AC-n`).

## Archivos involucrados

- `apps/web/src/game/PlayScreen.tsx` — monta el overlay y espera la señal de "tablero listo".
- `apps/web/src/board/BoardHost.tsx` — reemplaza el fallback `<p>`: reporta `onReady` cuando el tablero quedó renderizado (2D montado / 3D con primer frame).
- `apps/web/src/board3d/Board3D.tsx` — emite la señal de primer frame pintado (solo si hace falta tocarlo).
- Nuevos: `apps/web/src/game/LoadingScreen.tsx`, `apps/web/src/game/loading.module.css`.
- `apps/web/src/i18n/es.ts` — clave de texto de carga de partida (reusar/ajustar `loading` o crear `boardLoading`).
- `content/loading/loading fullhd.jpg` — asset existente; se referencia vía import de Vite (el hash de build maneja el espacio en el nombre; no renombrar).
- Tests: nuevo `apps/web/src/game/LoadingScreen.test.tsx`; ajustes en `apps/web/src/game/PlayScreen.test.tsx` y `apps/web/src/game/GameApp.test.tsx`.

## Plan de pasos

1. Escribir los tests primero (uno por AC-1..AC-6).
2. Crear `LoadingScreen` + CSS: fondo fullhd, "Cargando…" y spinner CSS puro, overlay fijo full-viewport con `pointer-events` bloqueando.
3. Agregar señal `onReady` desde `BoardHost` (2D: `useEffect` post-mount; 3D: primer frame/suspense resuelto) y consumirla en `PlayScreen`.
4. Transición de salida: fade corto con CSS o motion, respetando `settings.reducedMotion`; nunca un resultado del juego depende de la animación (Animación ≠ lógica).
5. Asegurar los caminos de fallback (sin WebGL / chunk 3D con error) también revelan el tablero.
6. Correr `pnpm verify` y dejar todo verde.

## Comandos de verificación

- `pnpm verify` (typecheck + lint + test + content:validate + build)
- `pnpm test -- PlayScreen` (iteración rápida de los tests nuevos)
- `pnpm dev` → iniciar partida y verificar a mano: overlay visible, tablero revelado con fade, fallback 2D también revela.
