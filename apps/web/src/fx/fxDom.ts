// Primitivas DOM de la capa de FX (FX-ADAPTER §Capa 2): solo `transform`/`opacity`
// en las animaciones, nodos efímeros que se autolimpian. Interfaz estructural para
// poder correr los arquetipos sobre elementos simulados en tests.
export type FxDomNode = {
  readonly style: Record<string, string>
  textContent?: string
  getBoundingClientRect: () => { left: number; top: number; width: number; height: number }
  appendChild: (child: FxDomNode) => void
  remove: () => void
  animate: (
    frames: ReadonlyArray<Record<string, string>>,
    options?: { duration?: number; delay?: number; easing?: string; fill?: string },
  ) => { finished: Promise<void>; cancel: () => void }
}

declare const document: { createElement: (tag: string) => FxDomNode }

export const noOp = (): void => {
  // no-op para limpieza de animaciones canceladas.
}

export const ensureFrame = (
  node: FxDomNode,
  frames: ReadonlyArray<Record<string, string>>,
  duration: number,
): Promise<void> => {
  if (typeof node.animate === 'function') {
    const keyframes = frames.map((frame) => ({ ...frame }))
    const anim = node.animate(keyframes, { duration, easing: 'linear', fill: 'forwards' })
    return anim.finished.then(() => undefined).catch(noOp)
  }
  return new Promise((resolve) => {
    setTimeout(resolve, duration)
  })
}

export function getPoint(node: FxDomNode, layer: FxDomNode): { x: number; y: number } {
  const layerRect = layer.getBoundingClientRect()
  const rect = node.getBoundingClientRect()
  return {
    x: rect.left - layerRect.left + rect.width / 2,
    y: rect.top - layerRect.top + rect.height / 2,
  }
}

/** N-0007: los radios de los arquetipos se pensaron para una escena chica; en
 * la escena real (635×421, sprites ~190 px) quedaban de 5-80 px y casi
 * transparentes. Un solo factor acá los vuelve legibles sin tocar cada arquetipo. */
const FX_SCALE = 2

export async function flashTarget(ctx: { defender: FxDomNode; layer: FxDomNode }, color: string, baseRadius = 54): Promise<void> {
  if (typeof document === 'undefined') return
  const radius = baseRadius * FX_SCALE
  const blast = document.createElement('div')
  blast.style.position = 'absolute'
  blast.style.pointerEvents = 'none'
  blast.style.width = `${radius * 2}px`
  blast.style.height = `${radius * 2}px`
  blast.style.borderRadius = '50%'
  blast.style.background = `radial-gradient(circle, #ffffff 0%, #ffffff 16%, ${color} 38%, ${color} 54%, rgba(255,255,255,0.55) 62%, transparent 72%)`
  blast.style.transform = 'translate(-50%, -50%) scale(0.3)'
  blast.style.opacity = '0'
  blast.style.zIndex = '2'
  const { x, y } = getPoint(ctx.defender, ctx.layer)
  blast.style.left = `${x}px`
  blast.style.top = `${y}px`
  ctx.layer.appendChild(blast)
  const frames = [
    { opacity: '0', transform: 'translate(-50%, -50%) scale(0.25)' },
    { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' },
    { opacity: '1', transform: 'translate(-50%, -50%) scale(1.08)' },
    { opacity: '0', transform: 'translate(-50%, -50%) scale(1.3)' },
  ]
  await ensureFrame(blast, frames, 450)
  blast.remove()
}

export async function strikeTrail(
  ctx: { attacker: FxDomNode; defender: FxDomNode; layer: FxDomNode; speed?: number },
  color: string,
  options?: { seed?: number; radius?: number; lines?: number },
): Promise<void> {
  if (typeof document === 'undefined') return
  const radius = (options?.radius ?? 18) * FX_SCALE
  const count = options?.lines ?? 6
  const from = getPoint(ctx.attacker, ctx.layer)
  const to = getPoint(ctx.defender, ctx.layer)
  const duration = Math.max(280, (ctx.speed ?? 1) > 1 ? 220 : 360)
  const promises: Array<Promise<void>> = []
  for (let i = 0; i < count; i += 1) {
    const bit = document.createElement('div')
    const offsetX = (i - count / 2) * 8
    const offsetY = (i % 2 === 0 ? -1 : 1) * (radius + i * 2)
    bit.style.position = 'absolute'
    bit.style.pointerEvents = 'none'
    bit.style.width = `${radius * 2}px`
    bit.style.height = `${radius * 2}px`
    bit.style.borderRadius = '50%'
    bit.style.background = `radial-gradient(circle, #ffffff 0%, ${color} 34%, ${color} 56%, transparent 72%)`
    bit.style.left = `${from.x}px`
    bit.style.top = `${from.y}px`
    bit.style.transform = 'translate(-50%, -50%) scale(0.2)'
    bit.style.opacity = '0'
    bit.style.zIndex = '3'
    ctx.layer.appendChild(bit)
    // Solo transform/opacity: la posición base queda fija en el estilo del nodo.
    const frames = [
      { opacity: '0.6', transform: 'translate(-50%, -50%) scale(0.5)' },
      { opacity: '1', transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(1)` },
      {
        // Llega opaco al rival: el destello de impacto toma la posta.
        opacity: '1',
        transform: `translate(calc(-50% + ${to.x - from.x}px), calc(-50% + ${to.y - from.y}px)) scale(0.8)`,
      },
    ]
    const keyframes = frames.map((frame) => ({ ...frame }))
    const anim = bit.animate(keyframes, { duration, easing: 'linear', fill: 'forwards' })
    promises.push(anim.finished.then(() => undefined).catch(noOp).then(() => bit.remove()))
  }
  await Promise.all(promises)
}

export async function auraPulse(
  ctx: { attacker: FxDomNode; layer: FxDomNode },
  color: string,
  radius = 40,
): Promise<void> {
  if (typeof document === 'undefined') return
  const glow = document.createElement('div')
  glow.style.position = 'absolute'
  glow.style.pointerEvents = 'none'
  glow.style.width = `${radius * 2}px`
  glow.style.height = `${radius * 2}px`
  glow.style.borderRadius = '50%'
  glow.style.background = `radial-gradient(circle, ${color} 0%, transparent 72%)`
  glow.style.left = `${getPoint(ctx.attacker, ctx.layer).x}px`
  glow.style.top = `${getPoint(ctx.attacker, ctx.layer).y}px`
  glow.style.transform = 'translate(-50%, -50%) scale(0.8)'
  glow.style.opacity = '0.7'
  glow.style.zIndex = '2'
  ctx.layer.appendChild(glow)
  const frames = [
    { opacity: '0.2', transform: 'translate(-50%, -50%) scale(0.75)' },
    { opacity: '0.8', transform: 'translate(-50%, -50%) scale(1.15)' },
    { opacity: '0', transform: 'translate(-50%, -50%) scale(1.4)' },
  ]
  await ensureFrame(glow, frames, 450)
  glow.remove()
}

export async function beamLine(
  ctx: { attacker: FxDomNode; defender: FxDomNode; layer: FxDomNode },
  color: string,
): Promise<void> {
  if (typeof document === 'undefined') return
  const { x: startX, y: startY } = getPoint(ctx.attacker, ctx.layer)
  const { x: endX, y: endY } = getPoint(ctx.defender, ctx.layer)
  const beam = document.createElement('div')
  const dx = endX - startX
  const dy = endY - startY
  const length = Math.hypot(dx, dy)
  const angle = Math.atan2(dy, dx)
  beam.style.position = 'absolute'
  beam.style.pointerEvents = 'none'
  beam.style.left = `${startX}px`
  beam.style.top = `${startY}px`
  beam.style.width = `${Math.max(length, 1)}px`
  beam.style.height = '8px'
  beam.style.borderRadius = '999px'
  beam.style.background = `linear-gradient(90deg, transparent 0%, ${color} 18%, rgba(255,255,255,0.8) 50%, ${color} 82%, transparent 100%)`
  beam.style.transformOrigin = '0 50%'
  beam.style.transform = `translate(0, -50%) rotate(${angle}rad)`
  beam.style.opacity = '0'
  beam.style.zIndex = '3'
  ctx.layer.appendChild(beam)
  const frames = [
    { opacity: '0', transform: `translate(0, -50%) rotate(${angle}rad) scaleX(0.05)` },
    { opacity: '1', transform: `translate(0, -50%) rotate(${angle}rad) scaleX(1)` },
    { opacity: '0', transform: `translate(0, -50%) rotate(${angle}rad) scaleX(1.05)` },
  ]
  await ensureFrame(beam, frames, 430)
  beam.remove()
}

export const isReduced = (ctx: { reducedMotion?: boolean; speed?: number }): boolean =>
  ctx.reducedMotion === true || ctx.speed === 0

/** `skip`/reducedMotion ⇒ destello mínimo; si no, el efecto completo. */
export const animateFx = async (
  ctx: { defender: FxDomNode; layer: FxDomNode; reducedMotion?: boolean; speed?: number },
  fn: () => Promise<void>,
): Promise<void> => {
  if (isReduced(ctx)) {
    await flashTarget(ctx, '#ffffff', 28)
    return
  }
  await fn()
}
