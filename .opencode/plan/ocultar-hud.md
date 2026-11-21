# Ocultar HUD con botón de anteojitos

## Objetivo

Un botón arriba a la izquierda de la pantalla, con forma de anteojitos, que oculte todo el HUD (paneles, botones y overlay de controles) dejando a la vista el tablero completo. Al hacer click de nuevo, el HUD vuelve a aparecer. Es un cambio puramente de UI: no toca el motor ni la sesión.

## Criterios de aceptación

- [ ] AC-1: Existe un botón con `data-testid="btn-hud-toggle"` arriba a la izquierda (posición definida como panel `hudToggle` en `content/ui/layout.json`), con ícono SVG de anteojitos (inline, sin librerías) y `aria-label`/`title` en español desde `apps/web/src/i18n/es.ts`.
- [ ] AC-2: Al hacer click, desaparecen del DOM el overlay (`data-shell-overlay`) y todos los paneles y botones del HUD (`data-shell-hud`: panel-turn, panel-team, btn-team-tab, panel-players, panel-history, panel-backpack, btn-oak, btn-menu, tip-f11). El botón de anteojitos queda visible y el tablero se ve sin nada que lo tape.
- [ ] AC-3: Al hacer click nuevamente, el HUD vuelve a aparecer conservando su estado previo (p. ej. `teamCollapsed` se mantiene como estaba).
- [ ] AC-4: Los popups modales (popup-card, popup-battle) y el menú abierto NO se ocultan con el toggle: son gameplay y siguen funcionando; si se abren con el HUD oculto, se muestran igual. (Decisión default: "HUD" = cromo de pantalla, no modales de juego.)
- [ ] AC-5: Accesible: `aria-pressed` refleja el estado oculto/visible; el botón entra en `FOCUS_ORDER`; Esc y el atajo F de pantalla completa siguen funcionando igual.
- [ ] AC-6: Un test por AC en `apps/web/src/shell/GameShell.test.tsx` (comentario `// AC: ocultar-hud/AC-n`) y `pnpm verify` verde.

## Archivos involucrados

- `content/ui/layout.json` — nuevo panel `hudToggle` (esquina superior izquierda, ~x 0.006 / y 0.017).
- `packages/content/src/ui.ts` — agregar `hudToggle` a `UI_PANEL_KEYS`.
- `apps/web/src/shell/layout.ts` — agregar `hudToggle` a `FOCUS_ORDER`.
- `apps/web/src/shell/HudToggle.tsx` — NUEVO: botón con SVG de anteojitos y `aria-pressed` (mantiene GameShell bajo las 400 líneas).
- `apps/web/src/shell/GameShell.tsx` — estado local `hudHidden`; render condicional de overlay + paneles del HUD (el toggle queda excluido del ocultamiento, patrón teamTab).
- `apps/web/src/shell/GameShell.module.css` — estilos del botón (CSS Modules + variables CSS existentes).
- `apps/web/src/i18n/es.ts` — textos `hudToggleHide` / `hudToggleShow`.
- `apps/web/src/shell/GameShell.test.tsx` — tests de AC-1..AC-5.

## Plan de pasos

1. Agregar el panel `hudToggle` a `layout.json`, la key en `ui.ts` y la entrada en `FOCUS_ORDER` (verificar que `content:validate` y el crosscheck de layout sigan verdes).
2. Agregar los textos en `es.ts`.
3. Crear `HudToggle.tsx` (SVG inline de anteojitos + botón accesible).
4. En `GameShell.tsx`: estado `hudHidden`; al ocultar, no renderizar overlay ni paneles/botones del HUD salvo `hudToggle`; popups y menú quedan fuera del alcance del toggle.
5. Escribir los tests (uno por AC) y correr `pnpm verify` hasta que quede verde.

## Comandos de verificación

- `pnpm verify` (typecheck + lint + test + content:validate + build)
