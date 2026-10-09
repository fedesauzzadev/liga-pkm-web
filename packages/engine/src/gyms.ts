// Gimnasios (SPEC-C/T-023): desafío opcional al líder (D-17) y lookups de
// contenido. El 2v2, las medallas y los premios se resuelven en battle-core
// (afterFaints/finalize*); acá solo vive el arranque del duelo. Puro, sin DOM.
import type { Content, GymLeader, PokemonCard } from '@liga/content'
import { parseCardId, parsePkmUid } from '@liga/content'
import { boardIndexFor } from './board.ts'
import { activePlayer, illegal, teamPkmOf, type Draft } from './battle-core.ts'
import { EngineError } from './errors.ts'
import type { Result } from './errors.ts'
import type { GameEvent } from './events.ts'

function invalidContent(message: string): Result<never, EngineError> {
  return { ok: false, error: new EngineError('INVALID_CONTENT', message) }
}

/** Líder de gyms.json por key del gimnasio (undefined si no hay datos, AC-5). */
export function gymLeaderOf(content: Content, gymKey: string): GymLeader | undefined {
  return content.gyms.find((leader) => leader.id === gymKey)
}

/** Equipo del líder: cartas con `gym.leader` === gymKey, ordenadas por slot (SDD §4). */
export function gymTeamOf(content: Content, gymKey: string): readonly PokemonCard[] {
  return content.cards
    .filter((card) => card.gym?.leader === gymKey)
    .sort((a, b) => (a.gym?.slot ?? 0) - (b.gym?.slot ?? 0))
}

/** Medallas que exige el gimnasio (Giovanni: 7) según el tablero; undefined = libre. */
export function gymRequiresMedals(content: Content, gymKey: string): number | undefined {
  return content.board.gyms[gymKey]?.requiresMedals
}

/** ¿Se puede desafiar? (menú): datos presentes, sin cerrojo y medalla pendiente. */
export function gymChallengeable(content: Content, medals: readonly string[], gymKey: string): boolean {
  const requires = gymRequiresMedals(content, gymKey)
  if (requires !== undefined && medals.length < requires) return false
  if (medals.includes(gymKey)) return false // la medalla ya se ganó
  if (gymLeaderOf(content, gymKey) === undefined) return false
  return gymTeamOf(content, gymKey).length > 0
}

/**
 * `AcceptGymChallenge` (AC-1/AC-2): arranca el duelo contra los 2 PKM del líder.
 * El jugador es el retador y arranca atacando, salvo AGILIDAD en el 1er PKM (D-02).
 */
export function acceptGymChallenge(
  draft: Draft,
  content: Content,
  command: { readonly pkmUid: string },
): Result<readonly GameEvent[], EngineError> {
  if (draft.phase !== 'tileResolution' || draft.pending !== null) {
    return illegal('el desafío se acepta en la resolución del casillero, sin decisión pendiente')
  }
  const playerResult = activePlayer(draft)
  if (!playerResult.ok) return playerResult
  const player = playerResult.value
  let gymKey: string
  try {
    const node = boardIndexFor(content.board).node(player.position)
    if (node.type !== 'gym' || node.gym === undefined) {
      return illegal('AcceptGymChallenge solo en el casillero de gimnasio')
    }
    gymKey = node.gym
  } catch {
    return invalidContent(`posición "${player.position}" no está en el tablero`)
  }
  if (!gymChallengeable(content, player.medals, gymKey)) {
    const requires = gymRequiresMedals(content, gymKey)
    if (requires !== undefined && player.medals.length < requires) {
      return illegal(`el líder exige ${requires} medallas`)
    }
    if (player.medals.includes(gymKey)) return illegal('ya ganaste la medalla de este gimnasio')
    return invalidContent(`el gimnasio "${gymKey}" no tiene líder o equipo en el contenido`)
  }
  const leader = gymLeaderOf(content, gymKey)
  const team = gymTeamOf(content, gymKey)
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
    medal: content.board.gyms[gymKey]?.medal ?? gymKey,
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
    firstTurn: [pkm.value.uid],
    participants: [pkm.value.uid],
    won: false,
    noAttackThisTurn: false,
  }
  draft.pending = null
  draft.phase = 'battle'
  return {
    ok: true,
    value: [
      { type: 'BattleStarted', player: player.id, kind: 'gym', rival: gymKey, active: pkm.value.uid },
    ],
  }
}
