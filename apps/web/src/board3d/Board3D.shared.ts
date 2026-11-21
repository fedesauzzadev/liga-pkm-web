// Estado compartido del tablero 3D entre CameraRig, Die3D, las etiquetas y el
// volcado de escena (T-076/T-078): refs planas sin React para cruzar la
// frontera del Canvas.
import * as THREE from 'three'
import type { DebugAim } from './camera'
import type { CameraEvent, CameraMode, RigFocus } from './rig'
import type { LabelPlan } from './labels'

/** Modo informado por el dump: modos del rig + cámara de captura (T-093). */
export type DumpCameraMode = CameraMode | 'shot'

export interface Board3DShared {
  readonly focusRef: { current: RigFocus | null }
  /** camara-libre-sin-ficha/AC-3: "Centrar en mí" (botón/tecla C/doble click). */
  readonly centerOnMeRef: { current: (() => void) | null }
  /** T-077: eventos de cámara (OVERVIEW/EXPLORE_KEY) desde la UI. */
  readonly dispatchRef: { current: ((event: CameraEvent) => void) | null }
  readonly cameraStateRef: { current: { mode: DumpCameraMode; target: THREE.Vector3 } | null }
  /** T-078: último plan de etiquetas (lo escribe NodeLabels, lo lee el dump). */
  readonly labelDumpRef: { current: readonly LabelPlan[] }
  /** SPEC-N/T-093/AC-1: apunta la cámara de captura (DEV, window.__debug.aimCamera). */
  readonly aimCameraRef: { current: ((aim: DebugAim) => void) | null }
}
