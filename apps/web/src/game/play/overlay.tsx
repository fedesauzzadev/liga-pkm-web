// Overlay legacy de PlayScreen (N-0022): panel de casillero, ficha y avisos.
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { Command } from '@liga/engine'
import { es } from '../../i18n/es'
import { TilePanel, tileTitle, type TilePanelPlayer, type TilePending } from '../TilePanel'
import styles from '../game.module.css'

export interface OverlayArgs {
  readonly saveNote: boolean
  readonly detail: ReactNode
  readonly tilePanelOpen: boolean
  readonly node: Parameters<typeof tileTitle>[0]
  readonly gymLeader: string | null
  readonly tileDismissed: boolean
  readonly tileMessages: readonly string[]
  readonly tilePending: TilePending
  readonly tilePlayer: TilePanelPlayer | null
  readonly error: string | null
  readonly isPlaying: boolean
  readonly send: (command: Command) => boolean
  readonly setShowTeam: Dispatch<SetStateAction<boolean>>
  readonly setTileDismissed: Dispatch<SetStateAction<boolean>>
}

export function renderOverlay(a: OverlayArgs): ReactNode {
  const {
    saveNote, detail, tilePanelOpen, node, gymLeader, tileDismissed, tileMessages, tilePending,
    tilePlayer, error, isPlaying, send, setShowTeam, setTileDismissed,
  } = a
  return (
        <div className={styles.legacy}>
          <section className={styles.screen} aria-label={es.playTurn}>
            {saveNote ? <span className={styles.note} data-testid="save-note">{es.shellMenuSave}</span> : null}
            {detail !== null ? (
              <div className={styles.detailBar}>
                <button
                  type="button"
                  className={styles.detailClose}
                  data-testid="btn-team-close"
                  onClick={() => setShowTeam(false)}
                >
                  {es.shellTipClose}
                </button>
                {detail}
              </div>
            ) : null}
            {tilePanelOpen ? (
              <TilePanel
                title={tileTitle(node, gymLeader)}
                messages={tileDismissed ? [] : tileMessages}
                pending={tilePending}
                player={tilePlayer}
                onCommand={send}
                onClose={() => setTileDismissed(true)}
              />
            ) : null}
            {error !== null ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            {isPlaying ? <p className={styles.note}>{es.playReproducing}</p> : null}
          </section>
        </div>
  )
}
