# SPEC-M — Correcciones visuales urgentes (T-085…T-088)
Origen: captura del juego con los modelos nuevos. Problemas observados: (1) cámara casi **cenital** (se ve todo desde arriba), (2) edificios **negros** y **gigantes** que tapan nodos y caminos, (3) etiquetas **cortadas** ("Isla Can", "Ciudad Plat"), (4) manchas de niebla azul/violeta **pixeladas** (bloques cuadrados) sobre el tablero. Trabajar según `docs/NO-VISION.md`; usar el comando `/diagnostica-visual` antes de tocar nada. Estas correcciones van **antes** de `SPEC-L` (escala) y de seguir con T-070/T-079/T-081.

## T-085 Cámara: ángulo de picada real
Definición: **picada** (`pitchDeg`) = ángulo entre la dirección de mirada y el plano horizontal (0° = horizontal, 90° = cenital). Con `OrbitControls`, `polar = 90° − pitch`. Si el código mezcló ambos, esa es la causa.
- AC-1 `explore`: picada por defecto 38° (±3), rango permitido 20°–60°. `overview`: 50° (rango 35°–65°). `follow`: 28°. `fork`: 38°. Ningún modo supera 70° (clamp duro, también al arrastrar o con la rueda).
- AC-2 `camera.json` documenta que `elevationDeg` = picada y se agrega `pitchDegRange` explícito; se elimina `polarDegRange` o se convierte con la fórmula.
- AC-3 "Centrar en mí" y "Vista general" aplican los ángulos de su modo (no conservan la picada anterior).
- AC-4 Test numérico por modo: `pitch = asin(-forward.y)` dentro del rango y del valor por defecto; el sceneDump informa `pitchDeg`.
- Qué mirar (dueño): al abrir la partida el terreno se ve en perspectiva, con horizonte o cielo arriba, y los edificios se ven de costado y no como techos planos.

## T-086 Modelos negros (diagnóstico y arreglo)
Causas probables (verificar con `/diagnostica-visual modelos negros`, en este orden): normales faltantes en el OBJ; texturas que no cargan (ruta relativa del `.mtl`, mayúsculas/minúsculas, nombres con espacios); `Kd` negro en el MTL; la conversión a toon pierde el `map`; `alphaTest` que descarta todo; luces que no llegan; caras con normales invertidas.
- AC-1 Todo `BufferGeometry` sin atributo `normal` recibe `computeVertexNormals()` al cargar.
- AC-2 El cargador resuelve texturas con `setResourcePath` al directorio del modelo, tolerando mayúsculas/minúsculas y espacios; si una textura no carga, el material usa un color neutro del `kind` (nunca negro) y se registra una advertencia con el nombre del modelo.
- AC-3 La conversión toon conserva `map` (con `colorSpace` sRGB) y `alphaTest` solo si el material es realmente transparente; opción `keepOriginalMaterial` por modelo.
- AC-4 Chequeo automático sin ojos: `pnpm models:check` (página `/dev/models-check` en Playwright) renderiza cada modelo aprobado sobre fondo gris con luz neutra y mide el **brillo medio** de sus píxeles y el **porcentaje de píxeles oscuros** (< 0,08). Falla el modelo si el brillo medio < 0,18 o los oscuros > 35 %. Los que fallan quedan `status:"failed"` en el manifiesto y el juego usa la pieza procedural.
- AC-5 `pnpm verify` incluye un test de que ningún material del juego tiene color negro puro sin textura cargada.
- AC-6 Reporte `tasks/reports/T-086.md` con la causa raíz encontrada y la tabla antes/después de brillo por modelo.

## T-087 Tamaño y huella de los modelos
- AC-1 `normalizeModel` escala por **altura objetivo** y además limita la **huella** (`Box3` en X/Z) a `maxFootprint` por `kind`: casa ≤ 1,0, Centro/Mercado ≤ 1,2, laboratorio ≤ 1,3, gimnasio ≤ 1,3, Liga ≤ 1,8, farol ≤ 0,25, árbol ≤ 0,6, roca ≤ 0,5. Se toma la escala menor de las dos.
- AC-2 Colocación: ningún edificio puede solapar el círculo de un nodo (radio 0,45) ni una arista (0,3) ni otro edificio (0,15). Si el offset de `decor.json` no cumple, se desplaza hacia afuera en pasos de 0,1 (máx. 1,0) a lo largo de la normal que se aleja de la arista más cercana; si no hay lugar, se reduce la escala hasta 70 % y, por último, se descarta ese edificio con una advertencia.
- AC-3 Test numérico recorriendo todos los nodos con landmark: cero solapes y huella ≤ límite; el reporte lista los descartados.
- AC-4 Los edificios miran hacia el nodo (rotY) y quedan "detrás" del camino respecto de la cámara por defecto cuando sea posible.
- Qué mirar (dueño): cada casillero se distingue y ningún edificio lo tapa; los edificios tienen tamaño parecido entre sí.

## T-088 Etiquetas sin cortes y manchas sin píxeles
- AC-1 Etiquetas: `white-space: nowrap`, sin `overflow:hidden` ni `max-width` en el contenedor, anclaje centrado sobre el nodo y desplazamiento para quedar dentro del viewport con 8 px de margen. Test: la caja de cada etiqueta visible está completa dentro del viewport y su `scrollWidth ≤ clientWidth`.
- AC-2 `mist` y las manchas de zona: opacidad máxima 0,12, se generan solo dentro de su zona, tamaño ≤ 1,2 y nunca cubren nodos o caminos (`clearance`). Se eliminan los discos translúcidos grandes de color azul/violeta sobre el tablero.
- AC-3 Terreno suave: los colores por vértice se interpolan sin escalones; test numérico: diferencia máxima de color entre vértices adyacentes < 0,08 y `segments ≥ 120`. `NearestFilter` se usa **solo** en texturas de modelos HGSS, nunca en terreno, glifos ni mapas de bioma.
- AC-4 Los biomas no tienen bordes cuadrados: se evalúan con distancia continua (T-079); si T-079 aún no se hizo, solo se corrige la interpolación.
- Qué mirar (dueño): nombres de ciudad completos y legibles; el terreno sin bloques cuadrados ni manchas oscuras.

## Orden
T-085 → T-086 → T-087 → T-088. Después: `SPEC-L` (T-083 escala → elegir escala → T-084 plazas) y recién entonces seguir con T-079, T-080, T-070 y T-081. Tras cada una: `pnpm shots` y mirar lo indicado.
