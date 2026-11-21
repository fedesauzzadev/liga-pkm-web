---
description: Diagnostica por qué algo no funciona, sin ver imágenes. Uso: /diagnostica tablero
---
Sos un ingeniero depurando SIN poder ver imágenes. Tema: "$ARGUMENTS".

1. Leé `AGENTS.md`, `docs/NO-VISION.md` y la tarea T-060 de `specs/SPEC-G-board-playable.md`.
2. **No arregles nada todavía.** Recorré la cadena completa y, para CADA tipo de casillero (deck de cada uno de los 5 mazos, mercado, centro, oak, duelo, gym, empty, start, sorpresa, liga), respondé con evidencia (archivo:línea y salida de un test):
   a. ¿El motor, al terminar de mover, resuelve el casillero?
   b. ¿Emite eventos (`TileResolved`, `CardDrawn`, …) y/o deja un `pending`?
   c. ¿El store de la UI recibe esos eventos y ese `pending`?
   d. ¿Existe un componente que muestre algo para ese evento/pending?
3. Escribí un test de integración por tipo de casillero (aunque falle). Corré `pnpm test` y guardá el resumen.
4. Escribí `tasks/reports/DIAG-tablero.md` con una tabla (tipo de casillero × a, b, c, d = OK / FALTA / ROTO + evidencia) y la lista ordenada de arreglos mínimos.
5. Frená. Respondé con un resumen de máximo 15 líneas.
