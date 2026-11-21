// AC: SPEC-D/T-034/AC-3 — ajustes: velocidad, sonido (placeholder,
// desactivado), reducir movimiento y semilla visible; persistencia validada.
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { es } from '../i18n/es'
import { createMemoryStorage } from './save'
import { SettingsScreen } from './SettingsScreen'
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  readSettings,
  writeSettings,
  type GameSettings,
} from './settings'

test('AC: SPEC-D/AC-3 - muestra velocidad, sonido deshabilitado, reducir movimiento y semilla', () => {
  const settings: GameSettings = { speed: '2x', sound: false, reducedMotion: true, board: '3d' }
  const html = renderToString(
    <SettingsScreen settings={settings} seed={4242} onChange={() => undefined} onBack={() => undefined} />,
  )
  expect(html).toContain(es.settingsTitle)
  expect(html).toContain(es.settingsSpeed)
  expect(html).toContain('1×')
  expect(html).toContain('2×')
  expect(html).toContain(es.fxDemoSpeedSkip)
  expect(html).toContain('checked=""') // 2x + reducedMotion marcados
  const soundAt = html.indexOf('data-settings="sound"')
  expect(soundAt).toBeGreaterThanOrEqual(0)
  expect(html.slice(soundAt, soundAt + 40)).toContain('disabled')
  expect(html).toContain(es.settingsSoundSoon)
  expect(html).toContain('data-settings="reduced-motion"')
  expect(html).toContain(es.settingsSeed)
  expect(html).toContain('4242')
})

test('AC: SPEC-D/AC-3 - settings: defaults sin datos, roundtrip y valores inválidos ⇒ defaults', () => {
  const storage = createMemoryStorage()
  expect(readSettings(storage)).toEqual(DEFAULT_SETTINGS)
  writeSettings(storage, { speed: 'skip', sound: false, reducedMotion: true, board: '2d' })
  expect(readSettings(storage)).toEqual({ speed: 'skip', sound: false, reducedMotion: true, board: '2d' })
  storage.setItem(SETTINGS_KEY, '{"speed":"9x"}')
  expect(readSettings(storage)).toEqual(DEFAULT_SETTINGS)
  storage.setItem(SETTINGS_KEY, 'no-json')
  expect(readSettings(storage)).toEqual(DEFAULT_SETTINGS)
})
