// Etiquetas inteligentes (SPEC-J/T-078): capa R3F fina sobre labels.ts
// (puro, testeable sin WebGL). Aplica el plan: tamaño constante en pantalla
// (AC-1), visibilidad/fundido según prioridad y anti-colisión cada 100 ms
// (AC-2/AC-3) y raycast deshabilitado para no bloquear clics (AC-5).
// Publica el último plan para el sceneDump (AC-4) vía Board3DShared.
import { Billboard, Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, type ComponentRef, type ReactNode } from 'react'
import * as THREE from 'three'
import type { BoardNode } from '@liga/content'
import { BOARD3D } from '../theme/board3d'
import { boardStyle } from './style'
import {
  applyLabelOverlay,
  labelItemsOf,
  noRaycast,
  outlineWidthWorld,
  planLabels,
  shouldReplan,
  stepFade,
  worldFontSize,
  type LabelPlan,
} from './labels'

type TextMesh = ComponentRef<typeof Text>

/** Sin corrimiento del plan (antes del primer replan). */
const ZERO_SHIFT: readonly [number, number] = [0, 0]

export interface NodeLabelsProps {
  readonly nodes: readonly BoardNode[]
  readonly imageSize: readonly [number, number] | undefined
  readonly hovered: string | null
  /** Nodos con aro del pending (foco de decisión). */
  readonly focused: ReadonlySet<string>
  readonly tokenWorld: readonly [number, number, number] | null
  readonly dumpRef: { current: readonly LabelPlan[] }
  readonly reducedMotion: boolean
}

export function NodeLabels(props: NodeLabelsProps): ReactNode {
  const { nodes, imageSize, hovered, focused, tokenWorld, dumpRef, reducedMotion } = props
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera
  const size = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)
  const style = boardStyle.labels

  const items = useMemo(
    () => labelItemsOf(nodes, imageSize, BOARD3D.label.lift),
    [nodes, imageSize],
  )
  const textRefs = useRef(new Map<string, TextMesh>())
  const opacityRef = useRef(new Map<string, number>())
  const targetRef = useRef(new Map<string, boolean>())
  const shiftRef = useRef(new Map<string, readonly [number, number]>())
  const lastPlanMs = useRef(Number.NEGATIVE_INFINITY)
  const _world = useRef(new THREE.Vector3())

  useFrame((state, delta) => {
    const nowMs = state.clock.elapsedTime * 1000
    if (shouldReplan(nowMs, lastPlanMs.current, style.throttleHz)) {
      lastPlanMs.current = nowMs
      const plan = planLabels(
        items,
        { camera, width: size.width, height: size.height, token: tokenWorld, hovered, focused: [...focused] },
        style,
      )
      dumpRef.current = plan
      for (const entry of plan) {
        targetRef.current.set(entry.nodeId, entry.visible)
        shiftRef.current.set(entry.nodeId, entry.screenShift)
      }
    }

    let animating = false
    const dtMs = delta * 1000
    for (const item of items) {
      const text = textRefs.current.get(item.nodeId)
      if (text === undefined) continue
      _world.current.set(item.world[0], item.world[1], item.world[2])
      const cameraDistance = camera.position.distanceTo(_world.current)
      // AC-1: tamaño fijo en pantalla (se corrige en cada frame renderizado).
      const fontSize = worldFontSize(style, cameraDistance, camera.fov, size.height)
      if (Math.abs(text.fontSize - fontSize) > 1e-5) text.fontSize = fontSize
      const outline = outlineWidthWorld(style, fontSize)
      if (Math.abs(text.outlineWidth - outline) > 1e-5) text.outlineWidth = outline
      // T-088/AC-1: la caja queda completa en el viewport — el corrimiento en
      // px del plan se aplica en coords del billboard (x: derecha, y: arriba).
      // px → unidades de mundo a la distancia actual: fontSize = upp·fontPx.
      const shift = shiftRef.current.get(item.nodeId) ?? ZERO_SHIFT
      const unitsPerPx = fontSize / Math.max(1e-9, style.fontPx)
      const offsetLocalX = shift[0] * unitsPerPx
      const offsetLocalY = -shift[1] * unitsPerPx
      if (
        Math.abs(text.position.x - offsetLocalX) > 1e-4 ||
        Math.abs(text.position.y - offsetLocalY) > 1e-4
      ) {
        text.position.set(offsetLocalX, offsetLocalY, 0)
      }
      // AC-3: fundido de 150 ms hacia el target del plan.
      const target = targetRef.current.get(item.nodeId) ?? false
      const targetOpacity = target ? 1 : 0
      const current = opacityRef.current.get(item.nodeId) ?? 0
      const next = reducedMotion ? targetOpacity : stepFade(current, targetOpacity, dtMs, style.fadeMs)
      if (Math.abs(text.fillOpacity - next) > 1e-4) text.fillOpacity = next
      if (Math.abs(text.outlineOpacity - next) > 1e-4) text.outlineOpacity = next
      const visible = next > 0.01
      if (text.visible !== visible) text.visible = visible
      opacityRef.current.set(item.nodeId, next)
      if (Math.abs(next - targetOpacity) > 0.005) animating = true
    }
    if (animating) invalidate()
  })

  return items.map((item) => (
    <Billboard key={item.nodeId} position={[item.world[0], item.world[1], item.world[2]]}>
      <Text
        ref={(text: TextMesh | null) => {
          if (text === null) textRefs.current.delete(item.nodeId)
          else {
            textRefs.current.set(item.nodeId, text)
            // AC-5: la etiqueta nunca intercepta raycasts del mundo.
            text.raycast = noRaycast
            // SPEC-O/T-097/AC-1: se dibuja encima de todo (sin depth test).
            applyLabelOverlay(text)
          }
        }}
        fontSize={BOARD3D.label.fontSize}
        color={BOARD3D.label.color}
        outlineColor={BOARD3D.label.outlineColor}
        outlineWidth={BOARD3D.label.outlineWidth}
        fillOpacity={0}
        outlineOpacity={0}
        anchorX="center"
        anchorY="bottom"
      >
        {item.text}
      </Text>
    </Billboard>
  ))
}
