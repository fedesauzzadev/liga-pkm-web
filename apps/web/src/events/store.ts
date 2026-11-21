import { create } from 'zustand'
import { EventPlayer, type PlaybackEvent, type PlaybackSpeed } from './EventPlayer'

export type GameCommand = {
  readonly type: string
  readonly payload?: Record<string, unknown>
  readonly [key: string]: unknown
}

export type GameSnapshot = {
  readonly tick: number
  readonly lastCommand: GameCommand | null
  readonly lastEventId: string | null
}

export interface GameStoreState {
  readonly gameState: GameSnapshot
  readonly eventQueue: readonly PlaybackEvent[]
  readonly speed: PlaybackSpeed
  readonly isPlaying: boolean
  readonly reducedMotion: boolean
  readonly enqueue: (event: PlaybackEvent) => void
  readonly setSpeed: (speed: PlaybackSpeed) => void
  readonly setReducedMotion: (reducedMotion: boolean) => void
  readonly dispatch: (command: GameCommand) => void
  readonly playNext: () => Promise<void>
}

export const createGameStore = () => {
  const player = new EventPlayer({
    speed: '1x',
    onEvent: async (event) => {
      const queue = store.getState().eventQueue
      const next = queue[0]
      if (next === undefined) return
      const lastEventId = typeof event.id === 'string' ? event.id : null
      store.setState((state) => ({
        gameState: {
          ...state.gameState,
          tick: state.gameState.tick + 1,
          lastEventId,
        },
        eventQueue: state.eventQueue.slice(1),
        isPlaying: false,
      }))
    },
  })

  const store = create<GameStoreState>((set, get) => ({
    gameState: {
      tick: 0,
      lastCommand: null,
      lastEventId: null,
    },
    eventQueue: [],
    speed: '1x',
    isPlaying: false,
    reducedMotion: false,
    enqueue: (event) => {
      set((state) => ({
        eventQueue: [...state.eventQueue, event],
      }))
    },
    setSpeed: (speed) => {
      player.speed = speed
      set({ speed, isPlaying: false })
    },
    setReducedMotion: (reducedMotion) => {
      player.reducedMotion = reducedMotion
      set({ reducedMotion })
    },
    dispatch: (command) => {
      set((state) => ({
        gameState: {
          ...state.gameState,
          lastCommand: command,
        },
      }))
    },
    playNext: async () => {
      const next = get().eventQueue[0]
      if (next === undefined) return
      player.speed = get().speed
      set({ isPlaying: true })
      await player.play(next)
      // eventQueue is removed by the player callback, so this is safe.
    },
  }))

  return store
}

export const useGameStore = createGameStore()
