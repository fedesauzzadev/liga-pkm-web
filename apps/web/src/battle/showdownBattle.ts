// N-0031: cumple en el combate real el contrato de escena del adaptador Showdown
// (`data-fx-stage="showdown"`). La arena no mide 640×360 ni ubica los sprites por
// transform, así que monta un stage hijo de 640×360 escalado/trasladado: el hogar
// del atacante cae en el centro real de su sprite y el del defensor se calcula
// desde el centro real del suyo (escala uniforme: las imágenes no se deforman).
import { useEffect } from 'react'
import { setShowdownAdapter, type ShowdownAdapter } from '../fx/playMoveFx'
import { createShowdownFxAdapter, normalizeMoveId, SHOWDOWN_STAGE } from '../fx/showdown/adapter.ts'
import type { FxElement, HomePos } from '../fx/showdown/shim.ts'
import { createWebHost } from '../fx/showdown/webHost.ts'

// shortcut: lista blanca = movimientos mirados en una pelea real (los de Charmander);
// el resto de los portados se habilita sumando su id acá tras verlo en combate.
export const BATTLE_SHOWDOWN_MOVES: ReadonlySet<string> = new Set(['scratch', 'flamethrower', 'firespin'])

interface Point {
  readonly x: number
  readonly y: number
}

export interface BattleStageGeometry {
  readonly k: number
  readonly tx: number
  readonly ty: number
  readonly defenderHome: HomePos
}

// Constantes de pos() del shim: centro del atacante en z=0 (210,245, sprite 120×1,5)
// y, para z=120, desplazamiento (+132,−66) y escala 1,2.
const ATK = { x: 210, y: 245, w: 180 }
const DEF_Z = SHOWDOWN_STAGE.defenderHome.z
const DEF = { dx: 132, dy: -66, scale: 1.2 }

/** Puro: centros reales (px de la capa) → transform del stage + hogar del defensor. */
export function battleStageGeometry(atk: Point, def: Point, spriteW: number): BattleStageGeometry | null {
  if (!(spriteW > 0)) return null
  const k = spriteW / ATK.w
  const tx = atk.x - ATK.x * k
  const ty = atk.y - ATK.y * k
  return {
    k,
    tx,
    ty,
    defenderHome: {
      x: ((def.x - tx) / k - ATK.x - DEF.dx) / DEF.scale,
      y: (ATK.y + DEF.dy - (def.y - ty) / k) / DEF.scale,
      z: DEF_Z,
    },
  }
}

const SHIM_TRANSFORM = /translate3d\(([-\d.e]+)px, ([-\d.e]+)px, 0\) scale\(([-\d.e]+), ([-\d.e]+)\)/

/** Puro: transform del shim (caja de 120 px, origen 0,0) → delta sobre el sprite real
 * (origen al centro) respecto del hogar `home`; `k` = escala del stage. */
export function shimToSpriteTransform(value: string, home: string, k: number): string | null {
  const p = SHIM_TRANSFORM.exec(value)?.slice(1).map(Number)
  const h = SHIM_TRANSFORM.exec(home)?.slice(1).map(Number)
  if (p === undefined || h === undefined) return null
  const [pl = 0, pt = 0, psx = 1, psy = 1] = p
  const [hl = 0, ht = 0, hsx = 1, hsy = 1] = h
  const half = SHOWDOWN_STAGE.spriteSize.w / 2
  const dx = k * (pl + half * psx - hl - half * hsx)
  const dy = k * (pt + half * psy - ht - half * hsy)
  return `translate(${dx}px, ${dy}px) scale(${psx / hsx}, ${psy / hsy})`
}

/** Actor del shim sobre un sprite real: no pisa su `transform` de layout; anima deltas
 * con Web Animations y las registra en `running` para cancelarlas al terminar. */
function spriteActor(el: HTMLElement, k: number, running: Animation[]): FxElement {
  let home = ''
  return {
    setCss: (prop, value) => {
      if (prop === 'transform') home = value
    },
    animate: (frames, duration, delay = 0) => {
      const mapped = frames.map((frame) => {
        const transform = frame.transform === undefined ? null : shimToSpriteTransform(frame.transform, home, k)
        return transform === null ? {} : { transform }
      })
      const anim = el.animate(mapped, { duration, delay, easing: 'linear', fill: 'forwards' })
      running.push(anim)
      return { finished: anim.finished.then(() => undefined, () => undefined), cancel: () => anim.cancel() }
    },
    remove: () => undefined,
  }
}

interface Mounted {
  readonly stage: HTMLElement
  readonly k: number
  readonly defenderHome: HomePos
}

const spriteOf = (slot: HTMLElement): HTMLElement => slot.querySelector('img') ?? slot
const spriteRect = (slot: HTMLElement): DOMRect => spriteOf(slot).getBoundingClientRect()

function mountStage(layer: HTMLElement, attacker: HTMLElement, defender: HTMLElement): Mounted | null {
  const lr = layer.getBoundingClientRect()
  // La capa puede estar escalada por CSS: los rects vienen en px de pantalla.
  const zoom = layer.offsetWidth > 0 ? lr.width / layer.offsetWidth : 1
  const center = (r: DOMRect): Point => ({
    x: (r.left - lr.left + r.width / 2) / zoom,
    y: (r.top - lr.top + r.height / 2) / zoom,
  })
  const atk = spriteRect(attacker)
  const geo = battleStageGeometry(center(atk), center(spriteRect(defender)), atk.width / zoom)
  if (geo === null) return null
  let stage = layer.querySelector<HTMLElement>(':scope > [data-showdown-stage]')
  if (stage === null) {
    stage = document.createElement('div')
    stage.dataset.showdownStage = 'true'
    stage.style.cssText =
      'position:absolute;left:0;top:0;width:640px;height:360px;transform-origin:0 0;pointer-events:none'
    layer.appendChild(stage)
  }
  stage.style.transform = `translate(${geo.tx}px, ${geo.ty}px) scale(${geo.k})`
  return { stage, k: geo.k, defenderHome: geo.defenderHome }
}

export function createBattleShowdownAdapter(manifest: Readonly<Record<string, string>>): ShowdownAdapter {
  let mounted: Mounted | null = null
  const running: Animation[] = []
  const inner = createShowdownFxAdapter({
    manifest,
    hostOf: (layer) => {
      const el = mounted?.stage ?? (layer as unknown as HTMLElement)
      return createWebHost({ fx: el, bg: el })
    },
    wrap: (node) => spriteActor(spriteOf(node as unknown as HTMLElement), mounted?.k ?? 1, running),
    homesOf: () => ({
      attackerHome: SHOWDOWN_STAGE.attackerHome,
      defenderHome: mounted?.defenderHome ?? SHOWDOWN_STAGE.defenderHome,
    }),
  })
  return async (attack, ctx) => {
    // shortcut: solo ataca el lado cercano (el shim fija isFront); el rival y el
    // auto-golpe caen al FX genérico hasta que el shim acepte lados invertidos.
    if (ctx.side !== 'player' || ctx.attacker === ctx.defender) return false
    if (attack.officialMove === undefined) return false
    if (!BATTLE_SHOWDOWN_MOVES.has(normalizeMoveId(attack.officialMove))) return false
    if (ctx.reducedMotion === true || (ctx.speed ?? 1) <= 0) return false
    mounted = mountStage(
      ctx.layer as unknown as HTMLElement,
      ctx.attacker as unknown as HTMLElement,
      ctx.defender as unknown as HTMLElement,
    )
    if (mounted === null) return false
    try {
      return await inner(attack, ctx)
    } finally {
      // Suelta el fill de las animaciones: el sprite vuelve a su estado CSS.
      for (const anim of running.splice(0)) anim.cancel()
    }
  }
}

/** Registra el adaptador mientras el combate está montado (assets de `pnpm assets`). */
export function useBattleShowdownFx(): void {
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch('/fx/fx.json')
        const manifest: unknown = res.ok ? await res.json() : null
        if (alive && manifest !== null && typeof manifest === 'object') {
          setShowdownAdapter(createBattleShowdownAdapter(manifest as Record<string, string>))
        }
      } catch {
        // Sin manifest ⇒ solo FX genérico.
      }
    })()
    return () => {
      alive = false
      setShowdownAdapter(null)
    }
  }, [])
}
