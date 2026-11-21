// Fixture demo del equipo (SPEC-D/T-033): reusa el Content canónico de la app
// (game/content, T-034) + partida sembrada para que la vista tenga contenido.
// Vive en el chunk lazy (como el demo de combate); las acciones pasan todas por
// applyCommand (la siembra no es lógica de juego).
import { parseCardId, parsePkmUid } from '@liga/content'
import { newGame, type GameState, type PokemonCard } from '@liga/engine'
import { cardOf, gameContent } from '../game/content'

export const demoContent = gameContent
export const demoCardOf = (cardId: string): PokemonCard | undefined => cardOf(cardId)

/**
 * Partida de demo: `newGame` real (inicial isla) + siembra mínima (elementos
 * sueltos, poción, una medalla y un PKM en la pila de Oak). El estado sembrado
 * respeta las invariantes del motor (uids e ids únicos, pila sana).
 */
export function createDemoGame(seed: number): GameState | null {
  const started = newGame({ seed, starterDeck: 'isla', ruleset: demoContent.ruleset }, demoContent)
  if (!started.ok) return null
  const state = started.value.state
  const medal = Object.values(demoContent.board.gyms)[0]?.medal
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      elements: [
        { id: parseCardId('element_fire#1'), element: 'fire' },
        { id: parseCardId('element_water#2'), element: 'water' },
      ],
      items: { ...player.items, potion: 1 },
      medals: medal === undefined ? [] : [medal],
      oakPile: [
        {
          uid: parsePkmUid('p1-oak-1'),
          cardId: parseCardId('poliwag'),
          damage: 0,
          xp: 0,
          equipped: [],
          multicolor: [],
          fainted: false,
        },
      ],
    })),
  }
}
