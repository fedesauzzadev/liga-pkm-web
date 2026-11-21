// AC: camara-libre-3d/AC-1..AC-7 — cámara libre 3D: WASD (paneo relativo al
// azimut), rueda (zoom continuo con damping) y arrastre (rotación 360° con
// wrap, polar clampeado), solo sobre el canvas y componiendo con el teclado.
// Puro + superficie falsa (NO-VISION): sin DOM ni render.
import { expect, test } from 'vitest'
import { BOARD3D } from '../theme/board3d'
import { cameraPresets } from './camera'
import {
  clampExploreState,
  exploreDragStep,
  exploreKeyStep,
  explorePose,
  exploreWheelStep,
  initialExploreState,
} from './explore'
import {
  attachExploreInput,
  type ExploreInputEvent,
  type ExploreInputListener,
  type ExploreInputSurface,
} from './explore-input'
import { ImmersiveCamera, type RigFocus } from './rig'

const halfW = BOARD3D.base.width / 2
const halfD = BOARD3D.base.depth / 2
const ASPECT = 1440 / 900

const FOCUS: RigFocus = { tokenX: 0, tokenZ: 0, nextX: 1, nextZ: 0 }
const newRig = (): ImmersiveCamera => new ImmersiveCamera({ halfWidth: halfW, halfDepth: halfD })

// AC: camara-libre-3d/AC-1 — W/S/A/D mueven el target relativo a la
// orientación actual de la cámara, con el paso de panSpeed y panBounds.
test('AC: camara-libre-3d/AC-1 - WASD panea el target relativo al azimut, con panSpeed y panBounds', () => {
  const bounds = newRig().panBounds
  const step = cameraPresets.explore.panSpeed / 12

  // Azimut 90° (cámara mirando hacia −x): W avanza en −x y D hacia −z.
  const east = clampExploreState({ ...initialExploreState(), azimuthDeg: 90 })
  const forwardEast = exploreKeyStep(east, 'panForward', 0, 0, bounds)
  expect(forwardEast.offsetX).toBeCloseTo(-step, 6)
  expect(forwardEast.offsetZ).toBeCloseTo(0, 6)
  const rightEast = exploreKeyStep(east, 'panRight', 0, 0, bounds)
  expect(rightEast.offsetX).toBeCloseTo(0, 6)
  expect(rightEast.offsetZ).toBeCloseTo(-step, 6)

  // Azimut 180°: W avanza hacia +z (el paneo sigue al giro, no al mundo).
  const south = clampExploreState({ ...initialExploreState(), azimuthDeg: 180 })
  expect(exploreKeyStep(south, 'panForward', 0, 0, bounds).offsetZ).toBeCloseTo(step, 6)

  // panBounds: token en el borde −z; varias pulsaciones de W claman al mundo
  // (dado-fijo-tablero: la pared quedó a +25 % del borde, más lejos que antes).
  let panned = initialExploreState()
  for (let i = 0; i < 8; i += 1) {
    panned = exploreKeyStep(panned, 'panForward', halfW, -halfD, bounds)
  }
  expect(-halfD + panned.offsetZ).toBeCloseTo(bounds.minZ, 6)

  // Por el rig (reducer): el evento EXPLORE_KEY aplica el mismo paso.
  const cam = newRig()
  cam.tick(0, FOCUS, ASPECT, '1x', false)
  expect(cam.dispatch({ type: 'EXPLORE_KEY', key: 'panForward' }, 0)).toBe(true)
  expect(cam.exploreState.offsetZ).toBeCloseTo(-step, 6)
})

// AC: camara-libre-3d/AC-2 — rueda del mouse: zoom continuo (no por pasos)
// con damping del preset, dentro de distanceRange.
test('AC: camara-libre-3d/AC-2 - rueda: zoom continuo con damping, dentro de distanceRange', () => {
  const cam = newRig()
  cam.tick(0, FOCUS, ASPECT, '1x', false)
  const [minDistance, maxDistance] = cameraPresets.explore.distanceRange
  const { damping, wheelZoomStep: step } = cameraPresets.explore
  const start = cameraPresets.explore.distance

  // Rueda hacia arriba (deltaY < 0) acerca: −1 notch (valor continuo).
  expect(cam.dispatch({ type: 'EXPLORE_WHEEL', deltaY: -120 }, 0)).toBe(true)
  expect(cam.exploreState.distance).toBeCloseTo(start - step, 6)

  // Damping: el primer frame solo avanza `damping` del trayecto.
  const first = cam.tick(16, FOCUS, ASPECT, '1x', false)
  expect(first.pose.position.distanceTo(first.pose.target)).toBeCloseTo(start - step * damping, 2)

  // Converge a la distancia deseada (sin niveles discretos).
  let res = first
  for (let i = 2; i <= 200; i += 1) res = cam.tick(i * 16, FOCUS, ASPECT, '1x', false)
  expect(res.pose.position.distanceTo(res.pose.target)).toBeCloseTo(start - step, 2)

  // Alejar/acercar a gusto queda dentro de distanceRange (clamps del preset).
  for (let i = 0; i < 200; i += 1) cam.dispatch({ type: 'EXPLORE_WHEEL', deltaY: 120 }, i)
  expect(cam.exploreState.distance).toBe(maxDistance)
  for (let i = 0; i < 300; i += 1) cam.dispatch({ type: 'EXPLORE_WHEEL', deltaY: -120 }, i)
  expect(cam.exploreState.distance).toBe(minDistance)

  // Fuera de explore la rueda del rig no hace nada (overview usa OrbitControls).
  const other = newRig()
  other.dispatch({ type: 'ROLL' }, 0)
  expect(other.dispatch({ type: 'EXPLORE_WHEEL', deltaY: -120 }, 1)).toBe(false)
})

// AC: camara-libre-3d/AC-3 — click + arrastre rota: azimuth 360° continuos
// (wrap sin salto ni clamp en ±180°) y picada limitada por pitchDegRange
// (SPEC-M/T-085: nunca supera el clamp duro de 70°).
test('AC: camara-libre-3d/AC-3 - arrastre: azimuth 360° continuo (wrap) y picada clampeada', () => {
  const bounds = newRig().panBounds
  const degPerPx = cameraPresets.explore.dragRotateDegPerPx
  const initial = initialExploreState()
  const [minPitch, maxPitch] = cameraPresets.explore.pitchDegRange

  // Delta proporcional a la sensibilidad del preset (AC-6).
  expect(exploreDragStep(initial, 100, 0).azimuthDeg).toBeCloseTo(-100 * degPerPx, 6)

  // Cruce de ±180°: 170° + 30° = 200° ⇒ −160° (envuelve, sin tope en 180°).
  const crossed = exploreDragStep({ ...initial, azimuthDeg: 170 }, -100, 0)
  expect(crossed.azimuthDeg).toBeCloseTo(170 + 100 * degPerPx - 360, 6)
  expect(Math.abs(crossed.azimuthDeg)).toBeLessThan(180)

  // Continuidad: la pose en +180° y −180° es idéntica (sin salto de cámara).
  const p180 = explorePose(clampExploreState({ ...initial, azimuthDeg: 180 }), 0, 0, bounds)
  const pMinus180 = explorePose(clampExploreState({ ...initial, azimuthDeg: -180 }), 0, 0, bounds)
  expect(p180.position.distanceTo(pMinus180.position)).toBeLessThan(1e-6)

  // La picada queda en pitchDegRange (SPEC-M/T-085: tope ≤ 70°).
  expect(exploreDragStep({ ...initial, elevationDeg: 70 }, 0, 1000).elevationDeg).toBe(maxPitch)
  expect(exploreDragStep({ ...initial, elevationDeg: 30 }, 0, -1000).elevationDeg).toBe(minPitch)

  // Por el rig (reducer).
  const cam = newRig()
  cam.tick(0, FOCUS, ASPECT, '1x', false)
  expect(cam.dispatch({ type: 'EXPLORE_DRAG', dxPx: 50, dyPx: 0 }, 0)).toBe(true)
  expect(cam.exploreState.azimuthDeg).toBeCloseTo(-50 * degPerPx, 6)
})

// AC: camara-libre-3d/AC-4 — la rotación SOLO inicia con el botón principal
// sobre el canvas del tablero (el HUD no) y se cancela al soltar o salir.
class FakeSurface implements ExploreInputSurface {
  readonly listeners = new Map<string, ExploreInputListener[]>()

  addEventListener(
    type: 'wheel' | 'pointerdown' | 'pointermove' | 'pointerup' | 'pointerleave',
    listener: ExploreInputListener,
  ): void {
    const all = this.listeners.get(type) ?? []
    all.push(listener)
    this.listeners.set(type, all)
  }

  removeEventListener(
    type: 'wheel' | 'pointerdown' | 'pointermove' | 'pointerup' | 'pointerleave',
    listener: ExploreInputListener,
  ): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((registered) => registered !== listener),
    )
  }

  dispatch(type: string, event: ExploreInputEvent): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event)
  }
}

interface FakeEvent extends ExploreInputEvent {
  prevented: boolean
}

const fakeEvent = (x: number, y: number, button = 0, deltaY = 0): FakeEvent => {
  const event: FakeEvent = {
    button,
    clientX: x,
    clientY: y,
    deltaY,
    prevented: false,
    preventDefault: (): void => {
      event.prevented = true
    },
  }
  return event
}

test('AC: camara-libre-3d/AC-4 - el arrastre solo inicia sobre el canvas y se cancela al soltar/salir', () => {
  const canvas = new FakeSurface()
  const hud = new FakeSurface()
  const windowUp = new FakeSurface()
  const dragged: Array<readonly [number, number]> = []
  const wheeled: number[] = []
  let active = true
  const detach = attachExploreInput(canvas, windowUp, {
    active: (): boolean => active,
    onDrag: (dxPx, dyPx) => {
      dragged.push([dxPx, dyPx])
    },
    onWheel: (deltaY) => {
      wheeled.push(deltaY)
    },
  })

  // Sin pointerdown previo en el canvas no hay arrastre (los clicks/paneo del
  // HUD viven en otros elementos y nunca inician la rotación).
  hud.dispatch('pointerdown', fakeEvent(10, 10))
  canvas.dispatch('pointermove', fakeEvent(40, 60))
  expect(dragged).toEqual([])

  // Botón principal sobre el canvas: arrastra con deltas exactos por evento.
  canvas.dispatch('pointerdown', fakeEvent(10, 10))
  canvas.dispatch('pointermove', fakeEvent(40, 70))
  expect(dragged).toEqual([[30, 60]])
  canvas.dispatch('pointermove', fakeEvent(55, 70))
  expect(dragged).toEqual([
    [30, 60],
    [15, 0],
  ])

  // Soltar (en el canvas o la ventana, p. ej. sobre el HUD) cancela.
  canvas.dispatch('pointerup', fakeEvent(55, 70))
  canvas.dispatch('pointermove', fakeEvent(80, 90))
  expect(dragged.length).toBe(2)
  canvas.dispatch('pointerdown', fakeEvent(0, 0))
  windowUp.dispatch('pointerup', fakeEvent(0, 0))
  canvas.dispatch('pointermove', fakeEvent(50, 0))
  expect(dragged.length).toBe(2)

  // Salir del canvas también cancela.
  canvas.dispatch('pointerdown', fakeEvent(0, 0))
  canvas.dispatch('pointerleave', fakeEvent(10, 0))
  canvas.dispatch('pointermove', fakeEvent(50, 0))
  expect(dragged.length).toBe(2)

  // Botón secundario no inicia la rotación (queda para la UI, p. ej. cartas).
  canvas.dispatch('pointerdown', fakeEvent(0, 0, 2))
  canvas.dispatch('pointermove', fakeEvent(30, 0))
  expect(dragged.length).toBe(2)

  // Rueda solo en explore y con preventDefault (sin scroll de página).
  const wheel = fakeEvent(0, 0, 0, -120)
  canvas.dispatch('wheel', wheel)
  expect(wheeled).toEqual([-120])
  expect(wheel.prevented).toBe(true)
  active = false
  const wheelOff = fakeEvent(0, 0, 0, -120)
  canvas.dispatch('wheel', wheelOff)
  expect(wheeled.length).toBe(1)
  expect(wheelOff.prevented).toBe(false)

  // detach limpia todos los listeners.
  detach()
  canvas.dispatch('pointerdown', fakeEvent(0, 0))
  canvas.dispatch('pointermove', fakeEvent(30, 0))
  canvas.dispatch('wheel', fakeEvent(0, 0, 0, -120))
  expect(dragged.length).toBe(2)
  expect(wheeled.length).toBe(1)
})

// AC: camara-libre-3d/AC-5 — teclado y mouse componen: rotar con drag
// mientras se panea con WASD funciona sin saltos ni peleas de estado.
test('AC: camara-libre-3d/AC-5 - teclado y mouse componen sin saltos ni peleas de estado', () => {
  const cam = newRig()
  cam.tick(0, FOCUS, ASPECT, '1x', false)
  const degPerPx = cameraPresets.explore.dragRotateDegPerPx

  expect(cam.dispatch({ type: 'EXPLORE_DRAG', dxPx: 100, dyPx: 0 }, 0)).toBe(true)
  expect(cam.exploreState.azimuthDeg).toBeCloseTo(-100 * degPerPx, 6)
  expect(cam.dispatch({ type: 'EXPLORE_KEY', key: 'panForward' }, 0)).toBe(true)
  // El paneo no toca el azimuth (cada entrada es dueña de sus campos).
  expect(cam.exploreState.azimuthDeg).toBeCloseTo(-100 * degPerPx, 6)
  expect(cam.dispatch({ type: 'EXPLORE_DRAG', dxPx: 100, dyPx: 0 }, 0)).toBe(true)
  // El giro CONTINÚA desde el azimut actual (sin reset ni salto).
  expect(cam.exploreState.azimuthDeg).toBeCloseTo(-200 * degPerPx, 6)
  expect(cam.dispatch({ type: 'EXPLORE_WHEEL', deltaY: 120 }, 0)).toBe(true)

  // El estado final es exactamente componer las reducciones puras en orden.
  const bounds = cam.panBounds
  let pure = initialExploreState()
  pure = exploreDragStep(pure, 100, 0)
  pure = exploreKeyStep(pure, 'panForward', FOCUS.tokenX, FOCUS.tokenZ, bounds)
  pure = exploreDragStep(pure, 100, 0)
  pure = exploreWheelStep(pure, 120)
  expect(cam.exploreState).toEqual(pure)
})

// AC: camara-libre-3d/AC-7 (actualizado por SPEC-M/T-085/AC-3) — V (overview)
// sigue funcionando; C pasa a ser "Centrar en mí": mueve el objetivo a mi
// ficha y APLICA los ángulos del modo explore (picada por defecto y azimut
// frontal; el zoom se conserva).
test('AC: camara-libre-3d/AC-7 - V resetea al overview; C aplica los ángulos del modo explore (T-085/AC-3)', () => {
  const cam = newRig()
  cam.tick(0, FOCUS, ASPECT, '1x', false)
  // Cámara libre lejos del preset (giro inclinado, zoom out, paneo).
  cam.dispatch({ type: 'EXPLORE_DRAG', dxPx: -300, dyPx: 200 }, 0)
  cam.dispatch({ type: 'EXPLORE_WHEEL', deltaY: 120 }, 0)
  cam.dispatch({ type: 'EXPLORE_KEY', key: 'panRight' }, 0)
  const free = { ...cam.exploreState }
  expect(free.elevationDeg).not.toBeCloseTo(cameraPresets.explore.elevationDeg, 3)

  // V: overview (encuadre automático del preset).
  expect(cam.dispatch({ type: 'OVERVIEW' }, 0)).toBe(true)
  const done = cam.tick(cameraPresets.transitions.followToOverviewMs, FOCUS, ASPECT, '1x', false)
  expect(done.mode).toBe('overview')
  expect(done.pose.position.distanceTo(cam.overviewPosition(ASPECT))).toBeLessThanOrEqual(0.05)

  // C: vuelve a explore centrado en mi ficha (4, −2) con los ángulos del modo.
  expect(cam.dispatch({ type: 'CENTER_ON_ME', x: 4, z: -2 }, cameraPresets.transitions.followToOverviewMs)).toBe(true)
  expect(cam.exploreState.azimuthDeg).toBeCloseTo(0, 6)
  expect(cam.exploreState.elevationDeg).toBeCloseTo(cameraPresets.explore.elevationDeg, 6)
  expect(cam.exploreState.distance).toBeCloseTo(free.distance, 6)
  const res = cam.tick(
    cameraPresets.transitions.followToOverviewMs * 2,
    FOCUS,
    ASPECT,
    '1x',
    false,
  )
  expect(res.mode).toBe('explore')
  expect(res.pose.target.x).toBeCloseTo(4, 1)
  expect(res.pose.target.z).toBeCloseTo(-2, 1)
})
