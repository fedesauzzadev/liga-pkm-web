// Botón de anteojitos que oculta/muestra todo el HUD (plan ocultar-hud):
// vive arriba a la izquierda (panel hudToggle de layout.json) y queda SIEMPRE
// visible para poder volver (AC-2). Fuera de GameShell.tsx para respetar el
// tope de 400 líneas por archivo (patrón MenuPopover).
import type { ReactNode } from 'react'
import { es } from '../i18n/es'
import { panelCss, shellPanels } from './layout'
import styles from './GameShell.module.css'

/** Ícono de anteojitos: SVG inline, sin librerías (AC-1). */
function GlassesIcon(): ReactNode {
  return (
    <svg
      className={styles.hudToggleIcon}
      viewBox="0 0 32 18"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="8" cy="10" r="5.5" />
      <circle cx="24" cy="10" r="5.5" />
      <path d="M13.5 9 Q16 6 18.5 9" />
      <path d="M2.5 9 L0.5 6" />
      <path d="M29.5 9 L31.5 6" />
    </svg>
  )
}

export function HudToggle({
  hidden,
  onToggle,
}: {
  /** AC-5: true = el HUD está oculto (lo refleja aria-pressed). */
  readonly hidden: boolean
  readonly onToggle: () => void
}): ReactNode {
  const label = hidden ? es.hudToggleShow : es.hudToggleHide
  return (
    <button
      type="button"
      className={`${styles.panelButton} ${styles.hudToggleButton}`}
      style={panelCss(shellPanels.hudToggle)}
      data-testid={shellPanels.hudToggle.testid}
      aria-pressed={hidden}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <GlassesIcon />
    </button>
  )
}
