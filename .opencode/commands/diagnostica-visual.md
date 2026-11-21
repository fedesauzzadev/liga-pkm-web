---
description: Diagnostica un problema visual 3D SIN ver imágenes, con mediciones. Uso: /diagnostica-visual modelos negros
---
Sos un ingeniero depurando SIN poder ver imágenes. Problema: "$ARGUMENTS".

1. Leé `AGENTS.md`, `docs/NO-VISION.md` y la sección correspondiente de `specs/SPEC-M-urgent-visual-fixes.md`.
2. **No cambies nada todavía.** Medí, con evidencia (archivo:línea y salida de comandos o tests):
   - Por cada modelo cargado (Kenney y HGSS): ¿tiene normales? ¿cuántos materiales? ¿cada material tiene `map` y su imagen cargó (ancho > 0)? ¿qué `color` tiene? ¿qué material queda después de la conversión toon? ¿qué escala final y qué caja (`Box3`) tiene en el mundo?
   - Para cámara: ángulo de picada real = `asin(-forward.y)` en grados, distancia y objetivo, en cada modo.
   - Para etiquetas: caja en pantalla de cada etiqueta y si el contenedor la recorta (`overflow`, `max-width`).
3. Escribí `tasks/reports/DIAG-visual.md` con una tabla (elemento × medida × valor × esperado) y las 3 causas más probables ordenadas.
4. Frená y respondé con un resumen de máximo 15 líneas.
