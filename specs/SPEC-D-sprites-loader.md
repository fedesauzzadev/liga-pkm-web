# SPEC-D-sprites-loader: Integración del Manifiesto de Entrenadores

## Objetivo
Exponer los sprites de entrenadores descargados (manifiesto `trainers.json`) a la capa de UI del juego, permitiendo que `BattleScene` acceda a ellos mediante el hook `useSprites`.

## AC
- [ ] AC-1: `apps/web/src/battle/sprites.ts` debe importar y fusionar `trainers.json` en el estado de `SpritesManifest`.
- [ ] AC-2: `SpritesManifest` debe actualizarse para incluir el campo `trainers: Record<string, { front: string | null }>`.
- [ ] AC-3: `useSprites` debe retornar el manifiesto completo, permitiendo que la UI cargue sprites de entrenadores por ID.

## Plan de trabajo
1. Modificar `apps/web/src/battle/sprites.ts`.
2. Actualizar tipos de `SpritesManifest` para soportar la estructura de entrenadores.
3. Verificar que la carga sea compatible con la estructura generada por `tools/assets.ts`.
