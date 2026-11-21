# SPEC-T — Lector de cartas v2: precisión medida y aprendida (T-103…T-107)
Origen: tras correr T-102 sobre 266 escaneos **profesionales** (recortados, iluminados, con buen color), el resultado fue: 4 verificadas, 16 en revisión, 230 a corregir y 15 "fotos a rehacer". Los fallos: HP (≈18), caras del dado (≈13), nombres (≈6), íconos y **segmentación** (12 escaneos de gimnasio/Liga + 3 iniciales). **La calidad del escaneo no es la causa.** Causas probables (a confirmar con T-103): (1) un OCR de uso general (Tesseract) es débil con números chicos dentro de círculos, con `4-5_` (guion + guion bajo) y con letra serif en negrita sobre un fondo degradado; (2) la imagen se normalizó a 700×1060 y se leyó sin ampliarla ni limpiar el fondo; (3) se usó OCR para campos que ya se conocen por el **nombre del archivo** (Pokémon y mazo); (4) la segmentación se diseñó para el diseño de terreno (separadores rojo oscuro) y falla con gimnasio/Liga; (5) no hay realimentación: las cartas verificadas no mejoran la lectura de las demás.
Principio: **medir primero, y reemplazar OCR general por reconocimiento aprendido donde el vocabulario es cerrado** (números, caras, íconos), y por corrección contra vocabulario conocido en el texto. Todo gratis y local. **No re-fotografiar nada hasta terminar T-104** (salvo la carta desteñida de Charmander). Nunca se sobrescribe una carta con `verified:true`.

## T-103 Medición y diagnóstico (`pnpm cards:eval`)
- AC-1 Verdad terreno = cartas con `source.verified:true` en `_staging`/`content/pokemon` + la carta de oro. Si hay menos de 20, el reporte lo dice y pide al dueño confirmar las 16 "en revisión" (se muestran con una tecla de aceptar/corregir).
- AC-2 Para cada campo (nombre del ataque, caras, daño, costos, HP, elemento, etapa, evolución, efectos) calcula exactitud y **en qué etapa falla**: segmentación, OCR, análisis, íconos o mapeo de efectos.
- AC-3 Guarda recortes de cada error en `content/photos/scan-reports/failures/<campo>/` con `esperado` y `leído` en el nombre del archivo, y una tabla de confusiones frecuentes (p. ej. `5→S`, `-→~`, `_→.`).
- AC-4 Compara motores de OCR sobre las mismas regiones: A) Tesseract actual, B) Tesseract con el preproceso de T-106, C) RapidOCR (modelos de PaddleOCR vía ONNX, instalación liviana por `pip`), D) PaddleOCR (más pesado, a probar si C no alcanza). Imprime una tabla comparativa de exactitud y tiempo por carta. (Una comparación pública reciente muestra resultados dispares entre motores según la prueba: **decide la medición propia**.)
- AC-5 El motor elegido queda en `content/cards/scan-config.json › ocr.engine`.
- AC-6 `tasks/reports/T-103.md` con la tabla, las 5 causas ordenadas por cantidad de cartas afectadas y el plan resultante.

## T-104 Datos del nombre del archivo y segmentación por perfil
- AC-1 **Nombre y mazo salen del nombre del archivo** (el dueño renombró todos con el Pokémon y su mazo). Analizador tolerante (sin distinguir mayúsculas ni tildes; separadores `_`, `-`, espacio): detecta el nombre del Pokémon (contra la lista de PokeAPI si existe, con distancia ≤ 2) y el mazo/grupo (`bosque`, `montana|montaña`, `isla|lago`, `llanura`, `pantano`, `evolucion`, `sorpresa`, `gimnasio|gym` + líder, `liga|league` + entrenador); un número final es copia/variante. Lo que no pueda interpretar se marca `needsReview` y cae al OCR.
- AC-2 El OCR del encabezado queda **solo como verificación**: si el nombre leído difiere del del archivo, se avisa (no se usa el leído).
- AC-3 **Segmentación independiente del color** y por perfil (`terrain`, `gym`, `league`): detectar separadores con perfil de proyección horizontal (densidad de bordes y líneas oscuras de cualquier tono), la línea gruesa del pie y los bloques de texto; no depender de rojo oscuro.
- AC-4 Criterio de éxito: segmentación correcta (≥ 1 bloque de ataque, pie encontrado, cantidad de bloques igual a la de la verdad terreno cuando exista) en ≥ 95 % de los escaneos de **gimnasio y Liga** y en el 100 % de los demás. Las superposiciones de depuración (`debug/*.png`) se regeneran para el dueño.
- AC-5 El informe lista las imágenes que siguen fallando y **el motivo concreto**; solo entonces se pide al dueño volver a escanear esas.

## T-105 Reconocedor de números y caras (aprendido, un solo etiquetado)
- AC-1 Segmenta glifos (componentes conectados) en: círculo de HP, columna de daño `(10)`/`(+10)` y prefijo de caras `4-5_`. Un detector del círculo blanco del HP (color/forma) lo recorta aunque cambie de posición.
- AC-2 `pnpm cards:glyphs:learn`: agrupa los glifos de una muestra por parecido y genera `scan-reports/glyphs.html` para **ponerles nombre una sola vez** (`0–9`, `-`, `_`, `(`, `)`, `+`); exporta `content/cards/glyph-labels.json`.
- AC-3 Clasificación por centroide con confianza. Restricciones del dominio: HP 20-150 múltiplo de 10; daño 0-200 múltiplo de 10; caras ∈ 1-6 en orden ascendente con `-`; el prefijo termina siempre en `_`. Si una lectura viola una restricción, se prueba la segunda mejor hipótesis antes de marcar `needsReview`.
- AC-4 Exactitud objetivo sobre la verdad terreno: HP ≥ 98 %, caras del dado ≥ 95 %, daño ≥ 97 %.

## T-106 Motor de texto con preproceso y corrección por vocabulario
- AC-1 Preproceso por bloque: conservar la resolución original; ampliar ×3 (Lanczos); escala de grises con CLAHE o canal de mayor contraste; **eliminar el fondo degradado** con umbral adaptativo local (Sauvola/Otsu por ventanas); dos variantes (claro/oscuro) y **votación** entre lecturas.
- AC-2 Motor según T-103 (la herramienta puede ser Python con `rapidocr-onnxruntime` o `paddleocr`; las dependencias de Python solo viven en `tools/`, con `requirements.txt`, y se exponen por un script `pnpm cards:ocr`). Contrato estable: entrada = imagen de región; salida = texto + confianza por línea.
- AC-3 **Vocabulario aprendido** (`content/cards/vocab.json`, generado por `pnpm cards:learn` desde las cartas verificadas): nombres de ataques y habilidades, y **frases de efecto normalizadas** (con los números reemplazados por marcadores). Cada texto leído se ajusta a la frase conocida más parecida si la distancia de edición relativa ≤ 15 %; los nombres de ataque, si la distancia ≤ 2.
- AC-4 Las frases de `effect-patterns.json` se usan también como vocabulario de ajuste.
- AC-5 Exactitud objetivo: nombre de ataque ≥ 92 % y texto de efecto exacto ≥ 80 % (medidos con `cards:eval`).

## T-107 Relectura iterativa y correcciones de un clic
- AC-1 `pnpm cards:rescan --use-verified [--only-unverified]` vuelve a leer solo lo no verificado con el vocabulario, los glifos y la segmentación actualizados; **nunca** modifica cartas `verified:true`.
- AC-2 Informe antes/después: cuántas cartas quedan **sin** `needsReview`, cuántas con un solo campo dudoso y cuántas con más; mejora por campo.
- AC-3 En `report.html` y en `/admin/cards`, cada campo dudoso muestra la **mejor sugerencia** (y la segunda) con su confianza y un botón "aceptar"; la lista de prioridad pasa a ordenarse por "cartas que se arreglan con un clic".
- AC-4 Meta de aceptación tras v2 sobre las 266: ≥ 70 % sin `needsReview`; HP, caras y daño ≥ 95 %; nombre y mazo = 100 % (vienen del archivo). Las cifras reales y las cartas que siguen fallando van a `tasks/reports/T-107.md`.
- AC-5 Cada vez que el dueño verifica un lote, corre `cards:learn` y `cards:rescan` para que la lectura mejore.

## Orden
T-103 → T-104 → T-105 → T-106 → T-107. Mientras tanto, **el dueño no corrige a mano**: solo verifica rápido las 16 cartas "en revisión" (para tener verdad terreno) y vuelve cuando T-107 termine.
