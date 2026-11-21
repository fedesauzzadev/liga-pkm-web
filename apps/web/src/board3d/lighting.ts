// Luz y materiales cartoon (SPEC-J/T-080): hemisférica + direccional cálida
// con sombras que siguen a la ficha (AC-2), mapeo de toneMapping del style y
// sombras de contacto suaves bajo edificios y árboles (una sola malla
// instanciada). Three puro (NO-VISION); los números vienen de
// content/board/style.json (lighting).
import type { BoardStyle } from '@liga/content'
import * as THREE from 'three'

export interface LightRig {
  readonly hemi: THREE.HemisphereLight
  readonly sun: THREE.DirectionalLight
  /** Objetivo del sol (suele ser la ficha activa); agregarlo a la escena. */
  readonly target: THREE.Object3D
}

/** Kinds con sombra de contacto: edificios y árboles (AC-2). */
const CONTACT_KINDS: ReadonlySet<string> = new Set([
  'house', 'pokecenter', 'market', 'lab', 'gym', 'tree', 'deadTree',
])

/** AC-2: hemi cielo/suelo + sol cálida con sombra (cámara ±radius del target). */
export function buildLights(style: BoardStyle): LightRig {
  const hemi = new THREE.HemisphereLight(
    style.lighting.hemisphere.sky,
    style.lighting.hemisphere.ground,
    style.lighting.hemisphere.intensity,
  )
  hemi.name = 'hemi'
  hemi.castShadow = false

  const { directional } = style.lighting
  const sun = new THREE.DirectionalLight(directional.color, directional.intensity)
  sun.name = 'sun'
  sun.castShadow = true
  sun.shadow.mapSize.set(directional.shadowMapSize, directional.shadowMapSize)
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.02
  const radius = directional.shadowRadiusAroundTarget
  const camera = sun.shadow.camera
  camera.left = -radius
  camera.right = radius
  camera.top = radius
  camera.bottom = -radius
  camera.near = 0.5
  camera.far = new THREE.Vector3(...directional.from).length() + 2 * radius
  camera.updateProjectionMatrix()

  const target = new THREE.Object3D()
  target.name = 'sunTarget'
  sun.target = target
  return { hemi, sun, target }
}

/** AC-2: la sombra sigue a la ficha — target=(x,0,z) y sol en target+from. */
export function sceneSunTo(rig: Pick<LightRig, 'sun'>, x: number, z: number, from: readonly [number, number, number]): void {
  rig.sun.target.position.set(x, 0, z)
  rig.sun.position.set(x + from[0], from[1], z + from[2])
  rig.sun.target.updateMatrixWorld()
}

/** style.json → THREE.ToneMapping (AC-2: toneMapping ACESFilmic). */
export function toneMappingOf(name: BoardStyle['lighting']['toneMapping']): THREE.ToneMapping {
  switch (name) {
    case 'Linear': return THREE.LinearToneMapping
    case 'Reinhard': return THREE.ReinhardToneMapping
    case 'Cineon': return THREE.CineonToneMapping
    case 'Neutral': return THREE.NeutralToneMapping
    case 'ACESFilmic': return THREE.ACESFilmicToneMapping
  }
}

/** Textura radial suave (blanco→transparente) para blobs de contacto. */
export function softBlobTexture(px = 64): THREE.DataTexture {
  const data = new Uint8Array(px * px * 4)
  const half = (px - 1) / 2
  for (let y = 0; y < px; y += 1) {
    for (let x = 0; x < px; x += 1) {
      // alphaMap lee el canal verde; el borde (r ≥ half) queda en 0.
      const dist = Math.hypot(x - half, y - half) / half
      const value = Math.round(255 * Math.min(1, Math.max(0, 1 - dist)))
      const offset = (y * px + x) * 4
      data[offset] = 0
      data[offset + 1] = value
      data[offset + 2] = 0
      data[offset + 3] = 255
    }
  }
  const texture = new THREE.DataTexture(data, px, px, THREE.RGBAFormat)
  texture.needsUpdate = true
  return texture
}

/**
 * AC-2: sombras de contacto suaves bajo edificios y árboles — UNA malla
 * instanciada de blobs (radio/opacity de style) apoyada en el terreno.
 */
export function buildContactShadows(landmarks: THREE.Group, style: BoardStyle): THREE.InstancedMesh {
  const { radius, opacity } = style.lighting.contactShadows
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    alphaMap: softBlobTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
  })
  const spots: THREE.Matrix4[] = []
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
  for (const group of landmarks.children) {
    if (typeof group.userData.kind !== 'string' || !CONTACT_KINDS.has(group.userData.kind)) continue
    const scale = radius * (typeof group.scale?.x === 'number' ? group.scale.x : 1)
    spots.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(group.position.x, 0.02, group.position.z),
        quaternion,
        new THREE.Vector3(scale, scale, scale),
      ),
    )
  }
  const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), material, Math.max(spots.length, 1))
  mesh.name = 'contactShadows'
  spots.forEach((matrix, index) => mesh.setMatrixAt(index, matrix))
  mesh.count = spots.length
  mesh.instanceMatrix.needsUpdate = true
  mesh.userData = { kind: 'contactShadows' }
  return mesh
}
