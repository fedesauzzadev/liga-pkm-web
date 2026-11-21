// Tiempos de la coreografía (SPEC-D/T-032d/AC-2): todas las duraciones viven en
// `anim.config` y se escalan por velocidad; `skip`/reducedMotion ⇒ instantáneo.
// fix-animacion-dados-combate/AC-3,AC-4: el dado de combate NO se escala con el
// factor — espera la tirada real (dieTiming) para no pisar la animación.
import { dieRollWaitMs } from '../dieTiming'
import type { PlaybackSpeed } from '../../events/anim.config'

export type SpeedFactor = 1 | 0.5 | 0

const factorOf = (speed: PlaybackSpeed, reducedMotion: boolean): SpeedFactor => {
  if (speed === 'skip' || reducedMotion) return 0
  return speed === '2x' ? 0.5 : 1
}

export interface TypewriterConfig {
  readonly charMs: number
  readonly maxMs: number
}

export class Timing {
  private speed: PlaybackSpeed
  private reducedMotion: boolean
  private factor: SpeedFactor

  public constructor(speed: PlaybackSpeed = '1x', reducedMotion = false) {
    this.speed = speed
    this.reducedMotion = reducedMotion
    this.factor = factorOf(speed, reducedMotion)
  }

  // Q-099: cada setter conserva el otro eje; si solo se guardara el factor,
  // setReducedMotion pisaría la velocidad y todo correría a 1x (T-032d/AC-2).
  public setSpeed(speed: PlaybackSpeed): void {
    this.speed = speed
    this.factor = factorOf(this.speed, this.reducedMotion)
  }

  public setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion
    this.factor = factorOf(this.speed, this.reducedMotion)
  }

  /** Duración escalada (ms virtuales); 0 ⇒ sin espera. */
  public ms(duration: number): number {
    return Math.round(duration * this.factor)
  }

  public wait(duration: number): Promise<void> {
    const scaled = this.ms(duration)
    if (scaled <= 0) return Promise.resolve()
    return new Promise((resolve) => {
      setTimeout(resolve, scaled)
    })
  }

  /** Dado de combate (fix-animacion-dados-combate/AC-3,AC-4): espera lo que
   * rueda el dado en pantalla (misma fórmula y seed, sin doble escalado).
   * arreglar-dados-combate/AC-3: incluye el retardo disparo→efecto de React y
   * el asentamiento, así ningún evento posterior se adelanta al valor final. */
  public dieRoll(seed: number): Promise<void> {
    const waitMs = dieRollWaitMs(seed, this.speed, this.reducedMotion)
    if (waitMs <= 0) return Promise.resolve()
    return new Promise((resolve) => {
      setTimeout(resolve, waitMs)
    })
  }

  /** Typewriter: publica de a 1 carácter, con tope de duración total. */
  public async reveal(
    text: string,
    publish: (partial: string) => void,
    config: TypewriterConfig,
  ): Promise<void> {
    if (this.factor === 0 || text.length === 0) {
      publish(text)
      return
    }
    const charMs = Math.min(config.charMs, config.maxMs / text.length)
    for (let shown = 1; shown <= text.length; shown += 1) {
      publish(text.slice(0, shown))
      await this.wait(charMs)
    }
  }
}
