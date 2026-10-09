// Grafo puro del tablero: adyacencias precalculadas en Map (ENGINEERING-STANDARDS §1/§3).
// Sin zod ni fs: lo usan el validador (frío) y el motor (caliente).
import type { BoardGraph } from './board.ts'

export type Adjacency = ReadonlyMap<string, readonly string[]>

/**
 * Adyacencia no dirigida por nodo, en orden de aparición de las aristas
 * (determinista: el JSON fija el orden). El validador garantiza aristas únicas
 * y sin extremos inexistentes antes de que el motor la consuma.
 */
export function buildAdjacency(board: BoardGraph): Adjacency {
  const adj = new Map<string, string[]>(board.nodes.map((n) => [n.id, []]))
  for (const [a, b] of board.edges) {
    const la = adj.get(a)
    const lb = adj.get(b)
    if (la !== undefined) la.push(b)
    if (lb !== undefined) lb.push(a)
  }
  return adj
}

/** Nodos alcanzables desde `from` (BFS). `from` debe existir en la adyacencia. */
export function reachableFrom(adjacency: Adjacency, from: string): Set<string> {
  const seen = new Set<string>([from])
  const queue: string[] = [from]
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]
    if (current === undefined) break
    for (const next of adjacency.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen
}
