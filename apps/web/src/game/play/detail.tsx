// Ficha de la carta (CardDetail) de PlayScreen (N-0022): extraída.
import type { ReactNode } from 'react'
import type { Command, PlayerState } from '@liga/engine'
import { CardSheet } from '../../team/CardSheet'
import { TeamPanel } from '../../team/TeamPanel'
import { cardOf } from '../content'
import type { GameSession } from '../session'

export function renderTeamDetail(
  showTeam: boolean,
  viewed: PlayerState | undefined,
  viewingOwn: boolean,
  state: GameSession['state'],
  send: (command: Command) => boolean,
): ReactNode {
  if (!showTeam || viewed === undefined) return null
  if (viewingOwn) {
    return (
      <TeamPanel
        player={viewed}
        cardOf={cardOf}
        teamLimit={state.ruleset?.teamLimit ?? 6}
        canEdit={state.phase === 'organize'}
        onCommand={send}
      />
    )
  }
  const target = viewed.team[0]
  const card = target === undefined ? undefined : cardOf(target.cardId)
  if (target === undefined || card === undefined) return null
  return (
    <CardSheet
      card={card}
      pkm={target}
      editable={false}
      equipOptions={[]}
      multicolorOptions={[]}
      evolveOptions={[]}
      onCommand={() => undefined}
    />
  )
}
