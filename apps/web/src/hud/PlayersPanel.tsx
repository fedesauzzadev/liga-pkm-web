// panel-players (SPEC-I/T-074/AC-3): fila por jugador con ficha de color; el
// activo resaltado; clic = elegir a quién ver (equipo y medallas; la mochila
// queda oculta, D-28). Con un jugador muestra 1 fila (AC-6, MVP).
import { medalSlots } from '../team/model'
import { es } from '../i18n/es'
import type { PlayerVm } from './model'
import styles from './hud.module.css'

export interface PlayersPanelProps {
  readonly players: readonly PlayerVm[]
  /** Jugador que se está viendo (default: el propio/activo, AC-3). */
  readonly viewedId: string
  readonly onView: (playerId: string) => void
}

export function PlayersPanel({ players, viewedId, onView }: PlayersPanelProps) {
  const viewed = players.find((player) => player.id === viewedId)
  return (
    <div className={styles.players} data-players-panel="true">
      <ul className={styles.playerList}>
        {players.map((player) => (
          <li key={player.id}>
            <button
              type="button"
              className={`${styles.playerRow} ${player.active ? styles.playerActive : ''}`}
              data-testid="players-row"
              data-player={player.id}
              data-active={player.active ? 'true' : 'false'}
              data-viewed={player.id === viewedId ? 'true' : 'false'}
              aria-pressed={player.id === viewedId}
              onClick={() => onView(player.id)}
            >
              <span className={styles.token} style={{ backgroundColor: player.color }} aria-hidden="true" />
              {player.label}
            </button>
          </li>
        ))}
      </ul>
      {viewed === undefined ? null : (
        <p className={styles.medalsLine} data-medals-count={viewed.medals.length}>
          {es.teamMedals}: {viewed.medals.length}/8
          {medalSlots(viewed.medals, 8).map((medal, index) => (
            <span
              key={index}
              className={`${styles.medalDot} ${medal === null ? styles.medalEmpty : ''}`}
              title={medal ?? undefined}
            >
              {medal === null ? '' : '★'}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}
