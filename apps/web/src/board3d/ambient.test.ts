// AC: SPEC-H/T-069/AC-5 + T-067/AC-4 — animaciones ambientales: idle de la
// ficha ±0,03 en 1,6 s, vaivén del agua, deriva de nubes con wrap, pulso del
// aro del pending y gating (reducedMotion / perfil bajo / pestaña oculta),
// numérico (NO-VISION).
import { expect, test } from 'vitest'
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'
import { applyIdle, applyRingPulse, ambientEnabled, idleBob, restTokens, ringPulseScale, stepClouds, waterBob } from './ambient'

test('AC: SPEC-H/T-069/AC-5 - idle de la ficha ±0,03 con período 1,6 s', () => {
  const { amplitude, periodMs } = BOARD3D.world.idle
  expect(amplitude).toBeCloseTo(0.03, 12)
  expect(periodMs).toBe(1600)
  expect(idleBob(0)).toBeCloseTo(0, 12)
  expect(idleBob(400)).toBeCloseTo(0.03, 12)
  expect(idleBob(800)).toBeCloseTo(0, 12)
  expect(idleBob(1200)).toBeCloseTo(-0.03, 12)
  expect(idleBob(1600)).toBeCloseTo(0, 12)
  for (let t = 0; t < 1600; t += 25) {
    expect(Math.abs(idleBob(t))).toBeLessThanOrEqual(0.03 + 1e-9)
  }
})

test('AC: SPEC-H/T-069/AC-5 - vaivén del agua acotado al bob del tema', () => {
  const { bob, periodMs } = BOARD3D.world.water
  expect(waterBob(periodMs / 4)).toBeCloseTo(bob, 12)
  expect(waterBob(periodMs * 3 / 4)).toBeCloseTo(-bob, 12)
  for (let t = 0; t < periodMs; t += 40) {
    expect(Math.abs(waterBob(t))).toBeLessThanOrEqual(bob + 1e-9)
  }
})

test('AC: SPEC-H/T-069/AC-5 - deriva de nubes con velocidad propia y wrap en ±halfSpan', () => {
  const group = new THREE.Group()
  const cloud = new THREE.Group()
  cloud.userData.speedMul = 2
  group.add(cloud)
  cloud.position.x = 0
  stepClouds(group, 1, 0.5, 20)
  expect(cloud.position.x).toBeCloseTo(1, 12)
  stepClouds(group, 10, 0.5, 20)
  expect(cloud.position.x).toBeCloseTo(11, 12)
  cloud.position.x = 20.5
  stepClouds(group, 1, 0.5, 20)
  expect(cloud.position.x).toBeCloseTo(-20, 12)
})

test('AC: SPEC-H/T-069/AC-5 - el idle se aplica solo a fichas en reposo', () => {
  const group = new THREE.Group()
  const token = new THREE.Group()
  token.userData = { kind: 'token' }
  const moving = new THREE.Group()
  moving.userData = { kind: 'token', moving: true }
  const notToken = new THREE.Group()
  group.add(token, moving, notToken)
  moving.position.y = 5
  notToken.position.y = 5
  token.position.y = BOARD3D.token.lift

  applyIdle(group, 400)
  expect(token.position.y).toBeCloseTo(BOARD3D.token.lift + 0.03, 12)
  expect(moving.position.y).toBe(5)
  expect(notToken.position.y).toBe(5)

  restTokens(group)
  expect(token.position.y).toBeCloseTo(BOARD3D.token.lift, 12)
  expect(moving.position.y).toBe(5)
})

test('AC: SPEC-H/T-069/AC-5 - apagadas con reducedMotion (Ajustes), perfil bajo o pestaña oculta', () => {
  expect(ambientEnabled(false, false, true)).toBe(true)
  expect(ambientEnabled(true, false, true)).toBe(false)
  expect(ambientEnabled(false, true, true)).toBe(false)
  expect(ambientEnabled(false, false, false)).toBe(false)
})

test('AC: SPEC-H/T-067/AC-4 - aro pulsante 1→1,15 con período 900 ms; solo los visibles; reposo en escala 1', () => {
  const { pulseScaleTo, pulsePeriodMs } = BOARD3D.ring
  expect(pulseScaleTo).toBeCloseTo(1.15, 12)
  expect(pulsePeriodMs).toBe(900)
  expect(ringPulseScale(0)).toBeCloseTo(1, 12)
  expect(ringPulseScale(450)).toBeCloseTo(1.15, 12)
  expect(ringPulseScale(900)).toBeCloseTo(1, 12)
  for (let t = 0; t < 900; t += 15) {
    const scale = ringPulseScale(t)
    expect(scale).toBeGreaterThanOrEqual(1 - 1e-9)
    expect(scale).toBeLessThanOrEqual(1.15 + 1e-9)
  }

  const makeNode = (ringVisible: boolean): THREE.Group => {
    const pivot = new THREE.Group()
    const ring = new THREE.Mesh()
    ring.name = 'ring'
    ring.visible = ringVisible
    pivot.add(ring)
    return pivot
  }
  const nodes = new Map<string, THREE.Group>([
    ['ofrecido', makeNode(true)],
    ['apagado', makeNode(false)],
  ])
  applyRingPulse(nodes, 450)
  expect(nodes.get('ofrecido')?.children[0]?.scale.x).toBeCloseTo(1.15, 12)
  expect(nodes.get('apagado')?.children[0]?.scale.x).toBeCloseTo(1, 12)

  // El bucle apagado (reducedMotion/perfil bajo/pestaña oculta) lo deja en reposo.
  applyRingPulse(nodes, 0)
  expect(nodes.get('ofrecido')?.children[0]?.scale.x).toBeCloseTo(1, 12)
})
