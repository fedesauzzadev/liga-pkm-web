// AC: SPEC-I/T-076/AC-1 — overview: encuadre del tablero dentro del safeArea
// con 5 % de margen y controles libres pero limitados, demostrado por
// proyección numérica (NO-VISION), sin render.
import { readFileSync } from 'node:fs'
import { expect, test, vi } from 'vitest'
import { crossCheckCamera, UiCameraSchema, type PanelBox } from '@liga/content'
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'
import {
  applyCenteredOffset,
  applySafeOffset,
  cameraPresets,
  clampTarget,
  planExploreControls,
  planOverview,
} from './camera'
import { exploreDragStep, explorePose, exploreWheelStep, initialExploreState } from './explore'
import { ImmersiveCamera, type RigFocus } from './rig'

const halfW = BOARD3D.base.width / 2
const halfD = BOARD3D.base.depth / 2

const overviewCamera = (aspect: number): {
  readonly plan: ReturnType<typeof planOverview>
  readonly camera: THREE.PerspectiveCamera
} => {
  const plan = planOverview(halfW, halfD, aspect)
  const camera = new THREE.PerspectiveCamera(plan.fovDeg, aspect, plan.near, plan.far)
  camera.position.set(...plan.position)
  camera.up.set(0, 1, 0)
  camera.lookAt(plan.target[0], plan.target[1], plan.target[2])
  camera.updateMatrixWorld(true)
  return { plan, camera }
}

test('AC: SPEC-I/T-076/AC-1 - camera.json valida el esquema y los chequeos cruzados', () => {
  expect(UiCameraSchema.safeParse(cameraPresets).success).toBe(true)
  expect(crossCheckCamera(cameraPresets)).toEqual([])
})

test('AC: SPEC-I/T-076/AC-1 - picada overview 50° (presets) mirando al centro', () => {
  for (const aspect of [1, 1440 / 900]) {
    const { plan, camera } = overviewCamera(aspect)
    expect(plan.fovDeg).toBe(cameraPresets.overview.fov)
    // N-0004: el objetivo se corre al sur (z > 0) para llenar el alto útil.
    expect(plan.target[0]).toBe(0)
    expect(plan.target[2]).toBeGreaterThan(0)
    expect(plan.target[2]).toBeLessThan(halfD)
    const horizontal = Math.hypot(camera.position.x, camera.position.z - plan.target[2])
    const elevation = Math.atan2(camera.position.y, horizontal) * (180 / Math.PI)
    expect(elevation).toBeCloseTo(cameraPresets.overview.elevationDeg, 6)
  }
})

test('AC: SPEC-I/T-076/AC-1 - el tablero entero cae dentro del safeArea con margen', () => {
  const safe: PanelBox = {
    x: 0,
    y: 0,
    w: 0.83,
    h: 0.79,
  }
  for (const [width, height] of [[1440, 900], [1024, 600]] as const) {
    const { camera } = overviewCamera(width / height)
    applySafeOffset(camera, safe, width, height)
    let maxFx = 0
    let maxFy = 0
    for (const x of [-halfW, halfW]) {
      for (const y of [-BOARD3D.node.height, 0]) {
        for (const z of [-halfD, halfD]) {
          const ndc = new THREE.Vector3(x, y, z).project(camera)
          expect(ndc.z, 'la esquina queda detrás de la cámara').toBeGreaterThan(0)
          maxFx = Math.max(maxFx, Math.abs((ndc.x + 1) / 2 - (safe.x + safe.w / 2)))
          maxFy = Math.max(maxFy, Math.abs((1 - ndc.y) / 2 - (safe.y + safe.h / 2)))
        }
      }
    }
    // Dentro del safeArea (± un pelosito numérico): |f − 0,5| ≤ safe/2.
    expect(maxFx).toBeLessThanOrEqual(safe.w / 2 + 1e-6)
    expect(maxFy).toBeLessThanOrEqual(safe.h / 2 + 1e-6)
    // AC: N-0004/AC-1 — el borde cercano del tablero ocupa ≥ 60 % del ancho útil
    // y el encuadre llena el alto (antes: esfera envolvente, ~35 %).
    expect((2 * maxFx) / safe.w).toBeGreaterThanOrEqual(0.6)
    expect((2 * maxFy) / safe.h).toBeGreaterThanOrEqual(0.9)
  }
})

test('AC: SPEC-I/T-076/AC-1 + SPEC-J/T-077/AC-2 - zoom y azimut del overview desde presets (giro 360°)', () => {
  const { plan } = overviewCamera(1)
  const deg = (rad: number): number => (rad * 180) / Math.PI
  const [zoomMin, zoomMax] = cameraPresets.overview.zoomRange
  expect(plan.controls.minDistance).toBeCloseTo(plan.distance * zoomMin, 6)
  expect(plan.controls.maxDistance).toBeCloseTo(plan.distance * zoomMax, 6)
  const [azMin, azMax] = cameraPresets.overview.azimuthDegRange
  expect(deg(plan.controls.minAzimuth)).toBeCloseTo(azMin, 6)
  expect(deg(plan.controls.maxAzimuth)).toBeCloseTo(azMax, 6)
})

// AC: SPEC-J/T-077/AC-2 + SPEC-M/T-085/AC-2 - explore: giro 360°, picada
// 20°–60° y zoom 3–16 (conversión picada→polar de three: 90° − picada).
test('AC: SPEC-J/T-077/AC-2 - explore: azimut ±180°, polar 30°–70° (picada 20–60), distancia 3–16', () => {
  const controls = planExploreControls()
  const deg = (rad: number): number => (rad * 180) / Math.PI
  const [minD, maxD] = cameraPresets.explore.distanceRange
  const [minPitch, maxPitch] = cameraPresets.explore.pitchDegRange
  expect(controls.minDistance).toBe(minD)
  expect(controls.maxDistance).toBe(maxD)
  expect(deg(controls.minPolar)).toBeCloseTo(90 - maxPitch, 6)
  expect(deg(controls.maxPolar)).toBeCloseTo(90 - minPitch, 6)
  const [azMin, azMax] = cameraPresets.explore.azimuthDegRange
  expect(deg(controls.minAzimuth)).toBeCloseTo(azMin, 6)
  expect(deg(controls.maxAzimuth)).toBeCloseTo(azMax, 6)
  expect(azMax - azMin).toBeGreaterThanOrEqual(360 - 1e-6)
})

test('AC: SPEC-I/T-076/AC-1 - paneo limitado al mundo (tablero + 25 % de panLimit)', () => {
  const { plan } = overviewCamera(1)
  const limit = 1 + cameraPresets.overview.panLimit
  expect(plan.panBounds.minX).toBeCloseTo(-halfW * limit, 6)
  expect(plan.panBounds.maxX).toBeCloseTo(halfW * limit, 6)
  expect(plan.panBounds.minZ).toBeCloseTo(-halfD * limit, 6)
  expect(plan.panBounds.maxZ).toBeCloseTo(halfD * limit, 6)

  const far = clampTarget(new THREE.Vector3(halfW * 3, 0, -halfD * 3), plan.panBounds)
  expect(far.x).toBeCloseTo(halfW * limit, 6)
  expect(far.z).toBeCloseTo(-halfD * limit, 6)
  const inside = clampTarget(new THREE.Vector3(0.4, 0, -0.2), plan.panBounds)
  expect(inside.x).toBeCloseTo(0.4, 6)
  expect(inside.z).toBeCloseTo(-0.2, 6)
})

// AC: camara-libre-3d/AC-6 — las sensibilidades de la cámara libre (zoom por
// notch, grados por pixel de drag) viven en content/ui/camera.json validadas
// por el schema + crossCheck, y las consumen las reducciones de explore.
test('AC: camara-libre-3d/AC-6 - wheelZoomStep/dragRotateDegPerPx en camera.json (no hardcodeados)', () => {
  expect(UiCameraSchema.safeParse(cameraPresets).success).toBe(true)
  expect(crossCheckCamera(cameraPresets)).toEqual([])
  expect(cameraPresets.explore.wheelZoomStep).toBeGreaterThan(0)
  expect(cameraPresets.explore.dragRotateDegPerPx).toBeGreaterThan(0)
  const initial = initialExploreState()
  expect(exploreWheelStep(initial, -100).distance).toBeCloseTo(
    initial.distance - cameraPresets.explore.wheelZoomStep,
    6,
  )
  expect(exploreDragStep(initial, 1, 0).azimuthDeg).toBeCloseTo(
    initial.azimuthDeg - cameraPresets.explore.dragRotateDegPerPx,
    6,
  )
})

// fix-camara-resolucion — el dibujado no depende de la resolución: tras un
// resize TODOS los ticks aplican el offset con el tamaño ACTUAL (AC-1, sin
// closures viejos), applyCenteredOffset es idempotente (AC-2) y con igual
// aspecto y distinto tamaño el encuadre NDC es idéntico en overview y
// explore (AC-3).

const SAFE: PanelBox = { x: 0, y: 0, w: 0.83, h: 0.79 }
const FOCUS: RigFocus = { tokenX: 0, tokenZ: 0, nextX: 1, nextZ: 0 }

const exploreCamera = (width: number, height: number): THREE.PerspectiveCamera => {
  const panBounds = planOverview(halfW, halfD, width / height).panBounds
  const pose = explorePose(initialExploreState(), 0, 0, panBounds)
  const camera = new THREE.PerspectiveCamera(pose.fov, width / height, 0.1, 200)
  camera.position.copy(pose.position)
  camera.up.set(0, 1, 0)
  camera.lookAt(pose.target)
  camera.updateMatrixWorld(true)
  return camera
}

// AC: fix-camara-resolucion/AC-1 — tras un resize, todos los ticks del rig
// aplican el offset con el tamaño ACTUAL: la proyección no alterna entre dos
// tamaños (el mundo no pulsa al fullscreen + mover la cámara).
test('AC: fix-camara-resolucion/AC-1 - resize + ticks sucesivos sin alternancia de frustum', () => {
  // Store estilo R3F: el loop de CameraRig (ensureTicking + setTimeout) captura
  // `apply` UNA vez; el tamaño se resuelve del store EN CADA llamada (ref
  // vigente en CameraRig), no al capturar el closure del render.
  const store = { size: { width: 1440, height: 900 } }
  const rig = new ImmersiveCamera({ halfWidth: halfW, halfDepth: halfD })
  const camera = new THREE.PerspectiveCamera(
    cameraPresets.explore.fov,
    store.size.width / store.size.height,
    0.1,
    200,
  )
  let target = new THREE.Vector3(0, 0, 0)

  const apply = (nowMs: number): void => {
    const { width, height } = store.size
    const aspect = Math.max(0.2, width / Math.max(1, height))
    const res = rig.tick(nowMs, FOCUS, aspect, '1x', false)
    camera.fov = res.pose.fov
    // R3F actualiza el aspect de la cámara al cambiar el tamaño.
    camera.aspect = aspect
    camera.position.copy(res.pose.position)
    camera.up.set(0, 1, 0)
    camera.lookAt(res.pose.target)
    target = res.pose.target
    applyCenteredOffset(camera, SAFE, width, height, null, res.safeMix)
    camera.updateMatrixWorld(true)
  }

  apply(0)
  apply(16)
  expect(camera.view?.fullWidth).toBe(1440)

  // Resize (fullscreen) DESPUÉS de agendar los ticks del loop.
  store.size = { width: 2880, height: 1800 }
  const corner = new THREE.Vector3(halfW, 0, -halfD)
  const appliedWidths: number[] = []
  for (let t = 32; t <= 160; t += 16) {
    apply(t)
    appliedWidths.push(camera.view?.fullWidth ?? -1)
    // Referencia configurada entera al tamaño NUEVO con la misma pose:
    // proyección idéntica (el tick no aplicó ningún tamaño viejo).
    const ref = new THREE.PerspectiveCamera(camera.fov, 2880 / 1800, 0.1, 200)
    ref.position.copy(camera.position)
    ref.up.set(0, 1, 0)
    ref.lookAt(target)
    ref.updateMatrixWorld(true)
    applyCenteredOffset(ref, SAFE, 2880, 1800, null, 1)
    expect(camera.projectionMatrix.equals(ref.projectionMatrix), `t=${t}`).toBe(true)
    const ndc = corner.clone().project(camera)
    const ndcRef = corner.clone().project(ref)
    expect(ndc.x).toBeCloseTo(ndcRef.x, 6)
    expect(ndc.y).toBeCloseTo(ndcRef.y, 6)
  }
  // Ningún tick post-resize vuelve al tamaño viejo (sin mezcla viejo/nuevo).
  expect([...new Set(appliedWidths)]).toEqual([2880])
})

// AC: fix-camara-resolucion/AC-1 (fuente) — CameraRig lee el tamaño de un ref
// vigente DENTRO de apply (el loop ya agendado no conserva closures viejos).
test('AC: fix-camara-resolucion/AC-1 - CameraRig resuelve el tamaño en cada tick', () => {
  const source = readFileSync(new URL('./CameraRig.tsx', import.meta.url), 'utf8')
  expect(source).toContain('const sizeRef = useRef(size)')
  expect(source).toContain('sizeRef.current')
})

// AC: fix-camara-resolucion/AC-2 — idempotencia: llamadas repetidas con los
// mismos parámetros no re-escriben el view offset ni la matriz de proyección.
test('AC: fix-camara-resolucion/AC-2 - applyCenteredOffset idempotente', () => {
  const { camera } = overviewCamera(1440 / 900)
  applySafeOffset(camera, SAFE, 1440, 900)
  const viewBefore = { ...camera.view }
  const matrixBefore = camera.projectionMatrix.clone()
  const update = vi.spyOn(camera, 'updateProjectionMatrix')

  applySafeOffset(camera, SAFE, 1440, 900)
  applySafeOffset(camera, SAFE, 1440, 900)
  expect(update).not.toHaveBeenCalled()
  expect({ ...camera.view }).toEqual(viewBefore)
  expect(camera.projectionMatrix.equals(matrixBefore)).toBe(true)
  update.mockRestore()

  // Camino de combate (tokenWorld): misma ficha y misma pose ⇒ tampoco.
  const token = new THREE.Vector3(2, BOARD3D.token.lift, -1)
  applyCenteredOffset(camera, SAFE, 1440, 900, token, 0)
  const battleView = { ...camera.view }
  const battleMatrix = camera.projectionMatrix.clone()
  const battleUpdate = vi.spyOn(camera, 'updateProjectionMatrix')
  applyCenteredOffset(camera, SAFE, 1440, 900, token, 0)
  expect(battleUpdate).not.toHaveBeenCalled()
  expect({ ...camera.view }).toEqual(battleView)
  expect(camera.projectionMatrix.equals(battleMatrix)).toBe(true)
  battleUpdate.mockRestore()

  // Cambia el tamaño ⇒ re-configura (una sola vez, no por tick).
  const reapply = vi.spyOn(camera, 'updateProjectionMatrix')
  applySafeOffset(camera, SAFE, 2880, 1800)
  applySafeOffset(camera, SAFE, 2880, 1800)
  expect(reapply).toHaveBeenCalledTimes(1)
  expect(camera.view?.fullWidth).toBe(2880)
})

// AC: fix-camara-resolucion/AC-3 — encuadre independiente de la resolución:
// con igual aspecto y distinto tamaño, las esquinas del tablero proyectan a
// los mismos NDC (±1e-6), en overview y explore.
test('AC: fix-camara-resolucion/AC-3 - igual aspecto, distinto tamaño ⇒ mismos NDC', () => {
  const cornerList = (): THREE.Vector3[] => {
    const list: THREE.Vector3[] = []
    for (const x of [-halfW, halfW]) {
      for (const z of [-halfD, halfD]) list.push(new THREE.Vector3(x, 0, z))
    }
    return list
  }

  // Overview: mismo plan (solo depende del aspecto) + offset por tamaño.
  const overviewNdc = (width: number): THREE.Vector3[] => {
    const height = width / (1440 / 900)
    const { camera } = overviewCamera(width / height)
    applySafeOffset(camera, SAFE, width, height)
    return cornerList().map((corner) => corner.clone().project(camera))
  }
  // Explore: pose desde explore.ts con el mismo estado inicial.
  const exploreNdc = (width: number): THREE.Vector3[] => {
    const height = width / (1440 / 900)
    const camera = exploreCamera(width, height)
    applyCenteredOffset(camera, SAFE, width, height, null, 1)
    return cornerList().map((corner) => corner.clone().project(camera))
  }

  const cases: ReadonlyArray<readonly [string, THREE.Vector3[], THREE.Vector3[]]> = [
    ['overview', overviewNdc(1440), overviewNdc(2880)],
    ['explore', exploreNdc(1440), exploreNdc(2880)],
  ]
  for (const [mode, small, big] of cases) {
    for (const [i, ndc] of small.entries()) {
      const scaled = big[i]
      if (scaled === undefined) throw new Error(`faltan esquinas en ${mode}`)
      expect(scaled.x, `${mode} esquina ${i} x`).toBeCloseTo(ndc.x, 6)
      expect(scaled.y, `${mode} esquina ${i} y`).toBeCloseTo(ndc.y, 6)
    }
  }
})
