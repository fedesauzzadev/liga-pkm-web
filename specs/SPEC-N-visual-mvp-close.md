# SPEC-N — Cierre visual del MVP (T-089…T-093)
Origen: capturas del dueño (`Tablero_antes.jpg` = estado actual, `Tablero.jpg` = cómo lo quiere). **GLM no lee imágenes: este texto y `content/board/placements.json` son la fuente de verdad.** Trabajar según `docs/NO-VISION.md`. Objetivo: dejar el aspecto del tablero cerrado para pasar a combates, turnos y dados.

## Decisiones del dueño (obligatorias)
1. **Los nodos y los caminos NO cambian** (quedan exactamente como el tablero original). Cambia solo la ubicación de los **edificios 3D**, que pasan a ser el entorno **a los costados del camino**: nunca encima de un camino ni de un nodo.
2. **Se quitan los dos pedestales de mazo sobrantes** (Ítem y Sorpresa): no tienen representación en el tablero.
3. **El edificio de la Liga Pokémon se mueve** al costado del nodo de la Liga (al este, fuera del camino).
4. **Modelos nuevos** en `assets-src/new/`, con estos nombres: `gim` (gimnasios), `pokecenter` (Centro Pokémon), `pokemart` (Mercado), `league` (Liga). Hay que adaptarlos a **tamaños conservadores** dentro del tablero.
5. **El dado 3D va fijo en un panel del HUD, fuera del tablero**: visible para todos los jugadores y sin estorbar.
6. **Se cancelan** T-083 y T-084 (escala del mundo y plazas): el dueño no quiere cambiar nodos ni caminos. Se cancela T-087 (la huella de modelos la resuelve T-089).

## Orden de ejecución (el dueño no corrió nada de esto)
T-085 (cámara, SPEC-M) → T-088 (etiquetas y manchas, SPEC-M) → **T-089 → T-090 → T-091 → T-092 → T-093**. T-086 (modelos negros) se conserva: sus chequeos se aplican también a los modelos nuevos.

## T-089 Reubicación de edificios a los costados del camino
Datos: `placements.json` (`nodes`, `footprints`, `heights`, `minGaps`, `search`). Los ángulos están en coordenadas del **tablero**, no de pantalla (la captura del dueño estaba girada 90°; ignorar lados de pantalla).
- AC-1 Para cada nodo de `placements.nodes`, el edificio se coloca a `distStart` (0,75) del centro del nodo en la dirección `sideDeg` (o por reglas si es `null`/`auto`) y se orienta con la **puerta hacia el camino más cercano** (más `yawOffsetDeg` del modelo).
- AC-2 Restricciones (`minGaps`), medidas con la **caja orientada (OBB)** del edificio en el plano: al círculo del nodo (radio 0,2) ≥ 0,25; a cualquier arista ≥ 0,2; a otro edificio ≥ 0,2; a pedestales de mazo ≥ 0,3. Se verifican contra **todos** los nodos y aristas, no solo contra los propios.
- AC-3 Si no se cumplen: probar alejar de 0,1 en 0,1 hasta `distMax` (1,8); luego rotar la dirección según `rotateStepsDeg`; luego reducir la escala hasta `scaleFloor` (70 %); recién entonces descartar el edificio con advertencia (nunca dejar uno solapado).
- AC-4 Dirección final: dentro de ±45° de `sideDeg` para `confidence` high/medium y ±90° para low; los `auto` prefieren el lado **exterior** (alejándose del centro del tablero, `(588, 800)` px) y, en nodos interiores, el lado con más espacio libre.
- AC-5 Tamaño: la huella (`footprints`) y la altura (`heights`) son **máximos conservadores**; `normalizeModel` toma la escala menor entre altura y huella.
- AC-6 Estilo: cada edificio con una cerca corta o un árbol/farol cercano cuando haya espacio (sin romper `minGaps`); mismo `kind` mantiene la misma escala en todo el tablero.
- AC-7 `pnpm placements:report` genera `shots/placements.svg` (nodos como círculos, aristas como líneas y cada edificio como su rectángulo orientado con su id, **en la orientación de la foto del tablero**) y `shots/placements.report.json` (por edificio: nodo, `kind`, dirección final, distancia al nodo, distancia mínima a aristas y nodos, escala aplicada, descartado/no). El dueño abre el SVG en el navegador para verificar.
- AC-8 Tests: cero solapes entre edificios, nodos y aristas; ningún edificio descartado salvo por falta de espacio demostrada; mismo resultado en dos corridas (determinista); los 21 nodos de `placements.nodes` existen en `kanto.json`.
- Qué mirar (dueño): en `placements.svg` ningún rectángulo toca una línea ni un círculo; los edificios quedan a los costados como en tu dibujo (Isla Canela, Plateada y Centros del oeste hacia afuera; los de la columna sur hacia afuera; la Liga al este de su nodo).

## T-090 Quitar mazos sobrantes y origen de las cartas
- AC-1 Se dejan de renderizar los pedestales de `placements.removeStacks` (`item`, `sorpresa`) y se eliminan de `deck-stacks.json › extraStacks` y de `sceneDump`.
- AC-2 La animación de robar carta (T-064) para `deck:'item'` o `'sorpresa'` parte desde la posición en pantalla del **nodo** donde se robó (Mercado u otro) en lugar de un pedestal; las cartas de los 5 mazos de terreno siguen saliendo de su pedestal.
- AC-3 Los 5 pedestales de terreno no cambian de posición. Ningún edificio se ubica sobre un pedestal (`buildingToPedestal` 0,3).
- AC-4 Tests: `sceneDump` no contiene pedestales `item`/`sorpresa`; un robo de Ítem anima sin errores y su origen está a ≤ 0,5 del nodo proyectado.

## T-091 Modelos nuevos: `gim`, `pokecenter`, `pokemart`, `league`
- AC-1 Detectar en `assets-src/new/` los archivos por nombre base (`gim.*`, `pokecenter.*`, `pokemart.*`, `league.*`; admitir sufijos como `gim_01`). Formatos soportados: `.glb/.gltf` (preferido), `.obj` (+`.mtl`) y `.fbx` (con `FBXLoader` de `three/examples/jsm`, sin dependencias nuevas). Copiar al juego solo esos archivos (a `apps/web/public/models/new/`, gitignored salvo que el dueño diga lo contrario) y registrar su origen en `docs/ASSETS.md` marcando "licencia: a confirmar por el dueño".
- AC-2 Reemplazan a las piezas procedurales de `gym` (las 8 ciudades), `pokecenter` (4), `market` (5) y `league` (1) usando `normalizeModel` con los máximos de `footprints`/`heights`. La Oak lab y las casas de Pueblo Paleta conservan su modelo actual.
- AC-3 Se aplican los chequeos de T-086 (normales, texturas cargadas, color no negro, brillo medio ≥ 0,18) y el `yawOffsetDeg`; si un modelo falla, se usa la pieza procedural de su `kind` y se informa.
- AC-4 Los gimnasios mantienen una bandera procedural con el color de la medalla/líder encima, para diferenciar las 8 ciudades con un único modelo.
- AC-5 La galería `/dev/models` incluye los 4 modelos con su tamaño final y permite ajustar `yawOffsetDeg` y exportarlo a `placements.json`.
- AC-6 Tests: los 4 `kind` resuelven a modelo o a fallback; huella y altura ≤ máximos; ningún material negro.

## T-092 Dado fijo en un panel del HUD
Datos: `content/ui/layout.dice.json` (fusionar en `layout.json`).
- AC-1 Nuevo panel `panel-dice` en la columna izquierda, **justo encima** de `panel-turn` (`anchor: aboveTurnPanel`), fuera del mundo 3D y de los demás paneles (±2 % de la ventana, sin solapes, dentro de la pantalla a 1280×720, 1366×768 y 1920×1080).
- AC-2 Contiene el dado 3D (el de T-032b/T-065 con el contrato `rollTo(value): Promise<void>`), una etiqueta con **quién** tiró y el **propósito** ("Dado de movimiento", "Dado de ataque", "Dado de efecto"…) y el último valor.
- AC-3 Es el **único** dado visible: se elimina el dado que ruedaba delante de la cámara en el mundo (T-065/T-076) y el dado del popup de combate pasa a mostrarse en este panel. El resultado siempre lo dicta el motor.
- AC-4 Visible para todos los jugadores (muestra el dado del jugador activo y el historial de las últimas 3 tiradas en texto). No bloquea clics del mundo fuera de su caja.
- AC-5 Con `reducedMotion` o velocidad "saltar", muestra el valor directamente.
- AC-6 La cámara ya **no** apunta al dado: al tirar, el zoom va a la ficha (T-076) y el dado ruede en el panel.
- AC-7 Test e2e por `data-testid`: tras una tirada, `panel-dice` muestra el valor del motor y el nombre del jugador; ningún solapamiento con `panel-turn` ni `panel-players`.

## T-093 Cierre visual del MVP
- AC-1 `pnpm shots` agrega una captura de **orientación del tablero** (vista cenital alineada con la foto original, solo para revisar) y las cuatro del dueño: Isla Canela/Plateada (oeste), fila sur (Centro + Verde + Oak), este (Azulona + Liga), centro (Fucsia + Centro R).
- AC-2 `shots/README.md` lista qué mirar (3 preguntas por captura). El reporte de la tarea incluye `placements.report.json` resumido y la lista de decisiones tomadas.
- AC-3 Checklist de cierre (todo verificable): cámara en picada normal (no cenital); etiquetas completas; sin manchas pixeladas; edificios a los costados del camino sin tocar nodos; sin pedestales de Ítem/Sorpresa; Liga al costado de su nodo; modelos nuevos sin negros; dado fijo en su panel; `pnpm verify` verde.
- AC-4 Una vez cerrado, se congela el aspecto: cualquier cambio visual posterior va como nueva tarea.
