# ENGINEERING-STANDARDS — calidad de ingeniería (obligatoria)
Principio: **lo que una herramienta puede hacer cumplir, lo hace cumplir la herramienta.** Las instrucciones solas no alcanzan. Cada regla indica su mecanismo; las que no tienen mecanismo las juzga el revisor (`/revisa`).

## 1. Patrones de diseño (usar estos)
| Necesidad | Patrón | Dónde |
|---|---|---|
| Todo cambio de estado | Comando → reductor puro → eventos | `packages/engine` |
| Turno y batalla | Máquina de estados explícita (estado + transición tipada) | engine |
| Efectos de ataques, casilleros, animaciones | Strategy + Registry (se agrega una entrada al registro; **prohibido** el `if`/`switch` gigante por carta) | engine, `battle/fx` |
| Cálculo de daño | Cadena de pasos: cada paso es una función pura `(ctx) => ctx` testeable por separado | engine |
| Fuentes externas (Showdown, PokeAPI) | Adapter detrás de una interfaz propia | web, tools |
| Estado | Inmutable (immer dentro del reductor); datos serializables | todo |
| Contenido | Indexado al cargar (`Map` por id) y solo lectura | content |
**Prohibido**: herencia de clases para modelar el juego, singletons, estado global mutable, `any`, magia con `eval`/`Function`.

## 2. Cero violaciones (bloquean `pnpm verify`)
| Regla | Mecanismo |
|---|---|
| TypeScript estricto + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | tsconfig (T-006) |
| `switch` exhaustivos (`never`) | ESLint `switch-exhaustiveness-check` |
| Sin `Math.random`/`Date.now`/`performance.now`/`console`/DOM en el motor | ESLint por carpeta |
| Dirección de imports `web → engine → content`, sin ciclos | dependency-cruiser |
| Ids que no se pueden mezclar (`CardId` ≠ `NodeId` ≠ `PkmUid`) | tipos con marca + Zod |
| Datos válidos en toda frontera (contenido, partida guardada, comandos de la UI) | Zod `parse`, nunca `as` |
| Peso del JS inicial ≤ 200 KB gzip | size-limit |
| Invariantes del juego tras **cada** comando (tests y desarrollo) | `assertInvariants` |
| Reglas de efectos: solo primitivas aprobadas | esquema Zod de `Effect` + `docs/effect-requests/` |
| No se relajan reglas para "hacer pasar" la tarea | `verify:selftest` + revisión |

### Invariantes mínimas (cada tarea que agrega estado registra las suyas)
- Cada carta existe **exactamente una vez** (en un mazo, mano/inventario, equipo, pila de Oak o equipada).
- Equipo ≤ 6; `uid` únicos; posición del jugador = nodo existente; `cameFrom` es vecino de `position` o `null`.
- `0 ≤ damage` y `damage ≤ hp` salvo PKM `fainted`; XP ≥ 0; ítems ≥ 0.
- Un PKM `fainted` nunca está en juego en batalla.
- Property tests (fast-check): secuencias aleatorias de comandos legales jamás violan una invariante, y `replay(seed, comandos)` reproduce estado y eventos idénticos.

## 3. Rendimiento (medir antes de optimizar; presupuestos en `perf-budget.json`)
- **Motor**: contenido indexado en `Map`; grafo con adyacencias precalculadas; sin copias profundas ni `JSON.parse(JSON.stringify())` en caminos calientes; sin asignaciones innecesarias dentro de bucles de combate.
- **Presupuestos** (se ajustan solo con evidencia): un turno de combate completo resuelto por el motor < 5 ms · un movimiento de tablero < 2 ms · carga y validación de todo el contenido < 300 ms · JS inicial ≤ 200 KB gzip · animaciones a 60 fps (solo `transform`/`opacity`).
- **Interfaz**: selectores finos en zustand (nunca suscribirse a todo el estado); `React.memo` solo donde un perfil lo justifique; listas virtualizadas si superan ~100 filas; sprites y efectos cargados bajo demanda; `import()` para combate, admin y dev.
- Cada tarea de motor que agrega un camino caliente (T-011, T-020, T-021) agrega su benchmark a `pnpm bench`.

## 4. Escalabilidad
- Motor sin dependencias de entorno ⇒ corre igual en navegador, tests y servidor futuro.
- Todo cambio de reglas pasa por `content/ruleset.*.json`, no por código.
- Estado versionado (`version`) con migraciones; guardado = semilla + log de comandos.
- Nuevos PKM/ataques/animaciones = datos + una entrada de registro, **sin tocar el núcleo**.

## 5. Observabilidad
- El motor no imprime: usa el `Logger` inyectado en `ctx.log` (comando, eventos, dados).
- `?debug=1` muestra un panel con los últimos comandos, eventos, dados y estado.
- "Exportar reporte de bug": descarga un JSON (versión, semilla, log de comandos, error, user agent). Con él se reproduce el error exacto.
- `ErrorBoundary` en cada escena: un error nunca deja la pantalla en blanco; ofrece "Reintentar" y "Exportar reporte".
- Errores del motor son tipados (`EngineError` con código) y nunca se tragan en silencio.

## 6. Tests
- Un test por `AC-n`; golden del manual; property tests de invariantes y replay; benchmarks.
- Cobertura de líneas del motor ≥ 90 %. Un test que solo "no falla" (sin aserciones sobre el resultado) cuenta como no escrito.
