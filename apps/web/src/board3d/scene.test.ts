// AC: SPEC-G/T-062 + SPEC-H/T-069 — tablero 3D: geometría, colores, pilas,
// pedestales, mundo continuo, luces y resaltado, todo verificado numéricamente
// (NO-VISION). La caja base y los paneles de T-062/AC-1 los reemplazó el
// mundo continuo de T-069 (SPEC-H).
import { expect, test } from 'vitest'
import { BoardGraphSchema, type BoardGraph, type BoardNode } from '@liga/content'
import * as THREE from 'three'
import kantoJson from '../../../../content/board/kanto.json'
import { BOARD3D } from '../theme/board3d'
import { boardDecor } from './decor'
import { boardLabels, buildBoardScene, highlightFor, nodeWorldPos, setHighlights } from './scene'
import { boardStyle } from './style'
import { deckStacks } from './stacks'

const board: BoardGraph = BoardGraphSchema.parse(kantoJson)
const scene = buildBoardScene(board, deckStacks, boardDecor)

const geometryOf = (mesh: THREE.Mesh): Record<string, number> =>
  (mesh.geometry as THREE.BoxGeometry & THREE.CylinderGeometry).parameters as unknown as Record<string, number>

const num = (params: Record<string, number>, key: string): number => {
  const value = params[key]
  if (value === undefined) throw new Error(`la geometría no tiene ${key}`)
  return value
}

test('AC: SPEC-H/T-069/AC-1+AC-2 - mundo continuo: terreno del decor, sin caja base ni paneles; cada mazo en pedestal', () => {
  const terrain = scene.world.terrain.geometry as THREE.PlaneGeometry
  expect(terrain.parameters.width).toBeCloseTo(boardStyle.world.size[0], 6)
  expect(terrain.parameters.height).toBeCloseTo(boardStyle.world.size[1], 6)
  expect(terrain.parameters.widthSegments).toBe(boardStyle.world.segments)
  expect(scene.root.getObjectByName('base')).toBeUndefined()
  expect(scene.root.children.filter((child) => child.name.startsWith('panel:'))).toEqual([])

  const stackTop = BOARD3D.world.pedestal.height + BOARD3D.world.pedestal.ringHeight
  const ringColorOf = (key: string): string =>
    BOARD3D.deckColors[key as keyof typeof BOARD3D.deckColors].toLowerCase().slice(1)
  // T-090/AC-1: solo los 5 paneles de terreno; Ítem/Sorpresa ya no existen.
  const keys = deckStacks.panels.map((panel) => panel.key)
  expect(new Set(keys)).toEqual(new Set(['llanura', 'pantano', 'isla', 'bosque', 'montana']))
  expect(scene.root.getObjectByName('pedestal:item')).toBeUndefined()
  expect(scene.root.getObjectByName('pedestal:sorpresa')).toBeUndefined()
  expect(scene.stacks.has('item')).toBe(false)
  expect(scene.stacks.has('sorpresa')).toBe(false)
  for (const key of keys) {
    const pedestal = scene.root.getObjectByName(`pedestal:${key}`)
    expect(pedestal, `falta pedestal:${key}`).toBeDefined()
    const stone = pedestal?.children.find((child) => child.name === 'stone') as THREE.Mesh | undefined
    const ring = pedestal?.children.find((child) => child.name === 'ring') as THREE.Mesh | undefined
    expect(stone, `falta stone en pedestal:${key}`).toBeDefined()
    expect(ring, `falta ring en pedestal:${key}`).toBeDefined()
    const stoneParams = (stone?.geometry as THREE.CylinderGeometry).parameters
    expect(stoneParams.radiusTop).toBeCloseTo(BOARD3D.world.pedestal.radius, 5)
    const material = ring?.material as THREE.MeshStandardMaterial
    expect(material.color.getHexString().toLowerCase()).toBe(ringColorOf(key))
    const stack = scene.stacks.get(key)
    expect(stack?.position.y, `pila ${key} sobre el pedestal`).toBeCloseTo(stackTop, 6)
  }
})

test('AC: SPEC-G/AC-2 + SPEC-H/T-067/AC-1 - piedras biseladas por nodo (bbox del tema) con aro superior del color tipo/mazo; camino de 0,16', () => {
  const nodes = new Map(board.nodes.map((node) => [node.id, node]))
  expect(scene.nodes.size).toBe(board.nodes.length)
  for (const [id, pivot] of scene.nodes) {
    const node = nodes.get(id)
    if (node === undefined) throw new Error(`nodo ${id} no está en el grafo`)
    const stone = pivot.children.find((child) => child.name === 'stone') as THREE.Mesh | undefined
    if (stone === undefined) throw new Error(`falta stone en nodo ${id}`)
    stone.geometry.computeBoundingBox()
    const box = stone.geometry.boundingBox as THREE.Box3
    expect(box.max.x - box.min.x, `${id} ancho`).toBeCloseTo(BOARD3D.node.radius * 2, 2)
    expect(box.max.z - box.min.z, `${id} profundo`).toBeCloseTo(BOARD3D.node.radius * 2, 2)
    expect(box.max.y - box.min.y, `${id} alto`).toBeCloseTo(BOARD3D.node.height, 5)
    expect(box.min.y, `${id} apoyada en el terreno`).toBeGreaterThanOrEqual(-1e-6)
    expect(box.max.y).toBeLessThanOrEqual(BOARD3D.node.height + 1e-6)

    const topring = pivot.children.find((child) => child.name === 'topring') as THREE.Mesh | undefined
    if (topring === undefined) throw new Error(`falta topring en nodo ${id}`)
    const expected = node.type === 'deck' && node.deck !== undefined
      ? BOARD3D.deckColors[node.deck as keyof typeof BOARD3D.deckColors].toLowerCase()
      : BOARD3D.nodeColors[node.type].toLowerCase()
    expect(`#${(topring.material as THREE.MeshBasicMaterial).color.getHexString()}`).toBe(expected)
    expect(topring.position.y).toBeGreaterThan(BOARD3D.node.height - 1e-6)
  }

  const ribbons = scene.root.children.filter((child) => child.name.startsWith('edge:'))
  expect(ribbons.length).toBe(board.edges.length)
  for (const ribbon of ribbons) {
    expect(num(geometryOf(ribbon as THREE.Mesh), 'depth')).toBeCloseTo(BOARD3D.edge.width, 5)
  }
})

test('AC: SPEC-J/T-078/AC-2 - etiquetas para todo nodo con label (la prioridad la decide la visibilidad)', () => {
  const labels = boardLabels(board)
  const labeled = new Set(labels.map((node) => node.id))
  for (const node of board.nodes) {
    const wants = typeof node.label === 'string' && node.label.length > 0
    expect(labeled.has(node.id), `${node.id} (${node.type})`).toBe(wants)
  }
  expect(labels.length).toBeGreaterThan(0)
})

test('AC: SPEC-G/AC-4 - pila de 12 cartas 0,63×0,02×1,0 por mazo, con desorden determinista y acotado', () => {
  const stackKeys = deckStacks.panels.map((panel) => panel.key)
  expect(scene.stacks.size).toBe(stackKeys.length)
  for (const [key, group] of scene.stacks) {
    const cards = group.children.filter((child) => child.name.startsWith('card:')) as THREE.Mesh[]
    expect(cards.length, `cartas en pila ${key}`).toBe(BOARD3D.card.count)
    expect(group.position.y).toBeCloseTo(
      BOARD3D.world.pedestal.height + BOARD3D.world.pedestal.ringHeight,
      6,
    )
    cards.forEach((card, index) => {
      const params = geometryOf(card)
      expect(num(params, 'width')).toBeCloseTo(BOARD3D.card.width, 5)
      expect(num(params, 'height')).toBeCloseTo(BOARD3D.card.height, 5)
      expect(num(params, 'depth')).toBeCloseTo(BOARD3D.card.depth, 5)
      expect(card.position.y).toBeCloseTo((index + 0.5) * BOARD3D.card.height, 6)
      expect(Math.abs(card.position.x)).toBeLessThanOrEqual(BOARD3D.card.jitter.x + 1e-6)
      expect(Math.abs(card.position.z)).toBeLessThanOrEqual(BOARD3D.card.jitter.z + 1e-6)
      expect(Math.abs(card.rotation.y)).toBeLessThanOrEqual(BOARD3D.card.jitter.rotY + 1e-6)
    })
  }
  const again = buildBoardScene(board, deckStacks, boardDecor)
  for (const [key, group] of scene.stacks) {
    const other = again.stacks.get(key)
    if (other === undefined) throw new Error(`pila ${key} no se reconstruyó`)
    group.children.forEach((card, index) => {
      const rebuilt = other.children[index]
      if (rebuilt === undefined) throw new Error(`carta ${index} faltante`)
      expect(card.position.x).toBeCloseTo(rebuilt.position.x, 12)
      expect(card.position.z).toBeCloseTo(rebuilt.position.z, 12)
      expect(card.rotation.y).toBeCloseTo(rebuilt.rotation.y, 12)
    })
  }
})

test('AC: SPEC-J/T-080/AC-2 - hemi cielo/suelo + sol cálida del style con sombras; blobs sin mapas de sombra', () => {
  expect(scene.root.children.find((child) => child.type === 'AmbientLight')).toBeUndefined()
  const hemi = scene.root.children.find((child) => child.type === 'HemisphereLight') as THREE.HemisphereLight
  expect(hemi?.intensity).toBeCloseTo(boardStyle.lighting.hemisphere.intensity, 5)
  expect(`#${hemi?.color.getHexString()}`).toBe(boardStyle.lighting.hemisphere.sky.toLowerCase())
  expect(`#${hemi?.groundColor.getHexString()}`).toBe(boardStyle.lighting.hemisphere.ground.toLowerCase())
  expect(hemi?.castShadow).toBe(false)

  const sun = scene.root.children.find((child) => child.name === 'sun') as THREE.DirectionalLight
  expect(sun?.intensity).toBeCloseTo(boardStyle.lighting.directional.intensity, 5)
  expect(`#${sun?.color.getHexString()}`).toBe(boardStyle.lighting.directional.color.toLowerCase())
  expect(sun?.castShadow).toBe(true)
  expect(sun?.shadow.mapSize.width).toBe(boardStyle.lighting.directional.shadowMapSize)

  for (const group of scene.stacks.values()) {
    const blob = group.children.find((child) => child.name === 'blob') as THREE.Mesh | undefined
    expect(blob, 'blob bajo cada pila').toBeDefined()
    const material = blob?.material as THREE.MeshBasicMaterial
    expect(material.transparent).toBe(true)
    expect(material.opacity).toBeCloseTo(BOARD3D.blob.opacity, 5)
  }
})

test('AC: SPEC-G/AC-7 - Canvas bajo demanda (frameloop demand); dpr según perf de camera.json (T-076)', () => {
  expect(BOARD3D.canvas.frameloop).toBe('demand')
})

test('AC: SPEC-G/AC-10 - aro y clicabilidad solo en casilleros ofrecidos por pending', () => {
  const at = (id: string): { ring: boolean; clickable: boolean } => {
    const pivot = scene.nodes.get(id)
    if (pivot === undefined) throw new Error(`nodo ${id} faltante`)
    const ring = pivot.children.find((child) => child.name === 'ring')
    return {
      ring: ring?.visible ?? false,
      clickable: pivot.userData.clickable === true,
    }
  }

  setHighlights(scene, highlightFor({ type: 'ChoosePath', options: ['oak_b', 'verde'] }, 'paleta'))
  expect(at('oak_b')).toEqual({ ring: true, clickable: true })
  expect(at('verde')).toEqual({ ring: true, clickable: true })
  expect(at('paleta')).toEqual({ ring: false, clickable: false })
  expect(at('centro_b')).toEqual({ ring: false, clickable: false })

  setHighlights(scene, highlightFor({ type: 'StopOrContinue' }, 'oak_b'))
  expect(at('oak_b')).toEqual({ ring: true, clickable: false })
  expect(at('paleta')).toEqual({ ring: false, clickable: false })

  setHighlights(scene, highlightFor(null, 'paleta'))
  expect(at('paleta')).toEqual({ ring: false, clickable: false })
})

test('AC: SPEC-G/AC-2 - mapeo 1 px = 0,01 u con origen en el centro y y→z', () => {
  const size = board.meta.imageSize ?? [1176, 1600]
  const paleta = board.nodes.find((node) => node.id === 'paleta') as BoardNode | undefined
  if (paleta === undefined) throw new Error('paleta falta en kanto.json')
  const world = nodeWorldPos(paleta, size)
  expect(world.x).toBeCloseTo((paleta.x - size[0] / 2) * BOARD3D.pxToUnits, 6)
  expect(world.z).toBeCloseTo((paleta.y - size[1] / 2) * BOARD3D.pxToUnits, 6)
  const pivot = scene.nodes.get('paleta')
  expect(pivot?.position.x).toBeCloseTo(world.x, 6)
  expect(pivot?.position.z).toBeCloseTo(world.z, 6)
})
