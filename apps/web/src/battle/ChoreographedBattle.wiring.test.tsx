// @vitest-environment jsdom
// AC: fix-dados-combate-wiring/AC-1 - el onCommand del popup llega a BattleScene:
// aceptar en la escena invoca el handler del contenedor. Regresión: el prop se
// descartaba como `_onCommand`, ningún comando llegaba al motor y los dados de
// combate quedaban trabados en 1 (sin DieRolled, sin entradas de historial).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import type { BattleSceneProps } from './BattleScene'
import { demoBattleScript, demoChoreoDeps } from './demo'
import { ChoreographedBattle } from './ChoreographedBattle'

vi.mock('./BattleScene', async () => {
  const react = await vi.importActual<typeof import('react')>('react')
  return {
    BattleScene: (props: BattleSceneProps): ReactNode =>
      react.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'mock-scene-accept',
          onClick: (): void => {
            props.onCommand?.({ type: 'Attack', attackId: 'cabezazo' })
          },
        },
        'Aceptar (mock)',
      ),
  }
})

afterEach(cleanup)

const oneShotScript = demoBattleScript.slice(0, 1)

test('AC: combate-colgado/AC-1 - un onDone nuevo por render no re-dispara la cola (sin loop)', async () => {
  vi.useFakeTimers()
  try {
    const first = vi.fn()
    const { rerender } = render(
      <ChoreographedBattle deps={demoChoreoDeps} script={oneShotScript} speed="skip" onDone={first} />,
    )
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    expect(first).toHaveBeenCalledTimes(1)

    // El popup recrea su callback en cada render (setState tras onDone).
    const second = vi.fn()
    rerender(<ChoreographedBattle deps={demoChoreoDeps} script={oneShotScript} speed="skip" onDone={second} />)
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    expect(second).not.toHaveBeenCalled()
  } finally {
    vi.useRealTimers()
  }
})

test('AC: fix-dados-combate-wiring/AC-1 - el onCommand del popup llega a BattleScene', async () => {
  vi.useFakeTimers()
  try {
    const onCommand = vi.fn()
    render(
      <ChoreographedBattle
        deps={demoChoreoDeps}
        script={demoBattleScript.slice(0, 1)}
        onCommand={onCommand}
      />,
    )
    // BattleStarted termina de reproducirse ⇒ la escena (mock) pinta.
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    const scene = screen.getByTestId('mock-scene-accept')
    expect(onCommand).not.toHaveBeenCalled()
    fireEvent.click(scene)
    expect(onCommand).toHaveBeenCalledTimes(1)
    expect(onCommand).toHaveBeenCalledWith({ type: 'Attack', attackId: 'cabezazo' })
  } finally {
    vi.useRealTimers()
  }
})
