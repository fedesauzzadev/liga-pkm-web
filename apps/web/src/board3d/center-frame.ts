// N-0004: encuadre de "Centrar en mí" / arranque. Con la ficha cerca de un
// borde, centrarla deja media pantalla de pasto fuera del tablero: el objetivo
// se corre hacia adentro (como mucho hasta `centerOnMeInset` del borde).
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'

const clampAbs = (value: number, limit: number): number =>
  Math.min(Math.max(limit, 0), Math.max(-Math.max(limit, 0), value))

export function centerFrameTarget(
  x: number,
  z: number,
  half: { readonly halfWidth: number; readonly halfDepth: number },
): THREE.Vector3 {
  const [insetX, insetZ] = BOARD3D.camera.centerOnMeInset
  return new THREE.Vector3(
    clampAbs(x, half.halfWidth - insetX),
    0,
    clampAbs(z, half.halfDepth - insetZ),
  )
}
