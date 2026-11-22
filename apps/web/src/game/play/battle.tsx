// Popup de combate / Reserva de Oak de PlayScreen (N-0022): JSX extraído.
import type { ComponentProps, Dispatch, MutableRefObject, ReactNode, SetStateAction } from 'react'
import type { Command, PlayerState } from '@liga/engine'
import type { PkmInstance } from '@liga/engine'
import type { useBadges } from '../../battle/sprites'
import { OakReserve } from '../../hud/OakReserve'
import { oakPairs } from '../../hud/model'
import { BattlePopup } from '../../popup/BattlePopup'
import { battleScriptAfterContinue, battleShouldAutoClose, battleViewAfterScriptDone } from '../../popup/model'
import type { CardModalTarget } from '../../cardmodal/model'
import type { GameEvent } from '@liga/engine'
import { cardOf } from '../content'
import type { GameSession } from '../session'

export interface BattleSlotArgs {
  readonly battleKind: 'oak' | 'battle' | null
  readonly player: PlayerState | undefined
  readonly oakPileNames: readonly { readonly uid: string; readonly name: string }[]
  readonly state: GameSession['state']
  readonly legal: ComponentProps<typeof BattlePopup>['legal']
  readonly battleScript: readonly GameEvent[]
  readonly battleView: GameSession | null
  readonly speed: ComponentProps<typeof BattlePopup>['speed']
  readonly reducedMotion: boolean
  readonly viewingOwn: boolean
  readonly battleExpanded: boolean
  readonly badges: ReturnType<typeof useBadges>
  readonly battleResultDismissed: boolean
  readonly sessionRef: MutableRefObject<GameSession>
  readonly send: (command: Command) => boolean
  readonly setCardModal: Dispatch<SetStateAction<CardModalTarget | null>>
  readonly setOakOpen: Dispatch<SetStateAction<boolean>>
  readonly setBattleExpanded: Dispatch<SetStateAction<boolean>>
  readonly setBattleScript: Dispatch<SetStateAction<readonly GameEvent[]>>
  readonly setBattleView: Dispatch<SetStateAction<GameSession | null>>
  readonly setBattleResultDismissed: Dispatch<SetStateAction<boolean>>
}

export function renderBattlePopup(a: BattleSlotArgs): ReactNode {
  const {
    battleKind, player, oakPileNames, state, legal, battleScript, battleView, speed,
    reducedMotion, viewingOwn, battleExpanded, badges, battleResultDismissed, sessionRef, send,
    setCardModal, setOakOpen, setBattleExpanded, setBattleScript, setBattleView,
    setBattleResultDismissed,
  } = a
  return (
        battleKind === 'oak' && player !== undefined ? (
          <OakReserve
            pile={oakPileNames}
            team={player.team.map((pkm: PkmInstance) => ({
              uid: pkm.uid,
              name: cardOf(pkm.cardId)?.name ?? String(pkm.cardId),
            }))}
            canSwap={state.pending?.type === 'OakSwap'}
            pairs={oakPairs(player.team, player.oakPile)}
            onInspect={(uid) => setCardModal({ source: 'oak', uid })}
            onCommand={send}
            onClose={() => setOakOpen(false)}
          />
        ) : battleKind === 'battle' ? (
          <BattlePopup
            state={state}
            legal={legal}
            script={battleScript}
            viewState={battleView === null ? null : battleView.state}
            speed={speed}
            reducedMotion={reducedMotion}
            viewingOwn={viewingOwn}
            expanded={battleExpanded}
            onExpandToggle={() => setBattleExpanded((open) => !open)}
            badges={badges}
            onInspectRival={() => setCardModal({ source: 'rival' })}
            onCommand={send}
            resultDismissed={battleResultDismissed}
            onContinue={() => {
              // fin-de-combate/AC-4: con captura pendiente el guion sobrevive:
              // la escena queda congelada y la decisión vive en el pie del
              // popup (captura-en-popup-combate). Sin captura pendiente se
              // limpia como en T-108.
              if (battleScriptAfterContinue(state.pending) === 'keep') {
                setBattleResultDismissed(true)
                return
              }
              setBattleScript([])
              setBattleResultDismissed(false)
              // sync-estado-combate: sin guion no hay prefijo que retener.
              setBattleView(null)
            }}
            onScriptDone={() => {
              // sync-estado-combate/AC-3: el guion terminó de reproducirse ⇒
              // la presentación pasa al estado final del motor (sin drift).
              const view = battleViewAfterScriptDone(battleScript.length > 0, sessionRef.current.state)
              setBattleView(view === null ? null : { ...sessionRef.current, state: view })
              // fin-de-combate/AC-5: la coreografía de captura terminó (cola
              // reproducida) y el motor ya resolvió ⇒ auto-cierre, sin clic extra.
              if (battleShouldAutoClose(state, battleResultDismissed, battleScript.length > 0)) {
                setBattleScript([])
                setBattleResultDismissed(false)
                setBattleView(null)
              }
            }}
          />
        ) : null
  )
}
