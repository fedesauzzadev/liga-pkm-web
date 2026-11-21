# Lobby con logo y sin scroll

## Objetivo

Reemplazar el texto "LIGA PKM / MVP-0 en construcción" de la pantalla de título por la imagen `content/loading/pokeboard sinfondo.jpg` como logo, con los botones existentes debajo. Además, eliminar el scroll de página del lobby: la pantalla debe entrar siempre en el viewport (tamaño fijo responsivo, estático).

## Criterios de aceptación

- [ ] AC-1: `TitleScreen` renderiza un `<img>` con el logo importado de `content/loading/pokeboard sinfondo.jpg` (patrón de import de Vite ya usado en `LoadingScreen.tsx`), con `alt` desde `apps/web/src/i18n/es.ts` (nueva clave, p. ej. `titleLogoAlt`). Ya no renderiza el `h1` con `es.appTitle` ni el `p` con `es.appSubtitle` (la clave `appSubtitle` queda sin uso ⇒ eliminarla de `es.ts`; `appTitle` se conserva, se usa en `TilePanel` y `aria-label`).
- [ ] AC-2: Los tres botones existentes (Nueva partida / Continuar / Ajustes) quedan debajo del logo, sin cambios de comportamiento: `Continuar` deshabilitado sin save, aviso `role="alert"` para saves inválidos intacto.
- [ ] AC-3: La pantalla de título no genera scroll de página: con el lobby montado, `document.scrollingElement.scrollHeight <= window.innerHeight` (extender la excepción `.shell:has(...)` de `App.module.css` al lobby, y que la suma logo + botones + paddings entre en `100dvh`).
- [ ] AC-4: Responsivo sin recortes: en viewports angosto (375px) y bajo (~600px de alto) el logo se achica (`max-height` en unidades de viewport, `width: auto`) y los botones siguen enteros y ≥ 44px de alto.
- [ ] AC-5: `TitleScreen.test.tsx` cubre: logo presente con alt correcto, ausencia de `es.appSubtitle`, y los AC-1/AC-2 existentes siguen pasando (un test por AC, comentario `// AC:`).

## Archivos involucrados

- `apps/web/src/game/TitleScreen.tsx` — markup: `<img>` en lugar de `h1` + `p`; atributo para que `.shell` lo detecte (p. ej. `data-title-screen`).
- `apps/web/src/game/TitleScreen.test.tsx` — tests nuevos/ajustados.
- `apps/web/src/game/game.module.css` — clase para el logo (`.logo`: `max-height` en `dvh`, ancho auto, `object-fit: contain`); `.screen` sin desbordes.
- `apps/web/src/App.module.css` — extender `.shell:has([data-shell-root])` para que el lobby también quede sin margen/borde que desborde.
- `apps/web/src/i18n/es.ts` — nueva clave `titleLogoAlt`; borrar `appSubtitle`.
- `content/loading/pokeboard sinfondo.jpg` — asset fuente (ya existe en el working tree, untracked).

## Plan de pasos

1. Tests primero en `TitleScreen.test.tsx` (uno por AC, con `// AC:`).
2. `es.ts`: agregar `titleLogoAlt`, quitar `appSubtitle`.
3. `TitleScreen.tsx`: `<img>` con import relativo `../../../../content/loading/pokeboard sinfondo.jpg` + `data-title-screen`.
4. CSS: `.logo` responsivo en `game.module.css`; extender `:has()` en `App.module.css`; verificar ajustes de `.screen`.
5. Verificación manual en `pnpm dev` (375×667 y 1920×1080, sin scroll).
6. `pnpm verify` verde.

## Comandos de verificación

- `pnpm vitest run apps/web/src/game/TitleScreen.test.tsx`
- `pnpm dev` → inspección manual del lobby (scrollHeight ≤ innerHeight en consola).
- `pnpm verify`

## Notas

- Decisión del dueño: se usa el `.jpg` existente (no hay `.png`; JPG no admite transparencia real). Si el fondo de la imagen no es transparente, se recorta/disimula contra el fondo del lobby; un `.png` real puede reemplazar el archivo más adelante sin tocar código (solo el import).
- Fuera de alcance: otras pantallas (setup/ajustes/juego) y el flujo de guardado.
