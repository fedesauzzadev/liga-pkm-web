// AC: SPEC-G/T-064/AC-1/AC-2/AC-4 — la carta DOM del robo: fases, giro, caras
// por tipo, speed/reducedMotion y no-bloqueo. Proxy SSR (sin WebGL ni layout).
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { cardOf } from '../game/content'
import { es } from '../i18n/es'
import { BOARD3D } from '../theme/board3d'
import { DrawnCard } from './DrawnCard'

const origin = { x: 120, y: 90, w: 800, h: 600 }

const html = (props: Partial<Parameters<typeof DrawnCard>[0]>): string =>
  renderToString(
    <DrawnCard
      deck="isla"
      card="element_water"
      phase="fly"
      origin={origin}
      speed="1x"
      reducedMotion={false}
      {...props}
    />,
  )

// AC: SPEC-G/T-064/AC-1 - carta DOM visible con giro rotateY 0→180° en 700 ms a 1×.
test('AC-1 fase fly: vuela del origen al centro con giro de 700 ms', () => {
  const fly = html({ phase: 'fly' })
  expect(fly).toContain('data-testid="drawn-card"')
  expect(fly).toContain('data-phase="fly"')
  expect(fly).toContain(`transform ${String(BOARD3D.draw.flyMs)}ms`)
  expect(fly).toContain('rotateY(180deg)')
  expect(fly).toContain(`translate(${String(origin.w / 2 - BOARD3D.draw.cardWidth / 2)}px`)

  // El highlight arranca en la pila proyectada, boca abajo y sin transición.
  const highlight = html({ phase: 'highlight' })
  expect(highlight).toContain('data-phase="highlight"')
  expect(highlight).toContain('rotateY(0deg)')
  expect(highlight).toContain(`translate(${String(origin.x - BOARD3D.draw.cardWidth / 2)}px`)
  expect(highlight).toContain('transition:none')
})

// AC: SPEC-G/T-064/AC-2 - cara según el tipo de carta robada.
test('AC-2 PKM muestra la <PkmCard> con el nombre de la carta', () => {
  const card = cardOf('squirtle')
  expect(card).toBeDefined()
  const pkm = html({ card: 'squirtle', phase: 'reveal', deck: 'isla' })
  expect(pkm).toContain('data-kind="pkm"')
  expect(pkm).toContain(card?.name ?? 'Squirtle')
})

test('AC-2 energía e ítem muestran sus caras; el PKM cede al popup al revelar', () => {
  const energy = html({ card: 'element_water', phase: 'reveal' })
  expect(energy).toContain('data-kind="energy"')
  expect(energy).toContain('Energía de Agua')

  const item = html({ card: 'potion', phase: 'reveal', deck: 'item' })
  expect(item).toContain('data-kind="item"')
  expect(item).toContain(es.tileItemNames.potion)

  // done: nada queda en pantalla — la energía/ítem se guardó y el PKM cede al
  // popup-encounter (unificar-popup-encuentro/AC-1, la decisión vive ahí).
  expect(html({ card: 'squirtle', phase: 'done' })).not.toContain('data-testid="drawn-card"')
  expect(html({ card: 'element_water', phase: 'done' })).not.toContain('data-testid="drawn-card"')
})

// AC: SPEC-G/T-064/AC-4 - speed/reducedMotion no bloquean ni animan de más.
test('AC-4 reducedMotion/skip saltan transiciones y el overlay no captura clicks', () => {
  const reduced = html({ reducedMotion: true })
  expect(reduced).toContain('transition:none')
  const skip = html({ speed: 'skip' })
  expect(skip).toContain('transition:none')
  for (const rendered of [reduced, skip, html({ phase: 'stow' })]) {
    expect(rendered).toContain('pointer-events:none')
  }
})
