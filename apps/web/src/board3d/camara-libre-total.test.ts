// AC: camara-libre-total/AC-1..AC-5 — cámara explore totalmente libre: el
// frustum se centra en el safeArea (mismo criterio que overview) y ninguna
// ficha se auto-centra; el centrado en ficha queda reservado a la cámara de
// combate (follow/fork/transitionIn). Puro + chequeo de fuente (NO-VISION).
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'
import { cameraPresets } from './camera'
import { battleCameraCue, easeInOutCubic, ImmersiveCamera, type RigFocus } from './rig'

const halfW = BOARD3D.base.width / 2
const halfD = BOARD3D.base.depth / 2
const ASPECT = 1440 / 900

const FOCUS: RigFocus = { tokenX: 0, tokenZ: 0, nextX: 1, nextZ: 0 }
/** Ficha (cualquiera) que se mueve por el tablero. */
const MOVED: RigFocus = { tokenX: 5, tokenZ: -3, nextX: 6, nextZ: -3 }
/** Mi ficha (jugador LOCAL). */
const MY_TOKEN = { x: 4, z: -2 } as const

const token3D = (focus: RigFocus): THREE.Vector3 =>
  new THREE.Vector3(focus.tokenX, BOARD3D.token.lift, focus.tokenZ)

const newRig = (initialTarget?: { readonly x: number; readonly z: number }): ImmersiveCamera =>
  new ImmersiveCamera({ halfWidth: halfW, halfDepth: halfD, initialTarget })

const settle = (
  cam: ImmersiveCamera,
  focus: RigFocus,
  ticks = 120,
  fromMs = 0,
): ReturnType<ImmersiveCamera['tick']> => {
  let res = cam.tick(fromMs, focus, ASPECT, '1x', false)
  for (let i = 1; i <= ticks; i += 1) res = cam.tick(fromMs + i * 16, focus, ASPECT, '1x', false)
  return res
}

const toFollow = (cam: ImmersiveCamera): void => {
  cam.dispatch({ type: 'ROLL' }, 0)
  cam.tick(cameraPresets.transitions.overviewToFollowMs, FOCUS, ASPECT, '1x', false)
  expect(cam.mode).toBe('follow')
}

// AC: camara-libre-total/AC-1 — en explore el frustum NO sigue la ficha: el
// centro del frustum es el centro del safeArea (safeMix 1, criterio overview)
// y panear mueve el punto mirado sin que la ficha quede clavada al centro.
test('AC: camara-libre-total/AC-1 - explore: frustum en el safeArea y paneo sin pinning', () => {
  const cam = newRig()
  const start = cam.tick(0, FOCUS, ASPECT, '1x', false)
  expect(start.mode).toBe('explore')
  expect(start.safeMix).toBe(1)

  // WASD/arrastre mueven el punto mirado; el frustum sigue centrado en el
  // safeArea (10 × panRight de camera.json: 10 · 6/12 = 5 unidades).
  for (let i = 0; i < 10; i += 1) {
    expect(cam.dispatch({ type: 'EXPLORE_KEY', key: 'panRight' }, i)).toBe(true)
  }
  const panned = settle(cam, FOCUS, 120, 10)
  expect(panned.safeMix).toBe(1)
  expect(panned.pose.target.x).toBeCloseTo(5, 1)
  expect(panned.pose.target.z).toBeCloseTo(0, 1)

  // La ficha moviéndose no desplaza el punto mirado (nada queda clavado);
  // solo queda el resto asintótico del damping del propio paneo.
  const before = panned.pose.target.clone()
  const res = cam.tick(4000, MOVED, ASPECT, '1x', false)
  expect(res.safeMix).toBe(1)
  expect(Math.abs(res.pose.target.x - before.x)).toBeLessThan(0.001)
  expect(Math.abs(res.pose.target.z - before.z)).toBeLessThan(0.001)
})

// AC: camara-libre-total/AC-2 — el centrado en ficha queda reservado a la
// cámara de combate: transitionIn/follow/fork mantienen safeMix 0 al llegar y
// CameraRig solo pasa tokenWorld en esos modos (nunca en explore/overview/free).
test('AC: camara-libre-total/AC-2 - tokenWorld solo en follow/fork/transitionIn', () => {
  const cam = newRig()
  expect(cam.dispatch({ type: 'ROLL' }, 0)).toBe(true)
  const mid = cam.tick(350, FOCUS, ASPECT, '1x', false)
  expect(mid.mode).toBe('transitionIn')
  expect(mid.safeMix).toBeGreaterThan(0)
  expect(mid.safeMix).toBeLessThan(1)
  const done = cam.tick(cameraPresets.transitions.overviewToFollowMs, FOCUS, ASPECT, '1x', false)
  expect(done.mode).toBe('follow')
  expect(done.safeMix).toBe(0)

  expect(cam.dispatch({ type: 'CHOOSE_PATH' }, 700)).toBe(true)
  const fork = settle(cam, FOCUS, 400, 701)
  expect(fork.mode).toBe('fork')
  expect(fork.safeMix).toBe(0)

  const source = readFileSync(new URL('./CameraRig.tsx', import.meta.url), 'utf8')
  expect(source).toContain('battleCamera && res.safeMix < 1')
  expect(source).not.toContain("res.mode === 'explore'")
})

// AC: camara-libre-total/AC-3 — las transiciones hacia explore terminan con el
// frustum centrado en el safeArea, interpolando 0→1 sin salto al final.
test('AC: camara-libre-total/AC-3 - transitionOut → explore interpola safeMix 0→1 sin snap', () => {
  const cam = newRig()
  toFollow(cam)
  const duration = cameraPresets.transitions.followToOverviewMs
  expect(cam.dispatch({ type: 'TURN_END' }, 700)).toBe(true)
  expect(cam.tick(701, FOCUS, ASPECT, '1x', false).safeMix).toBeLessThan(0.01)

  const mid = cam.tick(700 + duration / 2, FOCUS, ASPECT, '1x', false)
  expect(mid.mode).toBe('transitionOut')
  expect(mid.safeMix).toBeCloseTo(easeInOutCubic(0.5), 6)

  const almost = cam.tick(700 + duration - 1, FOCUS, ASPECT, '1x', false)
  expect(almost.mode).toBe('transitionOut')
  const done = cam.tick(700 + duration, FOCUS, ASPECT, '1x', false)
  expect(done.mode).toBe('explore')
  expect(done.safeMix).toBe(1)
  // Sin snap: el último frame de la transición ya estaba en el valor final.
  expect(Math.abs(done.safeMix - almost.safeMix)).toBeLessThan(0.01)
  expect(settle(cam, FOCUS, 10, 700 + duration + 16).safeMix).toBe(1)
})

// AC: camara-libre-total/AC-4 — el encuadre inicial sobre mi ficha (una sola
// vez, al montar) y "Centrar en mí" siguen funcionando; después no hay pinning.
test('AC: camara-libre-total/AC-4 - encuadre inicial + Centrar en mí, sin pinning posterior', () => {
  const cam = newRig(MY_TOKEN)
  const first = cam.tick(0, FOCUS, ASPECT, '1x', false)
  expect(first.pose.target.x).toBeCloseTo(MY_TOKEN.x, 1)
  expect(first.pose.target.z).toBeCloseTo(MY_TOKEN.z, 1)
  expect(first.safeMix).toBe(1)

  // Ninguna ficha que se mueve re-encuadra (el encuadre fue una sola vez).
  let res = settle(cam, MOVED, 120, 16)
  expect(res.pose.target.x).toBeCloseTo(MY_TOKEN.x, 1)

  // Panear aleja el objetivo (4 × panRight = 2 unidades, dentro de panBounds);
  // "Centrar en mí" lo trae de vuelta con damping.
  for (let i = 0; i < 4; i += 1) cam.dispatch({ type: 'EXPLORE_KEY', key: 'panRight' }, 2000 + i)
  res = settle(cam, MOVED, 120, 2016)
  expect(res.pose.target.x).toBeCloseTo(MY_TOKEN.x + 2, 1)

  expect(cam.dispatch({ type: 'CENTER_ON_ME', ...MY_TOKEN }, 4000)).toBe(true)
  expect(cam.mode).toBe('explore')
  const step = cam.tick(4016, MOVED, ASPECT, '1x', false)
  expect(step.pose.target.x).not.toBeCloseTo(MY_TOKEN.x, 1)
  res = settle(cam, MOVED, 200, 4032)
  expect(res.pose.target.x).toBeCloseTo(MY_TOKEN.x, 1)
  expect(res.pose.target.z).toBeCloseTo(MY_TOKEN.z, 1)
  expect(res.safeMix).toBe(1)

  // Sin pinning posterior: la ficha sigue moviéndose y el objetivo queda.
  const still = settle(cam, { tokenX: 9, tokenZ: 9, nextX: 9, nextZ: 10 }, 60, 8000)
  expect(still.pose.target.x).toBeCloseTo(MY_TOKEN.x, 1)
})

// AC: camara-libre-total/AC-5 — battleCameraCue y el zoom del popup de combate
// (T-075/AC-4) quedan intactos: abrir acerca a la ficha, cerrar vuelve.
test('AC: camara-libre-total/AC-5 - battleCameraCue y zoom del popup intactos', () => {
  expect(battleCameraCue('explore', true, false)).toEqual({ type: 'ROLL' })
  expect(battleCameraCue('overview', true, false)).toEqual({ type: 'ROLL' })
  expect(battleCameraCue('free', true, false)).toEqual({ type: 'ROLL' })
  expect(battleCameraCue('follow', true, false)).toBeNull()
  expect(battleCameraCue('transitionIn', true, false)).toBeNull()
  expect(battleCameraCue('follow', false, true)).toEqual({ type: 'TURN_END' })
  expect(battleCameraCue('fork', false, true)).toEqual({ type: 'TURN_END' })
  expect(battleCameraCue('follow', false, false)).toBeNull()
  expect(battleCameraCue('overview', false, true)).toBeNull()

  const cam = newRig()
  const cue = battleCameraCue('explore', true, false)
  expect(cue).not.toBeNull()
  if (cue !== null) expect(cam.dispatch(cue, 0)).toBe(true)
  const done = cam.tick(
    cameraPresets.transitions.overviewToFollowMs,
    FOCUS,
    ASPECT,
    '1x',
    false,
  )
  expect(done.mode).toBe('follow')
  expect(done.safeMix).toBe(0)
  expect(done.pose.position.distanceTo(token3D(FOCUS))).toBeCloseTo(
    cameraPresets.follow.distance,
    1,
  )

  const close = battleCameraCue('follow', false, true)
  expect(close).toEqual({ type: 'TURN_END' })
  if (close !== null) expect(cam.dispatch(close, 800)).toBe(true)
  const out = cam.tick(
    800 + cameraPresets.transitions.followToOverviewMs,
    FOCUS,
    ASPECT,
    '1x',
    false,
  )
  expect(out.mode).toBe('explore')
  expect(out.safeMix).toBe(1)
})
