// AC: SPEC-D/T-032d/AC-1, AC-3 — coreografía de encuentro, entradas de PKM, dado,
// Centro PKM, gimnasio y fin de batalla. Temporizadores falsos: orden + resolución.
import { parseCardId, parsePlayerId } from '@liga/content'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ANIMATION_CONFIG } from '../../events/anim.config'
import { es } from '../../i18n/es'
import { DIE_EFFECT_DELAY_MS, DIE_FADE_MS, DIE_ROLL_SETTLE_MS, dieRollWaitMs } from '../dieTiming'
import { battleEventPlays } from './registry'
import { createHarness, playAll, resolution, uids } from './testkit'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

test('AC: SPEC-D/T-032d/AC-1 - todo evento de combate tiene función play registrada', async () => {
  const battleTypes = [
    'BattleStarted', 'AttackUsed', 'NoAttack', 'AttackDodged', 'UnsupportedEffect', 'DamageTaken',
    'Healed', 'WokeUp', 'SelfHit', 'ConditionApplied', 'ConditionCleared', 'PokemonFainted',
    'PkmRetired', 'PkmSentOut', 'BattleEnded', 'XpGained', 'PkmEvolved', 'PokemonCaptured',
    'GymLocked', 'RivalSentOut', 'MedalWon', 'PrizePkmWon', 'GameWon', 'PartyHealed',
  ] as const
  for (const type of battleTypes) expect(battleEventPlays[type]).toBeDefined()
  // Un evento fuera de combate (tablero) no coreografía nada: resuelve inmediato.
  const h = createHarness()
  await h.choreo.play({ type: 'Landed', player: parsePlayerId('p1'), node: 'n1' })
  await vi.advanceTimersByTimeAsync(1_000)
  expect(h.trace()).toEqual([])
})

test('AC: SPEC-D/T-032d/AC-1 - encuentro salvaje: barrido, entrada de sprites y mensaje; AC-3 orden y resolución', async () => {
  const h = createHarness()
  const run = h.choreo.play({
    type: 'BattleStarted', player: parsePlayerId('p1'), kind: 'wild',
    rival: parseCardId('poliwag'), active: uids.squirtle,
  })
  const done = resolution(run)
  await vi.advanceTimersByTimeAsync(500)
  expect(done.isDone()).toBe(false)
  expect(h.stages[h.stages.length - 1]?.sweep).toBe(true)
  await vi.advanceTimersByTimeAsync(120_000)
  await run
  expect(done.isDone()).toBe(true)
  const trace = h.trace()
  expect(trace.some((line) => line.includes('"sw":true'))).toBe(true)
  expect(trace.some((line) => line.includes('"en":["player","rival"]'))).toBe(true)
  const last = h.stages[h.stages.length - 1]
  expect(last?.player?.card.id).toBe('squirtle')
  expect(last?.rival?.card.id).toBe('poliwag')
  expect(last?.sweep).toBe(false)
  expect(last?.entrance).toEqual([])
  expect(last?.message).toBe('¡Un Poliwag salvaje apareció!')
})

test('AC: SPEC-D/T-032d/AC-1 - encuentro de gimnasio: intro del líder', async () => {
  const h = createHarness()
  await playAll(h.choreo, [{
    type: 'BattleStarted', player: parsePlayerId('p1'), kind: 'gym',
    rival: parseCardId('poliwag'), active: uids.squirtle,
  }])
  expect(h.stages[h.stages.length - 1]?.message).toBe(es.battleMsgGymIntro)
})

test('AC: SPEC-D/T-032d/AC-1 - PKM entra: PkmSentOut reemplaza al activo con entrada; AC-3 resolución', async () => {
  const h = createHarness()
  await playAll(h.choreo, [
    { type: 'BattleStarted', player: parsePlayerId('p1'), kind: 'wild', rival: parseCardId('poliwag'), active: uids.squirtle },
  ])
  const run = h.choreo.play({ type: 'PkmSentOut', player: parsePlayerId('p1'), pkmUid: uids.charmander })
  const done = resolution(run)
  await vi.advanceTimersByTimeAsync(200)
  expect(done.isDone()).toBe(false)
  await vi.advanceTimersByTimeAsync(120_000)
  await run
  const last = h.stages[h.stages.length - 1]
  expect(last?.player?.uid).toBe(uids.charmander)
  expect(last?.player?.card.id).toBe('charmander')
  expect(last?.entrance).toEqual([])
  expect(last?.message).toBe('¡Charmander, yo te elijo!')
  expect(h.trace().some((line) => line.includes('"en":["player"]'))).toBe(true)
})

test('AC: SPEC-D/T-032d/AC-1 - RivalSentOut: el rival repone con entrada', async () => {
  const h = createHarness()
  await playAll(h.choreo, [
    { type: 'BattleStarted', player: parsePlayerId('p1'), kind: 'wild', rival: parseCardId('poliwag'), active: uids.squirtle },
    { type: 'RivalSentOut', pkmUid: uids.tangela },
  ])
  const last = h.stages[h.stages.length - 1]
  expect(last?.rival?.uid).toBe(uids.tangela)
  expect(last?.rival?.card.id).toBe('tangela_erika')
  expect(last?.message).toBe('El rival mandó a Tangela.')
})

test('AC: SPEC-D/T-032d/AC-1 - PkmRetired: retira y entra el reemplazo', async () => {
  const h = createHarness()
  await playAll(h.choreo, [
    { type: 'BattleStarted', player: parsePlayerId('p1'), kind: 'wild', rival: parseCardId('poliwag'), active: uids.squirtle },
    { type: 'PkmRetired', player: parsePlayerId('p1'), from: uids.squirtle, to: uids.charmander },
  ])
  const last = h.stages[h.stages.length - 1]
  expect(last?.player?.uid).toBe(uids.charmander)
  expect(h.trace().some((line) => line.includes('se retiró'))).toBe(true)
})

test('AC: SPEC-D/T-032d/AC-1 - dado: DieRolled{attackSelect} fija el valor y dura lo del dado; AC-3 resolución', async () => {
  const h = createHarness()
  const run = h.choreo.play({ type: 'DieRolled', purpose: 'attackSelect', value: 3 })
  const done = resolution(run)
  await vi.advanceTimersByTimeAsync(400)
  expect(done.isDone()).toBe(false)
  expect(h.stages[h.stages.length - 1]?.attackSelectValue).toBe(3)
  await vi.advanceTimersByTimeAsync(120_000)
  await run
  expect(done.isDone()).toBe(true)
  expect(h.stages[h.stages.length - 1]?.attackSelectValue).toBe(3)
})

test('AC: SPEC-D/T-032d/AC-1 - dado de otro propósito (effect) no cambia el attackSelect', async () => {
  const h = createHarness()
  await playAll(h.choreo, [{ type: 'DieRolled', purpose: 'effect', value: 5 }])
  expect(h.choreo.stage.attackSelectValue).toBeNull()
})

// AC: dado-de-combate/AC-2 - las tiradas de tablero (move/oportunidad) NO
// tocan el dado de combate del popup.
test('AC: dado-de-combate/AC-2 - DieRolled{move} no patchea el dado de combate', async () => {
  const h = createHarness()
  await playAll(h.choreo, [{ type: 'DieRolled', purpose: 'move', value: 4 }])
  expect(h.choreo.stage.dieValue).toBeNull()
  expect(h.choreo.stage.diePurpose).toBeNull()
})

// AC: dado-de-combate/AC-3 - playDieRolled patchea el dado de combate
// (dieValue/diePurpose) y espera la tirada real (fix-animacion-dados-combate/
// AC-3: rollDurationMs(seed) + asentamiento, no la pausa fija dieRollMs);
// attackSelect sigue alimentando la fila rival igual que hoy.
// combate-legible/AC-2/AC-3: attackSelect ahora se ANUNCIA en el chat antes de
// rodar el dado (messageMs), así que a mitad de camino ya está el mensaje y la
// fila rival, y el dado se patchea recién al rodar.
test('AC: dado-de-combate/AC-3 - todo propósito de combate patchea el dado y espera la tirada real', async () => {
  const h = createHarness()
  const run = h.choreo.play({ type: 'DieRolled', purpose: 'attackSelect', value: 3 })
  const done = resolution(run)
  await vi.advanceTimersByTimeAsync(400)
  expect(done.isDone()).toBe(false) // anuncio (messageMs) + tirada real (> 800)
  const mid = h.stages[h.stages.length - 1]
  expect(mid?.message).toBe(es.battleMsgDieAttackSelect.replace('{name}', ''))
  expect(mid?.dieValue).toBeNull() // el dado recién se patchea al rodar
  expect(mid?.attackSelectValue).toBe(3) // la fila rival se conserva igual que hoy
  await vi.advanceTimersByTimeAsync(120_000)
  await run
  expect(h.stages[h.stages.length - 1]?.dieValue).toBe(3)
  expect(h.stages[h.stages.length - 1]?.diePurpose).toBe('attackSelect')
  // Otro propósito de combate también alimenta el dado, sin tocar la fila rival.
  await playAll(h.choreo, [{ type: 'DieRolled', purpose: 'gate', value: 5 }])
  const after = h.stages[h.stages.length - 1]
  expect(after?.dieValue).toBe(5)
  expect(after?.diePurpose).toBe('gate')
  expect(after?.attackSelectValue).toBe(3)
})

// AC: dado-de-combate/AC-5 - cada combate nuevo resetea el dado (arranca vacío).
test('AC: dado-de-combate/AC-5 - BattleStarted resetea el dado de combate', async () => {
  const h = createHarness()
  await playAll(h.choreo, [
    { type: 'DieRolled', purpose: 'effect', value: 2 },
    { type: 'BattleStarted', player: parsePlayerId('p1'), kind: 'wild', rival: parseCardId('poliwag'), active: uids.squirtle },
  ])
  const last = h.stages[h.stages.length - 1]
  expect(last?.dieValue).toBeNull()
  expect(last?.diePurpose).toBeNull()
})

test('AC: SPEC-D/T-032d/AC-1 - PartyHealed: el equipo propio queda sin daño ni derrotas', async () => {
  const h = createHarness()
  await playAll(h.choreo, [
    { type: 'BattleStarted', player: parsePlayerId('p1'), kind: 'wild', rival: parseCardId('poliwag'), active: uids.squirtle },
    { type: 'DamageTaken', pkmUid: uids.squirtle, amount: 20, cause: 'attack' },
    { type: 'PartyHealed', player: parsePlayerId('p1'), count: 1 },
  ])
  const last = h.stages[h.stages.length - 1]
  expect(last?.player?.damage).toBe(0)
  expect(last?.player?.fainted).toBe(false)
  expect(last?.message).toBe(es.battleMsgTeamHealed)
})

test('AC: SPEC-D/T-032d/AC-1 - líder de gimnasio: GymLocked, MedalWon y PrizePkmWon', async () => {
  const h = createHarness()
  await playAll(h.choreo, [
    { type: 'GymLocked', player: parsePlayerId('p1'), gym: 'montana', requiresMedals: 7 },
    { type: 'MedalWon', player: parsePlayerId('p1'), gym: 'montana', medal: 'Tierra' },
    { type: 'PrizePkmWon', player: parsePlayerId('p1'), card: parseCardId('poliwag'), pkmUid: uids.poliwag, destination: 'team' },
  ])
  const trace = h.trace()
  expect(trace.some((line) => line.includes('Necesitás 7 medallas'))).toBe(true)
  expect(trace.some((line) => line.includes('"fs":"medal"'))).toBe(true)
  expect(trace.some((line) => line.includes('Medalla Tierra'))).toBe(true)
  expect(trace.some((line) => line.includes('¡Ganaste a Poliwag!'))).toBe(true)
})

test('AC: SPEC-D/T-032d/AC-1 - BattleEnded y GameWon cierran la escena', async () => {
  const h = createHarness()
  await playAll(h.choreo, [
    { type: 'BattleEnded', player: parsePlayerId('p1'), result: 'won' },
    { type: 'GameWon', player: parsePlayerId('p1') },
  ])
  const last = h.stages[h.stages.length - 1]
  expect(last?.ended).toBe('won')
  expect(h.trace().some((line) => line.includes(es.battleMsgWon))).toBe(true)
  expect(last?.message).toBe(es.battleMsgGameWon)
})

// ── fix-animacion-dados-combate: los dados de combate se ven rodar y muestran
// el número antes de que siga el guion (motor intacto: solo coreografía/UI). ──

// AC: fix-animacion-dados-combate/AC-2 - routing dieSide: cada tirada rueda en
// el slot del lado que está jugando (attackSelect siempre rival; gate/dodge del
// turno en curso; wake del lado dormido; effect/bonus del atacante).
test('AC: fix-animacion-dados-combate/AC-2 - dieSide: cada tirada rueda en el slot del lado que juega', async () => {
  const h = createHarness()
  await playAll(h.choreo, [{
    type: 'BattleStarted', player: parsePlayerId('p1'), kind: 'wild',
    rival: parseCardId('poliwag'), active: uids.squirtle,
  }])
  // Turno del jugador: su gate va al slot propio.
  await playAll(h.choreo, [{ type: 'DieRolled', purpose: 'gate', value: 2 }])
  expect(h.choreo.stage.dieSide).toBe('player')
  // Turno del rival: attackSelect marca el turno y su gate va al slot rival.
  await playAll(h.choreo, [
    { type: 'DieRolled', purpose: 'attackSelect', value: 4 },
    { type: 'DieRolled', purpose: 'gate', value: 1 },
  ])
  expect(h.choreo.stage.dieSide).toBe('rival')
  // El rival termina su turno: el gate siguiente ya es del jugador.
  await playAll(h.choreo, [
    { type: 'NoAttack', attacker: uids.poliwag, reason: 'attackSelect' },
    { type: 'DieRolled', purpose: 'gate', value: 5 },
  ])
  expect(h.choreo.stage.dieSide).toBe('player')
  // wake: rueda el lado dormido (y al despertar sale de las conditions).
  await playAll(h.choreo, [
    { type: 'ConditionApplied', pkmUid: uids.squirtle, condition: 'asleep' },
    { type: 'DieRolled', purpose: 'wake', value: 6 },
  ])
  expect(h.choreo.stage.dieSide).toBe('player')
  await playAll(h.choreo, [{ type: 'WokeUp', pkmUid: uids.squirtle }])
  expect(h.choreo.stage.player?.conditions?.asleep).toBeUndefined()
  // El rival dormido rueda su wake en el slot rival.
  await playAll(h.choreo, [
    { type: 'ConditionApplied', pkmUid: uids.poliwag, condition: 'asleep' },
    { type: 'DieRolled', purpose: 'wake', value: 1 },
  ])
  expect(h.choreo.stage.dieSide).toBe('rival')
  // effect/bonus: del lado que está atacando.
  await playAll(h.choreo, [
    { type: 'AttackUsed', attacker: uids.squirtle, attackId: 'cabezazo', target: uids.poliwag },
    { type: 'DieRolled', purpose: 'effect', value: 3 },
  ])
  expect(h.choreo.stage.dieSide).toBe('player')
})

// AC: fix-animacion-dados-combate/AC-3 - playDieRolled espera la duración REAL
// de la tirada (rollDurationMs(seed) + asentamiento): no resuelve antes y la
// espera supera la pausa fija vieja de 800 ms.
test('AC: fix-animacion-dados-combate/AC-3 - la pausa es la tirada real y no resuelve antes', async () => {
  const h = createHarness()
  const waitMs = dieRollWaitMs(1, '1x', false) // primera tirada del combate: nonce 1
  expect(waitMs).toBeGreaterThan(ANIMATION_CONFIG.battle.dieRollMs)
  // arreglar-dados-combate/AC-3: el margen ahora también cubre el retardo
  // disparo→efecto de React (DIE_EFFECT_DELAY_MS).
  expect(waitMs).toBeLessThanOrEqual(1760 + DIE_ROLL_SETTLE_MS + DIE_EFFECT_DELAY_MS)
  const run = h.choreo.play({ type: 'DieRolled', purpose: 'gate', value: 3 })
  const done = resolution(run)
  await vi.advanceTimersByTimeAsync(waitMs - 1)
  expect(done.isDone()).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  await run
  expect(done.isDone()).toBe(true)
  expect(h.choreo.stage.dieValue).toBe(3)
})

// AC: fix-animacion-dados-combate/AC-4 - sin doble escalado: a 2x espera la
// tirada real de 2x; skip es instantáneo y reducedMotion funde 200 ms.
test('AC: fix-animacion-dados-combate/AC-4 - 2x/skip/reducedMotion esperan lo que rueda el dado', async () => {
  expect(dieRollWaitMs(1, '2x', false)).toBeGreaterThanOrEqual(720 + DIE_ROLL_SETTLE_MS)
  expect(dieRollWaitMs(1, '2x', false)).toBeLessThanOrEqual(
    880 + DIE_ROLL_SETTLE_MS + DIE_EFFECT_DELAY_MS,
  )
  expect(dieRollWaitMs(1, 'skip', false)).toBe(0)
  expect(dieRollWaitMs(1, '1x', true)).toBe(DIE_FADE_MS)

  const at2x = createHarness({ speed: '2x' })
  const run2 = at2x.choreo.play({ type: 'DieRolled', purpose: 'effect', value: 2 })
  const done2 = resolution(run2)
  await vi.advanceTimersByTimeAsync(dieRollWaitMs(1, '2x', false) - 1)
  expect(done2.isDone()).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(done2.isDone()).toBe(true)

  const skipped = createHarness({ speed: 'skip' })
  await skipped.choreo.play({ type: 'DieRolled', purpose: 'effect', value: 4 })
  expect(skipped.choreo.stage.dieValue).toBe(4)

  const reduced = createHarness({ reducedMotion: true })
  const runR = reduced.choreo.play({ type: 'DieRolled', purpose: 'effect', value: 5 })
  const doneR = resolution(runR)
  await vi.advanceTimersByTimeAsync(DIE_FADE_MS - 1)
  expect(doneR.isDone()).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(doneR.isDone()).toBe(true)
})

// AC: fix-animacion-dados-combate/AC-5 - orden visible por ataque: dado →
// "X usó Y" → daño, y el número del dado queda visible hasta la próxima tirada.
test('AC: fix-animacion-dados-combate/AC-5 - el dado se ve antes del ataque y el número persiste', async () => {
  const h = createHarness()
  await playAll(h.choreo, [
    { type: 'BattleStarted', player: parsePlayerId('p1'), kind: 'wild', rival: parseCardId('poliwag'), active: uids.squirtle },
    { type: 'DieRolled', purpose: 'effect', value: 2 },
    { type: 'AttackUsed', attacker: uids.squirtle, attackId: 'cabezazo', target: uids.poliwag },
    { type: 'DamageTaken', pkmUid: uids.poliwag, amount: 10, cause: 'attack' },
  ])
  const dieAt = h.stages.findIndex((stage) => stage.diePurpose === 'effect' && stage.dieValue === 2)
  const usedAt = h.stages.findIndex((stage) => stage.message === 'Squirtle usó Cabezazo.')
  const hurtAt = h.stages.findIndex((stage) => stage.rival?.damage === 10)
  expect(dieAt).toBeGreaterThanOrEqual(0)
  expect(usedAt).toBeGreaterThan(dieAt)
  expect(hurtAt).toBeGreaterThan(usedAt)
  const last = h.stages[h.stages.length - 1]
  expect(last?.dieValue).toBe(2)
  expect(last?.diePurpose).toBe('effect')
})
