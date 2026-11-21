# SPEC-N — Pestaña para ocultar/mostrar el equipo (T-089)
Origen: pedido del dueño. El panel del equipo (6 slots) ocupa el 19 % de la altura de la ventana y a veces tapa el tablero; se quiere poder ocultarlo con una pestaña en la zona inferior y volver a mostrarlo apretándola de nuevo. Decisiones confirmadas por el dueño: (1) la pestaña va **pegada arriba del panel equipo** (estilo carpeta) y queda **fija en ambos estados** —al colapsar solo desaparece `panel-team`—; (2) **siempre arranca visible** (estado React local, sin localStorage ni settings). No se mueve ni se redimensiona ningún panel existente.

## T-089 Pestaña ocultar/mostrar equipo
- AC-1 `content/ui/layout.json` agrega `teamTab: { testid: "btn-team-tab", x: 0.17, y: 0.7266, w: 0.655, h: 0.0734, minH: 44 }` (bottom = 0,80 exacto: toca el borde superior de `team` sin solaparlo; alto = 44 px a 1024×600). `UI_PANEL_KEYS` y `FOCUS_ORDER` de `packages/content/src/ui.ts` / `apps/web/src/shell/layout.ts` incluyen `teamTab` (9 → 10 paneles). `crossCheckLayout` y `content:validate` siguen en verde (sin solapes con `team`, `oakButton`, `menuButton`); test de conteo de paneles actualizado.
- AC-2 `teamTab` se renderiza como botón del shell (misma rama/estilo que `oakButton`/`menuButton`), con `data-testid="btn-team-tab"`, `aria-expanded="true|false"` coherente con el estado, `aria-controls` hacia `panel-team` y textos por i18n: `teamCollapse: 'Ocultar equipo'` / `teamExpand: 'Mostrar equipo'` en `apps/web/src/i18n/es.ts`.
- AC-3 Estado `teamCollapsed` en `PlayScreen.tsx` (patrón `oakOpen`, `useState`, default `false`). Apretar la pestaña lo pone en `true`: `panel-team` sale del DOM, el tablero/mundo y el resto del HUD quedan visibles y **ningún otro panel cambia de caja**.
- AC-4 Apretar de nuevo lo vuelve a `false` y `panel-team` reaparece con los 6 slots intactos (roundtrip visible → oculto → visible; al cargar la partida siempre arranca visible).
- AC-5 Tamaño táctil y convivencia: a 1024×600 la caja de `btn-team-tab` mide ≥ 44 px de alto y no se solapa con `panel-team`, `btn-oak` ni `btn-menu` (medido en navegador, ±2 px).
- AC-6 `teamTab` participa del orden de Tab/`FOCUS_ORDER` y de los arrays hardcodeados de los e2e existentes (`e2e/t071-shell.mjs`, `e2e/t082-hud.mjs`).
- AC-7 Un test por AC (`// AC: SPEC-N/AC-n`): SSR para render/aria/estado (React sin jsdom) y e2e nuevo `e2e/t089-team-tab.mjs` (puerto libre) para el roundtrip por click. `pnpm verify` verde.

## Orden
T-089 depende de T-071 y T-074 (DONE). Es independiente de `SPEC-M`/`SPEC-L`; puede hacerse en cualquier momento sin bloquear la fase visual.

## Qué mirar (dueño)
- En el estado oculto la pestaña queda donde estaba (encima de donde iría el panel), no baja al borde de la ventana.
- Al colapsar, el strip del equipo queda tapado por la pestaña: se ve solo la pestaña, no slots a medio ver.
