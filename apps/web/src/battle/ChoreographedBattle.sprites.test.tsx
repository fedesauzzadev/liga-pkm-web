// @vitest-environment jsdom
// AC: fix-sprites-lideres-gimnasio/AC-1 - el override de sprites pasa COMPLETO
// (sprites + trainers) a la escena: antes la vista referenciaba `trainers`
// inexistente (TS2304) y el prop era solo SpritesManifest. El líder (manifest
// trainers) y el arte de las cartas (manifest sprites) salen del override.
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { parseCardId, parsePlayerId } from '@liga/content'
import { demoChoreoDeps, demoPlayerUid } from './demo'
import { ChoreographedBattle } from './ChoreographedBattle'

afterEach(cleanup)

test('AC: fix-sprites-lideres-gimnasio/AC-1 - spritesOverride {sprites,trainers} llega a la escena', async () => {
  vi.useFakeTimers()
  try {
    const { container } = render(
      <ChoreographedBattle
        deps={demoChoreoDeps}
        speed="skip"
        script={[
          { type: 'TrainerAppeared', trainerId: 'misty' },
          {
            type: 'BattleStarted',
            player: parsePlayerId('p-demo'),
            kind: 'gym',
            rival: parseCardId('poliwag'),
            active: demoPlayerUid,
          },
        ]}
        spritesOverride={{
          sprites: { '7': { front: '/sprites/7-front.gif', back: null } },
          trainers: { misty: { front: '/sprites/misty-front.gif' } },
        }}
      />,
    )
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    // La escena montó (hay actor player+rival en el stage tras BattleStarted).
    expect(container.querySelector('[data-battle-scene]')).not.toBeNull()
    // trainers: el slot del líder usa el URL del override (y slot propio AC-2).
    expect(container.querySelector('[data-side="trainer"] img')?.getAttribute('src')).toBe(
      '/sprites/misty-front.gif',
    )
    // sprites: el arte de la carta mía (squirtle, dex 7) sale del override.
    expect(container.querySelector('img[src="/sprites/7-front.gif"]')).not.toBeNull()
  } finally {
    vi.useRealTimers()
  }
})
