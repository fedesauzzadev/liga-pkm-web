// AC: SPEC-D/T-032c2/AC-1 — cada movimiento portado tiene archivo, entrada en el
// registro, assets declarados y corre sobre el shim sin errores (solo
// transform/opacity, ≤ 40 elementos), con botón en /dev/fx (FxDemo.test.tsx).
// AC: SPEC-D/T-032c2/AC-2 — orden de prioridad: todo el contenido actual (iniciales
// y mazos MVP de desarrollo) queda cubierto por movimientos porteados.
// AC: SPEC-D/T-032c2/AC-3 — si faltan assets del movimiento, cae al arquetipo sin error.
// AC: SPEC-D/T-032c2/AC-4 — informe con % de ataques del contenido con animación real.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { collect } from '../packages/content/src/validate.ts'
import { archetypes } from '../apps/web/src/fx/archetypes'
import { playMoveFx, setShowdownAdapter } from '../apps/web/src/fx/playMoveFx'
import { createShowdownFxAdapter, normalizeMoveId } from '../apps/web/src/fx/showdown/adapter.ts'
import { buildFxImages, type FxImage } from '../apps/web/src/fx/showdown/images.ts'
import { playShowdownMove } from '../apps/web/src/fx/showdown/play.ts'
import { SHOWDOWN_MOVE_IDS, showdownFx, showdownMoveAssets } from '../apps/web/src/fx/showdown/registry.ts'
import type { FxContext } from '../apps/web/src/fx/archetypes'
import type { FxDomNode } from '../apps/web/src/fx/fxDom'
import type { FxAnimated, FxElement, FxHost } from '../apps/web/src/fx/showdown/shim.ts'

class FakeElement implements FxElement {
  readonly css: Array<[string, string]> = []
  readonly anims: Array<{ frames: ReadonlyArray<Readonly<Record<string, string>>>; duration: number }> = []
  removed = false

  setCss(prop: 'transform' | 'opacity', value: string): void {
    this.css.push([prop, value])
  }

  animate(frames: ReadonlyArray<Readonly<Record<string, string>>>, duration: number): FxAnimated {
    this.anims.push({ frames, duration })
    return { finished: Promise.resolve(), cancel: () => undefined }
  }

  remove(): void {
    this.removed = true
  }
}

class FakeHost implements FxHost {
  readonly images: FakeElement[] = []
  readonly backgrounds: FakeElement[] = []

  createImage(url: string): FxElement {
    expect(url.startsWith('/fx/'), `url de fx: ${url}`).toBe(true)
    const el = new FakeElement()
    this.images.push(el)
    return el
  }

  createBackground(): FxElement {
    const el = new FakeElement()
    this.backgrounds.push(el)
    return el
  }
}

const FX_MANIFEST: Readonly<Record<string, string>> = {
  iceball: '/fx/iceball.png',
  fireball: '/fx/fireball.png',
  lightning: '/fx/lightning.png',
  energyball: '/fx/energyball.png',
  wisp: '/fx/wisp.png',
  leftslash: '/fx/leftslash.png',
  rightslash: '/fx/rightslash.png',
  leaf1: '/fx/leaf1.png',
  leaf2: '/fx/leaf2.png',
  shell: '/fx/shell.png',
  purplewisp: '/fx/purplewisp.png',
}

const HOME = { x: 0, y: 0, z: 0 }
const RIVAL = { x: 150, y: 60, z: 120 }
const SIZE = { w: 120, h: 120 }

function makeImages(manifest: Readonly<Record<string, string>> = FX_MANIFEST): ReadonlyMap<string, FxImage> {
  return buildFxImages(manifest)
}

interface StageFake {
  readonly dataset: Record<string, string | undefined>
}

const makeNode = (left: number, top: number): FxDomNode =>
  ({
    style: {},
    getBoundingClientRect: () => ({ left, top, width: 40, height: 40 }),
    appendChild: () => undefined,
    remove: () => undefined,
    animate: () => ({ finished: Promise.resolve(), cancel: () => undefined }),
  }) as FxDomNode

const makeLayer = (withStage = true): FxDomNode => {
  const fake: StageFake & FxDomNode = Object.assign(makeNode(0, 0), {
    dataset: withStage ? { fxStage: 'showdown' } : {},
  })
  return fake
}

const makeCtx = (withStage = true): FxContext => ({
  attacker: makeNode(10, 20),
  defender: makeNode(120, 60),
  layer: makeLayer(withStage),
  element: 'normal',
  speed: 1,
  reducedMotion: false,
})

// playMoveFx/arquetipos usan `document.createElement` (los FX crean nodos propios).
Object.defineProperty(globalThis, 'document', {
  value: { createElement: () => makeNode(10, 10) },
  configurable: true,
})

/** Adaptador con host/wrap falsos que cuentan lo que se crea (sin DOM). */
interface AdapterHarness {
  readonly hosts: FakeHost[]
  readonly wrapped: FakeElement[]
  adapter: ReturnType<typeof createShowdownFxAdapter>
}

const makeAdapter = (manifest: Readonly<Record<string, string>> = FX_MANIFEST): AdapterHarness => {
  const harness: AdapterHarness = {
    hosts: [],
    wrapped: [],
    adapter: () => Promise.resolve(false),
  }
  harness.adapter = createShowdownFxAdapter({
    manifest,
    hostOf: () => {
      const host = new FakeHost()
      harness.hosts.push(host)
      return host
    },
    wrap: () => {
      const el = new FakeElement()
      harness.wrapped.push(el)
      return el
    },
  })
  return harness
}

afterEach(() => {
  setShowdownAdapter(null)
  vi.restoreAllMocks()
})

const NEW_MOVE_IDS = ['tackle', 'headbutt', 'withdraw', 'firespin', 'stunspore', 'absorb'] as const

test('AC: SPEC-D/T-032c2/AC-1 cada movimiento portado corre sin errores, solo transform/opacity, ≤ 40 elementos', async () => {
  expect(SHOWDOWN_MOVE_IDS).toHaveLength(12)
  for (const id of SHOWDOWN_MOVE_IDS) {
    expect(showdownFx.has(id), `registro con ${id}`).toBe(true)
    expect(Array.isArray(showdownMoveAssets[id]), `assets declarados para ${id}`).toBe(true)
    const host = new FakeHost()
    const attacker = new FakeElement()
    const defender = new FakeElement()
    const result = await playShowdownMove(id, {
      host,
      images: makeImages(),
      attacker,
      defender,
      attackerHome: HOME,
      defenderHome: RIVAL,
      attackerSize: SIZE,
      defenderSize: SIZE,
    })
    expect(result, id).toBe('played')
    // Efectos o coreografía de sprites: algo se anima siempre (tackle/headbutt no usan imágenes).
    const animated =
      host.images.length + host.backgrounds.length + attacker.anims.length + defender.anims.length
    expect(animated, `${id} anima algo`).toBeGreaterThan(0)
    expect(host.images.length + host.backgrounds.length, `${id} presupuesto`).toBeLessThanOrEqual(40)
    const all = [...host.images, ...host.backgrounds, attacker, defender]
    for (const el of all) {
      for (const anim of el.anims) {
        for (const keyframe of anim.frames) {
          for (const prop of Object.keys(keyframe)) expect(['transform', 'opacity'], `${id}: ${prop}`).toContain(prop)
        }
      }
    }
  }
})

test('AC: SPEC-D/T-032c2/AC-1 un archivo <id>.ts por movimiento portado (los 6 nuevos incluidos)', () => {
  for (const id of NEW_MOVE_IDS) {
    const path = join(process.cwd(), 'apps', 'web', 'src', 'fx', 'showdown', `${id}.ts`)
    expect(existsSync(path), path).toBe(true)
  }
})

test('AC: SPEC-D/T-032c2/AC-2 todo ataque del contenido con officialMove resuelve a un movimiento portado', () => {
  const { content } = collect(join(process.cwd(), 'content'))
  expect(content).not.toBeNull()
  let attacks = 0
  let ported = 0
  for (const card of content?.cards ?? []) {
    for (const atk of card.attacks) {
      attacks += 1
      if (atk.officialMove === undefined) continue
      const id = normalizeMoveId(atk.officialMove)
      expect(showdownFx.has(id), `${card.id}/${atk.id}: "${atk.officialMove}" sin puerto`).toBe(true)
      ported += 1
    }
  }
  expect(attacks).toBeGreaterThan(0)
  expect(ported).toBeGreaterThan(0)
})

test('AC: SPEC-D/T-032c2/AC-2 normalizeMoveId mapea ids de PokeAPI a los de PS', () => {
  expect(normalizeMoveId('double-slap')).toBe('doubleslap')
  expect(normalizeMoveId('fire-spin')).toBe('firespin')
  expect(normalizeMoveId('stun-spore')).toBe('stunspore')
  expect(normalizeMoveId('Flamethrower')).toBe('flamethrower')
})

test('AC: SPEC-D/T-032c2/AC-3 el adaptador reproduce el movimiento cuando hay assets y el stage lo declara', async () => {
  const harness = makeAdapter()
  await expect(harness.adapter({ officialMove: 'withdraw' }, makeCtx())).resolves.toBe(true)
  expect(harness.hosts, 'creó el host y el efecto shell').toHaveLength(1)
  expect(harness.hosts[0]?.images.length).toBeGreaterThan(0)
  // Sin data-fx-stage (BattleScene actual): no crea host, cae a arquetipos.
  const noStage = makeAdapter()
  await expect(noStage.adapter({ officialMove: 'flamethrower' }, makeCtx(false))).resolves.toBe(false)
  expect(noStage.hosts).toHaveLength(0)
})

test('AC: SPEC-D/T-032c2/AC-3 si falta un asset del movimiento cae al arquetipo sin error', async () => {
  const manifest = { ...FX_MANIFEST }
  delete manifest.shell
  const harness = makeAdapter(manifest)
  setShowdownAdapter(harness.adapter)
  const buff = vi.spyOn(archetypes, 'buff')
  await expect(
    playMoveFx({ officialMove: 'withdraw', fx: 'buff', element: 'normal' }, makeCtx()),
  ).resolves.toBeUndefined()
  expect(harness.hosts, 'el adaptador no creó nada (ni destello)').toHaveLength(0)
  expect(buff).toHaveBeenCalledTimes(1) // eslabón 2: arquetipo
})

test('AC: SPEC-D/T-032c2/AC-3 con skip o reducedMotion el adaptador cede la versión mínima a la cadena', async () => {
  const harness = makeAdapter()
  await expect(harness.adapter({ officialMove: 'flamethrower' }, makeCtx())).resolves.toBe(true)
  const skip = makeAdapter()
  await expect(skip.adapter({ officialMove: 'flamethrower' }, { ...makeCtx(), speed: 0 })).resolves.toBe(false)
  await expect(skip.hosts).toHaveLength(0)
  const reduced = makeAdapter()
  await expect(
    reduced.adapter({ officialMove: 'flamethrower' }, { ...makeCtx(), reducedMotion: true }),
  ).resolves.toBe(false)
  expect(reduced.hosts).toHaveLength(0)
})

test('AC: SPEC-D/T-032c2/AC-4 el informe declara el % de ataques del contenido con animación real', () => {
  const { content } = collect(join(process.cwd(), 'content'))
  expect(content).not.toBeNull()
  let total = 0
  let real = 0
  for (const card of content?.cards ?? []) {
    for (const atk of card.attacks) {
      total += 1
      if (atk.officialMove !== undefined && showdownFx.has(normalizeMoveId(atk.officialMove))) real += 1
    }
  }
  expect(total).toBeGreaterThan(0)
  const md = readFileSync(join(process.cwd(), 'tasks', 'reports', 'T-032c2.md'), 'utf8')
  expect(md).toContain(`${real}/${total}`)
})
