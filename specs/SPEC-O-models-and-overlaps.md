# SPEC-O — Modelos nuevos en uso y decoración sin solapamientos (T-094…T-098)
Origen: nueva captura del dueño tras correr los pasos anteriores. Problemas: (1) **los modelos nuevos (`gim`, `pokecenter`, `pokemart`, `league`) no se están usando**: todos los edificios siguen siendo cajas rojas; (2) **agua, árboles, rocas y casas se superponen**; aparecen objetos **celestes con forma de cristal** que no corresponden a ninguna categoría; (3) siguen las manchas grandes azules/violetas con bloques; (4) algunas etiquetas quedan tapadas por edificios. La cámara libre y la vista **están bien** (no tocarlas). Nodos y caminos no cambian. Trabajar según `docs/NO-VISION.md`; usar `/diagnostica-visual` antes de arreglar.

## T-094 Usar de verdad los modelos nuevos
Causas probables (verificar, en este orden): la carpeta `assets-src/new/` no se sirve en desarrollo (solo `public/` se sirve) y nunca se ejecutó la importación; el nombre o la extensión no coincide con lo esperado; formato no soportado; el modelo falló un chequeo (negro, tamaño) y el fallback procedural entró **en silencio**; o el manifiesto marca el modelo como rechazado.
- AC-1 `pnpm models:use-new`: busca en `assets-src/new/` (sin distinguir mayúsculas) los nombres base `gim`, `pokecenter`, `pokemart`, `league` (admitir sufijos `_01`). Imprime una tabla `kind → archivo/extensión/KB/triángulos` o `FALTA`, **termina con error si falta alguno**, copia los hallados a `apps/web/public/models/new/` y escribe `content/board/models.new.json` (`kind`, archivo, `yawOffsetDeg`, estado). Si hay una extensión no soportada la lista y explica cuáles sí (`.glb/.gltf`, `.obj`+`.mtl`, `.fbx`).
- AC-2 Orden de resolución por `kind` (gym, pokecenter, market, league): **modelo nuevo → HGSS → Kenney → procedural**. Los edificios nuevos pasan por `normalizeModel` con los máximos de `placements.json` y por los chequeos de T-086 (normales, texturas, brillo). **No** se aplica la regla de matiz de color a edificios (pueden ser de cualquier color).
- AC-3 **Fallback ruidoso**: cuando un `kind` cae a una pieza procedural, se registra una vez `console.warn` con el motivo (no encontrado, error de carga, falló chequeo, rechazado) y se agrega a `window.__debug.modelsReport()`. Con `?debug=1` se muestra una insignia (`data-testid="debug-models"`) con una línea por `kind`: `gym ✔ gim.glb` o `pokecenter ✖ procedural: <motivo>`.
- AC-4 Test que corre solo si existe `assets-src/new/`: los cuatro `kind` resuelven a modelo (no a fallback); si no existe la carpeta, el test se omite con un mensaje claro.
- AC-5 Reporte `tasks/reports/T-094.md` con la **causa raíz** hallada y la salida de `models:use-new`.
- Qué mirar (dueño): con `?debug=1` la insignia dice ✔ en los cuatro tipos y, en el juego, los gimnasios, Centros, Mercados y la Liga ya no son cajas rojas.

## T-095 Colocación sin solapamientos (mapa de ocupación único)
Datos: `content/board/decor.collision.json`.
- AC-1 Un único `OccupancyMap` registra la huella 2D de **todo**: caminos/nodos (buffers), edificios (OBB de `placements.json`), pedestales de mazo, cuerpos de agua, montañas, árboles, rocas, arbustos, faroles/cercas/carteles y flora. Prohibido colocar objetos fuera de este mecanismo.
- AC-2 Orden de colocación por prioridad (`sampling.order`): agua → montañas → faroles/cercas/carteles → árboles → rocas → arbustos → flora, con *poisson-disk* determinista por zona; un objeto solo se coloca si su huella no pisa algo de **mayor o igual** prioridad (salvo `allowOverlap`, que solo permite flora bajo árboles, arbustos y rocas).
- AC-3 **Agua limpia**: el cuerpo de agua de cada zona se coloca primero, en el punto con más espacio libre del panel (radio preferido 1,3; mínimo 0,8; si no entra, se reduce, y si no hay lugar se omite el estanque). Alrededor (`margin` 0,35) no puede haber árboles, rocas, arbustos, montañas, edificios ni pedestales; en la orilla (`shoreBand` 0,25) solo se permiten juncos y guijarros.
- AC-4 **Una zona por objeto**: cada objeto pertenece a la zona del centro de panel más cercano y solo se coloca dentro de ella (con `inset` 0,3) restando los buffers. Rocas de Montaña no entran en Isla, ni árboles de Bosque en el lago, etc.
- AC-5 **Objetos celestes de cristal**: identificarlos con `sceneDump` (nombre/categoría) y corregir la causa (probable material mal convertido o categoría sin color). Verificación de color por categoría (`colorSanity`): si el color dominante de una instancia queda fuera del rango, se usa la pieza procedural; ningún objeto sin categoría puede existir.
- AC-6 `pnpm decor:report` genera `shots/decor-overlaps.svg` (vista cenital con la **orientación de la foto del tablero**: caminos en gris, edificios en rojo, agua en azul, árboles/arbustos en verde, rocas en marrón, flora en puntos; **los solapamientos en rojo intenso**) y `shots/decor-overlaps.report.json` (cantidad por categoría y lista de pares solapados). El dueño abre el SVG en el navegador.
- AC-7 Tests numéricos: **cero** solapamientos entre categorías no permitidas; cero objetos sobre caminos/nodos; ningún árbol/roca/edificio dentro del agua (+ margen); cada objeto dentro de su zona; mismo seed ⇒ mismo resultado; presupuestos de dibujo (`profiles.high`) se mantienen (si hay que quitar objetos para cumplir, se quitan los de menor prioridad).
- Qué mirar (dueño): en `decor-overlaps.svg` no aparece rojo; el lago está limpio salvo juncos; no hay árboles dentro de casas ni rocas sobre caminos.

## T-096 Manchas de zona sin volúmenes translúcidos
- AC-1 Se eliminan los volúmenes translúcidos grandes (azul y violeta) sobre el tablero. El color de cada zona pasa a ser solo un **tinte del suelo**, sin transparencia.
- AC-2 El tinte se genera con una **textura de bioma** (≥ 1024×1024, filtro lineal, desenfoque gaussiano) o con una grilla de vértices de ≤ 0,1 en el área del tablero, para que no haya bloques cuadrados. Los biomas se mezclan con distancia continua (radio y fundido de `style.json`).
- AC-3 `mist` (Pantano) como máximo opacidad 0,10, tamaño ≤ 1,2 y fuera de caminos y nodos (usa el mapa de ocupación).
- AC-4 Tests numéricos: ningún objeto con `transparent` y `opacity` > 0,12 y diámetro > 1,2; diferencia máxima de color entre texels/vértices vecinos < 0,08; `NearestFilter` solo en texturas de modelos HGSS.

## T-097 Etiquetas siempre legibles
- AC-1 Las etiquetas de ciudad se dibujan **encima** de todo (`depthTest:false`, `renderOrder` alto) y se anclan 0,5 unidades por encima del nodo, de modo que ningún edificio las tape.
- AC-2 Se mantienen las reglas de T-078 (prioridad, sin solapamiento entre etiquetas, nunca cortadas).
- AC-3 Test: ninguna etiqueta visible queda cubierta por la caja en pantalla de un edificio (comprobación sobre `sceneDump`).

## T-098 Cierre
- AC-1 Correr `pnpm shots`, `pnpm placements:report` y `pnpm decor:report` y adjuntar el resumen en `tasks/reports/T-098.md`.
- AC-2 Checklist: modelos nuevos activos (insignia ✔ ×4); cero solapamientos; sin objetos celestes sueltos; sin manchas translúcidas; etiquetas visibles; cámara y vista sin cambios; `pnpm verify` verde.
- AC-3 Se congela el aspecto: cualquier cambio visual posterior va como tarea nueva.

## Orden
T-094 → T-095 → T-096 → T-097 → T-098.
