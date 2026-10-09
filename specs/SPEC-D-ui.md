# SPEC-D — UI (T-030…T-034, T-050)
Referencias: SDD §7. Texto en español (`i18n/es.ts`). La UI **solo** envía comandos y reproduce eventos.

## T-030 Shell, store, reproductor de eventos
- AC-1 Store (Zustand) con `gameState`, `eventQueue`, `speed`; acciones `dispatch(command)`.
- AC-2 `EventPlayer` reproduce eventos **en orden**, cada uno con `play(event): Promise<void>`; mientras reproduce, bloquea la entrada; velocidades 1×/2×/saltar; `prefers-reduced-motion` ⇒ transiciones instantáneas.
- AC-3 Test: con `speed=skip` y una secuencia de 50 eventos, el estado visual final equivale al de 1× (sin diferencias).
- AC-4 `anim.config.ts` centraliza todas las duraciones.

## T-031 Tablero
- AC-1 SVG generado desde `kanto.json`: aristas, nodos con íconos por tipo (forma redonda/cuadrada, color por mazo), fondo con la paleta del tablero (arte propio simple; sin usar la foto del tablero).
- AC-2 Ficha del jugador se anima por el **camino real** (tween por tramos, 120-180 ms por paso).
- AC-3 `pending=ChoosePath/StopOrContinue` muestra resaltado de opciones clicables/tocables (≥ 44 px) y botones "Parar acá"/"Seguir".
- AC-4 Dado: botón "Tirar" con animación (≤ 700 ms) que muestra exactamente el valor del evento.
- AC-5 Zoom/pan con gestos en móvil; ficha centrada automáticamente.
- AC-6 Tooltip/leyenda de tipos de casillero.

## T-032 Combate híbrido (ADR-6) — se divide en subtareas
Referencias: `docs/adr/ADR-6-battle-presentation.md`, `docs/FX-ADAPTER.md`, SDD §7. **Es requisito central: el combate debe verse y sentirse como un combate Pokémon, con animación de cada ataque.**

### T-032a Escena y cartas
- AC-1 Capas en orden: fondo → sprites → FX (`pointer-events:none`) → HUD/caja de texto → bandeja de carta y mesa del dado. Rival arriba-derecha, jugador abajo-izquierda; usable en 360×640 y en escritorio.
- AC-2 Sprites animados frente/espalda desde `sprites.json`; si falta uno, tarjeta con el nombre (sin error).
- AC-3 `<PkmCard>` se dibuja desde datos: marco por mazo, nombre, HP actual/máx, elemento, arte (sprite estático), filas de ataque con `rollFaces`, daño e íconos de costo; estados: normal / seleccionado / deshabilitado (con motivo) / levantado (atacando) / fila iluminada.
- AC-4 Elegir ataque: tocar una fila la previsualiza (efecto en texto); botón "Usar" confirma; los ataques ilegales (costo o regla de primer ataque) se ven apagados con el motivo.
- AC-5 Carta del rival: se muestra al entrar; cuando llega `DieRolled{attackSelect}` la fila correspondiente se ilumina con el valor; si no hay ataque (6), se muestra "no ataca".
- AC-6 Placas con nombre y barra de HP (tween 600 ms) e íconos de estado (dormido, envenenado, "no atacará", "(-10)") con tooltip.
- AC-7 Menú: Atacar, Poción, Retirar, Dejar ir; en modo captura: Capturar / Dejar ir.
- AC-8 El código de combate se carga con `import()` (no está en el bundle inicial).

### T-032b Dado 3D
- AC-1 Cubo CSS 3D (sin librerías) con 6 caras de puntos; `rollTo(value): Promise<void>` rueda 700-900 ms y termina mostrando **exactamente** `value` (test para los 6 valores comparando la cara visible).
- AC-2 Mesa con fieltro dentro de la escena; sombra simple; etiqueta del propósito ("Dado de ataque", "Dado de condición", "Dado de efecto", "Dado de despertar"…).
- AC-3 Secuencias: tiradas encadenadas (p. ej. Doble bofetón) se muestran una tras otra con contador "+10 +10".
- AC-4 Solo `transform`/`opacity`; sin layout shift; `speed` y `reducedMotion` respetados (resultado inmediato con fundido).
- AC-5 El mismo componente se usa en el tablero para el dado de movimiento.

### T-032c0 Spike de animaciones de Showdown (**gate GS**, puede correr desde G0 en paralelo con M1)
Seguir los 5 pasos de `docs/FX-ADAPTER.md`. Entregables: `tasks/reports/T-032c0.md` con licencia verificada, API del shim, demo `/dev/fx` con 6 movimientos, medición, decisión DOM vs canvas y tabla de dificultad por movimiento.
- AC-1 Los 6 movimientos de prueba se reproducen sobre sprites reales sin errores en consola. AC-2 `docs/ASSETS.md` actualizado. AC-3 Informe con recomendación clara (seguir / seguir solo parcial / descartar).

### T-032c1 FX base y arquetipos propios (primero; no depende del spike)
- AC-1 `playMoveFx` con la cadena de resolución de FX-ADAPTER (adaptador → `fx` → elemento) y try/catch; un FX que falla cae al siguiente.
- AC-2 Los 17 arquetipos implementados y visibles en `/dev/fx` con selector de elemento.
- AC-3 Todo ataque del contenido resuelve a algún FX (test que recorre el contenido). AC-4 ≤ 40 elementos DOM simultáneos; solo `transform`/`opacity`; `skip`/`reducedMotion` ⇒ destello mínimo.

### T-032c2 Portado de movimientos de Showdown (depende de GS aprobado)
- AC-1 Cada movimiento portado: archivo `fx/showdown/<id>.ts`, registro, test de humo y botón en `/dev/fx`.
- AC-2 Orden de prioridad: movimientos de los 5 iniciales y evoluciones → movimientos de los PKM del lote piloto → resto por frecuencia.
- AC-3 Si faltan assets del movimiento, cae al arquetipo sin error. AC-4 Informe con % de ataques del contenido que ya usan animación real.

### T-032d Coreografía de eventos
- AC-1 Una función `play` por tipo de `GameEvent` de combate: encuentro (barrido + entrada de sprites), PKM entra, dado, "X usó Y" (typewriter), carta se levanta, `playMoveFx`, daño (parpadeo ×3, número flotante, barra), efectos/estados, curación/drenaje, derrota, XP, evolución (destello + cambio de sprite), captura (arco, 3 sacudidas, destello; resultado determinista), líder de gimnasio (intro y medalla).
- AC-2 Tiempo de un turno típico de ataque ≤ 3,5 s a 1× y ≤ 1,5 s a 2×; `skip` ⇒ estado visual final idéntico (test).
- AC-3 Todo evento tiene test con temporizadores falsos que verifica orden y resolución de la promesa. AC-4 Ninguna animación modifica estado del juego.

## T-033 Equipo / inventario
- AC-1 Vista de equipo (≤ 6) + pila de Oak; ficha de carta con ataques, costos (íconos), efectos y `rawText`.
- AC-2 Equipar/desequipar elementos y asignar comodines con drag&drop **o** botones (accesible por teclado/touch).
- AC-3 Evolucionar desde la ficha si cumple XP; elección si hay varias evoluciones.
- AC-4 Muestra medallas (8 espacios) y contador de ítems.

## T-034 Inicio, guardado, ajustes
- AC-1 Pantalla de título (Nueva partida / Continuar / Ajustes). Setup: elegir 1 de 5 iniciales con carta y descripción.
- AC-2 Guardado automático por turno en `localStorage` (`{version, seed, commandLog}`); "Continuar" restaura y verifica hash del estado; versión desconocida ⇒ mensaje claro.
- AC-3 Ajustes: velocidad de animación, sonido (placeholder, desactivado), reducir movimiento, semilla visible/opcional para repetir partida.

## T-050 Release privado
- AC-1 JS inicial ≤ 200 KB gzip (reporte con `vite build --report` o equivalente). AC-2 Lighthouse móvil Performance ≥ 85. AC-3 PWA instalable con caché de assets (opcional si compromete el plazo). AC-4 Despliegue estático privado (sin indexar: `noindex`).
