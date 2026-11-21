// Ajustes (SPEC-D/T-034/AC-3): velocidad de animación, sonido (placeholder,
// desactivado), reducir movimiento y semilla visible para repetir la partida.
import type { PlaybackSpeed } from '../events/anim.config'
import { es } from '../i18n/es'
import type { GameSettings } from './settings'
import styles from './game.module.css'

const SPEED_OPTIONS: readonly { readonly value: PlaybackSpeed; readonly label: string }[] = [
  { value: '1x', label: '1×' },
  { value: '2x', label: '2×' },
  { value: 'skip', label: es.fxDemoSpeedSkip },
]

export interface SettingsScreenProps {
  readonly settings: GameSettings
  readonly seed: number | null
  readonly onChange: (next: GameSettings) => void
  readonly onBack: () => void
}

export function SettingsScreen({ settings, seed, onChange, onBack }: SettingsScreenProps) {
  return (
    <section className={styles.screen} aria-label={es.settingsTitle}>
      <h2 className={styles.screenTitle}>{es.settingsTitle}</h2>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>{es.settingsSpeed}</legend>
        {SPEED_OPTIONS.map((option) => (
          <label key={option.value} className={styles.optionRow}>
            <input
              type="radio"
              name="speed"
              data-settings="speed"
              value={option.value}
              checked={settings.speed === option.value}
              onChange={() => onChange({ ...settings, speed: option.value })}
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      <fieldset className={styles.fieldset}>
        <label className={styles.optionRow}>
          <input
            type="checkbox"
            data-settings="sound"
            checked={settings.sound}
            disabled
            onChange={() => undefined}
          />
          {es.settingsSound} {es.settingsSoundSoon}
        </label>
        <label className={styles.optionRow}>
          <input
            type="checkbox"
            data-settings="reduced-motion"
            checked={settings.reducedMotion}
            onChange={(event) => onChange({ ...settings, reducedMotion: event.target.checked })}
          />
          {es.settingsReduced}
        </label>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>{es.settingsBoard}</legend>
        <label className={styles.optionRow}>
          <input
            type="radio"
            name="board"
            data-settings="board"
            value="3d"
            checked={settings.board === '3d'}
            onChange={() => onChange({ ...settings, board: '3d' })}
          />
          {es.settingsBoard3d}
        </label>
        <label className={styles.optionRow}>
          <input
            type="radio"
            name="board"
            data-settings="board"
            value="2d"
            checked={settings.board === '2d'}
            onChange={() => onChange({ ...settings, board: '2d' })}
          />
          {es.settingsBoard2d}
        </label>
      </fieldset>

      <p className={styles.factRow} data-settings="seed">
        <strong>{es.settingsSeed}:</strong> {seed === null ? '—' : String(seed)}
      </p>

      <div className={styles.actions}>
        <button type="button" data-action="back" onClick={onBack}>
          {es.settingsBack}
        </button>
      </div>
    </section>
  )
}
