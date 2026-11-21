// Seguimiento del sol (SPEC-J/T-080/AC-2): capa R3F fina que apunta la luz
// direccional (y su sombra) a la ficha activa. Corre en cada frame invalidado
// (la cámara de T-076 invalida mientras la ficha se mueve) y al cambiar la
// ficha activa. La lógica pura vive en lighting.ts/scene.ts (sunFollow).
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect } from 'react'
import type * as THREE from 'three'
import { sunFollow, type BoardScene } from './scene'

export interface SunFollowProps {
  readonly scene: BoardScene
  readonly tokensGroup: THREE.Group
  readonly activeTokenId: string | null
}

export function SunFollow(props: SunFollowProps): null {
  const invalidate = useThree((state) => state.invalidate)
  const { scene, tokensGroup, activeTokenId } = props

  const apply = useCallback((): void => {
    const token = tokensGroup.children.find(
      (child) => child.userData.kind === 'token' && child.userData.tokenId === activeTokenId,
    )
    if (token === undefined) return
    sunFollow(scene, token.position.x, token.position.z)
  }, [scene, tokensGroup, activeTokenId])

  useEffect(() => {
    apply()
    invalidate()
  }, [apply, invalidate])

  useFrame(apply)
  return null
}
