// Reanudación de combate tras restore (fix-combate-refresco): el guion de
// eventos no se persiste (estado de React), así que la escena se reconstruye
// desde el estado ya guardado (state.battle): snapshot instantáneo, sin
// animaciones de entrada ("mismo punto"). Solo presentación — no toca el motor
// ni el formato del save.
import type { GameState } from '@liga/engine'
import { es } from '../../i18n/es'
import { createStage, toStageActor, type BattleChoreoDeps, type BattleStage, type StageActor } from './stage'

/** Actor resuelto por uid desde el estado real (equipo propio o rival). */
const actorOrNull = (deps: BattleChoreoDeps, uid: string): StageActor | null => {
  const input = deps.actorOf(uid)
  return input === undefined ? null : toStageActor(deps, input)
}

/**
 * Snapshot de reanudación derivado de `state.battle` (AC-1): activo del jugador
 * y rival en escena con su daño actual, kind correcto y estado instantáneo.
 * Devuelve null sin batalla viva (nada que reanudar).
 */
export function resumeStage(state: GameState, deps: BattleChoreoDeps): BattleStage | null {
  const battle = state.battle
  if (battle === null) return null
  const player = actorOrNull(deps, battle.active[0])
  // El rival en escena es el activo; defensivo: si cayera (un comando no lo
  // deja así), el primer rival sano.
  const activeRival = battle.rival.find((candidate) => candidate.uid === battle.active[1])
  const rivalBase =
    activeRival !== undefined && !activeRival.fainted
      ? activeRival
      : (battle.rival.find((candidate) => !candidate.fainted) ?? activeRival)
  const rival = rivalBase === undefined ? null : actorOrNull(deps, rivalBase.uid)
  // AC-3 (ER-001/T-112): el líder está en escena mientras su primer PKM no
  // cayó (al reponer, RivalSentOut lo retira); el salvaje no tiene entrenador.
  const firstAlive = battle.rival[0] !== undefined && !battle.rival[0].fainted
  const trainerAppeared =
    battle.kind === 'gym' && firstAlive && battle.trainerId !== null ? battle.trainerId : null
  return {
    ...createStage(),
    started: true,
    kind: battle.kind,
    player,
    rival,
    trainerId: battle.trainerId,
    ...(trainerAppeared !== null ? { trainerAppeared } : {}),
    actingSide: battle.turnSide === 0 ? 'player' : 'rival',
    message: es.battleMsgResume,
  }
}
