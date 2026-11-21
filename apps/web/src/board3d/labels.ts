// Etiquetas inteligentes de nodos (SPEC-J/T-078): tamaño fijo en pantalla,
// visibilidad por prioridad y anti-colisión, todo puro y numérico
// (NO-VISION). La capa R3F (NodeLabels.tsx) solo aplica este plan.
import { boxesOverlap, type BoardNode, type LabelsStyle, type PxBox } from '@liga/content'
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'
import { nodeWorldPos } from './scene'
import { boardStyle } from './style'

/** AC-5: raycast deshabilitado ⇒ las etiquetas nunca bloquean clics. */
export const noRaycast: THREE.Object3D['raycast'] = () => undefined

/**
 * SPEC-O/T-097/AC-1: destino mínimo para aplicar el overlay (renderOrder alto
 * y material sin depth test). Troika Text cumple esta forma estructuralmente.
 */
export interface LabelOverlayTarget {
  renderOrder: number
  material: THREE.Material | THREE.Material[]
}

/**
 * SPEC-O/T-097/AC-1: la etiqueta se dibuja ENCIMA de todo — renderOrder alto
 * y depthTest del tema en cada material (el contorno de troika es un segundo
 * material del mismo mesh; ambos reciben el flag).
 */
export function applyLabelOverlay(target: LabelOverlayTarget): void {
  target.renderOrder = BOARD3D.label.renderOrder
  const materials = Array.isArray(target.material) ? target.material : [target.material]
  for (const material of materials) {
    material.depthTest = BOARD3D.label.depthTest
  }
}

/** Razón de visibilidad de una etiqueta (para tests y sceneDump). */
export type LabelReason = 'always' | 'near' | 'hover' | 'hidden' | 'collision' | 'offscreen'

/** Candidata a etiqueta: nodo + rank precalculado + ancla en mundo. */
export interface LabelItem {
  readonly nodeId: string
  readonly text: string
  readonly type: string
  readonly rank: number
  readonly world: readonly [number, number, number]
}

/** Contexto de vista para planLabels: cámara real + ficha + hover/foco. */
export interface LabelViewCtx {
  readonly camera: THREE.PerspectiveCamera
  readonly width: number
  readonly height: number
  readonly token: readonly [number, number, number] | null
  readonly hovered: string | null
  readonly focused: readonly string[]
}

/** Resultado del plan por etiqueta; también es la entrada del sceneDump. */
export interface LabelPlan {
  readonly nodeId: string
  readonly text: string
  readonly type: string
  readonly rank: number
  readonly world: readonly [number, number, number]
  readonly screenPos: readonly [number, number]
  readonly screenBBox: PxBox
  /** T-088/AC-1: corrimiento en px aplicado para caber en el viewport. */
  readonly screenShift: readonly [number, number]
  readonly cameraDistance: number
  readonly visible: boolean
  readonly reason: LabelReason
  /** SPEC-O/T-097/AC-1: se dibuja encima de todo (sin depth test, renderOrder alto). */
  readonly overlay: boolean
}

/** SPEC-O/T-097/AC-1: ¿la etiqueta se dibuja encima de todo? */
export const labelOverlayActive = (): boolean =>
  BOARD3D.label.depthTest === false && BOARD3D.label.renderOrder > 0

/**
 * SPEC-O/T-097/AC-3: etiquetas visibles cuya caja en pantalla choca con la de
 * un edificio. Con overlay activo el par no queda "tapado" (la etiqueta se
 * dibuja encima); sin overlay, la caja del edificio la cubriría.
 */
export function labelsCoveredByBuildings(
  plans: readonly LabelPlan[],
  buildings: readonly { readonly name: string; readonly box: PxBox }[],
): readonly { readonly label: LabelPlan; readonly building: string }[] {
  const hits: { readonly label: LabelPlan; readonly building: string }[] = []
  for (const label of plans) {
    if (!label.visible) continue
    for (const building of buildings) {
      if (boxesOverlap(label.screenBBox, building.box)) {
        hits.push({ label, building: building.name })
      }
    }
  }
  return hits
}

/** AC-1: fontPx de pantalla → unidades de mundo a la distancia dada. */
export function worldFontSize(
  style: LabelsStyle,
  cameraDistance: number,
  fovDeg: number,
  viewportHeight: number,
): number {
  if (!style.screenSpaceSize) return style.fontPx * BOARD3D.pxToUnits
  const halfVfov = ((fovDeg / 2) * Math.PI) / 180
  return ((2 * cameraDistance * Math.tan(halfVfov)) / viewportHeight) * style.fontPx
}

/** AC-1: contorno en mundo, proporcional al texto (outlinePx/fontPx). */
export function outlineWidthWorld(style: LabelsStyle, fontSizeWorld: number): number {
  return (fontSizeWorld * style.outlinePx) / style.fontPx
}

/** white-space: nowrap en 3D: el <Text> es una sola línea (troika no envuelve
 * sin maxWidth y la capa R3F no setea maxWidth); la caja estimada usa el alto
 * de la línea única, que queda como invariante de AC-1. */
const LINE_HEIGHT_PX = 1.35

/** Tamaño estimado en px (colisión y dump): ancho conservador 0,62·caracteres. */
export function labelEstimateBoxPx(text: string, fontPx: number): { w: number; h: number } {
  return { w: Math.max(1, text.length) * fontPx * 0.62, h: fontPx * LINE_HEIGHT_PX }
}

/** AC-2: rank de prioridad (menor gana); sin entrada usa 'other' o el final. */
export function labelRank(type: string, priority: readonly string[]): number {
  const direct = priority.indexOf(type)
  if (direct >= 0) return direct
  const fallback = priority.indexOf('other')
  return fallback >= 0 ? fallback : priority.length
}

/** BoardNode[] (con label) → LabelItem[] con ancla [x, lift, z] y rank. */
export function labelItemsOf(
  nodes: readonly BoardNode[],
  imageSize: readonly [number, number] | undefined,
  lift: number,
): readonly LabelItem[] {
  const priority = boardStyle.labels.priority
  return nodes
    .filter((node) => typeof node.label === 'string' && node.label.length > 0)
    .map((node) => {
      const world = nodeWorldPos(node, imageSize)
      return {
        nodeId: node.id,
        text: node.label ?? node.id,
        type: node.type,
        rank: labelRank(node.type, priority),
        world: [world.x, lift, world.z] as const,
      }
    })
}

/** AC-3: ¿toca replanificar? (throttleHz 10 ⇒ cada 100 ms). */
export function shouldReplan(nowMs: number, lastPlanMs: number, throttleHz: number): boolean {
  const interval = 1000 / throttleHz
  return nowMs - lastPlanMs >= interval - 1e-9
}

/** AC-3: un paso del fundido hacia el target (0..1); fadeMs 0 ⇒ directo;
 * sin tiempo transcurrido no se mueve. */
export function stepFade(current: number, target: number, dtMs: number, fadeMs: number): number {
  if (fadeMs <= 0) return target
  if (dtMs <= 0) return current
  const step = Math.min(1, dtMs / fadeMs)
  return current + Math.sign(target - current) * Math.min(step, Math.abs(target - current))
}

const _v = new THREE.Vector3()

/**
 * T-088/AC-1: si la caja queda cortada por un borde del viewport, se desplaza
 * (sin dejar de estar anclada sobre el nodo: el shift es acotado) para quedar
 * completa dentro del viewport con margen. Cancela si ni así puede caber.
 */
const clampIntoViewport = (
  screenPos: readonly [number, number],
  size: { w: number; h: number },
  width: number,
  height: number,
): { pos: readonly [number, number]; shift: readonly [number, number]; fits: boolean } => {
  const margin = BOARD3D.label.viewportMarginPx
  const usableW = width - margin * 2
  const minX = margin + size.w / 2
  const maxX = margin + usableW - size.w / 2
  const minY = margin + size.h
  const maxY = height - margin
  if (size.w > usableW || size.h > height - margin * 2) {
    return { pos: screenPos, shift: [0, 0], fits: false }
  }
  const x = Math.min(maxX, Math.max(minX, screenPos[0]))
  const y = Math.min(maxY, Math.max(minY, screenPos[1]))
  return { pos: [x, y], shift: [x - screenPos[0], y - screenPos[1]], fits: true }
}

/**
 * AC-2..AC-4: plan completo por etiqueta. Fuera del viewport ⇒ 'offscreen'
 * (no entra a la colisión); visibilidad always/near/hover; T-088/AC-1: la caja
 * de una etiqueta visible está completa dentro del viewport (margen 8 px) y
 * sin envolver (una sola línea); la colisión oculta
 * la de menor prioridad (empate: orden lexicográfico por nodeId, determinista).
 */
export function planLabels(
  items: readonly LabelItem[],
  ctx: LabelViewCtx,
  style: LabelsStyle,
): readonly LabelPlan[] {
  const camera = ctx.camera
  camera.updateMatrixWorld(true)
  const plans: (LabelPlan & { visible: boolean; reason: LabelReason })[] = []

  for (const item of items) {
    _v.set(item.world[0], item.world[1], item.world[2])
    const cameraDistance = camera.position.distanceTo(_v)
    const ndc = _v.clone().project(camera)
    const screenPos: readonly [number, number] = [
      ((ndc.x + 1) / 2) * ctx.width,
      ((1 - ndc.y) / 2) * ctx.height,
    ]
    const size = labelEstimateBoxPx(item.text, style.fontPx)
    const screenBBox: PxBox = { x: screenPos[0] - size.w / 2, y: screenPos[1] - size.h, w: size.w, h: size.h }
    const plan = {
      nodeId: item.nodeId,
      text: item.text,
      type: item.type,
      rank: item.rank,
      world: item.world,
      screenPos,
      screenBBox,
      screenShift: [0, 0] as readonly [number, number],
      cameraDistance,
      visible: false,
      reason: 'hidden' as LabelReason,
      overlay: labelOverlayActive(),
    }
    const outside =
      ndc.z <= 0 ||
      ndc.z >= 1 ||
      screenPos[0] + size.w / 2 < 0 ||
      screenPos[0] - size.w / 2 > ctx.width ||
      screenPos[1] < 0 ||
      screenPos[1] - size.h > ctx.height
    if (outside) {
      plans.push({ ...plan, visible: false, reason: 'offscreen' })
      continue
    }
    // T-088/AC-1: caja completa dentro del viewport con margen de 8 px;
    // si ni así cabría (texto más ancho que el viewport), queda oculta.
    const clamped = clampIntoViewport(screenPos, size, ctx.width, ctx.height)
    if (!clamped.fits) {
      plans.push({ ...plan, visible: false, reason: 'hidden' })
      continue
    }
    const screenPosClamped = clamped.pos
    const screenBBoxClamped: PxBox = {
      x: screenPosClamped[0] - size.w / 2,
      y: screenPosClamped[1] - size.h,
      w: size.w,
      h: size.h,
    }
    const cplan = {
      ...plan,
      screenPos: screenPosClamped,
      screenShift: clamped.shift,
      screenBBox: screenBBoxClamped,
    }
    if ((style.alwaysShow as readonly string[]).includes(item.type)) {
      plans.push({ ...cplan, visible: true, reason: 'always' })
      continue
    }
    if (ctx.hovered === item.nodeId || ctx.focused.includes(item.nodeId)) {
      plans.push({ ...cplan, visible: true, reason: 'hover' })
      continue
    }
    if (ctx.token !== null) {
      const tokenDistance = Math.hypot(item.world[0] - ctx.token[0], item.world[2] - ctx.token[2])
      if (
        cameraDistance < style.showOnlyIfCameraDistanceBelow &&
        tokenDistance < style.showWithinTokenDistance
      ) {
        plans.push({ ...cplan, visible: true, reason: 'near' })
        continue
      }
    }
    plans.push(cplan)
  }

  if (!style.collision) return plans

  const candidates = plans
    .filter((p) => p.visible)
    .sort((a, b) => a.rank - b.rank || a.nodeId.localeCompare(b.nodeId))
  const kept: PxBox[] = []
  for (const candidate of candidates) {
    if (kept.some((box) => boxesOverlap(box, candidate.screenBBox))) {
      candidate.visible = false
      candidate.reason = 'collision'
    } else {
      kept.push(candidate.screenBBox)
    }
  }
  return plans
}
