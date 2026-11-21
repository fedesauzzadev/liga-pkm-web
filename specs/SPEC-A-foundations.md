# SPEC-A — Fundaciones (T-001…T-006)

## T-001 Scaffold
Entregables: pnpm workspace (`apps/web`, `packages/engine`, `packages/content`), TS strict, Vite+React, Vitest, ESLint con reglas de límites de import (web→engine→content), scripts raíz: `dev`, `build`, `typecheck`, `lint`, `test`, `content:validate`, `verify`, `digest`.
- AC-1 `pnpm verify` corre typecheck+lint+test+content:validate+build y termina en verde en un clon limpio.
- AC-2 Un import de `react` dentro de `packages/engine` hace fallar `lint`.
- AC-3 `pnpm dev` muestra una página "LIGA PKM" en el navegador.
- AC-4 `.gitignore` y `README` de desarrollo presentes. Sin dependencias fuera de la lista de AGENTS.md.

## T-002 Esquemas y contenido
Entregables: Zod + tipos para `PokemonCard`, `Attack`, `Effect` (todas las primitivas de EFFECTS.md, unión discriminada por `op`), `Ruleset`, `BoardGraph`, `DeckList`, `Item`. Loader que lee `content/**` y devuelve `Content` tipado. CLI `content:validate`.
- AC-1 `content/pokemon/_samples.json` y `ruleset.classic.json` validan.
- AC-2 Un `op` desconocido, `rollFaces` fuera de 1-6, o `hp ≤ 0` falla con mensaje que incluye ruta y id de carta.
- AC-3 Chequeos cruzados: ids únicos; `evolvesTo.id` existe (o está en lista `pending`); en una carta de salvaje/gimnasio las `rollFaces` de sus ataques no se solapan.
- AC-4 `{op:'custom'}` se permite pero el validador reporta su conteo (para el digest).
- AC-5 Los tipos exportados son los únicos que usa el motor.
- AC-6 `Attack` acepta `officialMove` (string), `officialMoveStatus` y `fx` (enum de 17 arquetipos de `docs/FX-ADAPTER.md`), todos opcionales. Si existe `content/reference/pokeapi/moves.json`, el validador comprueba que `officialMove` exista ahí y avisa (warning) de ataques sin `officialMove` ni `fx`.

## T-003 Tablero
Entregables: `BoardGraph` (nodos, aristas no dirigidas, tipos, forma `round|square|none`), API: `neighbors(id)`, `forwardOptions(id, cameFrom)`, `isSquare(id)`, `isDeadEnd(id)`.
Verificación: **el dueño** usa `tools/board-overlay.html` con la foto y `content/board/kanto.json`; corrige posiciones/aristas y exporta. Un worker integra el JSON corregido y lo marca `status:"VERIFIED"`.
- AC-1 Grafo conexo; 8 ciudades-gimnasio, 4 centros, 2 Oak, 5 mercados, 4 duelos, 20 nodos de mazo (4 por mazo, deck4), 1 start, 1 sorpresa, 1 liga (los conteos pueden ajustarse tras verificar y se documentan en el reporte).
- AC-2 `forwardOptions('pb_r','centro_r')` devuelve todos los vecinos menos `centro_r`; en callejón (`sorpresa`) devuelve `[]`.
- AC-3 Un test lista los nodos de grado ≠ 2 y coincide con el reporte (bifurcaciones y extremos).
- AC-4 El reporte incluye captura de pantalla del overlay con el grafo corregido. **Gate G0: el jefe revisa esa captura.**

## T-004 RNG, comandos y eventos
- AC-1 `createRng(seed)` determinista (mulberry32); `d6()` devuelve 1-6; distribución razonable (test estadístico laxo).
- AC-2 `applyCommand` devuelve `{state,events}` sin mutar el estado de entrada (test de inmutabilidad con `Object.freeze` profundo).
- AC-3 Toda tirada emite `DieRolled{purpose,value}`; `replay(seed, commands)` reproduce estado y eventos idénticos.
- AC-4 Tipos `Command`, `GameEvent`, `Decision` definidos y exportados; `legalCommands` existe (puede devolver pocos en esta etapa).

## T-005 Digest
`pnpm digest` imprime ≤ 200 líneas: árbol de 2 niveles, resumen de la última corrida de tests, # de cartas verificadas / sin verificar / con `custom`, firmas públicas exportadas de `packages/engine`, TODO/FIXME con ids, estado del backlog.
- AC-1 Salida determinista y ≤ 200 líneas en el repo de ejemplo.

## T-006 Barreras de calidad (ver `docs/ENGINEERING-STANDARDS.md`)
Convierte las reglas de ingeniería en bloqueos automáticos dentro de `pnpm verify`.
- AC-1 `tsconfig` base con `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`.
- AC-2 ESLint: en `packages/engine` prohíbe `Math.random`, `Date.now`, `performance.now`, `console` y cualquier global de DOM; en todo el repo prohíbe `any`, `@ts-ignore` y `@ts-expect-error` sin descripción, y exige `switch` exhaustivos (`switch-exhaustiveness-check`).
- AC-3 `dependency-cruiser` con reglas: `web → engine → content` (sin vueltas), sin dependencias circulares, `engine` sin `react`/`react-dom`/DOM.
- AC-4 `size-limit` con presupuesto de 200 KB gzip para el JS inicial; `pnpm verify` falla si se supera.
- AC-5 Tipos de id con marca (`CardId`, `NodeId`, `PkmUid`, `PlayerId`) en `packages/content`, con funciones de parseo Zod que los producen; mezclar dos tipos de id no compila.
- AC-6 Registro de invariantes: `registerInvariant(name, fn)` y `assertInvariants(state)`; el reductor la ejecuta tras cada comando cuando `NODE_ENV !== 'production'`. Cada tarea que agrega estado registra sus invariantes (T-010 registra "cada carta existe exactamente una vez", "equipo ≤ 6", "HP ≤ máximo").
- AC-7 `Logger` (interfaz) inyectado en `ctx`; `NoopLogger` por defecto; el motor solo usa `ctx.log`. Registra comando, eventos y dados.
- AC-8 `exportBugReport()` (versión, semilla, log de comandos, error, user agent) y descarga de JSON; `ErrorBoundary` genérico en el shell web; flag `?debug=1` que muestra un panel mínimo (el panel completo con estado y últimos eventos se conecta en T-030).
- AC-9 `pnpm bench` con `perf-budget.json` (presupuestos de ENGINEERING-STANDARDS §3); falla si un benchmark lo supera. T-011, T-020 y T-021 deben agregar los suyos.
- AC-10 Prueba de humo: un test intencionalmente roto de cada regla (AC-2, AC-3, AC-4) demuestra que `pnpm verify` falla (se ejecuta en un script `verify:selftest`).
