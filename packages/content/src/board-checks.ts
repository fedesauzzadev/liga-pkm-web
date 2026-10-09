// Chequeos del tablero (SPEC-A/T-003): integridad referencial + conectividad +
// conteos esperados + warning de estado sin verificar. Reemplaza la versión
// básica que vivía en validate.ts (T-002).
import { DECK_IDS, type DeckId } from './cards.ts'
import type { BoardGraph, NodeType } from './board.ts'
import { buildAdjacency, reachableFrom } from './graph.ts'

/** Conteos del tablero clásico (SPEC-A/T-003 AC-1). Se ajustan solo tras la
 *  verificación del dueño, documentando el cambio en el reporte. */
export const EXPECTED_CLASSIC_COUNTS: Readonly<Record<string, number>> = {
  gym: 8,
  centro: 4,
  oak: 2,
  mercado: 5,
  duelo: 4,
  deck: 15,
  start: 1,
  sorpresa: 1,
  liga: 1,
}

export interface BoardFacts {
  countsByType: Record<NodeType, number>
  deckCounts: Record<DeckId, number>
  connected: boolean
  /** Nodos no alcanzables desde el primero (vacío si es conexo). */
  unreachable: string[]
  /** Nodos con grado ≠ 2 (extremos y bifurcaciones), ordenados. */
  nonDegree2: string[]
}

export function boardFacts(board: BoardGraph): BoardFacts {
  const countsByType = Object.create(null) as Record<NodeType, number>
  const deckCounts = Object.create(null) as Record<DeckId, number>
  for (const n of board.nodes) {
    countsByType[n.type] = (countsByType[n.type] ?? 0) + 1
    if (n.type === 'deck' && n.deck !== undefined) {
      deckCounts[n.deck] = (deckCounts[n.deck] ?? 0) + 1
    }
  }

  const adjacency = buildAdjacency(board)
  const first = board.nodes[0]?.id
  const seen = first !== undefined ? reachableFrom(adjacency, first) : new Set<string>()
  const unreachable = board.nodes.filter((n) => !seen.has(n.id)).map((n) => n.id)

  const nonDegree2 = board.nodes
    .filter((n) => (adjacency.get(n.id)?.length ?? 0) !== 2)
    .map((n) => n.id)
    .sort()

  return {
    countsByType,
    deckCounts,
    connected: unreachable.length === 0 && board.nodes.length > 0,
    unreachable,
    nonDegree2,
  }
}

export interface BoardCheckResult {
  errors: string[]
  warnings: string[]
}

export function crossCheckBoard(board: BoardGraph, file: string): BoardCheckResult {
  const errors: string[] = []
  const warnings: string[] = []
  const ids = new Set<string>()

  // Integridad referencial (T-002).
  for (const n of board.nodes) {
    if (ids.has(n.id)) errors.push(`${file}: nodo duplicado "${n.id}"`)
    ids.add(n.id)
  }
  for (const n of board.nodes) {
    if (n.type === 'gym' && n.gym !== undefined && !(n.gym in board.gyms)) {
      errors.push(`${file}#${n.id}: gimnasio "${n.gym}" no está en gyms`)
    }
  }
  const seenEdges = new Set<string>()
  for (const [a, b] of board.edges) {
    if (!ids.has(a)) errors.push(`${file}: arista hacia nodo inexistente "${a}"`)
    if (!ids.has(b)) errors.push(`${file}: arista hacia nodo inexistente "${b}"`)
    if (a === b) errors.push(`${file}: arista con ambos extremos en "${a}"`)
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    if (seenEdges.has(key)) errors.push(`${file}: arista duplicada ${a} — ${b}`)
    seenEdges.add(key)
  }

  // Conectividad y conteos (T-003 AC-1).
  const facts = boardFacts(board)
  if (!facts.connected) {
    errors.push(`${file}: grafo NO conexo — inalcanzables: ${facts.unreachable.join(', ')}`)
  }
  for (const [type, expected] of Object.entries(EXPECTED_CLASSIC_COUNTS)) {
    const actual = facts.countsByType[type as NodeType] ?? 0
    if (actual !== expected) {
      errors.push(`${file}: nodos de tipo "${type}" = ${actual}, se esperaban ${expected}`)
    }
  }
  if (Object.keys(facts.deckCounts).length === DECK_IDS.length) {
    for (const deck of DECK_IDS) {
      const actual = facts.deckCounts[deck] ?? 0
      if (actual !== 3) {
        errors.push(`${file}: el mazo "${deck}" tiene ${actual} nodo(s), se esperaban 3`)
      }
    }
  }

  // Estado: el dueño verifica con el overlay y el worker lo marca VERIFIED (AC-4).
  if (board.meta.status !== 'VERIFIED') {
    warnings.push(`${file}: estado ${board.meta.status} — falta verificación con overlay (T-003/AC-4)`)
  }
  return { errors, warnings }
}
