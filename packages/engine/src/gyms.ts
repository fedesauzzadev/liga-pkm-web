// Gimnasios (SPEC-C/T-023): desafío opcional al líder (D-17) y arranque del
// duelo. El 2v2, las medallas y los premios se resuelven en battle-core
// (afterFaints/finalize*); los lookups puros de contenido viven en gyms-data.ts
// (T-061: tiles.ts los usa sin crear ciclos). Puro, sin DOM.
import { parseCardId, parsePkmUid } from '@liga/content'
import { boardIndexFor } from './board.ts'
import { runRivalTurn, emitTrainerAppeared } from './battle.ts'
import { activePlayer, illegal, teamPkmOf, type Draft } from './battle-core.ts'
import { EngineError } from './errors.ts'
import type { Result } from './errors.ts'
import type { GameEvent } from './events.ts'
import type { Ctx } from './engine.ts'
import { gymChallengeable, gymLeaderOf, gymRequiresMedals, gymTeamOf } from './gyms-data.ts'

export { gymChallengeable, gymLeaderOf, gymRequiresMedals, gymTeamOf } from './gyms-data.ts'

function invalidContent(message: string): Result<never, EngineError> {
  return { ok: false, error: new EngineError('INVALID_CONTENT', message) }
}

/**
 * `AcceptGymChallenge` (AC-1/AC-2): arranca el duelo contra los 2 PKM del líder.
 * El jugador es el retador y arranca atacando, salvo AGILIDAD en el 1er PKM (D-02);
 * con AGILIDAD el turno inicial del rival corre en este mismo comando.
 */
export function acceptGymChallenge(
  draft: Draft,
  ctx: Ctx,
  command: { readonly pkmUid: string },
): Result<readonly GameEvent[], EngineError> {
  // T-061: el pending ChallengeGym lo deja resolveTile (decisión opcional).
  if (draft.phase !== 'tileResolution' || draft.pending?.type !== 'ChallengeGym') {
    return illegal('el desafío se acepta con una decisión ChallengeGym pendiente')
  }
  const playerResult = activePlayer(draft)
  if (!playerResult.ok) return playerResult
  const player = playerResult.value
  let gymKey: string
  try {
    const node = boardIndexFor(ctx.content.board).node(player.position)
    if (node.type !== 'gym' || node.gym === undefined) {
      return illegal('AcceptGymChallenge solo en el casillero de gimnasio')
    }
    gymKey = node.gym
  } catch {
    return invalidContent(`posición "${player.position}" no está en el tablero`)
  }
  if (!gymChallengeable(ctx.content, player.medals, gymKey)) {
    const requires = gymRequiresMedals(ctx.content, gymKey)
    if (requires !== undefined && player.medals.length < requires) {
      return illegal(`el líder exige ${requires} medallas`)
    }
    if (player.medals.includes(gymKey)) return illegal('ya ganaste la medalla de este gimnasio')
    return invalidContent(`el gimnasio "${gymKey}" no tiene líder o equipo en el contenido`)
  }
  const leader = gymLeaderOf(ctx.content, gymKey)
  const team = gymTeamOf(ctx.content, gymKey)
  if (leader === undefined || team.length === 0) {
    return invalidContent(`el gimnasio "${gymKey}" no tiene líder o equipo en el contenido`)
  }
  const pkm = teamPkmOf(player, command.pkmUid)
  if (!pkm.ok) return pkm
  if (pkm.value.fainted) return illegal('solo un PKM sano puede pelear (D-08)')
  // AGILIDAD del 1er PKM del líder: el rival arranca atacando (D-02).
  const rivalStarts = team[0]!.specialties.some((effect) => effect.op === 'startsFirst')
  draft.battle = {
    kind: 'gym',
    gym: gymKey,
    medal: leader.medal,
    prize: leader.prize,
    lostCount: 0,
    rival: team.map((card, index) => ({
      uid: parsePkmUid(`rival-${index + 1}`),
      cardId: parseCardId(card.id),
      damage: 0,
      fainted: false,
    })),
    active: [pkm.value.uid, parsePkmUid('rival-1')],
    turnSide: rivalStarts ? 1 : 0,
    conditions: {},
    trainerId: leader.id,
    firstTurn: [pkm.value.uid],
    participants: [pkm.value.uid],
    won: false,
    noAttackThisTurn: false,
    actedThisTurn: false, // retirada-solo-inicio-turno (D-32)
  }
  draft.pending = null
  draft.phase = 'battle'
  const events: GameEvent[] = [
    emitTrainerAppeared(leader.id),
    { type: 'BattleStarted', player: player.id, kind: 'gym', rival: gymKey, active: pkm.value.uid },
  ]
  // AGILIDAD (D-02): el turno inicial del líder corre en este mismo comando.
  const rivalTurn = runRivalTurn(draft, ctx, events)
  if (!rivalTurn.ok) return rivalTurn
  return { ok: true, value: events }
}
