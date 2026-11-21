# SPEC-R — Edificios más grandes (T-101)
Origen: pedido del dueño: agrandar **todos los edificios** un **+25 %** de su tamaño actual, **excepto la Liga**, que agranda un **+75 %** del tamaño actual (post SPEC-Q: `league` quedó en 2.3). **La cámara, la vista, los nodos y los caminos no se tocan.** Cambio visual post-congelamiento (SPEC-O/T-098/AC-3): va como tarea nueva, sin ajustes "de pasada".

## T-101 Agrandar todos los edificios (+25 %; Liga +75 %)
- AC-1 En `content/board/placements.json` cambian **únicamente los valores de `footprints` y `heights`** (base: valores actuales del archivo). Nuevos máximos (redondeo a 2 decimales):
  - Huella (`footprints`): `gym` 1.1 → **1.38** · `pokecenter` 1.0 → **1.25** · `market` 0.85 → **1.06** · `league` 2.3 → **4.03** · `house` 0.7 → **0.88** · `lab` 1.2 → **1.5**.
  - Altura (`heights`): `gym` 1.1 → **1.38** · `pokecenter` 0.9 → **1.13** · `market` 0.72 → **0.9** · `league` 2.3 → **4.03** · `house` 0.65 → **0.81** · `lab` 1.1 → **1.38**.
  - No cambian `minGaps`, `search`, `removeStacks`, `proceduralBuildings`, `models` ni `nodes` (la entrada `liga` conserva `sideDeg` 11, `distHint` 1.3 y su nota) (test).
- AC-2 Cero cambios de código en la normalización: `normalizeModel`/`normalizeParts` siguen tomando la escala menor entre altura y huella (SPEC-N/T-089/AC-5). El efecto viene solo del dato nuevo de `placements.json`.
- AC-3 El solver no se relaja: ningún edificio puede pisar caminos, nodos, agua ni otros edificios (`minGaps` intacto). El propio solver ya puede alejar (hasta `distMax` 1.8), rotar y achicar (hasta `scaleFloor` 0.7) como hoy; si un edificio no llega a escala 1, **no** se relaja ninguna regla: queda a la escala máxima que entre y se registra en `docs/OPEN-QUESTIONS.md` (kind, escala final) para que el dueño decida. La Liga (huella objetivo 4.03) es la candidata más probable a no entrar entera.
- AC-4 `pnpm placements:report` y `pnpm decor:report` sin solapamientos con las huellas nuevas (el plan de decoración lee `footprints` de placements.json en vivo, así que el despeje alrededor se recalcula solo). El reporte muestra la escala final por edificio y lista los que no llegaron a escala 1.
- AC-5 Tests (uno por AC, con comentario `// AC: SPEC-R/T-101/AC-n`): (a) en placements.json solo cambiaron `footprints` y `heights` con los valores exactos de AC-1; (b) cada edificio del archivo real cumple footprint/height ≤ máximo nuevo (+ε) con escala dentro de [scaleFloor, 1]; (c) los tests que fijaban los valores viejos (1.1/1.0/0.85/2.3/0.7/1.2 y alturas) se actualizan; (d) cero solapamientos.
- AC-6 Reporte `tasks/reports/T-101.md`: tabla `kind → valores viejos → nuevos → escala final`, salida de `placements:report`/`decor:report`, edificios que no llegaron a escala 1 (si los hay) y `pnpm verify` verde.

## Qué mirar (dueño)
- Todos los edificios se ven ~25 % más grandes y la Liga ~75 % más grande, sin pisar caminos, nodos, agua ni decoración (`pnpm shots`; en `/dev/models` se ve el tamaño final de cada kind).
- Si la Liga quedó a escala < 1 (más chica que el objetivo), está listada en `docs/OPEN-QUESTIONS.md` para decidir.
