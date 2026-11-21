# Reemplazar logo del título: `pokeboard sinfondo.jpg` → `png.png`

## Objetivo

Usar `content/loading/png.png` como imagen del logo en `TitleScreen` en lugar de `content/loading/pokeboard sinfondo.jpg`, actualizando el import y los tests que afirman el asset fuente.

## Criterios de aceptación

- [ ] AC-1: `TitleScreen.tsx` importa el logo desde `content/loading/png.png` y ya no referencia `pokeboard sinfondo.jpg`.
- [ ] AC-2: `TitleScreen.test.tsx` verifica el nuevo asset (`content/loading/png.png`) y no queda ninguna aserción que exija `pokeboard` en el HTML fuente.
- [ ] AC-3: Sin otros usos de `pokeboard sinfondo.jpg` en `apps/` (el jpg queda en `content/loading/`, no se borra).

## Archivos involucrados

- `apps/web/src/game/TitleScreen.tsx` — línea 6, import del logo.
- `apps/web/src/game/TitleScreen.test.tsx` — líneas 54-61, aserciones sobre el asset fuente.
- `content/loading/png.png` — asset nuevo (ya existe).
- `content/loading/pokeboard sinfondo.jpg` — asset saliente (se conserva en disco).

## Plan de pasos

1. En `TitleScreen.tsx`, cambiar el import a `../../../../content/loading/png.png`.
2. En `TitleScreen.test.tsx`, actualizar el test de `lobby-logo-sin-scroll/AC-1`: esperar `png.png` en la fuente y ajustar la aserción del HTML (`expect(html).toContain('png')` en el src resuelto por Vite, o eliminar la aserción de `pokeboard` si el hash del nombre complica el match exacto). Actualizar el comentario del test.

## Comandos de verificación

- `pnpm verify`
