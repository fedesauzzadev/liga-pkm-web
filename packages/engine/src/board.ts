// API del tablero para el motor (SPEC-A/T-003): adyacencias precalculadas,
// consultas O(1). Sin DOM ni azar; los ids son strings hasta T-006 (tipos con marca).
import { buildAdjacency, type Adjacency } from '@liga/content'
import type { BoardGraph, BoardNode } from '@liga/content'

export class UnknownNodeError extends Error {
  constructor(id: string) {
    super(`nodo inexistente "${id}"`)
    this.name = 'UnknownNodeError'
  }
}

export interface BoardIndex {
  /** Nodo por id; lanza `UnknownNodeError` si no existe. */
  node(id: string): BoardNode
  /** Vecinos en orden de aristas del JSON (determinista). */
  neighbors(id: string): readonly string[]
  /** Todos los vecinos menos `cameFrom` (regla de no retroceder, RULES §2).
   *  `cameFrom === null` ⇒ todos los vecinos. En un callejón ⇒ `[]`. */
  forwardOptions(id: string, cameFrom: string | null): readonly string[]
  /** Forma cuadrada: se puede frenar al pasar (RULES §2). */
  isSquare(id: string): boolean
  /** Callejón: grado 1 ⇒ rebote al terminar los pasos (D-01). */
  isDeadEnd(id: string): boolean
  degree(id: string): number
  /** Cantidad de nodos (tope defensivo del planificador de movimiento). */
  nodeCount(): number
}

export function createBoardIndex(board: BoardGraph): BoardIndex {
  const nodes: ReadonlyMap<string, BoardNode> = new Map(board.nodes.map((n) => [n.id, n]))
  const adjacency: Adjacency = buildAdjacency(board)

  const neighborsOf = (id: string): readonly string[] => {
    const ns = adjacency.get(id)
    if (ns === undefined || !nodes.has(id)) throw new UnknownNodeError(id)
    return ns
  }

  return {
    node(id: string): BoardNode {
      const n = nodes.get(id)
      if (n === undefined) throw new UnknownNodeError(id)
      return n
    },
    neighbors: neighborsOf,
    forwardOptions(id: string, cameFrom: string | null): readonly string[] {
      const ns = neighborsOf(id)
      return cameFrom === null ? ns : ns.filter((n) => n !== cameFrom)
    },
    isSquare(id: string): boolean {
      return this.node(id).shape === 'square'
    },
    isDeadEnd(id: string): boolean {
      return neighborsOf(id).length === 1
    },
    degree(id: string): number {
      return neighborsOf(id).length
    },
    nodeCount(): number {
      return nodes.size
    },
  }
}

// Memo por tablero (§3: contenido indexado una vez): el contenido es inmutable,
// así que el índice se comparte entre comandos sin copias por paso.
const indexCache = new WeakMap<BoardGraph, BoardIndex>()

/** Índice memoizado del tablero para uso del motor en cada comando. */
export function boardIndexFor(board: BoardGraph): BoardIndex {
  const cached = indexCache.get(board)
  if (cached !== undefined) return cached
  const index = createBoardIndex(board)
  indexCache.set(board, index)
  return index
}
