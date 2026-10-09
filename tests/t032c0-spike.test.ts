// AC: SPEC-D/T-032c0/AC-1 — los 6 movimientos del spike corren sobre el shim sin errores,
// animando solo `transform`/`opacity`, con ≤ 40 elementos FX y respetando velocidad,
// reduced-motion y abort. Proxy sin navegador con elementos simulados (host falso); la
// corrida visual sobre sprites reales en /dev/fx la hace el dueño en el gate GS.
// AC: SPEC-D/T-032c0/AC-2 — docs/ASSETS.md actualizado por el spike (leaf1/leaf2, AGPL).
// AC: SPEC-D/T-032c0/AC-3 — informe con recomendación, decisión DOM vs canvas y dificultad.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { buildFxImages, type FxImage } from '../apps/web/src/fx/showdown/images.ts'
import { playShowdownMove } from '../apps/web/src/fx/showdown/play.ts'
import { SPIKE_MOVE_IDS, showdownFx } from '../apps/web/src/fx/showdown/registry.ts'
import type { FxAnimated, FxElement, FxHost } from '../apps/web/src/fx/showdown/shim.ts'

class FakeElement implements FxElement {
  readonly css: Array<[string, string]> = []
  readonly anims: Array<{ frames: ReadonlyArray<Readonly<Record<string, string>>>; duration: number }> = []
  canceled = 0
  removed = false
  resolveFinished: (() => void) | null = null

  setCss(prop: 'transform' | 'opacity', value: string): void {
    this.css.push([prop, value])
  }

  animate(
    frames: ReadonlyArray<Readonly<Record<string, string>>>,
    duration: number,
  ): FxAnimated {
    this.anims.push({ frames, duration })
    return {
      finished: this.resolveFinished
        ? new Promise<void>((resolve) => {
            this.resolveFinished = resolve
          })
        : Promise.resolve(),
      cancel: () => {
        this.canceled += 1
      },
    }
  }

  remove(): void {
    this.removed = true
  }
}

class FakeHost implements FxHost {
  readonly images: FakeElement[] = []
  readonly backgrounds: FakeElement[] = []
  readonly wrapped: FakeElement[] = []

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

  wrap(existing: FxElement): FxElement {
    this.wrapped.push(existing as FakeElement)
    return existing
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
}

const HOME = { x: 0, y: 0, z: 0 }
const RIVAL = { x: 150, y: 60, z: 120 }
const SIZE = { w: 120, h: 120 }

function makeImages(): ReadonlyMap<string, FxImage> {
  const images = buildFxImages(FX_MANIFEST)
  expect([...images.keys()].sort()).toEqual([...Object.keys(FX_MANIFEST)].sort())
  return images
}

function makeSetup(): { host: FakeHost; attacker: FakeElement; defender: FakeElement } {
  const host = new FakeHost()
  return { host, attacker: new FakeElement(), defender: new FakeElement() }
}

function animProps(el: FakeElement): Set<string> {
  return new Set(el.anims.flatMap((a) => a.frames.flatMap((f) => Object.keys(f))))
}

test('AC: SPEC-D/T-032c0/AC-1 los 6 movimientos corren sin errores, solo transform/opacity, ≤ 40 elementos', async () => {
  expect(SPIKE_MOVE_IDS).toHaveLength(6)
  for (const id of SPIKE_MOVE_IDS) {
    expect(showdownFx.has(id), `registro con ${id}`).toBe(true)
    const { host, attacker, defender } = makeSetup()
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
    expect(host.images.length, `${id} crea efectos`).toBeGreaterThan(0)
    expect(host.images.length, `${id} presupuesto`).toBeLessThanOrEqual(40)
    for (const el of [...host.images, ...host.backgrounds, attacker, defender]) {
      for (const prop of animProps(el)) expect(['transform', 'opacity'], `${id}: ${prop}`).toContain(prop)
    }
    // Sprites "reales": atacante y defensor reciben transform (se mueven o reposan).
    expect(attacker.css.some(([p]) => p === 'transform'), id).toBe(true)
    expect(defender.css.some(([p]) => p === 'transform'), id).toBe(true)
  }
})

test('AC: SPEC-D/T-032c0/AC-1 velocidad 2× divide duraciones; skip y reduced-motion ⇒ destello mínimo', async () => {
  const maxDur = (host: FakeHost): number =>
    Math.max(1, ...[...host.images, ...host.backgrounds, ...host.wrapped].flatMap((el) => el.anims.map((a) => a.duration)))

  const slow = makeSetup()
  await playShowdownMove('bubble', {
    host: slow.host, images: makeImages(), attacker: slow.attacker, defender: slow.defender,
    attackerHome: HOME, defenderHome: RIVAL, attackerSize: SIZE, defenderSize: SIZE,
  })

  const fast = makeSetup()
  await playShowdownMove('bubble', {
    host: fast.host, images: makeImages(), attacker: fast.attacker, defender: fast.defender,
    attackerHome: HOME, defenderHome: RIVAL, attackerSize: SIZE, defenderSize: SIZE, speed: 2,
  })
  expect(maxDur(fast.host)).toBeLessThanOrEqual(Math.ceil(maxDur(slow.host) / 2))

  for (const opts of [{ speed: 0 }, { reducedMotion: true }]) {
    const setup = makeSetup()
    const result = await playShowdownMove('flamethrower', {
      host: setup.host, images: makeImages(), attacker: setup.attacker, defender: setup.defender,
      attackerHome: HOME, defenderHome: RIVAL, attackerSize: SIZE, defenderSize: SIZE, ...opts,
    })
    expect(result).toBe('fallback')
    expect(setup.host.images, JSON.stringify(opts)).toHaveLength(0)
    const flash = setup.defender.anims[0]
    expect(flash, JSON.stringify(opts)).toBeDefined()
    if (flash !== undefined) expect(flash.duration).toBeLessThanOrEqual(200)
  }
})

test('AC: SPEC-D/T-032c0/AC-1 abort y movimiento desconocido nunca lanzan ni dejan colgado', async () => {
  const setup = makeSetup()
  const controller = new AbortController()
  const pending = playShowdownMove('thunderbolt', {
    host: setup.host, images: makeImages(), attacker: setup.attacker, defender: setup.defender,
    attackerHome: HOME, defenderHome: RIVAL, attackerSize: SIZE, defenderSize: SIZE,
    signal: controller.signal,
  })
  controller.abort()
  await expect(pending).resolves.toBeTypeOf('string')

  const unknown = makeSetup()
  await expect(
    playShowdownMove('noexiste', {
      host: unknown.host, images: makeImages(), attacker: unknown.attacker, defender: unknown.defender,
      attackerHome: HOME, defenderHome: RIVAL, attackerSize: SIZE, defenderSize: SIZE,
    }),
  ).resolves.toBe('fallback')
})

test('AC: SPEC-D/T-032c0/AC-2 docs/ASSETS.md actualizado por el spike (leaf1/leaf2 + AGPL confirmada)', () => {
  const md = readFileSync(join(process.cwd(), 'docs', 'ASSETS.md'), 'utf8')
  expect(md).toContain('T-032c0')
  expect(md).toContain('leaf1')
  expect(md).toContain('AGPL')
})

test('AC: SPEC-D/T-032c0/AC-3 informe con recomendación, decisión DOM vs canvas y tabla de dificultad', () => {
  const path = join(process.cwd(), 'tasks', 'reports', 'T-032c0.md')
  expect(existsSync(path), path).toBe(true)
  const md = readFileSync(path, 'utf8')
  expect(md).toMatch(/Recomendaci[oó]n/i)
  expect(md).toMatch(/seguir \(parcial\)|seguir|parcial|descartar/i)
  expect(md).toMatch(/DOM/)
  expect(md).toMatch(/canvas|Pixi/i)
  expect(md).toMatch(/dificultad/i)
  const rows = md.split('\n').filter((l) => l.startsWith('|') && !l.includes('---'))
  expect(rows.length).toBeGreaterThanOrEqual(8)
})
