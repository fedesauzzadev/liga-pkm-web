// useFitText (rediseno-combate-max/AC-4): ajusta el tamaño de letra de una
// caja de texto entre `base` y `min` px de diseño observando su tamaño
// (ResizeObserver); si al mínimo sigue sin entrar, marca `clamped` (la CSS
// muestra 2 líneas con elipsis). La caja nunca crece. Sin ResizeObserver
// (SSR/jsdom) queda en el tamaño base.
import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseFitTextOptions {
  /** Tamaño base de diseño (px). */
  readonly base: number
  /** Mínimo de diseño (px); por debajo se recorta con elipsis. */
  readonly min: number
  /** Paso de reducción (px). */
  readonly step?: number
}

export interface FitTextState {
  readonly fontSize: number
  readonly clamped: boolean
  /** Vuelve a medir (p. ej. tras cambiar el texto). */
  readonly remeasure: () => void
}

export function useFitText(
  elementRef: { readonly current: HTMLElement | null },
  options: UseFitTextOptions,
): FitTextState {
  const { base, min, step = 1 } = options
  const [fontSize, setFontSize] = useState(base)
  const [clamped, setClamped] = useState(false)
  const [nonce, setNonce] = useState(0)
  // Último tamaño medido (evita bucles de setState con RO que se dispara al
  // aplicar el tamaño nuevo: solo escribe el DOM si cambia el resultado).
  const appliedRef = useRef(`${String(base)}:false`)

  const measure = useCallback((): void => {
    const element = elementRef.current
    if (element === null) return
    const original = element.style.fontSize
    const fits = (): boolean => element.scrollHeight <= element.clientHeight
    let size = base
    element.style.fontSize = `${String(size)}px`
    while (size > min && !fits()) {
      size -= step
      element.style.fontSize = `${String(size)}px`
    }
    const overflow = !fits()
    element.style.fontSize = original
    const next = `${String(overflow ? min : size)}:${String(overflow)}`
    if (next === appliedRef.current) return
    appliedRef.current = next
    setFontSize(overflow ? min : size)
    setClamped(overflow)
  }, [base, elementRef, min, step])

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const element = elementRef.current
    if (element === null) return
    const observer = new ResizeObserver(() => measure())
    observer.observe(element)
    measure()
    return () => observer.disconnect()
    // nonce fuerza re-medición cuando cambia el contenido.
  }, [elementRef, measure, nonce])

  return { fontSize, clamped, remeasure: () => setNonce((value) => value + 1) }
}
