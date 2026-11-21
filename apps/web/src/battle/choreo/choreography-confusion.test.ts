// AC: combate-legible — pacing de mensajes legible (AC-1), gate anunciado para
// un atacante confundido de cualquier lado (AC-2), dos tiradas distinguibles en
// el turno del rival confundido (AC-3), placa de estados en vivo (AC-4) y
// guion real del motor con la carta de Abra del content (AC-5).
import { parseCardId, parseNodeId, parsePkmUid, parsePlayerId, type BoardGraph, type Face } from '@liga/content'
import {
  applyCommand,
  newGame,
  type Ctx,
  type GameEvent,
  type GameState,
  type PkmInstance,
  type Rng,
} from '@liga/engine'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ANIMATION_CONFIG } from '../../events/anim.config'
import { gameContent } from '../../game/content'
import { es } from '../../i18n/es'
import { statusViews } from '../model'
import { HpPlate } from '../HpPlate'
import { createHarness, playAll, resolution, uids } from './testkit'
import type { BattleChoreoDeps, BattleStage } from './stage'
import { fmt } from './fmt'

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

const atStage = (stages: readonly BattleStage[], match: (stage: BattleStage) => boolean): number =>
  stages.findIndex(match)

// AC: combate-legible/AC-1 - messageMs ≥ 800 ms a 1× y la pausa por mensaje de
// la coreografía lo usa (el handler de un mensaje simple espera exactamente eso).
test('AC: combate-legible/AC-1 - messageMs ≥ 800 y el mensaje simple espera esa pausa', async () => {
  expect(ANIMATION_CONFIG.battle.messageMs).toBeGreaterThanOrEqual(800)
  const h = createHarness()
  await startBattle(h)
  const run = h.choreo.play({ type: 'WokeUp', pkmUid: uids.squirtle })
  const done = resolution(run)
  await vi.advanceTimersByTimeAsync(ANIMATION_CONFIG.battle.messageMs - 1)
  expect(done.isDone()).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  await run
  expect(done.isDone()).toBe(true)
})

// AC: combate-legible/AC-2 - antes del dado de gate de un atacante confundido
// (acá el jugador) el chat anuncia la tirada con nombre y caras, y el dado
// queda visible con diePurpose 'gate'.
test('AC: combate-legible/AC-2 - gate del atacante confundido del jugador: anuncio antes del dado', async () => {
  const h = createHarness()
  await startBattle(h)
  await playAll(h.choreo, [
    { type: 'ConditionApplied', pkmUid: uids.squirtle, condition: 'confused', faces: [1, 2] },
    { type: 'DieRolled', purpose: 'gate', value: 2 },
  ])
  const announce = fmt(es.battleMsgGateAnnounce, { name: 'Squirtle', faces: '1-2' })
  const idxAnnounce = atStage(h.stages, (stage) => stage.message === announce)
  const idxGate = atStage(h.stages, (stage) => stage.diePurpose === 'gate')
  expect(idxAnnounce).toBeGreaterThanOrEqual(0)
  expect(idxGate).toBeGreaterThanOrEqual(0)
  expect(idxAnnounce).toBeLessThan(idxGate)
  const last = h.stages[h.stages.length - 1]
  expect(last?.diePurpose).toBe('gate')
  expect(last?.dieValue).toBe(2)
})

// AC: combate-legible/AC-3 - el turno de un rival confundido coreografía DOS
// tiradas separadas y explicadas: dado attackSelect con su valor → mensaje del
// gate → dado gate con su valor → mensaje del auto-golpe.
test('AC: combate-legible/AC-3 - turno del rival confundido: attackSelect → mensaje → gate, todo explicado', async () => {
  const h = createHarness()
  await startBattle(h)
  await playAll(h.choreo, [
    { type: 'ConditionApplied', pkmUid: uids.poliwag, condition: 'confused', faces: [1, 2, 3] },
    { type: 'DieRolled', purpose: 'attackSelect', value: 4 },
    { type: 'DieRolled', purpose: 'gate', value: 2 },
    { type: 'SelfHit', attacker: uids.poliwag, value: 2 },
    { type: 'AttackUsed', attacker: uids.poliwag, attackId: 'embestida', target: uids.poliwag },
    { type: 'DamageTaken', pkmUid: uids.poliwag, amount: 10, cause: 'attack' },
  ])
  const selectMsg = fmt(es.battleMsgDieAttackSelect, { name: 'Poliwag' })
  const announce = fmt(es.battleMsgGateAnnounce, { name: 'Poliwag', faces: '1-2-3' })
  const selfHitMsg = fmt(es.battleMsgSelfHit, { name: 'Poliwag', n: 2 })
  const idxSelectMsg = atStage(h.stages, (stage) => stage.message === selectMsg)
  const idxSelectDie = atStage(h.stages, (stage) => stage.diePurpose === 'attackSelect' && stage.dieValue === 4)
  const idxAnnounce = atStage(h.stages, (stage) => stage.message === announce)
  const idxGateDie = atStage(h.stages, (stage) => stage.diePurpose === 'gate' && stage.dieValue === 2)
  const idxSelfHit = atStage(h.stages, (stage) => stage.message === selfHitMsg)
  for (const index of [idxSelectMsg, idxSelectDie, idxAnnounce, idxGateDie, idxSelfHit]) {
    expect(index).toBeGreaterThanOrEqual(0)
  }
  expect(idxSelectMsg).toBeLessThan(idxSelectDie)
  expect(idxSelectDie).toBeLessThan(idxAnnounce) // mensaje del gate ENTRE ambas tiradas
  expect(idxAnnounce).toBeLessThan(idxGateDie)
  expect(idxGateDie).toBeLessThan(idxSelfHit)
  const last = h.stages[h.stages.length - 1]
  expect(last?.rival?.damage).toBe(10) // el auto-golpe se aplicó sobre el rival
})

// AC: combate-legible/AC-4 - ConditionApplied/ConditionCleared actualizan las
// conditions del actor en el stage: el rollGate aparece al aplicarse y sale al
// limpiarse, sin esperar un sendOut.
test('AC: combate-legible/AC-4 - las conditions del actor viven en el stage con los eventos', async () => {
  const h = createHarness()
  await startBattle(h)
  const appliedRun = h.choreo.play({
    type: 'ConditionApplied', pkmUid: uids.poliwag, condition: 'confused', faces: [1, 2, 3],
  })
  await vi.advanceTimersByTimeAsync(120_000)
  await appliedRun
  let rival = h.stages[h.stages.length - 1]?.rival
  expect(rival?.conditions?.rollGate).toEqual({
    failFaces: [1, 2, 3],
    outcome: 'selfHit',
    duration: 'nextTurn',
  })
  expect(statusViews(rival?.conditions).some((view) => view.kind === 'confused')).toBe(true)
  await playAll(h.choreo, [
    { type: 'ConditionApplied', pkmUid: uids.squirtle, condition: 'noAttackGate', faces: [4, 5] },
    { type: 'ConditionApplied', pkmUid: uids.squirtle, condition: 'skip' },
  ])
  const player = h.stages[h.stages.length - 1]?.player
  expect(player?.conditions?.rollGate?.outcome).toBe('noAttack')
  expect(player?.conditions?.skipNextAttack).toBe(true)
  await playAll(h.choreo, [
    { type: 'ConditionCleared', pkmUid: uids.poliwag, condition: 'confused' },
    { type: 'ConditionCleared', pkmUid: uids.squirtle, condition: 'skip' },
  ])
  rival = h.stages[h.stages.length - 1]?.rival
  expect(rival?.conditions?.rollGate).toBeUndefined()
  expect(h.stages[h.stages.length - 1]?.player?.conditions?.skipNextAttack).toBeUndefined()
})

// ── AC-5: guion REAL del motor (sin tocar packages/engine): el jugador con
// Abra confunde al rival, el turno del rival sale selfHit y más tarde el rival
//confunde al jugador; la placa propia marca "Conf" al empezar su turno. ──

const rngOf = (...faces: readonly number[]): Rng => {
  let i = 0
  return {
    d6: (): Face => {
      const value = faces[i]
      i += 1
      if (value === undefined || value < 1 || value > 6) {
        throw new Error(`rng guionado agotado en la tirada ${String(i)}`)
      }
      return value as Face
    },
    int: () => 0,
    snapshot: () => 0,
  }
}

const wildBoard = (): BoardGraph => ({
  meta: { id: 'confusion-test', status: 'VERIFIED' },
  gyms: {},
  nodes: [{ id: 'm1', type: 'deck', shape: 'round', x: 0, y: 0, deck: 'pantano' }],
  edges: [],
})

test('AC: combate-legible/AC-5 - guion real del motor: confunde → selfHit del rival → jugador confundido', async () => {
  // RNG guionado: attackSelect 4 (Confusión del rival) → gate 1 (falla: se
  // auto-ataca) → attackSelect 4 (el rival re-confunde al jugador al pasar el gate).
  const rng = rngOf(4, 1, 4)
  const started = newGame({ seed: 7, starterDeck: 'montana', ruleset: gameContent.ruleset }, gameContent)
  if (!started.ok) throw new Error(started.error.message)
  const base = started.value.state
  const abra: PkmInstance = {
    uid: parsePkmUid('p1-starter'),
    cardId: parseCardId('abra'),
    damage: 0,
    xp: 0,
    equipped: [{ id: parseCardId('element_psychic#9'), element: 'psychic' }],
    multicolor: [],
    fainted: false,
  }
  const state: GameState = {
    ...base,
    phase: 'tileResolution',
    stepsLeft: 0,
    decks: { ...base.decks, pantano: [parseCardId('abra')], item: [] },
    players: [{ ...base.players[0]!, position: parseNodeId('m1'), cameFrom: null, team: [abra] }],
  }
  const ctx: Ctx = { content: { ...gameContent, board: wildBoard() }, rng }
  const script: GameEvent[] = []
  const drawn = applyCommand(state, { type: 'Advance' }, ctx)
  if (!drawn.ok) throw new Error(drawn.error.message)
  const fight = applyCommand(drawn.value.state, { type: 'FightEncounter', pkmUid: 'p1-starter' }, ctx)
  if (!fight.ok) throw new Error(fight.error.message)
  script.push(...fight.value.events)
  const attack = applyCommand(fight.value.state, { type: 'Attack', attackId: 'Confusión' }, ctx)
  if (!attack.ok) throw new Error(attack.error.message)
  script.push(...attack.value.events)
  const advance = applyCommand(attack.value.state, { type: 'Advance' }, ctx)
  if (!advance.ok) throw new Error(advance.error.message)
  script.push(...advance.value.events)

  // El guion del motor tiene el arco completo (motor intacto: solo se consume).
  const kinds = script.map((event) => event.type)
  expect(kinds).toContain('SelfHit')
  expect(kinds).toContain('ConditionCleared')
  expect(script).toContainEqual({ type: 'ConditionApplied', pkmUid: 'p1-starter', condition: 'confused', faces: [1, 2] })

  // Coreografía sobre deps cableados al estado real (snapshot del encuentro).
  const rival = fight.value.state.battle!.rival[0]!
  const deps: BattleChoreoDeps = {
    cardOf: (cardId) => gameContent.cards.find((card) => card.id === cardId),
    actorOf: (uid) =>
      uid === abra.uid
        ? { uid: abra.uid, cardId: abra.cardId, damage: abra.damage, fainted: abra.fainted, pkm: abra }
        : undefined,
    rivalEntry: () => ({ uid: rival.uid, cardId: rival.cardId, damage: rival.damage, fainted: rival.fainted }),
  }
  const h = createHarness({ deps })
  for (const event of script) {
    const run = h.choreo.play(event)
    await vi.advanceTimersByTimeAsync(120_000)
    await run
  }
  const stages = h.stages

  // Cada paso del arco queda en orden legible: ataque propio → rival confundido
  // → dado attackSelect → anuncio del gate → dado gate → auto-golpe → limpiezas
  // → el rival confunde al jugador.
  const usedAt = atStage(stages, (stage) => stage.message === 'Abra usó Confusión.')
  const confusedAt = atStage(stages, (stage) => stage.message === fmt(es.battleMsgCondConfused, { name: 'Abra', faces: '1-2' }))
  const selectDieAt = atStage(stages, (stage) => stage.diePurpose === 'attackSelect' && stage.dieValue === 4)
  const announceAt = atStage(stages, (stage) => stage.message === fmt(es.battleMsgGateAnnounce, { name: 'Abra', faces: '1-2' }))
  const gateDieAt = atStage(stages, (stage) => stage.diePurpose === 'gate' && stage.dieValue === 1)
  const selfHitAt = atStage(stages, (stage) => stage.message === fmt(es.battleMsgSelfHit, { name: 'Abra', n: 1 }))
  const playerConfusedAt = atStage(stages, (stage) =>
    stage.message === fmt(es.battleMsgCondConfused, { name: 'Abra', faces: '1-2' }) && stage.player?.conditions?.rollGate?.outcome === 'selfHit',
  )
  for (const index of [usedAt, confusedAt, selectDieAt, announceAt, gateDieAt, selfHitAt, playerConfusedAt]) {
    expect(index).toBeGreaterThanOrEqual(0)
  }
  expect(usedAt).toBeLessThan(confusedAt)
  expect(confusedAt).toBeLessThan(selectDieAt)
  expect(selectDieAt).toBeLessThan(announceAt)
  expect(announceAt).toBeLessThan(gateDieAt)
  expect(gateDieAt).toBeLessThan(selfHitAt)
  expect(selfHitAt).toBeLessThan(playerConfusedAt)

  // Estado final: al comenzar el turno del jugador, su placa marca "Conf".
  const last = stages[stages.length - 1]
  expect(last?.player?.conditions?.rollGate?.outcome).toBe('selfHit')
  expect(last?.player?.damage).toBe(10) // Confusión del rival que pasó el gate
  expect(last?.rival?.damage).toBe(20) // ataque propio + auto-golpe
  const plate = renderToString(
    createElement(HpPlate, {
      name: 'Abra',
      hpMax: 50,
      damage: last?.player?.damage ?? 0,
      side: 'player' as const,
      statuses: statusViews(last?.player?.conditions),
    }),
  )
  expect(plate).toContain(`title="${es.battleStatusConfused}"`)
  expect(plate).toContain('Conf')
})
