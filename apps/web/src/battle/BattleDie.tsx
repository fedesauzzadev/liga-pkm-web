// Dado de combate (rediseno-combate-max/AC-2): `rollTo(value,{seed,speed})`
// SIEMPRE hace una tirada completa aunque `value` repita el anterior (la
// promesa resuelve al terminar). Tres fases: lanzamiento (0-35 %), caída con
// 2 rebotes (35-85 %) y asentamiento (85-100 %); giro ≥ 720° repartido en 2-3
// ejes, determinista por seed (sin Math.random). La cara final boca arriba es
// EXACTAMENTE el valor del motor y mira al FRENTE (inclinación final ≤ 15°,
// arreglar-dados-combate/AC-1). Solo transform/opacity. reducedMotion/skip:
// valor final al instante, sin giro ni resto visual pendiente (AC-4).
// fix-animacion-dados-combate/AC-1: la cara sigue a la prop `value` cuando no
// rueda, y una tirada superada termina sola sin pisar a la última.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import styles from './BattleDie.module.css'
import { rollDurationMs, seedFraction } from './dieTiming'

// fix-animacion-dados-combate/AC-3: la duración vive en dieTiming.ts (puro) y
// la coreografía espera la MISMA fórmula con la MISMA seed; se re-exporta acá
// para no romper el contrato público del componente.
export { DIE_FADE_MS, DIE_ROLL_1X_MS, DIE_ROLL_2X_MS, rollDurationMs, seedFraction } from './dieTiming'

export type BattleDieValue = 1 | 2 | 3 | 4 | 5 | 6
export type BattleDieSpeed = '1x' | '2x' | 'skip'

export interface BattleRollOptions {
  readonly seed?: number
  readonly speed?: BattleDieSpeed
}

export interface BattleDieHandle {
  readonly rollTo: (value: BattleDieValue, opts?: BattleRollOptions) => Promise<void>
}

/** Orientación base (grados) por cara: la cara queda mirando al frente. */
const ORIENT: Record<BattleDieValue, { readonly x: number; readonly y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: -90 },
  3: { x: -90, y: 0 },
  4: { x: 0, y: 90 },
  5: { x: 90, y: 0 },
  6: { x: 0, y: 180 },
}

/** Giros completos por eje según seed: 2-3 ejes, total ≥ 720°. */
function turnsFor(seed: number): { readonly x: number; readonly y: number; readonly z: number } {
  const x = 2 + Math.round(seedFraction(seed))
  const y = 2 + Math.round(seedFraction(seed + 7))
  const z = seedFraction(seed + 13) > 0.5 ? 1 : 0
  const sign = seedFraction(seed + 29) > 0.5 ? 1 : -1
  return { x: x * 360 * sign, y: y * 360 * -sign, z: z * 360 * sign }
}

/** Inclinación final por seed (arreglar-dados-combate/AC-1): ±4..14° — la cara
 * final mira al frente (≤ 15°, legible) y dos tiradas iguales se ven distintas;
 * nunca 0 exacto ni múltiplo de 90. */
export const finalYaw = (seed: number): number => {
  const fraction = seedFraction(seed + 3)
  const magnitude = 4 + Math.round(fraction * 10)
  return fraction < 0.5 ? -magnitude : magnitude
}

const rotateOf = (yaw: number, x: number, y: number, z: number): string =>
  `rotateY(${String(yaw)}deg) rotateX(${String(x)}deg) rotateY(${String(y)}deg) rotateZ(${String(z)}deg)`

export interface RollKeyframe {
  readonly atMs: number
  /** Rotación absoluta del cubo en este punto (sin traslación). */
  readonly rotate: string
  /** Altura del salto en fracciones del tamaño del dado (0 = piso). */
  readonly lift: number
  /** Sombra del piso: escala y opacidad según la altura. */
  readonly shadow: { readonly scale: number; readonly opacity: number }
  /** Grados acumulados a este punto (monótono, para data-spin-total). */
  readonly spin: number
}

export interface RollPlan {
  readonly duration: number
  readonly keyframes: readonly RollKeyframe[]
  readonly finalRotate: string
  readonly totalSpin: number
}

/**
 * Plan puro de la tirada (AC-2): lanzamiento 0-35 % (sube a 0,35 del dado
// girando rápido), caída 35-85 % con rebotes al 40 %/15 % de la altura y
 * asentamiento 85-100 % (≤ 3°). Si la orientación final coincidiera con la
 * inicial, suma +360° en un eje.
 */
export function rollPlan(
  value: BattleDieValue,
  seed: number,
  speed: BattleDieSpeed,
  prevRotate: string,
): RollPlan {
  const duration = rollDurationMs(seed, speed)
  const turns = turnsFor(seed)
  const yaw = finalYaw(seed)
  const final = rotateOf(yaw, ORIENT[value].x + turns.x, ORIENT[value].y + turns.y, turns.z)
  const finalRotate =
    final === prevRotate
      ? rotateOf(yaw, ORIENT[value].x + turns.x + 360, ORIENT[value].y + turns.y, turns.z)
      : final
  const totalSpin =
    Math.abs(turns.x) + Math.abs(turns.y) + Math.abs(turns.z) + (finalRotate === final ? 0 : 360)
  if (duration === 0) {
    return { duration: 0, keyframes: [], finalRotate, totalSpin }
  }
  const fx = ORIENT[value].x + turns.x + (finalRotate === final ? 0 : 360)
  const fy = ORIENT[value].y + turns.y
  const kf = (
    at: number,
    x: number,
    y: number,
    z: number,
    lift: number,
    shadow: { readonly scale: number; readonly opacity: number },
    spinFrac: number,
  ): RollKeyframe => ({
    atMs: Math.round(duration * at),
    rotate: rotateOf(yaw, x, y, z),
    lift,
    shadow,
    spin: Math.round(totalSpin * spinFrac),
  })
  const keyframes: readonly RollKeyframe[] = [
    kf(0, fx * 0.15, fy * 0.15, turns.z * 0.1, 0.05, { scale: 1, opacity: 0.5 }, 0.05),
    kf(0.35, fx * 0.6, fy * 0.6, turns.z * 0.5, 1, { scale: 0.6, opacity: 0.22 }, 0.55),
    kf(0.6, fx * 0.85, fy * 0.85, turns.z * 0.8, 0, { scale: 1, opacity: 0.5 }, 0.8),
    kf(0.72, fx * 0.92, fy * 0.92, turns.z * 0.9, 0.4, { scale: 0.75, opacity: 0.32 }, 0.9),
    kf(0.78, fx * 0.97, fy * 0.97, turns.z * 0.97, 0, { scale: 1, opacity: 0.5 }, 0.96),
    kf(0.85, fx, fy, turns.z, 0.15, { scale: 0.85, opacity: 0.4 }, 0.99),
    kf(1, fx, fy, turns.z, 0, { scale: 1, opacity: 0.5 }, 1),
  ]
  return { duration, keyframes, finalRotate, totalSpin }
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

export interface BattleDieProps {
  readonly value: BattleDieValue
  readonly purpose: string
  readonly size?: number
  readonly reducedMotion?: boolean
  readonly testid?: string
}

const DOT_LAYOUT: Record<BattleDieValue, readonly number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 1, 2, 6, 7, 8],
}

function renderDots(value: BattleDieValue): readonly ReactElement[] {
  return Array.from({ length: 9 }, (_, index) => (
    <span
      key={`${value}-${String(index)}`}
      className={DOT_LAYOUT[value].includes(index) ? styles.dotVisible : styles.dot}
    />
  ))
}

export const BattleDie = forwardRef<BattleDieHandle, BattleDieProps>(function BattleDie(
  { value, purpose, size = 72, reducedMotion = false, testid = 'battle-die' },
  ref,
) {
  const [face, setFace] = useState<BattleDieValue>(value)
  const [rotate, setRotate] = useState(() => rotateOf(0, ORIENT[value].x, ORIENT[value].y, 0))
  const [phaseMs, setPhaseMs] = useState(0)
  const [lift, setLift] = useState(0)
  const [shadow, setShadow] = useState({ scale: 1, opacity: 0.5 })
  const [spin, setSpin] = useState(0)
  const [rolling, setRolling] = useState(false)
  const [rollId, setRollId] = useState(0)
  const rotateRef = useRef(rotate)
  rotateRef.current = rotate
  /** Último roll en curso: el superado termina solo (el último roll manda). */
  const tokenRef = useRef(0)
  const rollingRef = useRef(false)

  // fix-animacion-dados-combate/AC-1: la cara sigue a la prop del evento cuando
  // no rueda (antes podía quedar vieja si rollTo no corría); durante una tirada
  // manda el roll y applyFinal fija la cara final.
  useEffect(() => {
    if (!rollingRef.current) setFace(value)
  }, [value])

  const applyFinal = useCallback((next: BattleDieValue, seed: number): void => {
    setFace(next)
    setRotate(rotateOf(finalYaw(seed), ORIENT[next].x, ORIENT[next].y, 0))
    setLift(0)
    setShadow({ scale: 1, opacity: 0.5 })
  }, [])

  const rollTo = useCallback(
    async (nextValue: BattleDieValue, opts?: BattleRollOptions): Promise<void> => {
      const seed = opts?.seed ?? 0
      const speed = opts?.speed ?? '1x'
      const token = tokenRef.current + 1
      tokenRef.current = token
      setRollId((id) => id + 1)
      rollingRef.current = true
      setRolling(true)
      const finish = (final: BattleDieValue, finalSeed: number, spin?: number): void => {
        if (tokenRef.current !== token) return // roll superado: no pisa al nuevo
        // arreglar-dados-combate/AC-1: la orientación de descanso es equivalente
        // (mod 360°) a la del último keyframe — swap con transición 0 ms para
        // asentar sin el re-giro hacia atrás que producían los giros completos.
        setPhaseMs(0)
        applyFinal(final, finalSeed)
        if (spin !== undefined) setSpin(spin)
        setRolling(false)
        rollingRef.current = false
      }
      // arreglar-dados-combate/AC-4: skip/reducedMotion muestran el valor final
      // al instante, sin giro ni resto visual pendiente.
      if (speed === 'skip' || reducedMotion) {
        finish(nextValue, seed, 0)
        return
      }
      const plan = rollPlan(nextValue, seed, speed, rotateRef.current)
      for (let index = 1; index < plan.keyframes.length; index += 1) {
        const keyframe = plan.keyframes[index]!
        const prev = plan.keyframes[index - 1]!
        const segment = Math.max(0, keyframe.atMs - prev.atMs)
        setPhaseMs(segment)
        setRotate(keyframe.rotate)
        setLift(keyframe.lift)
        setShadow(keyframe.shadow)
        setSpin(keyframe.spin)
        await wait(segment)
        if (tokenRef.current !== token) return // el roll nuevo ya manda
      }
      finish(nextValue, seed, plan.totalSpin)
    },
    [applyFinal, reducedMotion],
  )

  useImperativeHandle(ref, () => ({ rollTo }), [rollTo])

  const liftPx = Math.round(lift * size * 0.35)

  return (
    <div
      className={styles.die}
      data-testid={testid}
      data-value={String(face)}
      data-rolling={rolling ? 'true' : 'false'}
      data-spin-total={String(spin)}
      data-roll-id={String(rollId)}
      aria-label={`${purpose}: ${String(face)}`}
      aria-busy={rolling ? 'true' : 'false'}
      style={{ '--die-size': `${String(size)}px` } as CSSProperties}
    >
      <div className={styles.perspective}>
        <span
          className={styles.shadow}
          style={{ transform: `scaleX(${String(shadow.scale)})`, opacity: shadow.opacity }}
        />
        <div
          className={styles.cube}
          style={{
            transform: `translateY(${String(-liftPx)}px) ${rotate}`,
            transitionDuration: `${String(phaseMs)}ms`,
          }}
        >
          <div className={`${styles.face} ${styles.front}`}>{renderDots(1)}</div>
          <div className={`${styles.face} ${styles.right}`}>{renderDots(2)}</div>
          <div className={`${styles.face} ${styles.top}`}>{renderDots(3)}</div>
          <div className={`${styles.face} ${styles.left}`}>{renderDots(4)}</div>
          <div className={`${styles.face} ${styles.bottom}`}>{renderDots(5)}</div>
          <div className={`${styles.face} ${styles.back}`}>{renderDots(6)}</div>
        </div>
      </div>
    </div>
  )
})
