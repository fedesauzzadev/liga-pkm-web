# SPEC-R — Carta grande del Pokémon (T-101)
Origen: captura del dueño. Al hacer clic en un Pokémon del equipo (por ejemplo el activo) hoy se abre un panel **angosto** (~170 px de ancho): el nombre aparece cortado ("Char…"), la carta es una **miniatura casi ilegible** y las energías se listan como botones "Equipar" apretados con scroll. Hay que reemplazarlo por una **carta grande y legible**. No tocar el tablero, la cámara ni los modelos. Medidas en `content/ui/card-modal.json`. Trabajar según `docs/NO-VISION.md`.

## T-101 Ventana de carta del Pokémon

### Cuándo se abre
- AC-1 Clic (o toque, o Enter) en cualquier slot del equipo abre `<CardModal data-testid="modal-card">` con **esa** carta. También desde la reserva de Oak y desde la carta del rival en un combate (modo solo lectura).
- AC-2 Cerrar: botón "Cerrar" (`btn-close`), tecla `Esc`, clic en el fondo oscuro; al cerrar, el foco vuelve al slot que la abrió.

### Tamaño y posición (obligatorio)
- AC-3 Ventana **centrada** sobre el mundo, con fondo atenuado (`backdropOpacity` 0,35); alto = 86 % de la ventana (mín. 520 px, máx. 760 px); entra y sale con una animación de `animationMs` (escala 0,96→1 y fundido). Sin scroll de página.
- AC-4 La carta ocupa el lado izquierdo con proporción **0,63** (ancho/alto, ±0,03): a 1366×768 la carta mide unos 415×660 px. A la derecha va un panel lateral de 300 px. Por debajo de 900 px de ancho, el panel pasa debajo de la carta.
- AC-5 La ventana respeta `layout.json`: no tapa el panel del dado ni el de turno si hay espacio; si no lo hay, se superpone con el fondo atenuado (solo el modal recibe clics).

### Carta (lado izquierdo): se dibuja con los datos de la carta, usando `<PkmCard>` en tamaño grande
- AC-6 Encabezado: **nombre completo** (sin recortar; si es largo, reduce la letra hasta 13 px mínimo), ícono de elemento (`<EnergyIcon>`) y **HP actual/máximo** con barra.
- AC-7 Arte: el sprite del Pokémon grande, de frente (de `sprites.json`), con fallback al nombre si falta.
- AC-8 Una fila por ataque (`data-testid="card-attack-<id>"`), en el orden de la carta: caras del dado (p. ej. `4-5`), nombre, daño (`(10)`, o `(10) 4-5-6 (20)` si hay `ifRoll`), **costo con íconos** (`<CostRow>`) y el texto de efecto (`rawText`). Las habilidades se marcan como tales y las especialidades se muestran arriba, en mayúsculas.
- AC-9 Estado de cada ataque para **este** Pokémon: ✔ "Disponible" o ✖ con el motivo ("Falta 1 Fuego"), calculado con la misma función `canUse` que usa el combate (no duplicar lógica).
- AC-10 Pie: etapa (Básico/Evolución), ícono del mazo y "Evoluciona a X (n)" con la **barra de experiencia** `xp / necesaria`.

### Panel lateral (derecha)
- AC-11 Secciones (`card-side`): **Estado** (activo/debilitado/dormido/envenenado, con ícono), **Energías equipadas** (fichas `<EnergyToken>` grandes, mínimo 40 px de alto), **Energías disponibles** de la mochila (grilla de fichas con contador, **no** una lista de botones con scroll), **Multicolor**, **Pociones** y **Evolución**.
- AC-12 Equipar: tocar una ficha disponible la equipa (`Equip`), o arrastrarla sobre la carta; quitar: tocar una equipada o arrastrarla afuera (`Unequip`). Solo en la fase `Organize` y fuera de combate; si no es posible, las fichas aparecen atenuadas con el motivo en un texto corto. Multicolor abre el selector de tipo (13 energías).
- AC-13 "Usar poción" y "Evolucionar" (`btn-evolve`) aparecen solo cuando son legales según `legalCommands`; el resto no se muestra. Con varias evoluciones posibles (Eevee), ofrece las opciones.
- AC-14 Modo solo lectura (otro jugador, carta del rival, combate activo): no hay acciones y se indica "Solo lectura".
- AC-15 El panel lateral hace scroll **solo internamente** y únicamente si no entra.

### Calidad y verificación sin ojos
- AC-16 Pruebas e2e por `data-testid`: la ventana está dentro del viewport a 1024×600, 1366×768 y 1920×1080; `card-face` mide el 70–86 % del alto de la ventana (a 1366×768) con aspecto 0,63 ± 0,03; el nombre tiene `scrollWidth ≤ clientWidth` (sin recortes); hay tantas filas de ataque como ataques en la carta y cada una muestra caras, daño y la cantidad correcta de íconos de costo; tocar una energía disponible emite `Equip` y actualiza contadores; `Esc` y el clic en el fondo cierran; ningún texto menor a 13 px.
- AC-17 Ninguna regla se calcula en la UI: el modal solo muestra datos del motor y envía comandos.
- AC-18 No usar la foto recortada de la carta como imagen principal (las fotos están fuera del repositorio).

### Extra (muy chico)
- AC-19 El rótulo del panel del dado ("Tirá el dado p…") no se corta: se muestra completo, en dos líneas si hace falta (`panel-dice` sin `overflow:hidden` sobre el texto).

## Qué mirar (dueño)
- Al tocar a Charmander se abre una carta **grande**, centrada, con su nombre completo, HP, sprite, los tres ataques con sus dados y costos, y a la derecha las energías para equipar sin scroll.
- Equipar una energía actualiza la carta (el ataque pasa de ✖ a ✔).
- Se cierra con Esc, con el botón o tocando afuera.
