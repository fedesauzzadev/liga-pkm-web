// Cámara inmersiva (SPEC-I/T-076 + SPEC-J/T-077): máquina de estados y poses
// puras (three sin R3F ni DOM) para verificar numéricamente con reloj falso
// (NO-VISION). CameraRig.tsx la cablea a la escena; los presets viven en
// ui/camera.json. T-077 agrega el modo `explore` (por defecto, explore.ts);
// camara-libre-3d suma rueda (zoom continuo con damping) y arrastre (giro
// 360°); camara-libre-sin-ficha desancla el objetivo de la ficha (el centrado
// es explícito con CENTER_ON_ME sobre la ficha del jugador LOCAL);
// camara-libre-total centra el frustum del explore en el safeArea (safeMix 1,
// sin pinning de ficha: el centrado en ficha queda para la cámara de combate).
import type { PlaybackSpeed } from '../events/anim.config'
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'
import { cameraPresets, clampTarget, type PanBounds } from './camera'
import { centerFrameTarget } from './center-frame'
import {
  clampExploreState,
  dampExploreTarget,
  exploreDragStep,
  exploreKeyStep,
  explorePose,
  exploreWheelStep,
  initialExploreState,
  type ExploreState,
} from './explore'
import {
  clonePose,
  dampPose,
  deg,
  easeInOutCubic,
  followPose,
  nextMode,
  overviewPose,
  samplePose,
  type CameraEvent,
  type CameraMode,
  type CameraPose,
  type RigFocus,
} from './rig-poses'

export {
  battleCameraCue,
  dampPose,
  dprStep,
  easeInOutCubic,
  followPose,
  nextMode,
  overviewPose,
  samplePose,
  type CameraEvent,
  type CameraMode,
  type CameraPose,
  type RigFocus,
} from './rig-poses'

const ZERO_FOCUS: RigFocus = { tokenX: 0, tokenZ: 0, nextX: 0, nextZ: 0 }


export interface RigOptions {
  readonly halfWidth: number
  readonly halfDepth: number
  /** camara-libre-sin-ficha/AC-5: encuadre inicial (mi ficha); una sola vez. */
  readonly initialTarget?: { readonly x: number; readonly z: number } | null | undefined
}

export interface RigTick {
  readonly mode: CameraMode
  readonly pose: CameraPose
  /** 0 = centrar la ficha (cámara de combate), 1 = frustum en el safeArea
   * (explore/overview, camara-libre-total/AC-1); transiciones interpolan. */
  readonly safeMix: number
  readonly inputLocked: boolean
}

interface TransitionState {
  readonly from: CameraPose
  /** camara-libre-total/AC-3: safeMix al arrancar (interpolación sin snap). */
  readonly fromSafeMix: number
  readonly startMs: number
}

/**
 * Controlador de la cámara inmersiva (puro): máquina de estados + poses.
 * `tick` avanza con un reloj inyectado (tests: reloj falso; UI: now real).
 */
export class ImmersiveCamera {
  mode: CameraMode = 'explore'
  readonly heading = new THREE.Vector2(0, -1)
  readonly panBounds: PanBounds
  /** N-0001: límites de la POSICIÓN del explore = panBounds + zoom máximo. El
   * clamp contra panBounds acercaba la cámara al objetivo en los bordes del
   * tablero (arranque en Pueblo Paleta: distancia 3,6 en vez de la pedida). */
  readonly cameraBounds: PanBounds
  /** T-077: órbita del usuario (azimut/inclinación/distancia/paneo). */
  exploreState: ExploreState = initialExploreState()
  private readonly exploreTarget = new THREE.Vector3(0, 0, 0)
  /** camara-libre-3d/AC-2: distancia aplicada (el zoom de la rueda dampa). */
  private appliedDistance = cameraPresets.explore.distance
  private readonly options: RigOptions
  private pose: CameraPose
  private transition: TransitionState | null = null
  /** camara-libre-total: último safeMix emitido (arranque en explore ⇒ 1). */
  private safeMixState = 1
  private lastFocus: RigFocus | null = null
  private holdUntilMs = 0
  private outDestination: 'explore' | 'overview' | null = null

  constructor(options: RigOptions) {
    this.options = options
    const limit = 1 + cameraPresets.overview.panLimit
    this.panBounds = {
      minX: -options.halfWidth * limit,
      maxX: options.halfWidth * limit,
      minZ: -options.halfDepth * limit,
      maxZ: options.halfDepth * limit,
    }
    const reach = cameraPresets.explore.distanceRange[1]
    this.cameraBounds = {
      minX: this.panBounds.minX - reach,
      maxX: this.panBounds.maxX + reach,
      minZ: this.panBounds.minZ - reach,
      maxZ: this.panBounds.maxZ + reach,
    }
    if (options.initialTarget !== null && options.initialTarget !== undefined) {
      // N-0004: ficha en el borde ⇒ el encuadre se corre hacia el tablero.
      const clamped = centerFrameTarget(options.initialTarget.x, options.initialTarget.z, options)
      this.exploreState = clampExploreState({
        ...this.exploreState,
        distance: BOARD3D.camera.centerOnMeDistance,
        offsetX: clamped.x,
        offsetZ: clamped.z,
      })
      this.appliedDistance = this.exploreState.distance
      this.exploreTarget.copy(clamped)
    }
    this.pose = explorePose(this.exploreState, this.exploreTarget.x, this.exploreTarget.z, this.cameraBounds)
  }

  overviewPosition(aspect: number): THREE.Vector3 {
    return overviewPose(this.options.halfWidth, this.options.halfDepth, aspect).position
  }

  /**
   * camara-libre-sin-ficha/AC-1: ancla única del explore — la ficha solo si
   * `targetFollowsToken`; si no, el origen del tablero (paneo absoluto, sin
   * saltos cuando cualquier ficha se mueve). La comparten
   * desiredExploreTarget, syncExplore y exploreKeyStep.
   */
  private exploreAnchor(): { readonly x: number; readonly z: number } {
    if (cameraPresets.explore.targetFollowsToken) {
      const focus = this.lastFocus ?? ZERO_FOCUS
      return { x: focus.tokenX, z: focus.tokenZ }
    }
    return { x: 0, z: 0 }
  }

  /** Objetivo deseado del explore: ancla + paneo, en el mundo. */
  private desiredExploreTarget(): THREE.Vector3 {
    const anchor = this.exploreAnchor()
    return clampTarget(
      new THREE.Vector3(
        anchor.x + this.exploreState.offsetX,
        0,
        anchor.z + this.exploreState.offsetZ,
      ),
      this.panBounds,
    )
  }

  dispatch(event: CameraEvent, nowMs: number): boolean {
    const next = nextMode(this.mode, event)
    if (next === null) return false
    if (next === 'transitionIn' || next === 'transitionOut') {
      this.transition = { from: clonePose(this.pose), fromSafeMix: this.safeMixState, startMs: nowMs }
    }
    if (next === 'transitionOut') {
      this.outDestination =
        event.type === 'OVERVIEW'
          ? 'overview'
          : event.type === 'CENTER_ON_ME'
            ? cameraPresets.buttons.centerOnMe
            : cameraPresets.afterTurn
    }
    if (event.type === 'CENTER_ON_ME') {
      // SPEC-M/T-085/AC-3: el centrado aplica los ÁNGULOS del modo destino
      // (picada por defecto del explore y azimut frontal); no conserva la
      // picada anterior. N-0001: tampoco el zoom — vuelve a la distancia de
      // encuadre de la ficha.
      const anchor = this.exploreAnchor()
      const framed = centerFrameTarget(event.x, event.z, this.options)
      this.exploreState = clampExploreState({
        ...this.exploreState,
        azimuthDeg: 0,
        elevationDeg: cameraPresets.explore.elevationDeg,
        distance: BOARD3D.camera.centerOnMeDistance,
        offsetX: framed.x - anchor.x,
        offsetZ: framed.z - anchor.z,
      })
    }
    if (event.type === 'EXPLORE_KEY') {
      const anchor = this.exploreAnchor()
      this.exploreState = exploreKeyStep(
        this.exploreState,
        event.key,
        anchor.x,
        anchor.z,
        this.panBounds,
      )
    }
    if (event.type === 'EXPLORE_WHEEL') {
      this.exploreState = exploreWheelStep(this.exploreState, event.deltaY)
    }
    if (event.type === 'EXPLORE_DRAG') {
      this.exploreState = exploreDragStep(this.exploreState, event.dxPx, event.dyPx)
    }
    this.mode = next
    return true
  }

  /**
   * T-077/AC-2: el usuario orbita/zoomea/panea con OrbitControls en explore:
   * se lee su cámara y se sincroniza la esférica + offset del objetivo.
   */
  syncExplore(cameraPosition: THREE.Vector3, controlsTarget: THREE.Vector3): void {
    if (this.mode !== 'explore') return
    const offset = new THREE.Vector3().subVectors(cameraPosition, controlsTarget)
    const horizontal = Math.hypot(offset.x, offset.z)
    const anchor = this.exploreAnchor()
    this.exploreState = clampExploreState({
      azimuthDeg: Math.atan2(offset.x, offset.z) / deg,
      elevationDeg: Math.atan2(Math.max(offset.y, 1e-6), Math.max(horizontal, 1e-6)) / deg,
      distance: offset.length(),
      offsetX:
        Math.min(this.panBounds.maxX, Math.max(this.panBounds.minX, controlsTarget.x)) - anchor.x,
      offsetZ:
        Math.min(this.panBounds.maxZ, Math.max(this.panBounds.minZ, controlsTarget.z)) - anchor.z,
    })
  }

  private durationMs(mode: 'transitionIn' | 'transitionOut', speed: PlaybackSpeed, reduced: boolean): number {
    if (reduced || speed === 'skip') return 0
    const transitions = cameraPresets.transitions
    return mode === 'transitionIn' ? transitions.overviewToFollowMs : transitions.followToOverviewMs
  }

  tick(
    nowMs: number,
    focus: RigFocus | null,
    aspect: number,
    speed: PlaybackSpeed,
    reducedMotion: boolean,
  ): RigTick {
    if (focus !== null) {
      this.lastFocus = focus
      const dx = focus.nextX - focus.tokenX
      const dz = focus.nextZ - focus.tokenZ
      if (Math.hypot(dx, dz) > 1e-6) this.heading.set(dx, dz).normalize()
    }
    const activeFocus = this.lastFocus ?? ZERO_FOCUS

    if (this.mode === 'transitionIn' || this.mode === 'transitionOut') {
      const trans = this.transition
      if (trans !== null) {
        const wasMode = this.mode
        const duration = this.durationMs(this.mode, speed, reducedMotion)
        const t01 = duration <= 0 ? 1 : Math.min(1, (nowMs - trans.startMs) / duration)
        const destination = this.outDestination ?? cameraPresets.afterTurn
        const desiredTarget = this.desiredExploreTarget()
        const to =
          this.mode === 'transitionIn'
            ? followPose('follow', activeFocus, this.heading, this.panBounds)
            : destination === 'overview'
              ? overviewPose(this.options.halfWidth, this.options.halfDepth, aspect)
              : explorePose(this.exploreState, desiredTarget.x, desiredTarget.z, this.cameraBounds)
        this.pose = samplePose(trans.from, to, t01)
        if (t01 >= 1) {
          if (this.mode === 'transitionOut') {
            this.holdUntilMs = nowMs + cameraPresets.transitions.holdAfterTurnMs
            if (destination !== 'overview') this.exploreTarget.copy(to.target)
          }
          this.transition = null
          this.outDestination = null
          this.mode = this.mode === 'transitionIn' ? 'follow' : destination
        }
        const inTransition = this.mode === 'transitionIn' || this.mode === 'transitionOut'
        // camara-libre-total/AC-3: el safeMix interpola del valor de origen al
        // del destino (follow 0 / explore+overview 1): sin snap en ningún
        // extremo de la transición.
        const toSafeMix = wasMode === 'transitionIn' ? 0 : 1
        const safeMix =
          trans.fromSafeMix + (toSafeMix - trans.fromSafeMix) * easeInOutCubic(t01)
        this.safeMixState = safeMix
        return {
          mode: this.mode,
          pose: this.pose,
          safeMix,
          inputLocked: inTransition || nowMs < this.holdUntilMs,
        }
      }
    }

    if (this.mode === 'follow' || this.mode === 'fork') {
      const desired = followPose(this.mode, activeFocus, this.heading, this.panBounds)
      if (reducedMotion || speed === 'skip') {
        this.pose = clonePose(desired)
      } else {
        dampPose(this.pose, desired, cameraPresets.follow.damping)
      }
      this.safeMixState = 0
      return { mode: this.mode, pose: this.pose, safeMix: 0, inputLocked: false }
    }

    if (this.mode === 'explore') {
      const desired = this.desiredExploreTarget()
      if (reducedMotion || speed === 'skip') {
        this.exploreTarget.copy(desired)
        this.appliedDistance = this.exploreState.distance
      } else {
        dampExploreTarget(this.exploreTarget, desired, cameraPresets.explore.damping)
        this.appliedDistance +=
          (this.exploreState.distance - this.appliedDistance) * cameraPresets.explore.damping
      }
      this.pose = explorePose(
        { ...this.exploreState, distance: this.appliedDistance },
        this.exploreTarget.x,
        this.exploreTarget.z,
        this.cameraBounds,
      )
      // camara-libre-total/AC-1: frustum centrado en el safeArea (safeMix 1).
      this.safeMixState = 1
      return {
        mode: 'explore',
        pose: this.pose,
        safeMix: 1,
        inputLocked: nowMs < this.holdUntilMs,
      }
    }

    this.safeMixState = 1
    return { mode: this.mode, pose: this.pose, safeMix: 1, inputLocked: nowMs < this.holdUntilMs }
  }
}
