// AC: retirada-solo-inicio-turno — cambiar de PKM activo (Retire) solo se
// puede en MI turno y solo si aún no hice ninguna otra acción (la poción en
// combate consume la ventana, D-32); cambiar gasta el turno (el rival responde
// en el mismo comando).
import { expect, test } from 'vitest'
import { rngOf, run, secondPkm, toBattle } from './t020-helpers.ts'
import {
  assertInvariants,
  InvariantError,
  legalCommands,
  type CommandOk,
  type EngineError,
  type GameState,
  type Result,
} from '../packages/engine/src/index.ts'

const ok = (result: Result<CommandOk, EngineError>) => {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  return result
}

const itemsWithPotion = {
  pokeball: 5,
  potion: 2,
  oportunidad: 0,
  super_potion: 0,
  ultraball: 0,
  masterball: 0,
}

// AC: retirada-solo-inicio-turno/AC-1 — Retire con turnSide !== 0 (turno del
// rival) es rechazado con ILLEGAL_COMMAND.
test('AC-1 Retire en el turno del rival (turnSide 1) es ILLEGAL_COMMAND', () => {
  const game = toBattle({
    rng: rngOf(),
    player: (p) => ({ ...p, team: [...p.team, secondPkm()] }),
  })
  const rivalsTurn: GameState = { ...game.state, battle: { ...game.state.battle!, turnSide: 1 } }
  const sneaked = run(rivalsTurn, { type: 'Retire', to: 'p1-second' }, game.ctx)
  expect(sneaked.ok).toBe(false)
  if (!sneaked.ok) expect(sneaked.error.code).toBe('ILLEGAL_COMMAND')
})

// AC: retirada-solo-inicio-turno/AC-2 — después de un Attack exitoso no existe
// turno propio con Retire disponible: el ataque termina el turno (el rival
// responde dentro del mismo comando) y el cambio recién se ofrece en el
// turno siguiente, con la marca limpia.
test('AC-2 tras un Attack exitoso el turno terminó: el rival actuó en el mismo comando y el Retire es del turno siguiente', () => {
  const game = toBattle({
    rng: rngOf(6, 6), // rasguños 6 ⇒ 20 · attackSelect 6 ⇒ NoAttack
    player: (p) => ({ ...p, team: [{ ...p.team[0]! }, secondPkm()] }),
  })
  expect(game.state.battle?.actedThisTurn).toBe(false)
  const attack = ok(run(game.state, { type: 'Attack', attackId: 'rasgunos' }, game.ctx))
  // El ataque terminó el turno: el rival actuó dentro del MISMO comando…
  expect(attack.value.events).toContainEqual({ type: 'DieRolled', purpose: 'attackSelect', value: 6 })
  expect(attack.value.events).toContainEqual({ type: 'NoAttack', attacker: 'rival-1', reason: 'attackSelect' })
  // …y el turno propio que sigue arrancó limpio: no hay estado donde el
  // retiro comparta turno con el ataque ya ejecutado.
  expect(attack.value.state.battle?.turnSide).toBe(0)
  expect(attack.value.state.battle?.actedThisTurn).toBe(false)
  expect(legalCommands(attack.value.state, game.ctx)).toContainEqual({ type: 'Retire', to: 'p1-second' })
})

// AC: retirada-solo-inicio-turno/AC-3 — después de UsePotion EN COMBATE (que no
// consume el turno, D-11), Retire queda ilegal en ese mismo turno: el handler
// lo rechaza y legalCommands deja de ofrecer los botones de retiro.
test('AC-3 UsePotion en combate deja Retire ilegal y legalCommands deja de ofrecerlo', () => {
  const game = toBattle({
    rng: rngOf(),
    player: (p) => ({
      ...p,
      team: [{ ...p.team[0]!, damage: 10 }, secondPkm()],
      items: itemsWithPotion,
    }),
  })
  expect(legalCommands(game.state, game.ctx)).toContainEqual({ type: 'Retire', to: 'p1-second' })
  const healed = ok(
    run(game.state, { type: 'UsePotion', pkmUid: 'p1-starter', target: 'p1-starter' }, game.ctx),
  )
  expect(healed.value.state.battle?.actedThisTurn).toBe(true)
  const rejected = run(healed.value.state, { type: 'Retire', to: 'p1-second' }, game.ctx)
  expect(rejected.ok).toBe(false)
  if (!rejected.ok) expect(rejected.error.code).toBe('ILLEGAL_COMMAND')
  expect(legalCommands(healed.value.state, game.ctx).filter((c) => c.type === 'Retire')).toEqual([])
  // D-11 intacto: la poción NO consume el ataque.
  expect(legalCommands(healed.value.state, game.ctx)).toContainEqual({ type: 'Attack', attackId: 'rasgunos' })
})

// AC: retirada-solo-inicio-turno/AC-4 — la marca actedThisTurn vive en
// BattleState (JSON): nace false, la poción en combate la setea, se limpia al
// iniciar cada turno propio (startSideTurn) y al reponer tras desmayo.
test('AC-4 actedThisTurn: nace false, la poción la setea, cada turno propio la limpia y SendOut resetea', () => {
  const game = toBattle({
    rng: rngOf(6, 6, 6), // rasguños 6 ⇒ 20 · attackSelect 6 ⇒ NoAttack (×2: ataque y pase)
    player: (p) => ({
      ...p,
      team: [{ ...p.team[0]!, damage: 10 }, secondPkm()],
      items: itemsWithPotion,
    }),
  })
  expect(game.state.battle?.actedThisTurn).toBe(false)
  expect(() => assertInvariants(game.state)).not.toThrow()

  const healed = ok(
    run(game.state, { type: 'UsePotion', pkmUid: 'p1-starter', target: 'p1-starter' }, game.ctx),
  )
  expect(healed.value.state.battle?.actedThisTurn).toBe(true)
  // Poción + ataque en el mismo turno sigue siendo legal (D-11).
  const attack = ok(run(healed.value.state, { type: 'Attack', attackId: 'rasgunos' }, game.ctx))
  expect(attack.value.state.battle?.actedThisTurn).toBe(false) // turno propio nuevo

  const passed = ok(run(attack.value.state, { type: 'Advance' }, game.ctx))
  expect(passed.value.state.battle?.actedThisTurn).toBe(false)

  // Reponer tras desmayo: el turno propio del reemplazo arranca limpio.
  const beaten = toBattle({
    rng: rngOf(3), // attackSelect 3 ⇒ Embestida (20) KO del starter con 40 de daño
    player: (p) => ({ ...p, team: [{ ...p.team[0]!, damage: 40 }, secondPkm()], items: itemsWithPotion }),
  })
  const fainted = ok(run(beaten.state, { type: 'Advance' }, beaten.ctx))
  expect(fainted.value.state.pending).toEqual({ type: 'ChooseReplacement', options: ['p1-second'] })
  const sent = ok(run(fainted.value.state, { type: 'SendOut', pkmUid: 'p1-second' }, beaten.ctx))
  expect(sent.value.state.battle?.turnSide).toBe(0)
  expect(sent.value.state.battle?.actedThisTurn).toBe(false)
})

// AC: retirada-solo-inicio-turno/AC-5 — un Retire exitoso pone turnSide = 1 y
// resuelve el turno del rival en el mismo comando (cambiar gasta el turno).
test('AC-5 Retire exitoso gasta el turno: el rival resuelve dentro del mismo comando', () => {
  const game = toBattle({
    rng: rngOf(4), // attackSelect 4 ⇒ Burbujas (10) sobre el reemplazo
    player: (p) => ({ ...p, team: [{ ...p.team[0]!, damage: 10 }, secondPkm()] }),
  })
  const retired = ok(run(game.state, { type: 'Retire', to: 'p1-second' }, game.ctx))
  expect(retired.value.events).toContainEqual({
    type: 'PkmRetired',
    player: 'p1',
    from: 'p1-starter',
    to: 'p1-second',
  })
  expect(retired.value.events).toContainEqual({ type: 'DieRolled', purpose: 'attackSelect', value: 4 })
  expect(retired.value.events).toContainEqual({
    type: 'AttackUsed',
    attacker: 'rival-1',
    attackId: 'burbujas',
    target: 'p1-second',
  })
  expect(retired.value.events).toContainEqual({
    type: 'DamageTaken',
    pkmUid: 'p1-second',
    amount: 10,
    cause: 'attack',
  })
  expect(retired.value.state.battle?.turnSide).toBe(0)
  expect(retired.value.state.battle?.active[0]).toBe('p1-second')
  expect(retired.value.state.battle?.actedThisTurn).toBe(false)
})

// retirada-solo-inicio-turno: invariante de la marca — solo puede estar activa
// con turnSide === 0 (se limpia al terminar/iniciar el turno propio). Se
// corrige con pending ChooseReplacement: es el único estado observable con
// turnSide 1 (la invariante turno-del-jugador-entre-comandos lo saltea).
test('invariante batalla/accion-usada-en-turno-propio: la marca exige turno propio', () => {
  const game = toBattle({
    rng: rngOf(),
    player: (p) => ({ ...p, team: [...p.team, secondPkm()] }),
  })
  const corrupted: GameState = {
    ...game.state,
    pending: { type: 'ChooseReplacement', options: ['p1-second'] },
    battle: { ...game.state.battle!, actedThisTurn: true, turnSide: 1 },
  }
  try {
    assertInvariants(corrupted)
    throw new Error('la invariante debía fallar')
  } catch (cause) {
    expect(cause).toBeInstanceOf(InvariantError)
    if (cause instanceof InvariantError) {
      expect(cause.invariant).toBe('batalla/accion-usada-en-turno-propio')
    }
  }
})
