// AC: SPEC-I/T-076/AC-2..AC-7 y AC-9 + SPEC-J/T-077/AC-1..AC-6 — cámara
// inmersiva: máquina de estados, transiciones, seguimiento y modo explore
// verificados numéricamente con reloj falso (NO-VISION), sin render ni timers.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import { gameContent } from '../game/content'
import { BOARD3D } from '../theme/board3d'
import { applyCenteredOffset, cameraPresets, safeArea } from './camera'
import {
  clampExploreState,
  exploreKeyStep,
  explorePose,
  initialExploreState,
} from './explore'
import { nodeWorldPos } from './scene'
import {
  battleCameraCue,
  dampPose,
  dprStep,
  easeInOutCubic,
  followPose,
  ImmersiveCamera,
  nextMode,
  type CameraPose,
  type RigFocus,
} from './rig'

const halfW = BOARD3D.base.width / 2
const halfD = BOARD3D.base.depth / 2
const ASPECT = 1440 / 900

const FOCUS: RigFocus = { tokenX: 0, tokenZ: 0, nextX: 1, nextZ: 0 }
const token3D = (focus: RigFocus): THREE.Vector3 =>
  new THREE.Vector3(focus.tokenX, BOARD3D.token.lift, focus.tokenZ)

const newRig = (): ImmersiveCamera => new ImmersiveCamera({ halfWidth: halfW, halfDepth: halfD })

const toFollow = (cam: ImmersiveCamera): void => {
  cam.dispatch({ type: 'ROLL' }, 0)
  cam.tick(cameraPresets.transitions.overviewToFollowMs, FOCUS, ASPECT, '1x', false)
  expect(cam.mode).toBe('follow')
}

const elevationDeg = (pose: CameraPose, focus: RigFocus): number => {
  const horizontal = Math.hypot(pose.position.x - focus.tokenX, pose.position.z - focus.tokenZ)
  return (Math.atan2(pose.position.y - BOARD3D.token.lift, horizontal) * 180) / Math.PI
}

test('AC: SPEC-I/T-076/AC-2 - ROLL: overview → follow en 700 ms con distancia 2,6 y elevación 28°', () => {
  const cam = newRig()
  expect(cam.dispatch({ type: 'ROLL' }, 0)).toBe(true)
  expect(cam.mode).toBe('transitionIn')

  const mid = cam.tick(350, FOCUS, ASPECT, '1x', false)
  expect(mid.mode).toBe('transitionIn')
  expect(mid.inputLocked).toBe(true)

  const almost = cam.tick(cameraPresets.transitions.overviewToFollowMs - 1, FOCUS, ASPECT, '1x', false)
  expect(almost.mode).toBe('transitionIn')

  const done = cam.tick(cameraPresets.transitions.overviewToFollowMs, FOCUS, ASPECT, '1x', false)
  expect(done.mode).toBe('follow')
  expect(done.inputLocked).toBe(false)
  expect(done.pose.position.distanceTo(token3D(FOCUS))).toBeCloseTo(cameraPresets.follow.distance, 1)
  expect(elevationDeg(done.pose, FOCUS)).toBeCloseTo(cameraPresets.follow.elevationDeg, 1)
  // Mira ligeramente hacia el próximo nodo: target = ficha + 0,6 · heading (+x).
  expect(done.pose.target.x).toBeCloseTo(FOCUS.tokenX + cameraPresets.follow.lookAhead, 2)
  expect(done.pose.target.z).toBeCloseTo(FOCUS.tokenZ, 2)
})

test('AC: SPEC-I/T-076/AC-3 - seguimiento con amortiguación 0,12 por frame', () => {
  const cam = newRig()
  toFollow(cam)
  const before = cam.tick(701, FOCUS, ASPECT, '1x', false).pose.position.clone()
  const moved: RigFocus = { tokenX: 1, tokenZ: 0, nextX: 2, nextZ: 0 }
  const after = cam.tick(717, moved, ASPECT, '1x', false).pose.position
  const desired = followPose('follow', moved, cam.heading, cam.panBounds)
  expect(after.x).toBeCloseTo(before.x + (desired.position.x - before.x) * 0.12, 3)
})

test('AC: SPEC-I/T-076/AC-3 - ChoosePath ⇒ fork (38°, 3,4) y PATH_CHOSEN ⇒ follow', () => {
  const cam = newRig()
  toFollow(cam)
  expect(cam.dispatch({ type: 'CHOOSE_PATH' }, 700)).toBe(true)
  // Converge con damping (pose estática tras suficiente tiempo).
  let res = cam.tick(701, FOCUS, ASPECT, '1x', false)
  for (let i = 2; i <= 400; i += 1) res = cam.tick(700 + i * 16, FOCUS, ASPECT, '1x', false)
  expect(res.mode).toBe('fork')
  expect(res.pose.position.distanceTo(token3D(FOCUS))).toBeCloseTo(cameraPresets.fork.distance, 1)
  expect(elevationDeg(res.pose, FOCUS)).toBeCloseTo(cameraPresets.fork.elevationDeg, 1)

  expect(cam.dispatch({ type: 'PATH_CHOSEN' }, 8000)).toBe(true)
  expect(cam.tick(8016, FOCUS, ASPECT, '1x', false).mode).toBe('follow')
})

// AC: SPEC-J/T-077/AC-4 — tras mover la ficha la cámara vuelve a `explore`
// (afterTurn), NO al overview completo. Hold de 600 ms igual que T-076.
test('AC: SPEC-J/T-077/AC-4 - TURN_END: follow → explore (afterTurn) en 1000 ms y hold de 600 ms', () => {
  const cam = newRig()
  toFollow(cam)
  expect(cam.dispatch({ type: 'TURN_END' }, 700)).toBe(true)
  expect(cam.mode).toBe('transitionOut')

  const during = cam.tick(1200, FOCUS, ASPECT, '1x', false)
  expect(during.mode).toBe('transitionOut')
  expect(during.inputLocked).toBe(true)
  // camara-libre-total/AC-3: el safeMix interpola 0→1 hacia el frustum del
  // safeArea (antes quedaba clavado en 0 con la ficha centrada).
  expect(during.safeMix).toBeCloseTo(easeInOutCubic(0.5), 6)

  const beforeDone = cam.tick(1699, FOCUS, ASPECT, '1x', false)
  expect(beforeDone.mode).toBe('transitionOut')
  const done = cam.tick(1700, FOCUS, ASPECT, '1x', false)
  expect(done.mode).toBe(cameraPresets.afterTurn === 'overview' ? 'overview' : 'explore')
  expect(done.mode).toBe('explore')
  expect(done.safeMix).toBe(1)
  // Centrada en la ficha a distancia explore, lejos del encuadre overview.
  expect(done.pose.target.x).toBeCloseTo(FOCUS.tokenX, 1)
  expect(done.pose.target.z).toBeCloseTo(FOCUS.tokenZ, 1)
  expect(done.pose.position.distanceTo(token3D(FOCUS))).toBeLessThanOrEqual(
    cameraPresets.explore.distance + 0.2,
  )
  expect(done.pose.position.distanceTo(cam.overviewPosition(ASPECT))).toBeGreaterThan(1)
  // Hold: la entrada sigue bloqueada 600 ms tras llegar (1700 → 2300).
  expect(done.inputLocked).toBe(true)
  expect(cam.tick(2299, FOCUS, ASPECT, '1x', false).inputLocked).toBe(true)
  expect(cam.tick(2300, FOCUS, ASPECT, '1x', false).inputLocked).toBe(false)
})

test('AC: SPEC-I/T-076/AC-5 - la ficha queda centrada dentro del safeArea (±5 %)', () => {
  const cam = newRig()
  toFollow(cam)
  const res = cam.tick(701, FOCUS, ASPECT, '1x', false)
  const camera = new THREE.PerspectiveCamera(res.pose.fov, ASPECT, 0.1, 200)
  camera.position.copy(res.pose.position)
  camera.up.set(0, 1, 0)
  camera.lookAt(res.pose.target)
  camera.updateMatrixWorld(true)
  applyCenteredOffset(camera, safeArea, 1440, 900, token3D(FOCUS), 0)
  const ndc = token3D(FOCUS).clone().project(camera)
  const fx = (ndc.x + 1) / 2
  const fy = (1 - ndc.y) / 2
  const cx = safeArea.x + safeArea.w / 2
  const cy = safeArea.y + safeArea.h / 2
  expect(Math.abs(fx - cx)).toBeLessThanOrEqual(0.05)
  expect(Math.abs(fy - cy)).toBeLessThanOrEqual(0.05)
  expect(fx).toBeGreaterThanOrEqual(safeArea.x)
  expect(fx).toBeLessThanOrEqual(safeArea.x + safeArea.w)
  expect(fy).toBeGreaterThanOrEqual(safeArea.y)
  expect(fy).toBeLessThanOrEqual(safeArea.y + safeArea.h)
})

test('AC: SPEC-I/T-076/AC-5 - no baja de minHeight ni sale del mundo', () => {
  const cam = newRig()
  const corner: RigFocus = { tokenX: halfW, tokenZ: -halfD, nextX: halfW + 1, nextZ: -halfD }
  const pose = followPose('follow', corner, new THREE.Vector2(1, 0), cam.panBounds)
  expect(pose.position.y).toBeGreaterThanOrEqual(cameraPresets.follow.minHeight)
  expect(pose.position.x).toBeLessThanOrEqual(cam.panBounds.maxX)
  expect(pose.position.x).toBeGreaterThanOrEqual(cam.panBounds.minX)
  expect(pose.position.z).toBeLessThanOrEqual(cam.panBounds.maxZ)
  expect(pose.position.z).toBeGreaterThanOrEqual(cam.panBounds.minZ)
  const far = followPose(
    'follow',
    { tokenX: halfW * 3, tokenZ: -halfD * 3, nextX: halfW * 3 + 1, nextZ: -halfD * 3 },
    new THREE.Vector2(1, 0),
    cam.panBounds,
  )
  expect(far.position.x).toBeLessThanOrEqual(cam.panBounds.maxX)
  expect(far.position.z).toBeGreaterThanOrEqual(cam.panBounds.minZ)
})

test('AC: SPEC-I/T-076/AC-6 - skip/reducedMotion: cortes directos sin interpolación', () => {
  const skip = newRig()
  skip.dispatch({ type: 'ROLL' }, 0)
  const res = skip.tick(0, FOCUS, ASPECT, 'skip', false)
  expect(res.mode).toBe('follow')
  expect(res.pose.position.distanceTo(token3D(FOCUS))).toBeCloseTo(cameraPresets.follow.distance, 6)

  const reduced = newRig()
  reduced.dispatch({ type: 'ROLL' }, 0)
  const res2 = reduced.tick(0, FOCUS, ASPECT, '1x', true)
  expect(res2.mode).toBe('follow')
  expect(res2.pose.position.distanceTo(token3D(FOCUS))).toBeCloseTo(cameraPresets.follow.distance, 6)
})

test('AC: SPEC-I/T-076/AC-7 - la máquina de estados rechaza transiciones inválidas', () => {
  expect(nextMode('overview', { type: 'CHOOSE_PATH' })).toBeNull()
  expect(nextMode('overview', { type: 'PATH_CHOSEN' })).toBeNull()
  expect(nextMode('overview', { type: 'TURN_END' })).toBeNull()
  expect(nextMode('overview', { type: 'DONE' })).toBeNull()
  // camara-libre-sin-ficha: desde overview transiciona (AC-4); en combate queda
  // reservado (AC-8).
  expect(nextMode('overview', { type: 'CENTER_ON_ME', x: 0, z: 0 })).toBe('transitionOut')
  expect(nextMode('transitionIn', { type: 'ROLL' })).toBeNull()
  expect(nextMode('follow', { type: 'USER_INPUT' })).toBeNull()
  expect(nextMode('follow', { type: 'CENTER_ON_ME', x: 0, z: 0 })).toBeNull()
  expect(nextMode('follow', { type: 'OVERVIEW' })).toBeNull()
  expect(nextMode('transitionIn', { type: 'OVERVIEW' })).toBeNull()

  const cam = newRig()
  expect(cam.dispatch({ type: 'TURN_END' }, 0)).toBe(false)
  expect(cam.mode).toBe('explore')
  cam.dispatch({ type: 'ROLL' }, 0)
  expect(cam.dispatch({ type: 'CHOOSE_PATH' }, 1)).toBe(false)
  expect(cam.mode).toBe('transitionIn')
})

test('AC: SPEC-I/T-076/AC-9 - dprStep baja hacia 1 y respeta mínimo/máximo de perf', () => {
  const bounds = cameraPresets.perf.dpr
  expect(dprStep(bounds[1], bounds, -1)).toBeCloseTo(bounds[1] - 0.25, 6)
  expect(dprStep(bounds[0], bounds, -1)).toBe(bounds[0])
  expect(dprStep(bounds[0], bounds, 1)).toBeCloseTo(bounds[0] + 0.25, 6)
  expect(dprStep(bounds[1], bounds, 1)).toBe(bounds[1])
})

// AC: SPEC-I/T-075/AC-4 - al abrir el popup de combate la cámara se acerca a la
// ficha solo si está lejos; al cerrar vuelve SOLO si el popup acercó.
test('AC: SPEC-I/T-075/AC-4 - battleCameraCue: acercamiento al abrir y vuelta al cerrar', () => {
  expect(battleCameraCue('overview', true, false)).toEqual({ type: 'ROLL' })
  expect(battleCameraCue('free', true, false)).toEqual({ type: 'ROLL' })
  expect(battleCameraCue('explore', true, false)).toEqual({ type: 'ROLL' })
  // Ya cerca (follow) o en transición: no hace nada ("si no lo está").
  expect(battleCameraCue('follow', true, false)).toBeNull()
  expect(battleCameraCue('transitionIn', true, false)).toBeNull()
  // Cierre: vuelve al estado previo solo si el popup acercó.
  expect(battleCameraCue('follow', false, true)).toEqual({ type: 'TURN_END' })
  expect(battleCameraCue('fork', false, true)).toEqual({ type: 'TURN_END' })
  expect(battleCameraCue('follow', false, false)).toBeNull()
  expect(battleCameraCue('overview', false, true)).toBeNull()
})


test('dampPose acerca la pose actual a la deseada por el factor de damping', () => {
  const current: CameraPose = {
    position: new THREE.Vector3(0, 1, 0),
    target: new THREE.Vector3(0, 0, 0),
    fov: 50,
  }
  const desired: CameraPose = {
    position: new THREE.Vector3(10, 1, 0),
    target: new THREE.Vector3(2, 0, 0),
    fov: 55,
  }
  dampPose(current, desired, 0.12)
  expect(current.position.x).toBeCloseTo(1.2, 6)
  expect(current.target.x).toBeCloseTo(0.24, 6)
  expect(current.fov).toBeCloseTo(50.6, 6)
})

// ── SPEC-J/T-077: cámara de exploración ──────────────────────────────────────

const poseCamera = (pose: CameraPose): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera(pose.fov, ASPECT, 0.1, 200)
  camera.position.copy(pose.position)
  camera.up.set(0, 1, 0)
  camera.lookAt(pose.target)
  camera.updateMatrixWorld(true)
  return camera
}

// AC: SPEC-J/T-077/AC-1 + SPEC-M/T-085/AC-1 — modo explore por defecto:
// distancia 7,5 ± 0,2 de la ficha, picada 38° y amortiguación 0,1.
test('AC: SPEC-J/T-077/AC-1 - explore por defecto: 7,5 ± 0,2 de la ficha, picada 38°, damping 0,1', () => {
  expect(cameraPresets.explore.distance).toBeCloseTo(7.5, 6)
  expect(cameraPresets.explore.elevationDeg).toBeCloseTo(38, 6)
  expect(cameraPresets.explore.damping).toBeCloseTo(0.1, 6)
  expect(cameraPresets.afterTurn).toBe('explore')

  const cam = newRig()
  expect(cam.mode).toBe('explore')
  const res = cam.tick(0, FOCUS, ASPECT, '1x', false)
  expect(res.mode).toBe('explore')
  // camara-libre-total/AC-1: frustum centrado en el safeArea (safeMix 1).
  expect(res.safeMix).toBe(1)
  expect(res.pose.position.distanceTo(token3D(FOCUS))).toBeCloseTo(cameraPresets.explore.distance, 1)
  expect(elevationDeg(res.pose, FOCUS)).toBeCloseTo(cameraPresets.explore.elevationDeg, 1)
})

// AC: SPEC-J/T-077/AC-2 + SPEC-M/T-085/AC-1 — giro 360° con y ≥ 0,4 y dentro
// del mundo; clamps de picada 20°–60° y zoom 3–16; teclas Q/E (giro),
// +/- (zoom) y WASD (paneo).
test('AC: SPEC-J/T-077/AC-2 - clamps 20–60 / 3–16, teclas Q/E/+/-/WASD y 360° dentro del mundo', () => {
  const bounds = newRig().panBounds
  const high = clampExploreState({ azimuthDeg: 200, elevationDeg: 80, distance: 40, offsetX: 0, offsetZ: 0 })
  expect(high.azimuthDeg).toBeCloseTo(-160, 6)
  expect(high.elevationDeg).toBe(cameraPresets.explore.pitchDegRange[1])
  expect(high.distance).toBe(cameraPresets.explore.distanceRange[1])
  const low = clampExploreState({ azimuthDeg: -200, elevationDeg: 10, distance: 1, offsetX: 0, offsetZ: 0 })
  expect(low.azimuthDeg).toBeCloseTo(160, 6)
  expect(low.elevationDeg).toBe(cameraPresets.explore.pitchDegRange[0])
  expect(low.distance).toBe(cameraPresets.explore.distanceRange[0])

  let state = exploreKeyStep(initialExploreState(), 'rotateRight', 0, 0, bounds)
  expect(state.azimuthDeg).toBeCloseTo(cameraPresets.explore.rotateSpeed * 20, 6)
  state = exploreKeyStep(state, 'rotateLeft', 0, 0, bounds)
  expect(state.azimuthDeg).toBeCloseTo(0, 6)
  for (let i = 0; i < 40; i += 1) state = exploreKeyStep(state, 'zoomIn', 0, 0, bounds)
  expect(state.distance).toBe(cameraPresets.explore.distanceRange[0])
  for (let i = 0; i < 60; i += 1) state = exploreKeyStep(state, 'zoomOut', 0, 0, bounds)
  expect(state.distance).toBe(cameraPresets.explore.distanceRange[1])

  // WASD panea el objetivo y no sale del mundo (token en la esquina del tablero).
  let panned = initialExploreState()
  for (let i = 0; i < 60; i += 1) panned = exploreKeyStep(panned, 'panRight', halfW, -halfD, bounds)
  expect(halfW + panned.offsetX).toBeLessThanOrEqual(bounds.maxX + 1e-6)

  // Todos los ángulos del giro 360° mantienen altura mínima y mundo.
  for (let az = -180; az < 180; az += 10) {
    const pose = explorePose(clampExploreState({ ...initialExploreState(), azimuthDeg: az }), 0, 0, bounds)
    expect(pose.position.y).toBeGreaterThanOrEqual(0.4)
    expect(pose.position.x).toBeGreaterThanOrEqual(bounds.minX)
    expect(pose.position.x).toBeLessThanOrEqual(bounds.maxX)
    expect(pose.position.z).toBeGreaterThanOrEqual(bounds.minZ)
    expect(pose.position.z).toBeLessThanOrEqual(bounds.maxZ)
  }
})

// AC: SPEC-J/T-077/AC-3 — botones/teclas: Centrar en mí → explore sobre MI
// ficha (camara-libre-sin-ficha) y Vista general → overview (con transición);
// sin duplicados (una sola acción por botón, mapeadas por camera.json).
test('AC: SPEC-J/T-077/AC-3 - Centrar en mí → explore en mi ficha; Vista general → overview', () => {
  expect(cameraPresets.buttons.centerOnMe).toBe('explore')
  expect(cameraPresets.buttons.overview).toBe('overview')
  expect(cameraPresets.keys.overview).toBe('V')
  expect(cameraPresets.keys.centerOnMe).toBe('C')
  expect(nextMode('free', { type: 'OVERVIEW' })).toBe('transitionOut')
  expect(nextMode('explore', { type: 'OVERVIEW' })).toBe('transitionOut')

  const cam = newRig()
  cam.tick(0, FOCUS, ASPECT, '1x', false)
  expect(cam.dispatch({ type: 'OVERVIEW' }, 0)).toBe(true)
  const done = cam.tick(cameraPresets.transitions.followToOverviewMs, FOCUS, ASPECT, '1x', false)
  expect(done.mode).toBe('overview')
  expect(done.pose.position.distanceTo(cam.overviewPosition(ASPECT))).toBeLessThanOrEqual(0.05)

  expect(cam.dispatch({ type: 'CENTER_ON_ME', x: FOCUS.tokenX, z: FOCUS.tokenZ }, 2000)).toBe(true)
  const res = cam.tick(
    2000 + cameraPresets.transitions.followToOverviewMs,
    FOCUS,
    ASPECT,
    '1x',
    false,
  )
  expect(res.mode).toBe('explore')
  expect(res.pose.target.x).toBeCloseTo(FOCUS.tokenX, 1)
  // N-0001: el centrado vuelve a la distancia de encuadre (no conserva zoom).
  expect(res.pose.position.distanceTo(token3D(FOCUS))).toBeCloseTo(BOARD3D.camera.centerOnMeDistance, 1)
})

// AC: N-0001/AC-1..AC-3 — arranque y "Centrar en mí" con la ficha en el BORDE
// del tablero (Pueblo Paleta): la cámara queda a la distancia de encuadre (el
// clamp de borde no la acerca), la ficha en el centro del safeArea y los 3
// nodos más cercanos dentro del frustum.
test('AC: N-0001/AC-1 - ficha en el borde: distancia de encuadre, centrada y con el camino a la vista', () => {
  const imageSize = gameContent.board.meta.imageSize
  const worlds = gameContent.board.nodes.map((node) => nodeWorldPos(node, imageSize))
  const edge = worlds.reduce((a, b) => (b.z > a.z ? b : a))
  const token = new THREE.Vector3(edge.x, BOARD3D.token.lift, edge.z)
  const focus: RigFocus = { tokenX: edge.x, tokenZ: edge.z, nextX: edge.x, nextZ: edge.z }
  const cam = new ImmersiveCamera({ halfWidth: halfW, halfDepth: halfD, initialTarget: edge })

  const check = (pose: CameraPose): void => {
    expect(pose.position.distanceTo(pose.target)).toBeCloseTo(BOARD3D.camera.centerOnMeDistance, 1)
    const camera = poseCamera(pose)
    applyCenteredOffset(camera, safeArea, 1440, 810, null, 1)
    const ndc = token.clone().project(camera)
    // AC: N-0004/AC-4 (reemplaza el "30 % central" de N-0001/AC-1): en el borde
    // sur el encuadre se corre al tablero ⇒ ficha en la mitad inferior del área
    // útil, dentro de ella, y el centro del tablero (0,0) también a la vista.
    const fx = (ndc.x + 1) / 2
    const fy = (1 - ndc.y) / 2
    expect(fx).toBeGreaterThan(safeArea.x)
    expect(fx).toBeLessThan(safeArea.x + safeArea.w)
    expect(fy).toBeGreaterThan(safeArea.y + safeArea.h / 2)
    expect(fy).toBeLessThan(safeArea.y + safeArea.h)
    const origin = new THREE.Vector3(0, 0, 0).project(camera)
    expect(Math.abs(origin.x)).toBeLessThanOrEqual(1)
    expect((1 - origin.y) / 2).toBeLessThan(fy)
    // AC-2: los 3 casilleros más cercanos (sin contar el propio) en pantalla.
    const next = worlds
      .filter((world) => world !== edge)
      .sort((a, b) => Math.hypot(a.x - edge.x, a.z - edge.z) - Math.hypot(b.x - edge.x, b.z - edge.z))
      .slice(0, 3)
    for (const world of next) {
      const p = new THREE.Vector3(world.x, 0, world.z).project(camera)
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1)
    }
  }

  check(cam.tick(0, focus, 1440 / 810, '1x', false).pose)
  // Zoom + giro del usuario y después "Centrar en mí": mismo encuadre.
  cam.dispatch({ type: 'EXPLORE_WHEEL', deltaY: -600 }, 0)
  cam.dispatch({ type: 'EXPLORE_DRAG', dxPx: 200, dyPx: 100 }, 0)
  expect(cam.dispatch({ type: 'CENTER_ON_ME', x: edge.x, z: edge.z }, 0)).toBe(true)
  check(cam.tick(16, focus, 1440 / 810, 'skip', false).pose)
})

// AC: SPEC-J/T-077/AC-5 — ficha proyectada dentro del safeArea (±5 %) y los 3
// nodos más cercanos a la ficha visibles en el frustum.
test('AC: SPEC-J/T-077/AC-5 - ficha en safeArea (±5 %) y 3 nodos más cercanos visibles', () => {
  const res = newRig().tick(0, FOCUS, ASPECT, '1x', false)
  const camera = poseCamera(res.pose)
  // camara-libre-total: offset según el rig (explore ⇒ frustum en safeArea).
  applyCenteredOffset(
    camera,
    safeArea,
    1440,
    900,
    res.safeMix < 1 ? token3D(FOCUS) : null,
    res.safeMix,
  )
  const ndc = token3D(FOCUS).clone().project(camera)
  const fx = (ndc.x + 1) / 2
  const fy = (1 - ndc.y) / 2
  const cx = safeArea.x + safeArea.w / 2
  const cy = safeArea.y + safeArea.h / 2
  expect(Math.abs(fx - cx)).toBeLessThanOrEqual(0.05)
  expect(Math.abs(fy - cy)).toBeLessThanOrEqual(0.05)

  const imageSize = gameContent.board.meta.imageSize
  const nearest = gameContent.board.nodes
    .map((node) => nodeWorldPos(node, imageSize))
    .sort(
      (a, b) =>
        Math.hypot(a.x - FOCUS.tokenX, a.z - FOCUS.tokenZ) -
        Math.hypot(b.x - FOCUS.tokenX, b.z - FOCUS.tokenZ),
    )
    .slice(0, 3)
  expect(nearest.length).toBe(3)
  for (const world of nearest) {
    const projected = new THREE.Vector3(world.x, 0, world.z).project(camera)
    expect(projected.z).toBeGreaterThan(0)
    expect(projected.z).toBeLessThan(1)
    expect(Math.abs(projected.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(projected.y)).toBeLessThanOrEqual(1)
  }
})

// AC: SPEC-J/T-077/AC-6 — con la vista explore el tablero NO entra completo
// (se ve la zona de la ficha de cerca): al menos una esquina queda fuera.
test('AC: SPEC-J/T-077/AC-6 - la vista explore NO encuadra el tablero completo', () => {
  const res = newRig().tick(0, FOCUS, ASPECT, '1x', false)
  const camera = poseCamera(res.pose)
  applyCenteredOffset(
    camera,
    safeArea,
    1440,
    900,
    res.safeMix < 1 ? token3D(FOCUS) : null,
    res.safeMix,
  )
  const outside = ([-halfW, halfW] as const).some((x) =>
    ([-halfD, halfD] as const).some((z) => {
      const projected = new THREE.Vector3(x, 0, z).project(camera)
      return projected.z <= 0 || projected.z >= 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1
    }),
  )
  expect(outside).toBe(true)
})
