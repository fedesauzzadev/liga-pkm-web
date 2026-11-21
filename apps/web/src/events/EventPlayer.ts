import { PLAYBACK_SPEEDS, speedToDelay, type PlaybackSpeed } from './anim.config'

export type { PlaybackSpeed } from './anim.config'

export type PlaybackEvent = {
  readonly type: string
  readonly id?: string
  readonly value?: number | string
  readonly [key: string]: unknown
}

export type PlaybackState = {
  readonly count: number
  readonly lastId: string | null
}

export interface EventPlayerOptions {
  readonly speed?: PlaybackSpeed
  readonly reducedMotion?: boolean
  readonly onEvent?: (event: PlaybackEvent) => Promise<void> | void
}

export class EventPlayer {
  private _speed: PlaybackSpeed
  private readonly onEventFn: (event: PlaybackEvent) => Promise<void> | void
  private _reducedMotion: boolean
  private _isPlaying = false

  public constructor(options: EventPlayerOptions = {}) {
    this._speed = options.speed ?? '1x'
    this.onEventFn = options.onEvent ?? (() => undefined)
    this._reducedMotion = options.reducedMotion ?? false
  }

  public get speed(): PlaybackSpeed {
    return this._speed
  }

  public set speed(nextSpeed: PlaybackSpeed) {
    if (PLAYBACK_SPEEDS.includes(nextSpeed)) {
      this._speed = nextSpeed
    }
  }

  /** T-034/AC-3: los ajustes pueden activarlo en caliente (transiciones instantáneas). */
  public get reducedMotion(): boolean {
    return this._reducedMotion
  }

  public set reducedMotion(nextReducedMotion: boolean) {
    this._reducedMotion = nextReducedMotion
  }

  public get isPlaying(): boolean {
    return this._isPlaying
  }

  public async play(event: PlaybackEvent): Promise<void> {
    this._isPlaying = true
    try {
      const delayMs = this._reducedMotion || this._speed === 'skip' ? 0 : speedToDelay(this._speed)
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
      await this.onEventFn(event)
    } finally {
      this._isPlaying = false
    }
  }
}
