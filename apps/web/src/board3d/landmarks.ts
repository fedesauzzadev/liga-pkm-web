// Landmarks de decoración (SPEC-H/T-068/AC-2): piezas colocadas relativas a
// un nodo — byNodeId (Pueblo Paleta) y byNodeType (centro ⇒ pokecenter,
// mercado ⇒ market, oak ⇒ lab, gym ⇒ gym con bandera del líder). El listado
// y los transforms son puros y viven en @liga/content (SPEC-O/T-095); acá
// solo la construcción three. La altura de apoyo sale del terreno
// (terrainHeightAt), determinista.
import type { BoardGraph, Decor, DecorKind } from '@liga/content'
import { categoryOfKind, landmarkEntriesFor, type LandmarkEntry, type LandmarkTransform } from '@liga/content'
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'
import { buildDecorPiece } from './decor/registry'
import type { WorldInput } from './world'
import { terrainHeightAt } from './world'

export interface PlacedLandmark {
  readonly nodeId: string
  readonly index: number
  readonly piece: LandmarkEntry['piece']
}

export type { LandmarkTransform }

/** Piezas que corresponden a cada nodo: byNodeId primero, luego byNodeType
 *  (misma fuente que el plan: @liga/content landmarkEntriesFor). */
export function landmarksFor(board: BoardGraph, decor: Decor): readonly PlacedLandmark[] {
  return landmarkEntriesFor(board, decor)
}

/**
 * AC-2/AC-6: grupo con todas las piezas de landmark — `landmark:<node>:<kind>:<i>`
 * apoyadas en el terreno, con `userData.nodeId` para el sceneDump.
 * T-095: las piezas pisadas por algo de mayor prioridad (edificios del solver)
 * no se construyen — el mapa de ocupación manda.
 * SPEC-P/T-099/AC-B1: `suppressed` (suppressedBuildingPieces de @liga/content)
 * saca del todo las piezas procedural de gym/pokecenter/market/league/lab —
 * si el modelo falta, no hay caja negra de relleno; el warn lo emite la capa
 * de modelos. `userData.source = "procedural"` alimenta el sceneDump (AC-B3).
 */
export function buildLandmarks(
  input: WorldInput,
  board: BoardGraph,
  decor: Decor,
  leaderFlagOf: (nodeId: string) => string,
  transforms: ReadonlyMap<string, LandmarkTransform>,
  hidden: ReadonlySet<string> = new Set<string>(),
  suppressed: ReadonlySet<DecorKind> = new Set<DecorKind>(),
): THREE.Group {
  const root = new THREE.Group()
  root.name = 'landmarks'
  const nodePos = new Map(input.nodes.map((node) => [node.id, node]))

  for (const placed of landmarksFor(board, decor)) {
    if (hidden.has(`${placed.nodeId}:${placed.index}`)) continue
    const { piece } = placed
    if (suppressed.has(piece.kind)) continue
    const anchor = nodePos.get(placed.nodeId)
    if (anchor === undefined) continue
    const flag = piece.flagFromLeader === true ? leaderFlagOf(placed.nodeId) : piece.flag
    const group = buildDecorPiece(
      {
        kind: piece.kind,
        variant: piece.variant,
        wall: piece.wall,
        roof: piece.roof,
        glow: piece.glow,
        length: piece.length,
        text: piece.text,
        radius: piece.radius,
        ...(flag === undefined ? {} : { flag }),
      },
      decor.palette,
    )
    group.name = `landmark:${placed.nodeId}:${piece.kind}:${placed.index}`
    group.userData = {
      ...group.userData,
      nodeId: placed.nodeId,
      category: categoryOfKind(piece.kind) ?? undefined,
      source: 'procedural',
    }
    // T-091/AC-2: la pieza primaria de un edificio reubicado usa x/z/yaw/escala
    // del solver; las demás piezas quedan relativas al nodo como hasta ahora.
    const transform = transforms.get(`${placed.nodeId}:${placed.index}`)
    const x = transform?.x ?? anchor.x + piece.offset[0]
    const z = transform?.z ?? anchor.z + piece.offset[1]
    group.position.set(x, terrainHeightAt(x, z, input) + BOARD3D.decor.scatter.lift, z)
    group.rotation.y = transform?.rotY ?? piece.rotY ?? 0
    group.scale.setScalar(transform?.buildingScale ?? piece.scale ?? 1)
    root.add(group)
  }
  return root
}
