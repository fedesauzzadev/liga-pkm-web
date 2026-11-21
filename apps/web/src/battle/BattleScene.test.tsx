// @vitest-environment jsdom
// AC: rediseno-combate-max/AC-0, AC-6 (escena) — estructura del lienzo y las
// pestañas por proxy SSR (renderToString); la geometría real (escala uniforme,
// orden en x, sin scroll, sin solapes) la mide e2e/rediseno-combate-max.mjs.
// reemplazo-tras-desmayo/AC-1,AC-4,AC-6 — forceSwitch: pestaña Cambiar forzada
// mientras penda el reemplazo (render real con @testing-library/react).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import type { Face } from '@liga/content'
import { demoBattleSceneProps } from './demo'
import { es } from '../i18n/es'
import { DIE_EFFECT_DELAY_MS, DIE_ROLL_SETTLE_MS, rollDurationMs } from './dieTiming'
import type { BattleDieSpeed } from './BattleDie'
import { BattleScene, type BattleDieView, type BattleSceneProps } from './BattleScene'

afterEach(cleanup)

const renderScene = (overrides: Partial<BattleSceneProps> = {}): string =>
  renderToString(<BattleScene {...demoBattleSceneProps} spritesOverride={null} {...overrides} />)

const layerIndex = (html: string, layer: string): number => html.indexOf(`data-layer="${layer}"`)

test('AC: SPEC-D/T-032a/AC-1 - capas del recuadro en orden fondo → sprites → FX → HUD', () => {
  const html = renderScene()
  expect(layerIndex(html, 'background')).toBeGreaterThanOrEqual(0)
  expect(layerIndex(html, 'background')).toBeLessThan(layerIndex(html, 'sprites'))
  expect(layerIndex(html, 'sprites')).toBeLessThan(layerIndex(html, 'fx'))
  expect(layerIndex(html, 'fx')).toBeLessThan(layerIndex(html, 'hud'))
  // La capa de FX nunca captura clicks (ADR-6).
  expect(html).toContain('pointer-events:none')
  expect(html).toContain('data-side="rival"')
  expect(html).toContain('data-side="player"')
})

test('AC: rediseno-combate-max/AC-0 - lienzo battle-stage con las 3 columnas (carta+dado / recuadro+tabs+acciones / carta+dado)', () => {
  const html = renderScene()
  expect(html).toContain('data-testid="battle-stage"')
  expect(html).toContain('data-testid="battle-arena"')
  expect(html).toContain('data-testid="battle-card-mine"')
  expect(html).toContain('data-testid="battle-card-enemy"')
  expect(html).toContain('data-testid="battle-die-mine"')
  expect(html).toContain('data-testid="battle-die-enemy"')
  // Orden DOM: carta mía → recuadro → carta enemiga.
  expect(html.indexOf('battle-card-mine')).toBeLessThan(html.indexOf('battle-arena'))
  expect(html.indexOf('battle-arena')).toBeLessThan(html.indexOf('battle-card-enemy"'))
})

test('AC: rediseno-combate-max/AC-6 - pestañas Atacar/Cambiar/Mochila/Dejar ir; inicial Atacar', () => {
  const html = renderScene()
  expect(html).toContain('data-testid="battle-tabs"')
  expect(html).toContain('data-testid="tab-attack"')
  expect(html).toContain('data-testid="tab-switch"')
  expect(html).toContain('data-testid="tab-bag"')
  expect(html).toContain('data-testid="tab-release"')
  expect(html).toContain('data-selected="true"') // Atacar activa
  expect(html).toContain(es.battleTabSwitch)
  expect(html).toContain(es.battleTabBag)
  expect(html).toContain(es.battleTabRelease)
})

test('AC: rediseno-combate-max/AC-6 - panel de acciones con btn-accept/btn-cancel y botones de ataque', () => {
  const html = renderScene()
  expect(html).toContain('data-testid="battle-actions"')
  expect(html).toContain('data-testid="btn-accept"')
  expect(html).toContain('data-testid="btn-cancel"')
  expect(html).toContain('data-testid="btn-attack-1"')
  expect(html).toContain('data-testid="btn-attack-2"')
  // Elegir sin selección: Aceptar arranca deshabilitado.
  expect(html.match(/data-testid="btn-accept"[^>]*disabled=""/) !== null).toBe(true)
})

test('AC: rediseno-combate-max/AC-6 - espectador: pestañas deshabilitadas y "Turno de {nombre}"', () => {
  const html = renderScene({ myTurn: false, turnOfName: 'Jugador 2' })
  expect(html).toContain('data-testid="battle-turn-of"')
  expect(html).toContain(es.hudTurnOf.replace('{name}', 'Jugador 2'))
  // Las pestañas quedan deshabilitadas (disabled real).
  expect(html.match(/data-testid="tab-attack"[^>]*disabled=""/) !== null).toBe(true)
})

test('AC: rediseno-combate-max/AC-6 - bloqueado (animaciones): panel bloqueado', () => {
  const html = renderScene({ blocked: true })
  expect(html.match(/data-testid="btn-accept"[^>]*disabled=""/) !== null).toBe(true)
  expect(html.match(/data-testid="tab-attack"[^>]*disabled=""/) !== null).toBe(true)
})

test('AC: SPEC-D/T-032a/AC-5 - DieRolled{attackSelect} ilumina la fila rival; 6 ⇒ "no ataca"', () => {
  const lit = renderScene({ attackSelectValue: 4 as Face })
  expect(lit).toContain('data-lit="true"')
  const none = renderScene({ attackSelectValue: 6 as Face })
  expect(none).toContain(es.battleNoAttack)
})

test('AC: SPEC-D/T-032d/AC-1 - los visuals de la coreografía se dibujan (barrido, entrada, parpadeo, levantada, flash, captura, flotantes)', () => {
  const html = renderScene({
    visuals: {
      sweep: true,
      entranceSides: ['rival'],
      blinkSide: 'rival',
      raisedSide: 'rival',
      faintedSides: ['player'],
      flash: 'evolve',
      capture: { phase: 'shake', shakes: 2 },
      floaters: [{ id: 1, side: 'rival', text: '-20', tone: 'damage' }],
    },
  })
  expect(html).toContain('data-sweep="true"')
  expect(html).toContain('data-enter="true"')
  expect(html).toContain('data-blink="true"')
  expect(html).toContain('data-fainted="true"')
  expect(html).toContain('data-raised="true"')
  expect(html).toContain('data-flash="evolve"')
  expect(html).toContain('data-capture="shake"')
  expect(html).toContain('data-shakes="2"')
  expect(html).toContain('data-floater="-20"')
})

// AC: cargar-charmeleon-animar-evolucion/AC-4 - visual de evolución intacto.
test('AC: cargar-charmeleon-animar-evolucion/AC-4 - silueta pulsante en el lado correcto', () => {
  const html = renderScene({ visuals: { evolve: { side: 'player', phase: 'pulse', pulse: 2 } } })
  expect(html).toContain('data-evolve="pulse"')
  expect(html).toContain('data-pulse="2"')
  expect(html).toContain('--evolve-pulse-ms:320ms')
  const reveal = renderScene({ visuals: { evolve: { side: 'rival', phase: 'reveal', pulse: 0 } } })
  expect(reveal).toContain('data-evolve="reveal"')
  expect(reveal).toContain('--evolve-reveal-ms:500ms')
})

// AC: SPEC-I/T-075/AC-2 (Q-037) - la carta rival sigue siendo destino de drop
// de bolas (T-073): data-drop-target="rival" (nota n.º 9: también rival-card
// se conserva como testid del wrapper).
test('AC: SPEC-I/T-075/AC-2 - la carta enemiga marca data-drop-target="rival"', () => {
  const html = renderScene()
  expect(html).toContain('data-drop-target="rival"')
})

// ── rediseno-combate-max/AC-2: dado por lado ──

test('AC: rediseno-combate-max/AC-2 - la tirada alimenta el dado del lado que juega con etiqueta de propósito', () => {
  const html = renderScene({ die: { value: 3, purpose: 'gate', side: 'player', nonce: 1, chain: 1 } })
  expect(html).toContain('data-testid="battle-die-mine"')
  expect(html).toContain('data-purpose="gate"')
  expect(html).toContain(es.battleDieMine)
  const rival = renderScene({ die: { value: 4, purpose: 'attackSelect', side: 'rival', nonce: 2, chain: 1 } })
  expect(rival).toContain('data-testid="battle-die-enemy"')
  expect(rival).toContain(es.battleDieEnemy)
})

// AC: rediseno-combate-max/AC-2 - tiradas encadenadas muestran el contador.
test('AC: rediseno-combate-max/AC-2 - encadenadas: contador "Tirada n" en la caja del dado', () => {
  const html = renderScene({ die: { value: 6, purpose: 'bonus', side: 'player', nonce: 3, chain: 2 } })
  expect(html).toContain(es.battleDieRoll.replace('{n}', '2'))
})

// ── fix-animacion-dados-combate: el dado expone el valor del evento ──

const dieValueOf = (html: string, testid: string): string | null =>
  new RegExp(`data-testid="${testid}"[^>]*data-value="(\\d)"`).exec(html)?.[1] ?? null

const dieAttr = (container: HTMLElement, testid: string): string | null =>
  container.querySelector(`[data-testid="${testid}"]`)?.getAttribute('data-value') ?? null

// AC: fix-animacion-dados-combate/AC-1 - SSR: el dado del lado de la tirada
// expone data-value = valor del evento (antes arrancaba con value={1} fijo).
test('AC: fix-animacion-dados-combate/AC-1 - el dado expone data-value = valor del evento', () => {
  const mine = renderScene({ die: { value: 3, purpose: 'gate', side: 'player', nonce: 1, chain: 1 } })
  expect(dieValueOf(mine, 'battle-die-mine')).toBe('3')
  expect(dieValueOf(mine, 'battle-die-enemy')).toBe('1')
  const rival = renderScene({ die: { value: 4, purpose: 'attackSelect', side: 'rival', nonce: 2, chain: 1 } })
  expect(dieValueOf(rival, 'battle-die-enemy')).toBe('4')
  expect(dieValueOf(rival, 'battle-die-mine')).toBe('1')
})

// AC: fix-animacion-dados-combate/AC-1 - tras la tirada la cara es la del
// evento; si la tirada pasa al otro lado, el slot propio conserva su número.
test('AC: fix-animacion-dados-combate/AC-1 - el slot anima su tirada y conserva su número', async () => {
  const view = (die: BattleDieView | null) => (
    <BattleScene {...demoBattleSceneProps} spritesOverride={null} die={die} dieSpeed="skip" />
  )
  const { container, rerender } = render(view({ value: 5, purpose: 'bonus', side: 'player', nonce: 1, chain: 1 }))
  await act(async () => {})
  expect(dieAttr(container, 'battle-die-mine')).toBe('5')
  expect(dieAttr(container, 'battle-die-enemy')).toBe('1')
  rerender(view({ value: 2, purpose: 'attackSelect', side: 'rival', nonce: 2, chain: 1 }))
  await act(async () => {})
  expect(dieAttr(container, 'battle-die-mine')).toBe('5') // el número propio queda visible
  expect(dieAttr(container, 'battle-die-enemy')).toBe('2')
})

// AC: dados-legibles/AC-1 - además de los puntos, el resultado se muestra como
// número grande cuando el dado se asienta, y persiste al pasar al otro lado.
test('AC: dados-legibles/AC-1 - el resultado se lee como número (y no antes de asentarse)', async () => {
  const view = (die: BattleDieView | null) => (
    <BattleScene {...demoBattleSceneProps} spritesOverride={null} die={die} dieSpeed="skip" />
  )
  const number = (container: HTMLElement, side: 'mine' | 'enemy'): string | null =>
    container.querySelector(`[data-testid="battle-die-${side}-value"]`)?.textContent ?? null
  const { container, rerender } = render(
    view({ value: 5, purpose: 'bonus', side: 'player', nonce: 1, chain: 1 }),
  )
  expect(number(container, 'mine')).toBeNull() // todavía no se asentó
  await act(async () => {})
  expect(number(container, 'mine')).toBe('5')
  rerender(view({ value: 2, purpose: 'attackSelect', side: 'rival', nonce: 2, chain: 1 }))
  await act(async () => {})
  expect(number(container, 'mine')).toBe('5')
  expect(number(container, 'enemy')).toBe('2')
})

// ── arreglar-dados-combate: dados legibles que siempre terminan ──

const cubeYawOf = (container: HTMLElement, testid: string): number => {
  const cube = container.querySelector(`[data-testid="${testid}"]`)!.firstElementChild!
    .children[1] as HTMLElement
  return Number(/rotateY\((-?\d+)deg\)/.exec(cube.style.transform)?.[1] ?? '999')
}

const rollingOf = (container: HTMLElement, testid: string): string | null =>
  container.querySelector(`[data-testid="${testid}"]`)?.getAttribute('data-rolling') ?? null

// AC: arreglar-dados-combate/AC-1 - al terminar, la cara mira al frente
// (inclinación ≤ 15°) con data-value = valor del evento, en el dado propio y
// en el del rival.
test('AC: arreglar-dados-combate/AC-1 - cara final legible (yaw ≤ 15°) en battle-die-mine y battle-die-enemy', async () => {
  const view = (die: BattleDieView | null) => (
    <BattleScene {...demoBattleSceneProps} spritesOverride={null} die={die} dieSpeed="skip" />
  )
  const { container, rerender } = render(
    view({ value: 3, purpose: 'gate', side: 'player', nonce: 1, chain: 1 }),
  )
  await act(async () => {})
  expect(dieAttr(container, 'battle-die-mine')).toBe('3')
  expect(Math.abs(cubeYawOf(container, 'battle-die-mine'))).toBeLessThanOrEqual(15)
  rerender(view({ value: 6, purpose: 'attackSelect', side: 'rival', nonce: 2, chain: 1 }))
  await act(async () => {})
  expect(dieAttr(container, 'battle-die-enemy')).toBe('6')
  expect(Math.abs(cubeYawOf(container, 'battle-die-enemy'))).toBeLessThanOrEqual(15)
})

// AC: arreglar-dados-combate/AC-2 - cambio de speed/reducedMotion a mitad de
// tirada replanifica (o corta al instante) y el dado nunca queda girando en el
// vacío; el remonte del popup re-dispara la misma tirada y también termina.
test('AC: arreglar-dados-combate/AC-2 - replan por contexto a mitad y remonte: siempre termina', async () => {
  vi.useFakeTimers()
  try {
    const margin = DIE_ROLL_SETTLE_MS + DIE_EFFECT_DELAY_MS
    const dieView: BattleDieView = { value: 5, purpose: 'effect', side: 'player', nonce: 1, chain: 1 }
    const view = (extra: { readonly dieSpeed?: BattleDieSpeed; readonly reducedMotion?: boolean }) => (
      <BattleScene {...demoBattleSceneProps} spritesOverride={null} die={dieView} {...extra} />
    )
    const { container, rerender } = render(view({ dieSpeed: '1x' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20)
    })
    expect(rollingOf(container, 'battle-die-mine')).toBe('true')
    // 1x → 2x a mitad: replanifica la MISMA tirada y termina en 2x + margen.
    rerender(view({ dieSpeed: '2x' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(rollDurationMs(1, '2x') + margin)
    })
    expect(rollingOf(container, 'battle-die-mine')).toBe('false')
    expect(dieAttr(container, 'battle-die-mine')).toBe('5')
    // Vuelve a 1x (re-dispara la tirada) y reducedMotion a mitad: corta ya.
    rerender(view({ dieSpeed: '1x' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20)
    })
    expect(rollingOf(container, 'battle-die-mine')).toBe('true')
    rerender(view({ dieSpeed: '1x', reducedMotion: true }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(rollingOf(container, 'battle-die-mine')).toBe('false')
    expect(dieAttr(container, 'battle-die-mine')).toBe('5')
    // Remonte del popup: el slot remontado re-rueda la tirada y termina.
    rerender(
      <BattleScene
        key="remount"
        {...demoBattleSceneProps}
        spritesOverride={null}
        die={dieView}
        dieSpeed="1x"
      />,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20)
    })
    expect(rollingOf(container, 'battle-die-mine')).toBe('true')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(rollDurationMs(1, '1x') + margin)
    })
    expect(rollingOf(container, 'battle-die-mine')).toBe('false')
    expect(dieAttr(container, 'battle-die-mine')).toBe('5')
  } finally {
    vi.useRealTimers()
  }
})

// ── reemplazo-tras-desmayo: reemplazo obligatorio tras el desmayo del activo ──
// AC: reemplazo-tras-desmayo/AC-1 — con `forceSwitch` (pending ChooseReplacement)
// la pestaña inicial es "Cambiar".
test('AC: reemplazo-tras-desmayo/AC-1 - forceSwitch monta con la pestaña Cambiar seleccionada', () => {
  const html = renderScene({ forceSwitch: true })
  expect(html).toMatch(/data-testid="tab-switch"[^>]*data-selected="true"/)
  expect(html).not.toMatch(/data-testid="tab-attack"[^>]*data-selected="true"/)
})

// AC: reemplazo-tras-desmayo/AC-1 — mientras dure el reemplazo pendiente no se
// puede salir de la pestaña "Cambiar" (los clics en otras pestañas no hacen efecto).
test('AC: reemplazo-tras-desmayo/AC-1 - mientras penda el reemplazo no se puede cambiar de pestaña', () => {
  render(<BattleScene {...demoBattleSceneProps} spritesOverride={null} forceSwitch />)
  expect(screen.getByTestId('tab-switch').getAttribute('data-selected')).toBe('true')
  fireEvent.click(screen.getByTestId('tab-attack'))
  expect(screen.getByTestId('tab-switch').getAttribute('data-selected')).toBe('true')
  expect(screen.getByTestId('tab-attack').getAttribute('data-selected')).toBeNull()
})

// AC: reemplazo-tras-desmayo/AC-4 — sin reemplazo pendiente (sin banca sana ⇒
// BattleEnded, sin ChooseReplacement) la escena NO fuerza la pestaña Cambiar.
test('AC: reemplazo-tras-desmayo/AC-4 - sin forceSwitch no hay fuerza de pestaña (inicial Atacar)', () => {
  const html = renderScene()
  expect(html).toMatch(/data-testid="tab-attack"[^>]*data-selected="true"/)
  expect(html).not.toMatch(/data-testid="tab-switch"[^>]*data-selected="true"/)
})

// AC: reemplazo-tras-desmayo/AC-6 — fuera del reemplazo pendiente el resto de
// pestañas se comporta igual: cambio libre entre Atacar/Cambiar/Mochila/Dejar ir.
test('AC: reemplazo-tras-desmayo/AC-6 - sin forceSwitch las pestañas cambian con normalidad', () => {
  render(<BattleScene {...demoBattleSceneProps} spritesOverride={null} />)
  expect(screen.getByTestId('tab-attack').getAttribute('data-selected')).toBe('true')
  fireEvent.click(screen.getByTestId('tab-switch'))
  expect(screen.getByTestId('tab-switch').getAttribute('data-selected')).toBe('true')
  fireEvent.click(screen.getByTestId('tab-bag'))
  expect(screen.getByTestId('tab-bag').getAttribute('data-selected')).toBe('true')
})

// ── fix-sprites-lideres-gimnasio: líder de gimnasio en su propio slot ──

// AC: fix-sprites-lideres-gimnasio/AC-2 - el líder y el pokémon rival se ven
// SIMULTÁNEAMENTE: dos slots distintos (data-side="trainer" propio + clase
// .trainer) sin que el líder herede la posición/clase de .rival.
test('AC: fix-sprites-lideres-gimnasio/AC-2 - slot .trainer dedicado junto al rival, sin solaparse', () => {
  const html = renderScene({
    spritesOverride: {
      sprites: {},
      trainers: { brock: { front: '/sprites/brock-front.gif' } },
    },
    visuals: { trainerAppeared: 'brock' },
  })
  expect(html).toContain('data-side="trainer"')
  expect(html).toContain('src="/sprites/brock-front.gif"')
  expect(html).toContain('data-side="rival"') // el pokémon rival sigue en escena
  // Slots distintos: el líder NO reusa la clase CSS del rival.
  const trainerClass = /class="([^"]*)"[^>]*data-side="trainer"/.exec(html)?.[1] ?? ''
  const rivalClass = /class="([^"]*)"[^>]*data-side="rival"/.exec(html)?.[1] ?? ''
  expect(trainerClass.length).toBeGreaterThan(0)
  expect(rivalClass.length).toBeGreaterThan(0)
  expect(trainerClass).not.toBe(rivalClass)
  // Las posiciones propias de .trainer/.rival las verifica (con el CSS real)
  // trainer-sprites.test.ts — jsdom no permite leer el archivo acá.
})
