# Reporte probar-encuentro-abra — Botón dev: encuentro con Abra del mazo Pantano
- Estado: REVIEW | Rama/commit: — (plan `.opencode/plan/probar-encuentro-abra.md`)
- Resumen (≤ 5 líneas): comando `DebugEncounter` (solo `organize`, sin pending) que saca una carta
  exacta de un mazo y deja el mismo estado que `resolveTile` (CardDrawn + FightOrRelease en
  `tileResolution`), + botón dev-only `btn-dev-encounter` junto al anteojito que envía
  `{ deck:'pantano', card:'abra' }` por `send`. Contenido: carta `abra` en `_samples.json`
  (efectos `rollGate` ya mapeados, sin customs) y pantano += abra ×2 en `decks.dev.json`.
- Archivos clave tocados (rutas):
  - Motor: `packages/engine/src/{commands,engine}.ts` · NUEVO `packages/engine/src/debug.ts`.
  - Contenido: `content/pokemon/_samples.json` (abra + `kadabra` pending) · `content/decks.dev.json`
    · `content/ui/layout.json` (panel `devEncounter`) · `packages/content/src/ui.ts`.
  - UI: `apps/web/src/shell/{layout.ts,GameShell.tsx,GameShell.test.tsx}` · NUEVO
    `apps/web/src/shell/DevEncounterButton.tsx` · `apps/web/src/game/{devmode.ts,PlayScreen.tsx,PlayScreen.test.tsx}`
    · `apps/web/src/i18n/es.ts` (`devEncounterLabel`).
  - Tests afectados ajustados: `tests/{t010-setup,t045-pokeapi}.test.ts` · `apps/web/src/shell/layout.test.ts`
    · `tasks/reports/T-032c2.md` (ratio 11/14).
- AC cubiertos → test (probar-encuentro-abra/AC-n → archivo:test):
  - AC-1..AC-3 → `tests/t-dev-encounter.test.ts` (3 tests; AC-3 usa sesión real seed 1 + restore).
  - AC-4 → `pnpm content:validate` verde + fixture abra/kadabra en `tests/t045-pokeapi.test.ts`.
  - AC-5 → `apps/web/src/shell/GameShell.test.tsx` (caja/i18n/SVG/FOCUS_ORDER/gating/hudHidden).
  - AC-6 → `apps/web/src/game/PlayScreen.test.tsx` (DebugEncounter → Pelear/Liberar → BattlePopup
    con Abra → Capture → Abra en el team).
  - AC-7 → un test por AC con comentario `// AC: probar-encuentro-abra/AC-n`.
- `pnpm verify`: FALLA solo por 3 tests preexistentes ajenos (Q-089: t098-close AC-3 nota del
  backlog perdida en WIP merge; lighting.test T-080 AC-4/AC-5) + flake RPC conocido (Q-040).
  Todo lo demás verde: typecheck, lint, tests 901/904, content:validate, build, deps:check,
  size (29,46/200 kB), bench OK.
- Decisiones tomadas / defaults aplicados:
  - La carta copiada del staging NO lleva `officialMove` (hypnosis/confusion/psybeam no están
    portados y SPEC-D/T-032c2/AC-2 exige puerto para todo officialMove): usa los arquetipos `fx`
    sleep/psychic/beam (fallback siempre disponible); el informe T-032c2 quedó en 11/14.
  - `decks.dev.json` se editó a mano (abra ×2): regenerar con `pnpm gen:dev-decks` lo bajaría a ×1.
  - `t010-setup` AC-2 dejó de listar pantano/abra como "inexistente" (ahora existe, AC-4 del plan).
  - Fixture t045: cadena abra→kadabra (63/64) y conteos 9/151→11/151.
- Dudas nuevas (→ OPEN-QUESTIONS.md) y ER solicitados: ninguna nueva (los 3 fallos preexistentes
  ya están en Q-089). ER: ninguno.
- Riesgos / deuda: `packages/engine/src/engine.ts` 420→429 líneas (tope 400 ya excedido antes,
  misma clase de deuda que Q-056); el manual test del botón (`pnpm dev`) queda para el dueño.
