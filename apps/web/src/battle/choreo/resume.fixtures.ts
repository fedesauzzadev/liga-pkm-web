// Fixtures de reanudación (fix-combate-refresco): sesión restaurada real con
// batalla salvaje en curso (replay vía restoreSession) y deps de coreografía
// que resuelven actores desde un estado fijo. Solo para tests (patrón demo.ts).
import { parseCardId } from '@liga/content'
import {
  applyToSession,
  restoreSession,
  saveFromSession,
  startSession,
  type GameSession,
} from '../../game/session'
import { cardOf, contentHash, gameContent } from '../../game/content'
import type { BattleChoreoDeps } from './stage'
import type { GameState } from '@liga/engine'

function must<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly message: string } }): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

/** Sesión restaurada con batalla salvaje en curso (semilla 1, determinística):
 * Montaña/charmander → DebugEncounter(Abra) → pelear → un intercambio de golpes. */
export const restoredWildBattleSession = (): GameSession => {
  const montana = must(startSession({ seed: 1, starterDeck: 'montana' }, gameContent))
  const starter = montana.state.players[0]!.team[0]!.uid
  const drawn = must(
    applyToSession(montana, { type: 'DebugEncounter', deck: 'pantano', card: parseCardId('abra') }, gameContent),
  )
  const fight = must(
    applyToSession(drawn.session, { type: 'FightEncounter', pkmUid: starter }, gameContent),
  )
  const attacked = must(
    applyToSession(fight.session, { type: 'Attack', attackId: 'rasgunos' }, gameContent),
  )
  return must(restoreSession(saveFromSession(attacked.session, contentHash), gameContent)).session
}

/** Deps de coreografía que resuelven actores desde un estado fijo (mismo
 * criterio que los deps del popup: equipo propio o roster rival). */
export const fixedChoreoDeps = (state: GameState): BattleChoreoDeps => {
  const own = state.players.find((player) => player.id === state.activePlayerId)
  return {
    cardOf,
    actorOf: (uid) => {
      const pkm = own?.team.find((candidate) => candidate.uid === uid)
      if (pkm !== undefined) {
        return {
          uid,
          cardId: pkm.cardId,
          damage: pkm.damage,
          fainted: pkm.fainted,
          pkm,
          ...(state.battle?.conditions[uid] !== undefined
            ? { conditions: state.battle.conditions[uid] }
            : {}),
        }
      }
      const rival = state.battle?.rival.find((candidate) => candidate.uid === uid)
      return rival === undefined
        ? undefined
        : {
            uid,
            cardId: rival.cardId,
            damage: rival.damage,
            fainted: rival.fainted,
            ...(state.battle?.conditions[uid] !== undefined
              ? { conditions: state.battle.conditions[uid] }
              : {}),
          }
    },
    rivalEntry: () => undefined,
  }
}
