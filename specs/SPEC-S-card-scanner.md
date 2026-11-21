# SPEC-S — Lector de cartas escaneadas → JSON (T-102a…f)
Origen: el dueño tiene **un escaneo por carta**, nítido, de todas las cartas. Necesita un programa que, dado un **lote de imágenes**, genere el JSON que usa el sistema de cartas (`PokemonCard`, ver `docs/SDD.md §4`, `docs/EFFECTS.md` y el ABM `/admin/cards`). **Reemplaza a T-041 y T-042a** para escaneos individuales (no hace falta recortar). Debe ser **gratis y local**: OCR + reconocimiento de íconos + reglas; un modelo con visión es solo un respaldo opcional (T-102f). Trabajar según `docs/NO-VISION.md`: GLM no puede verificar imágenes a ojo, así que todo se valida con la **carta de oro** (`content/pokemon/_golden/dratini.expected.json`), métricas y un reporte HTML para el dueño.

## Entradas y salidas
- Entrada: `content/photos/scans/<grupo>/<mazo>/*.jpg` con `grupo ∈ {terrain, evolution, sorpresa, gym, league}` (`mazo ∈ {bosque, montana, isla, llanura, pantano}` solo en `terrain`; en los demás grupos el mazo sale del ícono del pie). La carpeta está gitignored.
- Salida: un JSON por carta en `content/pokemon/_staging/<archivo>.json` (esquema `PokemonCard`, con `needsReview` y `confidence` por campo, `rawText` por ataque y `source.photo`), más `content/photos/scan-reports/report.html`.
- Estructura de la carta (diseño `terrain`, igual para terreno, evolución y Sorpresa): encabezado con **nombre**, círculo blanco con **HP** y **ícono de elemento**; arte; **1 a 4 bloques de ataque** separados por líneas rojo oscuro (texto a la izquierda con prefijo `caras_ nombre:`, a la derecha el daño `(10)` y los **íconos de costo**: círculo gris vacío = `any`); pie con etapa (`Básico`/`Evolución`), **ícono de mazo** y `E: Siguiente (n)` u `Oportunidad: n`. Algunas cartas traen antes de los ataques una **especialidad en MAYÚSCULAS** (`AGILIDAD:`, `DUREZA:`, `BARRERA:`…). Las cartas de gimnasio y de Liga no tienen costos y tienen otro pie (`config: profiles`).
- Configuración: `content/cards/scan-config.json`. Patrones de efectos: `content/cards/effect-patterns.json`.

## T-102a Base, normalización y segmentación
Paquete de herramientas `tools/cards-scan` (TypeScript, Node ≥ 20). **Dependencias aprobadas solo para esta herramienta** (no entran al bundle web): `sharp`, `tesseract.js`. Script raíz: `pnpm cards:scan <carpeta|archivo> [--group auto|terrain|evolution|sorpresa|gym|league] [--deck <mazo>] [--out <dir>] [--concurrency 3] [--resume] [--vision]`.
- AC-1 Lee JPG/PNG, aplica la orientación EXIF, detecta los bordes de la carta, corrige la inclinación (`autoDeskew`) y normaliza a `normalize.width × height` (700×1060, tolerando ±4 % de proporción). Si la imagen no parece una carta, la marca `error` y sigue con las demás.
- AC-2 Segmenta por **líneas**, no por coordenadas fijas: ubica el bloque de encabezado, el arte, los separadores horizontales rojo oscuro, la línea negra gruesa del pie y el pie. Devuelve los rectángulos de cada bloque de ataque (1 a 4) y de la especialidad previa si existe.
- AC-3 Escribe en `scan-reports/debug/<archivo>.png` la imagen normalizada con los rectángulos dibujados y numerados (para que el dueño verifique la segmentación).
- AC-4 Idempotencia y velocidad: caché por hash de imagen (`.cache`), `--resume` omite lo ya procesado, concurrencia configurable; un error en una imagen nunca detiene el lote; código de salida 0 si al menos una carta se procesó y resumen final (procesadas / con revisión / con error).
- AC-5 Tests con imágenes sintéticas (cartas de prueba dibujadas por código con la misma estructura) para la segmentación; ningún test depende de fotos reales salvo la carta de oro (se omite si `tools/cards-scan/fixtures/dratini.jpg` no existe).

## T-102b OCR y análisis del texto
- AC-1 OCR con `tesseract.js` (idioma `spa`, datos en caché local; descarga solo la primera vez). Cada región se lee por separado: nombre (línea), HP (solo dígitos), texto de cada bloque (bloque de texto), pie (línea).
- AC-2 Análisis de cada bloque: prefijo `^(\d(?:-\d)*)_` → `rollFaces`; nombre hasta `:`; **habilidad** si el nombre va entre comillas (`“…”`/`"…"`) o en cursiva (`kind:"ability"`); daño entre paréntesis a la derecha → `damage.base`; `N-N-N (X)` dentro del texto → `damage.ifRoll`; `(+X) por cada …` queda para el mapeador de efectos; `(00)` se admite como daño 0 con `needsReview`.
- AC-3 Especialidades: líneas previas a los ataques que empiezan con `^[A-ZÁÉÍÓÚÑ ]{4,}:` → `specialties` (texto original en `rawText` y efectos por T-102d).
- AC-4 Pie: `Básico` → `stage:"basic"`, `Evolución` → `evolution`; `E: Nombre (n)` → `evolvesTo:[{id, xp:n}]` (id = slug del nombre); `Oportunidad: n` → `chances:n`; gimnasio: `#n` y líder desde el encabezado, ciudad desde el pie.
- AC-5 Validaciones (`scan-config.validation`): HP 20-150 múltiplo de 10; daño 0-200 múltiplo de 10; caras entre 1 y 6 en orden ascendente; 1-4 ataques; las caras de los ataques de una misma carta **no se pisan** (si se pisan, se avisa). Lo que no valida se corrige si hay una única corrección obvia (p. ej. `5O`→`50`) o se marca `needsReview`.
- AC-6 El nombre se **ajusta** al de la lista de PokeAPI (T-045) si la distancia de edición ≤ 2 (`snapNameToPokeapi`); también completa `dex`. Sin esa lista, el ajuste se omite.
- AC-7 Cada campo lleva `confidence` (0-1) a partir de la confianza del OCR y de las validaciones; `needsReview:true` si alguno < `needsReviewBelow` (0,8) o si hay una habilidad o un `custom`.

## T-102c Íconos (elemento, costos y mazo)
- AC-1 Extrae los íconos por **componentes conectados** en tres lugares: junto al HP (elemento), columna derecha de cada bloque (costos) y pie (mazo). Los costos pueden ir en fila o apilados en 2 filas; se leen en orden de lectura.
- AC-2 `pnpm cards:icons:learn <carpeta> [--sample 30]`: agrupa los íconos de una muestra por parecido (vector reducido a 16×16 más color) y genera `scan-reports/icons.html`, una página con cada grupo (varios ejemplos y cantidad) y un desplegable para **ponerle nombre una sola vez** (`iconClasses`). El botón "Exportar" descarga `content/cards/icon-labels.json` (centroides + etiquetas).
- AC-3 Clasificación por centroide más cercano con `confidence`; el círculo gris vacío es siempre `any`; lo que supera la distancia máxima se marca `unknown` + `needsReview`. El costo de la carta es la lista de clases; `element` del ataque = el primer tipo de color del costo (o `normal` si todo es `any`).
- AC-4 El ícono del pie determina `deck`; el del encabezado, `element` del Pokémon (incluido `dragon`).
- AC-5 Test: con el aprendizaje hecho sobre la carta de oro, Dratini sale con `element:"dragon"`, `deck:"montana"`, costos `[any]`, `[any]`, `[electric]`.

## T-102d Mapeador de efectos
- AC-1 Carga `effect-patterns.json`: reemplaza `(F)` por `(\d(?:-\d)*)`, normaliza el texto (minúsculas, tildes opcionales, espacios, guiones largos) y aplica los patrones por prioridad. Convierte los marcadores (`$faces:N`, `$int:N`, `$neg:N`, `$optFaces:N`) y `$self` (id del ataque).
- AC-2 Un texto puede producir **varios** efectos (p. ej. `startsFirst` + `attackAgain`); el fragmento ya consumido no se vuelve a usar. `setsFlag` marca el atributo en el ataque (`canOpen`). `alsoSets` fija `damage.base`.
- AC-3 Lo que no encaja del todo → se emite `{op:"custom", handler:"TODO", rawText}` con el **texto restante** y `needsReview:true`. **Prohibido inventar primitivas**: lo nuevo va a `docs/effect-requests/` (el reporte lista los textos sin patrón, agrupados y contados, para que el dueño o el jefe agreguen patrones).
- AC-4 Los efectos se validan con el esquema Zod de `packages/content` (T-002b). Un efecto inválido se descarta con aviso y pasa a `custom`.
- AC-5 Pruebas unitarias: una por patrón con su texto de ejemplo de `docs/EFFECTS.md §4` y del manual, más los tres ataques de Dratini.

## T-102e Salida, reporte e integración
- AC-1 Para cada imagen se escribe el JSON validado con Zod (`PokemonCard`) en `_staging`; `id` = slug del nombre (`variant` se resuelve luego, D-25), `source:{photo, verified:false}` y un `contentHash` de los ataques normalizados (para detectar repetidas).
- AC-2 `report.html` autocontenido (sin servidor): hoja de contacto con la miniatura de cada escaneo al lado de un resumen legible (nombre, HP, elemento, ataques con caras/daño/costo, efectos) y **marcas rojas** donde hay `needsReview`; filtros: todas / con revisión / con `custom` / con error; resumen estadístico al inicio.
- AC-3 `/admin/cards` (T-040) lista y edita las cartas de `_staging`; si T-040 aún no existe, el JSON es suficiente (sin cambios en T-040 para este task).
- AC-4 **Carta de oro**: con `fixtures/dratini.jpg`, la salida coincide con `dratini.expected.json` en todos los campos salvo `source` y `confidence`.
- AC-5 Medición sobre las primeras 20 cartas que el dueño verifique a mano: nombre, HP, etapa y evolución ≥ 95 %; caras y nombre de ataque ≥ 90 %; costos ≥ 95 %; efectos exactos ≥ 70 % y `custom` ≤ 20 %; tiempo medio ≤ 6 s por carta con concurrencia 3. Las cifras reales van en `tasks/reports/T-102e.md` con la lista de errores más frecuentes y el ajuste hecho.
- AC-6 Documentar en `docs/CARD-INGESTION.md` el flujo nuevo (`scans/<grupo>/<mazo>`, `cards:scan`, `cards:icons:learn`, reporte, revisión).

## T-102f (opcional) Respaldo con modelo de visión
- AC-1 Bandera `--vision` y variables de entorno `VISION_BASE_URL`, `VISION_MODEL`, `VISION_API_KEY` (cliente compatible con la API de OpenAI; funciona con un modelo local, p. ej. con Ollama, o con una API que tenga capa gratuita: verificar condiciones vigentes). Nunca se commitean claves.
- AC-2 Solo se consulta para campos con `confidence` < umbral (y para íconos `unknown`); se envía el recorte de esa región, no la carta entera. Resultado y origen quedan en `source.fieldsFromVision`.
- AC-3 Con `--vision` apagado (por defecto) el programa funciona completo sin red.
- AC-4 Test con respuestas simuladas (`--dry-run`), sin llamadas reales.

## Orden y qué hace el dueño
1. Ordenar los escaneos en `content/photos/scans/<grupo>/<mazo>/`. Copiar el escaneo de Dratini a `tools/cards-scan/fixtures/dratini.jpg`.
2. `/ejecuta T-102a` → `T-102b` → `T-102c` (poner nombre a los grupos de íconos en `icons.html`, una sola vez) → `T-102d` → `T-102e`.
3. Abrir `report.html`, revisar las marcas rojas (en `/admin/cards`), y recién ahí escalar al lote completo (la parte "piloto" de T-042b se hace con las primeras 20).
4. `T-102f` solo si el OCR no alcanza.
