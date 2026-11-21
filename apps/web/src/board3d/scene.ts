// Escena three pura del tablero (SPEC-G/T-062 + SPEC-H/T-067/T-069): construye
// la geometría con three (sin R3F ni DOM) para poder testearla numéricamente en
// node (NO-VISION). El mundo continuo (terreno/cielo/niebla) vive en world.ts;
// las piedras con glifos en stones.ts, el camino de tierra en paths.ts; acá
// pedestales de mazo y luces. El motor no cambia.
import type { BoardGraph, BoardNode, BoardStyle, Decor } from '@liga/content'
import { suppressedBuildingPieces } from '@liga/content'
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'
import type { PendingDecision } from '../board/Board'
import { glyphIdFor, type GlyphId } from './glyph'
import { buildLandmarks } from './landmarks'
import { leaderFlagColor } from './leaders'
import { boardPlacements, landmarkTransforms, solveBuildings } from './placements'
import { buildContactShadows, buildLights, sceneSunTo } from './lighting'
import { buildOutlines } from './outlines'
import { buildEdgeMeshes, buildPebbles, type EdgeSpec } from './paths'
import { fnv1a, rngSeq } from './rand'
import { buildScatter } from './scatter'
import { decorPlanFor } from './decor/plan'
import { boardStyle } from './style'
import { buildNodeStone, deckColorOf } from './stones'
import type { DeckStacksFile } from './stacks'
import { buildWorld, type WorldInput, type WorldScene } from './world'

export interface WorldPos {
  readonly x: number
  readonly z: number
}

export interface BoardScene {
  readonly root: THREE.Group
  readonly nodes: ReadonlyMap<string, THREE.Group>
  readonly stacks: ReadonlyMap<string, THREE.Group>
  readonly world: WorldScene
  /** Guijarros del camino (AC-3): instancias a los lados de las aristas. */
  readonly pebbles: THREE.InstancedMesh
  /** Piezas de landmark por nodo (T-068/AC-2) y relleno de zonas (AC-3). */
  readonly landmarks: THREE.Group
  readonly scatter: THREE.Group
  /** T-080: hemi + sol con sombras que siguen a la ficha (AC-2). */
  readonly hemi: THREE.HemisphereLight
  readonly sun: THREE.DirectionalLight
  readonly sunTarget: THREE.Object3D
  /** T-080/AC-4: contornos de onlyKinds (visible según profiles.*). */
  readonly outlines: THREE.Group
  /** T-080/AC-2: sombras de contacto bajo edificios y árboles. */
  readonly contacts: THREE.InstancedMesh
}

/** Fábrica de texturas de glifo (inyectada: cacheada en runtime, stub en tests). */
export type GlyphTextureOf = (id: GlyphId) => THREE.Texture | undefined

export interface BuildSceneOptions {
  readonly glyphTextures?: GlyphTextureOf
}

export interface HighlightSpec {
  readonly clickable: ReadonlySet<string>
  readonly ringed: ReadonlySet<string>
}

/** 1 px = 0,01 u; origen en el centro del tablero; y del tablero → z del mundo. */
export function pxToWorld(xPx: number, yPx: number, imageSize: readonly [number, number] | undefined): WorldPos {
  const width = imageSize?.[0] ?? 1176
  const height = imageSize?.[1] ?? 1600
  return {
    x: (xPx - width / 2) * BOARD3D.pxToUnits,
    z: (yPx - height / 2) * BOARD3D.pxToUnits,
  }
}

export const nodeWorldPos = (node: BoardNode, imageSize: readonly [number, number] | undefined): WorldPos =>
  pxToWorld(node.x, node.y, imageSize)

const standard = (color: string): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 })

/** RNG determinista (LCG) sembrado con FNV-1a: las pilas son reproducibles. */
const buildStack = (key: string, world: WorldPos, baseY: number): THREE.Group => {
  const group = new THREE.Group()
  group.name = `stack:${key}`
  group.position.set(world.x, baseY, world.z)

  for (let index = 0; index < BOARD3D.card.count; index += 1) {
    const rng = rngSeq(fnv1a(`${BOARD3D.card.seed}:${key}:${index}`))
    const card = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD3D.card.width, BOARD3D.card.height, BOARD3D.card.depth),
      standard(BOARD3D.card.color),
    )
    card.name = `card:${index}`
    const jitter = (value: number): number => value * (rng() * 2 - 1)
    card.position.set(
      jitter(BOARD3D.card.jitter.x),
      (index + 0.5) * BOARD3D.card.height,
      jitter(BOARD3D.card.jitter.z),
    )
    card.rotation.y = jitter(BOARD3D.card.jitter.rotY)
    group.add(card)
  }

  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(BOARD3D.blob.radius, 24),
    new THREE.MeshBasicMaterial({
      color: BOARD3D.blob.color,
      transparent: true,
      opacity: BOARD3D.blob.opacity,
      depthWrite: false,
    }),
  )
  blob.name = 'blob'
  blob.rotation.x = -Math.PI / 2
  blob.position.y = BOARD3D.world.pedestal.height + 0.004
  group.add(blob)
  return group
}

/** AC-2 (SPEC-H/T-069): cada mazo es una piedra baja con aro del color. */
const buildPedestal = (key: string, world: WorldPos, color: string): THREE.Group => {
  const spec = BOARD3D.world.pedestal
  const group = new THREE.Group()
  group.name = `pedestal:${key}`
  group.position.set(world.x, 0, world.z)

  const stone = new THREE.Mesh(
    new THREE.CylinderGeometry(spec.radius, spec.radius * 1.08, spec.height, 8),
    standard(spec.color),
  )
  stone.name = 'stone'
  stone.position.y = spec.height / 2
  group.add(stone)

  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(spec.radius - spec.ringInset, spec.radius - spec.ringInset, spec.ringHeight, 8),
    standard(color),
  )
  ring.name = 'ring'
  ring.position.y = spec.height + spec.ringHeight / 2
  group.add(ring)
  return group
}

/** Stack + pedestal comparten el nivel de apoyo de las cartas (AC-2). */
const stackTopY = (): number =>
  BOARD3D.world.pedestal.height + BOARD3D.world.pedestal.ringHeight

/** Datos del mundo continuo (world.ts) a partir del grafo, los mazos, style.json
 * y el plan de decoración (T-095): el lago del terreno usa la posición/radio
 * del cuerpo de agua planificado (null si no entró ⇒ sin lago). */
export function buildWorldInput(
  board: BoardGraph,
  stacks: DeckStacksFile,
  decor: Decor,
  style: BoardStyle = boardStyle,
): WorldInput {
  const imageSize = board.meta.imageSize
  const nodeById = new Map(board.nodes.map((node) => [node.id, node]))
  const plan = decorPlanFor(board, stacks, decor)
  return {
    decor,
    style,
    lake: plan.water.find((water) => water.zone === BOARD3D.world.lake.zone) ?? null,
    nodes: board.nodes.map((node) => {
      const world = nodeWorldPos(node, imageSize)
      return { id: node.id, x: world.x, z: world.z }
    }),
    edges: board.edges.flatMap(([fromId, toId]) => {
      const from = nodeById.get(fromId)
      const to = nodeById.get(toId)
      if (from === undefined || to === undefined) return []
      return [{ a: nodeWorldPos(from, imageSize), b: nodeWorldPos(to, imageSize) }]
    }),
    // T-079/AC-1: el color de cada bioma vive en style.json (zones.*.ground murió).
    biomes: stacks.panels.flatMap((panel) => {
      const zone = Object.values(decor.zones).find((entry) => entry.panel === panel.key)
      if (zone === undefined) return []
      const center = pxToWorld(panel.x, panel.y, imageSize)
      return [{ key: panel.key, center, ground: style.biomes.colors[panel.key] ?? style.biomes.baseGrass }]
    }),
  }
}

export function buildBoardScene(
  board: BoardGraph,
  stacks: DeckStacksFile,
  decor: Decor,
  options?: BuildSceneOptions,
): BoardScene {
  const root = new THREE.Group()
  root.name = 'board3d'
  const imageSize = board.meta.imageSize

  const worldInput = buildWorldInput(board, stacks, decor)
  const world = buildWorld(worldInput)
  root.add(world.root)

  // SPEC-O/T-095: TODO el relleno sale del plan de ocupación único y los
  // landmarks pisados por edificios del solver se ocultan.
  const plan = decorPlanFor(board, stacks, decor)
  const transforms = landmarkTransforms(board, decor, solveBuildings(board, stacks))
  const landmarks = buildLandmarks(
    worldInput, board, decor, leaderFlagColor, transforms,
    new Set(plan.hiddenLandmarks),
    // SPEC-P/T-099/AC-B1: placements.proceduralBuildings=false ⇒ sin cajas
    // procedurales de gym/pokecenter/market/league/lab (cubre la Liga).
    suppressedBuildingPieces(boardPlacements),
  )
  root.add(landmarks)
  const scatter = buildScatter(worldInput, plan)
  root.add(scatter)

  // T-080: contornos (AC-4) y sombras de contacto (AC-2) sobre los landmarks.
  const outlines = buildOutlines(landmarks, boardStyle)
  root.add(outlines)
  const contacts = buildContactShadows(landmarks, boardStyle)
  root.add(contacts)

  const stackMap = new Map<string, THREE.Group>()
  for (const panel of stacks.panels) {
    const center = pxToWorld(panel.x, panel.y, imageSize)
    root.add(buildPedestal(panel.key, center, deckColorOf(panel.deck)))
    const stack = buildStack(panel.key, center, stackTopY())
    root.add(stack)
    stackMap.set(panel.key, stack)
  }

  // AC-2/AC-6: un material (y una textura) por glifo, compartido entre nodos.
  const glyphMaterials = new Map<GlyphId, THREE.Material>()
  const glyphMaterialFor = (id: GlyphId): THREE.Material | undefined => {
    const cached = glyphMaterials.get(id)
    if (cached !== undefined) return cached
    const texture = options?.glyphTextures?.(id)
    if (texture === undefined) return undefined
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
    glyphMaterials.set(id, material)
    return material
  }

  const nodeMap = new Map<string, THREE.Group>()
  for (const node of board.nodes) {
    const glyphId = glyphIdFor(node)
    const pivot = buildNodeStone(node, nodeWorldPos(node, imageSize), glyphId !== null ? glyphMaterialFor(glyphId) : undefined)
    nodeMap.set(node.id, pivot)
    root.add(pivot)
  }

  // AC-3: camino de tierra (cinta + falda) y guijarros instanciados.
  const edgeSpecs: EdgeSpec[] = []
  const nodeById = new Map(board.nodes.map((node) => [node.id, node]))
  for (const [fromId, toId] of board.edges) {
    const from = nodeById.get(fromId)
    const to = nodeById.get(toId)
    if (from === undefined || to === undefined) continue
    const spec: EdgeSpec = { key: `${fromId}-${toId}`, a: nodeWorldPos(from, imageSize), b: nodeWorldPos(to, imageSize) }
    edgeSpecs.push(spec)
    const { main, soft } = buildEdgeMeshes(spec)
    root.add(main)
    root.add(soft)
  }
  const pebbles = buildPebbles(edgeSpecs, decor.palette.rock ?? '#8C8577')
  root.add(pebbles)

  // T-090/AC-1: los pedestales Ítem/Sorpresa ya no se renderizan (removeStacks).

  // T-080/AC-2: hemi cielo/suelo + sol cálida con sombras (style.json).
  const { hemi, sun, target } = buildLights(boardStyle)
  root.add(hemi, sun, target)
  sceneSunTo({ sun }, 0, 0, boardStyle.lighting.directional.from)

  return { root, nodes: nodeMap, stacks: stackMap, world, pebbles, landmarks, scatter, hemi, sun, sunTarget: target, outlines, contacts }
}

/** AC-5: aplica el perfil (high/low de style.json) a sombras y contornos. */
export function applySceneProfile(scene: BoardScene, lowProfile: boolean): void {
  const profile = lowProfile ? boardStyle.profiles.low : boardStyle.profiles.high
  scene.sun.castShadow = profile.shadows
  scene.outlines.visible = profile.outlines && boardStyle.lighting.outlines.enabled
  scene.contacts.visible = profile.shadows
}

/** T-080/AC-2: apunta el sol (y su sombra) a la posición de la ficha activa. */
export function sunFollow(scene: BoardScene, x: number, z: number): void {
  sceneSunTo({ sun: scene.sun }, x, z, boardStyle.lighting.directional.from)
}

/** Etiquetas de nodo (T-078): todo nodo con `label`; la visibilidad y la
 * prioridad las decide labels.ts con content/board/style.json (SPEC-J). */
export function boardLabels(board: BoardGraph): readonly BoardNode[] {
  return board.nodes.filter((node) => typeof node.label === 'string' && node.label.length > 0)
}

/** Aro + clicabilidad: solo lo que ofrece el pending (AC-10). */
export function highlightFor(pending: PendingDecision, position: string): HighlightSpec {
  if (pending?.type === 'ChoosePath') {
    const options = new Set(pending.options)
    return { clickable: options, ringed: options }
  }
  if (pending?.type === 'StopOrContinue') {
    return { clickable: new Set<string>(), ringed: new Set([position]) }
  }
  return { clickable: new Set<string>(), ringed: new Set<string>() }
}

export function setHighlights(scene: BoardScene, spec: HighlightSpec): void {
  for (const [id, pivot] of scene.nodes) {
    const ring = pivot.children.find((child) => child.name === 'ring')
    if (ring !== undefined) ring.visible = spec.ringed.has(id)
    pivot.userData.clickable = spec.clickable.has(id)
  }
}
