// AC: SPEC-D/T-034/AC-1/AC-2 — GameApp: título por defecto, Continuar según
// save y aviso de versión desconocida. Proxy SSR con storage inyectado.
import { readFileSync } from 'node:fs'
import { renderToString } from 'react-dom/server'
import { expect, test, vi } from 'vitest'
import { es } from '../i18n/es'
import { gameContent } from './content'
import { SAVE_KEY, createMemoryStorage, writeSave } from './save'
import { saveFromSession, startSession } from './session'
import { GameApp } from './GameApp'

test('AC: SPEC-D/AC-1 - sin datos previos: título con Continuar deshabilitado', () => {
  const html = renderToString(<GameApp storage={createMemoryStorage()} />)
  expect(html).toContain('LIGA PKM')
  expect(html).toContain('data-action="continue" disabled')
})

test('AC: SPEC-D/AC-2 - con save válido: Continuar habilitado', () => {
  const storage = createMemoryStorage()
  const started = startSession({ seed: 42, starterDeck: 'isla' }, gameContent)
  if (!started.ok) throw new Error(started.error.message)
  writeSave(storage, saveFromSession(started.value))
  const html = renderToString(<GameApp storage={storage} />)
  const at = html.indexOf('data-action="continue"')
  expect(at).toBeGreaterThanOrEqual(0)
  expect(html.slice(at, at + 40)).not.toContain('disabled')
})

test('AC: SPEC-D/AC-2 - save de versión futura: mensaje claro y Continuar deshabilitado', () => {
  const storage = createMemoryStorage()
  storage.setItem(
    SAVE_KEY,
    JSON.stringify({ version: 99, seed: 1, starterDeck: 'isla', commandLog: [], stateHash: 'x' }),
  )
  const html = renderToString(<GameApp storage={storage} />)
  expect(html).toContain('versión incompatible')
  expect(html).toContain('data-action="continue" disabled')
})

// AC: SPEC-F/T-048/AC-6 — al continuar una partida cuyo contentHash difiere del
// contenido actual (con ediciones de la casa), la UI avisa en el título.
test('AC: SPEC-F/T-048/AC-6 - contentHash distinto: aviso al continuar', () => {
  const storage = createMemoryStorage()
  const started = startSession({ seed: 42, starterDeck: 'isla' }, gameContent)
  if (!started.ok) throw new Error(started.error.message)
  writeSave(storage, { ...saveFromSession(started.value), contentHash: 'deadbeef' })
  const html = renderToString(<GameApp storage={storage} />)
  expect(html).toContain(es.saveContentMismatch)
  expect(html).toContain('data-action="continue"')
  const at = html.indexOf('data-action="continue"')
  expect(html.slice(at, at + 40)).not.toContain('disabled')
})

// AC: N-0006/AC-3 — el demo "Combate" del título se monta en una capa a
// pantalla completa (el escenario mide 100% de su contenedor; sin capa da 0×0).
// Proxy de fuente/CSS (el SSR no hace layout); la medida real va por captura.
test('AC: N-0006/AC-3 - demo de combate dentro de una capa fija con tamaño', () => {
  const source = readFileSync(new URL('./GameApp.tsx', import.meta.url), 'utf8')
  expect(source).toMatch(/className=\{styles\.demoOverlay\}[\s\S]*<BattleDemo/)
  const css = readFileSync(new URL('./game.module.css', import.meta.url), 'utf8')
  expect(css).toMatch(/\.demoOverlay\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*display:\s*grid/s)
})

// AC: N-0020/AC-3 — los demos del título solo existen en dev y van en una
// esquina fija, fuera del flujo del menú.
test('AC: N-0020/AC-3 - demos solo en dev, en una esquina fija', () => {
  const dev = renderToString(<GameApp storage={createMemoryStorage()} />)
  expect(dev).toContain('data-testid="dev-demos"')
  expect(dev).toContain(es.battleDemoToggle)
  const css = readFileSync(new URL('./game.module.css', import.meta.url), 'utf8')
  expect(css).toMatch(/\.demos\s*\{[^}]*position:\s*fixed/s)
  vi.stubEnv('DEV', false)
  try {
    const prod = renderToString(<GameApp storage={createMemoryStorage()} />)
    expect(prod).not.toContain('data-testid="dev-demos"')
    expect(prod).not.toContain(es.teamDemoToggle)
    expect(prod).toContain(es.titleNewGame)
  } finally {
    vi.unstubAllEnvs()
  }
})
