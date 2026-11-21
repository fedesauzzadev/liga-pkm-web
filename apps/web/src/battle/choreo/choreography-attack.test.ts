// AC: SPEC-D/T-032d/AC-1, AC-3 — coreografía de ataque ("X usó Y", levantada, FX),
// daño (parpadeo ×3 + número flotante + barra), estados, curación, derrota, XP,
// evolución y captura. Temporizadores falsos: orden + resolución de cada promesa.
import { parseCardId, parsePlayerId } from '@liga/content'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { es } from '../../i18n/es'
import { createHarness, playAll, resolution, uids } from './testkit'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

const startBattle = async (h: ReturnType<typeof createHarness>): Promise<void> => {
  await playAll(h.choreo, [{
    type: 'BattleStarted', player: parsePlayerId('p1'), kind: 'wild',
    rival: parseCardId('poliwag'), active: uids.squirtle,
  }])
}

test('AC: SPEC-D/T-032d/AC-1 - AttackUsed del jugador: typewriter, carta levantada y playMoveFx', async () => {
  const h = createHarness()
  await startBattle(h)
  const run = h.choreo.play({
    type: 'AttackUsed', attacker: uids.squirtle, attackId: 'cabezazo', target: uids.poliwag,
  })
  const done = resolution(run)
  await vi.advanceTimersByTimeAsync(300)
  expect(done.isDone()).toBe(false)
  const partial = h.stages[h.stages.length - 1]?.message
  expect(typeof partial).toBe('string')
  expect(partial === 'Squirtle usó Cabezazo.').toBe(false)
  await vi.advanceTimersByTimeAsync(120_000)
  await run
  expect(done.isDone()).toBe(true)
  // Typewriter: revela de a 1 carácter (prefijos crecientes del texto final).
  const messages = h.trace().map((line) => (JSON.parse(line) as { ms: string | null }).ms)
  const full = 'Squirtle usó Cabezazo.'
  const typed = [...new Set(messages.filter((m): m is string => m !== null && full.startsWith(m)))]
  expect(typed[0]).toBe('S')
  expect(typed[typed.length - 1]).toBe(full)
  expect(typed.every((m, i) => i === 0 || m.length === (typed[i - 1] ?? '').length + 1)).toBe(true)
  // Levantada durante el FX y puerto de FX con el movimiento oficial del ataque.
  expect(h.trace().some((line) => line.includes('"ra":"player"'))).toBe(true)
  expect(h.fx).toEqual([{ moveId: 'headbutt', side: 'player', target: 'rival' }])
  expect(h.stages[h.stages.length - 1]?.raised).toBeNull()
})

test('AC: SPEC-D/T-032d/AC-1 - AttackUsed del rival: levanta la carta rival y FX hacia el jugador', async () => {
  const h = createHarness()
  await startBattle(h)
  await playAll(h.choreo, [
    { type: 'DieRolled', purpose: 'attackSelect', value: 3 },
    { type: 'AttackUsed', attacker: uids.poliwag, attackId: 'embestida', target: uids.squirtle },
  ])
  expect(h.fx).toEqual([{ moveId: 'tackle', side: 'rival', target: 'player' }])
  expect(h.trace().some((line) => line.includes('"ra":"rival"'))).toBe(true)
  expect(h.stages[h.stages.length - 1]?.message).toBe('Poliwag usó Embestida.')
})

test('AC: SPEC-D/T-032d/AC-1 - NoAttack: un mensaje por motivo', async () => {
  const h = createHarness()
  await startBattle(h)
  // fix-confusion-captura/AC-5: attackSelect informa el valor del dado (el
  // DieRolled anterior dejó attackSelectValue visible en el stage).
  await playAll(h.choreo, [
    { type: 'DieRolled', purpose: 'attackSelect', value: 6 },
    { type: 'NoAttack', attacker: uids.poliwag, reason: 'attackSelect' },
  ])
  const last = h.stages[h.stages.length - 1]
  expect(last?.message).toBe('Poliwag no atacó (sacó 6).')
  expect(last?.attackSelectValue).toBe(6)
  const reasons = [
    ['asleep', es.battleMsgAsleep],
    ['skip', es.battleMsgSkip],
    ['gate', es.battleMsgGate],
  ] as const
  for (const [reason, template] of reasons) {
    await playAll(h.choreo, [{ type: 'NoAttack', attacker: uids.poliwag, reason }])
    const message = h.stages[h.stages.length - 1]?.message ?? ''
    expect(message).toBe(template.replace('{name}', 'Poliwag'))
  }
})

// AC: visibilidad-estados-combate/AC-2 - SelfHit: el chat explica el auto-golpe
// con la cara del dado de gate, antes del AttackUsed redirigido.
test('AC: visibilidad-estados-combate/AC-2 - SelfHit anuncia el auto-ataque en el chat', async () => {
  const h = createHarness()
  await startBattle(h)
  await playAll(h.choreo, [{ type: 'SelfHit', attacker: uids.poliwag, value: 2 }])
  const last = h.stages[h.stages.length - 1]
  expect(last?.message).toBe(es.battleMsgSelfHit.replace('{name}', 'Poliwag').replace('{n}', '2'))
})

// AC: fix-confusion-captura/AC-4 - el FX de un AttackUsed cuyo target es el
// propio atacante se dibuja sobre ese lado (no asume defensor = contrario).
test('AC: fix-confusion-captura/AC-4 - selfHit: el FX del ataque se dibuja sobre el atacante', async () => {
  const h = createHarness()
  await startBattle(h)
  await playAll(h.choreo, [
    { type: 'SelfHit', attacker: uids.squirtle, value: 1 },
    { type: 'AttackUsed', attacker: uids.squirtle, attackId: 'cabezazo', target: uids.squirtle },
  ])
  expect(h.fx).toEqual([{ moveId: 'headbutt', side: 'player', target: 'player' }])
  // El rival atacando al jugador sigue dibujándose sobre el jugador.
  await playAll(h.choreo, [
    { type: 'AttackUsed', attacker: uids.poliwag, attackId: 'embestida', target: uids.squirtle },
  ])
  expect(h.fx).toEqual([
    { moveId: 'headbutt', side: 'player', target: 'player' },
    { moveId: 'tackle', side: 'rival', target: 'player' },
  ])
})

// AC: fix-confusion-captura/AC-5 - la secuencia completa selfHit → turno del
// rival (dado attackSelect + NoAttack) se coreografía sin cortes: mensajes en
// orden, dado del rival visible al final.
test('AC: fix-confusion-captura/AC-5 - selfHit seguido del turno del rival se reproduce completo', async () => {
  const h = createHarness()
  await startBattle(h)
  await playAll(h.choreo, [
    { type: 'SelfHit', attacker: uids.squirtle, value: 1 },
    { type: 'AttackUsed', attacker: uids.squirtle, attackId: 'cabezazo', target: uids.squirtle },
    { type: 'DamageTaken', pkmUid: uids.squirtle, amount: 10, cause: 'attack' },
    { type: 'DieRolled', purpose: 'attackSelect', value: 6 },
    { type: 'NoAttack', attacker: uids.poliwag, reason: 'attackSelect' },
  ])
  const messages = h.trace().map((line) => (JSON.parse(line) as { ms: string | null }).ms)
  expect(messages).toContain(es.battleMsgSelfHit.replace('{name}', 'Squirtle').replace('{n}', '1'))
  expect(messages).toContain('Squirtle usó Cabezazo.')
  expect(messages).toContain('Poliwag no atacó (sacó 6).')
  const selfHitAt = messages.indexOf(es.battleMsgSelfHit.replace('{name}', 'Squirtle').replace('{n}', '1'))
  const usedAt = messages.indexOf('Squirtle usó Cabezazo.')
  const rivalAt = messages.indexOf('Poliwag no atacó (sacó 6).')
  expect(selfHitAt).toBeGreaterThanOrEqual(0)
  expect(selfHitAt).toBeLessThan(usedAt)
  expect(usedAt).toBeLessThan(rivalAt)
  const last = h.stages[h.stages.length - 1]
  expect(last?.attackSelectValue).toBe(6) // el dado del rival queda visible
  expect(last?.player?.damage).toBe(10)
})

// AC: visibilidad-estados-combate/AC-3 - NoAttack por gate: el chat explica la
// tirada según la causa en vez del genérico.
test('AC: visibilidad-estados-combate/AC-3 - NoAttack de gate con causa: mensaje explicado', async () => {
  const h = createHarness()
  await startBattle(h)
  await playAll(h.choreo, [
    { type: 'NoAttack', attacker: uids.squirtle, reason: 'gate', cause: 'paralized', value: 1 },
    { type: 'NoAttack', attacker: uids.squirtle, reason: 'gate', cause: 'defended', value: 4 },
  ])
  const messages = h.trace().map((line) => (JSON.parse(line) as { ms: string | null }).ms)
  expect(messages).toContain(es.battleMsgGateParalized.replace('{name}', 'Squirtle').replace('{n}', '1'))
  expect(messages).toContain(es.battleMsgGateDefended.replace('{name}', 'Squirtle').replace('{n}', '4'))
})

// AC: visibilidad-estados-combate/AC-6 - ConditionApplied y ConditionCleared: un
// mensaje por condición en el chat del combate.
test('AC: visibilidad-estados-combate/AC-6 - plays de ConditionApplied y ConditionCleared', async () => {
  const h = createHarness()
  await startBattle(h)
  await playAll(h.choreo, [
    { type: 'ConditionApplied', pkmUid: uids.poliwag, condition: 'confused', faces: [1, 2, 3] },
    { type: 'ConditionApplied', pkmUid: uids.poliwag, condition: 'poison' },
    { type: 'ConditionApplied', pkmUid: uids.squirtle, condition: 'selfBoost' },
    { type: 'ConditionCleared', pkmUid: uids.poliwag, condition: 'confused' },
  ])
  const messages = h.trace().map((line) => (JSON.parse(line) as { ms: string | null }).ms)
  expect(messages).toContain(
    es.battleMsgCondConfused.replace('{name}', 'Poliwag').replace('{faces}', '1-2-3'),
  )
  expect(messages).toContain(es.battleMsgCondPoison.replace('{name}', 'Poliwag'))
  expect(messages).toContain(es.battleMsgCondSelfBoost.replace('{name}', 'Squirtle'))
  expect(messages).toContain(es.battleMsgCondClearedConfused.replace('{name}', 'Poliwag'))
})

test('AC: SPEC-D/T-032d/AC-1 - AttackDodged, UnsupportedEffect y WokeUp con mensaje', async () => {
  const h = createHarness()
  await startBattle(h)
  await playAll(h.choreo, [
    { type: 'AttackDodged', attacker: uids.poliwag, defender: uids.squirtle },
    { type: 'UnsupportedEffect', handler: 'TODO_algo', attackId: 'cabezazo' },
    { type: 'WokeUp', pkmUid: uids.squirtle },
  ])
  const messages = h.trace().map((line) => (JSON.parse(line) as { ms: string | null }).ms)
  expect(messages).toContain(es.battleMsgDodged.replace('{name}', 'Squirtle'))
  expect(messages).toContain(es.battleNoEffectText)
  expect(messages).toContain(es.battleMsgWokeUp.replace('{name}', 'Squirtle'))
})

test('AC: SPEC-D/T-032d/AC-1 - DamageTaken: parpadeo ×3, número flotante y barra (daño acumulado)', async () => {
  const h = createHarness()
  await startBattle(h)
  const run = h.choreo.play({ type: 'DamageTaken', pkmUid: uids.poliwag, amount: 20, cause: 'attack' })
  const done = resolution(run)
  await vi.advanceTimersByTimeAsync(100)
  expect(done.isDone()).toBe(false)
  await vi.advanceTimersByTimeAsync(120_000)
  await run
  expect(done.isDone()).toBe(true)
  const trace = h.trace()
  const blinks = trace.filter((line) => line.includes('"bl":"r-poliwag"')).length
  expect(blinks).toBe(3)
  expect(trace.some((line) => line.includes('rival:-20'))).toBe(true)
  const last = h.stages[h.stages.length - 1]
  expect(last?.rival?.damage).toBe(20)
  expect(last?.floaters).toEqual([])
  expect(last?.blink).toBeNull()
})

test('AC: SPEC-D/T-032d/AC-1 - Healed: número verde + y daño que baja', async () => {
  const h = createHarness()
  await startBattle(h)
  await playAll(h.choreo, [
    { type: 'DamageTaken', pkmUid: uids.squirtle, amount: 30, cause: 'attack' },
    { type: 'Healed', pkmUid: uids.squirtle, amount: 20, cause: 'potion' },
  ])
  const trace = h.trace()
  expect(trace.some((line) => line.includes('player:+20'))).toBe(true)
  const last = h.stages[h.stages.length - 1]
  expect(last?.player?.damage).toBe(10)
  expect(last?.message).toBe(es.battleMsgHealed.replace('{name}', 'Squirtle').replace('{amount}', '20'))
})

test('AC: SPEC-D/T-032d/AC-1 - PokemonFainted: derrota con caída del sprite y mensaje', async () => {
  const h = createHarness()
  await startBattle(h)
  await playAll(h.choreo, [
    { type: 'DamageTaken', pkmUid: uids.poliwag, amount: 50, cause: 'attack' },
    { type: 'PokemonFainted', pkmUid: uids.poliwag },
  ])
  const last = h.stages[h.stages.length - 1]
  expect(last?.rival?.fainted).toBe(true)
  expect(last?.message).toBe('¡Poliwag se debilitó!')
})

test('AC: SPEC-D/T-032d/AC-1 - XpGained: flotante de XP sobre el PKM', async () => {
  const h = createHarness()
  await startBattle(h)
  await playAll(h.choreo, [{ type: 'XpGained', pkmUid: uids.squirtle, amount: 1 }])
  expect(h.trace().some((line) => line.includes('player:+1 XP'))).toBe(true)
  expect(h.stages[h.stages.length - 1]?.floaters).toEqual([])
})

// AC: cargar-charmeleon-animar-evolucion/AC-4 - la evolución en combate usa la
// secuencia clásica: 3 pulsos de silueta crecientes → destello → cambio de
// sprite → revelación, conservando el daño y dentro del presupuesto (≤ 3,5 s).
test('AC: cargar-charmeleon-animar-evolucion/AC-4 - PkmEvolved: pulsos de silueta + destello antes del cambio y revelación después', async () => {
  const h = createHarness()
  await startBattle(h)
  await playAll(h.choreo, [
    { type: 'DamageTaken', pkmUid: uids.squirtle, amount: 20, cause: 'attack' },
  ])
  const run = h.choreo.play({
    type: 'PkmEvolved', player: parsePlayerId('p1'), pkmUid: uids.squirtle,
    from: parseCardId('squirtle'), to: parseCardId('wartortle'),
  })
  const done = resolution(run)
  const t0 = Date.now()
  let guard = 0
  while (!done.isDone() && guard < 40_000) {
    await vi.advanceTimersByTimeAsync(25)
    guard += 25
  }
  await run
  expect(done.isDone()).toBe(true)
  // Presupuesto del turno (SPEC-D/T-032d/AC-2): la secuencia completa ≤ 3,5 s a 1×.
  expect(Date.now() - t0).toBeLessThanOrEqual(3500)
  const trace = h.trace()
  const at = (marker: string): number => trace.findIndex((line) => line.includes(marker))
  // Pulsos crecientes 1..3 sobre el PKM que evoluciona, ANTES del destello.
  for (let pulse = 1; pulse <= 3; pulse += 1) {
    expect(at(`"ev":{"uid":"${uids.squirtle}","phase":"pulse","pulse":${pulse}`)).toBeGreaterThanOrEqual(0)
  }
  const firstPulse = at('"phase":"pulse","pulse":1')
  const flashAt = at('"fs":"evolve"')
  const swapAt = at('"pc":{"c":"wartortle"')
  const revealAt = at('"phase":"reveal"')
  expect(firstPulse).toBeGreaterThanOrEqual(0)
  expect(firstPulse).toBeLessThan(flashAt)
  // El sprite cambia recién con el destello (después de los pulsos).
  expect(flashAt).toBeLessThan(swapAt)
  expect(swapAt).toBeLessThan(revealAt)
  const last = h.stages[h.stages.length - 1]
  expect(last?.player?.card.id).toBe('wartortle')
  expect(last?.player?.damage).toBe(20)
  expect(last?.evolve).toBeNull()
  expect(last?.flash).toBeNull()
  expect(last?.message).toBe('¡Squirtle evolucionó en Wartortle!')
})

test('AC: SPEC-D/T-032d/AC-1 - PokemonCaptured: arco, 3 sacudidas y destello; resultado determinista', async () => {
  const h = createHarness()
  await startBattle(h)
  const run = h.choreo.play({
    type: 'PokemonCaptured', player: parsePlayerId('p1'), card: parseCardId('poliwag'),
    pkmUid: uids.poliwag, destination: 'team',
  })
  const done = resolution(run)
  await vi.advanceTimersByTimeAsync(500)
  expect(done.isDone()).toBe(false)
  await vi.advanceTimersByTimeAsync(120_000)
  await run
  const trace = h.trace()
  expect(trace.some((line) => line.includes('"cp":{"phase":"arc","shakes":0}'))).toBe(true)
  for (let shake = 1; shake <= 3; shake += 1) {
    expect(trace.some((line) => line.includes(`"phase":"shake","shakes":${shake}`))).toBe(true)
  }
  expect(trace.some((line) => line.includes('"phase":"caught","shakes":3'))).toBe(true)
  expect(trace.some((line) => line.includes('"fs":"capture"'))).toBe(true)
  const last = h.stages[h.stages.length - 1]
  expect(last?.capture).toBeNull()
  expect(last?.rival).toBeNull()
  expect(last?.message).toBe('¡Poliwag fue capturado!')
})
