# SPEC-S — Popup de tarjeta del PKM activo: equipar/desequipar energías (T-102)
Origen: pedido del dueño: al seleccionar un PKM (el activo del equipo), que abra un popup con **la tarjeta TCG de ese PKM** (`PkmCard`) y permita **equipar o desequipar energías** del inventario disponible, sin pasar por el panel de equipo. **Cero cambios en el motor**: los comandos `Equip`/`Unequip` ya existen (SPEC-B/T-013) y siguen siendo legales **solo en fase `organize`** (RULES §3). La UI nunca decide reglas (ADR-1): apaga botones y muestra el aviso, pero la legalidad la dicta el motor.

## T-102 Popup de tarjeta con manejo de energías

### Alcance
- Nuevo `PkmDetailPopup` (`apps/web/src/popup/`), presentacional, que vive en la caja `cardPopup` del shell (SPEC-I/T-075). Contenido:
  - La `<PkmCard>` completa del PKM seleccionado (`mode="own"`), con filas de ataque en vivo: los ataques cuyo costo no está pagado se ven apagados con motivo `cost` (reusa `canUse`/`attackRows` de `battle/model`); equipar energías los prende al instante.
  - Sección **Equipadas**: una ficha por energía equipada (`EnergyToken`/`ElementIcon` + botón "Desequipar").
  - Sección **Disponibles**: una ficha por carta de `player.elements` (el inventario) con botón "Equipar".
  - Botón **"Ficha completa"**: abre el panel de equipo actual (`TeamPanel`/`CardSheet`, SPEC-D/T-033) — evolucionar, Multicolor y pila de Oak siguen ahí. El popup no reemplaza nada (Q-074).
- Disparador: clic en un slot del equipo propio en `TeamStrip` (SPEC-I/T-074). El caso del dueño es el PKM **activo**, pero el mismo camino sirve para cualquier slot propio. Seleccionado otro jugador (D-28): solo lectura, sin inventario ni botones.
- Edición habilitada solo si `state.phase === 'organize'` y jugador activo (mismo `canEdit` que T-033). Fuera de eso, botones `disabled` + hint `es.teamNotEditable`.
- Cierre: botón cerrar, `Esc` (T-071/AC-7) y clic fuera del popup. Sin auto-cierre (no es un evento, es una consulta del jugador).
- Convivencia con el popup de carta robada (T-075/AC-1): si llega un `CardDrawn` mientras el detalle está abierto, **la carta robada gana** la caja mientras es visible; al auto-cerrarse vuelve el detalle (que siguió abierto por debajo).

### Fuera de alcance
- Motor, reglas y comandos nuevos (no se toca `packages/engine`).
- Drag & drop dentro del popup (el arrastre mochila↔slot del HUD de T-073 queda como está; tocar un slot con una energía "en la mano" la aplica, no abre el popup).
- Asignar Multicolor y evolucionar en el popup (siguen en la ficha completa y la mochila).

### Criterios de aceptación (un test por AC, comentario `// AC: SPEC-S/T-102/AC-n`)
- AC-1 Clic en un slot propio del `TeamStrip` abre el popup con la `<PkmCard>` de **ese** PKM: `data-testid="pkm-detail-popup"` + `data-uid`; el título/nombre coincide con la carta y el slot activo (`data-active="true"`) muestra la insignia de activo. Clic en slot de la pila de Oak no lo abre (sigue abriendo la ficha completa).
- AC-2 La sección Disponibles lista exactamente las cartas de `player.elements`; cada botón emite `{ type:'Equip', pkmUid, elementId }`. Tras aplicar el comando (motor real o sesión de test), la energía pasa a Equipadas, desaparece de Disponibles y **el popup sigue abierto** con la carta actualizada.
- AC-3 La sección Equipadas lista las energías de `pkm.equipped`; cada botón emite `{ type:'Unequip', pkmUid, elementId }`; tras aplicar, la carta vuelve al inventario y el popup sigue abierto.
- AC-4 Fuera de `organize` (p. ej. `battle`, `tileResolution`) todos los botones de equipar/desequipar están `disabled` y se ve `es.teamNotEditable`; el motor además rechaza el comando si llegara (regla intacta, test del motor T-013 ya existente).
- AC-5 Legalidad en vivo: con `equipped: []` los ataques con costo aparecen apagados con motivo `cost`; al equipar exactamente los elementos requeridos del ataque, su fila pasa a habilitada (sin cerrar el popup, sin recargar).
- AC-6 Cierre: botón cerrar, `Esc` y clic fuera cierran el popup. Si llega un `CardDrawn` con el detalle abierto, la caja muestra la carta robada y, tras su auto-cierre (D-29), el detalle vuelve a verse abierto.
- AC-7 Espectador (ver el equipo de otro jugador, D-28): el popup muestra la carta en solo lectura, sin secciones de inventario ni botones de equipar/desequipar.
- AC-8 El botón "Ficha completa" abre el overlay de `TeamPanel` tal como funciona hoy (red de regresión: evolucionar/Multicolor/Oak siguen accesibles) y cierra el popup.
- AC-9 Sin cambios en `packages/engine` (diff vacío) y todos los textos nuevos centralizados en `apps/web/src/i18n/es.ts` (rioplatense).

## Qué mirar (dueño)
- En tu turno (fase Organizar), tocá tu PKM activo en la tira del equipo: se abre el popup con la tarjeta TCG.
- Equipale una energía del inventario: la ficha salta a Equipadas y los ataques que ya pagan el costo se prenden al toque. Desequiparla la devuelve al inventario.
- En combate o sin ser tu turno, los botones quedan apagados con el aviso "Se equipa y evoluciona en la fase Organize".
- "Ficha completa" sigue abriendo el panel de equipo de siempre (evolución, Multicolor, Oak).
