# SPEC-T — Quitar energías y Multicolor: 0 energías es legal (T-104)
Origen: reporte del dueño (2026-10-21). "El PKM activo dice que tiene una energía Fuego asignada pero no se la puedo quitar." Diagnóstico verificado en código:

1. **Multicolor asignado no se puede quitar NUNCA**: el motor solo tiene `AssignMulticolor` (equipment.ts); no existe `UnassignMulticolor`. Una vez asignado como Fuego, el PKM conserva esa "energía Fuego" para siempre (solo reasignable). La ventana de carta (T-103) la muestra en "Equipadas" como ficha **no interactiva** (`data-multicolor`) → parece exactamente "una energía Fuego que no se puede quitar".
2. **Las energías comunes sí se pueden quitar todas** (`unequipElement` no exige mínimo), pero solo en fase `organize` (regla del manual). No hay test que congele "hasta 0".

**Decisión del dueño (regla de producto, confirmada en este reporte): un PKM puede quedarse con 0 energías equipadas y sin Multicolor asignado.** Esta spec extiende D-23 y crea el comando que falta. Sin cambios de combate, tablero ni cámara.

## T-104 Quitar energías y Multicolor

### Motor (packages/engine, puro)
- AC-1 Nuevo comando `UnassignMulticolor { pkmUid }`: quita la única carta Multicolor asignada del PKM (máx 1, D-23); la carta vuelve a los libres del jugador (el contador `player.multicolor` no cambia: la invariante `equipamiento/multicolor-coherente` ya cuenta "asignadas ≤ cartas"). Emite evento nuevo `MulticolorUnassigned { player, pkmUid }`. Sin azar, estado JSON serializable (ADR-1).
- AC-2 `legalCommands` lo ofrece SOLO en fase `organize`, sin `pending`, para el jugador activo y únicamente por PKM de su equipo con `multicolor.length > 0`. Mismo gating que `Unequip` (RULES §3).
- AC-3 El handler valida como los demás comandos de equipo y rechaza con `ILLEGAL_COMMAND` tipado: fase equivocada, PKM inexistente/ajeno a la pila del equipo, o sin Multicolor asignado. `version` del guardado NO cambia (comando nuevo: los replays existentes siguen válidos).
- AC-4 Efecto visible en reglas: tras desasignar, `canUse`/`legalAttacks` pierden esa energía (un ataque que pagaba con el Multicolor pasa a ilegal por costo) y la invariante `multicolor-coherente` sigue en verde con 0 asignadas.

### Regla canónica
- AC-5 `docs/RULES.md` §5 suma la decisión **D-30**: "Un PKM puede quedarse con 0 energías y sin Multicolor. Quitar (energías y Multicolor) es legal en Organize, fuera de combate. El Multicolor asignado se puede quitar (vuelve a libres) o reasignar (extiende D-23)". Confirmada por el dueño el 2026-10-21.

### UI (ventana de carta T-103 + ficha T-033)
- AC-6 En "Equipadas" de la ventana de carta, la ficha del Multicolor asignado deja de ser decorativa: pasa a botón `data-command="UnassignMulticolor"` (mismos estados habilitado/atenuado con motivo corto que ya usan las energías; en solo lectura no hay acciones, AC-14 de SPEC-R intacto).
- AC-7 Al quitar: la ficha desaparece de "Equipadas", "Multicolor libres" sube 1 y las filas de ataque se recalculan en vivo (el ataque que la usaba muestra ✖ con su motivo, p. ej. "Falta 1 Fuego").
- AC-8 Energías comunes hasta 0: test de regresión que equipa y desequipa TODAS las energías de un PKM (queda `equipped: []`) sin errores, con los ataques pasando a ✖ y el PKM seguible en la UI. El motor ya lo permite; este AC lo congela.
- AC-9 `CardSheet` (T-033, "Ficha completa") ofrece lo mismo para el Multicolor asignado (botón quitar con el mismo gating), para que ambas vistas coincidan.
- AC-10 Historial (panel-history): el evento `MulticolorUnassigned` suma una entrada con texto i18n en español rioplatense (p. ej. "{name} devolvió su Multicolor.").

### Verificación sin ojos (docs/NO-VISION.md)
- AC-11 Un test por AC con comentario `// AC: SPEC-T/T-104/AC-n`: motor (commands/legal/handler/invariante) + UI (renderToString, patrón T-103) + un paso e2e en `e2e/t103-card-modal.mjs` (o script corto nuevo): en Organize, asignar Multicolor como Fuego desde la ventana, quitarlo, verificar contador + fila ✖, todo por `data-testid`.

## Qué mirar (dueño)
- Asignale un Multicolor como Fuego a tu activo desde la ventana de carta y tocalo en "Equipadas": se va, "Multicolor libres" sube y el ataque que pagaba con Fuego queda ✖.
- Quitale TODAS las energías al inicial (queda en 0): sin errores, ataques ✖, y podés volver a equipar.
- En combate o en el turno de otro jugador, ninguna acción (solo lectura), igual que hoy.
