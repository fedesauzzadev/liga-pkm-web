// 17 arquetipos de FX propios (FX-ADAPTER §Capa 2, T-032c1). Respaldo siempre
// disponible para cualquier ataque: parametrizados por color/elemento, con las
// reglas de la capa (solo transform/opacity, ≤ 40 nodos, 400-900 ms a 1×).
import { animateFx, auraPulse, beamLine, ensureFrame, flashTarget, getPoint, strikeTrail } from './fxDom'

export type { FxDomNode } from './fxDom'

export const FX_ARCHETYPES = [
  'contact', 'projectile', 'beam', 'flame', 'water', 'electric', 'leaves', 'psychic', 'poison',
  'sleep', 'heal', 'explosion', 'quake', 'wind', 'ice', 'ghost', 'buff',
] as const

export type FxArchetype = (typeof FX_ARCHETYPES)[number]

export type FxElementType =
  | 'normal' | 'fire' | 'water' | 'grass' | 'electric' | 'psychic' | 'fighting' | 'poison'
  | 'ground' | 'flying' | 'bug' | 'ghost' | 'ice' | 'rock' | 'dragon'

export interface FxContext {
  readonly attacker: import('./fxDom').FxDomNode
  readonly defender: import('./fxDom').FxDomNode
  readonly layer: import('./fxDom').FxDomNode
  readonly element?: FxElementType | string
  readonly side?: 'player' | 'rival'
  readonly speed?: number
  readonly reducedMotion?: boolean
  readonly signal?: AbortSignal
}

export type MoveFx = (ctx: FxContext) => Promise<void>

export const defaultFxByElement: Readonly<Record<string, FxArchetype>> = {
  normal: 'contact',
  fire: 'flame',
  water: 'water',
  grass: 'leaves',
  electric: 'electric',
  psychic: 'psychic',
  fighting: 'contact',
  poison: 'poison',
  ground: 'quake',
  flying: 'wind',
  bug: 'contact',
  ghost: 'ghost',
  ice: 'ice',
  rock: 'quake',
  dragon: 'beam',
}

declare const document: { createElement: (tag: string) => import('./fxDom').FxDomNode }

export const archetypes: Record<FxArchetype, MoveFx> = {
  contact: async (ctx) => {
    await animateFx(ctx, async () => {
      await strikeTrail(ctx, '#f8d36b', { radius: 14, lines: 4 })
      await flashTarget(ctx, '#ffe8a3', 40)
    })
  },
  projectile: async (ctx) => {
    await animateFx(ctx, async () => {
      await strikeTrail(ctx, '#9bdcff', { radius: 10, lines: 5 })
      await flashTarget(ctx, '#dbeeff', 32)
    })
  },
  beam: async (ctx) => {
    await animateFx(ctx, async () => {
      await beamLine(ctx, '#7dd3fc')
      await flashTarget(ctx, '#dff6ff', 30)
    })
  },
  flame: async (ctx) => {
    await animateFx(ctx, async () => {
      await strikeTrail(ctx, '#ff8a3d', { radius: 12, lines: 6 })
      await flashTarget(ctx, '#ffb454', 42)
    })
  },
  water: async (ctx) => {
    await animateFx(ctx, async () => {
      await strikeTrail(ctx, '#4ec3ff', { radius: 10, lines: 8 })
      await flashTarget(ctx, '#8be4ff', 36)
    })
  },
  electric: async (ctx) => {
    await animateFx(ctx, async () => {
      await beamLine(ctx, '#facc15')
      await flashTarget(ctx, '#fef08a', 34)
    })
  },
  leaves: async (ctx) => {
    await animateFx(ctx, async () => {
      await strikeTrail(ctx, '#7ddc8a', { radius: 12, lines: 6 })
      await auraPulse(ctx, '#7ddc8a', 34)
    })
  },
  psychic: async (ctx) => {
    await animateFx(ctx, async () => {
      await beamLine(ctx, '#d48cff')
      await flashTarget(ctx, '#efd6ff', 38)
    })
  },
  poison: async (ctx) => {
    await animateFx(ctx, async () => {
      await strikeTrail(ctx, '#a855f7', { radius: 12, lines: 7 })
      await flashTarget(ctx, '#d8b4fe', 34)
    })
  },
  sleep: async (ctx) => {
    await animateFx(ctx, async () => {
      const text = document.createElement('div')
      text.textContent = 'zZ'
      text.style.position = 'absolute'
      text.style.fontWeight = '700'
      text.style.fontSize = '2rem'
      text.style.color = '#e2e8f0'
      text.style.pointerEvents = 'none'
      text.style.zIndex = '4'
      const { x, y } = getPoint(ctx.defender, ctx.layer)
      text.style.left = `${x}px`
      text.style.top = `${y - 18}px`
      ctx.layer.appendChild(text)
      const frames = [
        { opacity: '0', transform: 'translateY(10px)' },
        { opacity: '1', transform: 'translateY(0)' },
        { opacity: '0', transform: 'translateY(-12px)' },
      ]
      await ensureFrame(text, frames, 520)
      text.remove()
    })
  },
  heal: async (ctx) => {
    await animateFx(ctx, async () => {
      await auraPulse(ctx, '#4ade80', 36)
      await flashTarget(ctx, '#bbf7d0', 38)
    })
  },
  explosion: async (ctx) => {
    await animateFx(ctx, async () => {
      await flashTarget(ctx, '#fca5a5', 52)
      await strikeTrail(ctx, '#f87171', { radius: 18, lines: 8 })
    })
  },
  quake: async (ctx) => {
    await animateFx(ctx, async () => {
      const from = getPoint(ctx.defender, ctx.layer)
      const ring = document.createElement('div')
      ring.style.position = 'absolute'
      ring.style.left = `${from.x}px`
      ring.style.top = `${from.y}px`
      ring.style.width = '70px'
      ring.style.height = '70px'
      ring.style.borderRadius = '50%'
      ring.style.border = '3px solid rgba(248, 250, 252, 0.7)'
      ring.style.transform = 'translate(-50%, -50%) scale(0.5)'
      ring.style.opacity = '0'
      ring.style.pointerEvents = 'none'
      ring.style.zIndex = '3'
      ctx.layer.appendChild(ring)
      const frames = [
        { opacity: '0', transform: 'translate(-50%, -50%) scale(0.3)' },
        { opacity: '0.8', transform: 'translate(-50%, -50%) scale(1)' },
        { opacity: '0', transform: 'translate(-50%, -50%) scale(1.3)' },
      ]
      await ensureFrame(ring, frames, 520)
      ring.remove()
    })
  },
  wind: async (ctx) => {
    await animateFx(ctx, async () => {
      await strikeTrail(ctx, '#dbeafe', { radius: 11, lines: 9 })
      await flashTarget(ctx, '#f8fafc', 26)
    })
  },
  ice: async (ctx) => {
    await animateFx(ctx, async () => {
      await beamLine(ctx, '#a5f3fc')
      await flashTarget(ctx, '#cffafe', 29)
    })
  },
  ghost: async (ctx) => {
    await animateFx(ctx, async () => {
      await auraPulse(ctx, '#d8b4fe', 30)
      await flashTarget(ctx, '#f5d0fe', 32)
    })
  },
  buff: async (ctx) => {
    await animateFx(ctx, async () => {
      await auraPulse(ctx, '#facc15', 42)
      await flashTarget(ctx, '#fde68a', 28)
    })
  },
}
