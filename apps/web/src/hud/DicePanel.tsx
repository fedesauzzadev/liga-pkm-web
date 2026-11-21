// Panel fijo del dado (SPEC-N/T-092): dado de TABLERO — move y oportunidad
// (dado-de-combate/AC-2: los propósitos de combate los reproduce el dado propio
// del popup de combate). El dado CSS de T-032b (rollTo imperativo) reproduce la
// tirada que dicta el motor (Animación ≠ lógica); el panel vive en el HUD.
// "Quién tiró" se infiere del jugador activo (el motor no emite jugador).
import { useEffect, useRef, type ReactNode } from 'react'
import type { DiePurpose } from '@liga/engine'
import { Die3D, type Die3DHandle, type DieValue } from '../board/Die3D'
import type { PlaybackSpeed } from '../events/anim.config'
import { es } from '../i18n/es'
import styles from './dice-panel.module.css'

/** Una tirada del motor: valor + propósito + quién la tiró (inferido). */
export interface DiceRoll {
  readonly value: DieValue
  readonly purpose: DiePurpose
  readonly playerLabel: string
  /** Se incrementa en cada tirada (una tirada repetida vuelve a rodar el dado). */
  readonly nonce: number
}

/** AC-4: el panel conserva y muestra en texto las últimas 3 tiradas. */
export const DICE_HISTORY_LIMIT = 3

/** AC-4: acumula tiradas (las más viejas se descartan allá del tope). */
export function appendDiceRolls(
  prev: readonly DiceRoll[],
  entries: readonly DiceRoll[],
): readonly DiceRoll[] {
  if (entries.length === 0) return prev
  return [...prev, ...entries].slice(-DICE_HISTORY_LIMIT)
}

const PURPOSE_LABELS: Readonly<Record<DiePurpose, string>> = {
  move: es.hudDiceMove,
  attackSelect: es.hudDiceAttack,
  gate: es.hudDiceGate,
  effect: es.hudDiceEffect,
  wake: es.hudDiceWake,
  dodge: es.hudDiceDodge,
  bonus: es.hudDiceBonus,
  oportunidad: es.hudDiceOportunidad,
}

export const diePurposeLabel = (purpose: DiePurpose): string => PURPOSE_LABELS[purpose]

/** AC-4: texto del historial, la tirada más reciente primero; null si está vacío. */
export function diceHistoryText(rolls: readonly DiceRoll[]): string | null {
  if (rolls.length === 0) return null
  const values = [...rolls].reverse().map((roll) => String(roll.value))
  return es.hudDiceHistory.replace('{values}', values.join(' · '))
}

export function DicePanel({
  rolls,
  speed = '1x',
  reducedMotion = false,
  canRoll = false,
  onRoll,
}: {
  readonly rolls: readonly DiceRoll[]
  readonly speed?: PlaybackSpeed
  readonly reducedMotion?: boolean
  /** dado-clicable/AC-1: true ⇒ el dado se envuelve en btn-roll-die (RollMove). */
  readonly canRoll?: boolean
  readonly onRoll?: () => void
}): ReactNode {
  const dieRef = useRef<Die3DHandle>(null)
  const current = rolls.at(-1) ?? null
  // AC-2/AC-5: el dado rueda al valor del motor; skip/reducedMotion ⇒ directo.
  useEffect(() => {
    if (current === null) return
    void dieRef.current?.rollTo(current.value)
  }, [current])
  const historyText = diceHistoryText(rolls)
  // dado-clicable/AC-1: el mismo dado, envuelto en un botón solo cuando se
  // puede tirar (AC-2: sin canRoll el render queda informativo, igual que hoy).
  const die = (
    <Die3D
      ref={dieRef}
      value={current?.value ?? 1}
      purpose={current === null ? '' : diePurposeLabel(current.purpose)}
      showLabel={false}
      speed={speed}
      reducedMotion={reducedMotion}
    />
  )
  return (
    <div className={styles.root} data-testid="dice-panel" data-value={current?.value ?? ''}>
      {canRoll ? (
        <button
          type="button"
          className={styles.roll}
          data-testid="btn-roll-die"
          data-command="RollMove"
          aria-label={es.hudRollButton}
          onClick={onRoll}
        >
          {die}
        </button>
      ) : (
        die
      )}
      <div className={styles.meta}>
        <p className={styles.who} data-testid="dice-who">
          {/* N-0006/AC-2: la invitación a tirar solo cuando se puede tirar. */}
          {current !== null ? current.playerLabel : canRoll ? es.hudDiceIdle : es.hudDiceWait}
        </p>
        <p className={styles.purpose} data-testid="dice-purpose">
          {current === null ? '' : diePurposeLabel(current.purpose)}
        </p>
        <p className={styles.value} data-testid="dice-value">
          {current === null ? '' : String(current.value)}
        </p>
        {historyText === null ? null : (
          <p className={styles.history} data-testid="dice-history">
            {historyText}
          </p>
        )}
      </div>
    </div>
  )
}
