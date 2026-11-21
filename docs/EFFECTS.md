# EFFECTS — vocabulario declarativo de efectos (DSL v0)
Objetivo: describir los ataques de las ~250 cartas con ~25 primitivas, sin código por carta.
**Regla**: los workers NO crean primitivas. Falta algo ⇒ `docs/effect-requests/ER-xxx.md` + `{op:"custom",handler:"TODO_xxx",rawText}`; aprueba el jefe.

## 1. Tipos (canónicos en `packages/content/src/effects.ts`)
```ts
type Duration = 'nextTurn' | 'combat';   // 'combat' = hasta que el PKM afectado sea retirado o derrotado
type Target = 'rival' | 'self';          // por defecto 'rival' (salvo donde se indica)
// Todo efecto aplicado admite además `onRoll?: Faces`: solo se aplica si el dado de efecto cae en esas caras ("3_ Confusión: 4-5-6 cada turno si tu rival saca 1-2-3 se auto-ataca" ⇒ rollGate{...,onRoll:[4,5,6]}).

type Effect =
 // ── Daño
 | { op:'bonusPerRoll'; faces:Faces; amount:number }                  // "hace (+10) por cada 4-5-6": tirar mientras salga en faces; +amount por cada acierto; corta en el primer fallo
 | { op:'fixedRolls'; rolls:2|3; faces:Faces; amount:number }          // Hueso-boomerang, Tri-ataque, Doble patada: "tirá el dado N veces; (+X) por cada [caras]"; N tiradas fijas, no corta
 | { op:'nextAttackBonus'; amount:number }                              // Chillido, Intimidar, Danza de espadas: "el próximo ataque de X hará (+30)"; se consume en su siguiente ataque
 | { op:'bonusPerSelfDamage'; faces:Faces; amount:number; per:number } // Ira: si sale en faces, +amount por cada `per` de daño propio
 | { op:'selfBoost'; amount:number; max?:1 }                           // "Enfoque de energía": tus ataques hacen (+10)
 // ── Modificadores de daño
 | { op:'modifyRivalDamage'; amount:number; duration:Duration; max?:1 }// Burbujas (-10, nextTurn); Gruñido (-10, combat, max 1)
 | { op:'flatReduction'; amount:number; max?:1; versus?:'any'|'special'; target?:Target; duration?:Duration } // Dureza/Refugio/Barrera/Pantalla(-20, special)
 // ── Control de la tirada del rival
 | { op:'rivalSkipsAttack'; faces?:Faces }                            // Lianas "5-6 tu rival no atacará" (siguiente turno; puede curar/retirar)
 | { op:'rivalSleep'; faces?:Faces; wakeFaces:Faces }                 // Hipnosis/Canto/Polvo de sueño: no ataca hasta sacar wakeFaces al inicio de su turno
 | { op:'rollGate'; failFaces:Faces; outcome:'noAttack'|'selfHit'; duration:Duration } // Impact-trueno, Attack-trueno, Polvo de esporas, Hipno-rayo, Confusión
 // ── Vida
 | { op:'poison'; amount:number }                                      // 10 por turno al inicio del turno del afectado; no acumulable
 | { op:'drainNow'; amount:number }                                    // Absorber: rival -amount y vos +amount; sin modificadores. Con selfHit (D-33): daño al propio PKM y sin curación
 | { op:'drainEachTurn'; amount:number }                               // Drenadoras: cada turno del rival, él -amount, vos +amount
 | { op:'healSelf'; amount:number }                                    // "Recuperación"
 | { op:'selfDamage'; amount:number }                                  // parte de Explosión (sin modificadores); el rival recibe `damage.base` sin modificadores
 // ── Encadenados
 | { op:'attackAgain'; faces:Faces }                                   // "4-5-6 ataca de nuevo" (habilidad). 2.º ataque sin dados extra salvo sus efectos
 | { op:'quickAttack'; faces:Faces; attackId:string; requires:'damaged' } // "Ataque rápido": si está dañado, tras atacar con 4-5-6
 // ── Pasivas (especialidades) o habilidades
 | { op:'startsFirst' }                                                // AGILIDAD
 | { op:'defendGate'; failFaces:Faces; outcome:'noAttack'|'selfHit' }  // Raichu "Doble equipo" (3-4 no ataca), Kadabra "Confusión" (1-2-3 autoataque); entra en la tirada única de `gate`
 | { op:'dodge'; faces:Faces }                                         // Minimizar / Pikachu Doble equipo: el ataque rival no hace daño ni efecto
 | { op:'rest'; wakeFaces:Faces }                                      // Snorlax "Descansar": cura todo y duerme
 | { op:'transform' }                                                  // Ditto
 | { op:'disableRandomAttack'; max?:1 }                                // Jigglypuff "Inhabilitar"
 | { op:'custom'; handler:string; rawText?:string };                   // última opción; requiere ER aprobado
```
`Attack.canOpen?: boolean` marca "Podés empezar con este ataque" (Gengar, Haunter, Butterfree, Vileplume…): el ataque es legal como primer ataque aunque no sea el primero de la carta (ver RULES §4). `Attack.damage = { base, ifRoll? }`. `ifRoll` usa el dado de efecto: "(10) 4-5-6 (20)" ⇒ `{base:10, ifRoll:{faces:[4,5,6],damage:20}}`.

## 2. Pipeline de una acción de ataque (orden exacto)
1. **Selección**: jugador elige (válido solo si cumple costo y la regla de "primer ataque"); salvaje/gimnasio tira `attackSelect` y busca el ataque cuyo `rollFaces` contenga la cara; sin coincidencia ⇒ no ataca.
2. **Gate** (una sola tirada, `purpose:'gate'`, solo si hay fuentes): fuentes = slot `rollGate` del atacante ∪ `defendGate` del defensor. Si cae en cara de `selfHit` ⇒ el ataque se aplica al propio atacante (sin habilidades); si cae en `noAttack` ⇒ termina el turno de ataque.
3. **Dodge** (`purpose:'dodge'`) si el defensor tiene `dodge`: si cae en faces ⇒ ataque sin daño ni efecto.
4. **Dado de efecto** (`purpose:'effect'`): solo si el ataque tiene `ifRoll` o efectos con `faces` (rivalSkipsAttack/rivalSleep/attackAgain/bonusPerSelfDamage). `bonusPerRoll` y `fixedRolls` hacen sus propias tiradas (`purpose:'bonus'`).
5. **Daño**: `d = base | ifRoll.damage` → `+ bonusPerRoll/bonusPerSelfDamage` → `+ selfBoost` → `+ modifyRivalDamage(atacante)` → `− flatReduction(defensor)` (si `versus:'special'` solo para `element ≠ normal`) → `max(0,·)`. (Modo Historia: Pokedex ±10 después de los modificadores.) Daños `drainNow`, `selfDamage`, `poison`, `drainEachTurn` ignoran todo modificador.
6. **Aplicar**: daño, efectos (condición nueva reemplaza la vieja del mismo slot; `max:1` no se apila), `healSelf`/drain.
7. **Encadenar**: `attackAgain`/`quickAttack` ⇒ repetir desde (5) con el nuevo ataque (sin selección ni gate nuevos, sí sus efectos con dado).
8. **FaintCheck**: `damage ≥ hp` ⇒ derrotado. Si ambos caen (Explosión) ⇒ termina el turno del atacante y pasa al otro [p.68].

## 3. Estados de combate (en `BattleState`, por PKM activo)
`rivalDamageMod`(nextTurn) · `damageModCombat`(max 1) · `rollGate`{failFaces,outcome,duration} · `asleep`{wakeFaces} · `skipNextAttack` · `poisoned` · `drain` · `disabledAttackId` · `usedMax:Set` · `nextAttackBonus`.
Se limpian al retirar o derrotar al PKM, **excepto** `disabledAttackId` de Inhabilitar (persiste aunque Jigglypuff caiga, p.88) y el daño recibido.

## 4. Mapeo de ejemplos del manual (usar como tests de la primitiva)
| Texto | Efecto |
|---|---|
| Burbujas "el ataque de tu rival hará (-10)" | `modifyRivalDamage -10 nextTurn` |
| Lianas "5-6 tu rival no atacará" | `rivalSkipsAttack [5,6]` |
| Doble bofetón "(+10) por cada 4-5-6" | `bonusPerRoll [4,5,6] 10` |
| Rasguños "(10) 4-5-6 (20)" | `damage {base:10, ifRoll:{[4,5,6],20}}` |
| Polvo de esporas "cada turno si sacas 1-2-3 tu PKM no ataca" | `rollGate [1,2,3] noAttack combat` |
| Impact-trueno "1-2-3 tu PKM no atacará" | `rollGate [1,2,3] noAttack nextTurn` |
| Hipno-rayo / Confusión "1-2-3 se auto-ataca" | `rollGate [1,2,3] selfHit nextTurn` |
| Hipnosis/Canto "4-5-6 no atacará hasta sacar 5-6" | `rivalSleep faces[4,5,6] wake[5,6]` |
| Absorber | `drainNow 10/20` |
| Drenadoras "cada turno… (10)" | `drainEachTurn 10` |
| Dureza/Refugio "(-10) a X. MAX 1" | `flatReduction 10 max1 target self combat` |
| BARRERA (especialidad) | `flatReduction 10` en `specialties` |
| PANTALLA (Jynx) | `flatReduction 20 versus special` |
| Raichu DOBLE EQUIPO "3-4 tu PKM no ataca" | `defendGate [3,4] noAttack` |
| Kadabra CONFUSIÓN "1-2-3 se auto-ataca" | `defendGate [1,2,3] selfHit` |
| Minimizar "4-5-6 no hace daño ni efecto" | `dodge [4,5,6]` |
| Agilidad | `startsFirst` (+ `attackAgain` si el texto lo dice) |
| Explosión | `damage.base 50` + `selfDamage 20` |
| Descansar (Snorlax) | `rest wake[5,6]` |
| Chillido / Intimidar "el próximo ataque hará (+30). 4-5-6 ataca de nuevo" | `nextAttackBonus 30` + `attackAgain [4,5,6]` |
| Danza de espadas "el próximo ataque de Pinsir hará (+30)" | `nextAttackBonus 30` (+ `attackAgain` si el texto lo dice) |
| Hueso-boomerang "tirá el dado 2 veces. Hacé (+30) por cada 3-4-5-6" | `fixedRolls 2 [3,4,5,6] 30` (`damage.base` 0) |
| Tri-ataque "tirá el dado 3 veces. Hacé (+30) por cada 1-2-3" | `fixedRolls 3 [1,2,3] 30` |
| Doble patada "tirá el dado 2 veces. Hace (+40) por cada 4-5-6" | `fixedRolls 2 [4,5,6] 40` |
| Confusión "4-5-6 cada turno si tu rival saca 1-2-3 se auto-ataca" | `rollGate [1,2,3] selfHit combat onRoll [4,5,6]` |
| "Podés empezar con este ataque" | `canOpen: true` en el ataque |
| Burbuja psíquica (Mew/Mewtwo) "los ataques especiales le hacen (-20)" | `flatReduction 20 versus special target self` |
| Teletransportación (Abra), Telepatía (Hitmonlee) | `dodge [4,5,6]` |
| Ditto Transformación / Snorlax Descansar / Jigglypuff Inhabilitar | `transform` / `rest` / `disableRandomAttack` (set 2) |
