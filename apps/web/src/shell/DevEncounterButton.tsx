// Botón dev-only que fuerza el encuentro con Abra del mazo Pantano (plan
// probar-encuentro-abra): vive al lado del anteojito (panel devEncounter de
// layout.json) y envía el comando DebugEncounter por `send` (ADR-1: la UI
// nunca muta estado). Se oculta junto con el resto del HUD.
import type { ReactNode } from 'react'
import { es } from '../i18n/es'
import { panelCss, shellPanels } from './layout'
import styles from './GameShell.module.css'

/** Ícono de destello psíquico: SVG inline, sin librerías. */
function SparkIcon(): ReactNode {
  return (
    <svg
      className={styles.hudToggleIcon}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z" />
    </svg>
  )
}

export function DevEncounterButton({ onClick }: { readonly onClick: () => void }): ReactNode {
  return (
    <button
      type="button"
      className={`${styles.panelButton} ${styles.hudToggleButton}`}
      style={panelCss(shellPanels.devEncounter)}
      data-testid={shellPanels.devEncounter.testid}
      aria-label={es.devEncounterLabel}
      title={es.devEncounterLabel}
      onClick={onClick}
    >
      <SparkIcon />
    </button>
  )
}
