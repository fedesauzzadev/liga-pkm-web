// Paneles de decisión del tablero 3D (T-062/AC-10), extraídos de Board3D para
// respetar el límite de 400 líneas por archivo. Solo muestran el pending del
// motor y envían sus comandos; los textos viven en i18n/es.ts.
import type { ReactNode } from 'react'
import type { PendingDecision } from '../board/Board'
import { es } from '../i18n/es'
import boardStyles from '../board/Board.module.css'

export interface DecisionPanelsProps {
  readonly pending: PendingDecision
  readonly onChoosePath: ((to: string) => void) | undefined
  readonly onStopHere: (() => void) | undefined
  readonly onContinueMoving: (() => void) | undefined
  readonly onStopOrContinue: (() => void) | undefined
  readonly nodeLabel: (id: string) => string
}

export function DecisionPanels({
  pending,
  onChoosePath,
  onStopHere,
  onContinueMoving,
  onStopOrContinue,
  nodeLabel,
}: DecisionPanelsProps): ReactNode {
  if (pending === null) return null
  if (pending.type === 'ChoosePath') {
    return (
      <div className={boardStyles.choicePanel}>
        <p className={boardStyles.choiceTitle}>{es.board3dChooseTitle}</p>
        <div className={boardStyles.choiceList}>
          {pending.options.map((option) => (
            <button
              key={option}
              type="button"
              className={boardStyles.choiceButton}
              data-decision="choose-path"
              data-node={option}
              onClick={() => onChoosePath?.(option)}
            >
              {nodeLabel(option)}
            </button>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className={boardStyles.choicePanel}>
      <p className={boardStyles.choiceTitle}>{es.board3dStopTitle}</p>
      <div className={boardStyles.choiceList}>
        <button
          type="button"
          className={boardStyles.choiceButton}
          data-decision="stop-here"
          onClick={() => (onStopHere ?? onStopOrContinue)?.()}
        >
          {es.board3dStopHere}
        </button>
        <button
          type="button"
          className={boardStyles.choiceButton}
          data-decision="continue"
          onClick={() => (onContinueMoving ?? onStopOrContinue)?.()}
        >
          {es.board3dContinue}
        </button>
      </div>
    </div>
  )
}
