// Sombras de la escena (SPEC-J/T-080/AC-2 + N-0010): el sol queda fijo sobre
// el centro del tablero (su cámara de sombra cubre TODO el tablero, no un
// radio alrededor de la ficha) y esta capa R3F fina marca quién proyecta y
// quién recibe. Los modelos llegan async: se re-marca cuando cambia la
// cantidad de hijos. La lógica pura vive en lighting.ts (applyShadowFlags).
import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import type * as THREE from 'three'
import { applyShadowFlags } from './lighting'
import type { BoardScene } from './scene'

export interface SunFollowProps {
  readonly scene: BoardScene
  readonly tokensGroup: THREE.Group
  readonly activeTokenId: string | null
}

const descendants = (group: THREE.Object3D): number =>
  group.children.reduce((sum, child) => sum + 1 + child.children.length, 0)

export function SunFollow(props: SunFollowProps): null {
  const invalidate = useThree((state) => state.invalidate)
  const { scene, tokensGroup } = props
  const signature = useRef(-1)

  useFrame(() => {
    const next = descendants(scene.landmarks) + descendants(scene.scatter) + descendants(tokensGroup)
    if (next === signature.current) return
    signature.current = next
    applyShadowFlags(scene.root)
    applyShadowFlags(tokensGroup)
    invalidate()
  })
  return null
}
