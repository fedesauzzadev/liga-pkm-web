// Popup de carta obtenida (SPEC-I/T-075/AC-1, D-29): al llegar un CardDrawn
// muestra la carta y se cierra sola a autoDismissMs. Clic = cerrar.
// unificar-popup-encuentro: la decisión FightOrRelease ya NO vive acá (popup
// propio popup-encounter); este popup queda solo para energía/ítem con su
// cierre automático. Presentacional: sin comandos ni reglas.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { elementOfCardId } from '@liga/engine'
import { PkmCard } from '../battle/PkmCard'
import type { DrawSpec } from '../board/Board'
import { drawKindOf } from '../board3d/draw'
import { EnergyCardFace, ItemCardFace } from '../game/CardFaces'
import { cardOf } from '../game/content'
import { es } from '../i18n/es'
import { FitBox } from './FitBox'
import styles from './popup.module.css'

export interface CardPopupProps {
  readonly draw: DrawSpec | null
  /** layout.json › panels.cardPopup.autoDismissMs. */
  readonly autoDismissMs: number
  /** El shell dibuja el box: avisa si la carta sigue visible (AC-1). */
  readonly onOpenChange?: (open: boolean) => void
}

export function CardPopup({
  draw,
  autoDismissMs,
  onOpenChange,
}: CardPopupProps): ReactNode {
  const [dismissedNonce, setDismissedNonce] = useState(0)
  const openChangeRef = useRef(onOpenChange)
  openChangeRef.current = onOpenChange

  // D-29: auto-cierre por carta nueva.
  useEffect(() => {
    if (draw === null) return
    setDismissedNonce(0)
    openChangeRef.current?.(true)
    const timer = window.setTimeout(() => {
      setDismissedNonce(draw.nonce)
      openChangeRef.current?.(false)
    }, autoDismissMs)
    return () => window.clearTimeout(timer)
  }, [draw, autoDismissMs])

  const dismiss = useCallback((): void => {
    if (draw === null) return
    setDismissedNonce(draw.nonce)
    openChangeRef.current?.(false)
  }, [draw])

  if (draw === null || dismissedNonce === draw.nonce) return null
  const kind = drawKindOf(draw.card)

  return (
    <div className={styles.cardPopup} data-card-popup="true">
      <div
        className={styles.cardHit}
        role="button"
        tabIndex={0}
        data-testid="popup-card-dismiss"
        aria-label={es.shellTipClose}
        onClick={dismiss}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') dismiss()
        }}
      >
        <FitBox>
          {kind === 'pkm' && cardOf(draw.card) !== undefined ? (
            <PkmCard card={cardOf(draw.card)!} damage={0} artUrl={null} mode="own" />
          ) : kind === 'energy' && elementOfCardId(draw.card) !== null ? (
            <EnergyCardFace element={elementOfCardId(draw.card)!} />
          ) : (
            <ItemCardFace id={draw.card} />
          )}
        </FitBox>
      </div>
    </div>
  )
}
