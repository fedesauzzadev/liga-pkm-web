# DIAG-tablero — Diagnóstico de casilleros (T-060)
- Estado: REVIEW | Tests: `tests/t060-diag-tablero.test.ts` (15: 8 pasan, 7 todo T-061)

## Matriz casillero × (a motor resuelve / b eventos+pending / c UI recibe / d componente muestra)

| Casillero | a. Motor resuelve | b. Eventos / pending | c. Store UI recibe | d. Componente muestra |
|---|---|---|---|---|
| deck:bosque | OK `tiles.ts:189-193` | OK `CardDrawn`; PKM ⇒ `pending=FightOrRelease` (test deck:bosque PASA) | PARCIAL `PlayScreen.tsx:44-46` encola; `pending` FightOrRelease sí llega a la UI (`PlayScreen.tsx:59`) | PARCIAL: panel de encuentro solo ofrece "Dejar ir" (`PlayScreen.tsx:99-111`); falta `btn-fight`; `CardDrawn` no se muestra |
| deck:montana | OK (ídem) | OK (test PASA) | PARCIAL (ídem) | PARCIAL (ídem) |
| deck:isla | OK (ídem) | OK (test PASA) | PARCIAL (ídem) | PARCIAL (ídem) |
| deck:llanura | OK (ídem) | OK (test PASA; ojo: sin cartas PKM propias en content, se probó con poliwag) | PARCIAL (ídem) | PARCIAL (ídem) |
| deck:pantano | OK (ídem) | OK (test PASA) | PARCIAL (ídem) | PARCIAL (ídem) |
| mercado | OK `tiles.ts:194-195` | OK `CardDrawn{deck:'item'}` + bolsa (test PASA) | PARCIAL: encola pero nadie consume `CardDrawn` | FALTA: sin mensaje de robo/ítem (no hay `tile-panel`) |
| centro | OK `tiles.ts:196-197` | OK `TeamHealed` (spec pide `PartyHealed{count}`) (test PASA) | PARCIAL: nadie consume `TeamHealed` fuera de batalla | FALTA: `battleMsgTeamHealed` existe pero solo en coreografía de combate (`es.ts:101`) |
| oak | OK (turno avanza) `tiles.ts:212-216` | FALTA: `[]` sin evento ni pending; swap solo vía `legalCommands` (`legal.ts:104-114`) | FALTA: sin pending, la UI no muestra nada | FALTA: sin botón `btn-oak-swap` |
| gym | OK `tiles.ts:198-211` | PARCIAL: `GymLocked` si faltan medallas (test PASA); desafiable ⇒ `[]` sin `pending=ChallengeGym` (test TODO T-061) | FALTA: `AcceptGymChallenge` existe en `legalCommands` pero la UI nunca lo ofrece | FALTA: sin `btn-challenge`/`btn-skip` |
| empty | OK (turno avanza) `tiles.ts:212-216` | FALTA: sin `TileResolved{none}` (test TODO T-061) | — (nada que recibir) | FALTA |
| start | OK (turno avanza) `tiles.ts:212-216` | FALTA: sin `TileResolved{none}` (test TODO T-061) | — (nada que recibir) | FALTA |
| duelo (ruleset off) | OK (como vacío) `tiles.ts:183-187` | FALTA: sin `TileResolved{disabledByRuleset}` (test TODO T-061) | — | FALTA |
| sorpresa (ruleset off) | OK (como vacío) `tiles.ts:183-187` | FALTA: ídem (test TODO T-061) | — | FALTA |
| liga (ruleset off) | OK (como vacío) `tiles.ts:183-187` | FALTA: ídem (test TODO T-061) | — | FALTA |

Notas de la cadena:
- (a→b) `Advance` en fase `tileResolution` resuelve y cierra turno salvo pending (`engine.ts:116-129`); el movimiento aterriza en esa fase (`movement.ts:147`).
- (c) `PlayScreen.send` aplica el comando, encola cada evento en el store zustand y guarda (`PlayScreen.tsx:34-50`); el store reproduce con delay y solo hace `tick++` (`events/store.ts:30-47`): **ningún componente lee la cola para mostrar mensajes de casillero**.
- (d) No existe `<TilePanel data-testid="tile-panel">` (grep: solo docs/specs). Botones existentes: `RollMove`, `Advance`="Resolver casillero", `ReleaseWild` (`PlayScreen.tsx:87-108`).
- Divergencias de nombre motor↔spec (T-061): `TeamHealed` vs `PartyHealed{count}`; `EnergyGained` no existe (la energía solo emite `CardDrawn`).

## Tests de integración (AC-2)
`tests/t060-diag-tablero.test.ts` — 15 tests (uno por tipo, deck×5):
- PASAN (8): deck×5 (elemento⇒CardDrawn+inventario; PKM⇒FightOrRelease), mercado (CardDrawn item+bolsa), centro (TeamHealed), gym cerrojo (GymLocked con requiresMedals 7).
- TODO T-061 (7, corridos y fallidos en el diagnóstico, cuerpos comentados listos para reactivar): oak (pending OakSwap), gym desafiable (pending ChallengeGym), empty/start (TileResolved{none}), duelo/sorpresa/liga (TileResolved{disabledByRuleset}).
- `pnpm test`: 326 pasan, 7 todo, **1 falla preexistente ajena** (`tests/triage-customs.test.ts` "grupo sin resolver: cada turno si sacas 1-2-3 tu pkm no ataca" — dominio triage-customs/T-046, no tablero).

## Arreglos mínimos ordenados por dependencia (AC-3)
1. **Motor**: evento `TileResolved{info}` en `resolveTile` para oak/empty/start/junction y deshabilitados; `pending=OakSwap` (decisión nueva) y `pending=ChallengeGym` (opcional, reusa `AcceptGymChallenge`); decidir `EnergyGained`/`PartyHealed{count}` vs nombres actuales.
2. **Store/UI**: consumir la cola de eventos (mensajes de `CardDrawn`/`DeckEmpty`/`TeamHealed`/`GymLocked`) y mapear los pending nuevos.
3. **UI**: `<TilePanel data-testid="tile-panel">` con botones `btn-fight`, `btn-oak-swap`, `btn-challenge`, `btn-skip`; textos en `i18n/es.ts`; `?seed`/`?dice` de dev (AC-4).
4. **Contenido**: bosque/llanura sin cartas PKM cargadas en `content/pokemon` (sus robo-PKM no se pueden probar con carta propia).

## Qué mirar el dueño (NO-VISION)
Nada visual en esta tarea (todo testeado con eventos/estado). Para T-061: revisar textos propuestos del panel en `i18n/es.ts`.
