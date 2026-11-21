// panel-turn (SPEC-I/T-074/AC-4): "Turno de {nombre}" + número de turno y, si
// es tu turno y podés tirar, el botón grande "Tirar dado" (btn-roll). Tirar
// dispara la secuencia de cámara de T-076 (el RollMove ya cablea dieNonce).
import { es } from '../i18n/es'
import styles from './hud.module.css'

export interface TurnPanelProps {
  readonly turn: number
  readonly playerLabel: string
  readonly phaseLabel: string
  readonly canRoll: boolean
  readonly canAdvance: boolean
  readonly onRoll: () => void
  readonly onAdvance: () => void
}

export function TurnPanel({
  turn,
  playerLabel,
  phaseLabel,
  canRoll,
  canAdvance,
  onRoll,
  onAdvance,
}: TurnPanelProps) {
  return (
    <div className={styles.turn} data-turn-panel="true">
      <p className={styles.turnTitle}>{es.hudTurnOf.replace('{name}', playerLabel)}</p>
      <p className={styles.turnMeta}>
        <span data-turn-number={turn}>{es.hudTurnNumber.replace('{n}', String(turn))}</span>
        <span> · {phaseLabel}</span>
      </p>
      {canRoll ? (
        <button
          type="button"
          className={styles.rollButton}
          data-testid="btn-roll"
          data-command="RollMove"
          onClick={onRoll}
        >
          {es.hudRollButton}
        </button>
      ) : null}
      {canAdvance ? (
        <button
          type="button"
          className={styles.actionButton}
          data-testid="btn-advance"
          data-command="Advance"
          onClick={onAdvance}
        >
          {es.playResolveTile}
        </button>
      ) : null}
      <p className={styles.turnNote}>{es.playAutosave}</p>
    </div>
  )
}
