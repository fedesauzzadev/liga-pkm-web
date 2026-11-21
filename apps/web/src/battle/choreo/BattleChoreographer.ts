// Coreógrafo de combate (SPEC-D/T-032d): reproduce `GameEvent`s de combate sobre
// un estado de presentación inmutable, con puertos inyectables (FX, reloj) para
// correr igual en navegador y tests. Ninguna animación toca el estado del juego.
import type { GameEvent } from '@liga/engine'
import type { PlaybackSpeed } from '../../events/anim.config'
import { ANIMATION_CONFIG } from '../../events/anim.config'
import type { MoveFxAttack } from '../../fx'
import { battleEventPlays, type ChoreoApi } from './registry'
import { actorSideOf, createStage, type BattleChoreoDeps, type BattleStage, type FloaterTone, type StageActor } from './stage'
import { Timing } from './timing'

/** FX del ataque: `side` es el atacante y `target` el lado que recibe el golpe
 * (selfHit ⇒ el propio atacante, fix-confusion-captura/AC-4). */
export type BattleFxPort = (
  attack: MoveFxAttack,
  side: 'player' | 'rival',
  target: 'player' | 'rival',
) => Promise<void>

export interface BattleChoreographerOptions {
  readonly deps: BattleChoreoDeps
  readonly speed?: PlaybackSpeed
  readonly reducedMotion?: boolean
  /** fix-combate-refresco: stage inicial de reanudación (restore con batalla
   * viva); sin él arranca vacío y solo los eventos arman la escena. */
  readonly initialStage?: BattleStage
  /** Dibuja el FX del ataque sobre los nodos de la escena (T-032c1). */
  readonly fxPort?: BattleFxPort
  /** Notifica cada nuevo estado de presentación (React/tests). */
  readonly onStage?: (stage: BattleStage) => void
}

export class BattleChoreographer implements ChoreoApi {
  private state: BattleStage
  private readonly depsRef: BattleChoreoDeps
  private readonly timingRef: Timing
  private readonly fxPort: BattleFxPort | undefined
  private readonly onStage: ((stage: BattleStage) => void) | undefined
  private floaterSeq = 0
  private playing = false

  public constructor(options: BattleChoreographerOptions) {
    this.depsRef = options.deps
    this.timingRef = new Timing(options.speed ?? '1x', options.reducedMotion ?? false)
    this.fxPort = options.fxPort
    this.onStage = options.onStage
    this.state = options.initialStage ?? createStage()
  }

  public get stage(): BattleStage {
    return this.state
  }

  public get deps(): BattleChoreoDeps {
    return this.depsRef
  }

  public get timing(): Timing {
    return this.timingRef
  }

  public get isPlaying(): boolean {
    return this.playing
  }

  public setSpeed(speed: PlaybackSpeed): void {
    this.timingRef.setSpeed(speed)
  }

  public setReducedMotion(reduced: boolean): void {
    this.timingRef.setReducedMotion(reduced)
  }

  /** Reproduce un evento; los que no son de combate resuelven inmediato. */
  public async play(event: GameEvent): Promise<void> {
    const handler = battleEventPlays[event.type]
    if (handler === undefined) return
    this.playing = true
    try {
      await handler(event, this)
    } finally {
      this.playing = false
    }
  }

  // ── ChoreoApi ──

  public patch(patch: Partial<BattleStage>): void {
    this.state = { ...this.state, ...patch }
    this.onStage?.(this.state)
  }

  public actor(uid: string): StageActor | null {
    if (this.state.player?.uid === uid) return this.state.player
    if (this.state.rival?.uid === uid) return this.state.rival
    return null
  }

  public sideOf(uid: string): 'player' | 'rival' | null {
    return actorSideOf(this.state, uid)
  }

  public patchActor(
    uid: string,
    patch: Partial<Pick<StageActor, 'damage' | 'fainted' | 'card' | 'conditions'>>,
  ): void {
    if (this.state.player?.uid === uid) {
      this.patch({ player: { ...this.state.player, ...patch } })
      return
    }
    if (this.state.rival?.uid === uid) {
      this.patch({ rival: { ...this.state.rival, ...patch } })
    }
  }

  public pushFloater(uid: string, text: string, tone: FloaterTone): number {
    this.floaterSeq += 1
    const id = this.floaterSeq
    this.patch({ floaters: [...this.state.floaters, { id, uid, text, tone }] })
    return id
  }

  public dropFloater(id: number): void {
    this.patch({ floaters: this.state.floaters.filter((floater) => floater.id !== id) })
  }

  /** FX del ataque: el puerto dibuja; la espera es la del presupuesto (AC-2). */
  public async playFx(
    attack: MoveFxAttack,
    side: 'player' | 'rival',
    target: 'player' | 'rival',
  ): Promise<void> {
    const drawn =
      this.fxPort === undefined
        ? Promise.resolve()
        : this.fxPort(attack, side, target).catch(() => undefined) // FX-ADAPTER: si falla, degrada.
    await Promise.all([drawn, this.timing.wait(ANIMATION_CONFIG.battle.fxMs)])
  }
}
