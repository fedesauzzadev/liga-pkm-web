// Teclas de cámara (SPEC-J/T-077/AC-2): Q/E giro, WASD paneo, +/- zoom,
// V overview y C centrar en mí (camara-libre-sin-ficha), según camera.json
// keys; se ignoran mientras se escribe. Extraído de Board3D.tsx para mantener
// los archivos ≤ 400 líneas.
import { useEffect } from 'react'
import { cameraPresets } from './camera'
import type { ExploreKey } from './explore'
import type { Board3DShared } from './Board3D.shared'

export function useCameraKeys(shared: Board3DShared): void {
  useEffect(() => {
    const keys = cameraPresets.keys
    const panKeys: readonly ExploreKey[] = ['panForward', 'panLeft', 'panBack', 'panRight']
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }
      const dispatch = shared.dispatchRef.current
      if (dispatch === null) return
      const key = event.key.length === 1 ? event.key.toUpperCase() : event.key
      if (key === keys.overview) dispatch({ type: 'OVERVIEW' })
      else if (key === keys.centerOnMe) shared.centerOnMeRef.current?.()
      else if (key === keys.rotateLeft) dispatch({ type: 'EXPLORE_KEY', key: 'rotateLeft' })
      else if (key === keys.rotateRight) dispatch({ type: 'EXPLORE_KEY', key: 'rotateRight' })
      else if (key === '+' || key === '=') dispatch({ type: 'EXPLORE_KEY', key: 'zoomIn' })
      else if (key === '-' || key === '_') dispatch({ type: 'EXPLORE_KEY', key: 'zoomOut' })
      else {
        const panIndex = keys.pan.indexOf(key)
        const panKey = panIndex >= 0 && panIndex < panKeys.length ? panKeys[panIndex] : undefined
        if (panKey !== undefined) {
          dispatch({ type: 'EXPLORE_KEY', key: panKey })
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [shared])
}
