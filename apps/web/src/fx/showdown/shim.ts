// Shim del adaptador Showdown (FX-ADAPTER §Capa 1): reproduce la API que usa la mayoría
// de las animaciones de battle-animations-moves.ts (showEffect / backgroundEffect /
// actor.anim / delay / leftof / behind, pos() base 210/245 con z→escala), pero anima
// SOLO `transform`+`opacity` vía keyframes muestreados (PS anima left/top/width/height,
// que son layout). El host es abstracto ⇒ corre en DOM (webHost) o en elementos simulados.
import { axisEasings, type AxisEase, type EaseFn, type Easing, linear, swing } from './easings.ts'
import type { FxImage } from './images.ts'

export interface ScenePos {
  x: number
  y: number
  z: number
  scale: number
  xscale: number
  yscale: number
  opacity: number
  time: number
}
export type PartialPos = Partial<ScenePos>
export type RequiredPos = Required<ScenePos>

export interface HomePos {
  readonly x: number
  readonly y: number
  readonly z: number
}
export interface SpriteSize {
  readonly w: number
  readonly h: number
}

export interface FxAnimated {
  readonly finished: Promise<void>
  cancel(): void
}
export interface FxElement {
  setCss(prop: 'transform' | 'opacity', value: string): void
  animate(
    frames: ReadonlyArray<Readonly<Record<string, string>>>,
    duration: number,
    delay?: number,
  ): FxAnimated
  remove(): void
}
export interface FxHost {
  createImage(url: string): FxElement
  createBackground(bg: string): FxElement
}

export interface FxActor {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly el: FxElement
  anim(end: PartialPos, transition?: Easing): FxActor
  delay(ms: number): FxActor
  leftof(offset: number): number
  behind(offset: number): number
  readonly done: Promise<void>
}

export interface FxScene {
  readonly attacker: FxActor
  readonly defender: FxActor
  showEffect(
    image: string,
    start: PartialPos,
    end: PartialPos,
    transition?: Easing,
    after?: 'fade' | 'explode',
  ): void
  backgroundEffect(bg: string, duration: number, opacity?: number, delay?: number): void
  waitAll(): Promise<void>
  readonly activeFxCount: number
}

export type ShowdownMoveAnim = (scene: FxScene) => void

export const MAX_FX_ELEMENTS = 40
const SAMPLES = 14
const DEFAULT_POS: RequiredPos = { x: 0, y: 0, z: 0, scale: 1, xscale: 1, yscale: 1, opacity: 1, time: 0 }

const full = (p: PartialPos): RequiredPos => ({ ...DEFAULT_POS, ...p })

interface Pos {
  readonly left: number
  readonly top: number
  readonly sx: number
  readonly sy: number
  readonly opacity: number
}

// Puerto de BattleScene.pos(): x/y/z/scale → posición y escala en la escena 640×360.
function pos(loc: RequiredPos, img: SpriteSize): Pos {
  let scale = 1.5 - 0.5 * (loc.z / 200)
  if (scale < 0.1) scale = 0.1
  const left =
    210 + (410 - 190) * (loc.z / 200) + Math.floor(loc.x * scale) - Math.floor((img.w * scale * loc.xscale) / 2)
  const top =
    245 - Math.floor(loc.y * scale) + (135 - 245) * (loc.z / 200) - Math.floor((img.h * scale * loc.yscale) / 2)
  return { left, top, sx: scale * loc.xscale, sy: scale * loc.yscale, opacity: loc.opacity }
}

const transformOf = (p: Pos): string => `translate3d(${p.left}px, ${p.top}px, 0) scale(${p.sx}, ${p.sy})`

function posKeyframes(from: Pos, to: Pos, ease: AxisEase): Array<Record<string, string>> {
  const frames: Array<Record<string, string>> = []
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / (SAMPLES - 1)
    const th = ease.h(t)
    const tv = ease.v(t)
    frames.push({
      transform: transformOf({
        left: from.left + (to.left - from.left) * th,
        top: from.top + (to.top - from.top) * tv,
        sx: from.sx + (to.sx - from.sx) * th,
        sy: from.sy + (to.sy - from.sy) * tv,
        opacity: 1,
      }),
      opacity: (from.opacity + (to.opacity - from.opacity) * t).toFixed(3),
    })
  }
  return frames
}

function opacityKeyframes(ease: EaseFn, from: number, to: number): Array<Record<string, string>> {
  const frames: Array<Record<string, string>> = []
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / (SAMPLES - 1)
    frames.push({ opacity: (from + (to - from) * ease(t)).toFixed(3) })
  }
  return frames
}

class ActorImpl implements FxActor {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly el: FxElement
  private readonly size: SpriteSize
  private readonly isFront: boolean
  private readonly scene: SceneImpl
  private current: RequiredPos
  private chain: Promise<void> = Promise.resolve()
  private pendingDelay = 0

  constructor(scene: SceneImpl, el: FxElement, home: HomePos, size: SpriteSize, isFront: boolean) {
    this.scene = scene
    this.el = el
    this.x = home.x
    this.y = home.y
    this.z = home.z
    this.size = size
    this.isFront = isFront
    this.current = full({ x: home.x, y: home.y, z: home.z })
    const p = pos(this.current, size)
    el.setCss('transform', transformOf(p))
    el.setCss('opacity', p.opacity.toFixed(3))
  }

  leftof(offset: number): number {
    return this.x + (this.isFront ? 1 : -1) * offset
  }

  behind(offset: number): number {
    return this.z + (this.isFront ? 1 : -1) * offset
  }

  delay(ms: number): FxActor {
    this.pendingDelay += ms
    return this
  }

  // Defaults del destino = hogar del actor (como PokemonSprite.anim de PS: time 500).
  anim(end: PartialPos, transition?: Easing): FxActor {
    const merged = full({ x: this.x, y: this.y, z: this.z, scale: 1, opacity: 1, time: 500, ...end })
    const from = this.current
    const startP = pos(from, this.size)
    const endP = pos(merged, this.size)
    const ease = axisEasings(transition, endP.top < startP.top, merged.z > 0)
    const delay = this.pendingDelay
    this.pendingDelay = 0
    this.current = merged
    this.chain = this.chain.then(() => {
      if (this.scene.isAborted()) return
      return this.scene.run(this.el, posKeyframes(startP, endP, ease), this.scene.dur(merged.time), delay)
    })
    return this
  }

  get done(): Promise<void> {
    return this.chain
  }
}

export interface SceneOptions {
  readonly host: FxHost
  readonly images: ReadonlyMap<string, FxImage>
  readonly attacker: { el: FxElement; home: HomePos; size: SpriteSize }
  readonly defender: { el: FxElement; home: HomePos; size: SpriteSize }
  readonly speed?: number
  readonly signal?: AbortSignal
}

class SceneImpl implements FxScene {
  readonly attacker: FxActor
  readonly defender: FxActor
  private readonly host: FxHost
  private readonly images: ReadonlyMap<string, FxImage>
  private readonly factor: number
  private readonly signal: AbortSignal | undefined
  private readonly chains: Array<Promise<void>> = []
  private readonly fxElements: Array<FxElement> = []
  private readonly active = new Set<FxAnimated>()

  constructor(opts: SceneOptions) {
    this.host = opts.host
    this.images = opts.images
    this.factor = Math.max(0.05, opts.speed ?? 1)
    this.signal = opts.signal
    this.attacker = new ActorImpl(this, opts.attacker.el, opts.attacker.home, opts.attacker.size, false)
    this.defender = new ActorImpl(this, opts.defender.el, opts.defender.home, opts.defender.size, true)
    this.signal?.addEventListener('abort', () => {
      for (const anim of this.active) anim.cancel()
    })
  }

  isAborted(): boolean {
    return this.signal?.aborted === true
  }

  dur(ms: number): number {
    return Math.max(1, Math.round(ms / this.factor))
  }

  run(el: FxElement, frames: ReadonlyArray<Readonly<Record<string, string>>>, duration: number, delay = 0): Promise<void> {
    const anim = el.animate(frames, duration, delay)
    this.active.add(anim)
    void anim.finished
      .catch(() => {})
      .then(() => this.active.delete(anim))
    return anim.finished.catch(() => {})
  }

  get activeFxCount(): number {
    return this.fxElements.length
  }

  showEffect(
    image: string,
    startP: PartialPos,
    endP: PartialPos,
    transition?: Easing,
    after?: 'fade' | 'explode',
  ): void {
    const img = this.images.get(image)
    if (!img) throw new Error(`FX_IMAGE_MISSING:${image}`)
    if (this.fxElements.length >= MAX_FX_ELEMENTS) throw new Error('FX_BUDGET_EXCEEDED')
    const el = this.host.createImage(img.url)
    this.fxElements.push(el)
    const start = full(startP)
    const end: RequiredPos = { ...start, ...endP }
    if (endP.time === undefined) end.time = start.time + 500
    if (endP.scale === undefined) end.scale = start.scale
    if (endP.xscale === undefined) end.xscale = start.xscale
    if (endP.yscale === undefined) end.yscale = start.yscale
    const startPos = pos(start, img)
    const endPos = pos(end, img)
    const chain = (async (): Promise<void> => {
      el.setCss('transform', transformOf(startPos))
      if (start.time > 0) {
        el.setCss('opacity', '0')
        await this.run(el, opacityKeyframes(linear, 0, startPos.opacity), 1, this.dur(start.time))
        if (this.isAborted()) return
      } else {
        el.setCss('opacity', startPos.opacity.toFixed(3))
      }
      const ease = axisEasings(transition, endPos.top < startPos.top, end.z > 0)
      await this.run(el, posKeyframes(startPos, endPos, ease), this.dur(end.time - start.time))
      if (this.isAborted()) return
      if (after === 'fade') {
        await this.run(el, opacityKeyframes(swing, endPos.opacity, 0), this.dur(100))
      } else if (after === 'explode') {
        const boom = pos({ ...end, scale: end.scale * 3, xscale: end.xscale * 3, yscale: end.yscale * 3, opacity: 0 }, img)
        await this.run(el, posKeyframes(endPos, boom, { h: swing, v: swing }), this.dur(200))
      }
    })()
    this.chains.push(chain)
  }

  backgroundEffect(bg: string, duration: number, opacity = 1, delay = 0): void {
    if (this.fxElements.length >= MAX_FX_ELEMENTS) throw new Error('FX_BUDGET_EXCEEDED')
    const el = this.host.createBackground(bg)
    this.fxElements.push(el)
    const chain = (async (): Promise<void> => {
      el.setCss('opacity', '0')
      await this.run(el, opacityKeyframes(swing, 0, opacity), this.dur(250), this.dur(delay))
      if (this.isAborted()) return
      await this.run(el, opacityKeyframes(swing, opacity, opacity), this.dur(Math.max(1, duration - 250)))
      if (this.isAborted()) return
      await this.run(el, opacityKeyframes(swing, opacity, 0), this.dur(250))
    })()
    this.chains.push(chain)
  }

  async waitAll(): Promise<void> {
    await Promise.all([...this.chains, this.attacker.done, this.defender.done].map((c) => c.catch(() => {})))
    for (const el of this.fxElements) el.remove()
    this.fxElements.length = 0
  }
}

export function createScene(opts: SceneOptions): FxScene {
  return new SceneImpl(opts)
}
