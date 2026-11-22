// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { playMoveFx, setShowdownAdapter } from '../fx/playMoveFx'
import type { FxContext } from '../fx/archetypes'
import { SHOWDOWN_STAGE } from '../fx/showdown/adapter.ts'
import { battleStageGeometry, createBattleShowdownAdapter, shimToSpriteTransform } from './showdownBattle'

const MANIFEST = { fireball: '/fx/fireball.png', rightslash: '/fx/rightslash.png' }
type Rect = { left: number; top: number; width: number; height: number }

const box = (rect: Rect): HTMLElement => {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => rect as DOMRect
  return el
}

/** Arena 635×421: jugador abajo-izquierda (188 px), rival arriba-derecha. */
const scene = (): { ctx: FxContext; layer: HTMLElement; attacker: HTMLElement; defender: HTMLElement } => {
  const layer = box({ left: 100, top: 50, width: 635, height: 421 })
  layer.dataset.fxStage = 'showdown'
  const attacker = box({ left: 200, top: 250, width: 188, height: 188 })
  const defender = box({ left: 500, top: 80, width: 150, height: 150 })
  document.body.append(layer, attacker, defender)
  const ctx = { attacker, defender, layer, side: 'player', speed: 1 } as unknown as FxContext
  return { ctx, layer, attacker, defender }
}

let animated: Array<{ el: HTMLElement; ms: number; frames: Array<Record<string, string>> }> = []
let cancelled = 0

beforeEach(() => {
  animated = []
  cancelled = 0
  // jsdom no trae Web Animations: termina tras duración+delay reales.
  HTMLElement.prototype.animate = function (this: HTMLElement, frames: unknown, options?: unknown) {
    const { duration = 0, delay = 0 } = (options ?? {}) as { duration?: number; delay?: number }
    animated.push({ el: this, ms: duration + delay, frames: frames as Array<Record<string, string>> })
    const finished = new Promise<void>((resolve) => setTimeout(resolve, duration + delay))
    return { finished, cancel: () => void (cancelled += 1) } as unknown as Animation
  }
})

afterEach(() => {
  setShowdownAdapter(null)
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

test('AC: N-0031/AC-2 - geometría: con las medidas de /dev/fx es la identidad del shim', () => {
  expect(battleStageGeometry({ x: 210, y: 245 }, { x: 522, y: 107 }, 180)).toEqual({
    k: 1,
    tx: 0,
    ty: 0,
    defenderHome: SHOWDOWN_STAGE.defenderHome,
  })
  expect(battleStageGeometry({ x: 0, y: 0 }, { x: 1, y: 1 }, 0)).toBeNull()
})

// AC: N-0031/AC-2
test('AC: N-0031/AC-2 - Lanzallamas del jugador: fireballs de Showdown en un stage anclado al sprite real', async () => {
  const { ctx, layer, attacker, defender } = scene()
  const adapter = createBattleShowdownAdapter(MANIFEST)
  const run = adapter({ officialMove: 'flamethrower', element: 'fire' }, ctx)
  const stage = layer.querySelector<HTMLElement>('[data-showdown-stage]')
  expect(stage).not.toBeNull()
  // k = 188/180; centro del atacante (194,294) en px de la capa ⇒ translate.
  const k = 188 / 180
  expect(stage?.style.transform).toBe(`translate(${194 - 210 * k}px, ${294 - 245 * k}px) scale(${k})`)
  expect([...(stage?.querySelectorAll('img') ?? [])].map((img) => img.getAttribute('src'))).toEqual(
    Array<string>(4).fill('/fx/fireball.png'),
  )
  expect(await run).toBe(true)
  // Los sprites reales no se tocan; los efectos se limpian al terminar.
  expect(attacker.style.transform).toBe('')
  expect(defender.style.transform).toBe('')
  expect(stage?.querySelectorAll('img')).toHaveLength(0)
})

// AC: N-0031/AC-2
test('AC: N-0031/AC-2 - Rasguños: el sprite real embiste hacia el rival con deltas (sin pisar su layout)', async () => {
  // Hogar ⇒ delta nulo; +100 px en el stage a escala k=2 ⇒ +200 px reales.
  const home = 'translate3d(120px, 155px, 0) scale(1.5, 1.5)'
  expect(shimToSpriteTransform(home, home, 2)).toBe('translate(0px, 0px) scale(1, 1)')
  expect(shimToSpriteTransform('translate3d(220px, 155px, 0) scale(1.5, 1.5)', home, 2)).toBe(
    'translate(200px, 0px) scale(1, 1)',
  )
  const { ctx, attacker, defender } = scene()
  expect(await createBattleShowdownAdapter(MANIFEST)({ officialMove: 'scratch' }, ctx)).toBe(true)
  const lunge = animated.find((entry) => entry.el === attacker)?.frames ?? []
  expect(lunge[0]?.transform).toBe('translate(0px, 0px) scale(1, 1)')
  const [dx = 0, dy = 0] = (/translate\(([-\d.e]+)px, ([-\d.e]+)px\)/.exec(lunge.at(-1)?.transform ?? '') ?? []).slice(1).map(Number)
  expect(dx).toBeGreaterThan(100) // hacia la derecha (rival)
  expect(dy).toBeLessThan(-50) // y hacia arriba
  expect(animated.some((entry) => entry.el === defender)).toBe(true) // retroceso del rival
  expect(attacker.style.transform).toBe('')
  expect(cancelled).toBeGreaterThan(0) // al terminar se suelta el fill
})

// AC: N-0031/AC-3
test('AC: N-0031/AC-3 - sin animación portada/habilitada cae al FX genérico sin error', async () => {
  const { ctx, layer } = scene()
  const adapter = createBattleShowdownAdapter(MANIFEST)
  expect(await adapter({ element: 'psychic' }, ctx)).toBe(false) // sin officialMove (Abra)
  expect(await adapter({ officialMove: 'tackle' }, ctx)).toBe(false) // portado pero aún no habilitado
  expect(await adapter({ officialMove: 'flamethrower' }, { ...ctx, side: 'rival' })).toBe(false)
  expect(await adapter({ officialMove: 'flamethrower' }, { ...ctx, defender: ctx.attacker })).toBe(false)
  expect(layer.querySelector('[data-showdown-stage]')).toBeNull()
  // Cadena completa: el arquetipo genérico dibuja en la capa real.
  setShowdownAdapter(adapter)
  const appended = vi.spyOn(layer, 'appendChild')
  await expect(playMoveFx({ officialMove: 'tackle', fx: 'contact', element: 'normal' }, ctx)).resolves.toBeUndefined()
  expect(appended).toHaveBeenCalled()
})

// AC: N-0031/AC-4
test('AC: N-0031/AC-4 - reducedMotion o skip: no se reproduce y la promesa resuelve igual', async () => {
  const { ctx, layer } = scene()
  const adapter = createBattleShowdownAdapter(MANIFEST)
  expect(await adapter({ officialMove: 'flamethrower' }, { ...ctx, reducedMotion: true })).toBe(false)
  expect(await adapter({ officialMove: 'flamethrower' }, { ...ctx, speed: 0 })).toBe(false)
  expect(layer.querySelector('[data-showdown-stage]')).toBeNull()
  expect(animated).toHaveLength(0)
  setShowdownAdapter(adapter)
  await expect(playMoveFx({ officialMove: 'flamethrower' }, { ...ctx, reducedMotion: true })).resolves.toBeUndefined()
})

// AC: N-0031/AC-5
test('AC: N-0031/AC-5 - Lanzallamas a 1× dura ≤ 1,2 s (el turno completo se mide en navegador)', async () => {
  const { ctx } = scene()
  const start = Date.now()
  expect(await createBattleShowdownAdapter(MANIFEST)({ officialMove: 'flamethrower' }, ctx)).toBe(true)
  expect(Date.now() - start).toBeLessThanOrEqual(1200)
})
