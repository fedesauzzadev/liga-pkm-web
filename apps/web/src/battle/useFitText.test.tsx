// @vitest-environment jsdom
// AC: rediseno-combate-max/AC-4 - useFitText reduce la letra entre base y mín
// 14 px de diseño; si no entra, clampa (2 líneas con elipsis); la caja nunca
// crece (el hook solo cambia font-size/clamp, nunca el tamaño de la caja).
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { useRef, type ReactElement } from 'react'
import { useFitText } from './useFitText'

afterEach(() => {
  cleanup()
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
})

test('AC: rediseno-combate-max/AC-4 - reduce la letra hasta entrar y nunca por debajo del mínimo', async () => {
  const listeners: Array<() => void> = []
  class Observer {
    public observe(): void {
      /* registrado */
    }
    public disconnect(): void {
      /* nada */
    }
  }
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class extends Observer {
    public constructor(callback: () => void) {
      super()
      listeners.push(callback)
    }
  }

  let state = { fontSize: 18, clamped: false }
  function Probe({ overflow }: { readonly overflow: boolean }): ReactElement {
    const ref = useRef<HTMLParagraphElement | null>(null)
    const fit = useFitText(ref, { base: 18, min: 14 })
    state = fit
    return (
      <p
        ref={(element) => {
          ref.current = element
          if (element !== null) {
            Object.defineProperty(element, 'clientHeight', {
              configurable: true,
              get: () => 40,
            })
            Object.defineProperty(element, 'scrollHeight', {
              configurable: true,
              get: () => (overflow ? element.clientHeight + 40 : element.clientHeight),
            })
          }
        }}
        data-testid="fit"
        style={{ fontSize: `${String(fit.fontSize)}px` }}
      >
        texto
      </p>
    )
  }

  // Con overflow permanente: al montar mide, baja al mínimo y clampa.
  const { rerender } = render(<Probe overflow />)
  expect(state.fontSize).toBe(14)
  expect(state.clamped).toBe(true)
  // Sin overflow: el observer re-mide y vuelve a la base.
  rerender(<Probe overflow={false} />)
  await act(async () => {
    listeners.forEach((fire) => fire())
  })
  expect(state.fontSize).toBe(18)
  expect(state.clamped).toBe(false)
})

test('AC: rediseno-combate-max/AC-4 - sin ResizeObserver (SSR) queda en el tamaño base', () => {
  let state = { fontSize: 18, clamped: false }
  function Probe(): ReactElement {
    const ref = useRef<HTMLParagraphElement | null>(null)
    const fit = useFitText(ref, { base: 18, min: 14 })
    state = fit
    return <p ref={ref}>x</p>
  }
  render(<Probe />)
  expect(state.fontSize).toBe(18)
  expect(state.clamped).toBe(false)
})
