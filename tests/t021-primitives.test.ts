// AC: SPEC-C/T-021/AC-1 — un test unitario por primitiva con su ejemplo de
// EFFECTS §4. selfDamage/startsFirst/ifRoll/bonusPerRoll básicos ya viven en
// tests/t020-*.test.ts (se citan en el reporte); acá las que T-021 aplica.
import { expect, test } from 'vitest'
import type { PokemonCard } from '../packages/content/src/index.ts'
import { parseCardId, parsePkmUid } from '../packages/content/src/ids.ts'
import { rngOf, run, secondPkm, toBattle } from './t020-helpers.ts'
import { fxBattle, fx, fxCard, noFirstTurn } from './t021-helpers.ts'
import type { CommandOk, EngineError, GameEvent, GameState, Result } from '../packages/engine/src/index.ts'

const ok = (result: Result<CommandOk, EngineError>) => {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  return result
}

// Burbujas (p.39): "el ataque de tu rival hará (-10)" ⇒ modifyRivalDamage nextTurn.
test('AC-1 modifyRivalDamage nextTurn (Burbujas): el próximo ataque del rival hace -10', () => {
  const game = fxBattle({
    playerCard: fxCard('fx-burbujas', [fx('burbujas', [{ op: 'modifyRivalDamage', amount: -10, duration: 'nextTurn' }], { base: 10 })]),
    rng: rngOf(4),
  })
  const used = ok(run(game.state, { type: 'Attack', attackId: 'burbujas' }, game.ctx))
  expect(used.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 10, cause: 'attack' })
  // Turno del rival: attackSelect 4 ⇒ Burbujas 10, modificado a 0 (piso).
  const rival = ok(run(used.value.state, { type: 'Advance' }, game.ctx))
  expect(rival.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'p1-fx', amount: 0, cause: 'attack' })
})

// Gruñido: modifyRivalDamage combat max 1 (el no-apilado completo está en AC-4).
test('AC-1 modifyRivalDamage combat (Gruñido): -10 durante todo el combate del rival', () => {
  const card = fxCard('fx-grunido', [fx('grunido', [{ op: 'modifyRivalDamage', amount: -10, duration: 'combat', max: 1 }], { base: 0 })])
  const game = fxBattle({ playerCard: card, rng: rngOf(3) })
  const used = ok(run(game.state, { type: 'Attack', attackId: 'grunido' }, game.ctx))
  expect(used.value.state.battle?.conditions['rival-1']?.combatDamageMod).toBe(-10)
  // Rival: attackSelect 3 ⇒ Embestida (20) con -10 persistente ⇒ 10.
  const rival = ok(run(used.value.state, { type: 'Advance' }, game.ctx))
  expect(rival.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'p1-fx', amount: 10, cause: 'attack' })
})

// Enfoque de energía: selfBoost "tus ataques hacen (+10)" (max 1).
test('AC-1 selfBoost (Enfoque de energía): los ataques propios suman +10 desde el siguiente', () => {
  const card = fxCard('fx-enfoque', [
    fx('enfoque', [{ op: 'selfBoost', amount: 10, max: 1 }], { base: 10 }),
    fx('golpe', [], { base: 10 }),
  ])
  const game = fxBattle({ playerCard: card, rng: rngOf(6) }) // rival 6 ⇒ no ataca
  const first = ok(run(game.state, { type: 'Attack', attackId: 'enfoque' }, game.ctx))
  expect(first.value.state.battle?.conditions['p1-fx']?.selfBoost).toBe(10)
  const rivalTurn = ok(run(first.value.state, { type: 'Advance' }, game.ctx))
  const second = ok(run(rivalTurn.value.state, { type: 'Attack', attackId: 'golpe' }, game.ctx))
  expect(second.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 20, cause: 'attack' })
})

// Dureza/Refugio "(-10) a X. MAX 1" (p.67): flatReduction como ataque (habilidad real de squirtle).
test('AC-1 flatReduction (Refugio de Squirtle): los ataques recibidos restan 10, MAX 1', () => {
  const game = toBattle({
    rng: rngOf(4), // rival attackSelect 4 ⇒ Burbujas (10)
    active: 'p1-squirtle',
    player: (p) => ({
      ...p,
      team: [
        {
          uid: parsePkmUid('p1-squirtle'),
          cardId: parseCardId('squirtle'),
          damage: 0,
          xp: 0,
          equipped: [
            { id: parseCardId('element_water#10'), element: 'water' },
            { id: parseCardId('element_water#11'), element: 'water' },
          ],
          wildcards: [],
          fainted: false,
        },
        secondPkm(),
      ],
    }),
  })
  // Refugio es habilidad ⇒ legal en el primer turno (RULES §4).
  const used = ok(run(game.state, { type: 'Attack', attackId: 'refugio' }, game.ctx))
  expect(used.value.state.battle?.conditions['p1-squirtle']?.damageModCombat).toBe(10)
  const rival = ok(run(used.value.state, { type: 'Advance' }, game.ctx))
  expect(rival.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'p1-squirtle', amount: 0, cause: 'attack' })
})

// BARRERA / PANTALLA: flatReduction como especialidad (versus special solo elementales).
test('AC-1 flatReduction especialidad (BARRERA/PANTALLA): reduce siempre; versus special solo elementales', () => {
  const tanque: PokemonCard = {
    ...fxCard('fx-tanque', [fx('placaje', [], { base: 10 })]),
    specialties: [
      { op: 'flatReduction', amount: 10 }, // BARRERA
      { op: 'flatReduction', amount: 20, versus: 'special' }, // PANTALLA (Jynx)
    ],
  }
  const normal = fxBattle({ playerCard: fxCard('fx-golpeador', [fx('golpe', [], { base: 20 })]), wildCard: 'fx-tanque', extraWildCards: [tanque] })
  const hitNormal = ok(run(normal.state, { type: 'Attack', attackId: 'golpe' }, normal.ctx))
  expect(hitNormal.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 10, cause: 'attack' }) // 20 − 10 BARRERA

  const elemental = fxBattle({ playerCard: fxCard('fx-llamarada', [fx('llamarada', [], { base: 20, element: 'fire' })]), wildCard: 'fx-tanque', extraWildCards: [tanque] })
  const hitFire = ok(run(elemental.state, { type: 'Attack', attackId: 'llamarada' }, elemental.ctx))
  expect(hitFire.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 0, cause: 'attack' }) // 20 − 30, piso 0
})

// Lianas "5-6 tu rival no atacará" ⇒ rivalSkipsAttack con dado de efecto.
test('AC-1 rivalSkipsAttack (Lianas): 5-6 en el dado de efecto ⇒ el rival no ataca su próximo turno', () => {
  const game = fxBattle({
    playerCard: fxCard('fx-lianas', [fx('lianas', [{ op: 'rivalSkipsAttack', faces: [5, 6] }], { base: 10 })]),
    rng: rngOf(5), // dado de efecto
  })
  const used = ok(run(game.state, { type: 'Attack', attackId: 'lianas' }, game.ctx))
  expect(used.value.events).toContainEqual({ type: 'DieRolled', purpose: 'effect', value: 5 })
  expect(used.value.state.battle?.conditions['rival-1']?.skipNextAttack).toBe(true)
  const rival = ok(run(used.value.state, { type: 'Advance' }, game.ctx))
  expect(rival.value.events).toContainEqual({ type: 'NoAttack', attacker: 'rival-1', reason: 'skip' })
})

// Hipnosis/Canto "4-5-6 no atacará hasta sacar 5-6" ⇒ rivalSleep.
test('AC-1 rivalSleep (Hipnosis): duerme al rival hasta sacar 5-6 al inicio de su turno', () => {
  const game = fxBattle({
    playerCard: fxCard('fx-hipnosis', [fx('hipnosis', [{ op: 'rivalSleep', faces: [4, 5, 6], wakeFaces: [5, 6] }], { base: 0 })]),
    rng: rngOf(4, 3, 5, 6),
  })
  const used = ok(run(game.state, { type: 'Attack', attackId: 'hipnosis' }, game.ctx))
  expect(used.value.state.battle?.conditions['rival-1']?.asleep).toEqual({ wakeFaces: [5, 6] })
  const asleep = ok(run(used.value.state, { type: 'Advance' }, game.ctx)) // despertar: 3 ⇒ sigue dormido
  expect(asleep.value.events).toContainEqual({ type: 'NoAttack', attacker: 'rival-1', reason: 'asleep' })
  const woke = ok(run(asleep.value.state, { type: 'Advance' }, game.ctx)) // despertar 5 ⇒ despierta; attackSelect 6 ⇒ no ataca
  expect(woke.value.events).toContainEqual({ type: 'WokeUp', pkmUid: 'rival-1' })
  expect(woke.value.events).toContainEqual({ type: 'NoAttack', attacker: 'rival-1', reason: 'attackSelect' })
})

// Impact-trueno "1-2-3 tu PKM no atacará" ⇒ rollGate noAttack nextTurn (se consume).
test('AC-1 rollGate noAttack nextTurn (Impact-trueno): gate 1-2-3 bloquea solo el próximo turno', () => {
  const game = fxBattle({
    playerCard: fxCard('fx-trueno', [fx('impact', [{ op: 'rollGate', failFaces: [1, 2, 3], outcome: 'noAttack', duration: 'nextTurn' }], { base: 0 })]),
    rng: rngOf(4, 2, 4),
  })
  const used = ok(run(game.state, { type: 'Attack', attackId: 'impact' }, game.ctx))
  expect(used.value.state.battle?.conditions['rival-1']?.rollGate).toEqual({ failFaces: [1, 2, 3], outcome: 'noAttack', duration: 'nextTurn' })
  // Turno rival: attackSelect 4 (Burbujas) → gate 2 ⇒ NoAttack; el gate se consume al terminar su turno.
  const gated = ok(run(used.value.state, { type: 'Advance' }, game.ctx))
  expect(gated.value.events).toContainEqual({ type: 'NoAttack', attacker: 'rival-1', reason: 'gate' })
  expect(gated.value.state.battle?.conditions['rival-1']?.rollGate).toBeUndefined()
  // Próximo turno rival: attackSelect 4 ⇒ Burbujas 10 sin gate.
  const second = ok(run(gated.value.state, { type: 'Advance' }, game.ctx))
  expect(second.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'p1-fx', amount: 10, cause: 'attack' })
  expect(second.value.events.filter((event: GameEvent) => event.type === 'DieRolled' && event.purpose === 'gate').length).toBe(0)
})

// Polvo de esporas (p.45, carta real de Tangela): rollGate noAttack combat persiste.
test('AC-1 rollGate noAttack combat (Polvo de esporas de Tangela): persiste hasta retirar/derrotar', () => {
  const game = fxBattle({
    playerCard: fxCard('fx-punch', [fx('golpe', [], { base: 10 })]),
    wildCard: 'tangela_erika',
    rng: rngOf(4, 1, 6, 1, 6, 5),
  })
  const spored = ok(run(game.state, { type: 'Advance' }, game.ctx)) // select 4 ⇒ Polvo de esporas
  expect(spored.value.state.battle?.conditions['p1-fx']?.rollGate).toEqual({ failFaces: [1, 2, 3], outcome: 'noAttack', duration: 'combat' })
  const gated = ok(run(spored.value.state, { type: 'Attack', attackId: 'golpe' }, game.ctx)) // gate 1
  expect(gated.value.events).toContainEqual({ type: 'NoAttack', attacker: 'p1-fx', reason: 'gate' })
  const rival1 = ok(run(gated.value.state, { type: 'Advance' }, game.ctx)) // rival 6 ⇒ no ataca
  const still = ok(run(rival1.value.state, { type: 'Attack', attackId: 'golpe' }, game.ctx)) // gate 1 ⇒ sigue
  expect(still.value.events).toContainEqual({ type: 'NoAttack', attacker: 'p1-fx', reason: 'gate' })
  const rival2 = ok(run(still.value.state, { type: 'Advance' }, game.ctx)) // rival 6
  const pass = ok(run(rival2.value.state, { type: 'Attack', attackId: 'golpe' }, game.ctx)) // gate 5 ⇒ ataca
  expect(pass.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 10, cause: 'attack' })
  // Exactamente una tirada gate por intento de ataque propio (3 intentos).
  const gates = [spored, gated, still, pass]
    .flatMap((result) => result.value.events)
    .filter((event: GameEvent) => event.type === 'DieRolled' && event.purpose === 'gate')
  expect(gates.length).toBe(3)
})

// Hipno-rayo / Confusión "1-2-3 se auto-ataca" ⇒ rollGate selfHit.
test('AC-1 rollGate selfHit (Hipno-rayo): el rival se aplica su propio ataque', () => {
  const game = fxBattle({
    playerCard: fxCard('fx-hipnorayo', [fx('hipnorayo', [{ op: 'rollGate', failFaces: [1, 2, 3], outcome: 'selfHit', duration: 'nextTurn' }], { base: 0 })]),
    rng: rngOf(4, 2),
  })
  const used = ok(run(game.state, { type: 'Attack', attackId: 'hipnorayo' }, game.ctx))
  expect(used.value.state.battle?.conditions['rival-1']?.rollGate).toEqual({
    failFaces: [1, 2, 3],
    outcome: 'selfHit',
    duration: 'nextTurn',
  })
  // Turno rival: attackSelect 4 (Burbujas 10) → gate 2 ⇒ se lo aplica a sí mismo.
  const rival = ok(run(used.value.state, { type: 'Advance' }, game.ctx))
  expect(rival.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 10, cause: 'attack' })
  expect(rival.value.state.battle?.rival[0]?.damage).toBe(10)
  expect(rival.value.events).not.toContainEqual({ type: 'DamageTaken', pkmUid: 'p1-fx', amount: 10, cause: 'attack' })
})

// Veneno: 10 por turno al inicio del turno del afectado; no acumulable (RULES §4).
test('AC-1 poison: 10 al inicio del turno del afectado', () => {
  const game = fxBattle({
    playerCard: fxCard('fx-veneno', [fx('tizona', [{ op: 'poison', amount: 10 }], { base: 0 })]),
    rng: rngOf(6),
  })
  const used = ok(run(game.state, { type: 'Attack', attackId: 'tizona' }, game.ctx))
  expect(used.value.state.battle?.conditions['rival-1']?.poison).toBe(10)
  const tick = ok(run(used.value.state, { type: 'Advance' }, game.ctx))
  expect(tick.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 10, cause: 'poison' })
})

// Drenadoras "cada turno (10)" ⇒ drainEachTurn.
test('AC-1 drainEachTurn (Drenadoras): cada turno del rival, -10 él y +10 el atacante', () => {
  const game = fxBattle({
    playerCard: fxCard('fx-drenadoras', [fx('drenadoras', [{ op: 'drainEachTurn', amount: 10 }], { base: 0 })]),
    playerDamage: 20, // el atacante tiene contadores que curar
    rng: rngOf(6),
  })
  const used = ok(run(game.state, { type: 'Attack', attackId: 'drenadoras' }, game.ctx))
  const rival = ok(run(used.value.state, { type: 'Advance' }, game.ctx))
  expect(rival.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 10, cause: 'drain' })
  expect(rival.value.events).toContainEqual({ type: 'Healed', pkmUid: 'p1-fx', amount: 10, cause: 'drain' })
})

// Recuperación ⇒ healSelf.
test('AC-1 healSelf (Recuperación): cura 20 al atacante', () => {
  const game = fxBattle({
    playerCard: fxCard('fx-recuperacion', [fx('recuperacion', [{ op: 'healSelf', amount: 20 }], { base: 0 })]),
    playerDamage: 30,
  })
  const used = ok(run(game.state, { type: 'Attack', attackId: 'recuperacion' }, game.ctx))
  expect(used.value.events).toContainEqual({ type: 'Healed', pkmUid: 'p1-fx', amount: 20, cause: 'healSelf' })
  expect(used.value.state.players[0]!.team[0]!.damage).toBe(10)
})

// Ira "(+10) por cada 10 de daño propio, si saca 4-5-6" ⇒ bonusPerSelfDamage (dado de efecto).
test('AC-1 bonusPerSelfDamage (Ira): +10 por cada 10 de daño propio con 4-5-6 en el dado', () => {
  const card = fxCard('fx-ira', [fx('ira', [{ op: 'bonusPerSelfDamage', faces: [4, 5, 6], amount: 10, per: 10 }], { base: 10 })])
  // 30 de daño propio y dado 5 ⇒ floor(30/10)=3 ⇒ +30 ⇒ 10+30.
  const hurt = fxBattle({ playerCard: card, playerDamage: 30, rng: rngOf(5) })
  const used = ok(run(noFirstTurn(hurt.state), { type: 'Attack', attackId: 'ira' }, hurt.ctx))
  expect(used.value.events).toContainEqual({ type: 'DieRolled', purpose: 'effect', value: 5 })
  expect(used.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 40, cause: 'attack' })
  expect(used.value.state.battle?.rival[0]?.damage).toBe(40)

  // 25 de daño propio ⇒ floor(25/10)=2 ⇒ +20 ⇒ 30 (el `per` trunca, no redondea).
  const odd = fxBattle({ playerCard: card, playerDamage: 25, rng: rngOf(5) })
  const truncated = ok(run(noFirstTurn(odd.state), { type: 'Attack', attackId: 'ira' }, odd.ctx))
  expect(truncated.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 30, cause: 'attack' })

  // Dado 2 (fuera de faces) ⇒ sin bonus, solo base.
  const miss = fxBattle({ playerCard: card, playerDamage: 30, rng: rngOf(2) })
  const failed = ok(run(noFirstTurn(miss.state), { type: 'Attack', attackId: 'ira' }, miss.ctx))
  expect(failed.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 10, cause: 'attack' })
})

// "4-5-6 ataca de nuevo" (habilidad, p.76-77) ⇒ attackAgain encadena el mismo ataque.
test('AC-1 attackAgain: 4-5-6 en el dado de efecto ⇒ el ataque se repite completo', () => {
  const game = fxBattle({
    playerCard: fxCard('fx-doble', [fx('doble', [{ op: 'attackAgain', faces: [4, 5, 6] }], { base: 10 })]),
    rng: rngOf(5, 2), // 1.º ataque: encadena; 2.º: no
  })
  const used = ok(run(noFirstTurn(game.state), { type: 'Attack', attackId: 'doble' }, game.ctx))
  const attacks = used.value.events.filter((event: GameEvent) => event.type === 'AttackUsed')
  expect(attacks.length).toBe(2)
  expect(used.value.state.battle?.rival[0]?.damage).toBe(20)
})

// "Ataque rápido": si está dañado, tras atacar con 4-5-6 ⇒ quickAttack.
test('AC-1 quickAttack: solo si está dañado, encadena el ataque referenciado', () => {
  const card = fxCard('fx-rapido', [
    fx('principal', [{ op: 'quickAttack', faces: [4, 5, 6], attackId: 'rapido', requires: 'damaged' }], { base: 10 }),
    fx('rapido', [], { base: 20 }),
  ])
  const hurt = fxBattle({ playerCard: card, playerDamage: 10, rng: rngOf(5) })
  const chained = ok(run(noFirstTurn(hurt.state), { type: 'Attack', attackId: 'principal' }, hurt.ctx))
  expect(chained.value.events).toContainEqual({ type: 'AttackUsed', attacker: 'p1-fx', attackId: 'rapido', target: 'rival-1' })
  expect(chained.value.state.battle?.rival[0]?.damage).toBe(30)

  const fresh = fxBattle({ playerCard: card, rng: rngOf(2) }) // sano ⇒ ni gasta el dado
  const alone = ok(run(noFirstTurn(fresh.state), { type: 'Attack', attackId: 'principal' }, fresh.ctx))
  expect(alone.value.state.battle?.rival[0]?.damage).toBe(10)
})

// Minimizar "4-5-6 no hace daño ni efecto" ⇒ dodge como efecto (dura el turno del rival).
test('AC-1 dodge (Minimizar): 4-5-6 ⇒ el ataque rival no hace daño ni efecto', () => {
  const card = fxCard('fx-minimizar', [
    fx('golpe', [], { base: 10 }),
    fx('minimizar', [{ op: 'dodge', faces: [4, 5, 6] }], { base: 0, kind: 'ability' }),
  ])
  const game = fxBattle({ playerCard: card, rng: rngOf(4, 5, 4) })
  const used = ok(run(game.state, { type: 'Attack', attackId: 'minimizar' }, game.ctx))
  expect(used.value.state.battle?.conditions['p1-fx']?.dodge).toEqual({ faces: [4, 5, 6] })
  // Rival: attackSelect 4 (Burbujas) → dodge 5 ⇒ sin daño NI efecto (sin rivalDamageMod).
  const dodged = ok(run(used.value.state, { type: 'Advance' }, game.ctx))
  expect(dodged.value.events).toContainEqual({ type: 'AttackDodged', attacker: 'rival-1', defender: 'p1-fx' })
  expect(dodged.value.events).not.toContainEqual({ type: 'DamageTaken', pkmUid: 'p1-fx', amount: 10, cause: 'attack' })
  expect(dodged.value.state.battle?.conditions['p1-fx']?.rivalDamageMod).toBeUndefined()
  // El dodge se gastó: el siguiente ataque del rival entra sin tirada de dodge.
  const second = ok(run(dodged.value.state, { type: 'Advance' }, game.ctx))
  expect(second.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'p1-fx', amount: 10, cause: 'attack' })
  expect(second.value.events.filter((event: GameEvent) => event.type === 'DieRolled' && event.purpose === 'dodge').length).toBe(0)
})

// Doble equipo (especialidad pasiva de esquive, p.78-80): dodge persiste.
test('AC-1 dodge especialidad: tirada en cada ataque recibido y no se consume', () => {
  const esquivador = fxCard('fx-esquivador', [fx('placaje', [], { base: 10 })], [{ op: 'dodge', faces: [4, 5, 6] }])
  const game = fxBattle({
    playerCard: fxCard('fx-golpeador', [fx('golpe', [], { base: 10 })]),
    wildCard: 'fx-esquivador',
    extraWildCards: [esquivador],
    rng: rngOf(4, 6, 2),
  })
  const dodged = ok(run(game.state, { type: 'Attack', attackId: 'golpe' }, game.ctx))
  expect(dodged.value.events).toContainEqual({ type: 'AttackDodged', attacker: 'p1-fx', defender: 'rival-1' })
  const rivalTurn = ok(run(dodged.value.state, { type: 'Advance' }, game.ctx)) // rival 6 ⇒ no ataca
  const hit = ok(run(rivalTurn.value.state, { type: 'Attack', attackId: 'golpe' }, game.ctx))
  expect(hit.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 10, cause: 'attack' })
})

// Raichu DOBLE EQUIPO "3-4 tu PKM no ataca" ⇒ defendGate (especialidad del defensor).
test('AC-1 defendGate noAttack (Doble equipo de Raichu): 3-4 en la tirada única de gate', () => {
  const raichu = fxCard('fx-raichu', [fx('chispa', [], { base: 10 })], [{ op: 'defendGate', failFaces: [3, 4], outcome: 'noAttack' }])
  const game = fxBattle({
    playerCard: fxCard('fx-golpeador', [fx('golpe', [], { base: 10 })]),
    wildCard: 'fx-raichu',
    extraWildCards: [raichu],
    rng: rngOf(3, 5, 5),
  })
  const gated = ok(run(game.state, { type: 'Attack', attackId: 'golpe' }, game.ctx))
  expect(gated.value.events).toContainEqual({ type: 'NoAttack', attacker: 'p1-fx', reason: 'gate' })
  const rivalTurn = ok(run(gated.value.state, { type: 'Advance' }, game.ctx)) // rival 5 ⇒ Chispa
  const pass = ok(run(rivalTurn.value.state, { type: 'Attack', attackId: 'golpe' }, game.ctx))
  expect(pass.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 10, cause: 'attack' })
})

// Kadabra CONFUSIÓN "1-2-3 se auto-ataca" ⇒ defendGate selfHit.
test('AC-1 defendGate selfHit (Confusión de Kadabra): el atacante se aplica su ataque', () => {
  const kadabra = fxCard('fx-kadabra', [fx('psico', [], { base: 10 })], [{ op: 'defendGate', failFaces: [1, 2, 3], outcome: 'selfHit' }])
  const game = fxBattle({
    playerCard: fxCard('fx-golpeador', [fx('golpe', [], { base: 10 })]),
    wildCard: 'fx-kadabra',
    extraWildCards: [kadabra],
    rng: rngOf(2),
  })
  const self = ok(run(game.state, { type: 'Attack', attackId: 'golpe' }, game.ctx))
  expect(self.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'p1-fx', amount: 10, cause: 'attack' })
  expect(self.value.state.players[0]!.team[0]!.damage).toBe(10)
  expect(self.value.state.battle?.rival[0]?.damage).toBe(0)
})

// Absorber (p.45, carta real de Tangela) ⇒ drainNow sin modificadores (AC-4 lo profundiza).
test('AC-1 drainNow (Absorber de Tangela): rival -20 y atacante +20', () => {
  const game = fxBattle({ playerCard: fxCard('fx-punch', [fx('golpe', [], { base: 10 })]), wildCard: 'tangela_erika', rng: rngOf(1) })
  const seeded: GameState = { ...game.state, battle: { ...game.state.battle!, rival: game.state.battle!.rival.map((pkm) => ({ ...pkm, damage: 20 })) } }
  const rival = ok(run(seeded, { type: 'Advance' }, game.ctx)) // attackSelect 1 ⇒ Absorber
  expect(rival.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'p1-fx', amount: 20, cause: 'drainNow' })
  expect(rival.value.events).toContainEqual({ type: 'Healed', pkmUid: 'rival-1', amount: 20, cause: 'drainNow' })
  expect(rival.value.state.battle?.rival[0]?.damage).toBe(0)
})
