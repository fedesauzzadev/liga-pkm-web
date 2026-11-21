// Presupuestos de render (SPEC-H/T-068/AC-4/AC-5e): estimación pura sobre el
// grafo de escena — triángulos por geometría y draw calls por malla visible.
// El número real (con culling) lo informa sceneDump desde gl.info (T-069).
import * as THREE from 'three'

/** Draw calls estimados: 1 por malla visible (por material si es array). */
export function estimateDrawCalls(root: THREE.Object3D): number {
  let calls = 0
  root.traverseVisible((object) => {
    if (object instanceof THREE.Mesh) {
      calls += Array.isArray(object.material) ? object.material.length : 1
    }
  })
  return calls
}

/** Triángulos estimados: suma de índices/posiciones de cada malla visible. */
export function estimateTriangles(root: THREE.Object3D): number {
  let triangles = 0
  root.traverseVisible((object) => {
    if (object instanceof THREE.Mesh) {
      const geometry = object.geometry
      triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3
    }
  })
  return Math.round(triangles)
}
