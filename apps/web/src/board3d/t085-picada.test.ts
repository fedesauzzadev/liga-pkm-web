// AC: SPEC-M/T-085/AC-1..AC-4 — cámara: ángulo de picada REAL. Picada
// (pitchDeg) = ángulo entre la dirección de mirada y el plano horizontal
// (0° = horizontal, 90° = cenital); con OrbitControls polar = 90° − picada.
// Verificado numéricamente con poses y proyecciones (NO-VISION), sin render.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { crossCheckCamera, UiCameraSchema } from '@liga/content'
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'
import { cameraDumpOf } from './dump'
import { cameraPresets, planExploreControls, planOverview } from './camera'
import {
  clampExploreState,
  exploreDragStep,
  explorePose,
  exploreWheelStep,
  initialExploreState,
} from './explore'
import { followPose, ImmersiveCamera, overviewPose, type CameraPose } from './rig'

const halfW = BOARD3D.base.width / 2
const halfD = BOARD3D.base.depth / 2
const ASPECT = 1440 / 900
const deg = Math.PI / 180
const degOf = (rad: number): number => (rad * 180) / Math.PI

const FOCUS = { tokenX: 0, tokenZ: 0, nextX: 1, nextZ: 0 } as const

/** Picada real de una pose: asin(−forward.y), forward = mirada normalizada. */
const pitchDegOf = (pose: CameraPose): number => {
  const forward = pose.target.clone().sub(pose.position).normalize()
  return Math.asin(-forward.y) / deg
}

const poseCamera = (pose: CameraPose): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera(pose.fov, ASPECT, 0.1, 200)
  camera.position.copy(pose.position)
  camera.up.set(0, 1, 0)
  camera.lookAt(pose.target)
  camera.updateMatrixWorld(true)
  return camera
}

// AC: SPEC-M/AC-1 — explore 38° (rango 20°–60°), overview 50° (35°–65°),
// follow 28°, fork 38°; ningún modo supera 70° (clamp duro, también al
// arrastre o con la rueda).
test('AC: SPEC-M/AC-1 - picadas por modo (explore 38, overview 50, follow 28, fork 38) y clamp duro 70°', () => {
  expect(cameraPresets.explore.elevationDeg).toBeGreaterThanOrEqual(35)
  expect(cameraPresets.explore.elevationDeg).toBeLessThanOrEqual(41)
  expect(cameraPresets.overview.elevationDeg).toBe(50)
  expect(cameraPresets.follow.elevationDeg).toBe(28)
  expect(cameraPresets.fork.elevationDeg).toBe(38)

  const [exploreMin, exploreMax] = cameraPresets.explore.pitchDegRange
  expect(exploreMin).toBe(20)
  expect(exploreMax).toBe(60)
  const [overviewMin, overviewMax] = cameraPresets.overview.pitchDegRange
  expect(overviewMin).toBe(35)
  expect(overviewMax).toBe(65)

  const hard = cameraPresets.pitchClampDeg
  expect(hard).toBe(70)
  const maxima = [
    cameraPresets.explore.elevationDeg,
    cameraPresets.overview.elevationDeg,
    cameraPresets.follow.elevationDeg,
    cameraPresets.fork.elevationDeg,
    exploreMax,
    overviewMax,
  ]
  for (const max of maxima) expect(max).toBeLessThanOrEqual(hard)

  // Clamp duro al arrastrar: un drag gigante queda en el tope del rango (≤ 70).
  const dragged = exploreDragStep({ ...initialExploreState(), elevationDeg: 59 }, 0, 10000)
  expect(dragged.elevationDeg).toBe(Math.min(exploreMax, hard))
  const clamped = clampExploreState({
    azimuthDeg: 0,
    elevationDeg: 89,
    distance: cameraPresets.explore.distance,
    offsetX: 0,
    offsetZ: 0,
  })
  expect(clamped.elevationDeg).toBe(Math.min(exploreMax, hard))
  // La rueda hace zoom, no toca la picada.
  const wheeled = exploreWheelStep({ ...initialExploreState(), elevationDeg: 60 }, -1000)
  expect(wheeled.elevationDeg).toBe(60)

  // OrbitControls: el polar mínimo garantiza picada ≤ 70° en explore y overview.
  expect(degOf(planExploreControls().minPolar)).toBeGreaterThanOrEqual(90 - hard - 1e-9)
  expect(degOf(planOverview(halfW, halfD, ASPECT).controls.minPolar)).toBeGreaterThanOrEqual(
    90 - hard - 1e-9,
  )
})

// AC: SPEC-M/AC-2 — camera.json documenta que elevationDeg = picada y expone
// pitchDegRange explícito; se elimina polarDegRange (la conversión es
// polar = 90° − picada, aplicada en los planes de controles).
test('AC: SPEC-M/AC-2 - camera.json usa pitchDegRange (elevationDeg = picada), sin polarDegRange', () => {
  const raw = readFileSync(new URL('../../../../content/ui/camera.json', import.meta.url), 'utf8')
  expect(raw).toContain('picada')
  const parsed = JSON.parse(raw) as {
    readonly overview: Record<string, unknown>
    readonly explore: Record<string, unknown>
  }
  expect(Array.isArray(parsed.overview.pitchDegRange)).toBe(true)
  expect(Array.isArray(parsed.explore.pitchDegRange)).toBe(true)
  expect('polarDegRange' in parsed.overview).toBe(false)
  expect('polarDegRange' in parsed.explore).toBe(false)

  expect(UiCameraSchema.safeParse(cameraPresets).success).toBe(true)
  expect(crossCheckCamera(cameraPresets)).toEqual([])

  // Fórmula de conversión en ambos planes de OrbitControls.
  const [exploreMin, exploreMax] = cameraPresets.explore.pitchDegRange
  const exploreControls = planExploreControls()
  expect(degOf(exploreControls.minPolar)).toBeCloseTo(90 - exploreMax, 6)
  expect(degOf(exploreControls.maxPolar)).toBeCloseTo(90 - exploreMin, 6)
  const [overviewMin, overviewMax] = cameraPresets.overview.pitchDegRange
  const overviewControls = planOverview(halfW, halfD, ASPECT).controls
  expect(degOf(overviewControls.minPolar)).toBeCloseTo(90 - overviewMax, 6)
  expect(degOf(overviewControls.maxPolar)).toBeCloseTo(90 - overviewMin, 6)
})

// AC: SPEC-M/AC-3 — "Centrar en mí" y "Vista general" aplican los ángulos de
// su modo (no conservan la picada anterior del usuario).
test('AC: SPEC-M/AC-3 - Centrar en mí y Vista general aplican los ángulos de su modo', () => {
  const cam = new ImmersiveCamera({ halfWidth: halfW, halfDepth: halfD })
  cam.tick(0, FOCUS, ASPECT, '1x', false)
  // El usuario inclina la órbita al máximo (drag hacia abajo) y aleja el zoom.
  cam.dispatch({ type: 'EXPLORE_DRAG', dxPx: -300, dyPx: 400 }, 0)
  cam.dispatch({ type: 'EXPLORE_WHEEL', deltaY: 120 }, 0)
  expect(cam.exploreState.elevationDeg).toBeGreaterThan(cameraPresets.explore.elevationDeg + 3)
  const zoomed = cam.exploreState.distance

  // Centrar en mí: picada y azimut del modo explore; el zoom se conserva.
  expect(cam.dispatch({ type: 'CENTER_ON_ME', x: 4, z: -2 }, 0)).toBe(true)
  expect(cam.exploreState.elevationDeg).toBeCloseTo(cameraPresets.explore.elevationDeg, 6)
  expect(cam.exploreState.azimuthDeg).toBeCloseTo(0, 6)
  // N-0001: el zoom vuelve a la distancia de encuadre.
  expect(zoomed).not.toBeCloseTo(BOARD3D.camera.centerOnMeDistance, 1)
  expect(cam.exploreState.distance).toBeCloseTo(BOARD3D.camera.centerOnMeDistance, 6)
  expect(cam.exploreState.offsetX).toBeCloseTo(4, 6)
  expect(cam.exploreState.offsetZ).toBeCloseTo(-2, 6)

  // Vista general: la pose resultante tiene la picada del overview.
  expect(cam.dispatch({ type: 'OVERVIEW' }, 1000)).toBe(true)
  const done = cam.tick(
    1000 + cameraPresets.transitions.followToOverviewMs,
    FOCUS,
    ASPECT,
    '1x',
    false,
  )
  expect(done.mode).toBe('overview')
  expect(pitchDegOf(done.pose)).toBeCloseTo(cameraPresets.overview.elevationDeg, 1)
})

// AC: SPEC-M/AC-4 — por modo: pitch = asin(−forward.y) dentro del rango y del
// valor por defecto; el sceneDump informa pitchDeg.
test('AC: SPEC-M/AC-4 - pitch = asin(−forward.y) por modo; sceneDump informa pitchDeg', () => {
  const cam = new ImmersiveCamera({ halfWidth: halfW, halfDepth: halfD })
  const panBounds = cam.panBounds

  // explore (estado inicial del rig).
  const explore = cam.tick(0, FOCUS, ASPECT, '1x', false).pose
  const explorePitch = pitchDegOf(explore)
  expect(explorePitch).toBeCloseTo(cameraPresets.explore.elevationDeg, 3)
  const [exploreMin, exploreMax] = cameraPresets.explore.pitchDegRange
  expect(explorePitch).toBeGreaterThanOrEqual(exploreMin)
  expect(explorePitch).toBeLessThanOrEqual(exploreMax)

  // overview.
  const overviewPitch = pitchDegOf(overviewPose(halfW, halfD, ASPECT))
  expect(overviewPitch).toBeCloseTo(cameraPresets.overview.elevationDeg, 3)
  const [overviewMin, overviewMax] = cameraPresets.overview.pitchDegRange
  expect(overviewPitch).toBeGreaterThanOrEqual(overviewMin)
  expect(overviewPitch).toBeLessThanOrEqual(overviewMax)

  // follow y fork: el modo se define sobre la FICHA (el target mira
  // lookAhead adelante ⇒ el forward real es un poco menos inclinado; el
  // ángulo del modo se mide sobre la ficha, como en el rig).
  const elevationOverToken = (pose: CameraPose): number => {
    const horizontal = Math.hypot(pose.position.x - FOCUS.tokenX, pose.position.z - FOCUS.tokenZ)
    return Math.atan2(pose.position.y - BOARD3D.token.lift, horizontal) / deg
  }
  const heading = new THREE.Vector2(0, -1)
  const follow = followPose('follow', FOCUS, heading, panBounds)
  expect(elevationOverToken(follow)).toBeCloseTo(cameraPresets.follow.elevationDeg, 3)
  expect(pitchDegOf(follow)).toBeLessThanOrEqual(cameraPresets.pitchClampDeg)
  expect(pitchDegOf(follow)).toBeGreaterThan(0)
  const fork = followPose('fork', FOCUS, heading, panBounds)
  expect(elevationOverToken(fork)).toBeCloseTo(cameraPresets.fork.elevationDeg, 3)
  expect(pitchDegOf(fork)).toBeLessThanOrEqual(cameraPresets.pitchClampDeg)
  expect(pitchDegOf(fork)).toBeGreaterThan(0)

  // La pose de explore no es casi cenital: la picada respeta su rango.
  const clampedExplore = explorePose(
    clampExploreState({ ...initialExploreState(), elevationDeg: 80 }),
    0,
    0,
    panBounds,
  )
  expect(pitchDegOf(clampedExplore)).toBeLessThanOrEqual(cameraPresets.pitchClampDeg)

  // sceneDump: pitchDeg = asin(−forward.y) de la cámara real.
  const dump = cameraDumpOf('explore', poseCamera(explore), explore.target)
  expect(dump.pitchDeg).toBeCloseTo(explorePitch, 3)
})
