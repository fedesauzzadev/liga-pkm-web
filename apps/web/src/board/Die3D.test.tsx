import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Die3D } from './Die3D'

describe('Die3D', () => {
  it('AC: SPEC-D/T-032b/AC-1 - el cubo muestra exactamente el valor del motor con 6 caras', () => {
    const html = renderToString(<Die3D value={4} purpose="Dado de ataque" />)

    expect(html).toContain('data-value="4"')
    expect(html).toContain('Dado de ataque')
    expect(html).toContain('aria-label="Dado de ataque: cuatro"')
  })

  it('AC: SPEC-D/T-032b/AC-1 - los 6 valores del dado están representados', () => {
    for (const value of [1, 2, 3, 4, 5, 6] as const) {
      const html = renderToString(<Die3D value={value} purpose="Dado" />)
      expect(html).toContain(`data-value="${value}"`)
    }
  })

  // AC: fix-dado-cara/AC-2
  it('cada valor termina con la rotación que trae al frente su cara', () => {
    const expected: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
      1: 'rotateX(0deg) rotateY(0deg)',
      2: 'rotateY(-90deg)',
      3: 'rotateX(-90deg)',
      4: 'rotateY(90deg)',
      5: 'rotateX(90deg)',
      6: 'rotateY(180deg)',
    }
    for (const value of [1, 2, 3, 4, 5, 6] as const) {
      const html = renderToString(<Die3D value={value} purpose="Dado" />)
      expect(html).toContain(`transform:${expected[value]}`)
    }
  })

  it('AC: SPEC-D/T-032b/AC-4 - el movimiento se respeta con reducedMotion/skip', () => {
    const html = renderToString(<Die3D value={6} purpose="Dado de efecto" reducedMotion />)
    expect(html).toContain('data-value="6"')
    expect(html).toContain('Dado de efecto')

    const skipHtml = renderToString(<Die3D value={2} purpose="Dado de condición" speed="skip" />)
    expect(skipHtml).toContain('data-value="2"')
  })
})
