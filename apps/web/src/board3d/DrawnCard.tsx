// Overlay DOM del robo (SPEC-G/T-064/AC-1/AC-2/AC-4): carta que vuela desde la
// pila proyectada al centro girando rotateY 0→180°, con dorso y cara según el
// tipo. No bloquea la decisión: pointer-events none y el panel sigue vivo.
import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import type { DeckKey } from '@liga/content'
import { elementOfCardId } from '@liga/engine'
import { PkmCard } from '../battle/PkmCard'
import type { PlaybackSpeed } from '../events/anim.config'
import { EnergyCardFace, ItemCardFace } from '../game/CardFaces'
import { cardOf } from '../game/content'
import { es } from '../i18n/es'
import { uiLayout } from '../shell/layout'
import { BOARD3D } from '../theme/board3d'
import { drawKindOf, drawTimings, type DrawOrigin, type DrawPhase } from './draw'
import styles from './drawn-card.module.css'

export interface DrawnCardProps {
  readonly deck: DeckKey | null
  readonly card: string | null
  readonly phase: DrawPhase
  readonly origin: DrawOrigin | null
  readonly speed: PlaybackSpeed
  readonly reducedMotion: boolean
}

/** AC-2: a dónde vuela la energía/ítem — el panel de la mochila del HUD
 * (T-082: el botón de inventario se quitó; el inventario visible es la mochila). */
const inventoryTarget = (host: HTMLElement | null): { readonly x: number; readonly y: number } => {
  if (typeof document === 'undefined') return { x: 0, y: 0 }
  const backpack = document.querySelector('[data-testid="panel-backpack"]')
  if (host === null || backpack === null) return { x: 0, y: 0 }
  const hostRect = host.getBoundingClientRect()
  const target = backpack.getBoundingClientRect()
  return {
    x: target.left + target.width / 2 - hostRect.left,
    y: target.top + target.height / 2 - hostRect.top,
  }
}

/** T-075/AC-1: a dónde vuela la carta — el centro del popup-card (SPEC-G:
 * T-064 se detiene ahí, no en "el centro de la pantalla"); null si no existe. */
const popupCardTarget = (host: HTMLElement | null, testid: string): { readonly x: number; readonly y: number } | null => {
  if (typeof document === 'undefined') return null
  const popup = document.querySelector(`[data-testid="${testid}"]`)
  if (host === null || popup === null) return null
  const hostRect = host.getBoundingClientRect()
  const box = popup.getBoundingClientRect()
  if (box.width <= 0 || box.height <= 0) return null
  return {
    x: box.left + box.width / 2 - hostRect.left,
    y: box.top + box.height / 2 - hostRect.top,
  }
}

/** unificar-popup-encuentro: fallback del vuelo de un PKM — el centro del
 * safeArea de layout.json (donde vive popup-encounter). */
const safeAreaTarget = (): { readonly x: number; readonly y: number } => {
  if (typeof window === 'undefined') return { x: 0, y: 0 }
  const safe = uiLayout.safeArea
  return {
    x: (safe.x + safe.w / 2) * window.innerWidth,
    y: (safe.y + safe.h / 2) * window.innerHeight,
  }
}

export function DrawnCard(props: DrawnCardProps): ReactNode {
  const { deck, card, phase, origin, speed, reducedMotion } = props
  const hostRef = useRef<HTMLDivElement | null>(null)

  const kind = card === null ? null : drawKindOf(card)
  // AC-4: energía/ítem se guardan al terminar; un PKM cede al popup-encounter
  // al terminar el revelado (unificar-popup-encuentro/AC-1: la decisión vive ahí).
  const visible = card !== null && kind !== null && phase !== 'idle' && phase !== 'done'

  const timings = drawTimings(speed, reducedMotion)
  const animate = !reducedMotion && speed !== 'skip'

  const style = useMemo<CSSProperties>(() => {
    if (!visible || origin === null) return {}
    // unificar-popup-encuentro: el PKM vuela al popup-encounter (fallback: el
    // centro del safeArea); energía/ítem, a la mochila o al popup-card.
    const pkmTarget =
      popupCardTarget(hostRef.current, 'popup-encounter') ?? safeAreaTarget()
    const point =
      phase === 'highlight'
        ? { x: origin.x, y: origin.y }
        : phase === 'stow'
          ? inventoryTarget(hostRef.current)
          : kind === 'pkm'
            ? pkmTarget
            : (popupCardTarget(hostRef.current, 'popup-card') ?? { x: origin.w / 2, y: origin.h / 2 })
    const flightMs = phase === 'fly' || phase === 'stow' ? (phase === 'fly' ? timings.flyMs : timings.stowMs) : 0
    return {
      width: BOARD3D.draw.cardWidth,
      height: BOARD3D.draw.cardHeight,
      transform: `translate(${String(point.x - BOARD3D.draw.cardWidth / 2)}px, ${String(point.y - BOARD3D.draw.cardHeight / 2)}px)`,
      transition:
        animate && flightMs > 0
          ? `transform ${String(flightMs)}ms ease-out, opacity ${String(flightMs)}ms ease-out`
          : 'none',
      opacity: phase === 'stow' ? 0.35 : 1,
    }
  }, [visible, origin, phase, kind, timings.flyMs, timings.stowMs, animate])

  if (!visible || kind === null || card === null) return null

  const flipStyle: CSSProperties = {
    transform: phase === 'highlight' ? 'rotateY(0deg)' : 'rotateY(180deg)',
    transition: animate && phase === 'fly' ? `transform ${String(timings.flyMs)}ms ease-out` : 'none',
  }

  return (
    <div ref={hostRef} className={styles.host} style={{ pointerEvents: 'none' }}>
      <div
        className={styles.card}
        data-testid="drawn-card"
        data-phase={phase}
        data-kind={kind}
        aria-label={es.drawnCardAria}
        style={style}
      >
        <div className={styles.flipper} style={flipStyle}>
          <div className={`${styles.face} ${styles.back}`} aria-hidden="true">
            {deck === null ? null : es.tileDeckNames[deck]}
          </div>
          <div className={`${styles.face} ${styles.front}`}>
            {kind === 'pkm' ? (
              <div
                className={styles.pkm}
                style={{ transform: `scale(${String(BOARD3D.draw.pkmScale)})` }}
              >
                <PkmCard card={cardOf(card)!} damage={0} artUrl={null} mode="own" />
              </div>
            ) : kind === 'energy' ? (
              <EnergyCardFace element={elementOfCardId(card)!} />
            ) : (
              <ItemCardFace id={card} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
