// Host del tablero (SPEC-G/T-062/AC-8): decide entre el tablero 2D SVG y el
// 3D (R3F, chunk aparte cargado con import(), ADR-8). Si no hay WebGL cae
// automáticamente al 2D; el selector manual vive en Ajustes (settings.board).
// pantalla-carga-tablero: reporta onReady cuando el tablero quedó renderizado
// (2D montado / 3D con primer frame pintado) y un error del chunk 3D cae al
// 2D en vez de romper la partida (AC-4): ningún camino cuelga la carga.
import { Component, Suspense, lazy, useEffect, type ReactNode } from 'react'
import { hasWebGl } from '../board3d/webgl'
import { es } from '../i18n/es'
import gameStyles from '../game/game.module.css'
import { BoardView, type BoardViewProps } from './Board'

// ADR-8: el chunk 3D se carga con import() solo al entrar a la partida. Se
// resuelve via import.meta.glob (patrón de game/content.ts) para que la
// frontera del chunk quede explícita y fuera del bundle inicial.
const board3dModules = import.meta.glob('../board3d/Board3D.tsx') as Record<
  string,
  () => Promise<{ readonly Board3D: (props: BoardViewProps) => ReactNode }>
>
const loadBoard3D = board3dModules['../board3d/Board3D.tsx']
if (loadBoard3D === undefined) throw new Error('falta el módulo del tablero 3D')
const Board3D = lazy(async () => ({ default: (await loadBoard3D()).Board3D }))

export type BoardMode = '2d' | '3d'
export type BoardViewChoice = '2d' | '3d' | 'fallback2d'

/** '2d' manual · '3d' si hay WebGL · 'fallback2d' automático sin WebGL. */
export function decideBoard(mode: BoardMode, webgl: boolean): BoardViewChoice {
  if (mode === '2d') return '2d'
  return webgl ? '3d' : 'fallback2d'
}

export interface BoardHostProps extends BoardViewProps {
  readonly boardMode: BoardMode
  /** pantalla-carga-tablero/AC-3: señal de "tablero listo" para PlayScreen. */
  readonly onReady?: () => void
}

/** Señal de listo: useEffect post-mount (2D montado) o tras el primer frame
 * pintado del canvas (doble rAF en el 3D). Llama una sola vez por montaje. */
function BoardReadySignal({
  onReady,
  waitPaint = false,
}: {
  readonly onReady: (() => void) | undefined
  readonly waitPaint?: boolean
}): null {
  useEffect(() => {
    if (onReady === undefined) return
    if (!waitPaint || typeof requestAnimationFrame !== 'function') {
      onReady()
      return
    }
    let pending = true
    const fire = (): void => {
      if (pending) {
        pending = false
        onReady()
      }
    }
    const id = requestAnimationFrame(() => requestAnimationFrame(fire))
    return () => {
      pending = false
      cancelAnimationFrame(id)
    }
  }, [onReady, waitPaint])
  return null
}

/** Vista 2D con su aviso de fallback (sin WebGL) y la señal de montado. */
function Board2D({
  choice,
  boardProps,
  onReady,
}: {
  readonly choice: BoardViewChoice
  readonly boardProps: BoardViewProps
  readonly onReady: (() => void) | undefined
}): ReactNode {
  return (
    <>
      {choice === 'fallback2d' ? (
        <p className={gameStyles.note} data-testid="board-fallback-note">
          {es.board3dFallback}
        </p>
      ) : null}
      <BoardView {...boardProps} />
      <BoardReadySignal onReady={onReady} />
    </>
  )
}

interface BoundaryProps {
  readonly boardProps: BoardViewProps
  readonly onReady: (() => void) | undefined
  readonly children?: ReactNode
}

interface BoundaryState {
  readonly failed: boolean
}

/** AC-4: si el chunk 3D falla al cargar (red/JS), el tablero cae al 2D y la
 * partida sigue; la pantalla de carga se libera con el montado del 2D. */
export class Board3DBoundary extends Component<BoundaryProps, BoundaryState> {
  public override state: BoundaryState = { failed: false }

  public static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  public override render(): ReactNode {
    if (this.state.failed) {
      return (
        <Board2D choice="fallback2d" boardProps={this.props.boardProps} onReady={this.props.onReady} />
      )
    }
    return this.props.children
  }
}

export function BoardHost({ boardMode, onReady, ...boardProps }: BoardHostProps) {
  const choice = decideBoard(boardMode, hasWebGl())
  if (choice !== '3d') {
    return <Board2D choice={choice} boardProps={boardProps} onReady={onReady} />
  }
  // AC-5: sin <p> de carga como feedback — mientras el chunk baja, la pantalla
  // de carga de PlayScreen tapa todo; el fallback del Suspense queda vacío.
  return (
    <Board3DBoundary boardProps={boardProps} onReady={onReady}>
      <Suspense fallback={null}>
        <Board3D {...boardProps} />
        <BoardReadySignal onReady={onReady} waitPaint />
      </Suspense>
    </Board3DBoundary>
  )
}
