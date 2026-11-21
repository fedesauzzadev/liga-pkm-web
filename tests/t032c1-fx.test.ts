// AC: SPEC-D/T-032c1 — FX base y arquetipos propios (docs/FX-ADAPTER.md capa 2).
// Un test por AC; AC-2 (17 arquetipos visibles en /dev/fx) vive en
// apps/web/src/dev/FxDemo.test.tsx.
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { collect } from '../packages/content/src/validate.ts'
import { archetypes, defaultFxByElement, FX_ARCHETYPES } from '../apps/web/src/fx/archetypes'
import type { FxContext } from '../apps/web/src/fx/archetypes'
import { playMoveFx, resolveFxChain, setShowdownAdapter } from '../apps/web/src/fx/playMoveFx'
import type { FxDomNode } from '../apps/web/src/fx/fxDom'

type FakeElement = {
  readonly style: Record<string, string>
  readonly left: number
  readonly top: number
  getBoundingClientRect: () => { left: number; top: number; width: number; height: number }
  appendChild: (child: unknown) => void
  remove: () => void
  animate: (frames: ReadonlyArray<Record<string, string>>) => { finished: Promise<void>; cancel: () => void }
}

interface FxStats {
  created: number
  removed: number
  peak: number
  readonly frameKeys: Set<string>
}

let stats: FxStats | null = null

const makeElement = (left = 20, top = 20, isLayer = false): FakeElement => ({
  style: {},
  left,
  top,
  getBoundingClientRect: () => ({ left, top, width: 40, height: 40 }),
  appendChild: () => {
    if (stats === null || !isLayer) return
    stats.created += 1
    stats.peak = Math.max(stats.peak, stats.created - stats.removed)
  },
  remove: () => {
    if (stats === null) return
    stats.removed += 1
  },
  animate: (frames) => {
    if (stats !== null) for (const frame of frames) for (const key of Object.keys(frame)) stats.frameKeys.add(key)
    return { finished: Promise.resolve(), cancel: () => undefined }
  },
})

const installDocument = (): void => {
  stats = { created: 0, removed: 0, peak: 0, frameKeys: new Set<string>() }
  Object.defineProperty(globalThis, 'document', {
    value: { createElement: (tag: string) => makeElement(tag === 'div' ? 10 : 12, tag === 'div' ? 10 : 12) },
    configurable: true,
  })
}

const makeCtx = (overrides: Partial<FxContext> = {}): FxContext => ({
  attacker: makeElement(10, 20) as unknown as FxDomNode,
  defender: makeElement(120, 60) as unknown as FxDomNode,
  layer: makeElement(0, 0, true) as unknown as FxDomNode,
  element: 'fire',
  speed: 1,
  reducedMotion: false,
  ...overrides,
})

installDocument()

afterEach(() => {
  setShowdownAdapter(null)
  vi.restoreAllMocks()
})

test('T-032c1 expone 17 arquetipos y el mapeo por elemento', () => {
  expect(FX_ARCHETYPES).toHaveLength(17)
  expect(Object.keys(archetypes)).toHaveLength(17)
  expect(defaultFxByElement.fire).toBe('flame')
  expect(defaultFxByElement.grass).toBe('leaves')
  expect(defaultFxByElement.electric).toBe('electric')
})

test('playMoveFx resuelve fallback sin romperse para officialMove, fx y elemento', async () => {
  const ctx = makeCtx()
  await expect(playMoveFx({ officialMove: 'flamethrower', element: 'fire' }, ctx)).resolves.toBeUndefined()
  await expect(playMoveFx({ fx: 'leaves', element: 'grass' }, ctx)).resolves.toBeUndefined()
  await expect(playMoveFx({ element: 'water' }, ctx)).resolves.toBeUndefined()
})

// AC: SPEC-D/T-032c1/AC-1 — cadena de resolución de FX-ADAPTER (adaptador → fx →
// elemento), siempre en try/catch: un FX que falla cae al siguiente, nunca lanza.
test('AC-1 resolveFxChain arma fx → elemento con respaldo final y sin repetidos', () => {
  expect(resolveFxChain({ fx: 'beam', element: 'fire' })).toEqual(['beam', 'flame'])
  expect(resolveFxChain({ element: 'grass' })).toEqual(['leaves'])
  expect(resolveFxChain({ fx: 'contact', element: 'normal' })).toEqual(['contact'])
  // Elemento desconocido (runtime): siempre cae al respaldo mínimo.
  expect(resolveFxChain({ element: 'cosmico' })).toEqual(['contact'])
  expect(resolveFxChain({})).toEqual(['contact'])
})

// AC: SPEC-D/T-032c1/AC-1 — el arquetipo `fx` que lanza en runtime cae al del elemento.
test('AC-1 un FX que falla cae al siguiente eslabón sin rechazar', async () => {
  const boom = vi.fn().mockRejectedValue(new Error('fx roto'))
  const flame = vi.spyOn(archetypes, 'flame')
  const originalBeam = archetypes.beam
  archetypes.beam = boom
  try {
    const ctx = makeCtx()
    await expect(playMoveFx({ fx: 'beam', element: 'fire' }, ctx)).resolves.toBeUndefined()
    expect(boom).toHaveBeenCalledTimes(1)
    expect(flame).toHaveBeenCalledTimes(1)
  } finally {
    archetypes.beam = originalBeam
  }
})

// AC: SPEC-D/T-032c1/AC-1 — el arquetipo `fx` que lanza en runtime cae al del elemento.
test('AC-1 el adaptador registrado gana; sin registro o al fallar cae a arquetipos', async () => {
  const adapter = vi.fn().mockResolvedValue(true)
  setShowdownAdapter(adapter)
  const contact = vi.spyOn(archetypes, 'contact')
  await playMoveFx({ officialMove: 'flamethrower', element: 'normal' }, makeCtx())
  expect(adapter).toHaveBeenCalledTimes(1)
  expect(contact).not.toHaveBeenCalled()

  setShowdownAdapter(null)
  await playMoveFx({ officialMove: 'flamethrower', element: 'normal' }, makeCtx())
  expect(contact).toHaveBeenCalledTimes(1)

  const broken = vi.fn().mockRejectedValue(new Error('adaptador roto'))
  setShowdownAdapter(broken)
  await expect(playMoveFx({ officialMove: 'flamethrower', element: 'normal' }, makeCtx())).resolves.toBeUndefined()
  expect(broken).toHaveBeenCalledTimes(1)
  expect(contact).toHaveBeenCalledTimes(2)
})

// AC: SPEC-D/T-032c1/AC-3 — todo ataque del contenido resuelve a algún FX.
test('AC-3 todo ataque del contenido resuelve a un arquetipo existente', () => {
  const { content } = collect(join(process.cwd(), 'content'))
  expect(content).not.toBeNull()
  let attacks = 0
  for (const card of content?.cards ?? []) {
    for (const atk of card.attacks) {
      attacks += 1
      const chain = resolveFxChain(atk)
      expect(chain.length, `${card.id}/${atk.id}: cadena vacía`).toBeGreaterThan(0)
      for (const fx of chain) {
        expect(archetypes[fx], `${card.id}/${atk.id}: "${fx}" no existe`).toBeDefined()
      }
      if (atk.fx !== undefined) expect(chain[0], `${card.id}/${atk.id}`).toBe(atk.fx)
    }
  }
  expect(attacks).toBeGreaterThan(0)
})

// AC: SPEC-D/T-032c1/AC-4 — ≤ 40 elementos DOM simultáneos; solo transform/opacity.
test('AC-4 los 17 arquetipos usan ≤ 40 nodos simultáneos y animan solo transform/opacity', async () => {
  const ctx = makeCtx()
  for (const fx of FX_ARCHETYPES) {
    const move = archetypes[fx]
    expect(move).toBeDefined()
    await move(ctx)
  }
  expect(stats).not.toBeNull()
  expect(stats?.peak).toBeLessThanOrEqual(40)
  expect(stats?.created).toBe(stats?.removed) // nada queda colgado en la capa
  for (const key of stats?.frameKeys ?? []) {
    expect(['transform', 'opacity']).toContain(key)
  }
})

// AC: SPEC-D/T-032c1/AC-4 — skip/reducedMotion ⇒ destello mínimo (un solo nodo).
test('AC-4 con reducedMotion cada arquetipo hace solo un destello de un nodo', async () => {
  installDocument()
  const ctx = makeCtx({ reducedMotion: true, speed: 0 })
  for (const fx of FX_ARCHETYPES) {
    const before = stats?.created ?? 0
    await archetypes[fx](ctx)
    expect(stats?.created, `${fx} creó más de un nodo en modo reducido`).toBe(before + 1)
  }
  for (const key of stats?.frameKeys ?? []) {
    expect(['transform', 'opacity']).toContain(key)
  }
})
