// AC: SPEC-J/T-078/AC-1..AC-5 — etiquetas inteligentes: tamaño fijo en
// pantalla, visibilidad por prioridad, anti-colisión, dump y no-bloqueo.
// Numérico (NO-VISION): sin render ni timers; las poses salen del rig.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import { gameContent } from '../game/content'
import { BOARD3D } from '../theme/board3d'
import { applyCenteredOffset, applySafeOffset, cameraPresets, planOverview, safeArea } from './camera'
import { boxesOverlap } from '@liga/content'
import { boardStyle } from './style'
import {
  labelEstimateBoxPx,
  labelItemsOf,
  labelRank,
  noRaycast,
  outlineWidthWorld,
  planLabels,
  shouldReplan,
  stepFade,
  worldFontSize,
  type LabelItem,
  type LabelViewCtx,
} from './labels'
import { boardLabels, nodeWorldPos } from './scene'
import { ImmersiveCamera, type RigFocus } from './rig'

const ASPECT = 1440 / 900
const WIDTH = 1440
const HEIGHT = 900
const imageSize = gameContent.board.meta.imageSize
const style = boardStyle.labels

const halfW = BOARD3D.base.width / 2
const halfD = BOARD3D.base.depth / 2

const paleta = gameContent.board.nodes.find((node) => node.id === 'paleta')
if (paleta === undefined) throw new Error('falta el nodo paleta')
const paletaWorld = nodeWorldPos(paleta, imageSize)
const FOCUS: RigFocus = {
  tokenX: paletaWorld.x,
  tokenZ: paletaWorld.z,
  nextX: paletaWorld.x,
  nextZ: paletaWorld.z,
}
const TOKEN: readonly [number, number, number] = [paletaWorld.x, BOARD3D.token.lift, paletaWorld.z]

const poseCamera = (
  position: readonly [number, number, number],
  target: readonly [number, number, number],
  fov: number,
): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera(fov, ASPECT, 0.1, 200)
  camera.position.set(position[0], position[1], position[2])
  camera.up.set(0, 1, 0)
  camera.lookAt(new THREE.Vector3(target[0], target[1], target[2]))
  camera.updateMatrixWorld(true)
  return camera
}

const exploreCamera = (): THREE.PerspectiveCamera => {
  // camara-libre-sin-ficha/AC-5: el explore arranca encuadrando la ficha una
  // sola vez (initialTarget); después queda anclado al tablero.
  const rig = new ImmersiveCamera({
    halfWidth: halfW,
    halfDepth: halfD,
    initialTarget: { x: paletaWorld.x, z: paletaWorld.z },
  })
  let res = rig.tick(0, FOCUS, ASPECT, '1x', false)
  for (let i = 1; i <= 300; i += 1) res = rig.tick(i * 16, FOCUS, ASPECT, '1x', false)
  const camera = poseCamera(
    [res.pose.position.x, res.pose.position.y, res.pose.position.z],
    [res.pose.target.x, res.pose.target.y, res.pose.target.z],
    res.pose.fov,
  )
  applyCenteredOffset(camera, safeArea, WIDTH, HEIGHT, new THREE.Vector3(...TOKEN), 0)
  return camera
}

const overviewCamera = (): THREE.PerspectiveCamera => {
  const plan = planOverview(halfW, halfD, ASPECT)
  const camera = poseCamera(plan.position, plan.target, plan.fovDeg)
  applySafeOffset(camera, safeArea, WIDTH, HEIGHT)
  return camera
}

const boardItems = labelItemsOf(boardLabels(gameContent.board), imageSize, BOARD3D.label.lift)

const ctxOf = (camera: THREE.PerspectiveCamera, overrides: Partial<LabelViewCtx> = {}): LabelViewCtx => ({
  camera,
  width: WIDTH,
  height: HEIGHT,
  token: TOKEN,
  hovered: null,
  focused: [],
  ...overrides,
})

const itemAt = (
  nodeId: string,
  world: readonly [number, number, number],
  text: string,
  type: string,
  rank: number,
): LabelItem => ({ nodeId, text, type, rank, world })

const nearWorld = (dx: number, dz: number): readonly [number, number, number] => [
  TOKEN[0] + dx,
  BOARD3D.label.lift,
  TOKEN[2] + dz,
]

const screenPxHeight = (fontSizeWorld: number, distance: number, fovDeg: number): number =>
  (fontSizeWorld / (2 * distance * Math.tan(((fovDeg / 2) * Math.PI) / 180))) * HEIGHT

// AC: SPEC-J/T-078/AC-1 — tamaño fijo en pantalla: fontPx px de alto a
// cualquier distancia (≥ 13 px con style.json) y contorno outlinePx relativo.
test('AC: SPEC-J/T-078/AC-1 - la fuente mide fontPx px en pantalla a cualquier distancia', () => {
  expect(style.fontPx).toBeGreaterThanOrEqual(13)
  expect(style.screenSpaceSize).toBe(true)
  for (const distance of [3, 4.5, 9, 16]) {
    const fontSize = worldFontSize(style, distance, cameraPresets.explore.fov, HEIGHT)
    expect(fontSize).toBeGreaterThan(0)
    expect(screenPxHeight(fontSize, distance, cameraPresets.explore.fov)).toBeCloseTo(style.fontPx, 6)
    expect(outlineWidthWorld(style, fontSize)).toBeCloseTo(fontSize * (style.outlinePx / style.fontPx), 6)
  }
  const flat = { ...style, screenSpaceSize: false }
  expect(worldFontSize(flat, 12, cameraPresets.explore.fov, HEIGHT)).toBeCloseTo(style.fontPx * BOARD3D.pxToUnits, 6)
  expect(labelEstimateBoxPx('Ciudad Plateada', style.fontPx).w).toBeGreaterThan(
    labelEstimateBoxPx('A', style.fontPx).w,
  )
})

// AC: SPEC-J/T-078/AC-2 — siempre los gimnasios; el resto solo cerca (cámara
// Y ficha), o en hover/foco; sin ficha solo always/hover.
test('AC: SPEC-J/T-078/AC-2 - visibilidad por prioridad: always / near / hover / hidden', () => {
  const gym = itemAt('gym-cerca', nearWorld(2.5, 0), 'Ciudad Verde', 'gym', 0)
  const centro = itemAt('centro', nearWorld(-1, 0.5), 'Centro Pokémon', 'centro', 1)
  const duelo = itemAt('hov', nearWorld(0, -1.5), 'Duelo', 'duelo', 6)

  const explore = planLabels(
    [gym, centro, duelo],
    ctxOf(exploreCamera(), { hovered: 'hov' }),
    style,
  )
  const byId = new Map(explore.map((p) => [p.nodeId, p]))
  expect(byId.get('gym-cerca')).toMatchObject({ visible: true, reason: 'always' })
  expect(byId.get('centro')).toMatchObject({ visible: true, reason: 'near' })
  expect(byId.get('hov')).toMatchObject({ visible: true, reason: 'hover' })

  // N-0004: la vista general por defecto quedó más cerca que
  // showOnlyIfCameraDistanceBelow; "lejos" = overview con el zoom al máximo.
  const plan = planOverview(halfW, halfD, ASPECT)
  const zoomOut = cameraPresets.overview.zoomRange[1]
  const far = poseCamera(
    [plan.position[0], plan.position[1] * zoomOut, plan.target[2] + (plan.position[2] - plan.target[2]) * zoomOut],
    plan.target,
    plan.fovDeg,
  )
  applySafeOffset(far, safeArea, WIDTH, HEIGHT)
  expect(plan.distance * zoomOut).toBeGreaterThan(style.showOnlyIfCameraDistanceBelow)
  const overview = planLabels([gym, centro, duelo], ctxOf(far), style)
  const byIdOverview = new Map(overview.map((p) => [p.nodeId, p]))
  expect(byIdOverview.get('gym-cerca')).toMatchObject({ visible: true, reason: 'always' })
  expect(byIdOverview.get('centro')).toMatchObject({ visible: false, reason: 'hidden' })
  expect(byIdOverview.get('hov')).toMatchObject({ visible: false, reason: 'hidden' })

  const focused = planLabels([duelo], ctxOf(overviewCamera(), { focused: ['hov'] }), style)
  expect(focused[0]).toMatchObject({ visible: true, reason: 'hover' })

  const noToken = planLabels([centro], ctxOf(exploreCamera(), { token: null }), style)
  expect(noToken[0]).toMatchObject({ visible: false, reason: 'hidden' })
})

// AC: SPEC-J/T-078/AC-2 — rank por priority con fallback 'other'.
test('AC: SPEC-J/T-078/AC-2 - labelRank usa priority con fallback other', () => {
  const priority = ['gym', 'centro', 'oak', 'other']
  expect(labelRank('gym', priority)).toBe(0)
  expect(labelRank('centro', priority)).toBe(1)
  expect(labelRank('duelo', priority)).toBe(3)
  expect(labelRank('x', ['gym'])).toBe(1)
})

// AC: SPEC-J/T-078/AC-3 — anti-colisión: gana la de mayor prioridad; iguales
// → orden determinista por nodeId; sin solape no se oculta nadie.
test('AC: SPEC-J/T-078/AC-3 - solape: se oculta la de menor prioridad, con desempate por id', () => {
  const camera = exploreCamera()
  const world = nearWorld(0, 0)
  const gym = itemAt('b-gym', world, 'Ciudad Verde', 'gym', 0)
  const centro = itemAt('a-centro', world, 'Centro Pokémon', 'centro', 1)
  const sameA = itemAt('a-duelo', world, 'Duelo', 'duelo', 6)
  const sameB = itemAt('b-duelo', world, 'Duelo', 'duelo', 6)

  const plan = planLabels([centro, gym, sameA, sameB], ctxOf(camera), style)
  const byId = new Map(plan.map((p) => [p.nodeId, p]))
  expect(byId.get('b-gym')).toMatchObject({ visible: true, reason: 'always' })
  expect(byId.get('a-centro')).toMatchObject({ visible: false, reason: 'collision' })
  expect(byId.get('a-duelo')).toMatchObject({ visible: false, reason: 'collision' })
  expect(byId.get('b-duelo')).toMatchObject({ visible: false, reason: 'collision' })

  // dado-fijo-tablero (panLimit 0,25 + clamp direccional): con la ficha cerca
  // de la pared el explore inicial queda más cerca de la ficha, así que el
  // "lejos" se acercó para seguir DENTRO del viewport (el AC es sin colisión).
  const apart = itemAt('lejos', nearWorld(1.2, -0.5), 'Ciudad Lejos', 'gym', 0)
  const planApart = planLabels([gym, apart], ctxOf(camera), style)
  expect(planApart.every((p) => p.visible)).toBe(true)

  const noCollision = planLabels([gym, centro], ctxOf(camera), { ...style, collision: false })
  expect(noCollision.every((p) => p.visible)).toBe(true)
})

// AC: SPEC-J/T-078/AC-3 — throttle cada 100 ms (10 Hz) y fundido de 150 ms.
test('AC: SPEC-J/T-078/AC-3 - throttle 10 Hz y fundido 150 ms', () => {
  expect(style.throttleHz).toBe(10)
  expect(style.fadeMs).toBe(150)
  expect(shouldReplan(1099, 1000, style.throttleHz)).toBe(false)
  expect(shouldReplan(1100, 1000, style.throttleHz)).toBe(true)
  expect(stepFade(0, 1, 75, 150)).toBeCloseTo(0.5, 6)
  expect(stepFade(0.5, 1, 300, 150)).toBe(1)
  expect(stepFade(1, 0, 75, 150)).toBeCloseTo(0.5, 6)
  expect(stepFade(0.2, 0, 0, 150)).toBe(0.2)
  expect(stepFade(0.2, 1, 10, 0)).toBe(1)
})

// AC: SPEC-J/T-078/AC-4 — en la vista inicial (explore) y en la general
// (overview) ningún par de etiquetas VISIBLES se solapa; las fuera del
// viewport no se procesan (offscreen, sin colisión) y quedan invisibles.
test('AC: SPEC-J/T-078/AC-4 - sin solapes en explore y overview; offscreen excluida', () => {
  for (const camera of [exploreCamera(), overviewCamera()]) {
    const plan = planLabels(boardItems, ctxOf(camera), style)
    expect(plan.length).toBe(boardItems.length)
    const visible = plan.filter((p) => p.visible)
    expect(visible.length).toBeGreaterThan(0)
    for (let i = 0; i < visible.length; i += 1) {
      const a = visible[i]
      if (a === undefined) continue
      for (let j = i + 1; j < visible.length; j += 1) {
        const b = visible[j]
        if (b === undefined) continue
        const overlap = boxesOverlap(a.screenBBox, b.screenBBox)
        expect(overlap, `${a.nodeId} vs ${b.nodeId}`).toBe(false)
      }
    }
    for (const p of plan) {
      if (p.reason === 'offscreen') {
        expect(p.visible).toBe(false)
        const box = p.screenBBox
        const outside = box.x + box.w < 0 || box.x > WIDTH || box.y + box.h < 0 || box.y > HEIGHT
        expect(outside, `${p.nodeId} offscreen debería estar fuera del viewport`).toBe(true)
      }
    }
  }

  // Offscreen no entra a la colisión: dos etiquetas solapadas pero fuera del
  // viewport quedan 'offscreen' (ninguna gana por prioridad).
  const sky = poseCamera([0, 30, 0], [0, 40, 0], cameraPresets.overview.fov)
  const off = planLabels(
    [itemAt('a', [0, 20, -20], 'Aaa', 'gym', 0), itemAt('b', [0, 20, -20], 'Bbb', 'centro', 1)],
    ctxOf(sky),
    style,
  )
  expect(off.every((p) => p.reason === 'offscreen' && !p.visible)).toBe(true)
})

// AC: SPEC-J/T-078/AC-5 — las etiquetas no bloquean clics del mundo: un
// raycast a través de una malla con noRaycast no da intersecciones.
test('AC: SPEC-J/T-078/AC-5 - raycast deshabilitado: no bloquea clics del mundo', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
  const raycaster = new THREE.Raycaster()
  raycaster.set(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1))
  expect(raycaster.intersectObject(mesh).length).toBeGreaterThan(0)
  mesh.raycast = noRaycast
  expect(raycaster.intersectObject(mesh)).toHaveLength(0)
})
