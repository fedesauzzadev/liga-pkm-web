// @vitest-environment jsdom
// Q-099 (SPEC-D/T-032d/AC-2): a nivel componente la velocidad elegida tiene que
// llegar a `Timing`. El efecto de `ChoreographedBattle` ejecuta
// `setSpeed(speed)` y después `setReducedMotion(reduced)`; con el setter viejo
// el segundo pisaba el primero y TODO corría a 1x (medido: BattleStarted con
// `skip` tardaba 1918 ms = 550 + 450 + 900). Se mide el reloj real del guion.
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { ChoreographedBattle } from './ChoreographedBattle'
import { demoBattleScript, demoChoreoDeps } from './demo'

afterEach(cleanup)

// AC: SPEC-D/T-032d/AC-2 - speed="skip" sin reducedMotion: el guion termina
// apenas arranca. El timeout separa el bug (≈1900 ms a 1x) de la corrida sana
// (≈0 ms + render).
test('AC: SPEC-D/T-032d/AC-2 - speed=skip: BattleStarted termina sin esperar (reducedMotion no pisa la velocidad)', async () => {
  let done = false
  render(
    <ChoreographedBattle
      deps={demoChoreoDeps}
      script={demoBattleScript.slice(0, 1)}
      speed="skip"
      reducedMotion={false}
      spritesOverride={null}
      onDone={() => {
        done = true
      }}
    />,
  )
  await waitFor(
    () => {
      expect(done).toBe(true)
    },
    { timeout: 1500 },
  )
})
