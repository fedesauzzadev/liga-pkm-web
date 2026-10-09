// Host DOM del shim: crea los <img>/<div> de efectos en las capas FX de la escena y
// adapta elementos existentes (sprites) para animarlos con Web Animations API.
import type { FxAnimated, FxElement, FxHost } from './shim.ts'

class DomElement implements FxElement {
  constructor(private readonly el: HTMLElement) {}

  setCss(prop: 'transform' | 'opacity', value: string): void {
    this.el.style.setProperty(prop, value)
  }

  animate(
    frames: ReadonlyArray<Readonly<Record<string, string>>>,
    duration: number,
    delay = 0,
  ): FxAnimated {
    const keyframes = frames.map((f) => ({ ...f }))
    const anim = this.el.animate(keyframes, { duration, delay, easing: 'linear', fill: 'forwards' })
    return { finished: anim.finished.then(() => {}, () => {}), cancel: () => anim.cancel() }
  }

  remove(): void {
    this.el.remove()
  }
}

export interface WebHostLayers {
  readonly fx: HTMLElement
  readonly bg: HTMLElement
}

export function createWebHost(layers: WebHostLayers): FxHost {
  return {
    createImage(url: string): FxElement {
      const img = document.createElement('img')
      img.src = url
      img.alt = ''
      img.draggable = false
      img.style.position = 'absolute'
      img.style.left = '0'
      img.style.top = '0'
      img.style.transformOrigin = '0 0'
      img.style.willChange = 'transform, opacity'
      img.style.pointerEvents = 'none'
      layers.fx.appendChild(img)
      return new DomElement(img)
    },
    createBackground(bg: string): FxElement {
      const div = document.createElement('div')
      div.style.position = 'absolute'
      div.style.inset = '0'
      div.style.background = bg
      div.style.pointerEvents = 'none'
      layers.bg.appendChild(div)
      return new DomElement(div)
    },
  }
}

export function wrapDomElement(el: HTMLElement): FxElement {
  return new DomElement(el)
}
