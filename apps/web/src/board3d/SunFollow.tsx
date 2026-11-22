// Sombras de la escena (SPEC-J/T-080/AC-2 + N-0010/N-0013): el sol queda fijo
// sobre el centro del tablero (su cámara de sombra cubre TODO el tablero) y
// esta capa R3F fina marca quién proyecta y quién recibe. Los modelos llegan
// async: se re-marca cuando cambia la cantidad de hijos. N-0013: el mapa de
// sombras NO se recalcula en cada frame (los edificios suman ~540k triángulos
// de sombra): solo cuando llega un modelo o se mueve una ficha.
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type * as THREE from 'three'
import { applyShadowFlags, shadowSignature } from './lighting'
import type { BoardScene } from './scene'

export interface SunFollowProps {
  readonly scene: BoardScene
  readonly tokensGroup: THREE.Group
  readonly activeTokenId: string | null
}

export function SunFollow(props: SunFollowProps): null {
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)
  const { scene, tokensGroup } = props
  const structure = useRef('')
  const moving = useRef('')

  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    return () => {
      gl.shadowMap.autoUpdate = true
    }
  }, [gl])

  useFrame(() => {
    const next = shadowSignature([scene.landmarks, scene.scatter, tokensGroup], tokensGroup)
    if (next.structure !== structure.current) {
      applyShadowFlags(scene.root)
      applyShadowFlags(tokensGroup)
    }
    if (next.structure !== structure.current || next.moving !== moving.current) {
      gl.shadowMap.needsUpdate = true
      // Un frame más: la sombra converge aunque este callback corra antes que el de las fichas.
      invalidate()
    }
    structure.current = next.structure
    moving.current = next.moving
  })
  return null
}
