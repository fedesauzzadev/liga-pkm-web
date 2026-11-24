// Tablero 3D (SPEC-G/T-062): capa R3F fina sobre la escena three pura de
// scene.ts (única fuente de verdad, testeable sin WebGL). Este archivo solo
// monta Canvas/OrbitControls/etiquetas, la interacción AC-10 y el volcado de
// escena en desarrollo (AC-9). T-076: la cámara la maneja CameraRig.
// Se carga SOLO con import() desde BoardHost.
/// <reference types="vite/client" />
import { OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import {
  useCallback, useEffect, useMemo, useRef, useState,
  type ComponentRef, type ReactNode,
} from 'react'
import type { BoardNode } from '@liga/content'
import type { PlaybackSpeed } from '../events/anim.config'
import * as THREE from 'three'
import type { BoardTokenSpec, BoardViewProps, PendingDecision } from '../board/Board'
import boardStyles from '../board/Board.module.css'
import { gameContent } from '../game/content'
import { es } from '../i18n/es'
import { BOARD3D } from '../theme/board3d'
import { cameraPresets, clampTarget, planOverview } from './camera'
import { CameraRig } from './CameraRig'
import type { Board3DShared } from './Board3D.shared'
import { boardDecor } from './decor'
import { DecisionPanels } from './DecisionPanels'
import { DebugDump } from './DebugDump'
import type { DrawOrigin, DrawPhase } from './draw'
import { DrawFx } from './DrawFx'
import { DrawnCard } from './DrawnCard'
import { makeGlyphTexture } from './glyph-textures'
import { ModelDecor } from './ModelDecor'
import { MoveHint } from './MoveHint'
import { NodeLabels } from './NodeLabels'
import { PerfGovernor } from './PerfGovernor'
import { dprStep, type RigFocus } from './rig'
import {
  boardLabels,
  buildBoardScene,
  highlightFor,
  nodeWorldPos,
  setHighlights,
  type BoardScene,
} from './scene'
import { boardStyle } from './style'
import { deckStacks } from './stacks'
import { createTokensGroup } from './tokens'
import { Tokens3D } from './Tokens3D'
import { SunFollow } from './SunFollow'
import { useCameraKeys } from './useCameraKeys'
import { Wanderers3D } from './Wanderers3D'
import styles from './board3d.module.css'

const HALF = { w: BOARD3D.base.width / 2, d: BOARD3D.base.depth / 2 }
const imageSize = gameContent.board.meta.imageSize

const labelOf = (node: BoardNode): string => node.label ?? node.id
const unknownNode = (id: string): BoardNode => ({ id, type: 'junction', shape: 'none', x: 0, y: 0 })

interface SceneProps {
  readonly boardScene: BoardScene
  readonly pending: PendingDecision
  readonly position: string
  readonly hovered: string | null
  readonly shared: Board3DShared
  readonly tokensGroup: THREE.Group
  readonly tokens: readonly BoardTokenSpec[]
  readonly activeTokenId: string | null
  /** camara-libre-sin-ficha/AC-3/AC-5: ficha del jugador LOCAL (mundo). */
  readonly myTarget: { readonly x: number; readonly z: number } | null
  readonly movePath: readonly string[] | null
  readonly moveNonce: number
  readonly turnEndNonce: number
  readonly battleActive: boolean
  readonly speed: PlaybackSpeed
  readonly reducedMotion: boolean
  readonly onMoveDone: () => void
  readonly onHover: (nodeId: string | null) => void
  readonly onChoosePath: (nodeId: string) => void
}

function BoardSceneView({
  boardScene,
  pending,
  position,
  hovered,
  shared,
  tokensGroup,
  tokens,
  activeTokenId,
  myTarget,
  movePath,
  moveNonce,
  turnEndNonce,
  battleActive,
  speed,
  reducedMotion,
  onMoveDone,
  onHover,
  onChoosePath,
}: SceneProps): ReactNode {
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null)

  const plan = useMemo(
    () => planOverview(HALF.w, HALF.d, Math.max(0.2, 1024 / 600)),
    [],
  )

  const handleFocus = useCallback(
    (focus: RigFocus): void => {
      shared.focusRef.current = focus
    },
    [shared],
  )

  const highlights = useMemo(() => highlightFor(pending, position), [pending, position])
  useEffect(() => {
    setHighlights(boardScene, highlights)
    invalidate()
  }, [boardScene, highlights, invalidate])

  // T-078/AC-2: ancla de la ficha activa para la visibilidad por cercanía.
  const tokenWorld = useMemo<readonly [number, number, number] | null>(() => {
    const spec = tokens.find((token) => token.id === activeTokenId)
    if (spec === undefined) return null
    const node = gameContent.board.nodes.find((candidate) => candidate.id === spec.nodeId)
    if (node === undefined) return null
    const world = nodeWorldPos(node, imageSize)
    return [world.x, BOARD3D.token.lift, world.z]
  }, [tokens, activeTokenId])

  const handlePan = (): void => {
    const controls = controlsRef.current
    if (controls !== null) clampTarget(controls.target, plan.panBounds)
  }

  return (
    <>
      <color attach="background" args={[boardStyle.sky.horizon]} />
      <primitive object={boardScene.world.fog} attach="fog" />
      <primitive object={boardScene.root} />
      <primitive object={tokensGroup} />
      <CameraRig
        halfWidth={HALF.w}
        halfDepth={HALF.d}
        focusRef={shared.focusRef}
        centerOnMeRef={shared.centerOnMeRef}
        dispatchRef={shared.dispatchRef}
        cameraStateRef={shared.cameraStateRef}
        aimCameraRef={shared.aimCameraRef}
        choosePath={pending?.type === 'ChoosePath'}
        turnEndNonce={turnEndNonce}
        battleActive={battleActive}
        myTarget={myTarget}
        speed={speed}
        reducedMotion={reducedMotion}
      />
      <Tokens3D
        group={tokensGroup}
        tokens={tokens}
        activeTokenId={activeTokenId}
        movePath={movePath}
        moveNonce={moveNonce}
        speed={speed}
        reducedMotion={reducedMotion}
        onFocus={handleFocus}
        onDone={onMoveDone}
      />
      <Wanderers3D group={boardScene.world.wanderers} />
      <SunFollow scene={boardScene} tokensGroup={tokensGroup} activeTokenId={activeTokenId} />
      <ModelDecor
        boardScene={boardScene}
        board={gameContent.board}
        stacks={deckStacks}
        decor={boardDecor}
      />
      <NodeLabels
        nodes={boardLabels(gameContent.board)}
        imageSize={imageSize}
        hovered={hovered}
        focused={highlights.ringed}
        tokenWorld={tokenWorld}
        dumpRef={shared.labelDumpRef}
        reducedMotion={reducedMotion}
      />
      {gameContent.board.nodes.map((node) => {
        const world = nodeWorldPos(node, imageSize)
        const clickable = highlights.clickable.has(node.id)
        return (
          <mesh
            key={`hit:${node.id}`}
            position={[world.x, BOARD3D.hit.height / 2, world.z]}
            userData={{ nodeId: node.id }}
            onPointerOver={(event) => {
              event.stopPropagation()
              onHover(node.id)
              gl.domElement.style.cursor = clickable ? 'pointer' : 'default'
            }}
            onPointerOut={() => {
              onHover(null)
              gl.domElement.style.cursor = 'default'
            }}
            onClick={(event) => {
              event.stopPropagation()
              if (clickable) onChoosePath(node.id)
            }}
          >
            <cylinderGeometry args={[BOARD3D.hit.radius, BOARD3D.hit.radius, BOARD3D.hit.height, 8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )
      })}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping={false}
        enablePan
        mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }}
        minDistance={plan.controls.minDistance}
        maxDistance={plan.controls.maxDistance}
        minPolarAngle={plan.controls.minPolar}
        maxPolarAngle={plan.controls.maxPolar}
        minAzimuthAngle={plan.controls.minAzimuth}
        maxAzimuthAngle={plan.controls.maxAzimuth}
        target={[plan.target[0], plan.target[1], plan.target[2]]}
        onChange={handlePan}
      />
      <DebugDump boardScene={boardScene} tokensGroup={tokensGroup} shared={shared} />
    </>
  )
}

export function Board3D(props: BoardViewProps): ReactNode {
  const {
    position = 'paleta',
    pending = null,
    onChoosePath,
    moveHintValue = null,
    turnEndNonce = 0,
    battleActive = false,
    tokens = [],
    activeTokenId = null,
    myTokenId = null,
    movePath = null,
    moveNonce = 0,
    onMoveDone,
    speed = '1x',
    reducedMotion = false,
    draw = null,
    deckCounts,
    onDrawDone,
  } = props
  const boardScene = useMemo(
    () => buildBoardScene(gameContent.board, deckStacks, boardDecor, { glyphTextures: makeGlyphTexture }),
    [],
  )
  const tokensGroup = useMemo(() => createTokensGroup(), [])
  const [hovered, setHovered] = useState<string | null>(null)
  const [drawOrigin, setDrawOrigin] = useState<DrawOrigin | null>(null)
  const [drawPhase, setDrawPhase] = useState<DrawPhase>('idle')
  const [dpr, setDpr] = useState<number>(cameraPresets.perf.dpr[1])
  const handleDrawDone = useCallback(() => onDrawDone?.(), [onDrawDone])
  // camara-libre-sin-ficha/AC-3/AC-5: posición de mundo de MI ficha (jugador
  // LOCAL, no la activa): encuadre inicial y destino de "Centrar en mí".
  const myTarget = useMemo<{ readonly x: number; readonly z: number } | null>(() => {
    const spec = tokens.find((token) => token.id === myTokenId)
    if (spec === undefined) return null
    const node = gameContent.board.nodes.find((candidate) => candidate.id === spec.nodeId)
    if (node === undefined) return null
    const world = nodeWorldPos(node, imageSize)
    return { x: world.x, z: world.z }
  }, [tokens, myTokenId])
  const shared = useMemo<Board3DShared>(
    () => ({
      focusRef: { current: null },
      centerOnMeRef: { current: null },
      dispatchRef: { current: null },
      cameraStateRef: { current: null },
      labelDumpRef: { current: [] },
      aimCameraRef: { current: null },
    }),
    [],
  )

  // T-077/AC-2: teclas de cámara (hook useCameraKeys: Q/E giro, WASD paneo,
  // +/- zoom, V overview, C centrar en mí; se ignoran mientras se escribe).
  useCameraKeys(shared)

  // T-082/AC-2 + T-092/AC-3: el único botón de tirada es btn-roll en
  // panel-turn; los dados viven en paneles/popup (panel-dice el de tablero,
  // battle-die el de combate), nunca en el mundo; acá solo queda el aviso
  // "Movés N" con el valor que dicta el motor.
  const nodeLabel = (id: string): string =>
    labelOf(gameContent.board.nodes.find((node) => node.id === id) ?? unknownNode(id))

  return (
    <section
      className={styles.wrap}
      aria-label={es.board3dAria}
      data-testid="board-3d"
      onDoubleClick={() => shared.centerOnMeRef.current?.()}
    >
      <div className={styles.canvas}>
        <Canvas
          frameloop={BOARD3D.canvas.frameloop}
          dpr={dpr}
          camera={{
            fov: cameraPresets.overview.fov,
            near: BOARD3D.camera.near,
            far: BOARD3D.camera.far,
            position: [0, 22, 16],
          }}
        >
          <PerfGovernor
            scene={boardScene}
            world={boardScene.world}
            tokensGroup={tokensGroup}
            nodes={boardScene.nodes}
            scatter={boardScene.scatter}
            reducedMotion={reducedMotion}
            onDprStep={(direction) => setDpr((current) => dprStep(current, cameraPresets.perf.dpr, direction))}
            onLowProfile={() => setDpr(cameraPresets.perf.dpr[0])}
          />
          <BoardSceneView
            boardScene={boardScene}
            pending={pending}
            position={position}
            hovered={hovered}
            shared={shared}
            tokensGroup={tokensGroup}
            tokens={tokens}
            activeTokenId={activeTokenId}
            myTarget={myTarget}
            movePath={movePath}
            moveNonce={moveNonce}
            turnEndNonce={turnEndNonce}
            battleActive={battleActive}
            speed={speed}
            reducedMotion={reducedMotion}
            onMoveDone={() => onMoveDone?.()}
            onHover={setHovered}
            onChoosePath={(to) => onChoosePath?.(to)}
          />
          <DrawFx boardScene={boardScene} draw={draw} deckCounts={deckCounts} speed={speed}
            reducedMotion={reducedMotion} onOrigin={setDrawOrigin} onPhase={setDrawPhase}
            onDone={handleDrawDone} />
        </Canvas>
        <DrawnCard deck={draw?.deck ?? null} card={draw?.card ?? null} phase={drawPhase} origin={drawOrigin}
          speed={speed} reducedMotion={reducedMotion} />
      </div>

      <div className={boardStyles.diceTray} data-testid="camera-bar">
        <MoveHint value={moveHintValue} />
        <button
          type="button"
          className={boardStyles.rollButton}
          data-testid="btn-center-on-me"
          onClick={() => shared.centerOnMeRef.current?.()}
        >
          {es.board3dCenterOnMe}
        </button>
        <button
          type="button"
          className={boardStyles.rollButton}
          data-testid="btn-overview"
          onClick={() => shared.dispatchRef.current?.({ type: 'OVERVIEW' })}
        >
          {es.board3dOverview}
        </button>
      </div>

      <DecisionPanels
        pending={pending}
        onChoosePath={(to) => onChoosePath?.(to)}
        onStopHere={props.onStopHere}
        onContinueMoving={props.onContinueMoving}
        onStopOrContinue={props.onStopOrContinue}
        nodeLabel={nodeLabel}
      />
    </section>
  )
}

export default Board3D
