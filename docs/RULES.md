# RULES — resumen canónico del manual + decisiones
Referencias `[p.N]` = página de `manual.pdf` (118 págs). Esto es un resumen operativo; ante duda, manda el manual.

## 1. Partida Clásica (alcance MVP-0)
- Objetivo: obtener las 8 medallas; **quien obtiene la Medalla Tierra (Giovanni, Ciudad Verde) gana**, y Giovanni solo se enfrenta tras las otras 7 medallas [p.6, 11].
- Inicio [p.6-7]: todos salen de **Pueblo Paleta** con 1 PKM inicial + 1 carta de su elemento, **2 cartas Multicolor** y **5 Pokebolas**. Iniciales: Bosque→Bulbasaur+Planta · Montaña→Charmander+Fuego · Isla→Squirtle+Agua · Llanura→Machop+Lucha · Pantano→Abra+Psíquico.
- Turno [p.8]: organizar elementos → tirar el dado → tomar carta / combatir → (negociar, solo multijugador).

## 2. Tablero [p.9-14]
| Casillero | Efecto |
|---|---|
| Vacío (pokébola) | Nada |
| Mazo Bosque/Montaña/Isla/Llanura/Pantano | Tomar la carta superior de ese mazo (PKM ⇒ encuentro; Elemento ⇒ se conserva hasta el final) |
| Mercado | Tomar 1 carta del mazo Ítem (+ intercambio con otros jugadores: no MVP-0) |
| Centro PKM | Cura a **todos** tus PKM heridos y derrotados |
| Prof. Oak | Límite de equipo = 6. Desde el 6º capturado, los PKM van a la **pila de Oak**. En este casillero podés intercambiar equipo ↔ pila. Los que pasan a la pila se curan |
| Ciudad (gimnasio) | Opcional: desafiar al líder (2 PKM). Gana ⇒ Medalla + premio |
| Duelo PKM | Duelo contra un rival (**deshabilitado MVP-0**) |
| Sorpresa / Liga PKM | Solo Modo Historia (**deshabilitados MVP-0**, se tratan como vacíos) |
- **Redondos** (mazos, mercado, duelo, vacío, sorpresa): hay que **caer exacto**. **Cuadrados** (ciudades, centro, Oak, Liga, Paleta): si pasás por uno podés **frenar** y se aplica su efecto [p.13].
- **Bifurcaciones**: elegís camino; **no se puede retroceder**. La única forma de "retroceder" es frenar en un cuadrado; en el turno siguiente podés ir en cualquier dirección [p.14].

## 3. PKM (cartas) [p.15-28]
- HP en puntos; el daño se lleva con contadores. HP ≤ daño ⇒ derrotado. Elemento = ícono junto al HP.
- Cada ataque: prefijo de dado (`4-5_`) usado por PKM **salvajes/gimnasio** para elegir ataque; ícono(s) de **costo** a la derecha: ícono de elemento = ese elemento; círculo gris = cualquier elemento.
- **Equipamiento**: el PKM propio solo puede usar un ataque si tiene equipados elementos que **cumplen su costo** (no se consumen). Un ataque se evalúa solo; los costos NO se suman entre ataques [p.18, 30-32]. **Multicolor** (llamado "Comodín" en el manual) = 1 energía de cualquier tipo, pero uno a la vez; se reasigna al organizar [p.30, 91]. Salvajes y líderes **no** necesitan elementos.
- **Habilidades** ("en cursiva y entre comillas") se usan en lugar de atacar y modifican al atacante; también tienen costo para PKM propios [p.20].
- **Especialidades** (MAYÚSCULAS, bajo línea horizontal): efectos pasivos siempre activos en combate [p.23]. No afectan a las "habilidades" [p.23].
- **Etapa/Evolución** [p.25-26]: `E: Nombre (n)` = experiencia (combates ganados) necesaria. Evolución reemplaza al básico (este va a una pila aparte). Eevee: 3 opciones tras su 2ª victoria.
- **Oportunidad** (solo Sorpresa): cuántos de tus PKM puede derrotar antes de escapar [p.28].

## 4. Combate [p.33-88]
**Tipos**: Duelo PKM (no MVP-0) · PKM sin dueño (salvaje) · Gimnasio/Liga.
**Salvaje** [p.38-42]: si al robar sale PKM podés pelear o "dejarlo ir" (vuelve al mazo). Pones tu PKM y **empezás atacando** salvo que el rival tenga AGILIDAD. Si derrota a todos tus PKM, escapa (vuelve al mazo). Si lo derrotás podés **capturarlo** gastando 1 Pokebola (Ultra Ball y Master Ball: ver D-12/D-19) que vuelve a la parte inferior del mazo Ítem; sin Pokebola no se captura.
**Gimnasio** [p.43-50]: 2 PKM por líder (Giovanni: ver carta). Empezás atacando (salvo excepciones). El rival elige ataque con dado: un **6** normalmente = no ataca (solo Liga y algunos Sorpresa atacan con 6). Si el líder derrota **2** de tus PKM, gana el duelo aunque te queden más. Si derrotás sus 2 PKM: **Medalla + premio** (indicado en la carta del líder, p.ej. Erika: 1 carta Bosque; Surge: 1 Ítem; Sabrina: 2 Ítems). Premio PKM ⇒ se queda sin gastar Pokebola [p.50].
**Primer ataque al entrar un PKM propio** [p.35-37, 52]: si el 1.º ataque de la carta es Normal ⇒ debés usar ese; si es Especial ⇒ podés usar el 1.º ataque de cada elemento (incluido el normal); una "habilidad" puede usarse para empezar; algunas cartas aclaran cuáles (campo `canOpen` del ataque: "Podés empezar con este ataque"). Desde el 2.º turno, cualquiera.
**Orden dentro del turno de combate** [p.53-57]: ① si está dormido, tirar (5-6 despierta) ② usar Pociones (varias; no impide atacar; con una usada ya no se puede retirar ese turno, D-32) ③ retirar y reemplazar (solo al inicio del turno propio, sin acciones previas; pierde el ataque; anula efectos de estado pero conserva el daño, D-32) ④ atacar. Veneno/Drenadoras se aplican **al principio del turno del afectado, antes de todo** [p.73].
**Tiradas por ataque (hasta 3 dados)** [p.57-64]: ① elegir ataque (solo salvaje/gimnasio) ② condiciones previas (no atacar / autoatacarse) ③ efecto del ataque. Orden: el dado del efecto es siempre el último.
**Superposición** [p.61]: condiciones que impiden atacar se combinan en **una sola tirada**; se ataca solo si la cara no cae en ninguna cara fallida (ej.: Attack-trueno 1-2 + Doble equipo de Raichu 3-4 ⇒ solo ataca con 5-6).
**Efectos** [p.65-75]: por defecto duran **un turno** (el siguiente del rival) salvo "cada turno"/texto que indique duración. `MAX 1` = no acumulable. Daño por veneno/Drenadoras/Absorber/Explosión/Terremoto **no se modifica** por efectos. Veneno **no acumulable** (10 por turno máx.). Un ataque no puede bajar el daño de otro por debajo de 0.
**Auto-ataque** [p.71-72]: el ataque se aplica al propio atacante (incluye sus efectos; las habilidades no).
**Ataque doble** [p.76-77]: "Ataque rápido" (si está dañado, tras atacar y sacar 4-5-6) y "4-5-6 ataca de nuevo" (habilidad); el 2.º ataque no requiere más dados salvo efectos.
**Esquivar** [p.78-80]: Minimizar/Doble equipo/Confusión (Kadabra) con tirada. Cuando hay efectos distintos "prevalece el más reciente" [p.80].
**Agilidad** [p.82]: el PKM empieza atacando cada combate (cada vez que entra), aunque no sea su turno.
**Quién actúa tras una derrota**: el lado que perdió el PKM pone el reemplazo y actúa (ej. Gloom entra y ataca de inmediato, p.47; Electrode con Agilidad ataca primero, p.69).
**Experiencia** [p.47-49, 56]: al ganar un combate (derrotar un PKM rival) ganan 1 XP **todos los PKM tuyos que participaron** en ese combate (incluido uno retirado que estuvo en juego). Un PKM que no participó no gana.
**Pociones** [p.55, 93]: curan hasta 30. Super-Poción (Sorpresa): cura todo. Vuelven al fondo de su mazo.
**Ítems** [p.89-94] (cantidades reales en `content/items.json`): **Multicolor** (16; permanente), **Poción** (9; cura 30), **Pokebola** (30; captura tras derrotar), **Oportunidad** (5; tirar un dado: con 4-5-6 robás una carta Sorpresa). Mazo **Sorpresa** (40): 28 PKM + **Super Poción** (8; cura toda la vida), **Ultra Ball** (3; captura aunque al PKM le queden hasta 40 de vida) y **Master Ball** (1; captura de una).
**Energías** (cartas de elemento): 196 en los 5 mazos de terreno (ver `content/decks.json`). No existen cartas de energía Normal ni Dragón: Normal = círculo gris "cualquier energía" en los costos.

## 5. Decisiones y ambigüedades (el dueño confirma; mientras tanto rige el default)
| ID | Tema | Qué dice el manual | Default adoptado | Estado |
|---|---|---|---|---|
| D-01 | Rebote en callejón | Solo describe rebote en Sorpresa [p.96] | Rebote en **todo** fin de camino (Sorpresa, Liga, Paleta) | propuesto |
| D-02 | Quién actúa primero en cada combate | Retador al inicio; tras derrota actúa quien repone; Agilidad adelanta | Ver §4. Si ambos tienen Agilidad: actúa quien entra primero a ese combate | propuesto |
| D-03 | Condiciones sobre la tirada de ataque | "Se suman" [p.68]; "prevalece el más reciente" [p.80] | Un solo slot `rollGate` del atacante: el efecto nuevo **reemplaza** al viejo. Las condiciones **pasivas del defensor** (especialidades) se **unen** con el slot en una sola tirada. Si una cara cae en `noAttack` y `selfHit`, gana `selfHit` | propuesto |
| D-04 | XP al evolucionar | No dice si se gasta | Se **reinicia a 0** al evolucionar (Ivysaur necesita sus 3 XP propios) | propuesto |
| D-05 | Daño al evolucionar | No dice | El daño acumulado se **conserva**; HP máx = el de la nueva carta | propuesto |
| D-06 | Cuándo evolucionar | "Al momento de evolucionar…" [p.26] | Opción en fase `Organize` y ofrecida al terminar un combate ganado | propuesto |
| D-07 | PKM derrotados | Se curan en Centro PKM [p.10] | Quedan en el equipo en estado `fainted` hasta curarse; no pueden entrar a combate | propuesto |
| D-08 | Equipo sin PKM sanos en encuentro | No dice | El salvaje escapa; si no hay PKM sanos, solo se puede "dejar ir" | propuesto |
| D-09 | Dónde vuelve una carta "dejada ir"/escapada | "al mazo" | **Fondo** del mazo | propuesto |
| D-10 | Mazo vacío | No dice | No se roba; se avisa en UI | propuesto |
| D-11 | Pociones fuera de combate | "cualquier PKM del equipo" [p.93] | Cualquier PKM del equipo en `Organize`; en combate solo el activo | propuesto |
| D-12 | Pokebolas | Pokebola: capturar tras derrotar [p.40] | **Revisado por el dueño**: Pokebola = tras derrotar. **Ultra Ball** = durante el combate, en tu turno, si al PKM sin dueño le quedan ≤ 40 de vida (`hp − daño ≤ 40`). **Master Ball** = durante el combate, en tu turno, siempre captura. Ninguna sirve contra PKM de gimnasio/Liga. La bola usada vuelve al fondo de su mazo | propuesto |
| D-13 | Dados | La caja trae 2 dados | Movimiento = 1d6; los demás usos = 1d6 (cada tirada es una `DieRolled`) | propuesto |
| D-14 | Composición de mazos | 60 cartas por mazo, sin lista | Energías e ítems **confirmados** en `content/decks.json` / `items.json`. PKM por mazo = lo que haya en las fotos (T-042c). Bosque, Montaña y Llanura suman 60; **Isla (58) y Pantano (59) por verificar** | parcial |
| D-15 | Duración de "los ataques le hacen (-10)" (Dureza/Refugio) | "MAX 1" [p.74] | Dura **todo el combate** de ese PKM (se pierde al retirar/derrotar) | propuesto |
| D-16 | Retirar PKM dormido | Permitido [p.54] | Permitido; quita estados | confirmado (manual) |
| D-17 | Gimnasio: obligación | "no tiene la obligación" [p.14] | Siempre opcional | confirmado (manual) |
| D-18 | Ruleset flags | — | `content/ruleset.classic.json` desactiva Sorpresa/Liga/Pokedex/Duelo | propuesto |
| D-19 | XP al capturar con Ultra/Master | No dice | Capturar sin derrotar **no da XP** a nadie | propuesto |
| D-20 | Super Poción | "cura toda la vida" | Igual que Poción (D-11) pero cura todo el daño de un PKM; vuelve al fondo del mazo Sorpresa | propuesto |
| D-21 | Oportunidad | Tirar dado; 4-5-6 ⇒ Sorpresa [p.93] | Se usa en `Organize`; requiere ≥ 4 medallas (`ruleset.oportunidad.minMedals`); si es PKM ⇒ encuentro; si es ítem ⇒ inventario. **El dueño confirma las 4 medallas** | propuesto |
| D-22 | PKM Sorpresa ("Oportunidad: n") | Escapa tras derrotar n PKM tuyos [p.28] | Cada PKM derrotado tuyo cuenta 1; al llegar a n, escapa y vuelve al fondo del mazo Sorpresa | propuesto |
| D-23 | Comodín → Multicolor | — | Renombrado en datos, código y UI: id `multicolor`. Se asigna a un tipo al organizar; sigue limitado a 1 tipo a la vez | confirmado (dueño) |
| D-24 | Normal y Dragón | — | Sin cartas de energía. Normal = `any` en costos. Dragón solo como elemento de PKM | confirmado (dueño) |
| D-25 | Cartas repetidas | — | Iguales ⇒ una carta + `copies`. Distintas ⇒ variantes `_a`, `_b` por orden de aparición. El `dex` puede repetirse | propuesto |
| D-26 | Ediciones de la casa | — | Cambios del dueño como parches en `content/house-edits/` aplicados sobre el original (activables) | confirmado (dueño) |
| D-27 | Tipos modernos vs elementos (fairy) | Gen 1 no tenía fairy; el juego tiene 15 elementos | Al validar tipo↔elemento, **fairy se traduce a normal** (colorless TCG); dark/steel no traducen (ninguna especie Gen 1 los tiene de primario). El JSON de referencia guarda los tipos crudos (Q-023) | confirmado (dueño, Q-023) |
| D-28 | Premio Sorpresa (Giovanni) y bolsa de ítems | p.50 solo cubre el premio explícito de la carta del líder | Premio `from:'sorpresa'`: si es PKM ⇒ premio directo (como premio PKM); si es ítem ⇒ va a la **bolsa de 6 ítems** (multicolor = contador, no ocupa slot). Mazo Sorpresa en el motor como `DeckKey+'sorpresa'` (Q-026) | confirmado (jefe, Q-026) |
| D-29 | Oportunidad con tirada fallida | p.93 solo dice "con 4-5-6 sacás una carta Sorpresa" | La carta **se consume siempre** (éxito o fracaso) y va al **fondo del mazo Ítem**, igual que las pociones usadas (Q-028) | confirmado (dueño, Q-028) |
| D-30 | Quitar energías y Multicolor hasta 0 | No lo cubre | Un PKM puede quedarse con **0 energías** y **sin Multicolor**. Quitar (energías y Multicolor) es legal en Organize, fuera de combate. El Multicolor asignado se puede quitar (vuelve a libres) o reasignar (extiende D-23) | confirmado (dueño, 2026-10-21) |
| D-31 | Dónde vive la decisión de captura (UI) | No dice (UI) | Tras vencer a un salvaje, **Capturar/Dejar ir** se decide en el **pie del popup de combate**: aparece tras "Continuar" (escena congelada) o directo en partida restaurada (guion vacío), con Capturar gated por Pokebolas (D-12). El popup queda abierto con combate activo, resultado sin confirmar (T-108), captura pendiente o intercambio de Oak. Revierte la versión anterior (TilePanel) | confirmado (dueño, 2026-10-28) |
| D-32 | Retirada solo al inicio del turno propio | Orden del turno p.53-57: ② Pociones → ③ retirar (implicaría poción y luego retiro en el mismo turno) | `Retire` exige TU turno **sin acciones previas**: la Poción usada en combate consume la ventana de retiro de ese turno (D-11 intacto: poción + ataque siguen en el mismo turno). Cambiar gasta el turno (el rival responde en el mismo comando). Ajusta el orden ②→③ de p.53-57; conflicto con el manual registrado en Q-095 | confirmado (dueño, 2026-10-28, Q-095) |
| D-33 | Absorber (`drainNow`) bajo auto-ataque | Auto-ataque [p.71-72]: el ataque se aplica al propio atacante (incluye sus efectos) | Con selfHit, `drainNow` hace **daño** al propio PKM y **no lo cura** (sin `Healed`; el HP neto baja `amount`). El camino normal no cambia: daño al rival y curación al atacante | confirmado (dueño, 2026-10-26) |
| D-34 | Solo la captura registra la carta | El manual no cubre starter/premio de gimnasio/intercambio de Oak (Q-102) | Solo `Capture`/`ThrowBall` remueven las copias restantes de los mazos de terreno + sorpresa; starter, premio de gimnasio (D-24) e intercambio de Oak NO registran (las copias siguen en los mazos). `Release` y la derrota devuelven la carta al fondo | confirmado (dueño, 2026-10-28, Q-102) |
