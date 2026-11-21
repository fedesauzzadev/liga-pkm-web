// Reserva del Prof. Oak (SPEC-I/T-074/AC-2): se abre con btn-oak en el área del
// popup de combate. Solo lectura (la pila de Oak); si el jugador está en el
// casillero Oak en su turno (pending OakSwap) aparecen los botones de
// intercambio con cada slot del equipo (D-27).
import type { Command } from '@liga/engine'
import { es } from '../i18n/es'
import type { OakPair } from './model'
import styles from './hud.module.css'

export interface OakReserveProps {
  /** PKM de la pila: uid + nombre de carta. */
  readonly pile: readonly { readonly uid: string; readonly name: string }[]
  /** Equipo del jugador activo: uid + nombre (destino del intercambio). */
  readonly team: readonly { readonly uid: string; readonly name: string }[]
  /** true cuando el motor ofrece el intercambio (pending OakSwap, D-27). */
  readonly canSwap: boolean
  readonly pairs: readonly OakPair[]
  /** SPEC-R/T-103/AC-1: abrir la ventana de carta de ese PKM de la pila. */
  readonly onInspect?: (uid: string) => void
  readonly onCommand: (command: Command) => void
  readonly onClose: () => void
}

export function OakReserve({ pile, team, canSwap, pairs, onInspect, onCommand, onClose }: OakReserveProps) {
  return (
    <div className={styles.oak} data-oak-reserve="true">
      <header className={styles.oakHeader}>
        <h3 className={styles.oakTitle}>{es.oakReserveTitle}</h3>
        <button
          type="button"
          className={styles.actionButton}
          data-testid="btn-oak-close"
          onClick={onClose}
        >
          {es.shellTipClose}
        </button>
      </header>
      {pile.length === 0 ? (
        <p className={styles.oakHint}>{es.teamOakEmpty}</p>
      ) : (
        <ul className={styles.oakList}>
          {pile.map((pkm) => (
            <li key={pkm.uid} className={styles.oakRow} data-pile-uid={pkm.uid}>
              {onInspect === undefined ? (
                <span className={styles.oakName}>{pkm.name}</span>
              ) : (
                <button
                  type="button"
                  className={styles.oakNameButton}
                  data-testid="oak-pkm-open"
                  data-uid={pkm.uid}
                  onClick={() => onInspect(pkm.uid)}
                >
                  {pkm.name}
                </button>
              )}
              {canSwap ? (
                <span className={styles.oakSwaps}>
                  {team.map((teamPkm) => {
                    const legal = pairs.some(
                      (pair) => pair.teamUid === teamPkm.uid && pair.pileUid === pkm.uid,
                    )
                    return legal ? (
                      <button
                        key={teamPkm.uid}
                        type="button"
                        className={styles.actionButton}
                        data-testid="btn-oak-swap"
                        data-command="SwapWithOak"
                        data-team-uid={teamPkm.uid}
                        data-pile-uid={pkm.uid}
                        onClick={() =>
                          onCommand({ type: 'SwapWithOak', teamUid: teamPkm.uid, pileUid: pkm.uid })
                        }
                      >
                        {es.tileSwapPair
                          .replace('{team}', teamPkm.name)
                          .replace('{pile}', pkm.name)}
                      </button>
                    ) : null
                  })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {!canSwap ? <p className={styles.oakHint}>{es.oakReserveReadOnly}</p> : null}
    </div>
  )
}
