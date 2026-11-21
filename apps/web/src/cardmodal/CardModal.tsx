// Ventana de carta del Pokémon (SPEC-R/T-103): overlay centrado con fondo
// atenuado, carta grande a la izquierda y panel lateral a la derecha. Medidas
// de content/ui/card-modal.json (config.ts) y obstáculos de layout.json;
// presentacional: solo muestra datos del motor y envía comandos (AC-17).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Command } from '@liga/engine'
import { es } from '../i18n/es'
import { uiLayout } from '../shell/layout'
import { cardModalConfig } from './config'
import { cardModalGeometry, type CardModalActions, type CardModalSpec } from './model'
import { CardFace } from './CardFace'
import { SidePanel } from './SidePanel'
import styles from './CardModal.module.css'

export interface CardModalProps {
  readonly spec: CardModalSpec
  readonly actions: CardModalActions
  /** Sprite del manifest (sprites.json); null ⇒ tarjeta con el nombre (AC-7). */
  readonly artUrl: string | null
  /** Contadores de ítems del dueño (sección Pociones, AC-11). */
  readonly itemCounts: { readonly potion: number; readonly super_potion: number }
  /** Cartas Multicolor sin asignar (AC-11). */
  readonly multicolorFree: number
  readonly onCommand: (command: Command) => void
  readonly onClose: () => void
}

interface Viewport {
  readonly vw: number
  readonly vh: number
}

const viewportOf = (): Viewport =>
  typeof window === 'undefined'
    ? { vw: 1280, vh: 720 }
    : { vw: window.innerWidth, vh: window.innerHeight }

export function CardModal({
  spec,
  actions,
  artUrl,
  itemCounts,
  multicolorFree,
  onCommand,
  onClose,
}: CardModalProps): ReactNode {
  const [viewport, setViewport] = useState<Viewport>(viewportOf)
  const [closing, setClosing] = useState(false)
  const closedRef = useRef(false)
  // AC-2: el foco vuelve al slot que abrió la ventana al cerrarse.
  const openerRef = useRef<Element | null>(null)
  const timerRef = useRef<number | null>(null)

  // AC-3: sale con animación (escala 1→0,96 y fundido) de animationMs.
  const requestClose = (): void => {
    if (closedRef.current) return
    closedRef.current = true
    const ms = cardModalConfig.modal.animationMs
    if (ms <= 0) {
      onClose()
      return
    }
    setClosing(true)
    timerRef.current = window.setTimeout(onClose, ms)
  }
  const closeRef = useRef(requestClose)
  closeRef.current = requestClose

  useEffect(() => {
    openerRef.current = document.activeElement
    const onResize = (): void => setViewport(viewportOf())
    const onKey = (event: KeyboardEvent): void => {
      if (cardModalConfig.modal.closeOnEsc && event.key === 'Escape') closeRef.current()
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      const opener = openerRef.current
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])

  const geo = cardModalGeometry(viewport.vw, viewport.vh, cardModalConfig, uiLayout)
  const backdropStyle: CSSProperties = {
    backgroundColor: `rgba(8, 10, 20, ${String(cardModalConfig.modal.backdropOpacity)})`,
  }
  const windowStyle: CSSProperties = {
    left: `${String(Math.round(geo.window.x))}px`,
    top: `${String(Math.round(geo.window.y))}px`,
    width: `${String(Math.round(geo.window.w))}px`,
    height: `${String(Math.round(geo.window.h))}px`,
    '--card-anim-ms': `${String(cardModalConfig.modal.animationMs)}ms`,
    '--card-font-min': `${String(cardModalConfig.card.fontMinPx)}px`,
  } as CSSProperties
  const bodyStyle: CSSProperties = {
    gap: `${String(cardModalConfig.sidePanel.gapPx)}px`,
    flexDirection: geo.stacked ? 'column' : 'row',
  }
  // layout-carta-modal/AC-6: la geometría ya deriva el alto de la zona de
  // contenido; max-height 100% es el tope de seguridad para que la carta
  // nunca desborde la ventana (el pie queda adentro).
  const faceStyle: CSSProperties = {
    width: `${String(Math.round(geo.cardW))}px`,
    height: `${String(Math.round(geo.cardH))}px`,
    maxHeight: '100%',
  }
  const sideStyle: CSSProperties = { width: `${String(Math.round(geo.sideW))}px` }

  return (
    <div
      className={styles.overlay}
      data-card-modal="true"
      data-uid={spec.pkm.uid}
      data-read-only={spec.readOnly ? 'true' : 'false'}
      data-stacked={geo.stacked ? 'true' : 'false'}
      data-covers-panel={geo.coversPanel ? 'true' : 'false'}
    >
      {cardModalConfig.modal.closeOnBackdropClick ? (
        <div
          className={styles.backdrop}
          style={backdropStyle}
          data-testid="modal-card-backdrop"
          onClick={requestClose}
          aria-hidden="true"
        />
      ) : null}
      <section
        className={styles.window}
        style={windowStyle}
        data-testid={cardModalConfig.modal.testid}
        role="dialog"
        aria-modal="true"
        aria-label={`${es.modalCardTitle}: ${spec.card.name}`}
        data-closing={closing ? 'true' : undefined}
      >
        <header className={styles.header}>
          <p className={styles.title}>{es.modalCardTitle}</p>
          <button
            type="button"
            className={styles.close}
            data-testid="btn-close"
            onClick={requestClose}
          >
            {es.shellTipClose}
          </button>
        </header>
        <div className={styles.body} style={bodyStyle}>
          <CardFace spec={spec} artUrl={artUrl} style={faceStyle} />
          <SidePanel
            spec={spec}
            actions={actions}
            itemCounts={itemCounts}
            multicolorFree={multicolorFree}
            style={sideStyle}
            onCommand={onCommand}
          />
        </div>
      </section>
    </div>
  )
}
