// Cadena de resolución de FX de un ataque (FX-ADAPTER §Interfaz única, T-032c1):
// adaptador Showdown → arquetipo `fx` → arquetipo por elemento. Siempre en
// try/catch por eslabón: nunca lanza, nunca decide resultados del juego.
import { archetypes, defaultFxByElement, type FxArchetype, type FxContext } from './archetypes'
import type { FxDomNode } from './fxDom'

declare const document: { createElement: (tag: string) => FxDomNode }

export { archetypes, defaultFxByElement, FX_ARCHETYPES } from './archetypes'
export type { FxArchetype, FxContext, MoveFx } from './archetypes'

export type MoveFxAttack = {
  readonly element?: string | undefined
  readonly fx?: FxArchetype | undefined
  readonly officialMove?: string | undefined
}

/**
 * Eslabón 1: adaptador de Showdown. Inyectable (tipo plugin, como los handlers
 * custom de Q-013) porque necesita DOM/imágenes reales: T-032c2 lo registra.
 * Devuelve `true` si reprodujo el movimiento (se usa ese resultado).
 */
export type ShowdownAdapter = (attack: MoveFxAttack, ctx: FxContext) => Promise<boolean>

let showdownAdapter: ShowdownAdapter | null = null

export function setShowdownAdapter(adapter: ShowdownAdapter | null): void {
  showdownAdapter = adapter
}

/** Cadena de arquetipos (fx → elemento), pura y sin repetidos; `contact` como
 * respaldo mínimo solo si el ataque no resuelve a nada (p. ej. elemento corrupto). */
export function resolveFxChain(attack: MoveFxAttack): readonly FxArchetype[] {
  const chain: FxArchetype[] = []
  const push = (candidate: FxArchetype | undefined): void => {
    if (candidate !== undefined && !chain.includes(candidate)) chain.push(candidate)
  }
  push(attack.fx)
  push(defaultFxByElement[(attack.element ?? 'normal').toLowerCase()])
  if (chain.length === 0) chain.push('contact')
  return chain
}

export async function playMoveFx(attack: MoveFxAttack, ctx: FxContext): Promise<void> {
  if (typeof document === 'undefined') return

  if (showdownAdapter !== null && !ctx.signal?.aborted) {
    try {
      if (await showdownAdapter(attack, ctx)) return
    } catch {
      // FX-ADAPTER: un FX que falla cae al siguiente eslabón.
    }
  }

  for (const fx of resolveFxChain(attack)) {
    const move = archetypes[fx]
    if (move === undefined) continue
    try {
      await move(ctx)
      return
    } catch {
      // FX-ADAPTER: un FX que falla cae al siguiente eslabón.
    }
  }
}
