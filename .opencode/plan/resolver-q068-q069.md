# Resolver Q-068/Q-069 (dudas de decoración dejadas por T-095)

## Objetivo
Cerrar las dos preguntas abiertas que generó T-095: el lago de Isla omitido porque el radio mínimo no entra (Q-068) y el tablero más ralo con 2 piezas de Paleta ocultas (Q-069), con decisión explícita del dueño y los ajustes correspondientes.

## Criterios de aceptación
- [ ] Q-068: el dueño eligió una opción (mantener la omisión del lago, bajar `waterRules.minRadius`, permitir agua sobre caminos, o agrandar/mover el panel Isla) y quedó aplicada.
- [ ] Q-069: el dueño confirmó o ajustó la densidad del scatter (91 spots, forest:tree 0, mountain 1/5, mist/lavaPool 0) y el destino de las 2 piezas de Paleta ocultas (`paleta:1` casa, `paleta:2` árbol); los valores viven en datos, no en código.
- [ ] Si se tocó `decor.collision.json` o `deck-stacks.json`: `pnpm decor:report` regenerado (`shots/decor-overlaps.svg` + `.report.json`) con 0 solapamientos.
- [ ] `docs/OPEN-QUESTIONS.md` marca Q-068 y Q-069 como resueltas (decisión + fecha).
- [ ] `pnpm verify` verde.
- [ ] Sin cambios fuera del alcance (solo datos/contenido y OPEN-QUESTIONS.md; código solo si la decisión del dueño lo exige).

## Archivos involucrados
- `docs/OPEN-QUESTIONS.md` (Q-068, Q-069 → resueltas)
- `content/board/decor.collision.json` (`waterRules.minRadius`, `roadGap`, buffers/radios de categorías según decisión)
- `content/board/deck-stacks.json` (solo si el dueño agranda/mueve el panel Isla)
- `packages/content/src/decor-plan.ts` y `decor-collision.ts` (solo lectura; tocar solo si la decisión lo exige)
- `shots/decor-overlaps.svg` y `shots/decor-overlaps.report.json` (evidencia regenerada con `pnpm decor:report`)

## Plan de pasos
1. Correr `pnpm decor:report` y releer `shots/decor-overlaps.report.json` (conteos actuales: 91 spots, `omittedWater: [isla]`, `hiddenLandmarks` paleta:1/paleta:2) como evidencia fresca.
2. Presentarle al dueño Q-068 con las opciones y su costo: (a) omisión definitiva, (b) bajar `minRadius` en `decor.collision.json`, (c) agua sobre caminos (`roadGap` 0 + excepción), (d) agrandar/mover el panel Isla en `deck-stacks.json`. Registrar la elección.
3. Presentarle al dueño Q-069: aceptar el tablero ralo (cero solapamientos manda) o ajustar buffers/radios en `decor.collision.json`; y qué hacer con las 2 piezas de Paleta ocultas. Registrar la elección.
4. Aplicar solo lo decidido (prioridad: cambios de datos; código solo si es imprescindible).
5. Regenerar `pnpm decor:report` y verificar 0 solapamientos + conteos acordes a la decisión.
6. Actualizar `docs/OPEN-QUESTIONS.md` (Q-068/Q-069 → resueltas por dueño, con la decisión).
7. Correr `pnpm verify` completo.

## Comandos de verificación
- `pnpm decor:report`
- `pnpm verify`
