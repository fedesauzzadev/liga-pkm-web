# Agrandar el popup de combate

## Objetivo

El combate se ve chico y cuesta entender lo que pasa. La caja del popup de batalla vive en `content/ui/layout.json` (`panels.battlePopup`: normal y `expanded`); agrandar ambas cajas para que la escena ocupe mucho más de la ventana. Sin tocar lógica de combate ni coreografía.

## Criterios de aceptación

- [ ] AC-1: `battlePopup` normal pasa de `w: 0.28 / h: 0.66` a `w ≥ 0.42 / h ≥ 0.76` de la ventana, arrancando en `x ≥ 0.53` para no solaparse con `cardPopup` (chequeo de solapamiento de e2e t071 sigue verde).
- [ ] AC-2: `battlePopup.expanded` pasa a `w ≥ 0.85 / h ≥ 0.90` de la ventana (casi pantalla completa), con margen ≥ 3% a cada borde del viewport.
- [ ] AC-3: La escena aprovecha la caja agrandada: `.scene` sube `max-width` de `900px` a `1200px` y `.arena` su `min-height` de `220px` a `280px` (en `BattleScene.module.css`), para que FitBox no la achique de más en monitores grandes.
- [ ] AC-4: Sin cambios de comportamiento: solo `layout.json` + CSS de la escena; unit tests de shell/popup y e2e de layout (`t071-shell.mjs`) pasan sin relajar reglas.
- [ ] AC-5: `pnpm verify` verde (incluye `content:validate` de layout.json).

## Archivos involucrados

- `content/ui/layout.json` — `panels.battlePopup` (caja normal y `expanded`).
- `apps/web/src/battle/BattleScene.module.css` — `.scene` (max-width) y `.arena` (min-height).
- Solo si algo rompe (no debería: las tolerancias e2e leen el JSON): `e2e/t071-shell.mjs`, `apps/web/src/shell/layout.test.ts`, `apps/web/src/shell/GameShell.test.tsx`.

## Plan de pasos

1. Editar `content/ui/layout.json › panels.battlePopup`: normal → `{ x: 0.53, y: 0.033, w: 0.44, h: 0.78 }`; `expanded` → `{ x: 0.06, y: 0.03, w: 0.88, h: 0.92 }` (mantener `minW`/`minH`).
2. Editar `BattleScene.module.css`: `.scene` max-width `1200px`; `.arena` min-height `280px`.
3. Correr `pnpm verify` y `node e2e/t071-shell.mjs`; ajustar solo lo que rompa por el cambio de tamaño (sin relajar reglas ni tolerancias).

## Comandos de verificación

- `pnpm verify`
- `node e2e/t071-shell.mjs`
