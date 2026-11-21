# Resolver Q-091: arreglar los 4 tests preexistentes que rompen `pnpm verify`

## Objetivo
Dejar `pnpm verify` verde arreglando los 4 fallos documentados en Q-091 (`docs/OPEN-QUESTIONS.md`): fixtures/reportes desactualizados después de que charmeleon pasó de `pending` a carta cargada. No hay bugs del motor ni de la UI; son datos de test viejos.

## Contexto (verificado hoy)
- **(a) t045 AC-2**: el mini-server PokeAPI del test no tiene a charizard (dex 6). La carta charmeleon de `content/pokemon/_samples.json` declara `evolvesTo: charizard`, pero la referencia que genera el fixture dice que charmeleon "evoluciona a: nada" ⇒ `collect()` da 1 error y `expect(ok.errors).toEqual([])` falla. La referencia REAL (`content/reference/pokeapi/`, gitignored) ya incluye charizard — no hace falta re-descargar nada ni tocar la red.
- **(b) t048 AC-1/AC-5**: `makeTmp()` copia solo charmander al `main.json` del tmp; su `evolvesTo: "charmeleon"` ya no está en `pending` (charmeleon es carta cargada) ⇒ `collect(tmp)` falla con `evolvesTo "charmeleon" no existe y no está en pending`.
- **(c) t032c2 AC-4**: `tasks/reports/T-032c2.md` declara `11/14 (79%)`; con el contenido actual el test calcula `12/15`.

## Criterios de aceptación
- [ ] `npx vitest run tests/t045-pokeapi.test.ts` verde (3/3): el fixture agrega a charizard — `pokemon(6, ['fire'])`, `species(6, 'Charizard', 'Charizard', 1)`, cadena 1 → `node(4, [node(5, [node(6)])])`, dex 6 en `DEXES` — y se actualizan las aserciones afectadas: lista de species `[4, 5, 6, 7, …]` y warning `11/151` → `12/151`.
- [ ] `npx vitest run tests/t048-house-edits.test.ts` verde (8/8): `makeTmp()` copia también la carta charmeleon real de `_samples.json` al `main.json` del tmp (opción "copiar la carta" del default de Q-091; charizard queda válido porque sí está en `pending`).
- [ ] `npx vitest run tests/t032c2-showdown-port.test.ts` verde (8/8): `tasks/reports/T-032c2.md` declara el ratio real actual `12/15` (80%), y el conteo de AC-2 (`11/11`) se recalca a `12/12` si cambió.
- [ ] `pnpm verify` completo verde (0 tests fallidos).
- [ ] Q-091 marcada `resuelta` en `docs/OPEN-QUESTIONS.md` con resumen de una línea del fix.
- [ ] Sin cambios fuera de alcance: no se toca el motor, ni `content/` real, ni `content/reference/pokeapi/` (ya verificada).

## Archivos involucrados
- `tests/t045-pokeapi.test.ts` — fixture del mini-server + aserciones (líneas ~51-71, 99, 115, 169).
- `tests/t048-house-edits.test.ts` — solo `makeTmp()` (líneas 52-77). Ojo: ya tiene 406 líneas (tope 400, deuda preexistente tipo Q-056): cambio mínimo, sin agrandar de más.
- `tasks/reports/T-032c2.md` — ratio `11/14` (líneas 8 y 24) y conteo `11/11` (línea 21).
- `docs/OPEN-QUESTIONS.md` — cerrar Q-091.

## Plan de pasos
1. t045: agregar charizard al server en memoria (`entries`, `speciesEntries`, cadena 1 con `node(6)`, `DEXES` + 6) y actualizar los 2 `expect` que cuentan species y el warning a `12/151`.
2. t048: en `makeTmp()`, buscar y copiar también `charmeleon` (fail explícito si no existe, igual que charmander).
3. t032c2: recalcular real/total como el test y actualizar las líneas de conteo de `tasks/reports/T-032c2.md`.
4. Marcar Q-091 `resuelta` en `docs/OPEN-QUESTIONS.md`.
5. Correr verificación completa.

## Comandos de verificación
```
npx vitest run tests/t045-pokeapi.test.ts tests/t048-house-edits.test.ts tests/t032c2-showdown-port.test.ts
pnpm verify
```
