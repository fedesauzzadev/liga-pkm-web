// Reproductor del spike: prototipo del paso 1 de la cadena de playMoveFx (FX-ADAPTER).
// Nunca lanza; si el movimiento no existe, falla o está desactivado ⇒ destello mínimo.
import type { FxImage } from './images.ts'
import { showdownFx } from './registry.ts'
import { createScene } from './shim.ts'
import type { FxElement, FxHost, HomePos, SpriteSize } from './shim.ts'

export interface PlayShowdownOptions {
  readonly host: FxHost
  readonly images: ReadonlyMap<string, FxImage>
  readonly attacker: FxElement
  readonly defender: FxElement
  readonly attackerHome: HomePos
  readonly defenderHome: HomePos
  readonly attackerSize: SpriteSize
  readonly defenderSize: SpriteSize
  readonly speed?: number
  readonly reducedMotion?: boolean
  readonly signal?: AbortSignal
}

export type PlayResult = 'played' | 'fallback'

const FLASH_FRAMES: ReadonlyArray<Readonly<Record<string, string>>> = [
  { opacity: '1' },
  { opacity: '0.2' },
  { opacity: '1' },
]

async function flash(defender: FxElement): Promise<void> {
  const anim = defender.animate(FLASH_FRAMES, 150)
  await anim.finished.catch(() => {})
}

// Función para evitar el narrowing de TS: el estado puede cambiar durante el await.
const isAborted = (signal: AbortSignal | undefined): boolean => signal?.aborted === true

export async function playShowdownMove(moveId: string, opts: PlayShowdownOptions): Promise<PlayResult> {
  const anim = showdownFx.get(moveId)
  const speed = opts.speed ?? 1
  if (
    anim === undefined ||
    speed <= 0 ||
    opts.reducedMotion === true ||
    opts.signal?.aborted === true
  ) {
    await flash(opts.defender)
    return 'fallback'
  }
  try {
    const scene = createScene({
      host: opts.host,
      images: opts.images,
      attacker: { el: opts.attacker, home: opts.attackerHome, size: opts.attackerSize },
      defender: { el: opts.defender, home: opts.defenderHome, size: opts.defenderSize },
      ...(speed !== 1 ? { speed } : {}),
      ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
    })
    anim(scene)
    await scene.waitAll()
    return isAborted(opts.signal) ? 'fallback' : 'played'
  } catch {
    await flash(opts.defender)
    return 'fallback'
  }
}
