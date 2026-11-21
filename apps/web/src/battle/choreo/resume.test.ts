// fix-combate-refresco: snapshot puro de reanudación — la escena se reconstruye
// desde state.battle (el guion de eventos no se persiste): mismo punto, sin
// animaciones de entrada. Sesión wild real vía restoreSession (replay del log).
import { expect, test } from 'vitest'
import { parseCardId, parsePkmUid } from '@liga/content'
import { es } from '../../i18n/es'
import type { GameState } from '@liga/engine'
import { fixedChoreoDeps, restoredWildBattleSession } from './resume.fixtures'
import type { BattleStage } from './stage'
import { resumeStage } from './resume'

// AC: fix-combate-refresco/AC-1 - snapshot instantáneo desde state.battle:
// activos en escena con su daño actual, kind correcto y sin animaciones.
test('AC: fix-combate-refresco/AC-1 - resumeStage: wild restaurada, mismo punto, sin entrada', () => {
  const session = restoredWildBattleSession()
  const battle = session.state.battle
  if (battle === null) throw new Error('la sesión de prueba debería quedar en combate')
  const stage: BattleStage | null = resumeStage(session.state, fixedChoreoDeps(session.state))
  if (stage === null) throw new Error('resumeStage devolvió null con batalla viva')
  expect(stage.started).toBe(true)
  expect(stage.kind).toBe('wild')
  expect(stage.sweep).toBe(false)
  expect(stage.entrance).toEqual([])
  expect(stage.ended).toBeNull()
  expect(stage.message).toBe(es.battleMsgResume)
  const rival = battle.rival.find((candidate) => candidate.uid === battle.active[1]) ?? battle.rival[0]!
  const active = session.state.players[0]!.team.find((pkm) => pkm.uid === battle.active[0])!
  expect(stage.player?.uid).toBe(battle.active[0])
  expect(stage.player?.damage).toBe(active.damage)
  expect(stage.rival?.uid).toBe(rival.uid)
  expect(stage.rival?.damage).toBe(rival.damage)
  expect(stage.rival?.card.id).toBe(rival.cardId)
})

// AC: fix-combate-refresco/AC-1 - sin batalla viva no hay snapshot que armar.
test('AC: fix-combate-refresco/AC-1 - resumeStage sin batalla: null', () => {
  const session = restoredWildBattleSession()
  const idle: GameState = { ...session.state, battle: null }
  expect(resumeStage(idle, fixedChoreoDeps(idle))).toBeNull()
})

// AC: fix-combate-refresco/AC-3 - gimnasio: el líder queda en la zona rival
// mientras su primer PKM no cayó (al reponer se retira); el salvaje no tiene
// entrenador. Batalla de gimnasio armada a mano (presentación, no motor).
test('AC: fix-combate-refresco/AC-3 - gimnasio reanudado muestra al líder; salvaje no', () => {
  const base = restoredWildBattleSession()
  const wildStage = resumeStage(base.state, fixedChoreoDeps(base.state))
  expect(wildStage?.trainerAppeared).toBeNull()
  const gymBattle = {
    ...(base.state.battle!),
    kind: 'gym' as const,
    gym: 'celeste',
    medal: 'Cascada',
    prize: { from: 'isla' as const, count: 1 },
    trainerId: 'misty',
    rival: [
      { uid: parsePkmUid('rival-1'), cardId: parseCardId('poliwag'), damage: 0, fainted: false },
      { uid: parsePkmUid('rival-2'), cardId: parseCardId('squirtle'), damage: 0, fainted: false },
    ],
  }
  const gymState: GameState = { ...base.state, battle: gymBattle }
  const gymStage = resumeStage(gymState, fixedChoreoDeps(gymState))
  expect(gymStage?.kind).toBe('gym')
  expect(gymStage?.trainerAppeared).toBe('misty')
  // El primer PKM del líder cayó ⇒ el líder ya se retiró (RivalSentOut).
  const replaced: GameState = {
    ...gymState,
    battle: {
      ...gymBattle,
      rival: [
        { ...gymBattle.rival[0]!, fainted: true, damage: 999 },
        gymBattle.rival[1]!,
      ],
      active: [gymBattle.active[0], parsePkmUid('rival-2')] as const,
    },
  }
  expect(resumeStage(replaced, fixedChoreoDeps(replaced))?.trainerAppeared).toBeNull()
})

// AC: fix-combate-refresco/AC-4 - con el activo desmayado (ChooseReplacement)
// el actor propio queda en escena marcado como caído (la pestaña Cambiar la
// fuerza el popup a partir del pending).
test('AC: fix-combate-refresco/AC-4 - activo desmayado: en escena, caído', () => {
  const session = restoredWildBattleSession()
  const battle = session.state.battle!
  const faintedState: GameState = {
    ...session.state,
    pending: { type: 'ChooseReplacement', options: [] },
    players: session.state.players.map((player) => ({
      ...player,
      team: player.team.map((pkm) =>
        pkm.uid === battle.active[0] ? { ...pkm, fainted: true, damage: 999 } : pkm,
      ),
    })),
  }
  const stage = resumeStage(faintedState, fixedChoreoDeps(faintedState))
  expect(stage?.player?.uid).toBe(battle.active[0])
  expect(stage?.player?.fainted).toBe(true)
})
