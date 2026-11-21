// Pantalla de título (SPEC-D/T-034/AC-1): Nueva partida / Continuar / Ajustes.
// lobby-logo-sin-scroll: el logo reemplaza título/subtítulo y la pantalla
// entra en el viewport sin scroll. Presentacional; los datos del save los
// resuelve GameApp.
/// <reference types="vite/client" />
import logo from '../../../../content/loading/png.png'
import { es } from '../i18n/es'
import styles from './game.module.css'

export interface TitleScreenProps {
  readonly hasSave: boolean
  readonly saveWarning: string | null
  readonly onNewGame: () => void
  readonly onContinue: () => void
  readonly onOpenSettings: () => void
}

export function TitleScreen({ hasSave, saveWarning, onNewGame, onContinue, onOpenSettings }: TitleScreenProps) {
  return (
    <section className={styles.screen} aria-label={es.appTitle} data-title-screen="">
      <img className={styles.logo} src={logo} alt={es.titleLogoAlt} draggable={false} />
      {saveWarning === null ? null : (
        <p className={styles.warning} role="alert">
          {saveWarning}
        </p>
      )}
      <nav className={styles.menu}>
        <button type="button" className={styles.menuButton} data-action="new-game" onClick={onNewGame}>
          {es.titleNewGame}
        </button>
        <button
          type="button"
          className={styles.menuButton}
          data-action="continue"
          disabled={!hasSave}
          onClick={onContinue}
        >
          {es.titleContinue}
        </button>
        <button type="button" className={styles.menuButton} data-action="settings" onClick={onOpenSettings}>
          {es.titleSettings}
        </button>
      </nav>
    </section>
  )
}
