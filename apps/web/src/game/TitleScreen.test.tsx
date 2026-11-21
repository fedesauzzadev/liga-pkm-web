// AC: SPEC-D/T-034/AC-1 — pantalla de título: Nueva partida / Continuar /
// Ajustes; Continuar deshabilitado sin save y aviso claro para saves inválidos.
// AC: lobby-logo-sin-scroll — logo en lugar de título/subtítulo, sin scroll.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { es } from '../i18n/es'
import { TitleScreen } from './TitleScreen'

// Lecturas de fuente por cwd (mismo patrón que LoadingScreen.test.tsx).
const gameDir = join(process.cwd(), 'apps', 'web', 'src', 'game')
const gameCss = readFileSync(join(gameDir, 'game.module.css'), 'utf8')
const appCss = readFileSync(join(process.cwd(), 'apps', 'web', 'src', 'App.module.css'), 'utf8')
const titleSource = readFileSync(join(gameDir, 'TitleScreen.tsx'), 'utf8')

const renderTitle = (hasSave: boolean, saveWarning: string | null): string =>
  renderToString(
    <TitleScreen
      hasSave={hasSave}
      saveWarning={saveWarning}
      onNewGame={() => undefined}
      onContinue={() => undefined}
      onOpenSettings={() => undefined}
    />,
  )

test('AC: SPEC-D/AC-1 - el título muestra Nueva partida, Continuar y Ajustes', () => {
  const html = renderTitle(false, null)
  expect(html).toContain(es.titleNewGame)
  expect(html).toContain(es.titleContinue)
  expect(html).toContain(es.titleSettings)
})

test('AC: SPEC-D/AC-2 - sin partida guardada, Continuar está deshabilitado', () => {
  const html = renderTitle(false, null)
  expect(html).toContain('data-action="continue" disabled')
})

test('AC: SPEC-D/AC-2 - con partida guardada, Continuar habilitado', () => {
  const html = renderTitle(true, null)
  const at = html.indexOf('data-action="continue"')
  expect(at).toBeGreaterThanOrEqual(0)
  expect(html.slice(at, at + 40)).not.toContain('disabled')
})

test('AC: SPEC-D/AC-2 - save de versión desconocida ⇒ mensaje claro', () => {
  const warning = es.saveUnknownVersion.replace('{version}', '99')
  const html = renderTitle(false, warning)
  expect(html).toContain('role="alert"')
  expect(html).toContain(warning)
})

// AC: lobby-logo-sin-scroll/AC-1 - el logo (png.png) reemplaza
// el h1/p; alt desde i18n; marca data-title-screen para el shell.
test('AC: lobby-logo-sin-scroll/AC-1 - logo <img> con alt de es.titleLogoAlt, sin h1 ni subtítulo', () => {
  const html = renderTitle(false, null)
  expect(html).toContain('<img')
  expect(html).toContain(`alt="${es.titleLogoAlt}"`)
  expect(html).toContain('png.png')
  expect(titleSource).toContain('content/loading/png.png')
  expect(titleSource).not.toContain('pokeboard')
  expect(html).not.toContain('<h1')
  expect(html).not.toContain('screenSubtitle')
})

// AC: lobby-logo-sin-scroll/AC-2 - los tres botones quedan debajo del logo,
// mismo comportamiento (Continuar deshabilitado sin save, aviso role="alert").
test('AC: lobby-logo-sin-scroll/AC-2 - botones después del logo, comportamiento intacto', () => {
  const html = renderTitle(false, null)
  const atLogo = html.indexOf('<img')
  const atMenu = html.indexOf('data-action="new-game"')
  expect(atLogo).toBeGreaterThanOrEqual(0)
  expect(atMenu).toBeGreaterThan(atLogo)
  expect(html).toContain('data-action="continue" disabled')
  const warning = es.saveInvalid
  const warned = renderTitle(false, warning)
  expect(warned).toContain('role="alert"')
})

// AC: lobby-logo-sin-scroll/AC-3 - sin scroll de página: el shell quita el
// margen con el lobby montado y el logo se limita en dvh (jsdom no mide
// layout ⇒ se verifica la CSS fuente).
test('AC: lobby-logo-sin-scroll/AC-3 - shell sin margen y logo acotado en dvh ⇒ sin scroll', () => {
  const block = appCss.slice(appCss.indexOf('.shell:has([data-title-screen])'))
  expect(block).toContain('margin: 0')
  const logo = gameCss.slice(gameCss.indexOf('.logo'), gameCss.indexOf('.menu'))
  expect(logo).toContain('max-height')
  expect(logo).toMatch(/\d+dvh/)
})

// AC: lobby-logo-sin-scroll/AC-4 - responsivo sin recortes: ancho auto con
// object-fit contain y botones ≥ 44px también en viewports angostos/bajos.
test('AC: lobby-logo-sin-scroll/AC-4 - logo responsivo y botones ≥ 44px', () => {
  const logo = gameCss.slice(gameCss.indexOf('.logo'), gameCss.indexOf('.menu'))
  expect(logo).toContain('width: auto')
  expect(logo).toContain('max-width: 100%')
  expect(logo).toContain('object-fit: contain')
  expect(gameCss).toContain('min-height: 44px')
})

// AC: lobby-logo-sin-scroll/AC-5 - appSubtitle eliminada de es.ts y su texto
// no aparece en la pantalla.
test('AC: lobby-logo-sin-scroll/AC-5 - appSubtitle fuera de es.ts y del HTML', () => {
  expect(es).not.toHaveProperty('appSubtitle')
  expect(renderTitle(false, null)).not.toContain('MVP-0')
})
