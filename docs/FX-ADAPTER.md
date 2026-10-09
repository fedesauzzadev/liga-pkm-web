# FX-ADAPTER — animación de ataques

## Interfaz única
```ts
type FxArchetype = 'contact'|'projectile'|'beam'|'flame'|'water'|'electric'|'leaves'|'psychic'|'poison'
 |'sleep'|'heal'|'explosion'|'quake'|'wind'|'ice'|'ghost'|'buff';          // 17 arquetipos
interface FxContext { attacker: HTMLElement; defender: HTMLElement; layer: HTMLElement; // capa FX
  element: Element; side: 'player'|'rival'; speed: number; reducedMotion: boolean; signal: AbortSignal }
type MoveFx = (ctx: FxContext) => Promise<void>;
function playMoveFx(attack: Attack, ctx: FxContext): Promise<void>;
```
Resolución en `playMoveFx` (siempre en try/catch; nunca lanza, nunca decide resultados):
1. `showdownFx[attack.officialMove]` si existe y sus assets cargaron.
2. `archetypes[attack.fx]`.
3. `archetypes[defaultFxByElement[attack.element]]`.
`speed='skip'` o `reducedMotion` ⇒ versión mínima (destello breve en el defensor).

## Capa 1 — Adaptador Showdown (T-032c0 spike → T-032c2)
Pokémon Showdown implementa una función de animación por movimiento (en su cliente, `battle-animations-moves.ts`, objeto `BattleMoveAnims`) sobre sprites DOM (`<img>` con posición x/y/z, escala, opacidad) que se animan por tiempo. El adaptador es una **capa de compatibilidad mínima** que expone esa API (crear sprite de efecto, animar propiedades con easing, referenciar los sprites atacante/defensor) sobre nuestra escena.
Pasos del spike (time-box 2-3 días, **antes** de construir nada más):
1. **Licencia**: leer LICENSE del repo del cliente y de los assets de efectos (`/fx/`). Registrar en `docs/ASSETS.md`. Si algo no permite uso privado, parar y avisar al jefe.
2. Aislar la API que usan ≥ 80 % de las animaciones (sprites, `anim()`, backgrounds, flash). Escribir el shim.
3. Portar 6 movimientos de prueba: `bubble`, `flamethrower`, `scratch`, `vine-whip`, `thunderbolt`, `double-slap`; demo en `/dev/fx` con botón por movimiento y por sprite real.
4. Medir (móvil medio) y decidir DOM vs canvas.
5. Informe: viabilidad, API del shim, dificultad por movimiento de la lista del juego (fácil/medio/difícil), estimación.
**Si el jefe rechaza en el gate GS**: se sigue solo con arquetipos (el juego igual tiene animación de ataques).
Portado incremental (T-032c2): por dificultad, empezando por los movimientos de los iniciales y de los PKM de los mazos del MVP. Cada movimiento portado = 1 archivo `fx/showdown/<id>.ts` + entrada en el registro + test de humo (se ejecuta sin errores con elementos simulados).

## Capa 2 — Arquetipos propios (T-032c1, **primero**, para tener combate animado desde ya)
17 efectos reutilizables parametrizados por color/elemento: contact (golpe + destello de impacto), projectile, beam, flame (partículas ascendentes), water (burbujas), electric (zigzag + destello), leaves, psychic (ondas), poison (burbujas moradas), sleep (zZ), heal (destellos verdes), explosion, quake (sacudida de pantalla), wind, ice, ghost, buff (aura/brillo sobre el propio sprite).
Reglas: `transform`/`opacity` únicamente; ≤ 40 elementos DOM simultáneos; duración 400-900 ms (a 1×).

## Mapeo carta → movimiento (T-046)
Cada ataque lleva `officialMove` (id de PokeAPI/Showdown en inglés). El proceso: un LLM propone (`proposed`) usando el nombre del ataque, su texto y el elemento; la tabla de nombres ES↔EN sale de PokeAPI (T-045); el humano confirma en `/admin/cards` (`verified`). Sin mapeo (`unmapped`) ⇒ cae al arquetipo.

## Sprites de PKM
Preferir sprites animados frente/espalda de Showdown (`ani`/`ani-back`); fallback a estáticos de PokeAPI/sprites; fallback final: tarjeta con el nombre. Manifest `sprites.json` generado por `pnpm assets`.
