// AC: SPEC-G/T-062/AC-8 — selector manual 2D/3D en Ajustes, persistido en
// settings con retrocompatibilidad (saves sin la clave siguen válidos).
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { es } from '../i18n/es'
import { createMemoryStorage, type StorageLike } from './save'
import { DEFAULT_SETTINGS, SETTINGS_KEY, readSettings } from './settings'
import { SettingsScreen } from './SettingsScreen'

const storageWith = (value: unknown): StorageLike => {
  const storage = createMemoryStorage()
  storage.setItem(SETTINGS_KEY, JSON.stringify(value))
  return storage
}

test('AC: SPEC-G/AC-8 - default board=3d y saves viejos (sin board) mantienen el resto', () => {
  expect(DEFAULT_SETTINGS.board).toBe('3d')
  expect(readSettings(createMemoryStorage()).board).toBe('3d')
  const old = readSettings(storageWith({ speed: '2x', sound: false, reducedMotion: true }))
  expect(old).toEqual({ speed: '2x', sound: false, reducedMotion: true, board: '3d' })
  expect(readSettings(storageWith({ speed: '1x', sound: false, reducedMotion: false, board: '2d' })).board).toBe('2d')
  expect(readSettings(storageWith({ speed: '1x', sound: false, reducedMotion: false, board: 'nope' }))).toEqual(
    DEFAULT_SETTINGS,
  )
})

test('AC: SPEC-G/AC-8 - Ajustes ofrece el selector 2D/3D con data-settings=board', () => {
  const html = renderToString(
    <SettingsScreen settings={DEFAULT_SETTINGS} seed={7} onChange={() => undefined} onBack={() => undefined} />,
  )
  expect(html).toContain(es.settingsBoard)
  expect(html).toContain('data-settings="board"')
  expect(html).toContain('value="3d"')
  expect(html).toContain('value="2d"')
  expect(html).toContain(es.settingsBoard3d)
  expect(html).toContain(es.settingsBoard2d)
})
