# Pantano con look de pantano, mazo al norte y swap de edificios de Fucsia

## Objetivo
Que la zona pantano deje de verse violeta y tenga aspecto de pantano (verde/pardo turbio, vegetación muerta, niebla y burbujas). Además: mover el pedestal del mazo Pantano un poco hacia el norte del tablero, y corregir el swap de edificios: el Gimnasio de Ciudad Fucsia debe estar junto al nodo `fucsia` y el Centro Pokémon junto al nodo `centro_r` (hoy se ven cruzados).

## Criterios de aceptación
- [ ] AC-1: `biomes.colors.pantano` en `content/board/style.json` ya no es violeta (`#8C74B0`) y `deckColors.pantano` en `apps/web/src/theme/board3d.ts` ya no es `#6B4E9B`; ambos pasan a un verde/pardo pantanoso turbio (paleta inspirada en skill `create-game-assets`). Test eco actualizado: `packages/content/src/style.test.ts` (line ~63 hardcodea el mapa de colores).
- [ ] AC-2: La decoración de pantano se intensifica usando SOLO kinds existentes (`deadTree`, `mist`, `rock`, `reeds`, `mushroom`, `deadBush`, `swampBubbles`): más scatter en `decor.json:zones.pantano` y ajuste de `edgeProps.byZone.pantano` en `style.json`. Sin kinds nuevos ni código de piezas nuevo. `t095-decor-overlaps` y budgets de decor siguen verde.
- [ ] AC-3: `stacks.pantano.y` en `content/board/deck-stacks.json` baja entre 40 y 80 px (norte = −y, ver nota `celeste` en `placements.json`), sin pisar nodos/caminos: `pnpm content:validate` verde.
- [ ] AC-4: `pnpm placements:report` muestra el edificio `gym` de `fucsia` del lado del nodo `fucsia` (757,619) y el `pokecenter` de `centro_r` del lado del nodo `centro_r` (755,760), sin warnings nuevos. La corrección va en `content/board/placements.json` (`nodes.fucsia` / `nodes.centro_r`: sideDeg/kind/note); nodos y caminos de `kanto.json` NO cambian.
- [ ] AC-5: `pnpm verify` verde (incluye tests eco que referencian fucsia/centro_r, ej. `t101-building-sizes.test.ts`, `placements-real.test.ts`).

## Archivos involucrados
- `content/board/style.json` — `biomes.colors.pantano`, `edgeProps.byZone.pantano`, opcional `life.zones.pantano` / `ambientFx.swampBubbles`
- `content/board/decor.json` — `zones.pantano.scatter`
- `apps/web/src/theme/board3d.ts` — `deckColors.pantano` (line ~291)
- `content/board/deck-stacks.json` — `stacks.pantano.y` (line 5)
- `content/board/placements.json` — `nodes.fucsia` (line 35) y `nodes.centro_r` (line 34)
- Tests eco: `packages/content/src/style.test.ts`, `apps/web/src/board3d/t101-building-sizes.test.ts`, `packages/content/src/placements-real.test.ts`

## Plan de pasos
1. Elegir paleta pantanosa (verde oliva/pardo turbio; usar skill `create-game-assets` como guía) y actualizar `style.json` + `board3d.ts` + eco en `style.test.ts`.
2. Enriquecer `zones.pantano` en `decor.json` (más `deadTree`/`mist`/`reeds`) y `edgeProps` en `style.json`; mantener `clearance` y budgets.
3. Mover `stacks.pantano.y` ~−60 px en `deck-stacks.json`; verificar con `tools/board-overlay.html` si hace falta.
4. Corregir el swap en `placements.json`: ajustar `sideDeg`/kind de `fucsia` y `centro_r` para que el Gimnasio quede junto a `fucsia` y el Centro Pokémon junto a `centro_r`; verificar con `pnpm placements:report`.
5. Correr `pnpm verify` y ajustar solo tests eco.

## Comandos de verificación
- `pnpm placements:report`
- `pnpm verify`
- `pnpm shots` (opcional, captura `deck-pantano` para inspección visual)
