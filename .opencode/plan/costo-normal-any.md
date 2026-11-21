# Costo "energía normal" = cualquier energía (`any`)

## Objetivo
Que un ataque cuyo costo muestra "energías normales" (círculo gris) se pague con **cualquier** energía: de un color específico o Multicolor asignado. D-24 (confirmado, dueño): no existen cartas de energía Normal; el slot canónico es `any`. Hoy `Charmeleon` ("Rasguños") usa `cost: ["normal","normal"]` y `canUse` lo vuelve imposible de usar porque exige 2 energías `normal` equipadas.

## Criterios de aceptación
- [ ] AC-1: `content/pokemon/_samples.json` — Charmeleon "Rasguños" tiene `cost: ["any","any"]` (sin `'normal'`).
- [ ] AC-2: `content:validate` rechaza todo slot de costo cuyo elemento no tenga carta de energía (`energyCard: false` en `content/energy.json`: `normal` y `dragon`), con error que sugiera usar `any` (D-24).
- [ ] AC-3: `canUse` con costo `["any","any"]` da `true` con 2 energías cualesquiera (2 del mismo color, 2 de colores distintos, o 1 equipada + 1 Multicolor asignado) y `false` con solo 1.
- [ ] AC-4: `canUse` con costo mixto `["fire","any"]` exige 1 Fuego específico + 1 cualquiera; el slot `any` no exige Fuego (regresión).
- [ ] AC-5: `costGaps` (apps/web/src/cardmodal/model.ts) con `["any","any"]` nunca reporta "Falta Normal"; con 1 sola energía reporta el gap genérico (`element: 'any'`). Test espejo en model.test.ts si no existe para 2 slots `any`.

## Archivos involucrados
- `content/pokemon/_samples.json` (dato: cost de Charmeleon)
- `packages/content/src/validate.ts` (guarda: slots de costo vs `energyCard` de `content/energy.json`)
- `packages/engine/src/equipment.ts` (`canUse`: sin cambios esperados; hoy `any` ya cae solo en el chequeo de total)
- `tests/t013-equipment.test.ts` (AC-3/AC-4, comentario `// AC:` por caso)
- `tests/t002b-content.test.ts` (AC-2: el validador rechaza `normal`/`dragon` en costos)
- `apps/web/src/cardmodal/model.test.ts` (AC-5, solo si falta el caso 2×`any`)

## Plan de pasos
1. Tests primero: AC-3/AC-4 en `tests/t013-equipment.test.ts`, AC-2 en `tests/t002b-content.test.ts`, AC-5 en `model.test.ts` si aplica.
2. Corregir el dato de Charmeleon en `content/pokemon/_samples.json` (`"normal","normal"` → `"any","any"`).
3. Agregar la guarda en `packages/content/src/validate.ts`: al validar cada carta, los slots de `attack.cost` deben ser `'any'` o un elemento con `energyCard: true` (usa el `energy.json` ya cargado).
4. Si algún test de motor expone un fallo real de `canUse` con `any`, arreglarlo en `equipment.ts` (mínimo); si no, no tocar el motor.

## Comandos de verificación
- `pnpm content:validate`
- `pnpm test -- tests/t013-equipment.test.ts tests/t002b-content.test.ts`
- `pnpm verify`
