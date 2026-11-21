# Reporte triage-customs — Triage de efectos custom post-extracción
- Estado: REVIEW | Spec: `.opencode/plan/triage-customs.md`
- Resumen (re-corrida 2026-10-11: re-ingesta de Iniciales + `_staging` nuevo de Gimnasios): 7 customs en 7 grupos → 5 mapeados a primitivas de `docs/EFFECTS.md` (pila A), 2 con texto truncado por la extracción → `ER-001`/`ER-002` (pila B); conteo final 2 customs = 2 ER pendientes.
- Archivos clave: `tools/triage-customs.ts` (`pnpm triage [--apply]`), `packages/content/src/validate.ts`, `tests/triage-customs.test.ts`, `content/pokemon/_staging/{Iniciales_02,Iniciales_03,Gimnasios1_02,Gimnasios 2_03}.json` (gitignored), `docs/effect-requests/ER-00{1,2}.md`.

## Grupos (AC-1/AC-2)
| # | Texto normalizado | Cartas (archivo) | Pila |
|---|---|---|---|
| 1 | `4-5-6 cada turno si tu rival saca 1-2-3 se auto-ataca` ×1 | abra/confusión (`Iniciales_02.json`) | A → `rollGate [1,2,3] selfHit combat onRoll [4,5,6]` (EFFECTS §4, Confusión) |
| 2 | `si tu rival saca 1-2 se auto-ataca` ×1 | abra/hipno-rayo (`Iniciales_02.json`) | A → `rollGate [1,2] selfHit nextTurn` (EFFECTS §4, Hipno-rayo con caras 1-2) |
| 3 | `5-6 tu rival no atacara` ×1 | bulbasaur/lianas (`Iniciales_03.json`) | A → `rivalSkipsAttack [5,6]` (EFFECTS §4, Lianas) |
| 4 | `cada turno si sacas 1-2-3 tu pkm no ataca` ×1 | koffing-de-koga/pantalla-de-humo (`Gimnasios1_02.json`) | A → `rollGate [1,2,3] noAttack combat` (EFFECTS §4, fila "Polvo de esporas", mismo texto) |
| 5 | `tu pkm se hace (50). koffing se hace (20)` ×1 | koffing-de-koga/explosión (`Gimnasios1_02.json`) | A → `selfDamage 20` (EFFECTS §4 "Explosión: damage.base 50 + selfDamage 20"; el JSON ya tiene base 50) |
| 6 | `shock-trueno: cada ... sacas 2 tu pkm` ×1 | raichu-de-surge/shock-trueno (`Gimnasios 2_03.json`) | B → `ER-001` (texto truncado; propuesta `rollGate` familia trueno) |
| 7 | `equipo: cuando ataques tira el dado. si sacas 3-4 ... o ataca` ×1 | raichu-de-surge, especialidad EQUIPO (`Gimnasios 2_03.json`) | B → `ER-002` (texto truncado; propuesta `defendGate [3,4] noAttack`, Doble equipo) |

- Pila C: sin duplicados en esta corrida (los grupos 1-3 se re-aplicaron por texto normalizado tras la re-ingesta, como prevé Q-030).

## Aplicación (AC-3)
- `pnpm triage --apply`: 5 mapeos en 3 archivos; `rawText` del ataque conservado; cartas quedan `source.verified:false` + `needsReview:true` para verificación física en `/admin/cards`.

## AC cubiertos → test
- AC-1..AC-6 → `tests/triage-customs.test.ts` (un test por AC: `AC-n …`).

## Decisiones / defaults
- `content:validate` suma los customs de `_staging/` (bugfix: el conteo canónico pisaba el de staging tras el refactor de T-048); ahora imprime 2 == ER pendientes.
- `collectCustoms` junta también customs directos en `specialties` (antes solo `attacks[].effects`), misma forma de contar que `countCustomEffects` — sin eso, la especialidad EQUIPO quedaba invisible para la invariante.
- `pendingErs`: ER pendiente = `ER-nnn.md` sin línea `Estado: aprobado` (ER-001 y ER-002 están pendientes).

## Dudas (→ docs/OPEN-QUESTIONS.md)
- Q-029: interpretación de "4-5-6 cada turno…" y duración de Hipno-rayo (default: canon de EFFECTS §4).
- Q-030: triage parcial; re-correr `pnpm triage` tras cada carga (los mapeos conocidos se re-aplican por texto normalizado).
- Q-032 (cerrada): los grupos nuevos de Gimnasios recibieron mapeo (canon §4) o ER-001/ER-002 por texto truncado de la extracción (T-041); confirmar el texto completo contra la física al aprobar.

## Verificación
- `pnpm triage`: customs restantes (2) == ER pendientes (2): OK.
- `pnpm content:validate`: verde, `2 efecto(s) custom`.
- `pnpm verify`: verde (ver corrida final en el chat).

## Riesgos / deuda
- La dueña debe verificar las 5 cartas mapeadas contra las físicas (`/admin/cards`, filtro "Sin verificar"). El texto crudo se conserva en `attack.rawText`.
- ER-001/ER-002 requieren re-extraer o corregir el `rawText` truncado de `Gimnasios 2_03.jpg` antes de aprobar.
