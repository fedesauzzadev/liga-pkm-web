# SPEC-I — Pantalla completa, HUD y cámara inmersiva (T-071…T-076)
Origen: boceto del dueño. **El worker no puede leer imágenes: este texto y `content/ui/layout.json` son la fuente de verdad.** Decisión: `docs/adr/ADR-9-immersive-fullscreen-ui.md`. Trabajar según `docs/NO-VISION.md`.

## Principios
1. Pantalla completa sin scroll de página (`100dvh`, `overflow:hidden`), para jugar con F11. Mínimo 1024×600, solo horizontal (si no se cumple: aviso en pantalla). Los paneles pueden tener scroll **interno** (historial, mochila).
2. **El tablero es la pantalla**: el canvas 3D ocupa toda la ventana; el HUD son paneles de "vidrio" (`panelOpacity` 0,78, blur, radio 16) encima del mundo.
3. El HUD no tapa lo importante: la cámara encuadra dentro de `safeArea`.

## Mapa de pantalla (fracciones de la ventana; valores exactos en `layout.json`)
```
+--------------------------------------------------------------+-----------------+
|                                                              | HISTORIAL DE    |
|            MUNDO 3D (canvas a pantalla completa)             | ACCIONES        |
|                                                              | (panel-history) |
|        [carta obtenida]   [POPUP COMBATE / INTERCAMBIO]      +-----------------+
|        (popup-card)       (popup-battle, solo si hay uno)    | MOCHILA         |
|                                                              | 5 filas         |
| [TURNO + botón Tirar dado]                                   | (panel-backpack)|
+--------------+-----------------------------------------------+-----------------+
| JUGADORES    |  [slot 1][slot 2][slot 3][slot 4][slot 5][slot 6]  | [ Oak ] [Menu] |
| (panel-players)  EQUIPO (panel-team, 6 PKM)                  |                 |
+--------------+-----------------------------------------------+-----------------+
```

## Decisiones de UI (el dueño puede cambiarlas)
| ID | Tema | Default |
|---|---|---|
| D-27 | Cambiar PKM de reserva | Solo en el casillero **Oak** (según el manual el Centro PKM solo cura). Flag `ruleset.centroAllowsSwap` (false) por si el dueño decide otra cosa |
| D-28 | Ver a otros jugadores | Se puede ver **equipo y medallas** de cualquier jugador (es legal en el juego); su **mochila** queda oculta |
| D-29 | Carta obtenida | Popup en el centro, se cierra solo a los 2,5 s; si hay una decisión pendiente (pelear/dejar ir) no se cierra |
| D-30 | Popup de combate/intercambio | Visible para todos cuando CUALQUIER jugador combate o intercambia; solo el jugador activo puede actuar |

## T-071 Shell de pantalla completa
- AC-1 `<GameShell>`: contenedor `100dvw × 100dvh`, `overflow:hidden`; sin scrollbars de página a 1024×600, 1280×720, 1366×768, 1920×1080, 2560×1080 y 3840×2160 (tests e2e comprueban `document.documentElement.scrollHeight <= innerHeight` y lo mismo en ancho).
- AC-2 Canvas 3D en `position:fixed; inset:0` detrás del HUD; el HUD es una capa con `pointer-events:none` y cada panel `pointer-events:auto`; los clics en zonas vacías llegan al mundo.
- AC-3 Cada panel de `layout.json` existe con su `data-testid` y su caja coincide con las fracciones de `layout.json` (±2 % de la ventana), con `clamp` de mínimos en pantallas chicas.
- AC-4 Ningún par de paneles se superpone, excepto los popups (`popup-card`, `popup-battle`) que se dibujan encima.
- AC-5 Botón "Pantalla completa" (Fullscreen API) en el Menú y atajo `F`; aviso inicial "Tip: presioná F11". Si la ventana es menor al mínimo o está en vertical: pantalla de aviso.
- AC-6 Estilo "vidrio" con variables CSS (`--panel-opacity`, `--blur`); sin imágenes de fondo; `prefers-reduced-transparency` ⇒ paneles opacos.
- AC-7 Foco y teclado: Tab recorre paneles en orden lógico; `Esc` cierra popups no críticos.

## T-072 Historial de acciones (panel-history)
- AC-1 Lista cronológica (lo nuevo abajo, autoscroll) con ícono + texto + etiqueta de turno/jugador; filtro "Todos / Solo yo"; máximo 200 entradas visibles (se descartan las más viejas).
- AC-2 Función pura `eventToLog(event, state, i18n)` (en `i18n/es.ts`) con un mensaje por evento. Mínimo: dado ("Sacaste un 4"), movimiento ("Te moviste a Ciudad Plateada"), carta robada ("Sacaste una carta de Bosque: Weedle"), energía/ítem obtenido, curación en Centro, encuentro ("¡Apareció un Weedle salvaje!"), ataque ("Poliwag usó Burbujas"), daño recibido, estado aplicado, PKM debilitado, experiencia ganada, evolución, captura o liberación, medalla, uso de ítem/bola/poción, inicio de turno, mazo vacío. Se usan los nombres reales de eventos del motor; si falta uno, se agrega al motor con test.
- AC-3 Cada entrada de combate se agrupa bajo un encabezado plegable "Combate vs X".
- AC-4 Test: una secuencia de eventos fija produce exactamente el texto esperado (snapshot de texto).

## T-073 Mochila (panel-backpack) con arrastrar y soltar
Cinco filas fijas: **Energías** (una ficha por tipo con contador), **Multicolor**, **Pociones** (Poción, Super Poción), **Bolas** (Pokebola, Ultra, Master) y **Especiales** (Oportunidad). Cada fila muestra mini-cartas apiladas con contador; clic = abre el detalle.
- AC-1 Arrastre con *pointer events* (sin librerías nuevas): al arrastrar, una carta fantasma sigue al puntero; los destinos válidos se resaltan y los inválidos se atenúan.
- AC-2 Reglas de soltado: energía → slot de PKM (`Equip`, solo en `Organize`); Multicolor → slot de PKM + selector de tipo de 13 energías (`Equip`+`AssignMulticolor`); Poción/Super Poción → slot de PKM (`UsePotion`; en combate solo el PKM activo del popup); Bola → carta rival del popup de combate (`UseBall`, solo si es legal por D-12); Oportunidad → botón "Usar" en `Organize`.
- AC-3 Soltado ilegal: la carta vuelve a la fila con sacudida y un mensaje con el motivo (viene del motor: `legalCommands`/razón).
- AC-4 Alternativa sin arrastrar (accesible/táctil): seleccionar la carta y luego tocar el slot.
- AC-5 Quitar energía: arrastrar la ficha equipada del slot de vuelta a la mochila (`Unequip`, solo en `Organize`).
- AC-6 Tests (Playwright por `data-testid`): cada combinación ítem→destino legal ejecuta el comando correcto y actualiza contadores; cada ilegal no cambia el estado.

## T-074 Equipo, jugadores, turno y menú
- AC-1 **panel-team**: 6 slots (`layout.json`). Cada slot es una mini-carta: sprite, nombre, barra de HP, fichas de energía equipadas (hasta 6 + "+n") y estados (activo, debilitado en gris, dormido, envenenado). Slot vacío punteado. Clic = ficha de la carta (`CardDetail`). Reordenar arrastrando solo en `Organize`.
- AC-2 **btn-oak**: abre el panel de **Reserva** (PKM de la pila de Oak) en el área del popup (`popup-battle`). Solo lectura salvo que el jugador esté en un casillero Oak durante su turno: ahí aparecen los botones de intercambio con un slot del equipo (D-27).
- AC-3 **panel-players**: lista de jugadores con ficha de color; el actual resaltado; clic selecciona a quién ver (equipo y medallas; mochila oculta, D-28). Mi jugador = por defecto.
- AC-4 **panel-turn**: "Turno de {nombre}" + número de turno; si es tu turno y puedes tirar, botón grande "Tirar dado" (`data-testid="btn-roll"`). Al tirar se dispara la secuencia de cámara (T-076).
- AC-5 **btn-menu**: Continuar, Guardar, Ajustes (velocidad, efectos, 2D/3D), Pantalla completa, Exportar reporte de bug, Salir.
- AC-6 Con un solo jugador (MVP) el panel de jugadores muestra 1 fila; el layout no cambia con N jugadores.

## T-075 Popups: carta obtenida, combate e intercambio
- AC-1 **popup-card**: al llegar `CardDrawn` aparece la carta (T-064) y se cierra sola a `autoDismissMs`; si hay decisión pendiente permanece y muestra sus botones (D-29). Clic = cerrar.
- AC-2 **popup-battle**: se muestra solo si algún jugador está en combate o en intercambio (Oak, intercambio de objetos); contiene la escena de T-032a/d. Botón "Ampliar" cambia entre el tamaño `layout.json` y `expanded`. Visible para todos; solo el jugador activo ve controles (D-30). El único `Advance` visible en combate es "Pasar" en tu turno: el botón "turno del rival / continuar" no existe (turno-automatico-rival; la coreografía reproduce en orden los eventos del comando, sin que ninguna lógica dependa de la animación).
- AC-3 La escena de combate usa **container queries** (`container-type:size`) y escala sus partes según el popup, no la ventana; verificada a tamaño normal y ampliado.
- AC-4 Al abrirse el popup de combate la cámara hace un acercamiento suave a la ficha del jugador en combate (si no lo está) sin tapar el popup; al cerrarse vuelve al estado previo.
- AC-5 Nunca hay dos popups de combate; el de intercambio de Oak reutiliza el mismo contenedor.
- AC-6 Test: abrir/cerrar según estado (`state.battle`, `pending=OakSwap`); `popup-battle` ausente del DOM cuando no corresponde.

## T-076 Cámara inmersiva
Presets en `content/ui/camera.json`. Estados: `overview | transitionIn | follow | fork | transitionOut | free`.
- AC-1 **overview**: encuadra todo el tablero dentro de `safeArea` con 5 % de margen; paneo, zoom (0,7×–1,5×) y rotación horizontal (±35°) libres pero limitados; botón/atajo "Recentrar".
- AC-2 **Al tirar el dado**: `overview → follow` en 700 ms (easeInOutCubic): zoom in a la ficha del jugador activo (distancia 2,6, elevación 28°, mirando ligeramente hacia el próximo nodo). El dado 3D (T-065) rueda delante de la cámara.
- AC-3 **Durante el movimiento**: la cámara sigue a la ficha con amortiguación (0,12) y *look-ahead* 0,6 hacia el siguiente nodo; en bifurcaciones (`ChoosePath`) pasa a `fork` (elevación 38°, distancia 3,4) para ver las opciones resaltadas.
- AC-4 **Al terminar el turno**: `follow → overview` en 1000 ms (zoom out) mostrando todas las fichas; espera 600 ms antes de pasar al siguiente jugador (que repite el acercamiento a su ficha).
- AC-5 La ficha seguida queda centrada **dentro del `safeArea`** (±5 %); la cámara no baja de `minHeight` 0,4 ni sale del mundo.
- AC-6 Entrada de usuario deshabilitada durante transiciones; `speed=skip`/`reducedMotion` ⇒ cortes directos sin interpolación.
- AC-7 Tests numéricos con reloj falso: tras `transitionIn`, distancia cámara-ficha = 2,6 ± 0,05; tras `transitionOut`, igual al overview ± 0,05; la ficha proyectada cae dentro de `safeArea`; la máquina de estados no admite transiciones inválidas.
- AC-8 `sceneDump` incluye el estado de cámara (`mode`, `position`, `target`, `distance`, `fov`).
- AC-9 Rendimiento: `PerformanceMonitor` (drei) baja `dpr` hacia 1 si el FPS cae; perfil bajo automático (ver T-069).

## Cambios sobre SPEC-G (T-062…T-066)
- T-062 AC-1 (base en caja con borde) ⇒ **reemplazado** por el mundo continuo de T-069. T-062 AC-5 (`OrbitControls` simple) ⇒ **reemplazado** por T-076. El resto de T-062 (nodos, etiquetas, mazos, `sceneDump`, fallback 2D, resaltado de `pending`) sigue igual.
- T-064 AC-1: la carta que vuela se detiene en `popup-card` (T-075) y no en "el centro de la pantalla".
- T-065: el dado se muestra en el mundo, delante de la cámara de seguimiento (`camera.json › dice`).
- T-032a/T-032d: la escena vive dentro de `popup-battle` (T-075). Si ya están hechas, T-075 AC-3 las adapta.
- Si algún worker ya implementó T-062 con `OrbitControls` y caja, T-076 y T-069 lo corrigen; no rehacer lo demás.
