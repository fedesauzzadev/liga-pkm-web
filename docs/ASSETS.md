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
| Código de animaciones de movimientos | https://github.com/smogon/pokemon-showdown-client (LICENSE = AGPL-3.0, texto completo re-verificado) | AGPL-3.0 confirmado por T-032c0: uso privado OK. Decisión del dueño 2026-10-09 (Q-006): para publicar, los FX se **reescriben con arquetipos propios (T-032c1)**; no se libera fuente bajo AGPL-3.0. Los puertos `apps/web/src/fx/showdown/*.ts` derivan de ese código | 2026-10-08 | T-043 (worker) + T-032c0 (confirma) |
| Datos (especies, movimientos, nombres ES) | https://pokeapi.co | Fair use policy de PokeAPI — uso privado; descarga por script T-045 (gitignored) | 2026-10-08 | T-043 (worker) |
| Arte del tablero y cartas | sin URL — juego de mesa físico de sugimoriARG (propiedad del dueño) | Uso privado entre amigos; permiso del autor si se abre al público (regla del dueño) | 2026-10-08 | dueño (regla del proyecto) |

Notas:
- Las URLs de fx verificadas en vivo (HTTP 200 el 2026-10-08): iceball, fireball, lightning,
  energyball, leftslash, rightslash, wisp, hitmarker, impact (seed para los 6 movimientos del
  spike T-032c0: bubble→iceball, flamethrower→fireball, thunderbolt→lightning,
  vine-whip→energyball, scratch→leftslash/rightslash, double-slap→wisp). T-032c0 agregó
  leaf1/leaf2 (los usa powerwhip = vine-whip) y verificó la bajada completa: 313/313, 0 faltantes.
- Si una fuente cambia de licencia y deja de permitir uso privado: frenar y avisar al jefe
  (SPEC-E/T-043/AC-3, FX-ADAPTER §Capa 1 paso 1).
