// Eslabón 1 real de playMoveFx (FX-ADAPTER, deuda de T-032c1): adapta FxContext al
// reproductor del shim. Puro: el host DOM y el wrapping de sprites se inyectan
// (así corre en tests sin jsdom). Contrato de escena: solo anima si la capa FX
// declara `data-fx-stage="showdown"` (escena en coordenadas del shim, 640×360 con
// sprites de 120 px en 0,0 movidos por transform). BattleScene aún no lo cumple ⇒
// sigue con arquetipos (deuda G3). Nunca lanza: ante cualquier duda devuelve `false`
// y la cadena cae al arquetipo sin error.
import type { FxDomNode } from '../fxDom.ts'
import type { FxContext, ShowdownAdapter } from '../playMoveFx.ts'
import { buildFxImages } from './images.ts'
import { playShowdownMove } from './play.ts'
import { showdownFx, showdownMoveAssets } from './registry.ts'
import type { FxElement, FxHost } from './shim.ts'

/** Coordenadas de la escena del shim (las de /dev/fx): base pos() 210/245. */
export const SHOWDOWN_STAGE = {
  attackerHome: { x: 0, y: 0, z: 0 },
  defenderHome: { x: 150, y: 60, z: 120 },
  spriteSize: { w: 120, h: 120 },
} as const

/** Id de PokeAPI → id de PS: 'fire-spin' → 'firespin', 'Double Slap' → 'doubleslap'. */
export function normalizeMoveId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export interface ShowdownAdapterDeps {
  /** Manifest fx.json (clave → URL) bajado por `pnpm assets`. */
  readonly manifest: Readonly<Record<string, string>>
  /** Crea el host de efectos para la capa FX (webHost en el navegador). */
  readonly hostOf: (layer: FxDomNode) => FxHost
  /** Envuelve un sprite de la escena para que el shim lo anime. */
  readonly wrap: (node: FxDomNode) => FxElement
}

const isShowdownStage = (layer: FxDomNode): boolean =>
  (layer as unknown as { readonly dataset?: { readonly fxStage?: string } }).dataset?.fxStage === 'showdown'

export function createShowdownFxAdapter(deps: ShowdownAdapterDeps): ShowdownAdapter {
  const images = buildFxImages(deps.manifest)
  return async (attack, ctx: FxContext): Promise<boolean> => {
    if (attack.officialMove === undefined) return false
    const id = normalizeMoveId(attack.officialMove)
    if (!showdownFx.has(id)) return false
    // AC-3: sin los assets del movimiento ⇒ arquetipo (sin destello previo).
    const required = showdownMoveAssets[id]
    if (required === undefined || !required.every((img) => images.has(img))) return false
    // Skip / reduced-motion / abort: que la cadena lo resuelva con su versión mínima.
    if (ctx.reducedMotion === true || (ctx.speed ?? 1) <= 0 || ctx.signal?.aborted === true) return false
    if (!isShowdownStage(ctx.layer)) return false
    const result = await playShowdownMove(id, {
      host: deps.hostOf(ctx.layer),
      images,
      attacker: deps.wrap(ctx.attacker),
      defender: deps.wrap(ctx.defender),
      attackerHome: SHOWDOWN_STAGE.attackerHome,
      defenderHome: SHOWDOWN_STAGE.defenderHome,
      attackerSize: SHOWDOWN_STAGE.spriteSize,
      defenderSize: SHOWDOWN_STAGE.spriteSize,
      ...(ctx.speed !== undefined ? { speed: ctx.speed } : {}),
      ...(ctx.signal !== undefined ? { signal: ctx.signal } : {}),
    })
    return result === 'played'
  }
}
