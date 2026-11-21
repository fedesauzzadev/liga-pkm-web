// AC: rediseno-combate-max/AC-3 - daño cero en la coreografía: un
// DamageTaken{amount:0} NO emite número flotante, ni parpadeo, ni cambio de
// barra; con daño base > 0 reducido a 0 el mensaje es "¡No hizo daño!";
// con base 0 el mensaje queda en "{X} usó {ataque}." (sin texto extra).
import { parseCardId, parsePlayerId } from '@liga/content'
import { expect, test, vi } from 'vitest'
import { es } from '../../i18n/es'
import { createHarness, playAll, uids } from './testkit'

test('AC: rediseno-combate-max/AC-3 - amount 0 con base > 0: "¡No hizo daño!", sin floater ni parpadeo', async () => {
  vi.useFakeTimers()
  try {
    const h = createHarness()
    await playAll(h.choreo, [
      { type: 'BattleStarted', player: parsePlayerId('p1'), kind: 'wild', rival: parseCardId('poliwag'), active: uids.squirtle },
      { type: 'AttackUsed', attacker: uids.squirtle, attackId: 'cabezazo', target: uids.poliwag },
    ])
    const before = h.stages.at(-1)!
    await playAll(h.choreo, [{ type: 'DamageTaken', pkmUid: uids.poliwag, amount: 0, cause: 'attack' }])
    const after = h.stages.at(-1)!
    expect(after.message).toBe(es.battleNoDamage)
    // Sin floater "-0" y sin parpadeo.
    expect(after.floaters.some((floater) => floater.text.includes('0'))).toBe(false)
    expect(h.stages.some((stage) => stage.blink === uids.poliwag)).toBe(false)
    // La barra no cambió: el daño del rival sigue igual.
    expect(after.rival?.damage).toBe(before.rival?.damage)
  } finally {
    vi.useRealTimers()
  }
})

test('AC: rediseno-combate-max/AC-3 - amount 0 con base 0 (efecto puro): sin mensaje extra ni animación', async () => {
  vi.useFakeTimers()
  try {
    const h = createHarness()
    // Refugio (Squirtle) es un ataque de efecto puro (base 0).
    await playAll(h.choreo, [
      { type: 'BattleStarted', player: parsePlayerId('p1'), kind: 'wild', rival: parseCardId('poliwag'), active: uids.squirtle },
      { type: 'AttackUsed', attacker: uids.squirtle, attackId: 'refugio', target: uids.poliwag },
    ])
    const used = h.stages.at(-1)!
    await playAll(h.choreo, [{ type: 'DamageTaken', pkmUid: uids.poliwag, amount: 0, cause: 'attack' }])
    const after = h.stages.at(-1)!
    // El mensaje sigue siendo el "usó {ataque}" de siempre.
    expect(after.message).toBe(used.message)
    expect(after.floaters.length).toBe(0)
    expect(h.stages.some((stage) => stage.blink === uids.poliwag)).toBe(false)
    expect(after.rival?.damage).toBe(0)
  } finally {
    vi.useRealTimers()
  }
})

test('AC: rediseno-combate-max/AC-3 - amount > 0 sigue con floater y parpadeo', async () => {
  vi.useFakeTimers()
  try {
    const h = createHarness()
    await playAll(h.choreo, [
      { type: 'BattleStarted', player: parsePlayerId('p1'), kind: 'wild', rival: parseCardId('poliwag'), active: uids.squirtle },
      { type: 'AttackUsed', attacker: uids.squirtle, attackId: 'cabezazo', target: uids.poliwag },
    ])
    await playAll(h.choreo, [{ type: 'DamageTaken', pkmUid: uids.poliwag, amount: 20, cause: 'attack' }])
    const after = h.stages.at(-1)!
    expect(h.stages.some((stage) => stage.blink === uids.poliwag)).toBe(true)
    expect(after.rival?.damage).toBe(20)
  } finally {
    vi.useRealTimers()
  }
})
