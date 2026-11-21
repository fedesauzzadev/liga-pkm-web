// Materiales toon (SPEC-J/T-080/AC-1): mapa de degradado de N escalones
// (DataTexture steps×1 con NearestFilter, sin DOM) compartido por edificios,
// árboles, rocas y fichas. Three puro (NO-VISION); los steps vienen de
// content/board/style.json (lighting.toon.steps).
import * as THREE from 'three'
import { boardStyle } from './style'

/** Mapa de degradado de `steps` escalones (toon): luma creciente 0→255. */
export function toonGradientMap(steps: number): THREE.DataTexture {
  const data = new Uint8Array(steps)
  for (let index = 0; index < steps; index += 1) {
    data[index] = Math.round((255 * (index + 1)) / steps)
  }
  const texture = new THREE.DataTexture(data, steps, 1, THREE.RedFormat)
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

/** MeshToonMaterial con el gradientMap de style.json (lighting.toon.steps). */
export function toonMaterial(
  params: THREE.MeshToonMaterialParameters = {},
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    gradientMap: toonGradientMap(boardStyle.lighting.toon.steps),
    ...params,
  })
}
