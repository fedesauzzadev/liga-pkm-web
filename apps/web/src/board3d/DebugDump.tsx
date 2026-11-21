// Volcado de escena en desarrollo (SPEC-G/T-062/AC-9 + T-076/AC-8): expone
// window.__debug.sceneDump() con los objetos Y el estado de la cámara.
// Extraído de Board3D.tsx para mantener los archivos ≤ 400 líneas.
/// <reference types="vite/client" />
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'
import { buildSceneDump, cameraDumpOf, computeSceneDump, type SceneDump } from './dump'
import { modelsReportEntries } from './models/report'
import type { DebugAim } from './camera'
import type { BoardScene } from './scene'
import type { Board3DShared } from './Board3D.shared'

declare global {
  interface Window {
    __debug?: {
      sceneDump?: () => SceneDump
      /** SPEC-N/T-093/AC-1: apunta la cámara de captura (solo DEV, revisión). */
      aimCamera?: (aim: DebugAim) => void
      /** SPEC-O/T-094/AC-3: resolución de los modelos nuevos por kind. */
      modelsReport?: () => ReturnType<typeof modelsReportEntries>
    }
  }
}

export function DebugDump({
  boardScene,
  tokensGroup,
  shared,
}: {
  readonly boardScene: BoardScene
  readonly tokensGroup: THREE.Group
  readonly shared: Board3DShared
}): null {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera
  const size = useThree((state) => state.size)
  const gl = useThree((state) => state.gl)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__debug = {
      ...window.__debug,
      sceneDump: () => {        boardScene.root.updateMatrixWorld(true)
        tokensGroup.updateMatrixWorld(true)
        const state = shared.cameraStateRef.current
        const cameraDump = cameraDumpOf(
          state?.mode ?? 'overview',
          camera,
          state?.target ?? new THREE.Vector3(0, 0, 0),
        )
        // T-069/AC-7: triángulos y draw calls del último render (gl.info).
        const render = { triangles: gl.info.render.triangles, calls: gl.info.render.calls }
        // T-078/AC-4: plan de etiquetas inteligentes (lo actualiza NodeLabels).
        // SPEC-O/T-095/AC-5: el scatter (y los modelos que lo cubren) entra al
        // dump con su categoría — ningún objeto sin categoría.
        return buildSceneDump(
          computeSceneDump(
            [
              ...boardScene.nodes.values(),
              ...boardScene.stacks.values(),
              ...boardScene.landmarks.children,
              ...boardScene.scatter.children,
              ...tokensGroup.children,
            ],
            camera,
            size.width,
            size.height,
          ),
          cameraDump,
          render,
          shared.labelDumpRef.current,
        )
      },
      aimCamera: (aim: DebugAim) => shared.aimCameraRef.current?.(aim),
      modelsReport: modelsReportEntries,
    }
    return () => {
      if (window.__debug?.sceneDump !== undefined) delete window.__debug.sceneDump
      if (window.__debug?.aimCamera !== undefined) delete window.__debug.aimCamera
      if (window.__debug?.modelsReport !== undefined) delete window.__debug.modelsReport
    }
  }, [boardScene, tokensGroup, shared, camera, gl, size.width, size.height])
  return null
}
