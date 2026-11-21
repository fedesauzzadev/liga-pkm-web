// Menú del juego (SPEC-I/T-074/AC-5): Continuar, Guardar, Ajustes, Pantalla
// completa, Exportar reporte de bug y Salir. Vive aparte de GameShell.tsx para
// respetar el tope de 400 líneas por archivo (T-089); el estilo es el mismo
// (GameShell.module.css) y lo consume el popover abierto del shell.
import type { ReactNode } from 'react'
import { es } from '../i18n/es'
import { exportBugReport } from '../debug/bugReport'
import styles from './GameShell.module.css'

export interface ShellMenu {
  /** "Guardar": guarda la partida ahora (AC-5). */
  readonly onSave?: () => void
  /** "Salir": vuelve al título (AC-5). */
  readonly onExit?: () => void
  /** Ajustes inline (velocidad, efectos, 2D/3D; AC-5). */
  readonly settings?: ReactNode
}

/** Menú del juego (SPEC-I/T-074/AC-5): Continuar, Guardar, Ajustes, Pantalla
 * completa, Exportar reporte de bug y Salir. Separado para testearlo directo. */
export function MenuPopover({
  menu,
  fullscreen,
  onToggleFullscreen,
  onClose,
}: {
  readonly menu: ShellMenu | undefined
  readonly fullscreen: boolean
  readonly onToggleFullscreen: () => void
  readonly onClose: () => void
}): ReactNode {
  return (
    <div className={styles.menu} role="menu" aria-label={es.shellMenuTitle} data-testid="menu-popover">
      <button
        type="button"
        role="menuitem"
        className={styles.menuButton}
        data-testid="menu-continue"
        onClick={onClose}
      >
        {es.shellMenuContinue}
      </button>
      {menu?.onSave === undefined ? null : (
        <button
          type="button"
          role="menuitem"
          className={styles.menuButton}
          data-testid="menu-save"
          onClick={() => menu.onSave?.()}
        >
          {es.shellMenuSave}
        </button>
      )}
      {menu?.settings === undefined ? null : menu.settings}
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={fullscreen}
        className={styles.menuButton}
        data-testid="btn-fullscreen"
        onClick={onToggleFullscreen}
      >
        {fullscreen ? es.shellFullscreenExit : es.shellFullscreen}
      </button>
      <button
        type="button"
        role="menuitem"
        className={styles.menuButton}
        data-testid="menu-bug"
        onClick={() => exportBugReport()}
      >
        {es.shellMenuBug}
      </button>
      {menu?.onExit === undefined ? null : (
        <button
          type="button"
          role="menuitem"
          className={styles.menuButton}
          data-testid="menu-exit"
          onClick={() => {
            onClose()
            menu.onExit?.()
          }}
        >
          {es.shellMenuExit}
        </button>
      )}
      <p className={styles.menuHint}>{es.shellFullscreenHint}</p>
    </div>
  )
}
