import { useEffect, useRef, useState } from 'react'
import { FX_ARCHETYPES, archetypes, type FxDomNode } from '../fx/archetypes'
import { playMoveFx, setShowdownAdapter } from '../fx/playMoveFx'
import { createShowdownFxAdapter, SHOWDOWN_STAGE } from '../fx/showdown/adapter.ts'
import { buildFxImages } from '../fx/showdown/images.ts'
import { playShowdownMove } from '../fx/showdown/play.ts'
import { SHOWDOWN_MOVE_IDS } from '../fx/showdown/registry.ts'
import type { FxHost } from '../fx/showdown/shim.ts'
import { createWebHost, wrapDomElement } from '../fx/showdown/webHost.ts'
import { es } from '../i18n/es'
import styles from './fx-demo.module.css'

interface SpriteEntry {
  readonly front: string | null
  readonly back: string | null
}
type SpritesManifest = Record<string, SpriteEntry | undefined>
type FxManifest = Record<string, string>

const STARTERS = [
  { dex: 1, name: 'Bulbasaur' },
  { dex: 4, name: 'Charmander' },
  { dex: 7, name: 'Squirtle' },
  { dex: 63, name: 'Abra' },
  { dex: 66, name: 'Machop' },
] as const

const MOVE_LABELS: Readonly<Record<(typeof SHOWDOWN_MOVE_IDS)[number], string>> = {
  bubble: es.fxBubble,
  flamethrower: es.fxFlamethrower,
  scratch: es.fxScratch,
  vinewhip: es.fxVineWhip,
  thunderbolt: es.fxThunderbolt,
  doubleslap: es.fxDoubleSlap,
  tackle: es.fxTackle,
  headbutt: es.fxHeadbutt,
  withdraw: es.fxWithdraw,
  firespin: es.fxFireSpin,
  stunspore: es.fxStunSpore,
  absorb: es.fxAbsorb,
}

export { MOVE_LABELS }

const ATK_HOME = SHOWDOWN_STAGE.attackerHome
const DEF_HOME = SHOWDOWN_STAGE.defenderHome
const SPRITE_SIZE = SHOWDOWN_STAGE.spriteSize
const SPEEDS = [
  { value: 1, label: es.fxDemoSpeed1 },
  { value: 2, label: es.fxDemoSpeed2 },
  { value: 0, label: es.fxDemoSpeedSkip },
] as const

export const ARCHETYPE_LABELS: Readonly<Record<(typeof FX_ARCHETYPES)[number], string>> = {
  contact: 'Contact',
  projectile: 'Projectile',
  beam: 'Beam',
  flame: 'Flame',
  water: 'Water',
  electric: 'Electric',
  leaves: 'Leaves',
  psychic: 'Psychic',
  poison: 'Poison',
  sleep: 'Sleep',
  heal: 'Heal',
  explosion: 'Explosion',
  quake: 'Quake',
  wind: 'Wind',
  ice: 'Ice',
  ghost: 'Ghost',
  buff: 'Buff',
}

const ELEMENT_OPTIONS = [
  'normal', 'fire', 'water', 'grass', 'electric', 'psychic', 'fighting', 'poison',
  'ground', 'flying', 'bug', 'ghost', 'ice', 'rock', 'dragon',
] as const

function measureFps(until: Promise<unknown>): Promise<string> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      resolve('—')
      return
    }
    let frames = 0
    let worst = 0
    let last = performance.now()
    const t0 = last
    const tick = (): void => {
      const now = performance.now()
      const gap = now - last
      last = now
      if (gap > worst) worst = gap
      frames += 1
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    void until.finally(() => {
      setTimeout(() => {
        const secs = (performance.now() - t0) / 1000
        resolve(secs > 0.05 ? `${Math.round(frames / secs)} fps · ${es.fxDemoWorst} ${Math.round(worst)} ms` : '—')
      }, 200)
    })
  })
}

export function FxDemo() {
  const [sprites, setSprites] = useState<SpritesManifest | null>(null)
  const [fx, setFx] = useState<FxManifest | null>(null)
  const [atkDex, setAtkDex] = useState(4)
  const [defDex, setDefDex] = useState(7)
  const [speed, setSpeed] = useState(1)
  const [reduced, setReduced] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [status, setStatus] = useState('')
  const [element, setElement] = useState<(typeof ELEMENT_OPTIONS)[number]>('fire')

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const bgRef = useRef<HTMLDivElement | null>(null)
  const fxRef = useRef<HTMLDivElement | null>(null)
  const atkRef = useRef<HTMLDivElement | null>(null)
  const defRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [s, f] = await Promise.all([
          fetch('/sprites/sprites.json').then((r) => (r.ok ? r.json() : null)),
          fetch('/fx/fx.json').then((r) => (r.ok ? r.json() : null)),
        ])
        if (alive) {
          setSprites(s as SpritesManifest | null)
          setFx(f as FxManifest | null)
        }
      } catch {
        if (alive) {
          setSprites(null)
          setFx(null)
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const vp = viewportRef.current
    const st = stageRef.current
    if (!vp || !st) return
    const apply = (): void => {
      st.style.setProperty('--fxscale', String(vp.clientWidth / 640))
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(vp)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    // Eslabón 1 de FX-ADAPTER activo en la demo (T-032c2): la capa declara el
    // stage del shim, así playMoveFx resuelve primero el adaptador Showdown.
    if (fx === null) return
    setShowdownAdapter(
      createShowdownFxAdapter({
        manifest: fx,
        hostOf: (layer) =>
          createWebHost({ fx: layer as unknown as HTMLElement, bg: layer as unknown as HTMLElement }),
        wrap: (node) => wrapDomElement(node as unknown as HTMLElement),
      }),
    )
    return () => setShowdownAdapter(null)
  }, [fx])

  const atkEntry = sprites?.[String(atkDex)]
  const defEntry = sprites?.[String(defDex)]
  const atkUrl = atkEntry?.back ?? null
  const defUrl = defEntry?.front ?? null
  const atkName = STARTERS.find((s) => s.dex === atkDex)?.name ?? ''
  const defName = STARTERS.find((s) => s.dex === defDex)?.name ?? ''

  const play = (moveId: (typeof SHOWDOWN_MOVE_IDS)[number]): void => {
    if (playing) return
    const fxLayer = fxRef.current
    const bgLayer = bgRef.current
    const atk = atkRef.current
    const def = defRef.current
    if (!fxLayer || !bgLayer || !atk || !def) return
    setPlaying(true)
    setStatus('')
    void (async () => {
      const base = createWebHost({ fx: fxLayer, bg: bgLayer })
      let peak = 0
      const host: FxHost = {
        createImage: (url) => {
          peak += 1
          return base.createImage(url)
        },
        createBackground: (bg) => {
          peak += 1
          return base.createBackground(bg)
        },
      }
      const run = playShowdownMove(moveId, {
        host,
        images: buildFxImages(fx ?? {}),
        attacker: wrapDomElement(atk),
        defender: wrapDomElement(def),
        attackerHome: ATK_HOME,
        defenderHome: DEF_HOME,
        attackerSize: SPRITE_SIZE,
        defenderSize: SPRITE_SIZE,
        ...(speed !== 1 ? { speed } : {}),
        ...(reduced ? { reducedMotion: true } : {}),
      })
      const fps = measureFps(run)
      const result = await run
      const fpsText = speed === 0 || reduced ? '—' : await fps
      const label = result === 'played' ? es.fxDemoStatusPlayed : es.fxDemoStatusFallback
      setStatus(`${label} · ${es.fxDemoElements}: ${peak} · ${es.fxDemoFps}: ${fpsText}`)
      setPlaying(false)
    })()
  }

  const playArchetype = (archetype: (typeof FX_ARCHETYPES)[number]): void => {
    if (playing) return
    const fxLayer = fxRef.current
    const atk = atkRef.current
    const def = defRef.current
    if (!fxLayer || !atk || !def) return
    setPlaying(true)
    setStatus(`${ARCHETYPE_LABELS[archetype]} · ${element}`)
    void (async () => {
      const layer = fxLayer
      const move = archetypes[archetype]
      if (move === undefined) {
        setPlaying(false)
        return
      }
      try {
        await move({
          attacker: atk as unknown as FxDomNode,
          defender: def as unknown as FxDomNode,
          layer: layer as unknown as FxDomNode,
          element,
          speed,
          reducedMotion: reduced,
        })
      } finally {
        setPlaying(false)
      }
    })()
  }

  /** Cadena completa de FX-ADAPTER (T-032c2): adaptador → arquetipo. */
  const playChain = (): void => {
    if (playing) return
    const fxLayer = fxRef.current
    const atk = atkRef.current
    const def = defRef.current
    if (!fxLayer || !atk || !def) return
    setPlaying(true)
    setStatus(es.fxChain)
    void (async () => {
      try {
        await playMoveFx(
          { officialMove: 'flamethrower', element: 'fire' },
          {
            attacker: atk as unknown as FxDomNode,
            defender: def as unknown as FxDomNode,
            layer: fxLayer as unknown as FxDomNode,
            element: 'fire',
            speed,
            ...(reduced ? { reducedMotion: true } : {}),
          },
        )
      } finally {
        setPlaying(false)
      }
    })()
  }

  return (
    <section className={styles.demo}>
      <h1 className={styles.title}>{es.fxDemoTitle}</h1>
      <p className={styles.hint}>{fx === null ? es.fxDemoMissingAsset : es.fxDemoHint}</p>
      <div className={styles.viewport} ref={viewportRef}>
        <div className={styles.stage} ref={stageRef}>
          <div className={styles.bg} ref={bgRef} />
          <div className={styles.spriteWrap} data-testid="atk" ref={atkRef}>
            {atkUrl === null ? (
              <div className={styles.card}>{atkName}</div>
            ) : (
              <img className={styles.sprite} src={atkUrl} alt={atkName} />
            )}
          </div>
          <div className={styles.spriteWrap} data-testid="def" ref={defRef}>
            {defUrl === null ? (
              <div className={styles.card}>{defName}</div>
            ) : (
              <img className={styles.sprite} src={defUrl} alt={defName} />
            )}
          </div>
          <div className={styles.fx} data-fx-stage="showdown" ref={fxRef} />
        </div>
      </div>
      <div className={styles.controls}>
        <span className={styles.label}>{es.fxDemoAttacker}</span>
        <select
          className={styles.select}
          value={atkDex}
          onChange={(e) => setAtkDex(Number(e.target.value))}
          aria-label={es.fxDemoAttacker}
        >
          {STARTERS.map((s) => (
            <option key={s.dex} value={s.dex}>
              {s.name}
            </option>
          ))}
        </select>
        <span className={styles.label}>{es.fxDemoDefender}</span>
        <select
          className={styles.select}
          value={defDex}
          onChange={(e) => setDefDex(Number(e.target.value))}
          aria-label={es.fxDemoDefender}
        >
          {STARTERS.map((s) => (
            <option key={s.dex} value={s.dex}>
              {s.name}
            </option>
          ))}
        </select>
        <span className={styles.label}>{es.fxDemoSpeed}</span>
        <select
          className={styles.select}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          aria-label={es.fxDemoSpeed}
        >
          {SPEEDS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <span className={styles.label}>{es.fxDemoElement}</span>
        <select
          className={styles.select}
          value={element}
          onChange={(e) => setElement(e.target.value as (typeof ELEMENT_OPTIONS)[number])}
          aria-label={es.fxDemoElement}
        >
          {ELEMENT_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <label className={styles.check}>
          <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />
          {es.fxDemoReduced}
        </label>
      </div>
      <div className={styles.moves}>
        {SHOWDOWN_MOVE_IDS.map((id) => (
          <button key={id} type="button" className={styles.move} disabled={playing} onClick={() => play(id)}>
            {MOVE_LABELS[id]}
          </button>
        ))}
        <button type="button" className={styles.move} disabled={playing || fx === null} onClick={() => playChain()}>
          {es.fxChain}
        </button>
      </div>
      <div className={styles.moves}>
        {FX_ARCHETYPES.map((id) => (
          <button key={id} type="button" className={styles.move} disabled={playing} onClick={() => playArchetype(id)}>
            {ARCHETYPE_LABELS[id]}
          </button>
        ))}
      </div>
      <p className={styles.status}>{status}</p>
    </section>
  )
}
