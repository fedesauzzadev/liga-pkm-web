// Lienzo de combate (rediseno-combate-max/AC-0): BattleStageView escala un
// diseño FIJO de 1440×810 uniformemente (transform: scale(min(w/1440,h/810)),
// centrado, sin deformar) al contenedor que tenga (popup maximizado = ventana
// menos los 56 px del header; popup chico = su caja). El mismo formato a
// cualquier tamaño: solo se reduce, nunca se reordena ni apila.
// Nota n.º 3: el TIPO BattleStage vive en choreo/stage.ts; este componente se
// llama BattleStageView con data-testid="battle-stage".
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { fitScale } from '../popup/model'
import styles from './BattleStage.module.css'

export const STAGE_W = 1440
export const STAGE_H = 810

export interface BattleStageViewProps {
  readonly children: ReactNode
}

export function BattleStageView({ children }: BattleStageViewProps): ReactNode {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const frame = frameRef.current
    if (frame === null || typeof ResizeObserver === 'undefined') return
    const measure = (): void => {
      const next = fitScale(frame.clientWidth, frame.clientHeight, STAGE_W, STAGE_H)
      setScale((prev) => (Math.abs(prev - next) < 0.001 ? prev : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={frameRef} className={styles.frame} data-testid="battle-stage" data-scale={scale.toFixed(4)}>
      <div
        className={styles.canvas}
        style={{ transform: `translate(-50%, -50%) scale(${String(scale)})` }}
      >
        {children}
      </div>
    </div>
  )
}
