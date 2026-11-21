# SPEC-P — Ajustes finales de modelos (T-099)
Origen: captura del dueño: el tablero se ve muy bien; faltan 3 ajustes. **La cámara, la vista, los nodos y los caminos no se tocan.** Trabajar según `docs/NO-VISION.md`.

## T-099 Ajustes finales de modelos (3 partes en una tarea)

### Parte A — Modelo `oak` para los laboratorios (Oak)
- AC-A1 En `assets-src/new/` hay un modelo `oak` (extensión a detectar: `.glb/.gltf`, `.obj`+`.mtl` o `.fbx`). Se usa para el `kind` **`lab`**, es decir, los dos nodos Oak (`oak_t` y `oak_b`).
- AC-A2 `pnpm models:use-new` pasa a esperar **cinco** nombres base: `gim`, `pokecenter`, `pokemart`, `league` y `oak`; los copia a `apps/web/public/models/new/`, actualiza `models.new.json` y falla si falta alguno.
- AC-A3 Orden de resolución del `kind` `lab`: modelo nuevo `oak` → HGSS → Kenney → (nada, ver Parte B). Pasa por `normalizeModel` y por los chequeos de T-086 como los demás.
- AC-A4 La insignia de debug (`?debug=1`, `data-testid="debug-models"`) muestra cinco líneas, una por `kind` (gym, pokecenter, market, league, lab).

### Parte B — Dejar de generar los edificios negros dibujados por código
Los cuerpos negros que se ven en la captura son las piezas procedurales viejas (o duplicados). Ya no deben existir.
- AC-B1 Regla: **un solo edificio por nodo con landmark**. Para los `kind` `gym`, `pokecenter`, `market`, `league` y `lab` **nunca** se dibuja la pieza procedural; si el modelo falta o falla, no se dibuja nada y se avisa (`console.warn` + insignia ✖), nunca una caja.
- AC-B2 `placements.json › proceduralBuildings: false` activa esa regla (sin código a medida por nodo). Las casas de Pueblo Paleta (`house`) conservan su pieza actual, pero **nunca con color negro**: si su material resulta negro, se corrige con la paleta (`wall #EADBB8`, `roof #C84B3A / #3B6FB6`).
- AC-B3 Si hoy existen duplicados (modelo nuevo + pieza procedural en el mismo nodo), se elimina la procedural. Identificar el origen de cada edificio en `sceneDump` con el campo `source` ∈ {`new`, `hgss`, `kenney`, `procedural`}.
- AC-B4 Tests: (a) para cada nodo con landmark existe **exactamente un** grupo de edificio; (b) ningún edificio de los cinco `kind` tiene `source:"procedural"`; (c) ningún grupo de edificios tiene brillo medio < 0,18 (negro); (d) la cantidad total de edificios coincide con la cantidad de nodos de `placements.nodes` menos los descartados por falta de espacio.
- AC-B5 Reporte `tasks/reports/T-099.md` con la tabla `nodo → kind → source → archivo`, indicando cuántos negros/duplicados se eliminaron y de dónde venían.

### Parte C — Un poquito más de tamaño en los modelos nuevos
- AC-C1 Fusionar `content/board/placements.patch.json` dentro de `placements.json` **sin reemplazarlo** (conservar `yawOffsetDeg`, `nodes`, `minGaps`, `search`, etc.) y borrar el archivo `.patch.json` al terminar.
- AC-C2 Nuevos máximos (≈ +20 %): huella gym 1,1 · pokecenter 1,0 · market 0,85 · league 1,55 · lab 1,2; altura gym 1,1 · pokecenter 0,9 · market 0,72 · league 1,55 · lab 1,1. `normalizeModel` sigue tomando la escala menor entre altura y huella.
- AC-C3 El algoritmo de ubicación no cambia: `minGaps` y las reglas de alejar/rotar/achicar (hasta `scaleFloor`) siguen valiendo. Ningún edificio puede pisar caminos, nodos, agua ni otros edificios.
- AC-C4 `pnpm placements:report` y `pnpm decor:report` (si existen) se vuelven a correr; el reporte lista los edificios que **no** pudieron llegar al tamaño nuevo (y su escala final) y cualquier descartado. Objetivo: cero solapamientos.
- AC-C5 Tests: huella y altura de cada edificio ≤ máximos nuevos; cero solapamientos; ningún edificio con escala menor a 0,7 del máximo sin quedar listado en el reporte.

## Qué mirar (dueño)
- Con `?debug=1`: cinco líneas ✔ (gym, pokecenter, market, league, lab).
- Ya no hay cajas negras; en cada ciudad hay un solo edificio y es el modelo nuevo.
- Los modelos se ven un poco más grandes sin tocar caminos ni nodos (`shots/placements.svg` sin rojo).
