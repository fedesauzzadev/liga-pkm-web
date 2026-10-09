# SPEC-B — Tablero, turnos e inventario (T-010…T-013)
Reglas: `docs/RULES.md` §1-2, §5 (D-01, D-09…D-13).

## T-010 Estado inicial y Setup
- AC-1 `newGame({seed, starterDeck, ruleset})` crea 1 jugador en `paleta` con el inicial correspondiente (Bulbasaur/Charmander/Squirtle/Machop/Abra) + 1 elemento de su tipo equipado, 2 comodines, 5 pokebolas, 0 medallas, `cameFrom=null`.
- AC-2 Si la carta del inicial no existe en el contenido, error claro (no crash).
- AC-3 Los mazos se barajan con el RNG (misma semilla ⇒ mismo orden); el inicial se saca del mazo.
- AC-4 `GameState` es serializable (`JSON.parse(JSON.stringify(s))` ≡ `s`).

## T-011 Movimiento (núcleo L)
Comandos: `RollMove`, `ChoosePath{to}`, `StopHere`, `ContinueMoving`.
- AC-1 `RollMove` emite `DieRolled{move}` y fija `stepsLeft`.
- AC-2 En un nodo con >1 salida (excluyendo `cameFrom`) el motor deja `pending=ChoosePath{options}`; con 1 salida avanza solo.
- AC-3 Nunca se ofrece volver a `cameFrom` durante el movimiento. Tras frenar en un cuadrado, `cameFrom=null` (el próximo turno puede ir en cualquier dirección).
- AC-4 Al **pasar** por un nodo cuadrado con pasos restantes, `pending=StopOrContinue`; frenar descarta los pasos restantes y resuelve el casillero.
- AC-5 Un nodo redondo solo se resuelve si se cae exacto; al pasar no pasa nada.
- AC-6 Rebote (D-01): al llegar a un fin de camino con pasos restantes, el recorrido continúa en sentido inverso por los pasos sobrantes; si en el camino de vuelta hay bifurcación, se elige. Ej.: a 2 pasos de `sorpresa` con tirada 5 ⇒ avanza 2 y retrocede 3.
- AC-7 Property test: 1000 partidas aleatorias de 200 movimientos con semillas fijas nunca violan AC-3 y siempre terminan en un nodo existente.
- AC-8 Un nodo `junction` nunca es destino final ni se puede frenar en él.

## T-012 Casilleros y mazos
- AC-1 `deck`: robar carta superior; Elemento ⇒ `elements`; PKM ⇒ `pending=FightOrRelease`.
- AC-2 `mercado`: robar de `item`; `centro`: cura todos (daño=0, `fainted=false`); `oak`: comando `SwapWithOak{...}` respeta límite 6, y los que pasan a la pila se curan.
- AC-3 "Dejar ir" devuelve la carta al **fondo** del mazo (D-09). Mazo vacío ⇒ evento `DeckEmpty` sin error (D-10).
- AC-4 `duelo`, `sorpresa`, `liga` se comportan como vacíos si el ruleset los deshabilita.
- AC-5 Ítems usados vuelven al fondo del mazo ítem; los elementos nunca vuelven.

## T-013 Equipamiento y costos
Comandos: `Equip{pkmUid, elementId}`, `Unequip`, `AssignWildcard{pkmUid, element}`.
- AC-1 `canUse(pkm, attack)` cumple RULES §3: por cada elemento específico, #equipados (+comodines asignados) ≥ requeridos del mismo; total equipado ≥ `cost.length`; cada ataque se evalúa solo (Krabby con 2 Agua usa sus 3 ataques).
- AC-2 Un comodín cuenta como 1 elemento, el que se le asignó.
- AC-3 Solo se puede equipar/reasignar en `Organize` (no en combate).
- AC-4 `legalAttacks(pkm, isFirstTurn)` aplica la regla de "primer ataque" (RULES §4) y devuelve los permitidos.
