// Escala su contenido para entrar entero en el contenedor (T-075/AC-3): el
// popup es un container query de tamaño; el factor sale de `fitScale` (puro)
// medido con ResizeObserver. Sin DOM (SSR) queda sin escala.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { fitScale } from './model'
import styles from './popup.module.css'

export function FitBox({ children }: { readonly children: ReactNode }): ReactNode {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const innerRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const frame = frameRef.current
    const inner = innerRef.current
    if (frame === null || inner === null || typeof ResizeObserver === 'undefined') return
    const measure = (): void => {
      const next = fitScale(frame.clientWidth, frame.clientHeight, inner.scrollWidth, inner.scrollHeight)
      setScale((prev) => (Math.abs(prev - next) < 0.001 ? prev : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={frameRef} className={styles.fitFrame} data-fit-frame="true">
      <div
        ref={innerRef}
        className={styles.fitInner}
        style={{ transform: `translate(-50%, -50%) scale(${String(scale)})` }}
      >
        {children}
      </div>
    </div>
  )
}
