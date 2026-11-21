# Reporte registrar-captura — la carta capturada no vuelve a salir del mazo
- Estado: REVIEW | Rama/commit: — (plan `.opencode/plan/registrar-captura.md`)
- Resumen (≤ 5 líneas): capturar ahora REGISTRA la carta: `captureWild` y `throwBall` remueven TODAS
  las copias restantes de los mazos que sirven salvajes (5 de terreno + sorpresa) vía el helper
  `removeWildCopies` (progression.ts). Sin refresco, `DebugEncounter` de una carta capturada es
  rechazado con el mensaje "no está en el mazo". Sin eventos nuevos ni UI (deckCounts ya deriva).
- Archivos clave tocados (rutas):
  - Motor: `packages/engine/src/progression.ts` (helper + `captureWild`) · `packages/engine/src/battle-commands.ts` (`throwBall`).
  - Tests: `tests/t022-progression.test.ts` (AC-1/AC-3/AC-4, +~120 líneas) · `tests/t049-items-sorpresa.test.ts` (AC-2).
  - Docs: `docs/OPEN-QUESTIONS.md` (Q-102, duda del inicial).
- AC cubiertos → test (registrar-captura/AC-n → archivo:test):
  - AC-1 → t022 "AC-1 registrar-captura: Capture deja los mazos de terreno y sorpresa sin la carta" (fixture con copia restante en pantano + sorpresa).
  - AC-2 → t049 "AC: registrar-captura/AC-2 ThrowBall deja los mazos sin copias del capturado" (Master Ball, patrón battleWith).
  - AC-3 → t022 "AC-3 …": sesión real Montaña/semilla 1 → DebugEncounter(abra) → pelear → Capture ⇒ pantano sin abra y re-DebugEncounter ILLEGAL_COMMAND /no está en el mazo/; Release y derrota dejan ambas copias (restante + al fondo).
  - AC-4 → t022 "AC-4 …": `restoreSession(saveFromSession(...))` reproduce el MISMO `state.decks` (hash verificado por session.ts).
  - AC-5 → `pnpm verify` verde (1133/1133; t-dev-encounter, t022, t049, golden y PlayScreen sin cambios).
- `pnpm verify`: OK — typecheck, lint, tests 1133/1133 (179 archivos), content:validate, build,
  deps:check, size y bench (71,3/300 · 0,4/2 · 1,8/10 ms) verdes.
- Decisiones tomadas / defaults aplicados:
  - Mazos filtrados = `DECK_IDS` (5 de terreno) + `sorpresa`; el mazo Ítem nunca (ítems no son capturables).
  - La remoción no emite evento: es una derivación del `PokemonCaptured` existente (animación ≠ lógica).
- Dudas nuevas (→ OPEN-QUESTIONS.md) y ER solicitados: Q-102 (duda del inicial: solo la captura
  registra; el plan la llamaba "D-25", id ya tomado por Cartas repetidas ⇒ sería D-34 si se confirma).
  ER: ninguno.
- Riesgos / deuda: `tests/t049-items-sorpresa.test.ts` pasa de 494 a ~511 líneas (tope 400 ya
  excedido antes, misma clase de deuda que Q-056). Durante la corrida una sesión concurrente dejó
  probes/WIP (`__t006_probe_web__.ts` borrado, patrón Q-100; `verificar-promueve-carta`/`pokemonFiles`
  esperados a que completaran): verify quedó verde recién cuando esa sesión terminó su burst.
