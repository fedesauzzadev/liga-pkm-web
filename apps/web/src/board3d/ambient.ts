// Animaciones ambientales del mundo continuo (SPEC-H/T-069/AC-5): three puro,
// sin timers ni DOM, para verificar numéricamente (NO-VISION). El bucle que las
// aplica a ≤ 30 fps (setTimeout + invalidate, solo con la pestaña visible)
// vive en Ambient.tsx; los números, en theme/board3d.ts §world.
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'

/** Idle de la ficha: ±0,03 con período 1,6 s (AC-5). */
export const idleBob = (tMs: number): number =>
  BOARD3D.world.idle.amplitude * Math.sin((2 * Math.PI * tMs) / BOARD3D.world.idle.periodMs)

/** Vaivén del agua del lago (AC-5). */
export const waterBob = (tMs: number): number =>
  BOARD3D.world.water.bob * Math.sin((2 * Math.PI * tMs) / BOARD3D.world.water.periodMs)

/**
 * N-0016: mece cada espejo de agua con fase propia y un brillo lento del color
 * (uniform, sin recompilar ni tocar la geometría). `tMs` 0 = reposo.
 */
export function applyWaters(waters: readonly THREE.Mesh[], tMs: number): void {
  const { shimmer, shimmerPeriodMs } = BOARD3D.world.water
  waters.forEach((mesh, index) => {
    const material = mesh.material as THREE.MeshStandardMaterial
    const base = (mesh.userData.baseY ??= mesh.position.y) as number
    const baseColor = (mesh.userData.baseColor ??= material.color.clone()) as THREE.Color
    const phase = index * 1.7
    mesh.position.y = base + (tMs === 0 ? 0 : waterBob(tMs + phase * 500))
    const k = tMs === 0 ? 0 : shimmer * (0.5 + 0.5 * Math.sin((2 * Math.PI * tMs) / shimmerPeriodMs + phase))
    material.color.copy(baseColor).lerp(SHIMMER_TINT, k)
  })
}
const SHIMMER_TINT = new THREE.Color('#FFFFFF')

/** Deriva de nubes con wrap en ±halfSpan (AC-4/AC-5); cada una a su ritmo. */
export function stepClouds(clouds: THREE.Group, dtSec: number, speed: number, halfSpan: number): void {
  for (const cloud of clouds.children) {
    const mul = typeof cloud.userData.speedMul === 'number' ? cloud.userData.speedMul : 1
    cloud.position.x += speed * mul * dtSec
    if (cloud.position.x > halfSpan) cloud.position.x = -halfSpan
  }
}

/** Aplica el idle a las fichas en reposo (las que se mueven no se tocan). */
export function applyIdle(tokensGroup: THREE.Group, tMs: number): void {
  const bob = idleBob(tMs)
  for (const token of tokensGroup.children) {
    if (token.userData.kind !== 'token' || token.userData.moving === true) continue
    token.position.y = BOARD3D.token.lift + bob
  }
}

/** Deja cada ficha en reposo en su nivel base (fin de las animaciones). */
export function restTokens(tokensGroup: THREE.Group): void {
  for (const token of tokensGroup.children) {
    if (token.userData.kind !== 'token' || token.userData.moving === true) continue
    token.position.y = BOARD3D.token.lift
  }
}

/** AC-4 (SPEC-H/T-067): escala del aro pulsante 1→1,15 con período 900 ms. */
export const ringPulseScale = (tMs: number): number => {
  const { pulseScaleTo, pulsePeriodMs } = BOARD3D.ring
  return 1 + ((pulseScaleTo - 1) * (1 - Math.cos((2 * Math.PI * tMs) / pulsePeriodMs))) / 2
}

/** Pulsa los aros visibles (los del pending); tMs=0 los deja en reposo. */
export function applyRingPulse(nodes: ReadonlyMap<string, THREE.Group>, tMs: number): void {
  const scale = ringPulseScale(tMs)
  for (const pivot of nodes.values()) {
    const ring = pivot.children.find((child) => child.name === 'ring')
    if (ring === undefined) continue
    ring.scale.setScalar(ring.visible ? scale : 1)
  }
}

/** AC-5: apagadas con reducedMotion (Ajustes), perfil bajo o pestaña oculta. */
export const ambientEnabled = (
  reducedMotion: boolean,
  lowProfile: boolean,
  visible: boolean,
): boolean => !reducedMotion && !lowProfile && visible
