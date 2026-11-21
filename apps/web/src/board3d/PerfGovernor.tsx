// Gobernador de rendimiento (SPEC-H/T-069/AC-6 + SPEC-I/T-076/AC-9 +
// SPEC-J/T-080/AC-2/AC-5): mide FPS con PerformanceMonitor (drei) y baja al
// perfil bajo cuando cae por debajo de perf.lowFpsThreshold durante
// perf.lowFpsSeconds (camera.json): sin nubes ni animaciones (Ambient se
// apaga), sin sombras ni contornos (T-080), dpr al mínimo y −50 % de relleno.
// También configura toneMapping/sombra del renderer según style.json.
// Queda registrado en el reporte de bug vía debug/session.recordPerf.
import { PerformanceMonitor } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { recordPerf } from '../debug/session'
import { cameraPresets } from './camera'
import { Ambient } from './AmbientLoop'
import { toneMappingOf } from './lighting'
import { initialPerfProfile, fillScaleFor, perfSample } from './perf-profile'
import { applySceneProfile, type BoardScene } from './scene'
import { boardStyle } from './style'
import { applyFillScale } from './scatter'
import type { WorldScene } from './world'

export interface PerfGovernorProps {
  readonly scene: BoardScene
  readonly world: WorldScene
  readonly tokensGroup: THREE.Group
  /** Nodos del tablero: aros del pending pulsan con el bucle (T-067/AC-4). */
  readonly nodes: ReadonlyMap<string, THREE.Group>
  /** Relleno de zonas: −50 % en perfil bajo (T-068 consume fillScaleFor). */
  readonly scatter: THREE.Group
  readonly reducedMotion: boolean
  /** T-076/AC-9: un paso de dpr hacia arriba (1) o hacia abajo (-1). */
  readonly onDprStep: (direction: 1 | -1) => void
  /** AC-6: al entrar en perfil bajo, dpr al mínimo de perf.dpr. */
  readonly onLowProfile: () => void
}

export function PerfGovernor(props: PerfGovernorProps): ReactNode {
  const [lowProfile, setLowProfile] = useState(false)
  const profileRef = useRef(initialPerfProfile)
  const { lowFpsThreshold, lowFpsSeconds } = cameraPresets.perf
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)

  const handleChange = useCallback(
    (api: { readonly fps: number }): void => {
      const now = performance.now()
      const next = perfSample(profileRef.current, api.fps, now, lowFpsThreshold, lowFpsSeconds)
      profileRef.current = next
      recordPerf({ lowProfile: next.low, fps: Math.round(api.fps) })
      if (next.low && !lowProfile) {
        setLowProfile(true)
        props.onLowProfile()
      }
    },
    [lowFpsThreshold, lowFpsSeconds, lowProfile, props],
  )

  const handleDecline = useCallback(() => props.onDprStep(-1), [props])
  const handleIncline = useCallback(() => props.onDprStep(1), [props])

  // T-080/AC-2: toneMapping + exposición del style, sombras PCF suaves.
  useEffect(() => {
    gl.toneMapping = toneMappingOf(boardStyle.lighting.toneMapping)
    gl.toneMappingExposure = boardStyle.lighting.exposure
    gl.shadowMap.type = THREE.PCFSoftShadowMap
  }, [gl])

  // T-068/T-079: en perfil bajo el relleno de zonas y el arbolado bajan a la
  // mitad. T-080/AC-5: además se apagan sombras y contornos del renderer.
  useEffect(() => {
    const scale = fillScaleFor(lowProfile)
    applyFillScale(props.scatter, scale)
    applyFillScale(props.world.treeRing, scale)
    applySceneProfile(props.scene, lowProfile)
    gl.shadowMap.enabled = lowProfile
      ? boardStyle.profiles.low.shadows
      : boardStyle.profiles.high.shadows
    gl.shadowMap.needsUpdate = true
    invalidate()
  }, [props.scatter, props.world.treeRing, props.scene, lowProfile, gl, invalidate])

  return (
    <>
      <PerformanceMonitor onChange={handleChange} onDecline={handleDecline} onIncline={handleIncline} />
      <Ambient
        world={props.world}
        tokensGroup={props.tokensGroup}
        nodes={props.nodes}
        reducedMotion={props.reducedMotion}
        lowProfile={lowProfile}
      />
    </>
  )
}
