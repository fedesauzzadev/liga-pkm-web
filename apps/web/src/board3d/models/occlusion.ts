// occlusion (N-0002): los edificios/landmarks que quedan entre la cámara y la
// ficha activa se vuelven translúcidos. Three puro (testeable en node): rayo
// cámara→ficha contra el bounding box de cada pieza visible de `landmarks`.
import * as THREE from 'three'
import { MODEL_OCCLUSION } from '../../theme/models'

const ray = new THREE.Ray()
const grown = new THREE.Box3()
const hit = new THREE.Vector3()

/** AC-2: ¿el segmento from→to cruza la caja? `margin` engorda la caja (ancho
 *  de la ficha) y acorta el segmento del lado de la ficha, así lo que está
 *  pegado DETRÁS de la ficha no cuenta como tapa. */
export function segmentHitsBox(
  from: THREE.Vector3,
  to: THREE.Vector3,
  box: THREE.Box3,
  margin = 0,
): boolean {
  const length = from.distanceTo(to) - margin
  if (length <= 0) return false
  ray.origin.copy(from)
  ray.direction.subVectors(to, from).normalize()
  grown.copy(box).expandByScalar(margin)
  if (grown.containsPoint(from)) return true
  const point = ray.intersectBox(grown, hit)
  return point !== null && from.distanceTo(point) <= length
}

/** Punto a despejar: centro de la ficha con indicador de turno visible. */
export function activeTokenTarget(tokens: THREE.Object3D): THREE.Vector3 | null {
  for (const token of tokens.children) {
    if (token.userData.kind !== 'token') continue
    if (token.children.some((child) => child.name === 'active' && child.visible)) {
      return token.position.clone().setY(token.position.y + MODEL_OCCLUSION.tokenLift)
    }
  }
  return null
}

// Las piezas son estáticas: caja en mundo una vez por grupo. El clon
// translúcido se comparte por material original (los templates lo comparten).
const boxes = new WeakMap<THREE.Object3D, THREE.Box3>()
const fadedOf = new WeakMap<THREE.Material, THREE.Material>()

function fadedMaterial(material: THREE.Material): THREE.Material {
  let faded = fadedOf.get(material)
  if (faded === undefined) {
    faded = material.clone()
    faded.transparent = true
    faded.opacity = MODEL_OCCLUSION.opacity
    // El recorte (alphaTest 0,5 de HGSS) descartaría TODO el modelo a 0,3.
    faded.alphaTest = material.alphaTest * MODEL_OCCLUSION.opacity
    fadedOf.set(material, faded)
  }
  return faded
}

function setFaded(group: THREE.Object3D, outlines: THREE.Object3D, fade: boolean): void {
  if ((group.userData.occluded === true) === fade) return
  group.userData.occluded = fade
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const mesh = child as THREE.Mesh
    if (fade) {
      mesh.userData.solidMaterial = mesh.material
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(fadedMaterial)
        : fadedMaterial(mesh.material)
    } else {
      mesh.material = mesh.userData.solidMaterial as THREE.Material | THREE.Material[]
    }
  })
  // El contorno BackSide se vería a través del edificio translúcido.
  const outline = outlines.children.find((child) => child.name === `outline:${group.name}`)
  if (outline !== undefined) outline.visible = !fade
}

/** AC-1: translúcido lo que cruza cámara→ficha, opaco el resto (también con
 *  `target` null). Devuelve cuántas piezas quedaron translúcidas. */
export function applyOcclusion(
  landmarks: THREE.Object3D,
  outlines: THREE.Object3D,
  camera: THREE.Vector3,
  target: THREE.Vector3 | null,
): number {
  let count = 0
  for (const group of landmarks.children) {
    let fade = false
    if (target !== null && group.visible) {
      let box = boxes.get(group)
      if (box === undefined) {
        box = new THREE.Box3().setFromObject(group)
        boxes.set(group, box)
      }
      fade = segmentHitsBox(camera, target, box, MODEL_OCCLUSION.margin)
    }
    setFaded(group, outlines, fade)
    if (fade) count += 1
  }
  return count
}
