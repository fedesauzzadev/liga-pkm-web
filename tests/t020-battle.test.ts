// AC: SPEC-C/T-020 — Núcleo de batalla: orden del turno, quién empieza,
// attackSelect del salvaje, ataques legales del jugador y retirada.
import { expect, test } from 'vitest'
import {
  agilCard,
  kinds,
  rngOf,
  run,
  secondPkm,
  toBattle,
} from './t020-helpers.ts'
import {
  applyCommand,
  legalCommands,
  type GameEvent,
  type GameState,
} from '../packages/engine/src/index.ts'

// AC: SPEC-C/T-020/AC-1 — orden del turno: veneno/drenaje → despertar → pociones → atacar.
test('AC-1 el turno del jugador respeta veneno → drenadoras → despertar → poción → ataque', () => {
  const rng = rngOf(6 /* attackSelect salvaje: 6 ⇒ no ataca */, 5 /* despertar */, 6 /* efecto rasguños */)
  const game = toBattle({ rng, player: (p) => ({ ...p, items: { pokeball: 5, potion: 2 } }) })
  // Condiciones sembradas a mano (T-021 las aplicará desde los ataques); el rival
  // llega con 20 de daño para que el drenaje tenga algo que curar.
  const seeded: GameState = {
    ...game.state,
    battle: {
      ...game.state.battle!,
      rival: game.state.battle!.rival.map((pkm) => ({ ...pkm, damage: 20 })),
      conditions: { 'p1-starter': { poison: 10, drain: 10, asleep: { wakeFaces: [5, 6] } } },
    },
  }
  const events: GameEvent[] = []
  // Advance pasa sin atacar: corre el turno del rival y ARRANCA el turno del jugador.
  const pass = run(seeded, { type: 'Advance' }, game.ctx)
  expect(pass.ok).toBe(true)
  if (!pass.ok) throw new Error(pass.error.message)
  events.push(...pass.value.events)
  const potion = run(pass.value.state, { type: 'UsePotion', pkmUid: 'p1-starter', target: 'p1-starter' }, game.ctx)
  expect(potion.ok).toBe(true)
  if (!potion.ok) throw new Error(potion.error.message)
  events.push(...potion.value.events)
  const attack = run(potion.value.state, { type: 'Attack', attackId: 'rasgunos' }, game.ctx)
  expect(attack.ok).toBe(true)
  if (!attack.ok) throw new Error(attack.error.message)
  events.push(...attack.value.events)

  const at = (predicate: (event: GameEvent) => boolean): number => events.findIndex(predicate)
  const poison = at((e) => e.type === 'DamageTaken' && e.cause === 'poison')
  const drainHit = at((e) => e.type === 'DamageTaken' && e.cause === 'drain')
  const drainHeal = at((e) => e.type === 'Healed' && e.cause === 'drain')
  const wake = at((e) => e.type === 'DieRolled' && e.purpose === 'wake')
  const woke = at((e) => e.type === 'WokeUp')
  const potionHeal = at((e) => e.type === 'Healed' && e.cause === 'potion')
  const used = at((e) => e.type === 'AttackUsed')
  for (const index of [poison, drainHit, drainHeal, wake, woke, potionHeal, used]) {
    expect(index).toBeGreaterThanOrEqual(0)
  }
  expect(poison).toBeLessThan(drainHit)
  expect(drainHit).toBeLessThan(drainHeal)
  expect(drainHeal).toBeLessThan(wake)
  expect(wake).toBeLessThan(woke)
  expect(woke).toBeLessThan(potionHeal)
  expect(potionHeal).toBeLessThan(used)

  // Números: veneno 10 + drenaje 10 ⇒ daño 20; poción cura 20 (a tope); rasguños 4-5-6 ⇒ 20.
  expect(events).toContainEqual({ type: 'DamageTaken', pkmUid: 'p1-starter', amount: 10, cause: 'poison' })
  expect(events).toContainEqual({ type: 'Healed', pkmUid: 'rival-1', amount: 10, cause: 'drain' })
  expect(events).toContainEqual({ type: 'Healed', pkmUid: 'p1-starter', amount: 20, cause: 'potion' })
  expect(events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 20, cause: 'attack' })
  expect(attack.value.state.players[0]!.team[0]!.damage).toBe(0)
  expect(attack.value.state.battle?.rival[0]?.damage).toBe(30) // 20 − 10 drenaje + 20 ataque
})

// AC: SPEC-C/T-020/AC-2 — retador primero; startsFirst adelanta; tras derrota actúa quien repone.
test('AC-2 quién actúa primero: retador, Agilidad adelanta al rival y el reemplazo actúa tras una derrota', () => {
  // (a) El retador (jugador) ataca sin ningún Advance previo.
  const first = toBattle({ rng: rngOf(3) }) // dado de efecto 3 ⇒ rasguños queda en 10
  expect(first.state.battle?.turnSide).toBe(0)
  expect(legalCommands(first.state, first.ctx)).toContainEqual({ type: 'Attack', attackId: 'rasgunos' })
  const attack = run(first.state, { type: 'Attack', attackId: 'rasgunos' }, first.ctx)
  expect(attack.ok).toBe(true)
  if (!attack.ok) throw new Error(attack.error.message)
  expect(kinds(attack.value.events)).toContain('AttackUsed')

  // (b) El rival con AGILIDAD empieza: solo Advance; su ataque es el primero de la batalla.
  const agil = toBattle({ wildCard: 'agil', extraCards: [agilCard], rng: rngOf(1) })
  expect(agil.state.battle?.turnSide).toBe(1)
  expect(legalCommands(agil.state, agil.ctx)).toEqual([{ type: 'Advance' }])
  const rivalTurn = run(agil.state, { type: 'Advance' }, agil.ctx)
  expect(rivalTurn.ok).toBe(true)
  if (!rivalTurn.ok) throw new Error(rivalTurn.error.message)
  const used = rivalTurn.value.events.find((event) => event.type === 'AttackUsed')
  expect(used).toMatchObject({ attacker: 'rival-1', attackId: 'chispa' })
  // Tras el turno del rival arranca el del jugador.
  expect(rivalTurn.value.state.battle?.turnSide).toBe(0)
  expect(legalCommands(rivalTurn.value.state, agil.ctx)).toContainEqual({ type: 'Attack', attackId: 'rasgunos' })

  // (c) El salvaje derrota al activo: el jugador repone y actúa (D-02).
  const hurt = toBattle({
    rng: rngOf(3), // attackSelect 3 ⇒ Embestida (20) mata al charmander con 40 de daño
    player: (p) => ({
      ...p,
      team: [{ ...p.team[0]!, damage: 40 }, secondPkm()],
    }),
  })
  const beaten = run(hurt.state, { type: 'Advance' }, hurt.ctx) // pasa: turno del rival
  expect(beaten.ok).toBe(true)
  if (!beaten.ok) throw new Error(beaten.error.message)
  expect(beaten.value.events).toContainEqual({ type: 'PokemonFainted', pkmUid: 'p1-starter' })
  expect(beaten.value.state.pending).toEqual({ type: 'ChooseReplacement', options: ['p1-second'] })
  const sent = run(beaten.value.state, { type: 'SendOut', pkmUid: 'p1-second' }, hurt.ctx)
  expect(sent.ok).toBe(true)
  if (!sent.ok) throw new Error(sent.error.message)
  expect(sent.value.state.battle?.turnSide).toBe(0)
  expect(sent.value.state.battle?.active[0]).toBe('p1-second')
  // El que repone actúa: squirtle puede atacar de inmediato (Cabezazo, primer turno).
  const revenge = run(sent.value.state, { type: 'Attack', attackId: 'cabezazo' }, hurt.ctx)
  expect(revenge.ok).toBe(true)
  if (!revenge.ok) throw new Error(revenge.error.message)
  expect(revenge.value.events).toContainEqual({ type: 'AttackUsed', attacker: 'p1-second', attackId: 'cabezazo', target: 'rival-1' })
})

// AC: SPEC-C/T-020/AC-3 — el salvaje elige ataque por rollFaces; sin coincidencia no ataca.
test('AC-3 attackSelect del salvaje: coincide con rollFaces o emite NoAttack', () => {
  // Dado 4 ⇒ Burbujas (rollFaces [4,5]).
  const match = toBattle({ rng: rngOf(4) })
  const matched = run(match.state, { type: 'Advance' }, match.ctx)
  expect(matched.ok).toBe(true)
  if (!matched.ok) throw new Error(matched.error.message)
  expect(matched.value.events).toContainEqual({ type: 'DieRolled', purpose: 'attackSelect', value: 4 })
  expect(matched.value.events).toContainEqual({ type: 'AttackUsed', attacker: 'rival-1', attackId: 'burbujas', target: 'p1-starter' })
  expect(matched.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'p1-starter', amount: 10, cause: 'attack' })

  // Dado 6 ⇒ ningún ataque de poliwag lo contiene ⇒ NoAttack (RULES §4: el 6 no ataca).
  const none = toBattle({ rng: rngOf(6) })
  const skipped = run(none.state, { type: 'Advance' }, none.ctx)
  expect(skipped.ok).toBe(true)
  if (!skipped.ok) throw new Error(skipped.error.message)
  expect(skipped.value.events).toContainEqual({ type: 'NoAttack', attacker: 'rival-1', reason: 'attackSelect' })
  expect(kinds(skipped.value.events)).not.toContain('AttackUsed')
})

// AC: SPEC-C/T-020/AC-5 — solo ataques de legalAttacks; los costos no se consumen.
test('AC-5 el jugador solo puede usar ataques legales y los elementos no se gastan', () => {
  const game = toBattle({ rng: rngOf(3) }) // dado de efecto 3 ⇒ rasguños queda en 10
  const menu = legalCommands(game.state, game.ctx)
  // Primer turno de charmander: el 1.º ataque (Rasguños, normal) es el único permitido
  // (RULES §4); Lanzallamas además exige 2 Fuego y solo tiene 1 equipado.
  expect(menu.filter((c) => c.type === 'Attack')).toEqual([{ type: 'Attack', attackId: 'rasgunos' }])
  for (const attackId of ['lanzallamas', 'giro_fuego']) {
    const rejected = run(game.state, { type: 'Attack', attackId }, game.ctx)
    expect(rejected.ok, attackId).toBe(false)
    if (!rejected.ok) expect(rejected.error.code).toBe('ILLEGAL_COMMAND')
  }
  const used = run(game.state, { type: 'Attack', attackId: 'rasgunos' }, game.ctx)
  expect(used.ok).toBe(true)
  if (!used.ok) throw new Error(used.error.message)
  // Los equipados siguen intactos: el costo se evalúa, no se consume (RULES §3).
  expect(used.value.state.players[0]!.team[0]!.equipped).toEqual([{ id: 'element_fire#1', element: 'fire' }])
})

// AC: SPEC-C/T-020/AC-6 — retirar limpia estados (salvo daño y disabledAttackId) y pierde el ataque.
test('AC-6 retirar conserva el daño, limpia estados salvo disabledAttackId y pierde el ataque', () => {
  const game = toBattle({
    rng: rngOf(),
    player: (p) => ({ ...p, team: [{ ...p.team[0]!, damage: 10 }, secondPkm()] }),
  })
  const seeded: GameState = {
    ...game.state,
    battle: {
      ...game.state.battle!,
      conditions: {
        'p1-starter': {
          poison: 10,
          drain: 10,
          rivalDamageMod: -10,
          skipNextAttack: true,
          rollGate: { failFaces: [1, 2], outcome: 'noAttack', duration: 'nextTurn' },
          disabledAttackId: 'embestida',
        },
      },
    },
  }
  const retired = run(seeded, { type: 'Retire', to: 'p1-second' }, game.ctx)
  expect(retired.ok).toBe(true)
  if (!retired.ok) throw new Error(retired.error.message)
  expect(retired.value.events).toContainEqual({ type: 'PkmRetired', player: 'p1', from: 'p1-starter', to: 'p1-second' })
  // Estados limpiados salvo disabledAttackId (persiste, p.88); el daño se conserva.
  expect(retired.value.state.battle?.conditions['p1-starter']).toEqual({ disabledAttackId: 'embestida' })
  expect(retired.value.state.players[0]!.team[0]!.damage).toBe(10)
  // El que entra está en su primer turno; el turno pasó al rival (pierde el ataque).
  expect(retired.value.state.battle?.firstTurn).toContain('p1-second')
  expect(retired.value.state.battle?.turnSide).toBe(1)
  expect(legalCommands(retired.value.state, game.ctx)).toEqual([{ type: 'Advance' }])
  const colado = run(retired.value.state, { type: 'Attack', attackId: 'cabezazo' }, game.ctx)
  expect(colado.ok).toBe(false)
  if (!colado.ok) expect(colado.error.code).toBe('ILLEGAL_COMMAND')
})

// Extra (sin AC): guardas de los comandos nuevos fuera de su contexto.
test('guardas: FightEncounter/Attack/UsePotion/Retire/SendOut fuera de contexto devuelven error tipado', () => {
  const game = toBattle()
  const notPending = run(game.state, { type: 'FightEncounter', pkmUid: 'p1-starter' }, game.ctx)
  expect(notPending.ok).toBe(false)
  if (!notPending.ok) expect(notPending.error.code).toBe('ILLEGAL_COMMAND')

  const outside = applyCommand(
    { ...game.state, phase: 'organize', battle: null },
    { type: 'UsePotion', pkmUid: 'p1-starter', target: 'p1-starter' },
    game.ctx,
  )
  expect(outside.ok).toBe(false)
  if (!outside.ok) expect(outside.error.code).toBe('ILLEGAL_COMMAND')

  const badSendOut = run(game.state, { type: 'SendOut', pkmUid: 'no-esta' }, game.ctx)
  expect(badSendOut.ok).toBe(false)
  if (!badSendOut.ok) expect(badSendOut.error.code).toBe('ILLEGAL_COMMAND')

  const badRetire = run(game.state, { type: 'Retire', to: 'p1-starter' }, game.ctx) // a sí mismo
  expect(badRetire.ok).toBe(false)
  if (!badRetire.ok) expect(badRetire.error.code).toBe('ILLEGAL_COMMAND')
})
