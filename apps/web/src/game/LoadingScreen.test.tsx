// @vitest-environment jsdom
// AC: pantalla-carga-tablero — overlay a pantalla completa (imagen fullhd +
// "Cargando…" + spinner) que tapa tablero/HUD hasta que el tablero terminó de
// renderizar; salida con fade ~300ms (instantánea con reducedMotion) y ningún
// camino alternativo (2D, sin WebGL, chunk 3D con error) cuelga la carga.
// Un test por AC (AC-7), con @testing-library/react (jsdom) + chequeo de la
// CSS fuente para lo que jsdom no ejercita (posicionamiento/cover).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Result } from '@liga/engine'
import { Board3DBoundary } from '../board/BoardHost'
import { useGameStore } from '../events/store'
import { es } from '../i18n/es'
import { gameContent } from './content'
import { LoadingScreen } from './LoadingScreen'
import { PlayScreen } from './PlayScreen'
import { createMemoryStorage } from './save'
import { startSession, type GameSession } from './session'

function must<T>(result: Result<T, { readonly message: string }>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

const started: GameSession = must(startSession({ seed: 7, starterDeck: 'isla' }, gameContent))
// jsdom cambia import.meta.url a http://: las lecturas de fuente van por cwd.
const gameDir = join(process.cwd(), 'apps', 'web', 'src', 'game')
const css = readFileSync(join(gameDir, 'loading.module.css'), 'utf8')

const renderPlay = (boardMode: '2d' | '3d' = '3d'): ReturnType<typeof render> =>
  render(
    <PlayScreen
      session={started}
      storage={createMemoryStorage()}
      onExit={() => undefined}
      boardMode={boardMode}
    />,
  )

afterEach(() => {
  cleanup()
  useGameStore.setState({ reducedMotion: false })
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// AC: pantalla-carga-tablero/AC-1 - al montar PlayScreen hay un overlay a
// pantalla completa (imagen fullhd + "Cargando…" + spinner) sobre el tablero.
test('AC: pantalla-carga-tablero/AC-1 - overlay con imagen, texto y spinner cubre el viewport', () => {
  vi.useFakeTimers()
  const { container } = renderPlay()
  const overlay = container.querySelector('[data-testid="loading-screen"]')
  expect(overlay).not.toBeNull()
  expect(overlay?.textContent).toContain(es.loading)
  expect(container.querySelector('[data-testid="loading-spinner"]')).not.toBeNull()
  // la imagen de fondo llena el viewport sin deformarse (object-fit: cover).
  const img = overlay?.querySelector('img')
  expect(img?.getAttribute('src')).toContain('loading')
  expect(css).toContain('object-fit: cover')
  // el overlay es fijo, cubre todo y queda por encima del shell (AC-1/AC-2).
  expect(css).toContain('position: fixed')
  expect(css).toContain('inset: 0')
})

// AC: pantalla-carga-tablero/AC-2 - mientras el overlay está activo no se
// interactúa con el tablero/HUD: el shell queda inert y el overlay tapa todo;
// al terminar el fade el shell vuelve a ser interactivo.
test('AC: pantalla-carga-tablero/AC-2 - shell inert (puntero/teclado) hasta que termina la carga', () => {
  vi.useFakeTimers()
  const { container } = renderPlay()
  const shell = container.querySelector('[data-testid="game-shell"]')
  const wrapper = shell?.parentElement
  expect(wrapper?.hasAttribute('inert')).toBe(true)
  expect(css).toContain('z-index: 1000')
  act(() => {
    vi.advanceTimersByTime(400)
  })
  expect(container.querySelector('[data-testid="loading-screen"]')).toBeNull()
  expect(wrapper?.hasAttribute('inert')).toBe(false)
})

// AC: pantalla-carga-tablero/AC-3 - el tablero listo dispara un fade corto
// (~300ms) y con reducedMotion el cambio es instantáneo (sin fade).
test('AC: pantalla-carga-tablero/AC-3 - fade ~300ms al revelar; instantáneo con reducedMotion', () => {
  vi.useFakeTimers()
  // Con fade: el overlay pasa a leaving (opacidad 0) y desmonta tras 300ms.
  const withFade = renderPlay()
  const overlay = withFade.container.querySelector('[data-testid="loading-screen"]')
  expect(overlay?.getAttribute('data-leaving')).toBe('true')
  act(() => {
    vi.advanceTimersByTime(299)
  })
  expect(withFade.container.querySelector('[data-testid="loading-screen"]')).not.toBeNull()
  act(() => {
    vi.advanceTimersByTime(1)
  })
  expect(withFade.container.querySelector('[data-testid="loading-screen"]')).toBeNull()
  expect(css).toContain('transition: opacity 300ms ease')
  cleanup()
  // reducedMotion: revelado directo, sin estado leaving intermedio.
  useGameStore.setState({ reducedMotion: true })
  const instant = renderPlay()
  expect(instant.container.querySelector('[data-testid="loading-screen"]')).toBeNull()
})

// AC: pantalla-carga-tablero/AC-4 - los caminos alternativos también revelan:
// sin WebGL (jsdom) el modo 3D cae al 2D y la señal se emite igual; si el
// chunk 3D revienta al cargar, el boundary muestra el 2D y llama onReady.
test('AC: pantalla-carga-tablero/AC-4 - fallback 2D y error del chunk 3D revelan el tablero', () => {
  vi.useFakeTimers()
  // (a) sin WebGL: BoardHost cae al 2D y el overlay se levanta igual.
  const { container } = renderPlay()
  act(() => {
    vi.advanceTimersByTime(400)
  })
  expect(container.querySelector('[data-testid="board-2d"]')).not.toBeNull()
  expect(container.querySelector('[data-testid="board-fallback-note"]')).not.toBeNull()
  expect(container.querySelector('[data-testid="loading-screen"]')).toBeNull()
  cleanup()
  // (b) chunk 3D con error: el boundary renderiza el 2D y emite onReady.
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const Thrower = (): ReactNode => {
    throw new Error('boom: chunk 3D')
  }
  const onReady = vi.fn()
  render(
    <Board3DBoundary boardProps={{ position: 'paleta', pending: null }} onReady={onReady}>
      <Thrower />
    </Board3DBoundary>,
  )
  expect(screen.queryByTestId('board-2d')).not.toBeNull()
  expect(onReady).toHaveBeenCalledTimes(1)
  expect(consoleError).toHaveBeenCalled()
})

// AC: pantalla-carga-tablero/AC-5 - en ningún momento el tablero se ve a
// medias: el <p board-3d-loading> dejó de existir como feedback (el overlay
// tapa la carga del chunk; el Suspense ya no muestra nada propio).
test('AC: pantalla-carga-tablero/AC-5 - sin <p board-3d-loading>: el overlay es el único feedback', () => {
  vi.useFakeTimers()
  for (const mode of ['3d', '2d'] as const) {
    const { container } = renderPlay(mode)
    expect(container.querySelector('[data-testid="board-3d-loading"]')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(container.querySelector('[data-testid="board-3d-loading"]')).toBeNull()
    expect(container.querySelector('[data-testid="loading-screen"]')).toBeNull()
    cleanup()
  }
})

// AC: pantalla-carga-tablero/AC-6 - el texto vive en i18n/es (español
// rioplatense) y el spinner es CSS puro, sin dependencias nuevas.
test('AC: pantalla-carga-tablero/AC-6 - texto de es.ts + spinner CSS puro, sin dependencias nuevas', () => {
  expect(es.loading).toBe('Cargando…')
  const { container } = render(<LoadingScreen />)
  expect(container.textContent).toBe(es.loading)
  // spinner CSS puro: keyframes + borde, sin imágenes ni libs de animación.
  expect(css).toContain('@keyframes loading-spin')
  expect(css).toContain('border-top-color')
  const source = readFileSync(join(gameDir, 'LoadingScreen.tsx'), 'utf8')
  expect(source).toContain("from '../i18n/es'")
  expect(source).not.toMatch(/from '(motion|framer-motion|lucide|@react-three)/)
})
