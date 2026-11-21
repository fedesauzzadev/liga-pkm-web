// Popups de carta robada y encuentro de PlayScreen (N-0022): JSX extraído.
import type { ReactNode } from 'react'
import type { Command, PlayerState } from '@liga/engine'
import type { DeckKey } from '@liga/content'
import type { DrawSpec } from '../../board/Board'
import { spriteUrl, type useSprites } from '../../battle/sprites'
import { es } from '../../i18n/es'
import { CardPopup } from '../../popup/CardPopup'
import { EncounterPopup, type EncounterFightOption } from '../../popup/EncounterPopup'
import { shellPanels } from '../../shell/layout'
import { cardOf } from '../content'
import type { GameSession } from '../session'

type Encounter = Extract<NonNullable<GameSession['state']['pending']>, { readonly type: 'FightOrRelease' }>

export function renderCardPopup(
  draw: DrawSpec | null,
  cardPopupOpen: boolean,
  encounter: Encounter | null,
  setCardPopupOpen: (open: boolean) => void,
): ReactNode {
  return (
      draw !== null && cardPopupOpen && encounter === null ? (
        <CardPopup
          draw={draw}
          autoDismissMs={shellPanels.cardPopup.autoDismissMs ?? 2500}
          onOpenChange={setCardPopupOpen}
        />
      ) : null
  )
}

export function renderEncounterPopup(
  encounter: Encounter | null,
  player: PlayerState | undefined,
  encounterOptions: readonly EncounterFightOption[],
  sprites: ReturnType<typeof useSprites>,
  send: (command: Command) => boolean,
): ReactNode {
  return (
      encounter !== null && player !== undefined && cardOf(encounter.card) !== undefined ? (
        <EncounterPopup
          card={cardOf(encounter.card)!}
          deckName={es.tileDeckNames[encounter.deck as DeckKey]}
          options={encounterOptions}
          artUrl={spriteUrl(sprites?.sprites ?? null, cardOf(encounter.card)!.dex, 'front')}
          onCommand={send}
        />
      ) : null
  )
}
