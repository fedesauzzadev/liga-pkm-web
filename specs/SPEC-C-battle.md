# SPEC-C — Batalla (T-020…T-024)
Reglas: `docs/RULES.md` §4, `docs/EFFECTS.md` completo. **Estas tareas requieren el modelo más fuerte.**

## T-020 Núcleo de batalla
Estado `BattleState{kind:'wild'|'gym', sides:[A,B], active, turnSide, conditions{...}, firstTurnFlags}`.
Comandos: `FightEncounter`, `Retire{to}`, `UsePotion{pkmUid,target}`, `Attack{attackId}`, `Advance` (pasar).
- AC-1 Orden del turno de combate: poison/drain → wake → pociones → retirar | atacar (RULES §4). Un test por paso verifica el orden de eventos.
- AC-2 Quién actúa primero: retador; tras una derrota actúa el lado que repone; `startsFirst` adelanta (D-02).
- AC-3 Salvaje/gimnasio: `attackSelect` por `rollFaces`; sin coincidencia ⇒ evento `NoAttack`.
- AC-4 Pipeline de daño exactamente como EFFECTS §2.5 (tests tabulares con ≥ 15 casos incluyendo piso en 0).
- AC-5 Jugador: solo puede elegir ataques de `legalAttacks`; salvaje no consume costos.
- AC-6 Retirar: limpia estados del PKM retirado (salvo daño y `disabledAttackId`), pierde el ataque del turno.
- AC-7 Derrota: `damage ≥ hp` ⇒ `PokemonFainted`; sin PKM sanos ⇒ fin de batalla (derrota: el salvaje escapa).
- AC-8 Explosión: si caen ambos, termina el turno del atacante y pasa al rival (p.68).
- AC-9 (turno-automatico-rival) El turno del rival corre DENTRO del comando que cede el turno: `Attack`, `Retire` y el arranque por AGILIDAD (`FightEncounter`/`AcceptGymChallenge`, dado `attackSelect` incluido) devuelven también el turno completo del rival y el inicio del turno propio; `Advance` en tu turno mantiene el comportamiento (pasar). Con `pending` (p. ej. `ChooseReplacement`) o fin de batalla el rival NO actúa en ese comando. Invariante: fase `battle` con batalla abierta (`!won`) y sin `pending` ⇒ `turnSide === 0`.

## T-021 Primitivas (set 1)
Implementar todas las de EFFECTS §1 excepto `transform`, `disableRandomAttack`, `rest` (set 2, post-MVP salvo que una carta del MVP las use).
- AC-1 Un test unitario por primitiva con su ejemplo de EFFECTS §4.
- AC-2 `bonusPerRoll`: secuencia de dados [5,4,2] con faces [4,5,6] y bonus 10 ⇒ +20 y exactamente 3 tiradas `bonus`.
- AC-3 Superposición: `rollGate{[1,2],noAttack}` + `defendGate{[3,4],noAttack}` ⇒ **una** tirada `gate`; ataca solo con 5-6.
- AC-4 `poison` no se acumula; `modifyRivalDamage` con `max:1` no se apila; `drainNow` y `poison` ignoran modificadores.
- AC-5 `rollGate` nuevo reemplaza al anterior (D-03); `selfHit` aplica el ataque al propio atacante, con sus efectos, sin habilidades.
- AC-6 Ninguna carta `custom` rompe el motor: efecto `custom` sin handler registrado ⇒ evento `UnsupportedEffect` y el ataque se resuelve sin ese efecto.

## T-022 XP, evolución, captura
- AC-1 Al derrotar un PKM rival, todos los PKM tuyos que estuvieron en juego en ese combate ganan 1 XP; los que no, no.
- AC-2 `Evolve{pkmUid, toId}` solo si `xp ≥ requerido`; reemplaza carta, XP=0, conserva daño (D-04/05); múltiples opciones ⇒ elige el jugador; Eevee tras 2 victorias.
- AC-3 Captura tras ganar: `CaptureOrRelease`; requiere Pokebola; la pokebola vuelve al fondo del mazo ítem; si no hay, solo `Release`. (Ultra Ball y Master Ball: SPEC-F/T-049.)
- AC-4 Equipo lleno (6) ⇒ el capturado va a `oakPile`.
- AC-5 La carta capturada sale del mazo; la liberada vuelve al fondo.

## T-023 Gimnasios
- AC-1 Desafiar es opcional; Giovanni exige 7 medallas (si no, `GymLocked`).
- AC-2 Líder con 2 PKM; si derrota 2 de los tuyos, gana (aunque te queden sanos); si derrotás ambos: Medalla + premio según carta del líder (robo de mazo o ítems).
- AC-3 Premio PKM se conserva sin gastar pokebola (p.50).
- AC-4 Medalla Tierra con 8 medallas ⇒ `GameWon` (fin).
- AC-5 Datos de líderes en `content/pokemon/gyms.json`; mientras no existan, fixtures de test.

## T-024 Golden manual
`packages/engine/test/golden/`:
- **GOLD-01 Poliwag/Doble bofetón** (p.41): dado `attackSelect`=2 ⇒ Doble bofetón; dados `bonus` [5,4,2] ⇒ daño total 30.
- **GOLD-02 Clefairy vs Tangela** (p.45-47) con la secuencia: bonus [5,6,2] ⇒ 40 daño (Tangela 80→40); Tangela `attackSelect`=6 ⇒ no ataca; bonus [6,3] ⇒ 30 (Tangela 10) …; Tangela select 2 ⇒ Absorber (Clefairy −20, Tangela +20); bonus [1] ⇒ 20; Tangela select 4 ⇒ Polvo de esporas ⇒ jugador retira a Clefairy y pone a Bulbasaur; Tangela select 6 ⇒ no ataca. *Las páginas 46-49 de `manual.pdf` contienen la secuencia completa hasta derrotar a Gloom; el worker debe transcribirla leyendo esas páginas y completar las cartas faltantes (Clefairy, Gloom, Bulbasaur) en fixtures marcados `verified:false` si algún dato no se lee.*
- **GOLD-03 Gate superpuesto** con cartas sintéticas de test.
- AC-1 Cada escenario reproduce exactamente los números del manual. AC-2 Los fixtures citan página del manual.
