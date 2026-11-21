# NO-VISION — cómo trabajar sin poder ver imágenes
El worker (GLM) no interpreta imágenes. Entonces **nunca** afirmes que algo "se ve bien". En su lugar, demostralo con datos que puedas leer:
1. **Tests numéricos y de texto** para todo lo visual: posiciones, tamaños, visibilidad, textos, orden de eventos, valores de dados.
2. **`data-testid`** en cada elemento relevante (kebab-case: `tile-panel`, `drawn-card`, `btn-fight`…). Los tests e2e (Playwright) usan esos ids, no coordenadas de píxeles.
3. **Volcado de escena en texto**: en modo desarrollo, `window.__debug.sceneDump()` devuelve JSON con cada objeto 3D relevante (`name`, `type`, `visible`, `worldPos`, `screenPos`, `screenBBox`, `inViewport`). Leelo para "ver" la escena.
4. **Chequeos mínimos de que el canvas dibuja**: `pnpm shots` toma capturas con Playwright y calcula métricas (varianza de píxeles > umbral = no está en blanco; el tablero ocupa ≥ 60 % del ancho útil; las fichas están dentro del viewport). Las métricas van a `shots/report.json`.
5. **Ojos humanos**: las capturas quedan en `shots/` (gitignored). En tu reporte escribí qué tiene que mirar el dueño ("abrí shots/board-idle.png y decime si el tablero se ve centrado, si las fichas se distinguen, si el texto se lee"). El dueño responde con palabras y vos corregís.
6. Si una decisión depende de gusto visual (colores, proporciones), usá los valores numéricos del spec; no improvises. Si el spec no los da, elegí valores razonables, ponelos en `src/theme/*.ts` (un solo lugar) y listalos en el reporte.
7. Cuando algo falle visualmente según el dueño, reproducilo primero con un test o un volcado numérico, y después arreglalo.
