# CARD-INGESTION — de las fotos de las cartas a JSON (v4)
Estado: el dueño tiene fotos de **todas** las cartas: 15 archivos, ~266 cartas (ver `content/photo-manifest.csv`). Las energías e ítems no se fotografían: sus cantidades ya están en `content/decks.json` e `items.json`.
**2026-10-12 (borrar-extraccion-vision)**: el flujo de extracción por visión (`pnpm extract`/`pnpm pilot`, T-041/T-042b) fue **eliminado** — la API de visión no funciona y los textos salían truncados (ER-001/ER-002).
**2026-10-22 (SPEC-S, T-102a…e)**: nuevo **lector local de escaneos individuales** (ver §0) que reemplaza la transcripción 100 % manual cuando hay UN escaneo por carta. La transcripción a mano en `/admin/cards` sigue vigente como flujo de respaldo/carga inicial.

## 0. Lector de escaneos (SPEC-S, T-102a…e)
Requisito: **un escaneo nítido por carta** en `content/photos/scans/<grupo>/<mazo>/*.jpg` (`grupo ∈ {terrain, evolution, sorpresa, gym, league}`; `mazo` solo en `terrain`; el mazo también sale del nombre/ruta del archivo, Q-081). Todo es local y gratis (OCR tesseract + íconos por parecido + patrones de efectos). Flujo:
1. `pnpm cards:scan content/photos/scans` — normaliza, segmenta, OCR, íconos y efectos por carta; escribe un JSON por carta en `content/pokemon/_staging/` (las que no alcanzan el esquema van a `_staging/_errors/` con el motivo) y el reporte `content/photos/scan-reports/report.html`. Los archivos del lector llevan `fromScanner: true` (pre-revisión: sus efectos `custom` NO cuentan para el triage hasta que se curan).
2. `pnpm cards:icons:learn content/photos/scans [--sample N]` (una sola vez, si hay íconos sin etiquetar): abrí `content/photos/scan-reports/icons.html`, poné nombre a cada grupo UNA vez, Exportar → guardá `content/cards/icon-labels.json`, y re-corre `cards:scan`.
3. Abrí `report.html`: filtros todas/con revisión/con custom/con error; las marcas rojas son las cartas a corregir. Los **textos sin patrón** salen agrupados y contados: se agregan como data a `content/cards/effect-patterns.json` (nunca primitivas nuevas; si hace falta una primitiva → `docs/effect-requests/ER-xxx.md`, lo aprueba el jefe).
4. Revisá las cartas en `/admin/cards` (edita las de `_staging/`); al marcar **Verificada** una carta de `_staging/` se promueve en la misma acción al canónico `content/pokemon/<deck>.json` (el server valida todo antes de escribir y borra el archivo de staging si queda vacío) ⇒ el juego ya la carga. Las de `_errors/` se corrigen a mano contra el escaneo.
5. Medición (T-102e/AC-5): verificá a mano las primeras 20 cartas y guardalas como `content/photos/scan-reports/golden/<base>.expected.json` (formato de `content/pokemon/_golden/dratini.expected.json`); después `pnpm cards:measure` compara contra los targets (nombre/HP/etapa/evolución ≥ 95 %, caras y nombre de ataque ≥ 90 %, costos ≥ 95 %, efectos exactos ≥ 70 %, custom ≤ 20 %; `cards:scan` reporta el tiempo medio por carta, ≤ 6 s con concurrencia 3).

## Flujo manual (respaldo, T-042a + carga a mano)
1. **T-042a Recorte**: `tools/crop_cards.py` detecta cada carta en la foto, la endereza y la guarda (630×1000 px) en `content/photos/crops/`. El dueño mira las hojas de contacto y confirma que el conteo y el orden son correctos.
   - Uso: `pnpm crop-cards <archivo|carpeta>` (requiere `python -m pip install -r tools/requirements.txt`). Grillas por archivo en `tools/crop-config.json` (`rows`: cartas por fila) o modo manual `--grid FILASxCOLUMNAS`. Salidas: `crops/`, `contact/` (hojas de contacto), `crops.json`, `_manifest.csv` y `_debug/` si el conteo no coincide con `content/photo-manifest.csv`.
2. **Carga manual (ex T-041/T-042c)**: transcripción de cada recorte a JSON en `content/pokemon/_staging/` desde `/admin/cards`, usando las convenciones de abajo. Fuente confiable para textos dudosos: el manual (cartas escaneadas).
3. **T-040 Revisión**: en `/admin/cards`, foto a la izquierda y formulario a la derecha; el dueño marca "Verificada" ⇒ la carta sale de `_staging/` y se promueve a `content/pokemon/<deck>.json` (una sola acción, queda usable en el juego).
4. **T-045 + T-046**: PokeAPI valida dex/tipo/evolución y se propone `officialMove` + `fx` por ataque.
5. **T-048 Ediciones de la casa**: tus cambios a cartas van aparte, sin tocar la transcripción.

## Fotos: requisitos
- Subir al repo local los **originales de cámara** (no los reducidos de chat) en `content/photos/` (está en `.gitignore`). Mínimo 500 px de ancho por carta tras el recorte.
- Volver a fotografiar la carta **Charmander** (Iniciales.jpg): está desteñida y con brillo; luz en ángulo, sin reflejo.
- La foto `Pokemon_mazo_lago.jpg` es el mazo **Isla**.

## Tipos de carta que aparecen
| Tipo | Dónde | Particularidades |
|---|---|---|
| PKM de terreno | 5 mazos | Algunos están marcados "Evolución" aunque estén en el mazo (p. ej. Sandslash, Rapidash) |
| PKM de evolución | 4 fotos (84) | Tienen costos como los de terreno; pueden tener "E: siguiente (n)" |
| Sorpresa | 1 foto (28 PKM) | "Oportunidad: n"; fondo dorado |
| Gimnasio | 2 fotos | Carta de líder (ya cargada en `gyms.json`) + PKM "#1 X de Líder"; sin costos; Giovanni tiene 3 PKM |
| Liga | 2 fotos | 5 entrenadores; atacan también con 6 |

## Cosas del texto de las cartas que el lector debe reconocer
- Prefijo de dado "4-5_", "3_", "1-2-3_" = `rollFaces`. Un número entre paréntesis = daño; "(+10) por cada 4-5-6" = efecto.
- Texto en **MAYÚSCULAS** bajo una línea = especialidad (pasiva): AGILIDAD, DUREZA, BARRERA, PANTALLA, MINIMIZAR, DOBLE EQUIPO, TELEPATÍA…
- Texto en **cursiva y entre comillas** ("Refugio", "Agilidad", "Explosión") = habilidad (`kind:'ability'`).
- "Podés empezar con este ataque" = `canOpen:true`.
- Íconos a la derecha de cada ataque = costo: ícono de tipo = ese tipo; círculo gris vacío = `any`.
- Ícono junto al HP = elemento del PKM. Pie de carta: "Básico"/"Evolución", ícono de mazo y "E: Nombre (n)".
- **Cartas repetidas**: hay PKM que aparecen 2 veces; pueden ser idénticos (⇒ `copies`) o tener ataques distintos (⇒ variantes `_a`, `_b`). Comparar siempre ataques y números.

## Convenciones de transcripción (del ex prompt de extracción)
El flujo de visión fue eliminado; estas reglas siguen vigentes para la transcripción manual en `/admin/cards`:
- hp = número del círculo blanco. element = ícono a su derecha. No inventar: si algo no se lee, `needsReview: true`.
- Por ataque: rollFaces = números antes del guion bajo ("4-5_" => [4,5]); rawText literal; damage.base = número entre paréntesis; si hay "4-5-6 (20)" => damage.ifRoll.
- cost: un elemento por ícono a la derecha del ataque; círculo gris => "any". Cursiva+comillas => kind:"ability".
- MAYÚSCULAS bajo la línea => specialties. "Podés empezar con este ataque" => canOpen:true.
- stage: Básico | Evolución | gym | league | surprise. evolvesTo de "E: Nombre (n)" => {id, xp:n}. "Oportunidad: n" => chances:n.
- effects: SOLO con las primitivas de docs/EFFECTS.md. Si ninguna alcanza: {"op":"custom","handler":"TODO","rawText":"…"} + ER-nnn (los aprueba el jefe).
- officialMove: id oficial en inglés (ej. "flamethrower") con officialMoveStatus:"proposed"; si no estás seguro "unmapped". fx: un arquetipo de docs/FX-ADAPTER.md.
- Incluí source.photo (archivo) y la posición.
