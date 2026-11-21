// @vitest-environment jsdom
// AC: fix-dados-combate-wiring/AC-2 - la tirada del stage llega al dado de la
// escena: visualsOf arma visuals.die y BattleScene lo consume en DieSlot. Sin
// este cable el motor emitía DieRolled y la coreografía anunciaba la tirada,
// pero el dado se quedaba en 1 sin girar (bug reportado por el dueño).
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { GameEvent } from '@liga/engine'
import { parseCardId, parsePlayerId, parsePkmUid } from '@liga/content'
import { ANIMATION_CONFIG } from '../events/anim.config'
import { demoBattleScript, demoChoreoDeps, demoPlayerUid } from './demo'
import { dieRollWaitMs } from './dieTiming'
import { ChoreographedBattle } from './ChoreographedBattle'

afterEach(cleanup)

test('AC: fix-dados-combate-wiring/AC-2 - DieRolled(attackSelect) pinta el dado del rival', async () => {
  vi.useFakeTimers()
  try {
    const script: readonly GameEvent[] = [
      ...demoBattleScript.slice(0, 1),
      { type: 'DieRolled', purpose: 'attackSelect', value: 4 },
    ]
    render(<ChoreographedBattle deps={demoChoreoDeps} script={script} />)
    // BattleStarted + la secuencia de la tirada terminan de reproducirse.
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    const box = screen.getByTestId('battle-die-enemy-box')
    expect(box.getAttribute('data-purpose')).toBe('attackSelect')
    expect(screen.getByTestId('battle-die-enemy').getAttribute('data-value')).toBe('4')
    // El lado que no tiró no muestra la tirada ajena.
    expect(screen.getByTestId('battle-die-mine-box').getAttribute('data-purpose')).toBe('')
  } finally {
    vi.useRealTimers()
  }
})

// AC: arreglar-dados-combate/AC-3 - ningún evento posterior al DieRolled se ve
// antes de que el dado muestre el valor final: la espera del coreógrafo cubre
// animación real + retardo del disparo→efecto de React + asentamiento
// (integración completa coreografía→escena→dado con reloj falso).
test('AC: arreglar-dados-combate/AC-3 - el ataque recién aparece cuando el dado terminó de rodar', async () => {
  vi.useFakeTimers()
  try {
    const cfg = ANIMATION_CONFIG.battle
    const script: readonly GameEvent[] = [
      {
        type: 'BattleStarted',
        player: parsePlayerId('p-demo'),
        kind: 'wild',
        rival: parseCardId('poliwag'),
        active: demoPlayerUid,
      },
      { type: 'DieRolled', purpose: 'gate', value: 2 },
      {
        type: 'AttackUsed',
        attacker: demoPlayerUid,
        attackId: 'cabezazo',
        target: parsePkmUid('r-demo-poliwag'),
      },
    ]
    const { container } = render(<ChoreographedBattle deps={demoChoreoDeps} script={script} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    // Encuentro completo (barrido + entrada + intro).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(cfg.encounterSweepMs + cfg.entranceMs + cfg.messageMs)
    })
    // El dado del jugador está girando la tirada del gate…
    const mine = screen.getByTestId('battle-die-mine')
    expect(mine.getAttribute('data-rolling')).toBe('true')
    // …y el mensaje de ataque todavía no apareció.
    expect(container.textContent ?? '').not.toContain('usó')
    // La espera del coreógrafo: tirada real + retardo de efecto + asentamiento.
    const waitMs = dieRollWaitMs(1, '1x', false) // nonce 1: primera tirada del combate
    await act(async () => {
      await vi.advanceTimersByTimeAsync(waitMs - 1)
    })
    expect(mine.getAttribute('data-rolling')).toBe('false')
    expect(mine.getAttribute('data-value')).toBe('2')
    expect(container.textContent ?? '').not.toContain('usó')
    // Recién cuando la espera cubre el giro arranca el "X usó Y".
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1 + 700)
    })
    expect(container.textContent ?? '').toContain('usó Cabezazo')
  } finally {
    vi.useRealTimers()
  }
})
