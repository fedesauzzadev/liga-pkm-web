// Contornos cartoon (SPEC-J/T-080/AC-4): casquete invertido (BackSide) por
// pieza de landmark — SOLO los kinds de lighting.outlines.onlyKinds y con
// tope maxMeshes. Three puro (NO-VISION); los valores vienen de
// content/board/style.json (lighting.outlines).
import type { BoardStyle } from '@liga/content'
import * as THREE from 'three'

/**
 * AC-4: grupo con un contorno por pieza elegible (copia de la geometría de la
 * malla mergeada, material BackSide del color del style, escala 1+thickness).
 */
export function buildOutlines(landmarks: THREE.Group, style: BoardStyle): THREE.Group {
  const root = new THREE.Group()
  root.name = 'outlines'
  const { enabled, color, thickness, maxMeshes, onlyKinds } = style.lighting.outlines
  if (!enabled) return root

  const kinds = new Set<string>(onlyKinds)
  const material = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide })
  let count = 0
  for (const group of landmarks.children) {
    if (count >= maxMeshes) break
    if (typeof group.userData.kind !== 'string' || !kinds.has(group.userData.kind)) continue
    const mesh = group.children.find((child): child is THREE.Mesh => child instanceof THREE.Mesh)
    if (mesh === undefined) continue
    const outline = new THREE.Mesh(mesh.geometry, material)
    outline.name = `outline:${group.name}`
    outline.position.copy(group.position)
    outline.rotation.copy(group.rotation)
    outline.scale.setScalar(group.scale.x * (1 + thickness))
    root.add(outline)
    count += 1
  }
  return root
}
