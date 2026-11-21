// Bucle ambiental (SPEC-H/T-069/AC-5): aplica las animaciones de ambient.ts
// cada 33 ms (30 fps máx) con invalidate (frameloop demand), solo con la
// pestaña visible y sin reducedMotion ni perfil bajo. Capa R3F fina.
import { useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import type * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'
import { applyIdle, applyRingPulse, ambientEnabled, restTokens, stepClouds, waterBob } from './ambient'
import type { WorldScene } from './world'
import { boardStyle } from './style'

export interface AmbientProps {
  readonly world: WorldScene
  readonly tokensGroup: THREE.Group
  /** Nodos del tablero: aros del pending pulsan con el bucle (T-067/AC-4). */
  readonly nodes: ReadonlyMap<string, THREE.Group>
  readonly reducedMotion: boolean
  readonly lowProfile: boolean
}

export function Ambient(props: AmbientProps): null {
  const invalidate = useThree((state) => state.invalidate)
  const [visible, setVisible] = useState<boolean>(
    typeof document === 'undefined' ? true : document.visibilityState === 'visible',
  )

  useEffect(() => {
    const onChange = (): void => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  const { world, tokensGroup, nodes, reducedMotion, lowProfile } = props
  const cloudSpeed = boardStyle.sky.clouds.speed
  useEffect(() => {
    // Perfil bajo (AC-6): sin nubes; reposo para fichas, agua y aros.
    world.clouds.visible = !lowProfile
    if (!ambientEnabled(reducedMotion, lowProfile, visible)) {
      restTokens(tokensGroup)
      applyRingPulse(nodes, 0)
      if (world.water !== null) {
        world.water.position.y =
          typeof world.water.userData.baseY === 'number' ? world.water.userData.baseY : world.water.position.y
      }
      invalidate()
      return
    }
    if (world.water !== null && typeof world.water.userData.baseY !== 'number') {
      world.water.userData.baseY = world.water.position.y
    }

    let running = true
    let timeout: ReturnType<typeof setTimeout> | null = null
    let last = performance.now()
    const tick = (): void => {
      if (!running) return
      const now = performance.now()
      const dtSec = Math.min(1, (now - last) / 1000)
      last = now
      stepClouds(world.clouds, dtSec, cloudSpeed, world.halfSpan)
      if (world.water !== null && typeof world.water.userData.baseY === 'number') {
        world.water.position.y = world.water.userData.baseY + waterBob(now)
      }
      applyIdle(tokensGroup, now)
      applyRingPulse(nodes, now)
      invalidate()
      timeout = setTimeout(tick, BOARD3D.world.tickMs)
    }
    tick()
    return () => {
      running = false
      if (timeout !== null) clearTimeout(timeout)
    }
  }, [world, tokensGroup, nodes, reducedMotion, lowProfile, visible, cloudSpeed, invalidate])

  return null
}
