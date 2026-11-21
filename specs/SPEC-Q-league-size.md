# SPEC-Q — La Liga más grande (T-100)
Origen: pedido del dueño: el edificio de la Liga Pokémon (`assets-src/new/league.glb`, único edificio del nodo `liga`) se dibuja chico. Se agranda **solo la Liga** (~+50 %). **La cámara, la vista, los nodos y los caminos no se tocan.** Cambio visual post-congelamiento (SPEC-O/T-098/AC-3): va como tarea nueva, sin ajustes "de pasada".

## T-100 Agrandar la Liga (~+50 %, solo `league`)
- AC-1 En `content/board/placements.json` cambian **únicamente dos valores**: `footprints.league: 1.55 → 2.3` y `heights.league: 1.55 → 2.3`. Los máximos de `gym`, `pokecenter`, `market`, `house` y `lab` quedan igual (test), y tampoco cambian `minGaps`, `search`, `removeStacks`, `proceduralBuildings`, `models` ni `nodes` (la entrada `liga` conserva `sideDeg` 11, `distHint` 1.3 y su nota).
- AC-2 Cero cambios de código en la normalización: `normalizeModel`/`normalizeParts` siguen tomando la escala menor entre altura y huella (SPEC-N/T-089/AC-5). El efecto viene solo del dato nuevo de `placements.json`.
- AC-3 El solver no se relaja: la Liga no puede pisar caminos, nodos, agua ni otros edificios (`minGaps` intacto). El propio solver ya puede alejarla (hasta `distMax` 1.8) y rotarla como hoy; si aun así no llega a escala 1, **no** se relaja ninguna regla: queda a la escala máxima que entre y se registra en `docs/OPEN-QUESTIONS.md` para que el dueño decida.
- AC-4 `pnpm placements:report` y `pnpm decor:report` sin solapamientos con la huella nueva (el plan de decoración lee `footprints` de placements.json en vivo, así que el despeje alrededor se recalcula solo). El reporte muestra la escala final del edificio `liga` (objetivo 1.0 ⇒ huella/altura final 2.3).
- AC-5 Tests (uno por AC, con comentario `// AC: SPEC-Q/T-100/AC-n`): (a) solo `league` cambió en placements.json; (b) el edificio `liga` del archivo real cumple footprint/height ≤ 2.3 (+ε) con escala dentro de [scaleFloor, 1]; (c) los tests que fijaban 1.55 se actualizan al valor nuevo; (d) cero solapamientos.
- AC-6 Reporte `tasks/reports/T-100.md`: valores nuevos, escala final de la Liga, salida de `placements:report`/`decor:report` y `pnpm verify` verde.

## Qué mirar (dueño)
- La Liga se ve ~50 % más grande al este del nodo, sin pisar el camino, el nodo ni la decoración; todo lo demás quedó igual (comparar `pnpm shots`; en `/dev/models` se ve el tamaño final del kind `league`).
