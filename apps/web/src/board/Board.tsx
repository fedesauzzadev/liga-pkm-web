import type { BoardGraph, BoardNode, DeckKey } from '@liga/content'
import type { GameEvent } from '@liga/engine'
import type { PlaybackSpeed } from '../events/anim.config'
import { useMemo } from 'react'
import boardGraph from '../../../../content/board/kanto.json'
import type { DieValue } from './Die3D'
import styles from './Board.module.css'

export type PendingDecision =
  | { readonly type: 'ChoosePath'; readonly options: readonly string[] }
  | { readonly type: 'StopOrContinue' }
  | null

/** T-063: ficha por jugador — nodo actual + sprite del PKM inicial (o null ⇒ peón).
 *  fichas-modelo-3d-hgss: modelSpecies (id dex, p. ej. "charmander") monta el
 *  modelo 3D HGSS del inicial sobre la base; la cadena es modelo → sprite → peón. */
export interface BoardTokenSpec {
  readonly id: string
  readonly nodeId: string
  readonly spriteUrl: string | null
  readonly modelSpecies: string | null
}

/** T-064: robo a animar — mazo de origen, carta robada y correlación (nonce).
 *  T-090/AC-2: `nodeId` (solo Ítem/Sorpresa, sin pedestal) = nodo donde se robó. */
export interface DrawSpec {
  readonly deck: DeckKey
  readonly card: string
  readonly nonce: number
  readonly nodeId?: string
}

/**
 * T-064/AC-1: el último `CardDrawn` de un comando dispara la animación de robo
 * (pila → carta DOM → decisión/inventario). Sin robo ⇒ null. T-090: incluye el
 * jugador (para resolver el nodo origen de Ítem/Sorpresa).
 */
export function drawFromEvents(
  events: readonly GameEvent[],
): { readonly deck: DeckKey; readonly card: string; readonly player: string } | null {
  let last: { readonly deck: DeckKey; readonly card: string; readonly player: string } | null = null
  for (const event of events) {
    if (event.type === 'CardDrawn') last = { deck: event.deck, card: event.card, player: event.player }
  }
  return last
}

/**
 * T-063/AC-2: el "PlayerMoved{path}" del spec se deriva de los `MoveStep` que
 * el motor emite paso a paso (incluidos rebotes): `[from, …to]` en orden.
 */
export function movePathFromEvents(
  events: readonly GameEvent[],
  playerId: string | null,
): readonly string[] | null {
  if (playerId === null) return null
  const steps = events.filter(
    (event): event is Extract<GameEvent, { readonly type: 'MoveStep' }> =>
      event.type === 'MoveStep' && event.player === playerId,
  )
  if (steps.length === 0 || steps[0] === undefined) return null
  return [steps[0].from, ...steps.map((step) => step.to)]
}

const board = boardGraph as unknown as BoardGraph
const fallbackNode: BoardNode = { id: 'paleta', type: 'start', shape: 'square', x: 0, y: 0, label: 'Pueblo Paleta' }

const typeColors: Record<string, string> = {
  start: '#dfe7b7',
  deck: '#b7d5a7',
  mercado: '#f2d778',
  centro: '#8bc3ff',
  oak: '#d2c7ff',
  gym: '#efb1b1',
  duelo: '#d9c2f5',
  sorpresa: '#f4c9a8',
  liga: '#b5d6d8',
  empty: '#d4e4d5',
  junction: '#f0d7bb',
}

const nodeLabel = (node: BoardNode): string => node.label ?? node.id

const toNodeMap = (graph: BoardGraph): Map<string, BoardNode> => new Map(graph.nodes.map((node) => [node.id, node]))

const buildAdjacency = (graph: BoardGraph): Map<string, readonly string[]> => {
  const adjacency = new Map<string, readonly string[]>()
  for (const [from, to] of graph.edges) {
    const nextFrom = adjacency.get(from) ?? []
    const nextTo = adjacency.get(to) ?? []
    adjacency.set(from, [...nextFrom, to])
    adjacency.set(to, [...nextTo, from])
  }
  for (const node of graph.nodes) {
    adjacency.set(node.id, adjacency.get(node.id) ?? [])
  }
  return adjacency
}

export interface BoardViewProps {
  readonly position?: string
  readonly cameFrom?: string | null
  readonly pending?: PendingDecision
  readonly onChoosePath?: (next: string) => void
  readonly onStopOrContinue?: () => void
  /** T-034: control real por comandos; el valor lo dicta el evento del motor. */
  readonly onStopHere?: () => void
  readonly onContinueMoving?: () => void
  /** T-092: el dado vive en panel-dice; esto es solo el aviso "Movés N" (3D). */
  readonly moveHintValue?: DieValue | null
  /** T-076: cambia cuando el turno termina (zoom out a overview). */
  readonly turnEndNonce?: number
  /** T-075/AC-4: hay combate (el popup abierto acerca la cámara a la ficha). */
  readonly battleActive?: boolean
  readonly onRoll?: (nextValue: number) => void
  /** Tira el dado pidiéndoselo al motor (RollMove); sin valor propio de UI. */
  readonly onRollRequest?: () => void
  /** T-063: fichas por jugador y camino del último movimiento (tablero 3D). */
  readonly tokens?: readonly BoardTokenSpec[]
  readonly activeTokenId?: string | null
  /** camara-libre-sin-ficha: ficha del jugador LOCAL ("Centrar en mí", 3D). */
  readonly myTokenId?: string | null
  readonly movePath?: readonly string[] | null
  readonly moveNonce?: number
  readonly onMoveDone?: () => void
  readonly speed?: PlaybackSpeed
  readonly reducedMotion?: boolean
  /** T-064: robo pendiente de animar, cantidad real por mazo y fin del robo. */
  readonly draw?: DrawSpec | null
  readonly deckCounts?: Readonly<Record<string, number>>
  readonly onDrawDone?: () => void
}

export function BoardView({
  position = 'paleta',
  cameFrom = null,
  pending = null,
  onChoosePath,
  onStopOrContinue,
  onStopHere,
  onContinueMoving,
}: BoardViewProps) {
  const adjacency = useMemo(() => buildAdjacency(board), [])
  const nodeMap = useMemo(() => toNodeMap(board), [])
  const current = nodeMap.get(position) ?? board.nodes[0] ?? fallbackNode
  const highlightSet = useMemo(() => {
    if (pending?.type !== 'ChoosePath') return new Set<string>()
    return new Set(pending.options)
  }, [pending])

  const routeOptions = useMemo(() => {
    if (cameFrom === null) return adjacency.get(current.id) ?? []
    return (adjacency.get(current.id) ?? []).filter((neighbor) => neighbor !== cameFrom)
  }, [adjacency, cameFrom, current.id])

  const choosePath = (nextNodeId: string): void => onChoosePath?.(nextNodeId)
  // T-082/AC-2 + T-092/AC-3: sin dado propio de UI ni en el tablero (el dado
  // de tablero es panel-dice y el de combate vive en el popup; el resultado
  // lo dicta el motor).

  return (
    <section className={styles.boardWrap} aria-label="Tablero de Kanto" data-testid="board-2d">
      <svg className={styles.boardSvg} viewBox="0 0 1176 1600" role="img" aria-label="Mapa del tablero">
        {board.edges.map(([fromId, toId]) => {
          const a = nodeMap.get(fromId)
          const b = nodeMap.get(toId)
          if (!a || !b) return null
          return <line key={`${fromId}-${toId}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={styles.edge} />
        })}

        {board.nodes.map((node) => {
          const isHighlighted = highlightSet.has(node.id)
          const isCurrent = node.id === current.id
          const shouldShow = pending?.type === 'ChoosePath' ? highlightSet.has(node.id) : routeOptions.includes(node.id) || isCurrent
          const fill = isCurrent ? '#f7d65a' : typeColors[node.type] ?? '#dfe7b7'
          const stroke = isHighlighted ? '#1c4c2a' : '#20301d'

          return (
            <g key={node.id} className={shouldShow ? styles.nodeGroup : undefined}>
              <rect
                x={node.x - 20}
                y={node.y - 20}
                width={node.shape === 'square' ? 40 : 32}
                height={node.shape === 'square' ? 40 : 32}
                rx={node.shape === 'square' ? 8 : 16}
                fill={fill}
                stroke={stroke}
                strokeWidth={isHighlighted ? 4 : isCurrent ? 5 : 2}
                opacity={pending && pending.type === 'ChoosePath' && !isHighlighted && !isCurrent ? 0.45 : 1}
              />
              {node.label ? (
                <text x={node.x} y={node.y + 52} textAnchor="middle" className={styles.nodeLabel}>
                  {node.label}
                </text>
              ) : null}
              {isHighlighted && !isCurrent ? (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={9}
                  className={styles.selectionMarker}
                  onClick={() => choosePath(node.id)}
                />
              ) : null}
            </g>
          )
        })}

        <g className={styles.tokenGroup} transform={`translate(${current.x}, ${current.y})`}>
          <circle r={18} className={styles.tokenOuter} />
          <circle r={11} className={styles.tokenInner} />
        </g>
      </svg>

      {pending?.type === 'ChoosePath' ? (
        <div className={styles.choicePanel}>
          <p className={styles.choiceTitle}>Elegí camino</p>
          <div className={styles.choiceList}>
            {pending.options.map((option) => (
              <button
                key={option}
                type="button"
                className={styles.choiceButton}
                data-decision="choose-path"
                data-node={option}
                onClick={() => choosePath(option)}
              >
                {nodeLabel(nodeMap.get(option) ?? { id: option, type: 'junction', shape: 'none', x: 0, y: 0 })}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {pending?.type === 'StopOrContinue' ? (
        <div className={styles.choicePanel}>
          <p className={styles.choiceTitle}>¿Qué querés hacer?</p>
          <div className={styles.choiceList}>
            <button
              type="button"
              className={styles.choiceButton}
              data-decision="stop-here"
              onClick={() => (onStopHere ?? onStopOrContinue)?.()}
            >
              Parar acá
            </button>
            <button
              type="button"
              className={styles.choiceButton}
              data-decision="continue"
              onClick={() => (onContinueMoving ?? onStopOrContinue)?.()}
            >
              Seguir
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default BoardView
