// Entrada de cámara libre (camara-libre-3d): rueda (zoom continuo, AC-2) y
// arrastre con el botón principal (rotación 360°, AC-3) SOBRE el canvas del
// tablero (AC-4): los paneles/casillas del HUD son otros elementos y nunca
// inician el arrastre; soltar o salir del canvas lo cancela. Superficie
// estructural (sin DOM real) para testear con fakes (NO-VISION).
export interface ExploreInputEvent {
  readonly button: number
  readonly clientX: number
  readonly clientY: number
  readonly deltaY: number
  preventDefault(): void
}

export type ExploreInputListener = (event: ExploreInputEvent) => void

export type ExploreInputType = 'wheel' | 'pointerdown' | 'pointermove' | 'pointerup' | 'pointerleave'

/** Subconjunto de AddEventListenerOptions (structuralmente compatible con el DOM). */
export interface ExploreInputOptions {
  readonly passive?: boolean
  readonly capture?: boolean
}

/** Canvas del tablero (o la ventana, para el pointerup global). */
export interface ExploreInputSurface {
  addEventListener(type: ExploreInputType, listener: ExploreInputListener, options?: ExploreInputOptions): void
  removeEventListener(type: ExploreInputType, listener: ExploreInputListener, options?: ExploreInputOptions): void
}

export interface ExploreInputActions {
  /** AC-4: la rotación/zoom de cámara libre solo operan en modo explore. */
  readonly active: () => boolean
  /** AC-2: notch de rueda (deltaY en px; > 0 = alejar). */
  readonly onWheel: (deltaY: number) => void
  /** AC-3: delta del arrastre en px desde el último evento. */
  readonly onDrag: (dxPx: number, dyPx: number) => void
}

/**
 * Registry de listeners del canvas; devuelve el detach. El arrastre inicia
 * con pointerdown (botón principal) sobre el canvas y termina con pointerup
 * (canvas o ventana: soltar sobre el HUD) o pointerleave (AC-4).
 */
export function attachExploreInput(
  canvas: ExploreInputSurface,
  globalUp: ExploreInputSurface,
  actions: ExploreInputActions,
): () => void {
  let dragging = false
  let lastX = 0
  let lastY = 0
  const endDrag = (): void => {
    dragging = false
  }
  const onWheel = (event: ExploreInputEvent): void => {
    if (!actions.active()) return
    event.preventDefault()
    actions.onWheel(event.deltaY)
  }
  const onPointerDown = (event: ExploreInputEvent): void => {
    if (!actions.active() || event.button !== 0) return
    dragging = true
    lastX = event.clientX
    lastY = event.clientY
  }
  const onPointerMove = (event: ExploreInputEvent): void => {
    if (!dragging) return
    const dxPx = event.clientX - lastX
    const dyPx = event.clientY - lastY
    lastX = event.clientX
    lastY = event.clientY
    if (dxPx !== 0 || dyPx !== 0) actions.onDrag(dxPx, dyPx)
  }
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', endDrag)
  canvas.addEventListener('pointerleave', endDrag)
  globalUp.addEventListener('pointerup', endDrag)
  return () => {
    canvas.removeEventListener('wheel', onWheel)
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', endDrag)
    canvas.removeEventListener('pointerleave', endDrag)
    globalUp.removeEventListener('pointerup', endDrag)
  }
}
