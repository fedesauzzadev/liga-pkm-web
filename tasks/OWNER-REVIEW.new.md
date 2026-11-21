# OWNER-REVIEW — checklist del dueño (sin depender del jefe)
Una tarea se cierra (pasa a DONE en `tasks/BACKLOG.md`) solo si: `pnpm verify` verde · existe `tasks/reports/T-xxx.md` · hiciste la comprobación de abajo. Para las tareas críticas (T-011, T-021, T-024, T-049) corré además `/revisa T-xxx` con otro modelo.

## Fase 0
- [ ] T-001 `pnpm verify` verde en clon limpio; `pnpm dev` muestra "LIGA PKM"
- [ ] T-002 `pnpm content:validate` acepta las muestras y rechaza una carta con un dato roto (probalo vos)
- [ ] T-002b `content:validate` imprime energías por mazo (bosque 40, montana 40, isla 38, llanura 38, pantano 40) e ítems = 60; ya no existe la palabra "wildcard/comodín" en el código
- [ ] T-003 `tools/board-overlay.html`: el grafo coincide con tu tablero; exportaste el JSON corregido y quedó `VERIFIED`
- [ ] T-004 misma semilla + mismos comandos = misma partida (hay test)
- [ ] T-006 `pnpm verify:selftest` pasa; probá vos: escribí `Math.random()` en el motor y `pnpm lint` tiene que fallar
- [ ] T-005 `pnpm digest` imprime < 200 líneas
- [ ] T-043 `pnpm assets` corre; `git status` no muestra imágenes; `docs/ASSETS.md` con fuentes y licencias
- [ ] T-042a las 15 hojas de contacto en `content/photos/contact/` muestran todas las cartas bien recortadas y en orden; el conteo coincide con `_manifest.csv`
## Spike (paralelo)
- [ ] T-032c0 `/dev/fx`: los 6 movimientos se animan sin errores; leíste la recomendación → decisión **GS**: seguir / parcial / descartar
## Fase 1
- [ ] T-010 los 5 iniciales arrancan con 2 Multicolor y 5 pokebolas
- [ ] T-011 (crítica) a mano: no retrocede, frena en cuadrados, rebota en callejón, elige en bifurcaciones
- [ ] T-012 caés en cada tipo de casillero y pasa lo del manual
- [ ] T-013 PKM con 2 de Agua usa los ataques que piden 2 de Agua; una carta Multicolor cuenta como 1 energía del tipo asignado
## Fase 2
- [ ] T-020 hay tabla de pruebas de daño con piso en 0
- [ ] T-021 (crítica) un test por efecto con su ejemplo del manual (incluye `fixedRolls` y `nextAttackBonus`)
- [ ] T-022 con 6 PKM, el 7º capturado va a la pila de Oak
- [ ] T-023 el líder gana al derrotar 2 de los tuyos; 8 medallas = victoria; los premios coinciden con `gyms.json`
- [ ] T-024 (crítica) Clefairy vs Tangela da los mismos números que las págs. 45-49
- [ ] T-049 (crítica) Master Ball en el turno 1 captura; Ultra Ball no se deja usar con 41 de vida restante y sí con 40; Oportunidad con 4-5-6 roba una carta Sorpresa
## Fase 3
- [ ] T-044 jugás una partida completa con cartas de prueba (energías e ítems con las cantidades reales)
- [ ] T-030 con velocidad "saltar" el resultado final es el mismo
- [ ] T-031 la ficha camina por el camino real y podés elegir en bifurcaciones
- [ ] T-032b 20 tiradas: el dado siempre cae en el número del motor
- [ ] T-032c1 `/dev/fx` muestra los 17 efectos; todo ataque del contenido tiene alguno
- [ ] T-047 `/dev/icons`: se ven los 16 íconos, legibles a 16 px; los costos de una carta se leen bien
- [ ] T-032a se ve sprite + carta propia + carta rival; ataques ilegales apagados con motivo
- [ ] T-032d un turno de ataque < 3,5 s; se ve golpe, daño, barra y derrota
- [ ] T-033 equipás energías y Multicolor, y evolucionás desde la ficha
- [ ] T-034 cerrás la pestaña, volvés y "Continuar" te deja en el mismo punto
## Fase 4
- [ ] T-045 `pnpm pokeapi` baja los 151; el validador marca un nombre/tipo mal transcripto
- [ ] T-040 `/admin/cards` muestra foto + formulario y guarda
- [ ] T-041 sobre las cartas extraídas, medís cuántas salen con error
- [ ] T-042b las 12 cartas del piloto coinciden con las físicas (nombre, HP, ataques, costos, caras de dado); leíste el informe de errores
- [ ] T-046 confirmás cada mapeo viendo la animación
- [ ] T-048 copiás `_example.json`, lo activás y ves el cambio en la carta; desactivado vuelve el original
- [ ] T-042c 10 cartas al azar por grupo coinciden con las físicas; revisás el reporte de diferencias (esperado: Isla 58 y Pantano 59) y decidís qué falta
- [ ] T-032c2 (si GS aprobó) el informe indica el % de ataques con animación real
## Fase 5
- [ ] T-050 JS inicial ≤ 200 KB gzip; sitio no accesible sin login ni indexable (`docs/PRIVACY-DEPLOY.md`)

## Si algo falla
Si `pnpm verify` falla 2 veces seguidas con el mismo error, o el worker propone cambiar una regla o un esquema: frená, anotalo en `docs/OPEN-QUESTIONS.md` y resolvelo con otro modelo (`/revisa`) o recién ahí consultame.
