// AC: SPEC-G/T-063 — fichas y movimiento: geometría, parábola del salto,
// promesa de llegada, offset entre fichas y volcado en viewport; caminata-ficha
// — paso lento y slots de reposo (quitar-tambaleo: sin vaivén lateral). Todo
// numérico (NO-VISION).
import { expect, test } from 'vitest'
import { BoardGraphSchema, type BoardGraph } from '@liga/content'
import * as THREE from 'three'
import kantoJson from '../../../../content/board/kanto.json'
import { BOARD3D } from '../theme/board3d'
import { computeSceneDump } from './dump'
import { boardDecor } from './decor'
import { buildBoardScene, nodeWorldPos } from './scene'
import {
  buildToken,
  createTokensGroup,
  hopPosition,
  moveTokenAlong,
  setTokenModel,
  setTokenSprite,
  stepMsFor,
  syncTokenSprites,
  syncTokens,
  tokenTargetPos,
} from './tokens'
import { deckStacks } from './stacks'
import { planOverview } from './camera'

const board: BoardGraph = BoardGraphSchema.parse(kantoJson)
const imageSize = board.meta.imageSize
const boardScene = buildBoardScene(board, deckStacks, boardDecor)

const nodePos = (id: string): { readonly x: number; readonly z: number } => {
  const node = board.nodes.find((candidate) => candidate.id === id)
  if (node === undefined) throw new Error(`nodo ${id} falta en kanto.json`)
  return nodeWorldPos(node, imageSize)
}

test('AC: SPEC-G/T-063/AC-1 - ficha = base cilíndrica r0,2 + sprite 0,9; sin sprite hay peón', () => {
  const token = buildToken('p1', 0)
  expect(token.name).toBe('token:p1')
  const base = token.children.find((child) => child.name === 'base') as THREE.Mesh
  const params = (base.geometry as THREE.CylinderGeometry).parameters
  expect(params.radiusTop).toBeCloseTo(BOARD3D.token.baseRadius, 5)
  expect(params.radiusBottom).toBeCloseTo(BOARD3D.token.baseRadius, 5)
  expect(params.height).toBeCloseTo(BOARD3D.token.baseHeight, 5)

  const sprite = token.children.find((child) => child.name === 'sprite') as THREE.Mesh
  const size = (sprite.geometry as THREE.PlaneGeometry).parameters
  expect(size.width).toBeCloseTo(BOARD3D.token.spriteSize, 5)
  expect(size.height).toBeCloseTo(BOARD3D.token.spriteSize, 5)

  // Sin textura: peón visible, sprite oculto (fallback de color).
  expect(sprite.visible).toBe(false)
  const pawn = token.children.find((child) => child.name === 'pawn') as THREE.Mesh
  expect(pawn.visible).toBe(true)

  // Con textura: sprite visible, peón oculto.
  setTokenSprite(token, new THREE.Texture())
  expect(sprite.visible).toBe(true)
  expect(pawn.visible).toBe(false)
  setTokenSprite(token, null)
  expect(sprite.visible).toBe(false)
  expect(pawn.visible).toBe(true)
})

test('AC: fichas-modelo-3d-hgss/AC-4 - el modelo 3D del inicial se monta sobre la base y oculta peón y sprite', () => {
  const token = buildToken('p1', 0)
  setTokenSprite(token, new THREE.Texture())
  const model = new THREE.Group()
  setTokenModel(token, model)
  const mounted = token.children.find((child) => child.name === 'model')
  expect(mounted).toBe(model)
  expect(mounted?.rotation.y).toBeCloseTo(BOARD3D.token.modelRotY, 6)
  expect(mounted?.position.y).toBeCloseTo(BOARD3D.token.baseHeight, 6)
  // El sprite NO se muestra cuando el modelo cargó (AC-4); base y blob quedan.
  const pawn = token.children.find((child) => child.name === 'pawn') as THREE.Mesh
  const sprite = token.children.find((child) => child.name === 'sprite') as THREE.Mesh
  expect(pawn.visible).toBe(false)
  expect(sprite.visible).toBe(false)
  expect(token.children.find((child) => child.name === 'base')).toBeDefined()
  expect(token.children.find((child) => child.name === 'blob')).toBeDefined()

  // AC-5: null saca el modelo y devuelve el peón (cadena modelo → sprite → peón).
  setTokenModel(token, null)
  expect(token.children.find((child) => child.name === 'model')).toBeUndefined()
  expect(pawn.visible).toBe(true)
})

test('AC: fichas-modelo-3d-hgss/AC-6 - el modelo es hijo de la ficha y NO hace billboard', async () => {
  const group = createTokensGroup()
  const tokensMap = syncTokens(group, [{ id: 'p1', nodeId: 'paleta', spriteUrl: null }], board, imageSize)
  const token = tokensMap.get('p1')
  if (token === undefined) throw new Error('falta p1')
  const model = new THREE.Group()
  setTokenModel(token, model)
  token.updateMatrixWorld(true)
  const before = model.getWorldQuaternion(new THREE.Quaternion())

  // El sprite copia la cámara; el modelo queda anclado al tablero (sin billboard).
  setTokenSprite(token, new THREE.Texture())
  const camera = new THREE.PerspectiveCamera()
  camera.quaternion.setFromEuler(new THREE.Euler(0.3, Math.PI / 3, 0.1))
  syncTokenSprites(group, camera)
  const sprite = token.children.find((child) => child.name === 'sprite') as THREE.Mesh
  expect(sprite.quaternion.equals(camera.quaternion)).toBe(true)
  expect(model.getWorldQuaternion(new THREE.Quaternion()).equals(before)).toBe(true)

  // Mover la ficha mueve el modelo (hijo del grupo ficha: idle bob y saltos intactos).
  token.position.set(4, 0.5, 4)
  token.updateMatrixWorld(true)
  const world = model.getWorldPosition(new THREE.Vector3())
  expect(world.x).toBeCloseTo(4, 6)
  expect(world.z).toBeCloseTo(4, 6)
})

test('AC: SPEC-G/T-063/AC-2 - salto parabólico: extremos exactos y pico 0,35 a mitad de tramo', () => {
  const from = { x: 0, z: 0 }
  const to = { x: 1, z: 2 }
  const start = hopPosition(from, to, 0)
  expect(start.x).toBeCloseTo(0, 6)
  expect(start.z).toBeCloseTo(0, 6)
  expect(start.y).toBeCloseTo(0, 6)
  const end = hopPosition(from, to, 1)
  expect(end.x).toBeCloseTo(1, 6)
  expect(end.z).toBeCloseTo(2, 6)
  expect(end.y).toBeCloseTo(0, 6)
  const mid = hopPosition(from, to, 0.5)
  expect(mid.x).toBeCloseTo(0.5, 6)
  expect(mid.z).toBeCloseTo(1, 6)
  expect(mid.y).toBeCloseTo(BOARD3D.token.hopHeight, 6)
  // Simetría de la parábola alrededor de t=0,5.
  expect(hopPosition(from, to, 0.25).y).toBeCloseTo(hopPosition(from, to, 0.75).y, 6)
})

test('AC: caminata-ficha/AC-1 - paso más lento: 1x=320 ms, 2x=160, skip/reduced=0', () => {
  expect(BOARD3D.token.stepMs).toBe(320)
  expect(stepMsFor('1x', false)).toBeCloseTo(BOARD3D.token.stepMs, 6)
  expect(stepMsFor('2x', false)).toBeCloseTo(BOARD3D.token.stepMs / 2, 6)
  expect(stepMsFor('skip', false)).toBe(0)
  expect(stepMsFor('1x', true)).toBe(0)
})

test('AC: quitar-tambaleo/AC-1 - sin vaivén lateral: ficha y onFrame exactamente en el hop', async () => {
  const token = buildToken('p1', 0)
  const waypoints = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }]
  const frames: THREE.Vector3[] = []
  const cam: THREE.Vector3[] = []
  await moveTokenAlong({
    token,
    waypoints,
    stepMs: BOARD3D.token.stepMs,
    groundY: BOARD3D.token.lift,
    framesPerStep: 8,
    delay: async () => {
      frames.push(token.position.clone())
    },
    onFrame: (position) => {
      cam.push(position.clone())
    },
  })
  expect(frames.length).toBe(16)
  expect(cam.length).toBe(17) // 16 frames + llegada final.
  frames.forEach((frame, i) => {
    const from = waypoints[Math.floor(i / 8)]
    const to = waypoints[Math.floor(i / 8) + 1]
    if (from === undefined || to === undefined) throw new Error('frame fuera de rango')
    const hop = hopPosition(from, to, ((i % 8) + 1) / 8)
    // Posición de la ficha == hop exacto (AC-1).
    expect(frame.x).toBeCloseTo(hop.x, 6)
    expect(frame.y).toBeCloseTo(BOARD3D.token.lift + hop.y, 6)
    expect(frame.z).toBeCloseTo(hop.z, 6)
    // Componente perpendicular al tramo = 0 (sin vaivén lateral).
    const dx = to.x - from.x
    const dz = to.z - from.z
    expect(((frame.x - from.x) * -dz + (frame.z - from.z) * dx) / Math.hypot(dx, dz)).toBeCloseTo(
      0,
      6,
    )
    // AC-4: el foco de cámara (onFrame) recibe la misma posición del camino.
    const focus = cam[i]
    if (focus === undefined) throw new Error('falta onFrame')
    expect(focus.x).toBeCloseTo(hop.x, 6)
    expect(focus.z).toBeCloseTo(hop.z, 6)
  })
})

test('AC: SPEC-G/T-063/AC-3 - la promesa resuelve al llegar con la ficha exacta en el destino', async () => {
  const token = buildToken('p1', 0)
  const target = nodePos('paleta')
  let frames = 0
  await moveTokenAlong({
    token,
    waypoints: [nodePos('paleta'), { x: target.x + 0.4, z: target.z }, target],
    stepMs: BOARD3D.token.stepMs,
    groundY: BOARD3D.token.lift,
    delay: async () => {
      frames += 1
    },
  })
  expect(frames).toBeGreaterThan(0)
  expect(token.position.x).toBeCloseTo(target.x, 6)
  expect(token.position.z).toBeCloseTo(target.z, 6)
  expect(token.position.y).toBeCloseTo(BOARD3D.token.lift, 6)
})

test('AC: caminata-ficha/AC-4 - con skip/reducedMotion salta directo: sin frames', async () => {
  const token = buildToken('p1', 0)
  const target = nodePos('paleta')
  let frames = 0
  await moveTokenAlong({
    token,
    waypoints: [{ x: target.x - 0.3, z: target.z }, target],
    stepMs: 0,
    groundY: BOARD3D.token.lift,
    delay: async () => {
      frames += 1
    },
  })
  expect(frames).toBe(0)
  expect(token.position.x).toBeCloseTo(target.x, 6)
  expect(token.position.z).toBeCloseTo(target.z, 6)
  expect(token.position.y).toBeCloseTo(BOARD3D.token.lift, 6)
})

test('AC: SPEC-G/T-063/AC-4 - tras el movimiento: posición mundial = nodo destino (ε 0,01) e inViewport', async () => {
  const path = ['paleta', ...board.edges.filter(([from]) => from === 'paleta').map(([, to]) => to)]
  expect(path.length).toBeGreaterThanOrEqual(2)
  const destination = path[path.length - 1]
  if (destination === undefined) throw new Error('camino sin destino')

  // Estado ya movido (como llega por props): p1 en el destino, p2 queda en paleta.
  const movedSpecs = [
    { id: 'p1', nodeId: destination, spriteUrl: null },
    { id: 'p2', nodeId: 'paleta', spriteUrl: null },
  ]
  const targets = tokenTargetPos(movedSpecs, board, imageSize)
  const final = targets.get('p1')
  if (final === undefined) throw new Error('falta el destino de p1')

  const group = createTokensGroup()
  const tokens = syncTokens(
    group,
    [
      { id: 'p1', nodeId: 'paleta', spriteUrl: null },
      { id: 'p2', nodeId: 'paleta', spriteUrl: null },
    ],
    board,
    imageSize,
  )
  const token = tokens.get('p1')
  if (token === undefined) throw new Error('falta la ficha p1')

  boardScene.root.add(group)
  const centers = path.map((id) => nodePos(id))
  await moveTokenAlong({
    token,
    waypoints: [...centers.slice(0, -1), final],
    stepMs: 0,
    groundY: BOARD3D.token.lift,
    delay: async () => undefined,
  })

  const target = nodePos(destination)
  expect(Math.abs(token.position.x - final.x)).toBeLessThanOrEqual(0.01)
  expect(Math.abs(token.position.z - final.z)).toBeLessThanOrEqual(0.01)
  expect(Math.hypot(final.x - target.x, final.z - target.z)).toBeLessThanOrEqual(
    BOARD3D.token.radialOffset + 0.01,
  )

  const aspect = 1440 / 900
  const plan = planOverview(BOARD3D.base.width / 2, BOARD3D.base.depth / 2, aspect)
  const camera = new THREE.PerspectiveCamera(plan.fovDeg, aspect, plan.near, plan.far)
  camera.position.set(plan.position[0], plan.position[1], plan.position[2])
  camera.lookAt(plan.target[0], plan.target[1], plan.target[2])
  camera.updateMatrixWorld(true)
  const dump = computeSceneDump([...group.children], camera, 1440, 900)
  for (const entry of dump) {
    expect(entry.inViewport, `${entry.name} debería verse en la vista inicial`).toBe(true)
  }
})

test('AC: SPEC-G/T-063/AC-5 - fichas que comparten nodo se reparten en círculo (radial)', () => {
  const targets = tokenTargetPos(
    [
      { id: 'p1', nodeId: 'oak_b', spriteUrl: null },
      { id: 'p2', nodeId: 'oak_b', spriteUrl: null },
    ],
    board,
    imageSize,
  )
  const center = nodePos('oak_b')
  const a = targets.get('p1')
  const b = targets.get('p2')
  if (a === undefined || b === undefined) throw new Error('faltan fichas en oak_b')
  // Cada ficha del nodo compartido queda a radialOffset del centro.
  expect(Math.hypot(a.x - center.x, a.z - center.z)).toBeCloseTo(BOARD3D.token.radialOffset, 6)
  expect(Math.hypot(b.x - center.x, b.z - center.z)).toBeCloseTo(BOARD3D.token.radialOffset, 6)
})

test('AC: caminata-ficha/AC-5 - ficha sola a soloOffset del centro, dirección determinista por índice', () => {
  const specs = [
    { id: 'p1', nodeId: 'paleta', spriteUrl: null },
    { id: 'p2', nodeId: 'oak_b', spriteUrl: null },
  ]
  const a = tokenTargetPos(specs, board, imageSize).get('p1')
  const b = tokenTargetPos(specs, board, imageSize).get('p2')
  const paleta = nodePos('paleta')
  const oak = nodePos('oak_b')
  if (a === undefined || b === undefined) throw new Error('faltan fichas sueltas')
  // NO en el centro exacto: a soloOffset, dirección por índice (0 ⇒ +x).
  expect(Math.hypot(a.x - paleta.x, a.z - paleta.z)).toBeCloseTo(BOARD3D.token.soloOffset, 6)
  expect(a.x).toBeCloseTo(paleta.x + BOARD3D.token.soloOffset, 6)
  expect(a.z).toBeCloseTo(paleta.z, 6)
  expect(Math.hypot(b.x - oak.x, b.z - oak.z)).toBeCloseTo(BOARD3D.token.soloOffset, 6)
  // Índice distinto ⇒ dirección distinta; determinista (sin Math.random).
  expect(Math.atan2(b.z - oak.z, b.x - oak.x)).not.toBeCloseTo(0, 6)
  expect(tokenTargetPos(specs, board, imageSize).get('p1')).toEqual(a)
})

test('AC: caminata-ficha/AC-6 - slots para 2..5 fichas: cualquier par a ≥ 2·baseRadius', () => {
  const center = nodePos('oak_b')
  for (let count = 2; count <= 5; count += 1) {
    const specs = Array.from({ length: count }, (_, i) => ({
      id: `p${i + 1}`,
      nodeId: 'oak_b',
      spriteUrl: null as string | null,
    }))
    const points = [...tokenTargetPos(specs, board, imageSize).values()]
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i]
      if (a === undefined) throw new Error('falta slot')
      expect(Math.hypot(a.x - center.x, a.z - center.z)).toBeCloseTo(BOARD3D.token.radialOffset, 6)
      for (let j = i + 1; j < points.length; j += 1) {
        const b = points[j]
        if (b === undefined) throw new Error('falta slot')
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(
          2 * BOARD3D.token.baseRadius,
        )
      }
    }
  }
})

test('AC: caminata-ficha/AC-7 - pawnColors cubre 5 jugadores sin repetir fallback', () => {
  const colors: readonly string[] = BOARD3D.token.pawnColors
  expect(colors.length).toBeGreaterThanOrEqual(5)
  expect(new Set(colors).size).toBe(colors.length)
  const token = buildToken('p5', 4)
  const pawn = token.children.find((child) => child.name === 'pawn') as THREE.Mesh
  const material = pawn.material as THREE.MeshToonMaterial
  expect(material.color.getHexString()).toBe(BOARD3D.token.pawnColors[4].slice(1))
})

test('AC: caminata-ficha/AC-9 - los números de la caminata viven en BOARD3D.token', () => {
  const { soloOffset, radialOffset, maxPlayers } = BOARD3D.token
  expect(soloOffset).toBeGreaterThan(0)
  expect(maxPlayers).toBeGreaterThanOrEqual(5)
  // radialOffset alcanza para 5 slots: cuerda 2·r·sin(π/5) ≥ 2·baseRadius.
  expect(2 * radialOffset * Math.sin(Math.PI / 5)).toBeGreaterThanOrEqual(
    2 * BOARD3D.token.baseRadius,
  )
})

test('AC: SPEC-G/T-063/AC-1 - el sprite mira a la cámara (billboard) y syncTokens reposiciona/limpia', () => {
  const group = createTokensGroup()
  const specs = [{ id: 'p1', nodeId: 'paleta', spriteUrl: null }]
  const tokens = syncTokens(group, specs, board, imageSize)
  const token = tokens.get('p1')
  if (token === undefined) throw new Error('falta p1 tras syncTokens')
  const paleta = nodePos('paleta')
  // Caminata-ficha/AC-5: ficha sola ⇒ a soloOffset del centro (no exacta).
  expect(Math.hypot(token.position.x - paleta.x, token.position.z - paleta.z)).toBeCloseTo(
    BOARD3D.token.soloOffset,
    6,
  )
  expect(token.position.y).toBeCloseTo(BOARD3D.token.lift, 6)

  const camera = new THREE.PerspectiveCamera()
  camera.quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 3, 0))
  setTokenSprite(token, new THREE.Texture())
  syncTokenSprites(group, camera)
  const sprite = token.children.find((child) => child.name === 'sprite') as THREE.Mesh
  expect(sprite.quaternion.equals(camera.quaternion)).toBe(true)

  const next = syncTokens(group, [{ id: 'p9', nodeId: 'paleta', spriteUrl: null }], board, imageSize)
  expect(group.children.find((child) => child.userData.tokenId === 'p1')).toBeUndefined()
  expect(next.get('p9')).toBeDefined()
})
