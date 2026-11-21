# SPEC-H — Mundo inmersivo: casilleros con relieve, decoración y atmósfera (T-067…T-070)
Reescrita según `docs/adr/ADR-9-immersive-fullscreen-ui.md`: **no hay "cartón" flotando; el tablero es un mundo continuo hasta el horizonte** y el camino de casilleros está dentro de él. Es **decoración**: no cambia reglas ni estado. Depende de T-062/T-063 y de la cámara de T-076. Trabajar con `docs/NO-VISION.md`. Estilo: *low-poly* con `flatShading`, colores planos suaves, sin texturas externas. Datos en `content/board/decor.json`, `content/board/deck-stacks.json` y `src/theme/board3d.ts`.

## T-067 Casilleros con relieve y camino
- AC-1 Cada nodo es una "piedra" elevada: redondos = cilindro biselado (radio 0,2, alto 0,12, bisel 0,03); cuadrados = caja biselada (0,4 × 0,12 × 0,4). Anillo superior del color del tipo/mazo.
- AC-2 Glifo en la cara superior con `CanvasTexture` 128×128 (formas 2D simples): `deck` = símbolo del mazo (sol, calavera, gota, árbol, llama); `centro` = cruz; `mercado` = bolsa; `oak` = birrete; `gym` = escudo; `empty` = pokébola; `sorpresa` = "?"; `liga` = estrella; `start` = casa. Texturas generadas una vez y cacheadas.
- AC-3 Aristas = camino de tierra (`#C9A877`) de 0,16 de ancho, bordes suaves deterministas (seed) y guijarros instanciados a los lados.
- AC-4 Los nodos que ofrece `pending` (ChoosePath/StopOrContinue) tienen aro pulsante (escala 1→1,15 en 900 ms; apagado con `reducedMotion`).
- AC-5 Legibles en la cámara de seguimiento (distancia 2,6): glifo de al menos 80 px de ancho en pantalla a 1080p (test con proyección).
- AC-6 Test: cada tipo de nodo de `kanto.json` tiene glifo y material; ninguna textura se crea más de una vez.

## T-068 Puntos de interés y relleno de zonas
Catálogo de piezas **procedurales** (`src/board3d/decor/kinds/*.tsx`), con receta numérica:
- `house`: cuerpo caja 0,7×0,5×0,6 (`wall`); techo `ConeGeometry` r 0,55, alto 0,35, 4 segmentos rotado 45° (`roof`); puerta 0,14×0,25×0,02; chimenea opcional.
- `pokecenter`: caja 1,0×0,5×0,7 blanca; techo caja 1,1×0,12×0,8 roja `#E8483B`; puerta; cartel con cruz roja (dos cajas finas).
- `market`: mostrador 0,8×0,3×0,4; toldo de 6 listones amarillo/blanco inclinado; 2 postes.
- `lab` (Oak): caja 1,2×0,6×0,8 gris claro; techo plano `#5A6B7A`; antena (cilindro r 0,02 alto 0,35); cartel.
- `gym`: caja 1,1×0,7×0,9; techo con borde; bandera (plano 0,3×0,2) del color del líder (`flagFromLeader` toma la medalla de `gyms.json`).
- `tree`: `pine` = tronco (cilindro r 0,05 alto 0,25) + 2 conos (r 0,28/0,2, alto 0,5/0,4); `round` = tronco + esfera r 0,3 (8×6). `deadTree`: tronco torcido + 3 ramas finas. `bush`: esfera aplastada r 0,18. `rock`: icosaedro detalle 0 con escala aleatoria. `mountain`: cono r 0,6 alto 0,9 (5 segmentos) + cima nevada. `pond`: disco `water` con brillo suave. `reeds`, `grassTuft`, `flowerPatch` instanciados. `lavaPool`: disco naranja emisivo. `mist`: esfera translúcida. `fence`, `sign`, `lamp`, `flag`.
- AC-1 `DecorRegistry: kind → componente procedural | modelo glTF` (T-070). Un `kind` desconocido en `decor.json` ⇒ error claro en `content:validate` y fallback invisible en runtime.
- AC-2 `landmarks.byNodeId/byNodeType` colocan piezas relativas al nodo (`offset`, `rotY`, `scale`, colores). Pueblo Paleta = 2 casas (techo rojo y azul), 2 árboles, cerca y cartel, con el casillero en el medio; cada Centro = pokecenter; cada Mercado = puesto; Oak = laboratorio; cada gimnasio = edificio con bandera.
- AC-3 `zones.*.scatter`: reparto **determinista por seed** dentro del área de cada bioma (`deck-stacks.json` + `margin`); nada a menos de `clearance.fromNodeCenter` de un nodo ni `clearance.fromEdge` de una arista, ni sobre el pedestal del mazo.
- AC-4 Rendimiento: árboles, rocas, arbustos, pasto y flores con instancias; presupuesto `budgets` (≤ 120 draw calls, ≤ 150 000 triángulos) medido con `gl.info` y reportado en `sceneDump`.
- AC-5 Tests numéricos: (a) ningún relleno viola `clearance`; (b) todo queda dentro del mundo; (c) mismo seed ⇒ mismas posiciones; (d) todos los `kind` del JSON existen en el registro; (e) presupuestos cumplidos en la vista inicial.
- AC-6 `sceneDump` incluye cada landmark con `name, bbox, nodeId`.

## T-069 Mundo continuo y atmósfera (reemplaza el "diorama")
- AC-1 **Terreno**: malla de `world.size` (48×48) con `world.segments` (96) vértices por lado, coloreada por vértice según el **bioma** más cercano (mezcla gaussiana con `biomeBlend.sigma`): `ground` de cada zona sobre un verde base. Altura: ruido suave de baja frecuencia (`noiseAmplitude` 0,25) y **plano (0)** cerca de nodos, aristas y pedestales (suavizado con `smoothstep`). Sin bordes visibles: la niebla (`fog.near/far`) lo disuelve.
- AC-2 **Pedestales de mazo**: cada mazo es una pequeña piedra con la pila de cartas encima (12 cartas, altura proporcional a las restantes) en el centro de su bioma; ya no hay paneles rectangulares.
- AC-3 **Biomas con carácter**: Isla = lago de agua con orilla; Montaña = relieve rocoso y charcos de lava; Bosque = arboleda densa; Llanura = pasto claro y flores; Pantano = terreno morado, árboles secos y niebla baja.
- AC-4 **Horizonte**: anillo de montañas lejanas (`distantMountains`, conos grandes fuera del tablero a radio 28, atenuados por la niebla) y cielo con degradado (`backgroundTop/Bottom`) en un domo; 5 nubes low-poly a altura 7 con deriva lenta.
- AC-5 Animaciones ambientales (agua, nubes, "idle" de la ficha ±0,03 en 1,6 s) a 30 fps máx. con un bucle `invalidate` limitado, solo con la pestaña visible; se apagan con `reducedMotion` o en Ajustes. El resto del tiempo `frameloop="demand"`.
- AC-6 **Perfil bajo automático**: si el FPS medido < `perf.lowFpsThreshold` durante 3 s ⇒ sin nubes ni animaciones, `dpr` hacia 1, menos relleno de zonas (−50 %); queda registrado en `exportBugReport`.
- AC-7 Tests: el terreno es plano (|y| < 0,01) a ≤ 0,3 de cualquier nodo/arista; no hay vértices con alto NaN; las zonas de bioma cubren los 5 mazos; `sceneDump` informa triángulos y draw calls.

## T-070 (opcional) Modelos glTF CC0
Reemplaza piezas procedurales por modelos **sin cambiar** `decor.json`, salvo una tabla `models` (`kind → archivo`). Fuentes CC0 verificadas: **Kenney** (p. ej. *City Kit (Suburban)*: casas, cercas y árboles en glTF), **Quaternius** (p. ej. *LowPoly Medieval Village Pack*: FBX/OBJ/Blend, hay que convertir a GLB), **KayKit**. Verificar la licencia de cada descarga y registrarla en `docs/ASSETS.md`.
- AC-1 El dueño coloca los `.glb` en `apps/web/public/models/<pack>/` con el `LICENSE.txt` del pack; el worker no descarga nada por su cuenta.
- AC-2 `useGLTF` + `normalizeModel(obj, targetHeight)` (centra en el piso y escala por `Box3`).
- AC-3 `decor.json › models: { "<kind>": { "file": "...", "targetHeight": 0.9, "rotY": 0 } }`; si falta el archivo o falla, vuelve a la pieza procedural.
- AC-4 Presupuesto `maxModelsMB` = 2; repetidos con `Clone`/instancias.
- AC-5 `pnpm models:report` imprime por modelo: triángulos, tamaño y dimensiones tras normalizar.
