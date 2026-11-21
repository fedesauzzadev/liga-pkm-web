# Reporte T-deck4 — 4.º nodo por mazo de terreno
- Estado: REVIEW | Rama/commit: —
- Resumen (≤ 5 líneas): script idempotente `tools/board/add-deck-nodes.mjs` parte la arista interna más larga de cada tirada de 3 por su punto medio (+5 nodos/+5 aristas en `kanto.json`). Separación mínima post-inserción ≥ 66,2 px ⇒ factor de escala 1 (no hubo escala; `deck-stacks.json` intacto). Asunciones 3/15 → 4/20 actualizadas; robo en nodos nuevos y caminata 200 movimientos verdes.
- Archivos clave tocados (rutas):
  - `content/board/kanto.json` (+ copia `kanto.json.bak` previa a todo)
  - `tools/board/add-deck-nodes.mjs` (nuevo), `shots/board-deck-nodes.svg` (nuevo)
  - `packages/content/src/board.ts` (status con sufijos + `meta.deck4`), `packages/content/src/board-checks.ts` (deck 15→20, 3→4)
  - `tests/t-deck4-board.test.ts` (nuevo), `tests/t003-board.test.ts`, `tests/decor-report.test.ts`
  - `specs/SPEC-A-foundations.md`, `docs/OPEN-QUESTIONS.md` (Q-093)

| mazo | tirada (ids) | arista partida | id nuevo | x,y | sep mín antes→después (px) | factor |
|---|---|---|---|---|---|---|
| montana | mont_2-mont_1-mont_3 | mont_1—mont_3 (172,7) | mont_4 | 113,1433 | 171,2 → 85,9 | 1 |
| isla | isla_1-isla_2-isla_3 | isla_1—isla_2 (145,3) | isla_4 | 611,1112 | 141,8 → 72,2 | 1 |
| bosque | bosque_3-bosque_2-bosque_1 | bosque_3—bosque_2 (133,4) | bosque_4 | 1028,1393 | 133,0 → 66,2 | 1 |
| pantano | pant_3-pant_2-pant_1 | pant_3—pant_2 (142,2) | pant_4 | 678,470 | 131,4 → 71,1 | 1 |
| llanura | llan_1-llan_2-llan_3 | llan_1—llan_2 (162,5) | llan_4 | 111,531 | 153,2 → 80,8 | 1 |

- AC cubiertos → test (deck4 → archivo:test):
  - 4 nodos consecutivos por mazo / +5 nodos+aristas / preservación id-type-deck-x-y-grado-vecinos / ≥65 px + colineal / meta+deck4 → `tests/t-deck4-board.test.ts` (5 tests)
  - robo en nodo nuevo (dado forzado, 5 mazos + PKM→FightOrRelease) → `tests/t-deck4-board.test.ts`
  - 200 movimientos semilla fija → `tests/t-deck4-board.test.ts` (compacto) + `tests/t011-property.test.ts` (1000×200, sigue verde)
  - conteos 20/4 → `tests/t003-board.test.ts`, `packages/content/src/board-checks.ts`
- `pnpm verify`: **OK** (exit 0; 997 tests, build, depcruise, size-limit, bench 70,7 ms/300 ms)
- `pnpm placements:report` / `pnpm decor:report`: 21/21 edificios y **0 solapamientos** (road 56→61 por las aristas nuevas; decoración sin ajustes)
- Decisiones tomadas / defaults aplicados:
  - "Conserva vecinos": los 2 extremos de cada arista partida quedan re-enrutados por el nodo nuevo (grado y resto de vecinos intactos; `nonDegree2` idéntico al .bak).
  - `BoardStatusSchema` enum → regex base+sufijos (`VERIFIED+deck4`); el warning de estado usa `startsWith('VERIFIED')`.
  - Fecha y factor registrados en `meta.deck4 {date, scale}` (nuevo campo opcional del schema).
  - `tests/decor-report.test.ts` fijaba `road: 56` → 61 (asunción de conteo encontrada por grep+verify).
  - `tasks/reports/T-003.md` queda como registro histórico (decía deck 15 = 3×5).
  - Guardadas viejas: contentHash cambia, aviso aceptado, sin migración.
- Dudas nuevas: Q-093 (bench content:load-validate flaquea a 490 ms SOLO cuando t006 lo corre dentro de la suite con CPU saturado; standalone 52-70 ms; fallaba igual en el baseline pre-deck4).
- Riesgos / deuda: ninguna pendiente de deck4. El shot SVG es evidencia numérica (sin foto de fondo, regla de privacidad).
