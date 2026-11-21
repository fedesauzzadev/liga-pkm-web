# SPEC-K — Importar modelos CC0 de Kenney (refina T-070)
Reemplaza el procedimiento simple de T-070 en SPEC-H. Packs del dueño (CC0): `kenney_mini-forest_1.0`, `kenney_nature-kit`, `kenney_city-kit-suburban_2.0`, `kenney_survival-kit`. Trabajar según `docs/NO-VISION.md`: **el worker no ve los modelos**; el dueño es los "ojos" en la galería. Sin dependencias nuevas: los `.glb` se leen parseando su JSON interno.

## Convención de carpetas
- `assets-src/kenney/<pack>/` = packs completos tal cual se descargaron (el dueño los descomprime ahí). **Gitignored** (agregar `assets-src/` a `.gitignore`). No se borran las licencias.
- `apps/web/public/models/<pack>/` = **solo** los `.glb` elegidos + el `License.txt` de cada pack. Peso total máximo 2 MB (`decor.json › budgets.maxModelsMB`).
- Preferir GLB/glTF; ignorar FBX, OBJ, previews, sample scenes y archivos de editor.

## T-070a Catálogo
- AC-1 `pnpm models:scan` recorre `assets-src/**` y genera `content/board/models.catalog.json`: por archivo, `pack`, `file`, `sizeKB`, `triangles` (suma de índices/3), `bbox` (min/max de POSITION de los accesores) y `dimensions`. Lee el chunk JSON del GLB sin librerías.
- AC-2 Informa por pack: cantidad de archivos, de triángulos y de KB; marca los que superan 20 000 triángulos o 300 KB.
- AC-3 Verifica que cada pack tenga licencia (`License.txt` o similar) y que diga CC0; si no, error.

## T-070b Clasificación propuesta
- AC-1 `pnpm models:suggest` clasifica por palabras del nombre en `kinds` del juego y escribe `content/board/models.manifest.json` con `status:"proposed"`:
  `tree.pine`, `tree.round`, `tree.dead`, `rock`, `bush`, `mushroom`, `flower`, `grass`, `log`, `fence`, `house`, `lamp`, `sign`, `tent`, `campfire`, `crate`, `barrel`, `bridge`, `other`.
- AC-2 Cada `kind` tiene una lista de `candidates` con `{ file, weight, targetHeight, rotY }`. `targetHeight` inicial por tipo: árbol 1,1; roca 0,3; arbusto 0,35; hongo/flor 0,2; cerca 0,35; casa 0,8; farol 0,7; carpa 0,6; caja/barril 0,25.
- AC-3 Lo que no se pueda clasificar queda en `unclassified` y no se usa. Nunca se elige un modelo por gusto: solo por nombre y por las reglas anteriores.
- AC-4 Sugerencias de uso por pack (reglas por defecto): *City Kit (Suburban)* → `house`, `fence`, `lamp`; *Nature Kit* y *Mini Forest* → árboles, rocas, arbustos, hongos, flores, troncos y puentes; *Survival Kit* → `tent`, `campfire`, `crate`, `barrel`, `sign`.
- AC-5 Edificios de Pokémon: `pokecenter`, `gym`, `lab` y `market` usan un modelo `house` (o carpa para el puesto) **más** piezas procedurales encima (cartel con cruz roja, bandera del líder, toldo). No se recolorean modelos por nombre de malla.

## T-070c Galería de revisión para el dueño
- AC-1 Ruta `/dev/models` (solo desarrollo): grilla con cada candidato girando lentamente, con su nombre, `kind`, triángulos y KB. Cada tarjeta tiene botones **Aprobar / Rechazar / Cambiar tipo**; el botón "Exportar" descarga el `models.manifest.json` actualizado (`status: approved|rejected`).
- AC-2 La galería usa los mismos materiales cartoon del juego (T-080) y una luz neutra; tamaños normalizados con `normalizeModel`.
- AC-3 `pnpm shots` incluye una captura de la galería por pack y `shots/README.md` explica qué mirar ("¿se reconoce un árbol?, ¿la casa se ve entera?, ¿el tamaño relativo es razonable?").

## T-070d Importación selectiva y runtime
- AC-1 `pnpm models:import` copia a `apps/web/public/models/` solo los archivos con `status:"approved"` (o `proposed` si el dueño no revisó) y sus licencias; falla si el total supera `maxModelsMB`, listando los más pesados para sacar.
- AC-2 Cargador con `useGLTF`; `normalizeModel(obj, targetHeight)` (centra en el piso con `Box3` y escala); elección de variante **determinista por seed** y por peso (`weight`).
- AC-3 Materiales: convertir a `MeshToonMaterial` **conservando** `map` y `color` originales (T-080); contornos solo en `house`/landmarks (máx. 40 mallas).
- AC-4 Instanciar los repetidos (árboles, rocas, arbustos, hongos, flores): modelos con varias mallas se fusionan por material; el total respeta `profiles.*` (draw calls y triángulos).
- AC-5 Fallback: si un archivo falta o falla al cargar, se usa la pieza procedural del mismo `kind` sin error ni parpadeo.
- AC-6 Carga perezosa: los modelos de una zona se cargan cuando la cámara se acerca (distancia < 14) y se precargan los de Pueblo Paleta.
- AC-7 Tests: manifiesto válido (Zod: cada archivo existe, cada `kind` está en el registro de decoración); presupuesto de MB; elección determinista; fallback; ningún modelo supera 20 000 triángulos.
- AC-8 Registrar en `docs/ASSETS.md` cada pack: nombre, URL de origen, licencia CC0 y fecha.

## Qué hace el dueño
1. Descomprimir los 4 packs en `assets-src/kenney/`.
2. `/ejecuta T-070` (GLM hace T-070a…d en orden y se detiene antes de importar).
3. Abrir `/dev/models`, rechazar lo que no guste y exportar el manifiesto.
4. Dejar que GLM corra `pnpm models:import` y revisar con `pnpm shots`.

## T-070e Fuente adicional: modelos de Pokémon HeartGold/SoulSilver (OBJ/MTL/PNG) — **uso privado**
Modelos de The Models Resource (extraídos de un juego de Nintendo/Game Freak): **NO son CC0 ni redistribuibles**. Reglas: se guardan en `assets-src/hgss/` y se importan a `apps/web/public/models/hgss/`, **ambas gitignored** (igual que los sprites; agregarlas a `.gitignore`); nunca al repositorio; el sitio solo se publica con acceso restringido (`docs/PRIVACY-DEPLOY.md`); registrar en `docs/ASSETS.md` con el estado "no redistribuible, solo uso privado". El dueño descarga a mano los `.zip` desde las páginas de `content/board/models.hgss.wishlist.json` (GLM no puede descargarlos).
Formato observado (p. ej. *Pallet Town Houses*: 13,3 KB, `.obj` + `.mtl` + `.png`): modelos **estáticos** y muy livianos, sin animación.
- AC-1 `pnpm models:scan` también soporta `.obj` con sus `.mtl` y `.png` hermanos: triángulos (triangulando cuadriláteros), bbox (de las líneas `v`), KB del directorio, texturas listadas y **texturas referenciadas pero faltantes**.
- AC-2 Cargador con `OBJLoader` + `MTLLoader` de `three/examples/jsm/loaders` (sin dependencias nuevas), `normalizeModel`, texturas con `NearestFilter` (look pixelado de DS), `colorSpace` sRGB, `alphaTest 0.5` + `DoubleSide` para materiales con transparencia (hojas, rejas), y opción por modelo `ignoreTextures` para descartar mapas de sombra/luz (`*_lm*.png`, `*kage*`) si ensucian el resultado.
- AC-3 Materiales: por defecto `MeshToonMaterial` conservando `map`; opción por modelo `keepOriginalMaterial` si el toon los desfavorece (se decide en la galería).
- AC-4 Mapeo según `models.hgss.wishlist.json`: `pokecenter` → Pokémon Center; `market` → Poké Mart; `lab` → Oak Pokémon Research Lab; `gym` → Kanto Pokémon Gyms (si es un único archivo con varios edificios, separarlos por objetos/grupos del OBJ y asignar uno a cada ciudad; si no se puede, usar el primero para todos); `house` en Pueblo Paleta → Pallet Town House 1 y 2; `liga` → Pokémon League; `lamp` → Street Lamps. Los demás edificios de ciudades (Viridian, Pewter, Saffron, Celadon…) sirven de relleno. Si un modelo falta o falla ⇒ pieza Kenney/procedural, sin error.
- AC-5 La galería `/dev/models` etiqueta los modelos "HGSS (privado)" y permite aprobar/rechazar igual que el resto.
- AC-6 Tests: wishlist válida (Zod); un OBJ sintético de fixture parsea y se normaliza; las texturas usan `NearestFilter`; el fallback funciona si falta el archivo; `git ls-files` no incluye nada de `assets-src/` ni `public/models/hgss/`.
- AC-7 Estilo: HGSS (texturas pintadas) para los **edificios de Pokémon** y Kenney (colores planos) para naturaleza y props; si en la galería/capturas se ven desparejos, se unifican con luz y niebla antes de descartar un grupo.
