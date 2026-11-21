// AC: camara-libre-sin-ficha/AC-1..AC-8 — cámara explore anclada al tablero
// (sin seguimiento de ficha): el centrado pasa a ser explícito con el botón
// "Centrar en mí" (mi ficha del jugador LOCAL; ángulos del modo explore según
// SPEC-M/T-085/AC-3, damping). Puro + chequeo de fuente (NO-VISION): sin DOM.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { crossCheckCamera, UiCameraSchema } from '@liga/content'
import { es } from '../i18n/es'
import { BOARD3D } from '../theme/board3d'
import { cameraPresets } from './camera'
import { battleCameraCue, ImmersiveCamera, nextMode, type RigFocus } from './rig'

const halfW = BOARD3D.base.width / 2
const halfD = BOARD3D.base.depth / 2
const ASPECT = 1440 / 900

const FOCUS: RigFocus = { tokenX: 0, tokenZ: 0, nextX: 1, nextZ: 0 }
/** Ficha propia o ajena que se mueve por el tablero (turno cualquiera). */
const MOVED: RigFocus = { tokenX: 5, tokenZ: -3, nextX: 6, nextZ: -3 }
/** Mi ficha (jugador LOCAL, no la activa). */
// N-0004: ficha interior (fuera de centerOnMeInset el encuadre se corre al tablero).
const MY_TOKEN = { x: 1, z: -2 } as const

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

// AC: camara-libre-sin-ficha/AC-1 — objetivo del explore anclado al tablero:
// targetFollowsToken=false y ninguna ficha que se mueve desplaza la cámara.
test('AC: camara-libre-sin-ficha/AC-1 - el objetivo queda anclado al tablero (la ficha no la mueve)', () => {
  expect(cameraPresets.explore.targetFollowsToken).toBe(false)
  const cam = newRig()
  const start = settle(cam, FOCUS)
  expect(start.pose.target.x).toBeCloseTo(0, 1)
  const res = settle(cam, MOVED, 120, 2000)
  expect(res.pose.target.x).toBeCloseTo(0, 1)
  expect(res.pose.target.z).toBeCloseTo(0, 1)
  expect(res.pose.target.x).not.toBeCloseTo(MOVED.tokenX, 1)
})

// AC: camara-libre-sin-ficha/AC-2 (SPEC-N/T-092/AC-6) — la tirada (dieNonce)
// ya no cue-a la cámara (CameraRig sin ROLL ni wiring de dado) y el dado ya no
// vive en el mundo (panel-dice en el HUD): no hay reposo — camera.json sin
// clave `dice` y BOARD3D sin geometría `die`.
test('AC: camara-libre-sin-ficha/AC-2 - sin cue ROLL del dado; dado fuera del mundo', () => {
  const source = readFileSync(new URL('./CameraRig.tsx', import.meta.url), 'utf8')
  expect(source).not.toContain('dieNonce')
  expect(source).not.toContain("{ type: 'ROLL' }")
  expect(source).not.toContain('dieRestRef')
  expect('dice' in cameraPresets).toBe(false)
  expect('die' in BOARD3D).toBe(false)
})

// AC: camara-libre-sin-ficha/AC-3 (actualizado por SPEC-M/T-085/AC-3) —
// "Centrar en mí" mueve el objetivo a MI ficha con transición amortiguada
// (damping, no snap) y APLICA los ángulos del modo explore (picada por
// defecto, azimut frontal; el zoom se conserva).
test('AC: camara-libre-sin-ficha/AC-3 - Center on me: mi ficha + ángulos del modo explore + damping', () => {
  const cam = newRig()
  settle(cam, FOCUS)
  cam.dispatch({ type: 'EXPLORE_DRAG', dxPx: -300, dyPx: 0 }, 2000)
  cam.dispatch({ type: 'EXPLORE_WHEEL', deltaY: 120 }, 2000)
  const dragged = { ...cam.exploreState }

  expect(cam.dispatch({ type: 'CENTER_ON_ME', ...MY_TOKEN }, 2000)).toBe(true)
  expect(cam.mode).toBe('explore')
  // T-085/AC-3: los ángulos son los del modo explore; el zoom queda.
  expect(cam.exploreState.azimuthDeg).toBeCloseTo(0, 6)
  expect(cam.exploreState.elevationDeg).toBeCloseTo(cameraPresets.explore.elevationDeg, 6)
  // N-0001: el zoom vuelve a la distancia de encuadre.
  expect(dragged.distance).not.toBeCloseTo(BOARD3D.camera.centerOnMeDistance, 1)
  expect(cam.exploreState.distance).toBeCloseTo(BOARD3D.camera.centerOnMeDistance, 6)
  expect(cam.exploreState.offsetX).toBeCloseTo(MY_TOKEN.x, 6)
  expect(cam.exploreState.offsetZ).toBeCloseTo(MY_TOKEN.z, 6)

  // Damping: el primer frame avanza solo una fracción del trayecto (sin snap).
  const first = cam.tick(2016, FOCUS, ASPECT, '1x', false)
  expect(first.pose.target.x).toBeCloseTo(MY_TOKEN.x * cameraPresets.explore.damping, 2)
  expect(first.pose.target.x).not.toBeCloseTo(MY_TOKEN.x, 1)
  const res = settle(cam, FOCUS, 200, 2016)
  expect(res.pose.target.x).toBeCloseTo(MY_TOKEN.x, 1)
  expect(res.pose.target.z).toBeCloseTo(MY_TOKEN.z, 1)
})

// AC: camara-libre-sin-ficha/AC-4 — desde overview transiciona a explore
// centrado en mi ficha (transiciónOut → explore, no corte).
test('AC: camara-libre-sin-ficha/AC-4 - desde overview transiciona a explore centrado en mi ficha', () => {
  const cam = newRig()
  cam.tick(0, FOCUS, ASPECT, '1x', false)
  expect(cam.dispatch({ type: 'OVERVIEW' }, 0)).toBe(true)
  const duration = cameraPresets.transitions.followToOverviewMs
  expect(cam.tick(duration, FOCUS, ASPECT, '1x', false).mode).toBe('overview')

  expect(cam.dispatch({ type: 'CENTER_ON_ME', ...MY_TOKEN }, duration)).toBe(true)
  expect(cam.mode).toBe('transitionOut')
  const mid = cam.tick(duration + 500, FOCUS, ASPECT, '1x', false)
  expect(mid.mode).toBe('transitionOut')
  const done = cam.tick(duration * 2, FOCUS, ASPECT, '1x', false)
  expect(done.mode).toBe('explore')
  expect(done.pose.target.x).toBeCloseTo(MY_TOKEN.x, 1)
  expect(done.pose.target.z).toBeCloseTo(MY_TOKEN.z, 1)
})

// AC: camara-libre-sin-ficha/AC-5 — al montar arranca encuadrando MI ficha una
// sola vez; después queda libre (ningún movimiento la re-encuadra).
test('AC: camara-libre-sin-ficha/AC-5 - pose inicial en mi ficha, una sola vez', () => {
  const cam = newRig(MY_TOKEN)
  const first = cam.tick(0, FOCUS, ASPECT, '1x', false)
  expect(first.pose.target.x).toBeCloseTo(MY_TOKEN.x, 1)
  expect(first.pose.target.z).toBeCloseTo(MY_TOKEN.z, 1)
  const res = settle(cam, MOVED, 120, 2000)
  expect(res.pose.target.x).toBeCloseTo(MY_TOKEN.x, 1)
  expect(res.pose.target.z).toBeCloseTo(MY_TOKEN.z, 1)
})

// AC: camara-libre-sin-ficha/AC-6 — el zoom del popup de combate (T-075/AC-4)
// se mantiene sin cambios: battleCameraCue igual que antes.
test('AC: camara-libre-sin-ficha/AC-6 - battleCameraCue intacto (popup de combate)', () => {
  expect(battleCameraCue('overview', true, false)).toEqual({ type: 'ROLL' })
  expect(battleCameraCue('free', true, false)).toEqual({ type: 'ROLL' })
  expect(battleCameraCue('explore', true, false)).toEqual({ type: 'ROLL' })
  expect(battleCameraCue('follow', true, false)).toBeNull()
  expect(battleCameraCue('transitionIn', true, false)).toBeNull()
  expect(battleCameraCue('follow', false, true)).toEqual({ type: 'TURN_END' })
  expect(battleCameraCue('fork', false, true)).toEqual({ type: 'TURN_END' })
  expect(battleCameraCue('follow', false, false)).toBeNull()
  expect(battleCameraCue('overview', false, true)).toBeNull()
})

// AC: camara-libre-sin-ficha/AC-7 — camera.json + esquema sin claves rotas:
// buttons/keys centerOnMe, targetFollowsToken false, texto en es.ts, validate.
test('AC: camara-libre-sin-ficha/AC-7 - camera.json/esquema/es.ts renombrados y válidos', () => {
  expect(UiCameraSchema.safeParse(cameraPresets).success).toBe(true)
  expect(crossCheckCamera(cameraPresets)).toEqual([])
  expect(cameraPresets.explore.targetFollowsToken).toBe(false)
  expect(cameraPresets.buttons.centerOnMe).toBe('explore')
  expect(cameraPresets.keys.centerOnMe).toBe('C')
  expect(es.board3dCenterOnMe).toBe('Centrar en mí')
  expect('board3dRecenter' in es).toBe(false)
})

// AC: camara-libre-sin-ficha/AC-8 — follow/fork/transitionIn reservados a los
// cues de combate; CHOOSE_PATH/TURN_END desde explore son no-ops sin errores.
test('AC: camara-libre-sin-ficha/AC-8 - CHOOSE_PATH/TURN_END no-ops desde explore; modos de combate reservados', () => {
  expect(nextMode('explore', { type: 'CHOOSE_PATH' })).toBeNull()
  expect(nextMode('explore', { type: 'TURN_END' })).toBeNull()
  expect(nextMode('follow', { type: 'CENTER_ON_ME', x: 0, z: 0 })).toBeNull()
  expect(nextMode('fork', { type: 'CENTER_ON_ME', x: 0, z: 0 })).toBeNull()
  expect(nextMode('transitionIn', { type: 'CENTER_ON_ME', x: 0, z: 0 })).toBeNull()

  const cam = newRig()
  expect(cam.dispatch({ type: 'CHOOSE_PATH' }, 0)).toBe(false)
  expect(cam.dispatch({ type: 'TURN_END' }, 0)).toBe(false)
  expect(cam.mode).toBe('explore')
  // Los cues de combate siguen llegando a follow (AC-6).
  expect(cam.dispatch({ type: 'ROLL' }, 0)).toBe(true)
  expect(cam.mode).toBe('transitionIn')
  expect(nextMode('transitionIn', { type: 'ROLL' })).toBeNull()
})
