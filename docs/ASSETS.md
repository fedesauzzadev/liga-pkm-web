# ASSETS — registro de fuentes y licencias
Nada de esto se commitea (ver `.gitignore`; guard en `tests/t043-assets.test.ts` AC-2).
Cómo se bajan: `pnpm assets` (`tools/assets.ts`, config `tools/assets.config.json`); los
faltantes quedan `null` en `sprites.json` o ausentes de `fx.json` (la UI tiene fallback).
Verificado 2026-10-08 (T-043): todas las fuentes permiten uso privado ⇒ no se frena.

| Asset | Fuente (URL) | Licencia/condiciones verificadas | Fecha | Quién lo verificó |
|---|---|---|---|---|
| Sprites animados frente/espalda | https://play.pokemonshowdown.com/sprites/ani/ y …/sprites/ani-back/ | Repo cliente Showdown AGPL-3.0; sprites © Nintendo/Creatures Inc./GAME FREAK Inc. — uso fan, solo proyecto privado (PRIVACY-DEPLOY) | 2026-10-08 | T-043 (worker) |
| Sprites estáticos (fallback) | https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/ (y back/) | LICENCE.txt del repo: imágenes © The Pokémon Company; distribución del repo CC0 1.0 Universal | 2026-10-08 | T-043 (worker) |
| Imágenes de efectos (`/fx/`) | https://play.pokemonshowdown.com/fx/ | Repo cliente Showdown (AGPL-3.0, mismo repo); assets © Nintendo/Creatures/GAME FREAK — uso privado | 2026-10-08 | T-043 (worker) |
| Sprites de entrenadores (líderes de gimnasio) | https://play.pokemonshowdown.com/sprites/trainers/ (id "Lt. Surge" = `ltsurge`; los demás líderes usan su nombre) | Repo cliente Showdown (AGPL-3.0, mismo repo); sprites © Nintendo/Creatures/GAME FREAK — uso privado | 2026-10-28 | fix-sprites-lideres-gimnasio (worker) |
| Insignias de gimnasio (medallas, `public/badges/`) | https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/badges/ | LICENCE.txt del repo: imágenes © The Pokémon Company; distribución del repo CC0 1.0 Universal — uso privado | 2026-10-28 | medalla-gimnasio (worker) |
| Código de animaciones de movimientos | https://github.com/smogon/pokemon-showdown-client (LICENSE = AGPL-3.0, texto completo re-verificado) | AGPL-3.0 confirmado por T-032c0: uso privado OK. Decisión del dueño 2026-10-09 (Q-006): para publicar, los FX se **reescriben con arquetipos propios (T-032c1)**; no se libera fuente bajo AGPL-3.0. Los puertos `apps/web/src/fx/showdown/*.ts` derivan de ese código | 2026-10-08 | T-043 (worker) + T-032c0 (confirma) |
| Datos (especies, movimientos, nombres ES) | https://pokeapi.co | Fair use policy de PokeAPI — uso privado; descarga por script T-045 (gitignored) | 2026-10-08 | T-043 (worker) |
| Arte del tablero y cartas | sin URL — juego de mesa físico de sugimoriARG (propiedad del dueño) | Uso privado entre amigos; permiso del autor si se abre al público (regla del dueño) | 2026-10-08 | dueño (regla del proyecto) |
| Kenney Mini Forest 1.0 (modelos .glb) | https://kenney.nl/assets/mini-forest (pack descomprimido por el dueño en `assets-src/kenney/`) | (CC0 1.0 — License.txt del pack, verificado por `pnpm models:scan`, T-070a/AC-3) | 2026-10-13 | T-070 (worker) |
| Kenney Nature Kit (modelos .glb) | https://kenney.nl/assets/nature-kit | (CC0 1.0 — License.txt del pack, verificado por `pnpm models:scan`) | 2026-10-13 | T-070 (worker) |
| Kenney City Kit (Suburban) 2.0 (modelos .glb) | https://kenney.nl/assets/city-kit-suburban | (CC0 1.0 — License.txt del pack, verificado por `pnpm models:scan`) | 2026-10-13 | T-070 (worker) |
| Kenney Survival Kit (modelos .glb) | https://kenney.nl/assets/survival-kit | (CC0 1.0 — License.txt del pack, verificado por `pnpm models:scan`) | 2026-10-13 | T-070 (worker) |
| Modelos HGSS (OBJ/MTL/PNG de HeartGold/SoulSilver) | https://models.spriters-resource.com/ds_dsi/pokemonheartgoldsoulsilver/ (wishlist: `content/board/models.hgss.wishlist.json`; el dueño los descarga a mano) | **NO redistribuible** — extraídos de un juego de Nintendo/Game Freak: solo uso privado; `assets-src/hgss/` y `apps/web/public/models/hgss/` son gitignored y el sitio se publica con acceso restringido (PRIVACY-DEPLOY) | 2026-10-13 | T-070 (worker) |
| Modelos nuevos del tablero (gim, pokecenter, pokemart, league, oak — `.glb` en `assets-src/new/`) | sin URL — los puso el dueño en `assets-src/new/` (Parche 9, `LEEME-PARCHE-9.md`; oak llegó con el Parche 11/T-099); fuente/origen sin registrar | **Licencia: a confirmar por el dueño** (SPEC-N/T-091/AC-1): solo uso privado mientras tanto (PRIVACY-DEPLOY); `pnpm models:use-new` los copia a `apps/web/public/models/new/` y ambos directorios son gitignored como HGSS hasta confirmar | 2026-10-19 | T-091 (worker) |

Notas:
- Kenney: `pnpm models:scan` → `models:suggest` → revisar `/dev/models` → `pnpm models:import`
  copia SOLO los elegidos + License.txt a `apps/web/public/models/<pack>/` (CC0 ⇒ commiteables,
  presupuesto `decor.json › budgets.maxModelsMB`).
- HGSS: los `.obj` + `.mtl` + `.png` viven fuera del repo; el test
  `apps/web/src/board3d/models/manifest-runtime.test.ts` verifica que `git ls-files`
  no registre nada de `assets-src/` ni `public/models/hgss/` ni `public/models/new/` (T-070e/AC-6).
- Modelos nuevos (T-091 + T-099): `pnpm models:use-new` detecta `assets-src/new/` por
  nombre base (gim, pokecenter, pokemart, league y oak ⇒ kind `lab`), copia los 5 `.glb`
  (+ texturas externas) a `apps/web/public/models/new/` y registra `newModels` en
  `models.manifest.json`. Licencia pendiente de confirmación del dueño.
- Las URLs de fx verificadas en vivo (HTTP 200 el 2026-10-08): iceball, fireball, lightning,
  energyball, leftslash, rightslash, wisp, hitmarker, impact (seed para los 6 movimientos del
  spike T-032c0: bubble→iceball, flamethrower→fireball, thunderbolt→lightning,
  vine-whip→energyball, scratch→leftslash/rightslash, double-slap→wisp). T-032c0 agregó
  leaf1/leaf2 (los usa powerwhip = vine-whip) y verificó la bajada completa: 313/313, 0 faltantes.
  T-032c2 agregó shell/purplewisp (withdraw, stun-spore = spore) y verificó 315/315, 0 faltantes.
- Si una fuente cambia de licencia y deja de permitir uso privado: frenar y avisar al jefe
  (SPEC-E/T-043/AC-3, FX-ADAPTER §Capa 1 paso 1).
