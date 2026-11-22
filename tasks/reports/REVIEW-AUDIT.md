# REVIEW-AUDIT — auditoría visual de las 23 tareas en REVIEW (N-0033)

Cómo: app en `localhost:5188`, Playwright/Chromium 1440×810 (el panel integrado no pudo abrir localhost), WebGL por software (muy lento: ~1 M triángulos, animaciones muestreadas a saltos). Partida `?seed=7`, inicial Squirtle. Se usó `V`/`C`/`Q`, `__debug.sceneDump()`/`aimCamera`, encuentro con Abra, `/dev/*`, `/admin/cards`. Nada de código ni estados tocados.
Leyenda: **C** cumple · **CP** cumple parcial · **NC** no cumple · **NM** no se pudo mirar.

| id | qué pedía | veredicto | evidencia |
|---|---|---|---|
| T-085 | Cámara con picada real, no cenital | C | sceneDump: explore `pitchDeg` 38, overview 50; `C`/`V` reaplican el ángulo del modo; vista oblicua clara. Clamp 70° al arrastrar no probado. |
| T-086 | Modelos negros: arreglo + `models:check` | C | gim/pokemart/pokecenter/oak/league se ven texturados, ninguno negro (capturas de cerca). `/dev/models-check` solo muestra un cuadro gris; `pnpm models:check` no corrido. |
| T-088 | Etiquetas sin cortes; manchas de niebla sin píxeles | CP | Etiquetas de una línea y completas. Pero el cerro marrón tiene sombreado en bloques/píxeles visibles y el lago es un polígono facetado de bordes duros. |
| T-089 | Edificios a los costados del camino | C | Los 21 modelos fuera del trazado; distancia al nodo más cercano 0,95–1,45 u; ninguno sobre una arista en vista cenital. |
| T-090 | Quitar pedestales Ítem/Sorpresa | C | Vista cenital: solo los 5 hexágonos de terreno. Animación de robar desde el nodo: no observada. |
| T-091 | Modelos `gim`/`pokecenter`/`pokemart`/`league` | CP | Los 4 cargan y se ven bien; solo `gim` con bandera de líder no verificada. La Liga hoy es enorme (huella 4,03) y queda a ~3 u de su nodo (ver T-100). |
| T-092 | Dado 3D fijo en panel del HUD | C | `panel-dice` fijo (8,397, 238×121) con cubo; tira, muestra "Dado de movimiento 1 · Últimas: 1" y la ficha avanza. Giro animado no capturado. |
| T-093 | Cierre visual MVP (capturas, checklist) | NM | `pnpm shots`/`mvp:checklist` no corridos; el reporte es de artefactos, no de pantalla. Lo visto no contradice "congelado". |
| T-097 | Etiquetas siempre encima y legibles | CP | Se dibujan sobre edificios y se leen (overview). Pero "Pueblo Paleta" aparece `visible:false, reason:collision` y falta en la vista inicial. |
| T-098 | Cierre visual final | NM | Depende de T-101 (TODO) y del reporte de shots (2 fallidas, 404 de textura Oak Lab); no se regeneró nada. |
| T-099 | `oak`, sin edificios procedurales, +20 % | CP | `lab:new` (oak.glb) correcto y sólido. Queda `landmark:paleta:house:0 source:procedural` en la escena (oculta bajo el hgss), contra AC-B de nunca procedurales. |
| T-100 | Materiales fieles: alfa real, sin sombras negras | NC | La casa de Paleta (hgss) se ve con techo/paredes semitransparentes en primer plano. El reporte trata otra cosa (tamaño Liga a 2,3) y `placements.json` hoy dice 4,03. |
| T-108 | Resultado del combate + Continuar | C | Ganando a Abra: overlay "¡Ganaste el combate!" + botón Continuar; al pulsarlo sigue "¿Capturar a Abra?". |
| T-109 | Rediseño del combate maximizado | CP | Lienzo con carta mía · escena · carta rival, dados debajo, pestañas Atacar/Cambiar/Mochila/Dejar ir, sin Pasar, daño visible. A velocidad normal el dado propio nunca rodó (`roll-id` 0, el rival sí); en `skip` mostró "Dado de condición 4". |
| T-102a | Lector: base, normalización, segmentación | NM | CLI (`cards:scan`); no hay escaneos (`docs/reference` vacío). Solo UI: `/admin/cards` abre. |
| T-102b | Lector: OCR y análisis de ataques | NM | CLI sin escaneos; no observable en navegador. |
| T-102c | Lector: íconos con aprendizaje | NM | CLI; íconos de energía de `/dev/icons` listados, el aprendizaje no. |
| T-102d | Lector: mapeador texto → efectos | NM | Lógica pura; sin superficie visual. |
| T-102e | Lector: JSON, reporte HTML, carta de oro | NM | Reporte HTML/medición requiere escaneos ausentes. |
| T-103 | Lector v2: medición por etapa (`cards:eval`) | NM | CLI; el reporte describe otra cosa (carta y ataques) que la fila del backlog. |
| T-104 | Lector v2: nombre/mazo desde archivo | NM | CLI. Reporte habla de costos/ilegalidad, no de nombre de archivo. |
| T-105 | Lector v2: reconocedor de números y caras | CP | Solo se ve la carta fija en `/admin/cards` (arte en caja de alto fijo, bien). Reconocedor no observable; reporte difiere de la fila. |
| T-106 | Lector v2: preproceso, OCR, vocabulario | NM | CLI sin escaneos. |

Resumen: 23 filas — C 6 · CP 6 · NC 1 · NM 10.

## No cumplen / cumplen parcial, por impacto visual
1. **T-100 (NC)** — Casa de Paleta translúcida en vista cercana; revisar alfa/`depthWrite`/transparencia del hgss y reconciliar lo que dice el backlog con lo que se hizo. La Liga (4,03) quedó muy grande y separada de su tile: fijar tamaño/posición.
2. **T-088 (CP)** — Cerro con bloques pixelados y lago facetado: suavizar luminosidad/mallas de manchas.
3. **T-109 (CP)** — El dado propio no rueda en el primer ataque a velocidad normal: forzar el giro en ambos lados.
4. **T-097 (CP)** — Falta la etiqueta "Pueblo Paleta" en la vista inicial (colisión): dar prioridad a la casilla de inicio.
5. **T-091 (CP)** — Liga a ~3 u de su casilla; revisar escala/ubicación.
6. **T-099 (CP)** — Quitar la pieza procedural oculta `paleta:house` para cumplir "nunca procedurales".
7. **T-105 (CP)** — Reconocedor sin superficie visual; verificar con escaneos.
8. **T-093, T-098** — correr `pnpm shots`/`mvp:checklist` en una sesión con GPU y regenerar.
9. **T-102a–e, T-103, T-104, T-106** — son CLI con escaneos ausentes; verificarlas con los escaneos del dueño (T-103/T-104/T-105 tienen reportes que no coinciden con su fila).
