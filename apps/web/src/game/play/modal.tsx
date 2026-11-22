// Capa modal de PlayScreen (N-0022): evolución + ventana de carta, extraída.
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { Command, PlayerState } from '@liga/engine'
import { spriteUrl, type useSprites } from '../../battle/sprites'
import { CardModal } from '../../cardmodal/CardModal'
import type { cardModalActions, cardModalSpec, CardModalTarget } from '../../cardmodal/model'
import { EvolveOverlay, type EvolveShow } from '../../events/EvolveOverlay'
import type { PlaybackSpeed } from '../../events/anim.config'
import { freeMulticolor } from '../../team/model'

export interface ModalArgs {
  readonly evolveShow: ({ readonly nonce: number } & EvolveShow) | null
  readonly speed: PlaybackSpeed
  readonly reducedMotion: boolean
  readonly cardModalSpecValue: ReturnType<typeof cardModalSpec>
  readonly cardModalActionsValue: ReturnType<typeof cardModalActions> | null
  readonly sprites: ReturnType<typeof useSprites>
  readonly viewed: PlayerState | undefined
  readonly send: (command: Command) => boolean
  readonly setEvolveShow: Dispatch<SetStateAction<({ readonly nonce: number } & EvolveShow) | null>>
  readonly setCardModal: Dispatch<SetStateAction<CardModalTarget | null>>
}

export function renderModal(a: ModalArgs): ReactNode {
  const {
    evolveShow, speed, reducedMotion, cardModalSpecValue, cardModalActionsValue, sprites,
    viewed, send, setEvolveShow, setCardModal,
  } = a
  return (
        <>
          {evolveShow !== null ? (
            <EvolveOverlay
              key={evolveShow.nonce}
              fromUrl={evolveShow.fromUrl}
              fromName={evolveShow.fromName}
              toUrl={evolveShow.toUrl}
              toName={evolveShow.toName}
              speed={speed}
              reducedMotion={reducedMotion}
              onDone={() => setEvolveShow(null)}
            />
          ) : null}
          {cardModalSpecValue !== null && cardModalActionsValue !== null ? (
            <CardModal
              spec={cardModalSpecValue}
              actions={cardModalActionsValue}
              artUrl={spriteUrl(sprites.sprites ?? null, cardModalSpecValue.card.dex, 'front')}
              itemCounts={{
                potion: viewed?.items.potion ?? 0,
                super_potion: viewed?.items.super_potion ?? 0,
              }}
              multicolorFree={viewed === undefined ? 0 : freeMulticolor(viewed)}
              onCommand={send}
              onClose={() => setCardModal(null)}
            />
          ) : null}
        </>
  )
}
