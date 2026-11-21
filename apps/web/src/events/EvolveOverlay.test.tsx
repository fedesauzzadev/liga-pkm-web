// AC: cargar-charmeleon-animar-evolucion/AC-3, AC-6 — overlay de la animación
// clásica de evolución fuera de combate (SSR + máquina de estados pura): 3
// pulsos crecientes de silueta blanca, destello y revelación de la nueva forma.
// Es puramente cosmética (animación ≠ lógica) y se omite con reducedMotion o
// velocidad skip; los timings viven en anim.config y los textos en i18n/es.
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import type { PkmEvolved } from '@liga/engine'
import { es } from '../i18n/es'
import { ANIMATION_CONFIG } from './anim.config'
import {
  EVOLVE_START,
  EvolveOverlay,
  EvolveOverlayView,
  evolveShowFromEvent,
  evolveStepMs,
  nextEvolveState,
  type EvolveState,
} from './EvolveOverlay'

const overlayHtml = (overrides: Partial<Parameters<typeof EvolveOverlay>[0]> = {}): string =>
  renderToString(
    <EvolveOverlay
      fromUrl="/sprites/4.gif"
      fromName="Charmander"
      toUrl="/sprites/5.gif"
      toName="Charmeleon"
      {...overrides}
    />,
  )

const viewHtml = (phase: 'pulse' | 'flash' | 'reveal', pulse = 1): string =>
  renderToString(
    <EvolveOverlayView
      phase={phase}
      pulse={pulse}
      fromUrl="/sprites/4.gif"
      fromName="Charmander"
      toUrl="/sprites/5.gif"
      toName="Charmeleon"
    />,
  )

// AC: cargar-charmeleon-animar-evolucion/AC-3 - secuencia clásica completa:
// arranca en la silueta del sprite actual (pulso 1), la máquina avanza por 3
// pulsos crecientes → destello → revelación → done, y la vista muestra la
// NUEVA forma recién en 'reveal' (antes nunca aparece el sprite destino).
test('AC: cargar-charmeleon-animar-evolucion/AC-3 - 3 pulsos crecientes de silueta, destello y revelación de la nueva forma', () => {
  const html = overlayHtml()
  expect(html).toContain('data-testid="evolve-overlay"')
  expect(html).toContain('data-phase="pulse"')
  expect(html).toContain('data-pulse="1"')
  expect(html).toContain('data-silhouette="true"')
  expect(html).toContain('src="/sprites/4.gif"')
  expect(html).not.toContain('src="/sprites/5.gif"')

  const states: EvolveState[] = [EVOLVE_START]
  while (states[states.length - 1]!.phase !== 'done') {
    states.push(nextEvolveState(states[states.length - 1]!))
  }
  expect(states.map((state) => state.phase)).toEqual([
    'pulse', 'pulse', 'pulse', 'flash', 'reveal', 'done',
  ])
  expect(states.filter((state) => state.phase === 'pulse').map((state) => state.pulse)).toEqual([1, 2, 3])

  expect(viewHtml('flash')).toContain('data-flash="true"')
  const reveal = viewHtml('reveal', 3)
  expect(reveal).toContain('data-phase="reveal"')
  expect(reveal).toContain('data-reveal="true"')
  expect(reveal).toContain('src="/sprites/5.gif"')
  expect(reveal).not.toContain('data-silhouette="true"')
})

// AC: cargar-charmeleon-animar-evolucion/AC-3 - puramente cosmética: se omite
// (render vacío) con reducedMotion o velocidad skip, y el derivado de datos es
// una función pura (cartas + manifest → nombres/URLs) que nunca lanza.
test('AC: cargar-charmeleon-animar-evolucion/AC-3 - se omite con reducedMotion o skip; el derivado de sprites es puro', () => {
  expect(overlayHtml({ reducedMotion: true })).toBe('')
  expect(overlayHtml({ speed: 'skip' })).toBe('')
  const event: PkmEvolved = {
    type: 'PkmEvolved', player: 'p1', pkmUid: 'p1-a', from: 'charmander', to: 'charmeleon',
  }
  expect(evolveShowFromEvent(event, () => undefined, null)).toEqual({
    fromName: 'charmander', fromUrl: null, toName: 'charmeleon', toUrl: null,
  })
})

// AC: cargar-charmeleon-animar-evolucion/AC-6 - timings desde anim.config (la
// máquina usa evolvePulses/evolvePulseMs/evolveRevealMs del config, sin
// constantes propias) y el presupuesto completo de la secuencia de combate
// (pulsos + destello + revelación + mensaje, AC-4) queda ≤ 3,5 s a 1×.
test('AC: cargar-charmeleon-animar-evolucion/AC-6 - timings de anim.config y presupuesto ≤ 3,5 s', () => {
  expect(evolveStepMs({ phase: 'pulse', pulse: 1 })).toBe(ANIMATION_CONFIG.evolvePulseMs)
  expect(evolveStepMs({ phase: 'flash', pulse: 3 })).toBe(ANIMATION_CONFIG.battle.evolveFlashMs)
  expect(evolveStepMs({ phase: 'reveal', pulse: 3 })).toBe(ANIMATION_CONFIG.evolveRevealMs)
  expect(nextEvolveState({ phase: 'pulse', pulse: ANIMATION_CONFIG.evolvePulses }).phase).toBe('flash')
  const total =
    ANIMATION_CONFIG.evolvePulses * ANIMATION_CONFIG.evolvePulseMs +
    ANIMATION_CONFIG.battle.evolveFlashMs +
    ANIMATION_CONFIG.evolveRevealMs +
    ANIMATION_CONFIG.battle.messageMs
  expect(total).toBeLessThanOrEqual(3500)
  expect(es.evolveOverlayLabel.length).toBeGreaterThan(0)
  expect(overlayHtml()).toContain('--evolve-pulse-ms')
})
