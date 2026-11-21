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
import { cameraPresets, clampTarget, planOverview, type PanBounds } from './camera'
import { centerFrameTarget } from './center-frame'
import {
  clampExploreState,
  dampExploreTarget,
  exploreDragStep,
  exploreKeyStep,
  explorePose,
  exploreWheelStep,
  initialExploreState,
  type ExploreKey,
  type ExploreState,
} from './explore'

export type CameraMode =
  | 'overview'
  | 'transitionIn'
  | 'follow'
  | 'fork'
  | 'transitionOut'
  | 'free'
  | 'explore'

export type CameraEvent =
  | { readonly type: 'ROLL' }
  | { readonly type: 'CHOOSE_PATH' }
  | { readonly type: 'PATH_CHOSEN' }
  | { readonly type: 'TURN_END' }
  | { readonly type: 'USER_INPUT' }
  | { readonly type: 'CENTER_ON_ME'; readonly x: number; readonly z: number }
  | { readonly type: 'OVERVIEW' }
  | { readonly type: 'EXPLORE_KEY'; readonly key: ExploreKey }
  | { readonly type: 'EXPLORE_WHEEL'; readonly deltaY: number }
  | { readonly type: 'EXPLORE_DRAG'; readonly dxPx: number; readonly dyPx: number }
  | { readonly type: 'DONE' }

/** Ficha seguida y hacia dónde va (próximo nodo del camino). */
export interface RigFocus {
  readonly tokenX: number
  readonly tokenZ: number
  readonly nextX: number
  readonly nextZ: number
}

export interface CameraPose {
  position: THREE.Vector3
  target: THREE.Vector3
  fov: number
}

const ZERO_FOCUS: RigFocus = { tokenX: 0, tokenZ: 0, nextX: 0, nextZ: 0 }
const deg = Math.PI / 180

/**
 * T-076/AC-7 + T-077: transiciones válidas de la máquina. `null` = inválida.
 * - ROLL desde overview/free/follow/fork/explore/transitionOut (nunca transitionIn).
 * - CHOOSE_PATH solo en follow; PATH_CHOSEN solo en fork.
 * - TURN_END solo en follow/fork → transitionOut (destino `afterTurn`).
 * - USER_INPUT solo en overview (explore sincroniza sin cambiar de modo).
 * - OVERVIEW (T-077/AC-3) desde free/explore.
 * - CENTER_ON_ME (camara-libre-sin-ficha): explore re-centra el objetivo con
 *   damping; overview/free transicionan a explore sobre mi ficha. follow/fork/
 *   transitionIn quedan reservados a los cues de combate (AC-8).
 * - DONE cierra las transiciones (transitionOut → afterTurn por defecto).
 */
export function nextMode(mode: CameraMode, event: CameraEvent): CameraMode | null {
  switch (event.type) {
    case 'ROLL':
      return mode === 'transitionIn' ? null : 'transitionIn'
    case 'CHOOSE_PATH':
      return mode === 'follow' ? 'fork' : null
    case 'PATH_CHOSEN':
      return mode === 'fork' ? 'follow' : null
    case 'TURN_END':
      return mode === 'follow' || mode === 'fork' ? 'transitionOut' : null
    case 'USER_INPUT':
      return mode === 'overview' ? 'free' : null
    case 'OVERVIEW':
      return mode === 'free' || mode === 'explore' ? 'transitionOut' : null
    case 'CENTER_ON_ME':
      if (mode === 'explore') return 'explore'
      return mode === 'overview' || mode === 'free' ? 'transitionOut' : null
    case 'EXPLORE_KEY':
      return mode === 'explore' ? 'explore' : null
    case 'EXPLORE_WHEEL':
    case 'EXPLORE_DRAG':
      // camara-libre-3d: rueda/arrastre solo operan el estado del explore.
      return mode === 'explore' ? 'explore' : null
    case 'DONE':
      if (mode === 'transitionIn') return 'follow'
      if (mode === 'transitionOut') return cameraPresets.afterTurn
      return null
  }
}

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2

/**
 * T-075/AC-4: cue del popup de combate sobre la máquina de T-076. Al abrir se
 * acerca suavemente a la ficha (reusa la transición ROLL) SOLO si la cámara no
 * está ya cerca; al cerrar vuelve (TURN_END) solo si el popup acercó — si ya
 * estaba en follow (mitad de turno), el turno cierra su cámara como siempre.
 */
export function battleCameraCue(
  mode: CameraMode,
  open: boolean,
  zoomedByPopup: boolean,
): CameraEvent | null {
  if (open) {
    return mode === 'overview' || mode === 'free' || mode === 'explore' ? { type: 'ROLL' } : null
  }
  if (zoomedByPopup && (mode === 'follow' || mode === 'fork')) return { type: 'TURN_END' }
  return null
}

const clonePose = (pose: CameraPose): CameraPose => ({
  position: pose.position.clone(),
  target: pose.target.clone(),
  fov: pose.fov,
})

export function overviewPose(halfWidth: number, halfDepth: number, aspect: number): CameraPose {
  const plan = planOverview(halfWidth, halfDepth, aspect)
  return {
    position: new THREE.Vector3(...plan.position),
    target: new THREE.Vector3(...plan.target),
    fov: plan.fovDeg,
  }
}

/**
 * T-076/AC-2/AC-3: pose de seguimiento. La posición se ancla a distancia
 * `distance` de la FICHA (elevación `elevationDeg` sobre ella, detrás según el
 * heading); el target mira `lookAhead` hacia el próximo nodo. En fork sube la
 * elevación y aleja la cámara para ver las opciones (AC-3).
 */
export function followPose(
  kind: 'follow' | 'fork',
  focus: RigFocus,
  heading: THREE.Vector2,
  panBounds: PanBounds,
): CameraPose {
  const presets = cameraPresets
  const elevation =
    (kind === 'fork' ? presets.fork.elevationDeg : presets.follow.elevationDeg) * deg
  const distance = kind === 'fork' ? presets.fork.distance : presets.follow.distance
  const tokenY = BOARD3D.token.lift
  const unit = heading.lengthSq() < 1e-9 ? new THREE.Vector2(0, -1) : heading.clone().normalize()

  const position = new THREE.Vector3(
    focus.tokenX - unit.x * distance * Math.cos(elevation),
    Math.max(tokenY + distance * Math.sin(elevation), presets.follow.minHeight),
    focus.tokenZ - unit.y * distance * Math.cos(elevation),
  )
  position.x = Math.min(panBounds.maxX, Math.max(panBounds.minX, position.x))
  position.z = Math.min(panBounds.maxZ, Math.max(panBounds.minZ, position.z))

  const target = clampTarget(
    new THREE.Vector3(
      focus.tokenX + unit.x * presets.follow.lookAhead,
      tokenY,
      focus.tokenZ + unit.y * presets.follow.lookAhead,
    ),
    panBounds,
  )
  return { position, target, fov: presets.follow.fov }
}

/** Interpolación de transición: easeInOutCubic entre dos poses (AC-2/AC-4). */
export function samplePose(from: CameraPose, to: CameraPose, t01: number): CameraPose {
  const k = easeInOutCubic(Math.min(1, Math.max(0, t01)))
  return {
    position: from.position.clone().lerp(to.position, k),
    target: from.target.clone().lerp(to.target, k),
    fov: from.fov + (to.fov - from.fov) * k,
  }
}

/** T-076/AC-3: amortiguación — la pose actual se acerca a la deseada un
 * `damping` por frame (0,12 de camera.json). Muta `current`. */
export function dampPose(current: CameraPose, desired: CameraPose, damping: number): void {
  current.position.lerp(desired.position, damping)
  current.target.lerp(desired.target, damping)
  current.fov += (desired.fov - current.fov) * damping
}

/** T-076/AC-9: paso de dpr (0,25) hacia `direction`, clamped a perf.dpr. */
export function dprStep(
  current: number,
  bounds: readonly [number, number],
  direction: 1 | -1,
): number {
  const next = current + direction * 0.25
  return Math.min(bounds[1], Math.max(bounds[0], Math.round(next * 100) / 100))
}

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
