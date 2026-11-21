# Botón de prueba manual: encuentro con Abra del mazo Pantano

## Objetivo

Un botón dev-only al lado del anteojito que, al apretarlo, fuerza el flujo **real** de robar la carta de Abra del mazo Pantano (evento `CardDrawn` + decisión `FightOrRelease`), sin depender del azar del tablero. El dueño pelea y captura a mano con la UI existente: es una prueba manual del juego completa (robo → pelea → captura).

## Criterios de aceptación

- [ ] AC-1 (motor): Nuevo comando `{ type: 'DebugEncounter'; deck: DeckId; card: CardId }`, legal solo en fase `organize` y sin decisión pendiente: saca `abra` de `draft.decks.pantano` (esté donde esté), emite `CardDrawn { deck: 'pantano', card: 'abra' }`, y deja `pending: FightOrRelease` con `phase: 'tileResolution'` e `stepsLeft` 0. Mismo estado que deja `resolveTile` tras robar un PKM (tiles.ts): `FightEncounter` queda legal sin tocar nada más.
- [ ] AC-2 (motor): Fuera de `organize`, con decisión pendiente (guard `PENDING_DECISION` existente), o si la carta no está en el mazo (p. ej. ya capturada) ⇒ error `ILLEGAL_COMMAND` con mensaje claro y estado sin mutar.
- [ ] AC-3 (motor, flujo): `DebugEncounter` → `FightEncounter` → `Attack` (dados fijos por `Rng` inyectado) → rival derrotado → `Capture`: Abra queda en el equipo, se gasta 1 Pokébola, el turno vuelve a `organize`. El comando entra al `commandLog` y `replay` lo reproduce determinístico (save/restore sigue andando).
- [ ] AC-4 (contenido): La carta `abra` existe en el contenido del juego: copia de `content/pokemon/_staging/iniciales-02-abra.json` (efectos ya mapeados a primitivas `rollGate`, sin customs) a `content/pokemon/_samples.json`, con `kadabra` agregada a `pending` (convención poliwhirl). `content/decks.dev.json`: pantano += `abra` ×2 (2 copias para que funcione aunque el inicial sea pantano, ya que `newGame` saca 1 del mazo). `pnpm content:validate` verde.
- [ ] AC-5 (UI): Botón con `data-testid="btn-dev-encounter"` al lado del anteojito (panel `devEncounter` en `content/ui/layout.json`, x≈0.06 / y 0.017), icono SVG inline + `aria-label`/`title` desde `es.ts`. Solo en dev: `PlayScreen` pasa el handler únicamente con `import.meta.env.DEV` (patrón `devmode.ts`). Se oculta junto con el resto del HUD (no hace falta para restaurar) y entra a `FOCUS_ORDER` después de `hudToggle`.
- [ ] AC-6 (UI, flujo): Tras el click aparece el popup de carta robada + botones Pelear/Liberar (TilePanel/CardPopup existentes), pelear abre el `BattlePopup` con Abra de rival, y al capturar Abra aparece en el team. El click envía `{ type: 'DebugEncounter', deck: 'pantano', card: 'abra' }` por `send` (nada de mutar estado desde la UI, ADR-1).
- [ ] AC-7: Un test por AC con comentario `// AC: probar-encuentro-abra/AC-n` y `pnpm verify` verde.

## Archivos involucrados

- `content/pokemon/_samples.json` — carta `abra` (+ `kadabra` en `pending`).
- `content/decks.dev.json` — pantano: `abra` ×2.
- `content/ui/layout.json` — panel `devEncounter`.
- `packages/content/src/ui.ts` — `UI_PANEL_KEYS` += `devEncounter`.
- `packages/engine/src/commands.ts` — unión `Command` += `DebugEncounter` (no resuelve ninguna decisión).
- `packages/engine/src/debug.ts` — NUEVO: dominio `debugEncounter(draft, content, command)` (~40 líneas).
- `packages/engine/src/engine.ts` — handler + `case` en `applyCommand`.
- `apps/web/src/shell/layout.ts` — `FOCUS_ORDER` += `devEncounter` (skip en el map, como `hudToggle`).
- `apps/web/src/shell/DevEncounterButton.tsx` — NUEVO: botón (patrón `HudToggle.tsx`).
- `apps/web/src/shell/GameShell.tsx` — prop `onDevEncounter?: () => void`; render junto a `HudToggle`, oculto con el HUD.
- `apps/web/src/game/devmode.ts` — export `devToolsEnabled(): boolean` (DEV).
- `apps/web/src/game/PlayScreen.tsx` — pasa `onDevEncounter` en dev: `send({ type: 'DebugEncounter', deck: 'pantano', card: 'abra' })`.
- `apps/web/src/i18n/es.ts` — `devEncounterLabel`.
- `tests/t-dev-encounter.test.ts` — NUEVO: tests motor AC-1..AC-3.
- `apps/web/src/shell/GameShell.test.tsx` / `apps/web/src/game/PlayScreen.test.tsx` — tests AC-5..AC-6.

## Plan de pasos

1. Contenido: copiar la carta de Abra del staging a `_samples.json` (+`kadabra` pending) y sumar `abra` ×2 a pantano en `decks.dev.json`; correr `pnpm content:validate` y ajustar los checks de conteo afectados (sin relajar reglas).
2. Motor (tests primero en `tests/t-dev-encounter.test.ts`): comando `DebugEncounter`, dominio en `debug.ts`, wiring en `engine.ts`; invariantes existentes deben quedar verdes.
3. Layout: panel `devEncounter` en `layout.json` + key en `ui.ts` + `FOCUS_ORDER`; textos en `es.ts`.
4. UI: `DevEncounterButton.tsx`, prop en `GameShell.tsx`, wiring dev-gated en `PlayScreen.tsx` vía `devToolsEnabled()`.
5. Tests UI (uno por AC) y `pnpm verify` verde.

## Comandos de verificación

- `pnpm verify` (typecheck + lint + test + content:validate + build)
- Prueba manual: `pnpm dev` → nueva partida → botón al lado del anteojito → Pelear → capturar a Abra.
