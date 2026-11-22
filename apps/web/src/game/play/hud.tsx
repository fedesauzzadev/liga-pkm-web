// Paneles del HUD de PlayScreen (N-0022): mismo JSX que antes, extraído.
import type { Dispatch, SetStateAction } from 'react'
import type { Command, PlayerState } from '@liga/engine'
import { TeamStrip } from '../../hud/TeamStrip'
import { TurnPanel } from '../../hud/TurnPanel'
import { HistoryPanel, type HistoryFilter } from '../../hud/HistoryPanel'
import type { HistoryEntry } from '../../hud/history'
import { DicePanel, type DiceRoll } from '../../hud/DicePanel'
import { BackpackHud } from '../../hud/BackpackHud'
import { PlayersPanel } from '../../hud/PlayersPanel'
import { resolveDrop } from '../../hud/backpack'
import { carryOf } from '../../hud/carry'
import { canAdvance, canReorder, canRoll, playerLabel, playersVm } from '../../hud/model'
import { es } from '../../i18n/es'
import type { CardModalTarget } from '../../cardmodal/model'
import type { PlaybackSpeed } from '../../events/anim.config'
import type { ShellHud } from '../../shell/GameShell'
import type { useSprites } from '../../battle/sprites'
import { cardOf } from '../content'
import type { GameSession } from '../session'

export interface HudArgs {
  readonly state: GameSession['state']
  readonly player: PlayerState | undefined
  readonly viewed: PlayerState | undefined
  readonly viewingOwn: boolean
  readonly diceRolls: readonly DiceRoll[]
  readonly speed: PlaybackSpeed
  readonly reducedMotion: boolean
  readonly sprites: ReturnType<typeof useSprites>
  readonly teamSlots: number
  readonly activeIndex: number
  readonly history: readonly HistoryEntry[]
  readonly historyFilter: HistoryFilter
  readonly historyCollapsed: readonly number[]
  readonly send: (command: Command) => boolean
  readonly setCardModal: Dispatch<SetStateAction<CardModalTarget | null>>
  readonly setViewPlayerId: Dispatch<SetStateAction<string | null>>
  readonly setHistoryFilter: Dispatch<SetStateAction<HistoryFilter>>
  readonly setHistoryCollapsed: Dispatch<SetStateAction<readonly number[]>>
}

export function buildHud(a: HudArgs): ShellHud {
  const {
    state, player, viewed, viewingOwn, diceRolls, speed, reducedMotion, sprites, teamSlots,
    activeIndex, history, historyFilter, historyCollapsed, send, setCardModal,
    setViewPlayerId, setHistoryFilter, setHistoryCollapsed,
  } = a
  return {
        // T-092/AC-2: panel-dice con dado + quién + propósito + valor + historial.
        // dado-clicable/AC-1,AC-3: el dado también tira (mismo send que btn-roll).
        dice: (
          <DicePanel
            rolls={diceRolls}
            speed={speed}
            reducedMotion={reducedMotion}
            canRoll={canRoll(state)}
            onRoll={() => send({ type: 'RollMove' })}
          />
        ),
        turn: (
          <TurnPanel
            turn={state.turn}
            playerLabel={playerLabel(activeIndex)}
            phaseLabel={es.phaseNames[state.phase]}
            canRoll={canRoll(state)}
            canAdvance={canAdvance(state)}
            onRoll={() => send({ type: 'RollMove' })}
            onAdvance={() => send({ type: 'Advance' })}
          />
        ),
        team:
          viewed === undefined ? null : (
            <TeamStrip
              player={viewed}
              cardOf={cardOf}
              sprites={sprites.sprites ?? null}
              battle={state.battle}
              slots={teamSlots}
              reorderable={canReorder(state, viewed.id)}
              chipDraggable={canReorder(state, viewed.id)}
              resolveCarry={(payload, target) => resolveDrop(payload, target, state, cardOf).ok}
              onSelect={(uid) => {
                // T-073/AC-4: con una carta seleccionada, tocar el slot la aplica.
                const { carried, tapTarget } = carryOf()
                if (carried !== null) {
                  tapTarget({ kind: 'pkm', uid })
                  return
                }
                // SPEC-R/T-103: el slot abre la ventana de carta grande.
                setCardModal({ source: 'team', uid })
              }}
              onReorder={(uid, to) => send({ type: 'ReorderTeam', uid, to })}
            />
          ),
        players: (
          <PlayersPanel
            players={playersVm(state)}
            viewedId={viewed?.id ?? ''}
            onView={setViewPlayerId}
          />
        ),
        history: (
          <HistoryPanel
            entries={history}
            myPlayerId={state.players[0]?.id ?? null}
            filter={historyFilter}
            onFilterChange={setHistoryFilter}
            collapsed={historyCollapsed}
            onToggleGroup={(key) =>
              setHistoryCollapsed((prev) =>
                prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
              )
            }
          />
        ),
        // T-073: mochila del jugador propio (la ajena queda oculta, D-28).
        backpack:
          player === undefined ? null : (
            <BackpackHud
              player={player}
              state={state}
              cardOf={cardOf}
              viewingOwn={viewingOwn}
              send={send}
            />
          ),
  }
}
