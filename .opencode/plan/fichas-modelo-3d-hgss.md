# Fichas del tablero con modelos 3D HGSS de los iniciales

## Objetivo

Reemplazar el sprite billboard de la ficha de cada jugador en el tablero 3D por el modelo 3D HGSS (OBJ + MTL + PNG) de su Pokémon inicial — Abra, Machop, Charmander, Bulbasaur y Squirtle, ya presentes en `assets-src/hgss/<Nombre>/` — reutilizando el pipeline HGSS existente (wishlist → manifiesto → `models:import` → carga toon). Solo cambia la representación en el tablero (`Board3D`); batalla, HUD y galerías siguen usando sprites.

## Criterios de aceptación

- [ ] AC-1 (contenido): `HGSS_KINDS` gain el kind `starter` y `HgssFileSchema` la clave opcional `forSpecies: string[]` (id dex, p. ej. `charmander`); `content:validate` pasa con el manifiesto extendido.
- [ ] AC-2 (manifiesto): `content/board/models.hgss.wishlist.json` y `content/board/models.manifest.json` tienen 5 entradas `hgss.starter` — `hgss/{Abra,Machop,Charmander,Bulbasaur,Squirtle}/model.obj` — cada una con `forSpecies` de a 1 especie, `targetHeight` (~0,7) y status revisable por el dueño en `/dev/models`.
- [ ] AC-3 (import): `pnpm models:import` copia los 5 `.obj` + `.mtl` + `.png` hermanos a `apps/web/public/models/hgss/…` sin superar `budgets.maxModelsMB` (carpeta gitignored: nada se commitea).
- [ ] AC-4 (tablero): la ficha de cada jugador monta el modelo 3D de su inicial (toonizado, altura normalizada por `targetHeight`, `rotY` fija) sobre la base cilíndrica; el sprite billboard NO se muestra cuando el modelo cargó; base y blob se conservan.
- [ ] AC-5 (fallback): especie sin modelo utilizable (status rechazado/failed o carga fallida) ⇒ sprite actual de `sprites.json`; sin sprite ⇒ peón de color. Cadena: modelo → sprite → peón.
- [ ] AC-6 (comportamiento intacto): el modelo es hijo del grupo ficha, así que el idle bob (T-069), los saltos parabólicos (T-063) y el movimiento por camino no cambian; el modelo NO hace billboard (anclado al tablero).
- [ ] AC-7 (perf): caché de plantilla por especie (1 carga por inicial, compartida entre fichas iguales); `pnpm size` y `pnpm bench` siguen verdes.
- [ ] AC-8 (tests): un test por AC en módulos puros (NO-VISION: sin inspección visual de renders).

## Archivos involucrados

- `packages/content/src/models.ts` — kind `starter` + `forSpecies` en `HgssFileSchema`/wishlist.
- `content/board/models.hgss.wishlist.json` — 5 entradas de los iniciales.
- `content/board/models.manifest.json` — grupo `hgss.starter`.
- `tools/models-suggest.ts` — `HGSS_DEFAULT_HEIGHTS.starter` + propagación de `forSpecies`.
- `apps/web/src/board3d/models/manifest.ts` — `hgssStarterModel(species)` + URL (estilo `hgssFilesFor`/`hgssModelUrl`).
- `apps/web/src/board3d/tokens.ts` — `setTokenModel(token, object3d)` (oculta peón y sprite; análogo a `setTokenSprite`).
- `apps/web/src/board3d/Tokens3D.tsx` — carga de plantilla por especie con `modelLoaders().loadObj` + toonize + normalización (reutilizar `templateFor`/helpers de `models/layer.ts`), fallback AC-5.
- `apps/web/src/board/Board.tsx` — extender `BoardTokenSpec` con `modelSpecies: string | null`.
- `apps/web/src/game/PlayScreen.tsx` — pasar el dex del starter (`team[0]`) como `modelSpecies`.
- `apps/web/src/theme/board3d.ts` — constantes nuevas (`BOARD3D.token.modelRotY`, offsets) si hacen falta; sin números mágicos.
- Tests: `apps/web/src/board3d/tokens.test.ts`, `apps/web/src/board3d/models/manifest-runtime.test.ts`, nuevo test del módulo de plantillas por especie.

## Plan de pasos

1. Schemas de contenido (`HGSS_KINDS` + `forSpecies`) y defaults en `models-suggest.ts`; tests de schema.
2. Wishlist + manifiesto con las 5 entradas; verificar con `pnpm content:validate`.
3. `hgssStarterModel` en `board3d/models/manifest.ts` + test.
4. `setTokenModel` en `tokens.ts` (+ theme) + tests puros.
5. Carga por especie en `Tokens3D.tsx` con caché y fallback; `BoardTokenSpec.modelSpecies` en `Board.tsx` y `PlayScreen.tsx`.
6. `pnpm models:scan` / `models:suggest` (o edición manual del manifiesto), revisar los 5 en `/dev/models`, `pnpm models:import` y verificación final.

## Comandos de verificación

```
pnpm content:validate
pnpm models:scan && pnpm models:suggest   # luego revisar/aprobar en /dev/models
pnpm models:import && pnpm models:check
pnpm verify                              # typecheck + lint + test + build + deps + size + bench
pnpm dev                                 # control visual del tablero (NO-VISION: manual)
```

Notas: los assets HGSS son privados (`assets-src/hgss/`, `public/models/hgss/` gitignored) — nunca commitear. Animación ≠ lógica: ningún resultado depende del render; solo se toca la capa visual de la ficha.
