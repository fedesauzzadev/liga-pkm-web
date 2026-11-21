# SPEC-G — Tablero jugable y 3D (T-060…T-066)
Contexto: hoy el jugador se mueve por el tablero pero los casilleros no hacen nada, y falta el tablero 3D. **Antes de lo lindo va lo que funciona** (T-060, T-061). Trabajar según `docs/NO-VISION.md` (el worker no ve imágenes). Decisión: `docs/adr/ADR-8-board-3d.md` (dependencias three/R3F/drei aprobadas, solo en el chunk 3D). Reglas del juego: `docs/RULES.md` §2.

## T-060 Diagnóstico (comando `/diagnostica tablero`)
- AC-1 Existe `tasks/reports/DIAG-tablero.md` con la matriz casillero × (el motor lo resuelve / emite eventos o pending / la UI lo recibe / hay componente que lo muestre) = OK/FALTA/ROTO, con evidencia (archivo:línea o test).
- AC-2 Hay un test de integración por tipo de casillero (deck×5, mercado, centro, oak, duelo, gym, empty, start, sorpresa, liga): jugador colocado en el nodo, comando de fin de movimiento, aserciones sobre eventos y `pending`. Los que fallan quedan como tests pendientes marcados con el id T-061.
- AC-3 La lista de arreglos queda ordenada por dependencia (motor → store → UI).

## T-061 Casilleros que funcionan, de punta a punta (sin 3D)
Contrato: al terminar el movimiento el motor ejecuta `TileResolution` y emite eventos + deja `state.pending` si hace falta una decisión. La UI **solo** muestra eventos/pending y envía comandos.
- AC-1 `deck:<mazo>`: emite `CardDrawn{deck, card}`. Energía ⇒ va al inventario (`EnergyGained`). Ítem ⇒ inventario. PKM ⇒ `pending=FightOrRelease`.
- AC-2 `mercado`: roba del mazo Ítem (`CardDrawn{deck:'item'}`). `centro`: `PartyHealed{count}`. `oak`: `pending=OakSwap` si hay equipo o pila, si no `TileResolved{info}`. `gym`: `pending=ChallengeGym` (opcional, con la regla de medallas). `empty`/`start`: `TileResolved{none}`. `duelo`/`sorpresa`/`liga` con el ruleset que los deshabilita: `TileResolved{disabledByRuleset}`.
- AC-3 Panel `<TilePanel data-testid="tile-panel">` con título, mensaje (textos en `i18n/es.ts`) y botones según `pending` (`btn-fight`, `btn-release`, `btn-challenge`, `btn-skip`, `btn-oak-swap`). Cada evento de la lista tiene su mensaje.
- AC-4 Modo desarrollo con `?seed=<n>` y `?dice=3,5,1` (valores forzados, en orden) para probar sin azar. Solo fuera de producción.
- AC-5 Test e2e (Playwright) que, con seed y dados forzados, llega a CADA tipo de casillero y comprueba texto y botones del panel por `data-testid`. Incluye robar de los 5 mazos y de Ítem.
- AC-6 Robo con mazo vacío: mensaje de D-10, sin errores.
- AC-7 Ningún casillero deja la partida trabada: siempre hay un `pending` resoluble o el turno termina.

## T-062 Tablero 3D (R3F)
Componente `<Board3D>` cargado con `import()`, guiado por `kanto.json` y `deck-stacks.json`. Mapeo: 1 px del tablero = 0,01 unidades; origen en el centro del tablero; `y` del tablero → `z` del mundo.
- AC-1 Base: caja de 11,76 × 0,3 × 16,0 con borde; cinco paneles de mazo (rectángulos de `deck-stacks.json`, 0,05 de alto) con el color del mazo (llanura `#E8DCC8`, pantano `#6B4E9B`, isla `#4F8FD6`, montaña `#D2574B`, bosque `#4E9D5B`) y su símbolo como plano. Todo en `src/theme/board3d.ts`.
- AC-2 Nodos: redondos = cilindros (radio 0,16, alto 0,08); cuadrados = cajas (0,32 × 0,08 × 0,32); color por tipo (centro rosa, mercado amarillo, Oak violeta, duelo naranja, gimnasio verde, vacío gris claro, sorpresa magenta, liga cian) y por mazo para `deck`. Aristas = cintas planas de 0,10 de ancho entre nodos.
- AC-3 Etiquetas con `<Text>` de drei para ciudades y Centro/Mercado/Oak, orientadas a la cámara; el resto sin texto.
- AC-4 Mazos: pila de 12 cartas (cajas 0,63 × 0,02 × 1,0 con ligero desorden) sobre cada panel.
- AC-5 Cámara: perspectiva (fov 45°), inclinación inicial 55° sobre el horizonte, distancia que encuadra todo el tablero con 5 % de margen. `OrbitControls`: zoom 0,6×–1,6× de la distancia inicial; ángulo polar 35°–75°; rotación horizontal ±35°; paneo limitado al tablero ±10 %; gestos táctiles; doble toque = vista inicial.
- AC-6 Luz: ambiente 0,7 + direccional 1,0 desde arriba-izquierda; sombras "blob" (círculos translúcidos) bajo fichas y mazos; sin mapas de sombra.
- AC-7 Rendimiento: `frameloop="demand"` salvo animaciones; `dpr=[1,2]`; el chunk 3D respeta el presupuesto de ADR-8 (`size-limit`).
- AC-8 Fallback automático al tablero 2D SVG si no hay WebGL; selector manual 2D/3D en Ajustes.
- AC-9 `window.__debug.sceneDump()` (solo desarrollo): para cada nodo/ficha/mazo, `name, type, visible, worldPos, screenPos, screenBBox, inViewport`. Test: todos los nodos de `kanto.json` aparecen y están en el viewport con la vista inicial.
- AC-10 Los casilleros solo son clicables/tocables si `pending=ChoosePath/StopOrContinue` los ofrece (resaltado con aro); hover/toque muestra una etiqueta.

## T-063 Fichas y movimiento
- AC-1 Ficha = base cilíndrica (radio 0,2) + sprite "billboard" del PKM inicial (de `sprites.json`, tamaño 0,9) que mira a la cámara; sin sprite ⇒ peón de color.
- AC-2 Evento `PlayerMoved{path}`: la ficha recorre los nodos con un salto parabólico por tramo (altura 0,35; 180 ms por paso a 1×); la cámara la sigue con interpolación suave sin salirse de los límites.
- AC-3 La promesa resuelve al llegar; con `speed=skip` o `reducedMotion` la ficha salta al destino.
- AC-4 Test numérico: tras `PlayerMoved`, la posición mundial de la ficha coincide con el nodo destino (ε = 0,01) y `sceneDump` la reporta `inViewport`.
- AC-5 Varias fichas en un mismo nodo no se superponen (desplazamiento radial de 0,25 por jugador).

## T-064 Animación de robar carta
- AC-1 Al llegar `CardDrawn`, la pila se resalta (elevación 0,15) y una carta DOM (`data-testid="drawn-card"`) vuela desde la posición de pantalla proyectada de esa pila hasta el centro, con giro de revelado (`rotateY` 0→180°) en 700 ms a 1×.
- AC-2 Contenido: PKM ⇒ `<PkmCard>`; energía ⇒ `<EnergyCardFace>` (ficha con `<EnergyIcon>`); ítem/Sorpresa ⇒ `<ItemCardFace>`. PKM ⇒ botones de `FightOrRelease`; energía/ítem ⇒ vuela al botón de inventario.
- AC-3 La pila refleja la cantidad real de cartas del mazo (altura proporcional, mínimo 1).
- AC-4 `speed` y `reducedMotion` respetados; la animación nunca bloquea una decisión pendiente.
- AC-5 Test con temporizadores falsos: orden de fases (resaltar → volar → revelar → decisión) y resolución de la promesa; el e2e verifica el nombre de la carta por texto.

## T-065 Dado 3D sobre el tablero
- AC-1 `<Die3D>` (cubo con puntos dibujados en `CanvasTexture`) aparece sobre la mesa, cerca de la cámara, y rueda 800 ms a 1×.
- AC-2 El valor lo dicta el motor: tabla `valor → cuaternión final` con esa cara hacia arriba; 2 rebotes suaves; sin física.
- AC-3 Test matemático: para cada valor 1-6, la cara cuya normal queda hacia +Y en el cuaternión final es la de ese valor.
- AC-4 Mismo contrato `rollTo(value): Promise<void>` que T-032b; la versión CSS 3D de T-032b sigue siendo el dado del combate.
- AC-5 Al terminar se muestra "Movés N casilleros".

## T-066 Verificación visual guiada
- AC-1 `pnpm shots` (Playwright) genera en `shots/` (gitignored) capturas de: tablero inicial, ficha a mitad de movimiento, robo de carta (3 fases), dado en el aire, panel de cada tipo de casillero, tablero 2D (fallback). Tamaños 390×844 y 1440×900.
- AC-2 `shots/report.json` con métricas: canvas no vacío (varianza de píxeles > umbral), tablero ≥ 60 % del ancho útil, hitos dentro del viewport, sin errores de consola.
- AC-3 `shots/README.md` autogenerado con "qué mirar" por captura (3 preguntas concretas cada una) para el dueño.
- AC-4 El reporte de la tarea pide al dueño que mire las capturas y responda con palabras; los ajustes visuales se hacen en `src/theme/*.ts`.
