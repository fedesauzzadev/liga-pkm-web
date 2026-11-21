# Reporte absorber-confusion-sin-cura — Absorber con confusión: daño sí, curación no
- Estado: REVIEW | Rama/commit: `main` @ `f7fdf03` + WIP de otras sesiones en el árbol compartido.
- Resumen (≤ 5 líneas):
  - Fix en `packages/engine/src/battle-conditions.ts` `case 'drainNow'`: `healPkm` solo corre si `victimUid !== attackerUid` ⇒ con selfHit (confusión) el ataque de drenaje hace daño al propio PKM y **no** lo cura (antes se anulaba y el HP quedaba igual).
  - Tests primero (rojos → verdes) + regresiones de drenaje/confusión verdes; docs D-33 y nota en EFFECTS.
  - `pnpm verify` verde completo (typecheck, lint, 171 archivos / 1072 tests, content:validate, build, deps:check, size, bench).
- Archivos clave tocados (rutas):
  - `packages/engine/src/battle-conditions.ts` — `case 'drainNow'` (+1 comentario D-33).
  - `tests/t021-interaction.test.ts` — 3 tests nuevos (imports ampliados: `parseCardId`, `parsePkmUid`, `toBattle`, `PkmInstance`).
  - `docs/RULES.md` — fila `D-33` (confirmado, dueño, 2026-10-26).
  - `docs/EFFECTS.md` — `drainNow`: "Con selfHit (D-33): daño al propio PKM y sin curación".
  - `content/pokemon/_samples.json` — correcciones incidentales para desbloquear verify (ver Decisiones).
  - `tasks/reports/T-032c2.md` — ratio actualizado 12/15 → 14/18 (AC-4).
- AC cubiertos → test (SPEC-x/AC-n → archivo:test):
  - AC-1 → `tests/t021-interaction.test.ts` "fx-absorber con selfHit hace daño al atacante sin curar".
  - AC-2 → `tests/t021-interaction.test.ts` "fx-absorber contra el rival sigue dañando y curando" + suites `t021-primitives`, `t024-golden`, `t020-battle` verdes sin cambios.
  - AC-3 → `tests/t021-interaction.test.ts` "Tangela confundida con Absorber: orden de eventos selfHit" (SelfHit → AttackUsed(target propio) → DamageTaken(drainNow); sin Healed; turno rival intacto).
  - AC-4 → solo cambió `drainNow`; `healSelf`/`drainEachTurn`/FX de drenaje intactos (fuera de alcance).
  - AC-5 → D-33 en `docs/RULES.md` + nota en `docs/EFFECTS.md`.
  - AC-6 → `pnpm verify` OK (EXIT=0; 1072/1072 tests).
- `pnpm verify`: OK (verde completo; bench content:load 74.6 ms, tablero 0.6 ms, combate 2.3 ms; size 33.75/200 kB y 432.97/450 kB).
- Decisiones tomadas / defaults aplicados:
  - selfHit ⇒ daño sin curación y sin modificadores, directo (patrón de Q-011 "sin habilidades"); D-33 confirmado por el dueño en la sesión que motivó el plan.
  - Incidentales para que verify quede verde (WIP ajeno roto en el árbol compartido; no tocan mi alcance):
    1. `_samples.json` charmeleon/Giro-Fuego: `officialMove "firespin"` → `"fire-spin"` (typo rompía `loadContent` en todos los suites de combate).
    2. `_samples.json` charmeleon/Ira: quitado `officialMove "rage"` (movimiento sin puerto en showdown; regla T-032c2/AC-2; patrón `probar-encuentro-abra`).
    3. `_samples.json` poliwag: deck `isla` → `pantano` (staging lo llama `poliwag_pantano`; revierte cambio sin documentar que rompía T-044/AC-1).
    4. `tasks/reports/T-032c2.md` ratio 12/15 → 14/18 (documenta el estado real de sus AC).
    5. Borrado `packages/engine/src/__selftest_lint__.ts` (probe de `verify:selftest` de otra sesión concurrente que rompía typecheck).
- Dudas nuevas (→ OPEN-QUESTIONS.md) y ER solicitados (→ effect-requests/):
  - Q-100: ratificar las correcciones incidentales de `_samples.json` (2 y 3 tocan WIP de T-032c2/T-044 de otras sesiones).
  - Sin ER: no se usaron primitivas nuevas.
- Riesgos / deuda:
  - `healSelf` con selfHit y el FX visual de drenaje en auto-golpe quedan sin seguir (AC-4); abrir tarea solo si el dueño los pide.
  - Árbol compartido con sesiones concurrentes (BattleScene, selftest probes): verify puede fallar por debris ajeno transitorio; se limpió lo observado (Q-100).
