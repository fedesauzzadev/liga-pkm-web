// Cámara inmersiva (SPEC-I/T-076 + SPEC-J/T-077): capa R3F fina sobre rig.ts
// (puro). Cablea los cues de combate (T-075) y los botones/teclas de T-077 a
// la máquina de estados, aplica la pose con un loop propio + invalidate
// (frameloop demand), habilita OrbitControls en overview/free con sus límites
// (T-077/AC-2) y centra la ficha en el safeArea (AC-5). dado-fijo-tablero: el
// dado reposa en un punto FIJO del mundo (die.ts); este rig no lo reposiciona.
// camara-libre-3d: en explore la rueda (zoom continuo) y el arrastre (giro
// 360°) los manejan listeners propios sobre el canvas (explore-input.ts).
// camara-libre-sin-ficha: la tirada/movimiento NO cue-a la cámara; el centrado
// es explícito con CENTER_ON_ME sobre la ficha del jugador LOCAL (AC-3..AC-5).
// camara-libre-total: en explore el frustum se centra en el safeArea (sin
// pinning de ficha); tokenWorld solo para la cámara de combate.
import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { PlaybackSpeed } from '../events/anim.config'
import { applyCenteredOffset, aimCameraPose, planOverview, safeArea } from './camera'
import type { DebugAim } from './camera'
import { attachExploreInput } from './explore-input'
import {
  battleCameraCue,
  ImmersiveCamera,
  type CameraEvent,
  type CameraMode,
  type RigFocus,
} from './rig'

/** Mínimo OrbitControls (three-stdlib) que usa el rig. */
interface ControlsLike {
  enabled: boolean
  readonly target: THREE.Vector3
  minDistance: number
  maxDistance: number
  minPolarAngle: number
  maxPolarAngle: number
  minAzimuthAngle: number
  maxAzimuthAngle: number
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}

export interface CameraRigProps {
  readonly halfWidth: number
  readonly halfDepth: number
  /** Ficha seguida (lo publica Tokens3D); null hasta el primer frame. */
  readonly focusRef: { readonly current: RigFocus | null }
  /** pending === ChoosePath (bifurcación ⇒ fork, solo con cámara de combate). */
  readonly choosePath: boolean
  readonly turnEndNonce: number
  /** T-075/AC-4: el popup de combate está abierto (acercamiento a la ficha). */
  readonly battleActive: boolean
  /** camara-libre-sin-ficha/AC-3/AC-5: ficha del jugador LOCAL (mundo). */
  readonly myTarget: { readonly x: number; readonly z: number } | null
  readonly speed: PlaybackSpeed
  readonly reducedMotion: boolean
  /** "Centrar en mí" (AC-3): lo llaman botón/tecla C/doble click de Board3D. */
  readonly centerOnMeRef: { current: (() => void) | null }
  /** T-077: botones/teclas (OVERVIEW, EXPLORE_KEY) de Board3D. */
  readonly dispatchRef: { current: ((event: CameraEvent) => void) | null }
  /** Estado para window.__debug.sceneDump (AC-8). */
  readonly cameraStateRef: { current: { mode: CameraMode | 'shot'; target: THREE.Vector3 } | null }
  /** SPEC-N/T-093: cámara de captura (DEV), expuesta como __debug.aimCamera. */
  readonly aimCameraRef: { current: ((aim: DebugAim) => void) | null }
}

const TICK_MS = 16

export function CameraRig(props: CameraRigProps): null {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera
  const size = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)
  const gl = useThree((state) => state.gl)
  const controls = useThree((state) => state.controls) as unknown as ControlsLike | null
  const rigRef = useRef<ImmersiveCamera | null>(null)
  /** SPEC-N/T-093: objetivo de la cámara de captura (DEV); null = rig normal. */
  const debugAimRef = useRef<DebugAim | null>(null)
  if (rigRef.current === null) {
    rigRef.current = new ImmersiveCamera({
      halfWidth: props.halfWidth,
      halfDepth: props.halfDepth,
      initialTarget: props.myTarget,
    })
  }
  const applyingRef = useRef(false)
  const tickingRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** fix-camara-resolucion/AC-1: tamaño VIGENTE sin closures viejos — el loop
   * de ticks (setTimeout) captura `apply` una sola vez; si `apply` leyera el
   * `size` del render, los ticks ya agendados aplicarían el tamaño previo al
   * resize mientras los eventos aplican el nuevo (frustum alternando ⇒ el
   * mundo pulsa al fullscreen). El ref se actualiza en cada render. */
  const sizeRef = useRef(size)
  sizeRef.current = size

  const { focusRef, centerOnMeRef, dispatchRef, cameraStateRef, aimCameraRef } = props

  const apply = useCallback((): void => {
    const rig = rigRef.current
    if (rig === null) return
    // fix-camara-resolucion/AC-1: el tamaño sale del ref (vigente en cada
    // tick), no del closure del render.
    const { width, height } = sizeRef.current
    // SPEC-N/T-093/AC-1: cámara de captura (DEV) — reemplaza la pose del rig
    // mientras esté activa (la vista cenital de revisión no existe en juego).
    const aim = debugAimRef.current
    if (aim !== null) {
      const pose = aimCameraPose(aim)
      applyingRef.current = true
      camera.up.set(0, 1, 0)
      camera.position.copy(pose.position)
      camera.lookAt(pose.target)
      if (camera.fov !== pose.fov) {
        camera.fov = pose.fov
        camera.updateProjectionMatrix()
      }
      applyCenteredOffset(camera, safeArea, width, height, null, 1)
      if (controls !== null) controls.enabled = false
      applyingRef.current = false
      cameraStateRef.current = { mode: 'shot', target: pose.target.clone() }
      invalidate()
      return
    }
    const aspect = Math.max(0.2, width / Math.max(1, height))
    const focus = focusRef.current
    const res = rig.tick(performance.now(), focus, aspect, props.speed, props.reducedMotion)
    const pose = res.pose

    applyingRef.current = true
    camera.up.set(0, 1, 0)
    camera.position.copy(pose.position)
    camera.lookAt(pose.target)
    if (camera.fov !== pose.fov) {
      camera.fov = pose.fov
      camera.updateProjectionMatrix()
    }
    // camara-libre-total/AC-2: el centrado en ficha queda reservado a la
    // cámara de combate (follow/fork/transitionIn y la transitionOut que
    // interpola hacia el safeArea, AC-3); explore/overview/free centran el
    // frustum en el safeArea (AC-1).
    const battleCamera =
      res.mode === 'follow' ||
      res.mode === 'fork' ||
      res.mode === 'transitionIn' ||
      res.mode === 'transitionOut'
    const tokenWorld =
      battleCamera && res.safeMix < 1 && focus !== null
        ? new THREE.Vector3(focus.tokenX, 0.08, focus.tokenZ)
        : null
    applyCenteredOffset(camera, safeArea, width, height, tokenWorld, res.safeMix)
    if (controls !== null) {
      // camara-libre-3d: explore maneja rueda/arrastre propios (explore-input);
      // OrbitControls queda para overview/free con el plan del overview.
      controls.enabled = !res.inputLocked && (res.mode === 'overview' || res.mode === 'free')
      const plan = planOverview(props.halfWidth, props.halfDepth, aspect).controls
      controls.minDistance = plan.minDistance
      controls.maxDistance = plan.maxDistance
      controls.minPolarAngle = plan.minPolar
      controls.maxPolarAngle = plan.maxPolar
      controls.minAzimuthAngle = plan.minAzimuth
      controls.maxAzimuthAngle = plan.maxAzimuth
      controls.target.copy(pose.target)
    }
    applyingRef.current = false

    cameraStateRef.current = { mode: res.mode, target: pose.target.clone() }
    invalidate()
  }, [camera, controls, focusRef, cameraStateRef, invalidate, props.speed, props.reducedMotion])

  const ensureTicking = useCallback((): void => {
    if (tickingRef.current) return
    tickingRef.current = true
    const loop = (): void => {
      tickingRef.current = false
      apply()
      const rig = rigRef.current
      if (rig === null) return
      const active = rig.mode !== 'overview' && rig.mode !== 'free'
      if (active) {
        tickingRef.current = true
        timeoutRef.current = setTimeout(loop, TICK_MS)
      }
    }
    loop()
  }, [apply])

  // Pose inicial (T-077: explore sobre la ficha) y re-aplicar al cambiar
  // tamaño/velocidad — salvo en free, que la cámara la tiene el usuario. El
  // explore necesita el loop desde el arranque (el objetivo sigue a la ficha).
  // fix-camara-resolucion/AC-1: `size` en las deps re-aplica la pose tras un
  // resize (el offset del loop ya usa el tamaño actual vía getState).
  useEffect(() => {
    const rig = rigRef.current
    if (rig === null || rig.mode === 'free') return
    apply()
    ensureTicking()
  }, [apply, ensureTicking, size])

  // Cues del juego: camara-libre-sin-ficha/AC-2 quita la tirada de dado (la
  // tirada ya NO mueve la cámara); CHOOSE_PATH/TURN_END siguen cableados para
  // la cámara de combate (desde explore son no-ops, AC-8).
  useEffect(() => {
    const rig = rigRef.current
    if (rig === null) return
    if (props.choosePath) {
      if (rig.dispatch({ type: 'CHOOSE_PATH' }, performance.now())) ensureTicking()
    } else if (rig.mode === 'fork') {
      if (rig.dispatch({ type: 'PATH_CHOSEN' }, performance.now())) ensureTicking()
    }
  }, [props.choosePath, ensureTicking])

  useEffect(() => {
    const rig = rigRef.current
    if (rig === null || props.turnEndNonce <= 0) return
    if (rig.dispatch({ type: 'TURN_END' }, performance.now())) ensureTicking()
  }, [props.turnEndNonce, ensureTicking])

  // T-075/AC-4: abrir el popup de combate acerca la cámara a la ficha (si no lo
  // está); cerrarlo vuelve al estado previo solo si el popup acercó.
  const battleZoomRef = useRef(false)
  useEffect(() => {
    const rig = rigRef.current
    if (rig === null) return
    const cue = battleCameraCue(rig.mode, props.battleActive, battleZoomRef.current)
    if (cue === null) return
    battleZoomRef.current = cue.type === 'ROLL'
    if (rig.dispatch(cue, performance.now())) ensureTicking()
  }, [props.battleActive, ensureTicking])

  // "Centrar en mí" (AC-3) y botones/teclas de T-077 (AC-2/AC-3).
  useEffect(() => {
    centerOnMeRef.current = () => {
      const rig = rigRef.current
      const target = props.myTarget
      if (rig === null || target === null) return
      if (rig.dispatch({ type: 'CENTER_ON_ME', x: target.x, z: target.z }, performance.now())) {
        ensureTicking()
        apply()
      }
    }
    dispatchRef.current = (event: CameraEvent): void => {
      const rig = rigRef.current
      if (rig === null || !rig.dispatch(event, performance.now())) return
      ensureTicking()
      apply()
    }
    // SPEC-N/T-093/AC-1: cámara de captura (DEV) — aplica la pose de una y
    // mantiene el loop vivo (en overview/free el rig no tiquea solo).
    aimCameraRef.current = (aim: DebugAim): void => {
      debugAimRef.current = aim
      apply()
      ensureTicking()
    }
    return () => {
      centerOnMeRef.current = null
      dispatchRef.current = null
      aimCameraRef.current = null
    }
  }, [apply, ensureTicking, centerOnMeRef, dispatchRef, aimCameraRef, props.myTarget])

  // Interacción del usuario: overview ⇒ free (la máquina rechaza el resto);
  // explore ⇒ sincronizar la órbita del usuario con el estado del rig (AC-2).
  useEffect(() => {
    if (controls === null) return
    const onChange = (): void => {
      if (applyingRef.current) return
      const rig = rigRef.current
      if (rig === null) return
      if (rig.mode === 'overview') {
        rig.dispatch({ type: 'USER_INPUT' }, performance.now())
      } else if (rig.mode === 'explore') {
        rig.syncExplore(camera.position, controls.target)
        apply()
      }
    }
    controls.addEventListener('change', onChange)
    return () => controls.removeEventListener('change', onChange)
  }, [apply, camera, controls])

  // camara-libre-3d/AC-2..AC-5: rueda (zoom continuo con damping) y arrastre
  // (rotación 360°, wrap de azimuth) SOLO sobre el canvas y solo en explore.
  useEffect(() => {
    const rig = rigRef.current
    if (rig === null) return
    const dispatchInput = (event: CameraEvent): void => {
      if (!rig.dispatch(event, performance.now())) return
      ensureTicking()
      apply()
    }
    return attachExploreInput(gl.domElement, window, {
      active: (): boolean => rig.mode === 'explore',
      onWheel: (deltaY): void => dispatchInput({ type: 'EXPLORE_WHEEL', deltaY }),
      onDrag: (dxPx, dyPx): void => dispatchInput({ type: 'EXPLORE_DRAG', dxPx, dyPx }),
    })
  }, [apply, ensureTicking, gl])

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
      tickingRef.current = false
    },
    [],
  )

  return null
}
