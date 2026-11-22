// Mundo del tablero de PlayScreen (N-0022): JSX de BoardHost extraído.
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { Command, PlayerState } from '@liga/engine'
import { BoardHost, type BoardMode } from '../../board/BoardHost'
import type { BoardTokenSpec, DrawSpec, PendingDecision } from '../../board/Board'
import type { DieValue } from '../../board/Die3D'
import type { PlaybackSpeed } from '../../events/anim.config'
import type { GameSession } from '../session'

export interface WorldArgs {
  readonly boardMode: BoardMode
  readonly player: PlayerState | undefined
  readonly state: GameSession['state']
  readonly pending: PendingDecision
  readonly tokens: readonly BoardTokenSpec[]
  readonly move: { readonly path: readonly string[]; readonly nonce: number } | null
  readonly speed: PlaybackSpeed
  readonly reducedMotion: boolean
  readonly draw: DrawSpec | null
  readonly deckCounts: Readonly<Record<string, number>>
  readonly moveHint: DieValue | null
  readonly turnEnd: number
  readonly send: (command: Command) => boolean
  readonly setMove: Dispatch<SetStateAction<{ readonly path: readonly string[]; readonly nonce: number } | null>>
  readonly revealBoard: () => void
}

export function renderWorld(a: WorldArgs): ReactNode {
  const {
    boardMode, player, state, pending, tokens, move, speed, reducedMotion, draw, deckCounts,
    moveHint, turnEnd, send, setMove, revealBoard,
  } = a
  return (
            player === undefined ? null : (
              <BoardHost
                boardMode={boardMode}
                position={player.position}
                cameFrom={player.cameFrom}
                pending={pending}
                tokens={tokens}
                activeTokenId={state.activePlayerId}
                myTokenId={state.players[0]?.id ?? null}
                movePath={move?.path ?? null}
                moveNonce={move?.nonce ?? 0}
                onMoveDone={() => setMove(null)}
                speed={speed}
                reducedMotion={reducedMotion}
                draw={draw}
                deckCounts={deckCounts}
                onChoosePath={(to) => send({ type: 'ChoosePath', to })}
                onStopHere={() => send({ type: 'StopHere' })}
                onContinueMoving={() => send({ type: 'ContinueMoving' })}
                // T-092: el dado vive en panel-dice; el tablero solo el aviso de movimiento.
                moveHintValue={moveHint}
                turnEndNonce={turnEnd}
                battleActive={state.battle !== null}
                onReady={revealBoard}
              />
            )
  )
}
