# Subir presupuesto de modelos (Q-090)

## Objetivo

Resolver Q-090: `pnpm verify` falla porque `apps/web/public/models` pesa ~33,5 MB > `budgets.maxModelsMB: 24` (`content/board/decor.json:31`). Decisión del dueño (como en Q-061 y T-099): **subir el presupuesto a 36 MB**, sin comprimir los GLB.

## Criterios de aceptación

- [ ] AC-1: `content/board/decor.json` `budgets.maxModelsMB` pasa de 24 a **36** (cubre los 33,5 MB reales con ~2,5 MB de holgura) y `pnpm content:validate` da verde.
- [ ] AC-2: El test `AC: SPEC-K/T-070d/AC-1` (`apps/web/src/board3d/models/manifest-runtime.test.ts`) pasa (pesa la carpeta real contra el presupuesto del decor.json; no hay que tocar el test).
- [ ] AC-3: `pnpm verify` completo queda verde (sin tests rojos).
- [ ] AC-4: `docs/OPEN-QUESTIONS.md` marca Q-090 como `resuelta por dueño (2026-10-24, subir-presupuesto-modelos)`: presupuesto 24 → 36, se deja registrado que la compresión de los 5 GLB de `public/models/new/` queda como ajuste de asset opcional a futuro.

## Archivos involucrados

- `content/board/decor.json` — línea 31, `budgets.maxModelsMB`: 24 → 36.
- `docs/OPEN-QUESTIONS.md` — entrada Q-090 (línea 94): `abierta` → `resuelta por dueño`.

## Plan de pasos

1. Medir y documentar el peso real de `apps/web/public/models` (evidencia para el registro).
2. Editar `content/board/decor.json`: `maxModelsMB: 24` → `36`.
3. Actualizar la entrada Q-090 en `docs/OPEN-QUESTIONS.md` con la resolución.
4. Correr `pnpm verify` completo; confirmar verde.

## Comandos de verificación

```
pnpm vitest run apps/web/src/board3d/models/manifest-runtime.test.ts
pnpm content:validate
pnpm verify
```
