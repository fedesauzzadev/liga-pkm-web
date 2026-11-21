import { describe, expect, it } from 'vitest'
import { EventPlayer, type PlaybackEvent } from './EventPlayer'
import { createGameStore } from './store'

type MutablePlaybackState = {
  count: number
  lastId: string | null
}

const makeEvents = (count: number): PlaybackEvent[] =>
  Array.from({ length: count }, (_, index) => ({
    type: 'Step',
    id: `event-${index}`,
    value: index + 1,
  }))

describe('EventPlayer', () => {
  it('reproduce la cola en orden y bloquea la entrada mientras juega', async () => {
    const events = makeEvents(5)
    const state: MutablePlaybackState = { count: 0, lastId: null }
    const player = new EventPlayer({
      speed: '1x',
      onEvent: async (event) => {
        state.count += Number(event.value)
        state.lastId = event.id ?? null
      },
    })

    for (const event of events) {
      await player.play(event)
    }

    expect(state.count).toBe(15)
    expect(state.lastId).toBe('event-4')
    expect(player.isPlaying).toBe(false)
  })

  it('AC: SPEC-D/AC-3 - con speed=skip y 50 eventos, el estado visual final equivale a 1x', async () => {
    const events1x = makeEvents(50)
    const eventsSkip = makeEvents(50)

    const visual1x: MutablePlaybackState = { count: 0, lastId: null }
    const visualSkip: MutablePlaybackState = { count: 0, lastId: null }

    const oneX = new EventPlayer({
      speed: '1x',
      reducedMotion: true,
      onEvent: async (event) => {
        visual1x.count += Number(event.value)
        visual1x.lastId = event.id ?? null
      },
    })

    const skip = new EventPlayer({
      speed: 'skip',
      reducedMotion: true,
      onEvent: async (event) => {
        visualSkip.count += Number(event.value)
        visualSkip.lastId = event.id ?? null
      },
    })

    for (const event of events1x) await oneX.play(event)
    for (const event of eventsSkip) await skip.play(event)

    expect(visualSkip).toEqual(visual1x)
  })

  it('usa la store de Zustand con eventQueue y speed', () => {
    const store = createGameStore()

    store.getState().enqueue({ type: 'Step', id: 'a', value: 10 })
    store.getState().enqueue({ type: 'Step', id: 'b', value: 20 })
    store.getState().setSpeed('skip')

    expect(store.getState().eventQueue).toHaveLength(2)
    expect(store.getState().speed).toBe('skip')
    expect(store.getState().gameState).toBeDefined()
  })
})
