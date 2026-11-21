import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react'
import styles from './Die3D.module.css'

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6
export type DieSpeed = '1x' | '2x' | 'skip'

export interface Die3DHandle {
  readonly rollTo: (value: DieValue) => Promise<void>
}

export interface Die3DProps {
  readonly value?: DieValue
  readonly purpose?: string
  /** T-092: el panel del HUD muestra la etiqueta aparte (la del dado oculta). */
  readonly showLabel?: boolean
  readonly speed?: DieSpeed
  readonly reducedMotion?: boolean
  readonly className?: string
}

const orientationMap: Record<DieValue, string> = {
  1: 'rotateX(0deg) rotateY(0deg)',
  2: 'rotateY(-90deg)',
  3: 'rotateX(-90deg)',
  4: 'rotateY(90deg)',
  5: 'rotateX(90deg)',
  6: 'rotateY(180deg)',
}

const dotLayout: Record<DieValue, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 1, 2, 6, 7, 8],
}

/** dado-de-combate: normaliza valores de evento (Face) al union del dado. */
export const clampDieValue = (value: number): DieValue =>
  Math.min(6, Math.max(1, Math.round(value))) as DieValue

const getDurationMs = (speed: DieSpeed | undefined, reducedMotion: boolean): number => {
  if (reducedMotion || speed === 'skip') return 0
  if (speed === '2x') return 460
  return 820
}

const faceLabels: Record<DieValue, string> = {
  1: 'uno',
  2: 'dos',
  3: 'tres',
  4: 'cuatro',
  5: 'cinco',
  6: 'seis',
}

export const Die3D = forwardRef<Die3DHandle, Die3DProps>(function Die3D(
  { value = 1, purpose = 'Dado', showLabel = true, speed = '1x', reducedMotion = false, className },
  ref,
) {
  const [currentValue, setCurrentValue] = useState<DieValue>(clampDieValue(value))
  const [transform, setTransform] = useState<string>(orientationMap[currentValue])
  const [rolling, setRolling] = useState(false)

  useEffect(() => {
    const next = clampDieValue(value)
    setCurrentValue(next)
    setTransform(orientationMap[next])
  }, [value])

  const rollTo = useCallback(
    async (nextValue: DieValue): Promise<void> => {
      const safeValue = clampDieValue(nextValue)
      const durationMs = getDurationMs(speed, reducedMotion)

      if (durationMs === 0) {
        setCurrentValue(safeValue)
        setTransform(orientationMap[safeValue])
        setRolling(false)
        return
      }

      setRolling(true)
      const randomSpin = {
        x: (Math.random() * 720 + 720) * (Math.random() > 0.5 ? 1 : -1),
        y: (Math.random() * 720 + 720) * (Math.random() > 0.5 ? 1 : -1),
      }
      setTransform(`rotateX(${randomSpin.x}deg) rotateY(${randomSpin.y}deg)`)

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          setCurrentValue(safeValue)
          setTransform(orientationMap[safeValue])
          setRolling(false)
          resolve()
        }, durationMs)
      })
    },
    [reducedMotion, speed],
  )

  useImperativeHandle(ref, () => ({ rollTo }), [rollTo])

  const combinedClassName = [styles.scene, className].filter(Boolean).join(' ')

  return (
    <div className={combinedClassName} aria-live="polite">
      <div
        className={styles.dieWrap}
        data-die
        data-value={currentValue}
        aria-label={`${purpose}: ${faceLabels[currentValue]}`}
        aria-busy={rolling ? 'true' : 'false'}
      >
        <div className={styles.cube} style={{ transform }}>
          <div className={`${styles.face} ${styles.front}`} data-face="front" data-value={1}>
            {renderDots(1)}
          </div>
          <div className={`${styles.face} ${styles.right}`} data-face="right" data-value={2}>
            {renderDots(2)}
          </div>
          <div className={`${styles.face} ${styles.back}`} data-face="back" data-value={6}>
            {renderDots(6)}
          </div>
          <div className={`${styles.face} ${styles.left}`} data-face="left" data-value={4}>
            {renderDots(4)}
          </div>
          <div className={`${styles.face} ${styles.top}`} data-face="top" data-value={3}>
            {renderDots(3)}
          </div>
          <div className={`${styles.face} ${styles.bottom}`} data-face="bottom" data-value={5}>
            {renderDots(5)}
          </div>
        </div>
      </div>
      {showLabel ? <div className={styles.label}>{purpose}</div> : null}
    </div>
  )
})

function renderDots(value: DieValue) {
  return Array.from({ length: 9 }, (_, index) => {
    const visible = dotLayout[value].includes(index)
    return <span key={`${value}-${index}`} className={visible ? styles.dotVisible : styles.dot} />
  })
}

export default Die3D
