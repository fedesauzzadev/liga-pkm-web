// Tests T-093 (SPEC-N/T-093/AC-1): pose pura de la cámara de captura
// (window.__debug.aimCamera). Es la ÚNICA vía a la vista cenital de la captura
// de orientación: los presets del juego clampean la picada (pitchClampDeg) por
// diseño, así que la pose de captura no clampa nada (solo revisión, DEV).
import { expect, test } from 'vitest'
import * as THREE from 'three'
import { aimCameraPose, type DebugAim } from './camera'

const closeTo = (actual: number, expected: number, tolerance = 1e-9): void => {
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance)
}

// AC: SPEC-N/T-093/AC-1 - cenital exacta sobre el objetivo (pitch 90°).
test('AC-1 - aimCameraPose cenital: cámara sobre el objetivo mirando abajo', () => {
  const aim: DebugAim = { x: 1, z: -2, azimuthDeg: 0, elevationDeg: 90, distance: 10 }
  const pose = aimCameraPose(aim)
  closeTo(pose.position.x, 1)
  closeTo(pose.position.z, -2)
  closeTo(pose.position.y, 10)
  closeTo(pose.target.x, 1)
  closeTo(pose.target.z, -2)
  closeTo(pose.target.y, 0)
})

// AC: SPEC-N/T-093/AC-1 - esférica estándar (misma convención que explorePose:
// azimut 0 = cámara al sur mirando al norte), para las capturas de zona.
test('AC-1 - aimCameraPose respeta azimut/elevación/distancia', () => {
  const aim: DebugAim = { x: 0, z: 0, azimuthDeg: 0, elevationDeg: 38, distance: 7.5 }
  const pose = aimCameraPose(aim)
  closeTo(pose.position.x, 0, 1e-6)
  closeTo(pose.position.z, 7.5 * Math.cos((38 * Math.PI) / 180), 1e-6)
  closeTo(pose.position.y, 7.5 * Math.sin((38 * Math.PI) / 180), 1e-6)
  expect(pose.fov).toBeGreaterThan(0)
})

// AC: SPEC-N/T-093/AC-1 - altura mínima: una vista casi horizontal no baja del
// piso (follow.minHeight), igual que explorePose.
test('AC-1 - aimCameraPose nunca baja de la altura mínima', () => {
  const low: DebugAim = { x: 0, z: 0, azimuthDeg: 90, elevationDeg: 0, distance: 1 }
  expect(aimCameraPose(low).position.y).toBeGreaterThan(0)
})

// AC: SPEC-N/T-093/AC-1 - la pose es pura (vectores nuevos, sin mutar el aim).
test('AC-1 - aimCameraPose devuelve vectores nuevos', () => {
  const aim: DebugAim = { x: 0.5, z: 0.5, azimuthDeg: 45, elevationDeg: 60, distance: 5 }
  const a = aimCameraPose(aim)
  const b = aimCameraPose(aim)
  expect(a.position).not.toBe(b.position)
  expect(a.position.equals(b.position as THREE.Vector3)).toBe(true)
})
