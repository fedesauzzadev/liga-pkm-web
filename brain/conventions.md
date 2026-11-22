# Convenciones (reusar antes de crear)
- Reglas duras del repo: `CLAUDE.md` (motor puro, textos en `apps/web/src/i18n/es.ts`, CSS Modules, sin deps nuevas, archivos ≤ 400 líneas).
- Valores visuales (cámara, tamaños, colores 3D): un solo lugar, `apps/web/src/theme/board3d.ts`.
- "Ver" la escena: `window.__debug.sceneDump()` (dev) y capturas reales del navegador. Ahora el agente SÍ ve imágenes: cada AC visual cierra con una captura mirada, no solo con números.
- Tests junto al archivo (`*.test.ts[x]`), `data-testid` en kebab-case.
- Atajo de combate en partida: botón dev "Probar encuentro con Abra" (solo en fase organizar, recién creada la partida).
- Assets ignorados por git (sprites, fx, badges, models/new, models/hgss): en un worktree nuevo se copian desde `C:\repos\liga-pkm-web-kickoff\apps\web\public\`.
- Capturas de arte: `node e2e/arte-shots.mjs shots/arte/<nodo>` (6 vistas fijas, dev en 5190) y `node e2e/arte-probe.mjs "<js con S=scene, G=renderer>" out.png` para probar valores en vivo. Siempre en serie (en paralelo el PerfGovernor apaga sombras).
