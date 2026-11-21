# SPEC-J — Mejora visual del mundo (T-077…T-082)
Origen: captura del juego real (tablero 3D funcionando). Problemas detectados y su arreglo. Trabajar según `docs/NO-VISION.md`. Todos los números salen de `content/board/style.json` y `content/ui/camera.explore.json`. Sin dependencias nuevas (todo existe en three/drei). Los cambios son de **presentación**: no tocan reglas ni estado.

## Diagnóstico (de la captura)
1. **Cámara demasiado lejos y casi fija**: el tablero ocupa la mitad de la pantalla, solo se ve de frente (rotación limitada a ±35°) y la vista por defecto es "todo el tablero".
2. **Etiquetas encimadas e ilegibles**: textos 3D enormes que se pisan entre sí.
3. **Terreno tipo alfombra**: los biomas son manchas gigantes y saturadas (rojo, violeta) con bordes borrosos; el tablero ocupa una parte chica de un mundo vacío.
4. **Luz y niebla planas**: la niebla lava los colores, no hay sombras ni contraste; los edificios parecen cajas.
5. **Poca densidad y nada de vida**: caminos pelados, sin objetos pequeños ni movimiento.
6. **HUD**: el panel de turno corta el botón "Tirar dado"; hay un panel vacío "Inventario" arriba a la izquierda y botones duplicados (Tirar / Tirar dado).

## T-077 Cámara de exploración (más cerca, giro libre)
- AC-1 Fusionar `camera.explore.json` en `camera.json` y actualizar el esquema Zod; modo nuevo `explore` (por defecto): distancia 7,5, elevación 42°, centrada en la ficha activa con amortiguación 0,1.
- AC-2 Giro **360°** con arrastre (botón derecho o izquierdo sobre zona vacía) y teclas Q/E; inclinación 25°–75°; zoom 3–16 (rueda y +/−); paneo con WASD o botón central (límite: dentro del mundo). Teclas: V = vista general, C = recentrar.
- AC-3 Botones del HUD: **Recentrar** (→ explore sobre la ficha) y **Vista general** (→ overview, también con giro 360°). Se unifica con los botones existentes; sin duplicados.
- AC-4 Tras mover la ficha (fin de turno) la cámara vuelve a `explore` (no al overview completo), salvo `afterTurn:"overview"`. El acercamiento al tirar el dado y el seguimiento (T-076) no cambian.
- AC-5 Test numérico: la cámara inicial queda a 7,5 ± 0,2 de la ficha; la ficha proyectada cae dentro de `safeArea` (±5 %); al menos los 3 nodos más cercanos a la ficha son visibles; todos los ángulos del giro 360° mantienen `y ≥ 0,4` y dentro del mundo.
- AC-6 Con la vista por defecto, el tablero **no** debe entrar completo: es intencional (se ve la zona de la ficha de cerca).

## T-078 Etiquetas inteligentes
- AC-1 Etiquetas de tamaño **fijo en pantalla** (`fontPx` 13, contorno 3 px, `screenSpaceSize`), sin escalar con la distancia.
- AC-2 Visibilidad por prioridad: siempre los gimnasios (`alwaysShow`); el resto solo si la cámara está a menos de `showOnlyIfCameraDistanceBelow` y el nodo a menos de `showWithinTokenDistance` de la ficha, o si está en hover/foco.
- AC-3 Anti-colisión: cada 100 ms (`throttleHz`) se calculan las cajas en pantalla; si dos se superponen, se oculta la de menor prioridad (`priority`), con fundido de 150 ms.
- AC-4 Test: en la vista inicial y en la vista general, **ninguna** pareja de etiquetas visibles se solapa (sobre `sceneDump.labels`); las etiquetas fuera del viewport no se procesan.
- AC-5 Las etiquetas no bloquean clics del mundo (`pointer-events:none`).

## T-079 Terreno, biomas y horizonte rehechos
- AC-1 Migrar `world`, `ambient` y `zones.*.ground` de `decor.json` a `style.json` (precedencia de ese archivo) y borrar los duplicados.
- AC-2 Mundo de 36×36 con `segments` 120. Biomas: cada color solo domina a menos de `biomes.radius` (3,4) del centro de su zona y se funde con el pasto base en `blend` (1,6). **Prohibido** colorear el 100 % del terreno con un solo color. El rojo solo aparece en lava.
- AC-3 Variación orgánica: ruido de luminosidad por vértice (`lightnessNoise` ±6 %), colinas suaves fuera del tablero (a partir de radio 9, altura ≤ 1,4), terreno plano a ≤ `flatten` de nodos y aristas.
- AC-4 Horizonte: dos anillos de montañas lejanas (`distantMountains.rings`) con color azul-grisáceo y cima nevada, escalonados en altura; sin triángulos pálidos planos.
- AC-5 Anillo de arbolado denso (instanciado) entre el borde del tablero y las colinas, para que no se vea "vacío".
- AC-6 Tests: ningún bioma cubre más del `maxShare` (25 %) de los vértices; desviación estándar de luminosidad > 0,02; terreno plano (|y| < 0,01) a ≤ 0,3 de nodos/aristas; sin NaN.

## T-080 Luz y materiales (look "cartoon")
- AC-1 Materiales `MeshToonMaterial` con mapa de degradado de 3 escalones para edificios, árboles, rocas y fichas.
- AC-2 Luz hemisférica (cielo `#CFE8FF` / suelo `#8DBF6A`, 0,9) + direccional cálida (1,0) con **sombras** que siguen a la ficha en un radio de 10 (`shadowMapSize` 2048); `toneMapping` ACES. Sombras de contacto suaves bajo edificios y árboles.
- AC-3 Niebla suave (`fog`: near 30, far 80) con el color del horizonte; el cielo con degradado y disco solar.
- AC-4 Contorno (`Outlines` de drei) solo en las piezas de `outlines.onlyKinds`, máximo 40 mallas.
- AC-5 Perfil bajo (`profiles.low`): sin sombras ni contornos, `dpr` 1; se activa solo si el FPS < 40 durante 3 s (ya existente) y queda en el reporte de bug.
- AC-6 Test: los parámetros de luz/niebla de la escena coinciden con `style.json`; en perfil bajo no hay mapas de sombra; draw calls y triángulos dentro de `profiles.*`.

## T-070 (ahora recomendada) Modelos glTF CC0
Es el mayor salto de calidad: modelos con diseño real en lugar de cajas y conos. Pasos para el dueño (a mano, GLM no puede descargar ni mirar):
1. Descargar packs **CC0** y copiarlos a `apps/web/public/models/<pack>/` con su `LICENSE.txt`: *Kenney City Kit (Suburban)* (casas, cercas, árboles en glTF), otros kits de Kenney de naturaleza/pueblo (verificar la licencia en kenney.nl), *Quaternius* (si viene en FBX/OBJ hay que convertir a GLB) y *KayKit*.
2. Correr `/ejecuta T-070` (spec en SPEC-H). Agregar: `pnpm models:suggest` lista los archivos y propone el `kind` por nombre (house, tree, rock, fence, lamp…) para que se confirme.
3. Los modelos entran con `normalizeModel` y se instancian; si un archivo falta, se usa la pieza procedural.

## T-081 Densidad y vida
- AC-1 **Relleno de caminos**: a ambos lados de cada arista, props pequeños cada `edgeProps.spacing` (0,35 ± 0,15) a `offsetFromEdge` 0,28–0,55, según la zona (`edgeProps.byZone`); faroles cada 2 unidades cerca de ciudades, Centros, Mercados, Oak y Paleta. Determinista por seed; respeta `clearance` y se instancia.
- AC-2 **Pokémon salvajes decorativos** (billboards con sprites de `sprites.json`, sin interacción), máx. 20 en total, según `life.zones` (Pidgey volando en Bosque, Diglett asomando en Montaña, Magikarp saltando en la Isla, Rattata en Llanura, Zubat y Koffing en Pantano…) con movimientos `wander`, `flyCircle`, `popUp`, `jumpInWater`, `bob`, `hop`. Se pausan a más de `pauseBeyondDistance` de la cámara y fuera del frustum.
- AC-3 **Efectos de ambiente** (`ambientFx`): humo en chimeneas, ondas en estanques, mariposas, pájaros que cruzan cada 20-40 s, brasas en Montaña, burbujas en Pantano, hojas cayendo en Bosque; árboles que se mecen con un shader barato (`treeSway`).
- AC-4 Todo escala con el perfil (`profiles.*.life`, `ambientFx`, `propDensity`); con `reducedMotion` se apaga todo salvo el balanceo mínimo de árboles.
- AC-5 Tests: cantidades por categoría = `style.json × perfil`; mismo seed ⇒ mismas posiciones; ningún elemento viola `clearance`; los Pokémon decorativos nunca se acercan a menos de 0,6 de un nodo; las animaciones se pausan al salir del frustum; presupuestos de `profiles.high`.

## T-082 Pulido del HUD
- AC-1 `panel-turn` deja de cortar el botón: en `layout.json` pasa a `y: 0.655, h: 0.125` (el panel de jugadores sigue en `y: 0.80`); el botón "Tirar dado" mide ≥ 44 px de alto. Test: `scrollHeight <= clientHeight` en `panel-turn` a 1280×720, 1366×768 y 1920×1080.
- AC-2 Quitar el panel vacío "Inventario" (arriba a la izquierda) y los botones duplicados: queda un solo "Tirar dado" (en el panel de turno) y los controles de cámara (Recentrar / Vista general) en una barra compacta arriba al centro.
- AC-3 Tamaño de letra mínimo 13 px en todos los paneles; filas de la mochila con altura ≥ 28 px; contraste de texto AA sobre el "vidrio".
- AC-4 Etiqueta del Pokémon activo y barra de vida visibles en el slot del equipo (ya existe) con el nombre sin cortar.
- AC-5 Test e2e por `data-testid`: ningún panel del HUD se superpone con otro (salvo popups) y ninguno tiene texto cortado.

## Orden recomendado y qué mirar
T-077 → T-082 → T-078 → T-079 → T-080 → (descargar packs) T-070 → T-081. Después de cada una: `pnpm shots` y mirar:
- T-077: ¿se ve la zona de la ficha cerca y se puede girar alrededor? ¿"Vista general" muestra todo el tablero?
- T-078: ¿se leen los nombres de ciudades sin pisarse?
- T-079: ¿desaparecieron las manchas gigantes de color? ¿el horizonte tiene montañas y arboleda?
- T-080: ¿los edificios tienen sombra y contorno? ¿los colores se ven vivos y no lavados?
- T-081: ¿hay cosas moviéndose por los caminos y las zonas?
