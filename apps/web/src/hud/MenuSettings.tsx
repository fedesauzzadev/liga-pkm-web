// Ajustes del menú (SPEC-I/T-074/AC-5): velocidad, efectos (reducir movimiento)
// y tablero 2D/3D. Presentacional: cambia el objeto settings que persiste
// GameApp (T-034); sin lógica propia.
import { es } from '../i18n/es'
import type { PlaybackSpeed } from '../events/anim.config'
import type { GameSettings } from '../game/settings'
import styles from './hud.module.css'

export interface MenuSettingsProps {
  readonly settings: GameSettings
  readonly onChange: (next: GameSettings) => void
}

const SPEEDS: readonly PlaybackSpeed[] = ['1x', '2x', 'skip']

export function MenuSettings({ settings, onChange }: MenuSettingsProps) {
  return (
    <section className={styles.settings} aria-label={es.titleSettings} data-menu-settings="true">
      <p className={styles.settingsLabel}>{es.settingsSpeed}</p>
      <div className={styles.settingsRow}>
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            className={styles.settingsButton}
            data-testid="menu-speed"
            data-speed={speed}
            aria-pressed={settings.speed === speed}
            onClick={() => onChange({ ...settings, speed })}
          >
            {speed === '1x' ? es.fxDemoSpeed1 : speed === '2x' ? es.fxDemoSpeed2 : es.fxDemoSpeedSkip}
          </button>
        ))}
      </div>
      <label className={styles.settingsLabel}>
        <input
          type="checkbox"
          data-testid="menu-reduced"
          checked={settings.reducedMotion}
          onChange={(event) => onChange({ ...settings, reducedMotion: event.target.checked })}
        />
        {es.settingsReduced}
      </label>
      <p className={styles.settingsLabel}>{es.settingsBoard}</p>
      <div className={styles.settingsRow}>
        <button
          type="button"
          className={styles.settingsButton}
          data-testid="menu-board"
          data-board="3d"
          aria-pressed={settings.board === '3d'}
          onClick={() => onChange({ ...settings, board: '3d' })}
        >
          {es.settingsBoard3d}
        </button>
        <button
          type="button"
          className={styles.settingsButton}
          data-testid="menu-board"
          data-board="2d"
          aria-pressed={settings.board === '2d'}
          onClick={() => onChange({ ...settings, board: '2d' })}
        >
          {es.settingsBoard2d}
        </button>
      </div>
    </section>
  )
}
