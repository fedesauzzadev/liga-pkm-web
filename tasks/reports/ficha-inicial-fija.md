# Reporte ficha-inicial-fija — la ficha del tablero siempre muestra el inicial base
- Estado: REVIEW | Plan: `.opencode/plan/ficha-inicial-fija.md`
- Resumen (≤ 5 líneas): el spec de la ficha (`spriteUrl`/`modelSpecies`) se resuelve
  desde la carta inicial BASE del mazo (`session.starterDeck` → `STARTER_BY_DECK`),
  no desde `p.team[0]`. Así la ficha no cambia al evolucionar el inicial ni al
  reordenar el equipo / intercambiar con Oak. Sin carta en el contenido o sin
  manifest ⇒ peón de color (fallback intacto). Motor sin cambios.
- Archivos clave tocados (rutas):
  - `apps/web/src/game/content.ts` — helper puro `starterTokenCard(starterDeck)`; `starterOptions` lo reusa.
  - `apps/web/src/game/PlayScreen.tsx` — `boardTokenSpecs(players, starterDeck, sprites)` (pura, exportada para tests) y el `useMemo` de `tokens` usándola con `current.starterDeck`.
  - `apps/web/src/game/PlayScreen.test.tsx` — 4 tests nuevos (uno por AC).
- AC cubiertos → test (SPEC-x/AC-n → archivo:test):
  - ficha-inicial-fija/AC-1 (Evolve no cambia la ficha) → PlayScreen.test.tsx: "tras Evolve la ficha sigue mostrando el inicial base" (Evolve real charmander→charmeleon con XP).
  - ficha-inicial-fija/AC-2 (5 mazos) → "cada mazo representa a su propio inicial base" (loop DECK_IDS vs STARTER_BY_DECK).
  - ficha-inicial-fija/AC-3 (orden del equipo) → "reorden/intercambio con Oak no cambia la ficha" (ReorderTeam real + inicial en oakPile).
  - ficha-inicial-fija/AC-4 (fallback peón) → "sin sprites: spriteUrl null, peón de color intacto" (manifest null + mazo sin carta en contenido + SSR board-2d).
  - ficha-inicial-fija/AC-5 (verify) → ver abajo.
- `pnpm verify`: FALLA solo por 4 tests pre-existentes ajenos (t045, t048×2, t032c2 — ver
  Q-091, registrados ANTES de esta tarea; verificado A/B revirtiendo mis ediciones: fallan
  idéntico). Todo lo demás verde: typecheck, lint, tests 981/985 (incluye los 23 de
  PlayScreen.test.tsx), content:validate, build, deps:check (426 módulos), size (31,11/200 kB
  y 432,33/450 kB), bench.
- Decisiones tomadas / defaults aplicados:
  - `boardTokenSpecs` exporta desde PlayScreen (patrón `isBoardDiePurpose`) porque el tablero
    2D no renderiza el spec y así el test ejercita la misma función que consume el `useMemo`.
  - La ficha usa la MISMA carta para todos los jugadores (MVP 1 jugador; `starterDeck` es
    único por partida en `newGame`).
  - Sin la carta del inicial en el contenido (bosque/llanura hoy) ⇒ null/null ⇒ peón,
    consistente con `starterOptions`.
- Dudas nuevas (→ OPEN-QUESTIONS.md) y ER solicitados: ninguna (los 4 fallos pre-existentes
  ya están en Q-091).
- Riesgos / deuda: ninguno nuevo; el modelo 3D de la ficha pasa a ser el del inicial base
  (comportamiento pedido por el plan, coherente con fichas-modelo-3d-hgss).
