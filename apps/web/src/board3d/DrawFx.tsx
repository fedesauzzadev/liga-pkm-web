// Robo en la escena 3D (SPEC-G/T-064): capa R3F fina sobre draw.ts (three
// puro). Aplica la cantidad real por mazo (AC-3), corre la línea de tiempo del
// robo, resalta la pila (AC-1) y proyecta su origen a pantalla para la carta
// DOM (DrawnCard, montada fuera del Canvas por Board3D).
import { useThree } from '@react-three/fiber'
import { useEffect, type ReactNode } from 'react'
import * as THREE from 'three'
import type { DrawSpec } from '../board/Board'
import type { PlaybackSpeed } from '../events/anim.config'
import {
  drawKindOf,
  drawOriginTarget,
  drawTimings,
  liftStack,
  runDrawTimeline,
  setStackCount,
  stackScreenPos,
  type DrawOrigin,
  type DrawPhase,
} from './draw'
import type { BoardScene } from './scene'

export interface DrawFxProps {
  readonly boardScene: BoardScene
  readonly draw: DrawSpec | null
  readonly deckCounts: Readonly<Record<string, number>> | undefined
  readonly speed: PlaybackSpeed
  readonly reducedMotion: boolean
  readonly onOrigin: (origin: DrawOrigin) => void
  readonly onPhase: (phase: DrawPhase) => void
  readonly onDone: () => void
}

export function DrawFx(props: DrawFxProps): ReactNode {
  const { boardScene, draw, deckCounts, speed, reducedMotion, onOrigin, onPhase, onDone } = props
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera
  const size = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)

  // AC-3: cada pila refleja la cantidad real de cartas del mazo.
  useEffect(() => {
    if (deckCounts === undefined) return
    for (const [deck, count] of Object.entries(deckCounts)) {
      const stack = boardScene.stacks.get(deck)
      if (stack !== undefined) setStackCount(stack, count)
    }
    invalidate()
  }, [boardScene, deckCounts, invalidate])

  // AC-1/AC-5: resaltar → volar (origen proyectado) → revelar (baja la pila).
  // T-090/AC-2: Ítem/Sorpresa no tienen pedestal; el origen es el nodo del robo.
  useEffect(() => {
    if (draw === null) return
    const stack = boardScene.stacks.get(draw.deck) ?? null
    const originTarget = drawOriginTarget(boardScene.stacks, boardScene.nodes, draw.deck, draw.nodeId)
    let stopped = false
    void runDrawTimeline({
      kind: drawKindOf(draw.card),
      timings: drawTimings(speed, reducedMotion),
      delay: (ms: number): Promise<void> =>
        ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms)),
      shouldStop: (): boolean => stopped,
      onHighlight: () => {
        if (stack !== null) liftStack(stack, true)
        onPhase('highlight')
        invalidate()
      },
      onFly: () => {
        if (originTarget !== null) {
          onOrigin({
            ...stackScreenPos(originTarget, camera, size.width, size.height),
            w: size.width,
            h: size.height,
          })
        }
        onPhase('fly')
        invalidate()
      },
      onReveal: () => {
        if (stack !== null) liftStack(stack, false)
        onPhase('reveal')
        invalidate()
      },
      onStow: () => onPhase('stow'),
    }).then((end) => {
      if (!stopped && end !== 'cancelled') {
        onPhase('done')
        onDone()
      }
    })
    return () => {
      stopped = true
      if (stack !== null) liftStack(stack, false)
      invalidate()
    }
  }, [draw, boardScene, camera, size.width, size.height, speed, reducedMotion, onOrigin, onPhase, onDone, invalidate])

  return null
}
