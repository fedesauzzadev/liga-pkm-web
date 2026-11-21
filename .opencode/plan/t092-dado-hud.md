# T-092 — Retomar: dado 3D fijo en un panel del HUD (fuera del tablero)

## Objetivo
Terminar T-092 (SPEC-N): el dado pasa a vivir únicamente en `panel-dice` del HUD. La implementación ya existe (componente, wiring, content, i18n) pero quedó a medias: `pnpm verify` falla en typecheck, faltan los tests por AC y el reporte. Hay que terminar sin rehacer lo que ya sirve.

## Estado encontrado (verificado, no rehacer)
- Hecho: `DicePanel.tsx` + `dice-panel.module.css`, slot `dice` en `GameShell` (+ CSS y orden Tab en `layout.ts`), wiring `DieRolled → appendDiceRolls → DicePanel` en `PlayScreen.tsx`, textos `hudDice*`/`shellPanelDice` en `es.ts`, panel `dice` en `content/ui/layout.json`, `camera.json` sin `dice.rest` (dado fuera del mundo), `Board.tsx`/`BattleScene.tsx` sin dado propio, `Die3D` con `showLabel=false`.
- Roto (acá se quedó sin tokens):
  - `pnpm verify` falla en typecheck con 4 errores (ver Paso 1).
  - No existen tests de T-092 (ni unitarios ni e2e).
  - No existe `tasks/reports/T-092.md`; BACKLOG sigue `DOING`.

## Criterios de aceptación
(SPEC-N/T-092, `specs/SPEC-N-visual-mvp-close.md`; un test por AC con comentario `// AC: SPEC-N/T-092/AC-n`)
- [ ] AC-1 `panel-dice` en columna izquierda, encima de `panel-turn`, sin solapes y dentro de pantalla a 1280×720, 1366×768 y 1920×1080 (test de layout con los rects de `content/ui/layout.json`).
- [ ] AC-2 El panel contiene el dado con contrato `rollTo(value)`, etiqueta de quién tiró, propósito y último valor.
- [ ] AC-3 Es el único dado visible: sin dado en el mundo ni en el popup de combate; el resultado lo dicta el motor (chequeo de fuente + render).
- [ ] AC-4 Muestra el dado del jugador activo + historial de las últimas 3 tiradas en texto; no bloquea clics del mundo fuera de su caja (`pointer-events` acotado al panel).
- [ ] AC-5 Con `reducedMotion` o velocidad "skip" muestra el valor directamente (sin rodar).
- [ ] AC-6 La cámara no apunta al dado: al tirar, el zoom va a la ficha (sin cue ROLL / sin `dieRest`).
- [ ] AC-7 E2E por `data-testid`: tras una tirada, `panel-dice` muestra valor del motor y nombre del jugador; sin solape con `panel-turn` ni `panel-players`.
- [ ] `pnpm verify` verde completo (typecheck, lint, test, content:validate, build, depcruise, size, bench).
- [ ] Reporte `tasks/reports/T-092.md` (≤ 60 líneas) y tarea pasada a `REVIEW` en `tasks/BACKLOG.md`.

## Archivos involucrados
- `apps/web/src/board3d/camara-libre-sin-ficha.test.ts` (fix: importa `./die` inexistente, usa `cameraPresets.dice.rest` y `BOARD3D.die` eliminados)
- `apps/web/src/game/PlayScreen.tsx:152` (fix: `state.activePlayerId` es `string | null`)
- `apps/web/src/hud/DicePanel.tsx` + `apps/web/src/hud/dice-panel.module.css` (ya escritos; tocar solo lo que fallen los tests)
- `apps/web/src/hud/dice-panel.test.tsx` (nuevo: AC-2..AC-5 unitarios; AC-3 chequeo de fuente)
- `apps/web/src/shell/layout.test.ts` (extender: AC-1 no-solape con `panel-turn`/`panel-players` en las 3 resoluciones)
- `e2e/t092-dice.mjs` (nuevo: AC-7) — registrarlo donde van los e2e (ver cómo se corren t071/t082 en `package.json`)
- `tasks/reports/T-092.md` (nuevo, con `tasks/REPORT_TEMPLATE.md`) y `tasks/BACKLOG.md` (DOING → REVIEW)
- Referencia: `specs/SPEC-N-visual-mvp-close.md` §T-092, `docs/NO-VISION.md`

## Plan de pasos
1. Fix typecheck: en `camara-libre-sin-ficha.test.ts` reescribir AC-2 al estado actual (sin `./die`, sin `dice.rest`: dado fuera del mundo, reposo ya no existe) y en `PlayScreen.tsx:152` resolver el `string | null` de `activePlayerId` con fallback (p. ej. `es.hudDiceIdle` o etiqueta genérica; registrar decisión si no es obvio).
2. Tests primero: escribir los tests de AC-1..AC-6 (unitarios + layout) y correrlos contra la implementación existente; ajustar implementación solo donde fallen.
3. E2E AC-7: crear `e2e/t092-dice.mjs` siguiendo el patrón de `e2e/t082-hud.mjs`; verificar que corre.
4. Correr `pnpm verify` completo hasta verde (incluye build, depcruise, size, bench).
5. Escribir `tasks/reports/T-092.md` (≤ 60 líneas: AC → test, decisiones, dudas en OPEN-QUESTIONS si surgen) y pasar T-092 a `REVIEW` en `tasks/BACKLOG.md`.

## Comandos de verificación
- `pnpm verify` (debe quedar verde completo)
- `npx vitest run apps/web/src/hud/dice-panel.test.tsx apps/web/src/shell/layout.test.ts` (iteración rápida)
- `node e2e/t092-dice.mjs` (o el runner que usen los demás e2e, verificar en `package.json`)
