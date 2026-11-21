// @vitest-environment jsdom
// AC: unificar-popup-encuentro/AC-1..AC-6, AC-8 — popup de encuentro salvaje:
// UN solo popup para FightOrRelease (carta CardFace a la izquierda, decisión a
// la derecha), geometría centrada en el safeArea sin tocar el HUD, comandos
// FightEncounter/ReleaseWild y carta de solo lectura. (AC-7 vive en
// packages/engine/src/index.test.ts.)
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { boxesOverlap, parseCardId } from '@liga/content'
import type { Result } from '@liga/engine'
import { cardOf, gameContent } from '../game/content'
import { startSession, applyToSession, type GameSession } from '../game/session'
import { PlayScreen } from '../game/PlayScreen'
import { createMemoryStorage } from '../game/save'
import { es } from '../i18n/es'
import { EncounterPopup, type EncounterFightOption } from './EncounterPopup'
import {
  encounterAllowedRect,
  encounterConfig,
  encounterGeometry,
  encounterObstacles,
  preloadSprite,
} from './encounter-model'
import { uiLayout } from '../shell/layout'

function must<T>(result: Result<T, { readonly message: string }>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

const abra = cardOf('abra')
if (abra === undefined) throw new Error('falta la carta abra en el contenido')

// CardFace ajusta el nombre con ResizeObserver, que jsdom no trae.
class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', FakeResizeObserver)

const OPTIONS: readonly EncounterFightOption[] = [
  { uid: 'p1-starter', name: 'Charmander', hpCur: 50, hpMax: 60, active: true },
  { uid: 'p1-catch-1', name: 'Poliwag', hpCur: 70, hpMax: 70, active: false },
]

const commands: unknown[] = []
const popup = (options: readonly EncounterFightOption[] = OPTIONS): HTMLElement => {
  const { container } = render(
    <EncounterPopup
      card={abra}
      deckName={es.tileDeckNames.pantano}
      options={options}
      artUrl={null}
      onCommand={(command) => commands.push(command)}
    />,
  )
  return container
}

afterEach(() => {
  cleanup()
  commands.length = 0
  vi.restoreAllMocks()
})

// AC: unificar-popup-encuentro/AC-1 — con FightOrRelease existe UN solo
// popup-encounter, NO hay popup-card y el tile-panel desaparece (la decisión
// ya no se duplica).
test('AC-1 PlayScreen con FightOrRelease: un popup-encounter, sin popup-card ni tile-panel', () => {
  const base = must(startSession({ seed: 1, starterDeck: 'montana' }, gameContent))
  const session: GameSession = must(
    applyToSession(base, { type: 'DebugEncounter', deck: 'pantano', card: parseCardId('abra') }, gameContent),
  ).session
  expect(session.state.pending?.type).toBe('FightOrRelease')
  const { container } = render(
    <PlayScreen session={session} storage={createMemoryStorage()} onExit={() => undefined} />,
  )
  expect(container.querySelectorAll('[data-testid="popup-encounter"]').length).toBe(1)
  expect(container.querySelectorAll('[data-testid="popup-card"]').length).toBe(0)
  expect(container.querySelectorAll('[data-testid="tile-panel"]').length).toBe(0)
})

// AC: unificar-popup-encuentro/AC-2 — geometría pura en los 3 tamaños del spec:
// caja dentro del safeArea con 12 px de margen, alto ≤ 760, sin tocar NINGÚN
// panel del HUD, y ancho = carta×aspecto + gap + columna clamp(280..340).
test('AC-2 geometría: centrada en el safeArea, sin paneles, en 1024×600/1366×768/1920×1080', () => {
  for (const [vw, vh] of [
    [1024, 600],
    [1366, 768],
    [1920, 1080],
  ] as const) {
    const geo = encounterGeometry(vw, vh, encounterConfig, uiLayout)
    const rect = encounterAllowedRect(vw, vh, encounterConfig, uiLayout)
    expect(geo.window.h, `${String(vw)}×${String(vh)} alto`).toBeLessThanOrEqual(
      encounterConfig.maxHeightPx,
    )
    expect(geo.window.x, `${String(vw)}×${String(vh)} x0`).toBeGreaterThanOrEqual(rect.x - 0.5)
    expect(geo.window.y, `${String(vw)}×${String(vh)} y0`).toBeGreaterThanOrEqual(rect.y - 0.5)
    expect(geo.window.x + geo.window.w, `${String(vw)}×${String(vh)} x1`).toBeLessThanOrEqual(
      rect.x + rect.w + 0.5,
    )
    expect(geo.window.y + geo.window.h, `${String(vw)}×${String(vh)} y1`).toBeLessThanOrEqual(
      rect.y + rect.h + 0.5,
    )
    // Centrada en el rectángulo permitido.
    expect(geo.window.x - rect.x).toBeCloseTo((rect.w - geo.window.w) / 2, 0)
    expect(geo.window.y - rect.y).toBeCloseTo((rect.h - geo.window.h) / 2, 0)
    // Sin intersección con ningún panel del HUD.
    expect(geo.coversPanel, `${String(vw)}×${String(vh)} coversPanel`).toBe(false)
    for (const obstacle of encounterObstacles(uiLayout, vw, vh)) {
      expect(boxesOverlap(geo.window, obstacle), `${String(vw)}×${String(vh)} solapa un panel`).toBe(
        false,
      )
    }
    // Piezas: carta con aspecto fijo y columna de botones en su rango.
    expect(geo.cardW / geo.cardH).toBeCloseTo(encounterConfig.aspect, 5)
    expect(geo.sideW).toBeGreaterThanOrEqual(encounterConfig.buttons.minPx)
    expect(geo.sideW).toBeLessThanOrEqual(encounterConfig.buttons.maxPx)
    expect(geo.window.w).toBeCloseTo(
      encounterConfig.padPx * 2 + geo.cardW + encounterConfig.gapPx + geo.sideW,
      1,
    )
  }
})

// AC: unificar-popup-encuentro/AC-3 — misma carta grande que T-101: CardFace
// con nombre, HP, ataques y pie; instancia sintética wild-<cardId> SIN acciones.
test('AC-3 columna izquierda: CardFace de solo lectura con la instancia sintética del salvaje', () => {
  const container = popup()
  const face = container.querySelector('[data-testid="card-face"]')
  expect(face).not.toBeNull()
  expect(face?.getAttribute('data-uid')).toBe(`wild-${abra.id}`)
  expect(face?.textContent).toContain(abra.name)
  expect(face?.querySelector('[data-testid="card-header"]')).not.toBeNull()
  expect(face?.querySelector('[data-testid="card-attacks"]')).not.toBeNull()
  expect(face?.querySelector('[data-testid="card-footer"]')).not.toBeNull()
  expect(face?.getAttribute('data-hp') ?? face?.textContent).toBeTruthy()
  // Solo lectura: ningún comando nace de la carta (los botones viven en la columna derecha).
  expect(face?.querySelector('button')).toBeNull()
  expect(face?.querySelector('[data-command]')).toBeNull()
})

// AC: unificar-popup-encuentro/AC-3 — precarga del sprite: ok la muestra, y
// falla/timeout/sin manifest dejan el recuadro con el motivo en console.warn.
test('AC-3 precarga de sprite: ok/fallo/timeout/sin manifest', async () => {
  vi.useFakeTimers()
  const warn = vi.fn()
  const makeImage = (fire: 'load' | 'error' | 'never') => () => ({
    set src(_url: string) {
      if (fire === 'load') queueMicrotask(() => this.onload?.())
      if (fire === 'error') queueMicrotask(() => this.onerror?.())
    },
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
  })
  const ok = await preloadSprite('/sprites/63.png', 600, warn, makeImage('load'))
  expect(ok.ok).toBe(true)
  const failed = await preloadSprite('/sprites/63.png', 600, warn, makeImage('error'))
  expect(failed.ok).toBe(false)
  expect(warn).toHaveBeenCalledTimes(1)
  const never = preloadSprite('/sprites/63.png', 600, warn, makeImage('never'))
  const marker = Symbol('marker')
  const race = Promise.race([
    never,
    new Promise<symbol>((resolve) => setTimeout(() => resolve(marker), 700)),
  ])
  await vi.advanceTimersByTimeAsync(700)
  const timed = await race
  if (typeof timed === 'symbol') throw new Error('el timeout de precarga no disparó')
  expect(timed.ok).toBe(false)
  expect(timed.reason).toContain('timeout')
  const noManifest = await preloadSprite(null, 600, warn)
  expect(noManifest.ok).toBe(false)
  expect(warn.mock.calls.some((call) => call[0].includes('sin manifest'))).toBe(true)
  vi.useRealTimers()
})

// AC: unificar-popup-encuentro/AC-4 — título, subtítulo, un botón por PKM sano
// (activo primero, HP chico) y Dejar ir al final; sin sanos, aviso + solo
// Dejar ir. Foco inicial en el primer botón; Esc NO cierra.
test('AC-4 columna derecha: título, subtítulo, botones por sano con HP y release; Esc no cierra', () => {
  const container = popup()
  expect(container.textContent).toContain(es.playWildAppeared.replace('{name}', abra.name))
  expect(container.textContent).toContain(
    es.tileMsgCardDrawn.replace('{card}', abra.name).replace('{deck}', es.tileDeckNames.pantano),
  )
  const fight = container.querySelectorAll<HTMLButtonElement>('[data-testid^="btn-fight-"]')
  expect(fight.length).toBe(2)
  expect(fight[0]?.getAttribute('data-pkm-uid')).toBe('p1-starter')
  expect(fight[0]?.getAttribute('data-active')).toBe('true')
  // Foco inicial en el primer botón de pelea (React lo enfoca al montar).
  expect(document.activeElement).toBe(fight[0])
  expect(fight[0]?.textContent).toContain(
    es.encounterHpLabel.replace('{cur}', '50').replace('{max}', '60'),
  )
  const release = container.querySelector<HTMLButtonElement>('[data-testid="btn-release"]')
  expect(release).not.toBeNull()
  // Último botón del listado.
  const all = container.querySelectorAll('button')
  expect(all[all.length - 1]).toBe(release)
  // Esc NO cierra el popup (la decisión es obligatoria).
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(container.querySelector('[data-testid="popup-encounter"]')).not.toBeNull()
})

test('AC-4 sin Pokémon sanos: aviso y solo Dejar ir (con foco)', () => {
  const container = popup([])
  expect(container.querySelector('[data-testid="encounter-no-healthy"]')?.textContent).toBe(
    es.encounterNoHealthy,
  )
  expect(container.querySelectorAll('[data-testid^="btn-fight-"]').length).toBe(0)
  const release = container.querySelector<HTMLButtonElement>('[data-testid="btn-release"]')
  // Sin sanos, el foco inicial cae en Dejar ir.
  expect(document.activeElement).toBe(release)
})

// AC: unificar-popup-encuentro/AC-5 — pelear envía el comando EXISTENTE
// FightEncounter con el uid del botón.
test('AC-5 clic en btn-fight-<uid> envía FightEncounter con ese pkmUid', () => {
  const container = popup()
  fireEvent.click(container.querySelector('[data-testid="btn-fight-p1-catch-1"]')!)
  expect(commands).toEqual([{ type: 'FightEncounter', pkmUid: 'p1-catch-1' }])
})

// AC: unificar-popup-encuentro/AC-6 — dejar ir envía ReleaseWild (el turno
// avanza y la carta va al fondo: regresión cubierta en el motor, AC-7).
test('AC-6 clic en btn-release envía ReleaseWild', () => {
  const container = popup()
  fireEvent.click(container.querySelector('[data-testid="btn-release"]')!)
  expect(commands).toEqual([{ type: 'ReleaseWild' }])
})

// AC: unificar-popup-encuentro/AC-8 — un clic sobre la carta no abre nada
// nuevo (ni modal-card ni otro popup) ni manda comandos.
test('AC-8 clic sobre card-face no abre nada ni envía comandos', () => {
  const container = popup()
  fireEvent.click(container.querySelector('[data-testid="card-face"]')!)
  expect(container.querySelectorAll('[data-testid="popup-encounter"]').length).toBe(1)
  expect(container.querySelector('[data-card-modal="true"]')).toBeNull()
  expect(commands).toEqual([])
})
